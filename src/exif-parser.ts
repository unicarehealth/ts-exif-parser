/**
 * The Exif parser.
 *
 * @module
 */

import type { ByteStream } from './byte-stream.ts';
import { ExifData, type ExifDataProperties } from './exif-data.ts';
import { parseTags } from './exif-section-parser.ts';
import { getSectionName, getSizeFromSOFSection, parseSections } from './jpeg-parser.ts';
import { type ExifParserFlags, TagCollector } from './tag-collector.ts';

/**
 * The marker type of the APP1 section, in which Exif data is found.
 */
const APP1 = 0xE1;

/**
 * Reads Exif data from a JPEG image.
 */
class ExifParser {
	/**
	 * The parser's options, which the `enable` methods set.
	 */
	public flags: ExifParserFlags = {
		hidePointers: true,
		imageSize: true,
		readBinaryTags: false,
		resolveTagNames: true,
		returnTags: true,
		simplifyValues: true,
	};

	/**
	 * A stream on the image.
	 */
	private readonly stream: ByteStream;

	/**
	 * Creates a parser. {@link ExifParserFactory.create} Does this..
	 *
	 * @param stream - A big-endian stream on the image.
	 * @example
	 * const parser = new ExifParser(stream);
	 */
	public constructor(stream: ByteStream) {
		this.stream = stream;
	}

	/**
	 * Sets whether to read tags whose values are in the undefined format, which are usually binary.
	 *
	 * @param enable - Whether to read them. They aren't read by default.
	 * @returns This parser, so that calls can be chained.
	 * @example
	 * const data = parser.enableBinaryFields(true).parse();
	 */
	public enableBinaryFields(enable: boolean): this {
		this.flags.readBinaryTags = enable;
		return this;
	}

	/**
	 * Sets whether to read the image's size from its start of frame section.
	 *
	 * @param enable - Whether to read it. It's read by default.
	 * @returns This parser, so that calls can be chained.
	 * @example
	 * const data = parser.enableImageSize(false).parse();
	 */
	public enableImageSize(enable: boolean): this {
		this.flags.imageSize = enable;
		return this;
	}

	/**
	 * Sets whether to return the tags that point to the embedded thumbnail.
	 *
	 * @param enable - Whether to return them. They aren't returned by default.
	 * @returns This parser, so that calls can be chained.
	 * @example
	 * const data = parser.enablePointers(true).parse();
	 */
	public enablePointers(enable: boolean): this {
		this.flags.hidePointers = !enable;
		return this;
	}

	/**
	 * Sets whether to return the tags at all.
	 *
	 * @param enable - Whether to return them. They're returned by default.
	 * @returns This parser, so that calls can be chained.
	 * @example
	 * const data = parser.enableReturnTags(false).parse();
	 */
	public enableReturnTags(enable: boolean): this {
		this.flags.returnTags = enable;
		return this;
	}

	/**
	 * Sets whether to simplify values: rationals to numbers, lists of one component to that component, GPS
	 * coordinates to signed degrees and dates to timestamps (in seconds since the Unix epoch).
	 *
	 * @param enable - Whether to simplify them. They're simplified by default.
	 * @returns This parser, so that calls can be chained.
	 * @example
	 * const data = parser.enableSimpleValues(false).parse();
	 */
	public enableSimpleValues(enable: boolean): this {
		this.flags.simplifyValues = enable;
		return this;
	}

	/**
	 * Sets whether to return tags by name, rather than as an array of {@link ExifTagEntry}.
	 *
	 * @param enable - Whether to return them by name. They're returned by name by default.
	 * @returns This parser, so that calls can be chained.
	 * @example
	 * const data = parser.enableTagNames(false).parse();
	 */
	public enableTagNames(enable: boolean): this {
		this.flags.resolveTagNames = enable;
		return this;
	}

	/**
	 * Reads the image's Exif data.
	 *
	 * @returns The tags, image size and embedded thumbnail that the parser found.
	 * @throws Error
	 * Thrown if a tag has an unsupported format.
	 * @throws RangeError
	 * Thrown if the Exif data is truncated or malformed.
	 * @example
	 * const data = ExifParserFactory.create(bytes).parse();
	 */
	public parse(): ExifData {
		const start = this.stream.mark();
		const properties: ExifDataProperties = { startMarker: start, tags: {} };
		const collector = new TagCollector(this.flags, properties);
		parseSections(start.openWithOffset(0), (sectionType, sectionStream) => {
			if (sectionType === APP1) {
				const sectionOffset = sectionStream.offsetFrom(start);
				if (parseTags(sectionStream, collector.add.bind(collector))) {
					properties.app1Offset = sectionOffset;
				}
				return;
			}
			if (this.flags.imageSize && getSectionName(sectionType).name === 'SOF') {
				properties.imageSize = getSizeFromSOFSection(sectionStream);
			}
		});
		properties.tags = collector.getTags();
		return new ExifData(properties);
	}
}

// eslint-disable-next-line import/prefer-default-export -- The original package's API has named exports only.
export { ExifParser };
