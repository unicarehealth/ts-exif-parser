/**
 * Tests for the byte stream.
 *
 * @module
 */

import { describe, expect, it } from 'bun:test';

// eslint-disable-next-line import/no-internal-modules, import/no-relative-parent-imports -- The stream is internal.
import { ByteStream, type ByteStreamWindow } from '../src/byte-stream.ts';

/**
 * Bytes to read: 1.5 as a big-endian 64-bit and 32-bit float, and then -2 as a big-endian 16-bit, 32-bit and 8-bit
 * integer.
 */
const NUMBER_BYTES = Uint8Array.from([
	0x3F,
	0xF8,
	0,
	0,
	0,
	0,
	0,
	0,
	0x3F,
	0xC0,
	0,
	0,
	0xFF,
	0xFE,
	0xFF,
	0xFF,
	0xFF,
	0xFE,
	0xFE,
]);

/**
 * The length of a string that is read in more than one chunk.
 */
const LONG_STRING_LENGTH = 20_000;

/**
 * Gets the length of a stream's window.
 *
 * @param window - The part of {@link NUMBER_BYTES} that the stream reads.
 * @returns The number of bytes that the stream can read.
 * @example
 * const length = getWindowLength(options);
 */
const getWindowLength = (window: ByteStreamWindow): number => {
	const stream = new ByteStream(NUMBER_BYTES, window);
	return stream.remainingLength();
};

describe('byteStream reading', () => {
	it('reads big-endian numbers', () => {
		expect.assertions(5);

		const stream = new ByteStream(NUMBER_BYTES, { bigEndian: true });

		expect(stream.nextDouble()).toBe(1.5);
		expect(stream.nextFloat()).toBe(1.5);
		expect(stream.nextInt16()).toBe(-2);
		expect(stream.nextInt32()).toBe(-2);
		expect(stream.nextInt8()).toBe(-2);
	});

	it('reads little-endian numbers', () => {
		expect.assertions(2);

		const stream = new ByteStream(Uint8Array.from([0x01, 0x02, 0x01, 0x02, 0x03, 0x04]));

		expect(stream.nextUInt16()).toBe(0x02_01);
		expect(stream.nextUInt32()).toBe(0x04_03_02_01);
	});

	it('copies bytes', () => {
		expect.assertions(2);

		const stream = new ByteStream(NUMBER_BYTES, { length: 2, start: 12 });
		const buffer = stream.nextBuffer(4);

		expect([...new Uint8Array(buffer)]).toStrictEqual([0xFF, 0xFE]);
		expect(buffer).not.toBe(NUMBER_BYTES.buffer);
	});

	it('reads long strings', () => {
		expect.assertions(1);

		const bytes = new Uint8Array(LONG_STRING_LENGTH);
		bytes.fill(0x61);
		const stream = new ByteStream(bytes);

		expect(stream.nextString(bytes.length)).toBe('a'.repeat(LONG_STRING_LENGTH));
	});
});

describe('byteStream windows', () => {
	it('reads within its window of a typed array that is part of a larger buffer', () => {
		expect.assertions(2);

		const { buffer } = Uint8Array.from([9, 9, 0x41, 0x42, 0x43, 9]);
		const stream = new ByteStream(new Uint8Array(buffer, 1, 4), { length: 3, start: 1 });

		expect(stream.nextString(5)).toBe('ABC');
		expect(stream.remainingLength()).toBe(-2);
	});

	it('cuts the window short at the end of the bytes', () => {
		expect.assertions(3);

		expect(getWindowLength({ length: 10, start: 16 })).toBe(3);
		expect(getWindowLength({ start: 40 })).toBe(0);
		expect(getWindowLength({ length: -1, start: 4 })).toBe(0);
	});

	it('throws a RangeError when reading past the end of its window', () => {
		expect.assertions(1);

		const stream = new ByteStream(NUMBER_BYTES, { length: 1 });

		expect(() => stream.nextUInt16()).toThrow(RangeError);
	});
});

describe('byteStream markers and branches', () => {
	it('opens streams from markers with its current byte order', () => {
		expect.assertions(3);

		const stream = new ByteStream(Uint8Array.from([0, 0, 0x01, 0x02]), { bigEndian: true });
		const marker = stream.mark();
		stream.setBigEndian(false);

		expect(marker.offset).toBe(0);
		expect(marker.openWithOffset(2).nextUInt16()).toBe(0x02_01);
		expect(marker.openWithOffset().remainingLength()).toBe(4);
	});

	it('opens branches with its current byte order', () => {
		expect.assertions(3);

		const stream = new ByteStream(Uint8Array.from([0, 0, 0, 0, 0x03, 0x04]));
		const marker = stream.mark();
		stream.skip(2);
		const branch = stream.branch(2);

		expect(branch.nextUInt16()).toBe(0x04_03);
		expect(branch.offsetFrom(marker)).toBe(6);
		expect(stream.branch(0, 1).remainingLength()).toBe(1);
	});
});
