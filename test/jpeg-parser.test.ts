/**
 * Tests for reading the sections of a JPEG image.
 *
 * @module
 */

import { describe, expect, it } from 'bun:test';
import { URL } from 'node:url';

// eslint-disable-next-line import/no-internal-modules, import/no-relative-parent-imports -- The stream is internal.
import { ByteStream } from '../src/byte-stream.ts';
// eslint-disable-next-line import/no-internal-modules, import/no-relative-parent-imports -- These are internal.
import { getSectionName, getSizeFromSOFSection, parseSections } from '../src/jpeg-parser.ts';

/**
 * A small JPEG image with two APP1 sections.
 */
const TEST_IMAGE = await Bun.file(new URL('fixtures/test.jpg', import.meta.url)).bytes();

describe('parseSections', () => {
	it('passes each section to the iterator', () => {
		expect.assertions(1);

		const stream = new ByteStream(TEST_IMAGE);
		const start = stream.mark();
		const sections: { length: number, offset: number, type: number }[] = [];
		parseSections(stream, (type, sectionStream) => {
			const length = sectionStream.remainingLength();
			const offset = sectionStream.offsetFrom(start);
			sections.push({ length, offset, type });
		});

		expect(sections).toStrictEqual([
			{ length: 0, offset: 2, type: 0xD8 },
			{ length: 14, offset: 6, type: 0xE0 },
			{ length: 3_158, offset: 24, type: 0xE2 },
			{ length: 200, offset: 3_186, type: 0xE1 },
			{ length: 374, offset: 3_390, type: 0xE1 },
			{ length: 65, offset: 3_768, type: 0xDB },
			{ length: 65, offset: 3_837, type: 0xDB },
			{ length: 15, offset: 3_906, type: 0xC0 },
			{ length: 29, offset: 3_925, type: 0xC4 },
			{ length: 179, offset: 3_958, type: 0xC4 },
			{ length: 29, offset: 4_141, type: 0xC4 },
			{ length: 179, offset: 4_174, type: 0xC4 },
			{ length: 0, offset: 4_355, type: 0xDA },
		]);
	});

	it('stops at anything that is not a section marker', () => {
		expect.assertions(1);

		const types: number[] = [];
		parseSections(new ByteStream(Uint8Array.from([0xFF, 0xD8, 0x00, 0xFF, 0xD9])), type => {
			types.push(type);
		});

		expect(types).toStrictEqual([0xD8]);
	});
});

describe('getSizeFromSOFSection', () => {
	it('reads the size', () => {
		expect.assertions(1);

		const stream = new ByteStream(TEST_IMAGE, { bigEndian: true, length: 15, start: 3_906 });

		expect(getSizeFromSOFSection(stream)).toStrictEqual({ height: 1, width: 2 });
	});
});

describe('getSectionName', () => {
	it.each([
		[0xC0, { index: 0, name: 'SOF' }],
		[0xC4, { name: 'DHT' }],
		[0xC8, { name: null }],
		[0xCF, { index: 15, name: 'SOF' }],
		[0xD0, { index: 0, name: 'RST' }],
		[0xD8, { name: 'SOI' }],
		[0xD9, { name: 'EOI' }],
		[0xDA, { name: 'SOS' }],
		[0xDB, { name: 'DQT' }],
		[0xDD, { name: 'DRI' }],
		[0xEF, { index: 15, name: 'APP' }],
		[0xFE, { name: 'COM' }],
	])('names marker type %p', (markerType, expected) => {
		expect.assertions(1);

		expect(getSectionName(markerType)).toStrictEqual(expected);
	});
});
