/**
 * Reads the sections (marker segments) of a JPEG image.
 *
 * @module
 */

import type { ByteStream } from './byte-stream.ts';
import type { ImageSize } from './exif-data.ts';

/**
 * A function called for each section of a JPEG image.
 *
 * @param sectionType - The section's marker type (the byte after `0xFF`).
 * @param sectionStream - A stream on the section's data, after its length.
 */
type SectionIterator = (sectionType: number, sectionStream: ByteStream) => void;

/**
 * The name of a JPEG section type, with its index for the types that are numbered (e.g., `APP1`).
 */
type SectionName = {
	/**
	 * The number within the type's range, for the types that are numbered.
	 */
	readonly index?: number,

	/**
	 * The name (e.g., `SOF`), or `null` for types that aren't recognised.
	 */
	readonly name: string | null,
};

/**
 * A range of section types that share a name and are numbered from its start.
 */
type SectionRange = {
	/**
	 * The types in the range that have other meanings.
	 */
	readonly excluded?: readonly number[],

	/**
	 * The last type in the range.
	 */
	readonly last: number,

	/**
	 * The name of the types in the range.
	 */
	readonly name: string,
};

/**
 * The byte that starts each section marker.
 */
const MARKER_PREFIX = 0xFF;

/**
 * The marker type of the section that starts the scan (the compressed image data).
 */
const START_OF_SCAN = 0xDA;

/**
 * The first marker type of the restart markers, which have no data.
 */
const FIRST_RESTART = 0xD0;

/**
 * The marker type of the end of the image, which is the last marker without data that follows the restart
 * markers and the start of the image.
 */
const END_OF_IMAGE = 0xD9;

/*
 * The keys and ranges are the marker types in the JPEG standard, which these tables name.
 */
/* eslint-disable typescript/no-magic-numbers -- See above. */

/**
 * The section types that have their own names, keyed by marker type.
 */
const SECTION_NAMES: ReadonlyMap<number, string> = /* @__PURE__ */ new Map([
	[0xC4, 'DHT'],
	[0xD8, 'SOI'],
	[0xDB, 'DQT'],
	[0xDD, 'DRI'],
	[0xFE, 'COM'],
	[END_OF_IMAGE, 'EOI'],
	[START_OF_SCAN, 'SOS'],
]);

/**
 * The ranges of section types that share a name, keyed by the first marker type in each.
 */
const SECTION_RANGES: ReadonlyMap<number, SectionRange> = /* @__PURE__ */ new Map([
	// The start of frame range includes types with other meanings: DHT (0xC4), JPG (0xC8) and DAC (0xCC).
	[0xC0, { excluded: [0xC8, 0xCC], last: 0xCF, name: 'SOF' }],
	[0xE0, { last: 0xEF, name: 'APP' }],
	[FIRST_RESTART, { last: 0xD7, name: 'RST' }],
]);
/* eslint-enable typescript/no-magic-numbers -- See above. */

/**
 * Gets the name of a JPEG section type.
 *
 * @param markerType - The section's marker type (the byte after `0xFF`).
 * @returns The type's name, with its index for the types that are numbered.
 * @example
 * const isStartOfFrame = getSectionName(markerType).name === 'SOF';
 */
const getSectionName = (markerType: number): SectionName => {
	const name = SECTION_NAMES.get(markerType) ?? null;
	if (name !== null) {
		return { name };
	}
	for (const [first, range] of SECTION_RANGES) {
		if (markerType >= first && markerType <= range.last && !(range.excluded ?? []).includes(markerType)) {
			return { index: markerType - first, name: range.name };
		}
	}
	return { name: null };
};

/**
 * Reads the image size from a start of frame (SOF) section.
 *
 * @param stream - A big-endian stream on the section's data, as passed to a {@link SectionIterator}.
 * @returns The image's width and height, in pixels.
 * @example
 * const imageSize = getSizeFromSOFSection(sectionStream);
 */
const getSizeFromSOFSection = (stream: ByteStream): ImageSize => {
	// Skip the sample precision.
	stream.skip(1);
	const height = stream.nextUInt16();
	const width = stream.nextUInt16();
	return { height, width };
};

/**
 * Checks whether a section has a length and data.
 *
 * @param markerType - The section's marker type (the byte after `0xFF`).
 * @returns Whether it has. The restart markers, start of image, end of image and start of scan don't.
 * @example
 * const length = hasLength(markerType) ? stream.nextUInt16() - 2 : 0;
 */
const hasLength = (markerType: number): boolean =>
	markerType !== START_OF_SCAN && (markerType < FIRST_RESTART || markerType > END_OF_IMAGE);

/**
 * Calls a function for each section of a JPEG image, up to and including the start of the scan.
 *
 * @param stream - A stream at the start of the image, which is changed to be big-endian.
 * @param iterator - The function to call.
 * @remarks
 * This stops at the start of the scan, as the scan's length isn't stored, and only the end of the image follows
 * it. It also stops at anything that isn't a section marker.
 * @example
 * parseSections(stream, iterator);
 */
const parseSections = (stream: ByteStream, iterator: SectionIterator): void => {
	stream.setBigEndian(true);
	let markerType = 0;
	while (markerType !== START_OF_SCAN && stream.remainingLength() > 0) {
		if (stream.nextUInt8() !== MARKER_PREFIX) {
			return;
		}
		markerType = stream.nextUInt8();
		// The length includes its own two bytes.
		const length = hasLength(markerType) ? stream.nextUInt16() - 2 : 0;
		iterator(markerType, stream.branch(0, length));
		stream.skip(length);
	}
};

export { getSectionName, getSizeFromSOFSection, parseSections };
export type { SectionIterator, SectionName };
