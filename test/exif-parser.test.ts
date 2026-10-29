/**
 * Tests for the Exif parser.
 *
 * @module
 */

/* eslint-disable typescript/naming-convention -- The tests use tag names from the Exif standard. */
// Cspell:ignore Thresholding

import { describe, expect, it } from 'bun:test';
import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { URL } from 'node:url';
import { isArrayBuffer } from 'node:util/types';

import {
	type ExifData,
	ExifParserFactory,
	type ExifParserFlags,
	ExifSections,
	type ExifTagEntry,
	OrientationTypes,
	ThumbnailTypes,
// eslint-disable-next-line import/no-relative-parent-imports -- The tests are kept apart from the published source.
} from '../src/index.ts';

import { ascii, buildExifJpeg, buildJpeg, buildTiff, type TagSpecification, uint16, uint32 } from './jpeg-builder.ts';

/**
 * The sample images.
 */
const IMAGE_NAMES = ['image2.jpg', 'image3.jpg', 'starfish.jpg', 'test.jpg'] as const;

/**
 * The parser options to test with each sample image, as changes to the defaults.
 */
const OPTIONS: ReadonlyMap<string, Partial<ExifParserFlags>> = new Map([
	['binary', { readBinaryTags: true }],
	['default', {}],
	['raw', { hidePointers: false, resolveTagNames: false, simplifyValues: false }],
]);

/**
 * The timestamp of `2001:02:03 04:05:06`, in seconds since the Unix epoch.
 */
const TEST_TIMESTAMP = 981_173_106;

/**
 * The error that the parser throws when asked for a thumbnail that isn't there.
 */
const NO_THUMBNAIL = 'The image has no embedded thumbnail.';

/**
 * Reads a fixture.
 *
 * @param name - The fixture's file name.
 * @returns The fixture's bytes.
 * @example
 * const image = await readFixture('test.jpg');
 */
const readFixture = async (name: string): Promise<Uint8Array> =>
	await Bun.file(new URL(`fixtures/${name}`, import.meta.url)).bytes();

/**
 * Gets a hash of some bytes, to keep snapshots short.
 *
 * @param bytes - The bytes to hash.
 * @returns The SHA-1 hash, in hexadecimal.
 * @example
 * const thumbnailHash = hash(data.getThumbnailBuffer());
 */
const hash = (bytes: ArrayBuffer): string => {
	// SHA-1 only identifies test data here, and createHash only throws for unknown algorithms.
	/* eslint-disable-next-line sonarjs/hashing, exception-handling/might-throw, exception-handling/no-unhandled
		-- See above. */
	const hasher = createHash('sha1');
	return hasher.update(new Uint8Array(bytes)).digest('hex');
};

/**
 * Converts data to a form that can be compared with JSON fixtures and snapshots.
 *
 * @param data - The data to convert.
 * @returns The data, with binary values replaced by their hashes, and without functions or undefined values.
 * @example
 * const tags = toPlain(data.tags);
 */
const toPlain = (data: unknown): unknown => JSON.parse(
	JSON.stringify(data, (_key, value: unknown) => (isArrayBuffer(value) ? `sha1:${hash(value)}` : value)),
);

/**
 * Gets the tags that the parser returns when tag names are disabled.
 *
 * @param data - The data that the parser read.
 * @returns The tags, which are an array when tag names are disabled.
 * @example
 * const entries = getEntries(data);
 */
const getEntries = (data: ExifData): readonly ExifTagEntry[] => (Array.isArray(data.tags) ? data.tags : []);

/**
 * Finds the value of a tag that the parser returned when tag names were disabled.
 *
 * @param data - The data that the parser read.
 * @param section - The image file directory in which the tag is found.
 * @param type - The number that identifies the tag within its directory.
 * @returns The tag's value, if the parser found the tag.
 * @example
 * const modifyDate = findEntry(data, ExifSections.IFD0, modifyDateTag);
 */
const findEntry = (data: ExifData, section: ExifSections, type: number): unknown =>
	getEntries(data).find(entry => entry.section === section && entry.type === type)?.value;

/**
 * Summarises the embedded thumbnail that the parser found in an image.
 *
 * @param data - The data that the parser read.
 * @returns The thumbnail's hash, size and offset, if the image has one.
 * @example
 * const thumbnail = summariseThumbnail(data);
 */
const summariseThumbnail = (data: ExifData): unknown => (data.hasThumbnail()
	? {
		thumbnailHash: hash(data.getThumbnailBuffer()),
		thumbnailSize: data.getThumbnailSize(),
		thumbnailStart: data.getThumbnailOffset(),
	}
	: {});

/**
 * Summarises everything that the parser found in an image.
 *
 * @param data - The data that the parser read.
 * @returns The summary.
 * @example
 * const summary = summarise(data);
 */
const summarise = (data: ExifData): unknown => toPlain({
	app1Offset: data.app1Offset,
	hasJpegThumbnail: data.hasThumbnail('image/jpeg'),
	hasThumbnail: data.hasThumbnail(),
	hasTiffThumbnail: data.hasThumbnail('image/tiff'),
	imageSize: data.getImageSize(),
	tags: data.tags,
	thumbnail: summariseThumbnail(data),
	thumbnailLength: data.thumbnailLength,
	thumbnailOffset: data.thumbnailOffset,
	thumbnailType: data.thumbnailType,
});

/**
 * Lists the tags in IFD0 of {@link EVERY_FORMAT_IMAGE}, which has a tag in each format.
 *
 * @param offsets - The offsets of the directories, of which the second is the Exif sub-IFD.
 * @returns The tags to write.
 * @example
 * const tags = listIfd0Tags(offsets);
 */
const listIfd0Tags = (offsets: readonly number[]): TagSpecification[] => [
	{ count: 1, data: uint16(0xFF_FE), format: 8, tag: 0x01_00 },
	{ count: 1, data: uint32(0xFF_FF_FF_FD), format: 9, tag: 0x01_01 },
	{ count: 1, data: [0xFF], format: 6, tag: 0x01_02 },
	{ count: 1, data: [0, 0, 0xC0, 0x3F], format: 11, tag: 0x01_06 },
	{ count: 1, data: [0, 0, 0, 0, 0, 0, 0xF8, 0x3F], format: 12, tag: 0x01_07 },
	{ count: 0, data: [], format: 0, tag: 0x01_08 },
	{ count: 1, data: [7], format: 1, tag: 0x01_09 },
	{ count: 2, data: [1, 2], format: 7, tag: 0x01_0A },
	{ count: 1, data: [...uint32(1), ...uint32(3)], format: 10, tag: 0x01_1A },
	{ count: 1, data: uint32(9), format: 4, tag: 0x99_99 },
	{ count: 1, data: uint32(offsets.at(1) ?? 0), format: 4, tag: 0x87_69 },
];

/**
 * Lists the tags in the Exif sub-IFD of {@link EVERY_FORMAT_IMAGE}.
 *
 * @param offsets - The offsets of the directories, of which the third is the interoperability IFD.
 * @returns The tags to write.
 * @example
 * const tags = listSubIfdTags(offsets);
 */
const listSubIfdTags = (offsets: readonly number[]): TagSpecification[] => [
	{ count: 20, data: ascii('2001:02:03 04:05:06'), format: 2, tag: 0x90_03 },
	{ count: 1, data: uint32(offsets.at(2) ?? 0), format: 4, tag: 0xA0_05 },
];

/**
 * Lists the tags in the interoperability IFD of {@link EVERY_FORMAT_IMAGE}.
 *
 * @returns The tags to write.
 * @example
 * const tags = listInteropIfdTags();
 */
const listInteropIfdTags = (): TagSpecification[] => [{ count: 4, data: ascii('R98'), format: 2, tag: 0x00_01 }];

/**
 * An image with a tag in each format, and an interoperability IFD.
 */
const EVERY_FORMAT_IMAGE = buildExifJpeg(buildTiff([listIfd0Tags, listSubIfdTags, listInteropIfdTags]));

/**
 * Lists the tags in an empty image file directory.
 *
 * @returns An empty list, as the directory has nothing in it.
 * @example
 * const tiff = buildTiff([listNoTags]);
 */
const listNoTags = (): TagSpecification[] => [];

/**
 * A TIFF structure with an empty IFD0.
 */
const EMPTY_TIFF = buildTiff([listNoTags]);

/**
 * Each sample image with each set of options.
 */
const SNAPSHOT_CASES = IMAGE_NAMES.flatMap(name => Array.from(OPTIONS.keys(), option => [name, option] as const));

describe('exifParserFactory', () => {
	it.each(['image2', 'starfish'])('parses %s.jpg as the original package did', async name => {
		expect.assertions(1);

		const data = ExifParserFactory.create(await readFixture(`${name}.jpg`)).parse();
		const expectedFile = Bun.file(new URL(`fixtures/expected-${name}.json`, import.meta.url));
		const expected: unknown = await expectedFile.json();
		const { app1Offset, startMarker, tags, thumbnailLength, thumbnailOffset, thumbnailType } = data;
		const actual = { app1Offset, startMarker, tags, thumbnailLength, thumbnailOffset, thumbnailType };

		expect(toPlain(actual)).toStrictEqual(expected);
	});

	it.each([
		['an ArrayBuffer', (bytes: Uint8Array): ArrayBuffer | ArrayBufferView => {
			const copy = new Uint8Array(bytes);
			return copy.buffer;
		}],
		['a Buffer', (bytes: Uint8Array): ArrayBuffer | ArrayBufferView => Buffer.from(bytes)],
		['a DataView', (bytes: Uint8Array): ArrayBuffer | ArrayBufferView => new DataView(bytes.buffer)],
		['part of a larger buffer', (bytes: Uint8Array): ArrayBuffer | ArrayBufferView => {
			const padded = new Uint8Array(bytes.length + 3);
			padded.set(bytes, 3);
			return padded.subarray(3);
		}],
	])('accepts %s', async (_description, convert) => {
		expect.assertions(1);

		const bytes = await readFixture('starfish.jpg');
		const expected = summarise(ExifParserFactory.create(bytes).parse());

		const parser = ExifParserFactory.create(convert(bytes));

		expect(summarise(parser.parse())).toStrictEqual(expected);
	});

	it('does not throw a RangeError when parsing image3.jpg', async () => {
		expect.assertions(1);

		const data = ExifParserFactory.create(await readFixture('image3.jpg')).parse();

		expect(data.tags.Orientation).toBe(OrientationTypes.TOP_LEFT);
	});

	it.each(SNAPSHOT_CASES)(
		'reads the same data from %s with the %s options',
		async (name, option) => {
			expect.assertions(1);

			const parser = ExifParserFactory.create(await readFixture(name));
			Object.assign(parser.flags, OPTIONS.get(option));

			expect(summarise(parser.parse())).toMatchSnapshot();
		},
	);
});

describe('exifParser options', () => {
	it('sets its options', async () => {
		expect.assertions(1);

		const parser = ExifParserFactory.create(await readFixture('test.jpg'))
			.enableBinaryFields(true)
			.enableImageSize(false)
			.enablePointers(true)
			.enableReturnTags(false)
			.enableSimpleValues(false)
			.enableTagNames(false);

		expect(parser.flags).toStrictEqual({
			hidePointers: false,
			imageSize: false,
			readBinaryTags: true,
			resolveTagNames: false,
			returnTags: false,
			simplifyValues: false,
		});
	});

	it('can skip the image size and the tags while still finding the thumbnail', async () => {
		expect.assertions(4);

		const parser = ExifParserFactory.create(await readFixture('starfish.jpg'));
		const data = parser.enableImageSize(false).enableReturnTags(false)
			.parse();

		expect(data.getImageSize()).toBeUndefined();
		expect(data.tags).toStrictEqual({});
		expect(data.hasThumbnail('image/jpeg')).toBe(true);
		expect(data.thumbnailType).toBe(ThumbnailTypes.jpeg);
	});
});

describe('exifParser formats', () => {
	it('simplifies values when tag names are disabled', async () => {
		expect.assertions(3);

		const data = ExifParserFactory.create(await readFixture('starfish.jpg')).enableTagNames(false)
			.parse();

		expect(findEntry(data, ExifSections.GPSIFD, 0x00_02)).toBeCloseTo(55.038756666666664);
		expect(findEntry(data, ExifSections.IFD0, 0x01_32)).toBe(1_368_199_295);
		expect(findEntry(data, ExifSections.SubIFD, 0x90_03)).toBe(1_368_199_295);
	});

	it('reads every format', () => {
		expect.assertions(1);

		const data = ExifParserFactory.create(EVERY_FORMAT_IMAGE).enableBinaryFields(true)
			.parse();

		expect(toPlain(data.tags)).toStrictEqual({
			BitsPerSample: -1,
			CellLength: 7,
			CellWidth: [],
			DateTimeOriginal: TEST_TIMESTAMP,
			FillOrder: `sha1:${hash(Uint8Array.from([1, 2]).buffer)}`,
			ImageHeight: -3,
			ImageWidth: -2,
			InteropIndex: 'R98',
			PhotometricInterpretation: 1.5,
			Thresholding: 1.5,
			undefined: 9,
			XResolution: 1 / 3,
		});
	});

	it('reads the interoperability IFD', () => {
		expect.assertions(1);

		const data = ExifParserFactory.create(EVERY_FORMAT_IMAGE).enableTagNames(false)
			.parse();

		expect(findEntry(data, ExifSections.InteropIFD, 0x00_01)).toBe('R98');
	});
});

describe('exifParser malformed data', () => {
	it('throws for an unsupported format', () => {
		expect.assertions(1);

		const tag: TagSpecification = { count: 1, data: [0], format: 13, tag: 0x01_00 };
		const image = buildExifJpeg(buildTiff([(): TagSpecification[] => [tag]]));

		expect(() => ExifParserFactory.create(image).parse()).toThrow('Exif format 13 is not supported.');
	});

	it('ignores pointers that are not numbers', () => {
		expect.assertions(2);

		const image = buildExifJpeg(buildTiff([
			(): TagSpecification[] => [
				{ count: 4, data: ascii('abc'), format: 2, tag: 0x01_03 },
				{ count: 4, data: ascii('abc'), format: 2, tag: 0x87_69 },
			],
		]));
		const data = ExifParserFactory.create(image).parse();

		expect(data.tags).toStrictEqual({});
		expect(data.thumbnailType).toBeUndefined();
	});

	it.each([
		['too short', buildJpeg([...ascii('Exif'), 0])],
		['without the Exif header', buildJpeg([...ascii('Nope'), 0, ...EMPTY_TIFF])],
		['with an unknown byte order', buildExifJpeg([0x58, 0x58, ...uint16(42), ...uint32(8)])],
		['with an invalid TIFF header', buildExifJpeg([0x49, 0x49, ...uint16(43), ...uint32(8)])],
	])('ignores an APP1 section %s', (_description, image) => {
		expect.assertions(2);

		const data = ExifParserFactory.create(image).parse();

		expect(data.app1Offset).toBeUndefined();
		expect(data.tags).toStrictEqual({});
	});
});

describe('exifData', () => {
	it('throws when asked for a thumbnail that is not there', async () => {
		expect.assertions(4);

		const data = ExifParserFactory.create(await readFixture('test.jpg')).parse();

		expect(data.hasThumbnail()).toBe(false);
		expect(() => data.getThumbnailLength()).toThrow(NO_THUMBNAIL);
		expect(() => data.getThumbnailOffset()).toThrow(NO_THUMBNAIL);
		expect(() => data.getThumbnailBuffer()).toThrow(NO_THUMBNAIL);
	});

	it('only matches thumbnails of known formats', async () => {
		expect.assertions(2);

		const data = ExifParserFactory.create(await readFixture('starfish.jpg')).parse();

		expect(data.hasThumbnail(' IMAGE/JPEG ')).toBe(true);
		expect(data.hasThumbnail('image/png')).toBe(false);
	});
});
