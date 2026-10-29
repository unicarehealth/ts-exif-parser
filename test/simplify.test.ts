/**
 * Tests for simplifying tag values.
 *
 * @module
 */

/* eslint-disable typescript/naming-convention -- The tests use tag names from the Exif standard. */

import { describe, expect, it } from 'bun:test';

import {
	castDateValues,
	castDegreeValues,
	type GetTagValue,
	type SetTagValue,
	simplifyValue,
	type TagValue,
// eslint-disable-next-line import/no-internal-modules, import/no-relative-parent-imports -- These are internal.
} from '../src/simplify.ts';

/**
 * Functions that get and set tag values by name, and the values that were set.
 */
type Accessors = {
	/**
	 * Gets a tag's value from the initial values.
	 */
	readonly getTagValue: GetTagValue,

	/**
	 * Records a tag's new value.
	 */
	readonly setTagValue: SetTagValue,

	/**
	 * The new values, by tag name.
	 */
	readonly updatedValues: ReadonlyMap<string, TagValue>,
};

/**
 * Creates functions that get and set tag values by name.
 *
 * @param values - The initial values, by tag name.
 * @returns The functions, and the values that they set.
 * @example
 * const accessors = createAccessors(values);
 */
const createAccessors = (values: Readonly<Record<string, TagValue>>): Accessors => {
	const initialValues = new Map(Object.entries(values));
	const updatedValues = new Map<string, TagValue>();
	return {
		getTagValue: (tag): TagValue | null => initialValues.get(tag.name) ?? null,
		setTagValue: (tag, value): void => {
			updatedValues.set(tag.name, value);
		},
		updatedValues,
	};
};

describe('castDateValues', () => {
	it('converts dates in either format', () => {
		expect.assertions(1);

		const { getTagValue, setTagValue, updatedValues } = createAccessors({
			CreateDate: '1970-01-01T00:00:00-05:00',
			DateTimeOriginal: '1970:01:01 00:00:00',
			ModifyDate: '1970-01-01T00:00:00-05:00',
		});
		castDateValues(getTagValue, setTagValue);

		expect(Object.fromEntries(updatedValues)).toStrictEqual({
			CreateDate: 18_000,
			DateTimeOriginal: 0,
			ModifyDate: 18_000,
		});
	});

	it('leaves dates in other formats as they are', () => {
		expect.assertions(1);

		const { getTagValue, setTagValue, updatedValues } = createAccessors({
			CreateDate: 'yesterday',
			ModifyDate: 0,
		});
		castDateValues(getTagValue, setTagValue);

		expect(updatedValues.size).toBe(0);
	});
});

describe('castDegreeValues', () => {
	it('converts coordinates to signed degrees', () => {
		expect.assertions(2);

		const { getTagValue, setTagValue, updatedValues } = createAccessors({
			GPSLatitude: [33, 52, 4.8],
			GPSLatitudeRef: 'S',
			GPSLongitude: [151, 12, 36],
			GPSLongitudeRef: 'E',
		});
		castDegreeValues(getTagValue, setTagValue);

		expect(updatedValues.get('GPSLatitude')).toBeCloseTo(-33.868);
		expect(updatedValues.get('GPSLongitude')).toBeCloseTo(151.21);
	});

	it('leaves coordinates that are not three numbers as they are', () => {
		expect.assertions(1);

		const { getTagValue, setTagValue, updatedValues } = createAccessors({
			GPSLatitude: [33, 52],
			GPSLongitude: 151,
		});
		castDegreeValues(getTagValue, setTagValue);

		expect(updatedValues.size).toBe(0);
	});
});

describe('simplifyValue', () => {
	it('converts rationals to numbers', () => {
		expect.assertions(2);

		expect(simplifyValue([[1, 4], [3, 2]])).toStrictEqual([0.25, 1.5]);
		expect(simplifyValue([[-1, 4]])).toBe(-0.25);
	});

	it('converts a list of one component to that component', () => {
		expect.assertions(1);

		expect(simplifyValue([7])).toBe(7);
	});

	it('leaves other values as they are', () => {
		expect.assertions(2);

		expect(simplifyValue('text')).toBe('text');
		expect(simplifyValue([])).toStrictEqual([]);
	});
});
