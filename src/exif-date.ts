/**
 * Parses the date and time formats found in Exif tags.
 *
 * @module
 */

/**
 * The number of seconds in an hour.
 */
const SECONDS_PER_HOUR = 3_600;

/**
 * The number of seconds in a minute.
 */
const SECONDS_PER_MINUTE = 60;

/**
 * The number of milliseconds in a second.
 */
const MILLISECONDS_PER_SECOND = 1_000;

/*
 * These patterns are easier to read whole than split across lines. Each group is a fixed number of digits, so
 * they can't backtrack.
 */
/* eslint-disable stylistic/max-len -- See above. */

/**
 * The pattern of the standard Exif format, `YYYY:MM:DD hh:mm:ss`.
 */
const SPEC_FORMAT_PATTERN = /^(?<year>\d{4}):(?<month>\d{2}):(?<day>\d{2}) (?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})$/v;

/**
 * The pattern of the ISO 8601 format with a time zone offset, `YYYY-MM-DDThh:mm:ss±hh:mm`, which some software
 * writes instead.
 */
const TIMEZONE_FORMAT_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hours>\d{2}):(?<minutes>\d{2}):(?<seconds>\d{2})(?<sign>[+\-])(?<offsetHours>\d{2}):(?<offsetMinutes>\d{2})$/v;
/* eslint-enable stylistic/max-len -- See above. */

/**
 * Converts the parts of a UTC date and time, as a pattern matched them, to a timestamp.
 *
 * @param parts - The groups that matched the year, month (from 1), day, hours, minutes and seconds.
 * @returns The number of seconds since the Unix epoch.
 * @example
 * const timestamp = toTimestamp(groups);
 */
const toTimestamp = (parts: Readonly<Partial<Record<string, string>>>): number => {
	const { day, hours, minutes, month, seconds, year } = parts;
	/*
	 * Temporal isn't available in every environment that this package supports, and the pattern has checked each
	 * part, so the zero-indexed month is the only pitfall of Date here.
	 */
	// eslint-disable-next-line unicorn/prefer-temporal -- See above.
	const milliseconds = Date.UTC(
		Number(year),
		Number(month) - 1,
		Number(day),
		Number(hours),
		Number(minutes),
		Number(seconds),
	);
	return milliseconds / MILLISECONDS_PER_SECOND;
};

/**
 * Parses a date and time in the ISO 8601 format with a time zone offset (e.g., `2004-09-04T23:39:06-08:00`).
 *
 * @param dateTime - The text of the tag.
 * @returns The number of seconds since the Unix epoch (or `null` if the text isn't in that format).
 * @example
 * const timestamp = parseDateWithTimezoneFormat('1970-01-01T10:00:00+10:00');
 */
const parseDateWithTimezoneFormat = (dateTime: string): number | null => {
	const groups = TIMEZONE_FORMAT_PATTERN.exec(dateTime)?.groups ?? null;
	if (groups === null) {
		return null;
	}
	const offset = (Number(groups['offsetHours']) * SECONDS_PER_HOUR)
		+ (Number(groups['offsetMinutes']) * SECONDS_PER_MINUTE);
	// The offset is how far the local time is ahead of UTC.
	return toTimestamp(groups) - (groups['sign'] === '-' ? -offset : offset);
};

/**
 * Parses a date and time in the standard Exif format (`YYYY:MM:DD hh:mm:ss`), taking it to be in UTC.
 *
 * @param dateTime - The text of the tag.
 * @returns The number of seconds since the Unix epoch (or `null` if the text isn't in that format).
 * @example
 * const timestamp = parseDateWithSpecFormat('1970:01:01 00:00:00');
 */
const parseDateWithSpecFormat = (dateTime: string): number | null => {
	const groups = SPEC_FORMAT_PATTERN.exec(dateTime)?.groups ?? null;
	return groups === null ? null : toTimestamp(groups);
};

/**
 * Parses a date and time from an Exif tag, in either the standard Exif format or the ISO 8601 format with a time
 * zone offset.
 *
 * @param dateTime - The text of the tag.
 * @returns The number of seconds since the Unix epoch (or `null` if the text isn't in either format).
 * @example
 * const timestamp = parseExifDate('1970:01:01 00:00:00');
 */
const parseExifDate = (dateTime: string): number | null =>
	parseDateWithSpecFormat(dateTime) ?? parseDateWithTimezoneFormat(dateTime);

export { parseDateWithSpecFormat, parseDateWithTimezoneFormat, parseExifDate };
