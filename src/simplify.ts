/**
 * Simplifies tag values: rationals to numbers, GPS coordinates to signed degrees and dates to timestamps.
 *
 * @module
 */

import { parseExifDate } from './exif-date.ts';
import { type ExifComponent, ExifSections, type RawTagValue } from './exif-section-parser.ts';

/**
 * A GPS coordinate tag, and the tag that gives its direction.
 */
type DegreeTag = TagReference & {
	/**
	 * The direction that makes the coordinate positive.
	 */
	readonly positiveDirection: string,

	/**
	 * The tag that gives the coordinate's direction.
	 */
	readonly reference: TagReference,
};

/**
 * Gets the value of a tag.
 *
 * @param tag - The tag whose value to get.
 * @returns Its value (or `null` if the parser didn't find the tag).
 */
type GetTagValue = (tag: TagReference) => TagValue | null;

/**
 * Sets the value of a tag that the parser found.
 *
 * @param tag - The tag whose value to set.
 * @param value - Its new value.
 */
type SetTagValue = (tag: TagReference, value: TagValue) => void;

/**
 * Identifies a tag, by name or by section and number.
 */
type TagReference = {
	/**
	 * The name that the tag has when tag names are enabled.
	 */
	readonly name: string,

	/**
	 * The image file directory in which the tag is found.
	 */
	readonly section: ExifSections,

	/**
	 * The number that identifies the tag within its directory.
	 */
	readonly type: number,
};

/**
 * A tag value, after any simplification.
 */
type TagValue = ExifComponent | RawTagValue;

/**
 * The number of minutes in a degree.
 */
const MINUTES_PER_DEGREE = 60;

/**
 * The number of seconds in a degree.
 */
const SECONDS_PER_DEGREE = 3_600;

/**
 * The GPS coordinate tags.
 */
const DEGREE_TAGS: readonly DegreeTag[] = [
	{
		name: 'GPSLatitude',
		positiveDirection: 'N',
		reference: { name: 'GPSLatitudeRef', section: ExifSections.GPSIFD, type: 0x00_01 },
		section: ExifSections.GPSIFD,
		type: 0x00_02,
	},
	{
		name: 'GPSLongitude',
		positiveDirection: 'E',
		reference: { name: 'GPSLongitudeRef', section: ExifSections.GPSIFD, type: 0x00_03 },
		section: ExifSections.GPSIFD,
		type: 0x00_04,
	},
];

/**
 * The date and time tags.
 */
const DATE_TAGS: readonly TagReference[] = [
	// These are the tag numbers in the Exif standard.
	/* eslint-disable typescript/no-magic-numbers -- See above. */
	{ name: 'ModifyDate', section: ExifSections.IFD0, type: 0x01_32 },
	{ name: 'DateTimeOriginal', section: ExifSections.SubIFD, type: 0x90_03 },
	{ name: 'CreateDate', section: ExifSections.SubIFD, type: 0x90_04 },
	/* eslint-enable typescript/no-magic-numbers -- See above. */
];

/**
 * Converts GPS coordinates from degrees, minutes and seconds (with a direction) to signed degrees.
 *
 * @param getTagValue - A function that gets a tag's value.
 * @param setTagValue - A function that sets a tag's value.
 * @example
 * castDegreeValues(getTagValue, setTagValue);
 */
const castDegreeValues = (getTagValue: GetTagValue, setTagValue: SetTagValue): void => {
	for (const tag of DEGREE_TAGS) {
		const value = getTagValue(tag);
		const components: readonly unknown[] = Array.isArray(value) ? value : [];
		const [degrees, minutes, seconds] = components;
		if (typeof degrees !== 'number' || typeof minutes !== 'number' || typeof seconds !== 'number') {
			continue;
		}
		const sign = getTagValue(tag.reference) === tag.positiveDirection ? 1 : -1;
		setTagValue(tag, (degrees + (minutes / MINUTES_PER_DEGREE) + (seconds / SECONDS_PER_DEGREE)) * sign);
	}
};

/**
 * Converts dates and times to timestamps (in seconds since the Unix epoch), leaving any in an unknown format as
 * they are.
 *
 * @param getTagValue - A function that gets a tag's value.
 * @param setTagValue - A function that sets a tag's value.
 * @example
 * castDateValues(getTagValue, setTagValue);
 */
const castDateValues = (getTagValue: GetTagValue, setTagValue: SetTagValue): void => {
	for (const tag of DATE_TAGS) {
		const value = getTagValue(tag);
		const timestamp = typeof value === 'string' ? parseExifDate(value) : null;
		if (timestamp !== null) {
			setTagValue(tag, timestamp);
		}
	}
};

/**
 * Simplifies a value, converting rationals to numbers and lists of one component to that component.
 *
 * @param value - The value as it's stored.
 * @returns The simplified value.
 * @example
 * const value = simplifyValue(tag.value);
 */
const simplifyValue = (value: RawTagValue): TagValue => {
	if (!Array.isArray(value)) {
		return value;
	}
	const components = value.map((component: ExifComponent) =>
		(Array.isArray(component) ? component[0] / component[1] : component));
	const [first] = components;
	return typeof first === 'number' && components.length === 1 ? first : components;
};

export { castDateValues, castDegreeValues, simplifyValue };
export type { GetTagValue, SetTagValue, TagReference, TagValue };
