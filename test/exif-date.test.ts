/**
 * Tests for parsing dates and times.
 *
 * @module
 */

import { describe, expect, it } from 'bun:test';

/* eslint-disable-next-line import/no-internal-modules, import/no-relative-parent-imports
	-- These functions are internal. */
import { parseDateWithSpecFormat, parseDateWithTimezoneFormat, parseExifDate } from '../src/exif-date.ts';

/**
 * The number of seconds in a minute.
 */
const MINUTE = 60;

/**
 * The number of seconds in an hour.
 */
const HOUR = 3_600;

/**
 * The number of seconds in a day.
 */
const DAY = 86_400;

/**
 * The number of seconds in a year that isn't a leap year.
 */
const YEAR = DAY * 365;

/**
 * The number of seconds in a leap year.
 */
const LEAP_YEAR = DAY * 366;

describe('parseDateWithSpecFormat', () => {
	it('parses the Unix epoch', () => {
		expect.assertions(1);

		expect(parseDateWithSpecFormat('1970:01:01 00:00:00')).toBe(0);
	});

	it('parses a date and time as UTC', () => {
		expect.assertions(1);

		// Between 1970 and 1990, the leap years were 1972, 1976, 1980, 1984 and 1988.
		const expected = (15 * YEAR) + (5 * LEAP_YEAR) + ((31 + 13) * DAY) + (14 * HOUR) + (30 * MINUTE) + 14;

		expect(parseDateWithSpecFormat('1990:02:14 14:30:14')).toBe(expected);
	});

	it('returns null for an invalid date', () => {
		expect.assertions(1);

		expect(parseDateWithSpecFormat('1990:AA:14 14:30:14')).toBeNull();
	});
});

describe('parseDateWithTimezoneFormat', () => {
	it('parses a date and time with a negative offset', () => {
		expect.assertions(1);

		// The leap years were 1972, 1976, 1980, 1984, 1988, 1992, 1996 and 2000, and 2004 is one too.
		const days = 31 + 29 + 31 + 30 + 31 + 30 + 31 + 31 + 3;
		const years = ((2_004 - 1_970 - 8) * YEAR) + (8 * LEAP_YEAR);
		const expected = years + (days * DAY) + (23 * HOUR) + (39 * MINUTE) + 6 + (8 * HOUR);

		expect(parseDateWithTimezoneFormat('2004-09-04T23:39:06-08:00')).toBe(expected);
	});

	it('parses a date and time with a positive offset', () => {
		expect.assertions(1);

		expect(parseDateWithTimezoneFormat('1970-01-02T00:00:00+10:00')).toBe(DAY - (10 * HOUR));
	});

	it('applies the sign to the minutes of the offset', () => {
		expect.assertions(2);

		expect(parseDateWithTimezoneFormat('1970-01-01T00:00:00-08:30')).toBe((8 * HOUR) + (30 * MINUTE));
		expect(parseDateWithTimezoneFormat('1970-01-02T00:00:00+09:30')).toBe(DAY - (9 * HOUR) - (30 * MINUTE));
	});

	it('returns null for an invalid offset', () => {
		expect.assertions(1);

		expect(parseDateWithTimezoneFormat('2004-09-04T23:39:06A08:00')).toBeNull();
	});

	it('returns null for a date in the standard Exif format', () => {
		expect.assertions(1);

		expect(parseDateWithTimezoneFormat('2004:09:04 23:39:06')).toBeNull();
	});
});

describe('parseExifDate', () => {
	it('parses either format', () => {
		expect.assertions(2);

		expect(parseExifDate('1970:01:01 00:00:00')).toBe(0);
		expect(parseExifDate('1970-01-01T00:00:00-01:00')).toBe(HOUR);
	});

	it('returns null for an unsupported format', () => {
		expect.assertions(1);

		// The date and time must be separated by either a space or a T.
		expect(parseExifDate('2004:09:04-23:39:06')).toBeNull();
	});
});
