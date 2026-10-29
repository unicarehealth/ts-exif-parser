/**
 * Reads the tags in a JPEG image's APP1 (Exif) section.
 *
 * @module
 */

import type { ByteStream, StreamMarker } from './byte-stream.ts';

/**
 * The image file directories (IFDs) in which Exif tags are found.
 */
enum ExifSections {
	IFD0 = 1,
	IFD1 = 2,
	// Cspell:ignore GPSIFD
	GPSIFD = 3,
	SubIFD = 4,
	InteropIFD = 5,
}

/**
 * A component format, and how to read a component in it.
 */
type ComponentFormat = {
	/**
	 * The number of bytes in each component.
	 */
	readonly length: number,

	/**
	 * Reads one component.
	 *
	 * @param stream - The stream from which to read it, which is left after it.
	 * @returns The component that was read.
	 */
	readonly read: (stream: ByteStream) => ExifComponent,
};

/**
 * A component of a tag value: a number, or a rational number.
 */
type ExifComponent = ExifRational | number;

/**
 * A rational number, as its numerator and denominator.
 */
type ExifRational = readonly [numerator: number, denominator: number];

/**
 * A tag that has been read from an Exif section.
 */
type ExifTag = RawTag & {
	/**
	 * The image file directory in which the tag was found.
	 */
	readonly section: ExifSections,
};

/**
 * A tag that has been read from an image file directory.
 */
type RawTag = {
	/**
	 * The Exif format (data type) of the value.
	 */
	readonly format: number,

	/**
	 * The tag's number, which identifies it within its directory.
	 */
	readonly type: number,

	/**
	 * The tag's value, as it's stored.
	 */
	readonly value: RawTagValue,
};

/**
 * A tag value as it's stored: a string, the bytes of a value in the undefined format, or a list of components.
 */
type RawTagValue = readonly ExifComponent[] | ArrayBuffer | string;

/**
 * A function called for each tag in an Exif section.
 *
 * @param tag - The tag that was read.
 */
type TagIterator = (tag: ExifTag) => void;

/**
 * The format of values that are strings.
 */
const ASCII_FORMAT = 2;

/**
 * The format of values whose type isn't defined, which are read as bytes.
 */
const UNDEFINED_FORMAT = 7;

/*
 * The keys are the format numbers in the Exif standard, and each reader is a single call to the stream.
 */
/* eslint-disable jsdoc/require-jsdoc, typescript/no-magic-numbers -- See above. */

/**
 * The formats whose values are read as components, keyed by format number.
 */
const COMPONENT_FORMATS: ReadonlyMap<number, ComponentFormat> = /* @__PURE__ */ new Map<number, ComponentFormat>([
	[1, { length: 1, read: stream => stream.nextUInt8() }],
	[3, { length: 2, read: stream => stream.nextUInt16() }],
	[4, { length: 4, read: stream => stream.nextUInt32() }],
	[5, { length: 8, read: stream => [stream.nextUInt32(), stream.nextUInt32()] }],
	[6, { length: 1, read: stream => stream.nextInt8() }],
	[8, { length: 2, read: stream => stream.nextInt16() }],
	[9, { length: 4, read: stream => stream.nextInt32() }],
	[10, { length: 8, read: stream => [stream.nextInt32(), stream.nextInt32()] }],
	[11, { length: 4, read: stream => stream.nextFloat() }],
	[12, { length: 8, read: stream => stream.nextDouble() }],
]);
/* eslint-enable jsdoc/require-jsdoc, typescript/no-magic-numbers -- See above. */

/**
 * The tag in IFD0 that holds the offset of the Exif sub-IFD.
 */
const SUB_IFD_POINTER = 0x87_69;

/**
 * The tag in IFD0 that holds the offset of the GPS IFD.
 */
const GPS_IFD_POINTER = 0x88_25;

/**
 * The tag in the Exif sub-IFD that holds the offset of the interoperability IFD.
 */
const INTEROP_IFD_POINTER = 0xA0_05;

/**
 * The tags that point to other image file directories, keyed by the directory that they're in, and then by
 * tag number.
 */
const POINTER_TAGS: ReadonlyMap<ExifSections, ReadonlyMap<number, ExifSections>> = /* @__PURE__ */ new Map([
	[
		ExifSections.IFD0,
		/* @__PURE__ */ new Map<number, ExifSections>([
			[GPS_IFD_POINTER, ExifSections.GPSIFD],
			[SUB_IFD_POINTER, ExifSections.SubIFD],
		]),
	],
	[
		ExifSections.SubIFD,
		/* @__PURE__ */ new Map<number, ExifSections>([[INTEROP_IFD_POINTER, ExifSections.InteropIFD]]),
	],
]);

/**
 * The image file directories after IFD0, in the order in which they're read.
 *
 * @remarks
 * The interoperability IFD is last, as the Exif sub-IFD points to it.
 */
const LATER_SECTIONS = [ExifSections.IFD1, ExifSections.GPSIFD, ExifSections.SubIFD, ExifSections.InteropIFD] as const;

/**
 * The size of a tag's value field, which holds values that fit, and otherwise the offset of the value.
 */
const VALUE_FIELD_LENGTH = 4;

/**
 * The Exif header, which starts the APP1 section's data.
 */
const EXIF_HEADER = 'Exif\0\0';

/**
 * The length of the Exif header and the TIFF header up to the offset of IFD0.
 */
const HEADERS_LENGTH = 10;

/**
 * The TIFF byte order mark of little-endian data (`II`).
 */
const LITTLE_ENDIAN_MARK = 0x49_49;

/**
 * The TIFF byte order mark of big-endian data (`MM`).
 */
const BIG_ENDIAN_MARK = 0x4D_4D;

/**
 * The number that follows the byte order mark in a TIFF header.
 */
const TIFF_MAGIC_NUMBER = 42;

/**
 * Gets the number of bytes in each component of a value of a format.
 *
 * @param format - The Exif format (data type) of the value.
 * @returns The number of bytes, which is 0 for an unknown format.
 * @example
 * const valueLength = getBytesPerComponent(format) * components;
 */
const getBytesPerComponent = (format: number): number =>
	(format === ASCII_FORMAT || format === UNDEFINED_FORMAT ? 1 : COMPONENT_FORMATS.get(format)?.length ?? 0);

/**
 * Reads one component of a value.
 *
 * @param format - The Exif format (data type) of the value.
 * @param stream - The stream from which to read the component, which is left after it.
 * @returns The component that was read.
 * @throws Error
 * Thrown if the format isn't read as components.
 * @example
 * const component = readComponent(format, stream);
 */
const readComponent = (format: number, stream: ByteStream): ExifComponent => {
	const componentFormat = COMPONENT_FORMATS.get(format) ?? null;
	if (componentFormat === null) {
		throw new Error(`Exif format ${format.toString()} is not supported.`);
	}
	return componentFormat.read(stream);
};

/**
 * Reads a tag's value.
 *
 * @param format - The Exif format (data type) of the value.
 * @param components - The number of components (or bytes, for strings and values in the undefined format).
 * @param stream - The stream from which to read the value, which is left after it.
 * @returns The value that was read.
 * @example
 * const value = readTagValue(format, components, stream);
 */
const readTagValue = (format: number, components: number, stream: ByteStream): RawTagValue => {
	if (format === ASCII_FORMAT) {
		const value = stream.nextString(components);
		const nullIndex = value.indexOf('\0');
		return nullIndex === -1 ? value : value.slice(0, nullIndex);
	}
	if (format === UNDEFINED_FORMAT) {
		return stream.nextBuffer(components);
	}
	// Format 0 isn't valid, and has no components to read.
	if (format === 0) {
		return [];
	}
	return Array.from({ length: components }, () => readComponent(format, stream));
};

/**
 * Reads a tag.
 *
 * @param tiffMarker - A marker at the start of the TIFF header, from which offsets are measured.
 * @param stream - The stream from which to read the tag, which is left at the next tag.
 * @returns The tag that was read.
 * @example
 * const tag = readExifTag(tiffMarker, stream);
 */
const readExifTag = (tiffMarker: StreamMarker, stream: ByteStream): RawTag => {
	const type = stream.nextUInt16();
	const format = stream.nextUInt16();
	const components = stream.nextUInt32();
	const valueLength = getBytesPerComponent(format) * components;

	// A value that doesn't fit in the value field is elsewhere, and the field holds its offset.
	if (valueLength > VALUE_FIELD_LENGTH) {
		const valueStream = tiffMarker.openWithOffset(stream.nextUInt32());
		return { format, type, value: readTagValue(format, components, valueStream) };
	}
	const value = readTagValue(format, components, stream);
	stream.skip(Math.max(VALUE_FIELD_LENGTH - valueLength, 0));
	return { format, type, value };
};

/**
 * Reads the tags in an image file directory.
 *
 * @param tiffMarker - A marker at the start of the TIFF header, from which offsets are measured.
 * @param stream - A stream at the start of the directory, which is left after its last tag.
 * @param iterator - A function to call for each tag.
 * @example
 * readIFDSection(tiffMarker, directoryStream, iterator);
 */
const readIFDSection = (tiffMarker: StreamMarker, stream: ByteStream, iterator: (tag: RawTag) => void): void => {
	// Make sure that we can read the number of tags.
	if (stream.remainingLength() < 2) {
		return;
	}
	const numberOfEntries = stream.nextUInt16();
	for (let index = 0; index < numberOfEntries; index++) {
		iterator(readExifTag(tiffMarker, stream));
	}
};

/**
 * Reads the Exif and TIFF headers, and sets the stream's byte order to the TIFF header's.
 *
 * @param stream - A stream at the start of the Exif header, which is left at the offset of IFD0.
 * @returns A marker at the start of the TIFF header (or `null` if either header isn't valid).
 * @example
 * const tiffMarker = readHeader(stream);
 */
const readHeader = (stream: ByteStream): StreamMarker | null => {
	if (stream.remainingLength() < HEADERS_LENGTH || stream.nextString(EXIF_HEADER.length) !== EXIF_HEADER) {
		return null;
	}
	const tiffMarker = stream.mark();
	const byteOrder = stream.nextUInt16();
	if (byteOrder !== LITTLE_ENDIAN_MARK && byteOrder !== BIG_ENDIAN_MARK) {
		return null;
	}
	stream.setBigEndian(byteOrder === BIG_ENDIAN_MARK);
	return stream.nextUInt16() === TIFF_MAGIC_NUMBER ? tiffMarker : null;
};

/**
 * Gets the offset that a pointer tag's value holds.
 *
 * @param value - The pointer tag's value.
 * @returns The offset (or `null` if the value isn't a number).
 * @example
 * const offset = getPointer(tag.value);
 */
const getPointer = (value: RawTagValue): number | null => {
	const pointer: unknown = Array.isArray(value) ? value.at(0) : null;
	return typeof pointer === 'number' ? pointer : null;
};

/**
 * What {@link readDirectory} needs to read an image file directory.
 */
type DirectoryContext = {
	/**
	 * The function to call for each tag that doesn't point to another directory.
	 */
	readonly iterator: TagIterator,

	/**
	 * The offsets of the directories that have been found, keyed by directory, to which this adds the ones that
	 * the directory points to.
	 */
	readonly offsets: Map<ExifSections, number>,

	/**
	 * A marker at the start of the TIFF header, from which offsets are measured.
	 */
	readonly tiffMarker: StreamMarker,
};

/**
 * Reads the tags in an image file directory, noting the offsets of the directories that it points to.
 *
 * @param context - The function to call for each tag, the offsets of the directories and the TIFF header.
 * @param section - The directory to read.
 * @param stream - A stream at the start of the directory, which is left after its last tag.
 * @example
 * readDirectory(context, ExifSections.IFD0, ifd0Stream);
 */
const readDirectory = (context: DirectoryContext, section: ExifSections, stream: ByteStream): void => {
	const pointerTags = POINTER_TAGS.get(section);
	readIFDSection(context.tiffMarker, stream, tag => {
		const target = pointerTags?.get(tag.type) ?? null;
		if (target === null) {
			context.iterator({ ...tag, section });
			return;
		}
		context.offsets.set(target, getPointer(tag.value) ?? 0);
	});
};

/**
 * Reads the image file directories after IFD0, whose offsets IFD0 and the directories after it give.
 *
 * @param context - The function to call for each tag, the offsets of the directories and the TIFF header.
 * @example
 * readLaterDirectories(context);
 */
const readLaterDirectories = (context: DirectoryContext): void => {
	for (const section of LATER_SECTIONS) {
		const offset = context.offsets.get(section) ?? 0;
		if (offset !== 0) {
			readDirectory(context, section, context.tiffMarker.openWithOffset(offset));
		}
	}
};

/**
 * Calls a function for each tag in an APP1 (Exif) section.
 *
 * @param stream - A stream on the section's data.
 * @param iterator - The function to call.
 * @returns Whether the section has valid Exif and TIFF headers. Sections that don't are ignored.
 * @remarks
 * The tags that point to other image file directories aren't passed to the function.
 * @example
 * const isExif = parseTags(sectionStream, iterator);
 */
const parseTags = (stream: ByteStream, iterator: TagIterator): boolean => {
	const tiffMarker = readHeader(stream);
	if (tiffMarker === null) {
		return false;
	}
	const offsets = new Map<ExifSections, number>();
	const context: DirectoryContext = { iterator, offsets, tiffMarker };
	const ifd0Stream = tiffMarker.openWithOffset(stream.nextUInt32());
	readDirectory(context, ExifSections.IFD0, ifd0Stream);
	offsets.set(ExifSections.IFD1, ifd0Stream.nextUInt32());
	readLaterDirectories(context);
	return true;
};

export { ExifSections, parseTags, UNDEFINED_FORMAT };
export type { ExifComponent, ExifRational, ExifTag, RawTagValue, TagIterator };
