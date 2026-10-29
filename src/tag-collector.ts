/**
 * Collects the tags that the parser reads.
 *
 * @module
 */

import { type ExifDataProperties, ThumbnailTypes } from './exif-data.ts';
import { ExifSections, type ExifTag, UNDEFINED_FORMAT } from './exif-section-parser.ts';
import type { ExifTags } from './exif-tags.ts';
import {
	castDateValues,
	castDegreeValues,
	type GetTagValue,
	simplifyValue,
	type TagReference,
	type TagValue,
} from './simplify.ts';
import { EXIF_TAG_NAMES, GPS_TAG_NAMES } from './tag-names.ts';

/**
 * The parser's options.
 */
type ExifParserFlags = {
	/**
	 * Whether to hide the tags that point to the embedded thumbnail.
	 */
	hidePointers: boolean,

	/**
	 * Whether to read the image's size from its start of frame section.
	 */
	imageSize: boolean,

	/**
	 * Whether to read tags whose values are in the undefined format, which are usually binary.
	 */
	readBinaryTags: boolean,

	/**
	 * Whether to return tags by name, rather than as an array of {@link ExifTagEntry}.
	 */
	resolveTagNames: boolean,

	/**
	 * Whether to return the tags at all.
	 */
	returnTags: boolean,

	/**
	 * Whether to simplify values: rationals to numbers, lists of one component to that component, GPS coordinates
	 * to signed degrees and dates to timestamps (in seconds since the Unix epoch).
	 */
	simplifyValues: boolean,
};

/**
 * A tag, as the parser returns it when tag names are disabled.
 */
type ExifTagEntry = {
	/**
	 * The image file directory in which the tag was found.
	 */
	section: ExifSections,

	/**
	 * The number that identifies the tag within its directory.
	 */
	type: number,

	/**
	 * The tag's value, simplified unless simple values are disabled.
	 */
	value: TagValue,
};

/**
 * The tag that holds the offset of the embedded thumbnail.
 */
const THUMBNAIL_OFFSET_TAG = 0x02_01;

/**
 * The tag that holds the length of the embedded thumbnail.
 */
const THUMBNAIL_LENGTH_TAG = 0x02_02;

/**
 * The tag that holds the format of the embedded thumbnail.
 */
const COMPRESSION_TAG = 0x01_03;

/**
 * The tags that point to the embedded thumbnail.
 */
const THUMBNAIL_POINTER_TAGS: ReadonlySet<number> = /* @__PURE__ */ new Set([
	COMPRESSION_TAG,
	THUMBNAIL_LENGTH_TAG,
	THUMBNAIL_OFFSET_TAG,
]);

/**
 * The thumbnail formats, keyed by the value of the `Compression` tag.
 */
const THUMBNAIL_TYPES: ReadonlyMap<number, ThumbnailTypes> = /* @__PURE__ */ new Map([
	[ThumbnailTypes.jpeg, ThumbnailTypes.jpeg],
	[ThumbnailTypes.tiff, ThumbnailTypes.tiff],
]);

/**
 * The name that the original package gave tags that it didn't know, which this keeps for compatibility.
 */
const UNKNOWN_TAG_NAME = 'undefined';

/**
 * Gets the first component of a value, if it's a number.
 *
 * @param value - A tag's value, as it's stored.
 * @returns The first component (or `null` if it isn't a number).
 * @example
 * const pointer = getFirstNumber(tag.value);
 */
const getFirstNumber = (value: TagValue): number | null => {
	const first: unknown = Array.isArray(value) ? value.at(0) : null;
	return typeof first === 'number' ? first : null;
};

/**
 * Checks whether a tag in the array of {@link ExifTagEntry} is the one that a reference identifies.
 *
 * @param entry - The tag in the array.
 * @param tag - The reference to the tag that's wanted.
 * @returns Whether they're the same tag.
 * @example
 * const isMatch = matches(entry, tag);
 */
const matches = (entry: Readonly<ExifTagEntry>, tag: TagReference): boolean =>
	entry.section === tag.section && entry.type === tag.type;

/**
 * Collects the tags that the parser reads, and the pointers to the embedded thumbnail among them.
 */
class TagCollector {
	/**
	 * The tags, when tag names are disabled.
	 */
	private readonly entries: ExifTagEntry[] = [];

	/**
	 * The parser's options.
	 */
	private readonly flags: Readonly<ExifParserFlags>;

	/**
	 * The tags by name, when tag names are enabled.
	 */
	private readonly namedTags = new Map<string, TagValue>();

	/**
	 * What the parser found in the image, to which this adds the pointers to the embedded thumbnail.
	 */
	private readonly properties: ExifDataProperties;

	/**
	 * Creates a collector.
	 *
	 * @param flags - The parser's options.
	 * @param properties - What the parser found in the image, to which this adds the pointers to the thumbnail.
	 * @example
	 * const collector = new TagCollector(parser.flags, properties);
	 */
	// The collector adds to the properties.
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- See above.
	public constructor(flags: Readonly<ExifParserFlags>, properties: ExifDataProperties) {
		this.flags = flags;
		this.properties = properties;
	}

	/**
	 * Adds a tag that the parser read, unless the options exclude it.
	 *
	 * @param tag - What the section parser read: the tag's directory, number, format and stored value.
	 * @example
	 * parseTags(sectionStream, collector.add.bind(collector));
	 */
	public add(tag: ExifTag): void {
		if (!this.isWanted(tag)) {
			return;
		}
		const value = this.flags.simplifyValues ? simplifyValue(tag.value) : tag.value;
		if (!this.flags.resolveTagNames) {
			this.entries.push({ section: tag.section, type: tag.type, value });
			return;
		}
		const sectionNames = tag.section === ExifSections.GPSIFD ? GPS_TAG_NAMES : EXIF_TAG_NAMES;
		const name = sectionNames.get(tag.type) ?? EXIF_TAG_NAMES.get(tag.type) ?? UNKNOWN_TAG_NAME;
		// The first tag with a name wins (e.g., IFD0's over IFD1's).
		if (!this.namedTags.has(name)) {
			this.namedTags.set(name, value);
		}
	}

	/**
	 * Gets the tags, simplifying the GPS coordinates and dates if simple values are enabled.
	 *
	 * @returns The tags, by name or (if tag names are disabled) as an array of {@link ExifTagEntry}.
	 * @example
	 * properties.tags = collector.getTags();
	 */
	public getTags(): ExifTags {
		const { resolveTagNames, simplifyValues } = this.flags;
		if (simplifyValues) {
			const [getTagValue, setTagValue] = resolveTagNames
				? [this.getNamedValue.bind(this), this.setNamedValue.bind(this)]
				: [this.getEntryValue.bind(this), this.setEntryValue.bind(this)];
			castDegreeValues(getTagValue, setTagValue);
			castDateValues(getTagValue, setTagValue);
		}
		const tags = resolveTagNames ? Object.fromEntries(this.namedTags) : this.entries;
		/*
		 * ExifTags describes the usual types of the tags' values, which the parser doesn't check, and when tag
		 * names are disabled, the original package returned an array here, which it can't describe.
		 */
		/* eslint-disable-next-line typescript/consistent-type-assertions, typescript/no-unsafe-type-assertion
			-- See above. */
		return tags as unknown as ExifTags;
	}

	/**
	 * Gets the value of a tag in the array of {@link ExifTagEntry}.
	 *
	 * @param tag - The tag whose value to get.
	 * @returns Its value (or `null` if the parser didn't find the tag).
	 * @example
	 * const value = collector.getEntryValue(tag);
	 */
	private getEntryValue(tag: TagReference): ReturnType<GetTagValue> {
		return this.entries.find(entry => matches(entry, tag))?.value ?? null;
	}

	/**
	 * Gets the value of a tag by name.
	 *
	 * @param tag - The tag whose value to get.
	 * @returns Its value (or `null` if the parser didn't find the tag).
	 * @example
	 * const value = collector.getNamedValue(tag);
	 */
	private getNamedValue(tag: TagReference): ReturnType<GetTagValue> {
		return this.namedTags.get(tag.name) ?? null;
	}

	/**
	 * Checks whether the options include a tag, noting its value first if it points to the embedded thumbnail.
	 *
	 * @param tag - The tag that was read.
	 * @returns Whether the options include it.
	 * @example
	 * const isWanted = collector.isWanted(tag);
	 */
	private isWanted(tag: ExifTag): boolean {
		const { flags } = this;
		if (!flags.readBinaryTags && tag.format === UNDEFINED_FORMAT) {
			return false;
		}
		if (!THUMBNAIL_POINTER_TAGS.has(tag.type)) {
			return flags.returnTags;
		}
		// The pointers are kept even when the tags aren't returned.
		this.setPointer(tag.type, getFirstNumber(tag.value));
		return flags.returnTags && !flags.hidePointers;
	}

	/**
	 * Sets the value of a tag in the array of {@link ExifTagEntry}.
	 *
	 * @param tag - The tag whose value to set.
	 * @param value - Its new value.
	 * @example
	 * collector.setEntryValue(tag, timestamp);
	 */
	private setEntryValue(tag: TagReference, value: TagValue): void {
		for (const entry of this.entries) {
			if (matches(entry, tag)) {
				entry.value = value;
			}
		}
	}

	/**
	 * Sets the value of a tag by name.
	 *
	 * @param tag - The tag whose value to set.
	 * @param value - Its new value.
	 * @example
	 * collector.setNamedValue(tag, timestamp);
	 */
	private setNamedValue(tag: TagReference, value: TagValue): void {
		this.namedTags.set(tag.name, value);
	}

	/**
	 * Notes the value of a tag that points to the embedded thumbnail.
	 *
	 * @param type - The number that identifies the tag.
	 * @param pointer - The tag's value (or `null` if it isn't a number, in which case it's ignored).
	 * @example
	 * collector.setPointer(tag.type, getFirstNumber(tag.value));
	 */
	private setPointer(type: number, pointer: number | null): void {
		if (pointer === null) {
			return;
		}
		if (type === THUMBNAIL_OFFSET_TAG) {
			this.properties.thumbnailOffset = pointer;
		}
		else if (type === THUMBNAIL_LENGTH_TAG) {
			this.properties.thumbnailLength = pointer;
		}
		else {
			const thumbnailType = THUMBNAIL_TYPES.get(pointer) ?? null;
			if (thumbnailType !== null) {
				this.properties.thumbnailType = thumbnailType;
			}
		}
	}
}

export { TagCollector };
export type { ExifParserFlags, ExifTagEntry };
