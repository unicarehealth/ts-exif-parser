/**
 * Builds small JPEG images with Exif data, for testing cases that the sample images don't cover.
 *
 * @module
 */

/**
 * A function that lists the tags in an image file directory, given the offsets of all the directories, so that
 * the tags can point to the other directories.
 *
 * @param offsets - The offsets of the directories from the TIFF header, in the order in which they're given.
 * @returns The tags in the directory.
 */
type DirectorySpecification = (offsets: readonly number[]) => TagSpecification[];

/**
 * A tag to write in an image file directory.
 */
type TagSpecification = {
	/**
	 * The number of components in the value.
	 */
	readonly count: number,

	/**
	 * The value's bytes, in little-endian order. Values longer than four bytes are written after the directory.
	 */
	readonly data: readonly number[],

	/**
	 * The Exif format (data type) of the value.
	 */
	readonly format: number,

	/**
	 * The number that identifies the tag within its directory.
	 */
	readonly tag: number,
};

/**
 * The length of the TIFF header.
 */
const TIFF_HEADER_LENGTH = 8;

// These are the bytes of the TIFF and JPEG markers.
/* eslint-disable typescript/no-magic-numbers -- See above. */

/**
 * The little-endian TIFF byte order mark (`II`) and the number that follows it.
 */
const TIFF_HEADER_START = [0x49, 0x49, 42, 0] as const;

/**
 * The length of a tag in an image file directory.
 */
const TAG_LENGTH = 12;

/**
 * The length of the value field of a tag.
 */
const VALUE_FIELD_LENGTH = 4;

/**
 * The start of a JPEG image (the start of image marker), and the marker of an APP1 section.
 */
const JPEG_START = [0xFF, 0xD8, 0xFF, 0xE1] as const;

/**
 * The marker of the start of the scan, at which the parser stops.
 */
const START_OF_SCAN = [0xFF, 0xDA] as const;
/* eslint-enable typescript/no-magic-numbers -- See above. */

/**
 * Converts a number to its little-endian bytes.
 *
 * @param length - The number of bytes.
 * @param value - The number to convert.
 * @returns Its bytes.
 * @example
 * const bytes = toBytes(2, tag);
 */
const toBytes = (length: 2 | 4, value: number): number[] => {
	const view = new DataView(new ArrayBuffer(length));
	if (length === 2) {
		view.setUint16(0, value, true);
	}
	else {
		view.setUint32(0, value, true);
	}
	return [...new Uint8Array(view.buffer, view.byteOffset, view.byteLength)];
};

/**
 * Converts an unsigned 16-bit integer to its little-endian bytes.
 *
 * @param value - The integer to convert.
 * @returns Its two bytes.
 * @example
 * const bytes = uint16(tag);
 */
const uint16 = (value: number): number[] => toBytes(2, value);

/**
 * Converts an unsigned 32-bit integer to its little-endian bytes.
 *
 * @param value - The integer to convert.
 * @returns Its four bytes.
 * @example
 * const bytes = uint32(offset);
 */
const uint32 = (value: number): number[] => toBytes(VALUE_FIELD_LENGTH, value);

/**
 * Converts a string to its bytes, with a terminating null character.
 *
 * @param value - The string to convert, which must only contain ASCII characters.
 * @returns Its bytes.
 * @example
 * const bytes = ascii('R98');
 */
const ascii = (value: string): number[] => [
	...Array.from({ length: value.length }, (_, index) => value.codePointAt(index) ?? 0),
	0,
];

/**
 * Writes an image file directory.
 *
 * @param tags - The tags to write, in order.
 * @param start - The directory's offset from the TIFF header.
 * @returns The directory's bytes, followed by any values that don't fit in their tags.
 * @example
 * const bytes = writeDirectory(tags, offset);
 */
const writeDirectory = (tags: readonly TagSpecification[], start: number): number[] => {
	const entries: number[] = [];
	const values: number[] = [];
	const valuesStart = start + 2 + (tags.length * TAG_LENGTH) + VALUE_FIELD_LENGTH;
	for (const { count, data, format, tag } of tags) {
		entries.push(...uint16(tag), ...uint16(format), ...uint32(count));
		if (data.length > VALUE_FIELD_LENGTH) {
			entries.push(...uint32(valuesStart + values.length));
			values.push(...data);
		}
		else {
			entries.push(...data, ...Array.from({ length: VALUE_FIELD_LENGTH - data.length }, () => 0));
		}
	}
	return [...uint16(tags.length), ...entries, ...uint32(0), ...values];
};

/**
 * Builds a little-endian TIFF structure from image file directories.
 *
 * @param directories - The directories, of which the first is IFD0.
 * @returns The TIFF structure's bytes.
 * @example
 * const tiff = buildTiff(directories);
 */
const buildTiff = (directories: readonly DirectorySpecification[]): number[] => {
	// The directories' lengths don't depend on the offsets, so a first pass with dummy offsets finds them.
	const dummyOffsets = directories.map(() => 0);
	const offsets: number[] = [];
	let offset = TIFF_HEADER_LENGTH;
	for (const directory of directories) {
		offsets.push(offset);
		offset += writeDirectory(directory(dummyOffsets), 0).length;
	}
	const bytes = [...TIFF_HEADER_START, ...uint32(TIFF_HEADER_LENGTH)];
	for (const [index, directory] of directories.entries()) {
		bytes.push(...writeDirectory(directory(offsets), offsets.at(index) ?? 0));
	}
	return bytes;
};

/**
 * Builds a JPEG image with an APP1 section and no image data.
 *
 * @param app1 - The APP1 section's data.
 * @returns The image's bytes.
 * @example
 * const image = buildJpeg(app1);
 */
const buildJpeg = (app1: readonly number[]): Uint8Array => {
	// The length is big-endian, and includes its own two bytes.
	const length = uint16(app1.length + 2).toReversed();
	return Uint8Array.from([JPEG_START, length, app1, START_OF_SCAN].flat());
};

/**
 * Builds a JPEG image with Exif data.
 *
 * @param tiff - The TIFF structure.
 * @returns The image's bytes.
 * @example
 * const image = buildExifJpeg(buildTiff(directories));
 */
const buildExifJpeg = (tiff: readonly number[]): Uint8Array => buildJpeg([...ascii('Exif'), 0, ...tiff]);

export { ascii, buildExifJpeg, buildJpeg, buildTiff, uint16, uint32 };
export type { DirectorySpecification, TagSpecification };
