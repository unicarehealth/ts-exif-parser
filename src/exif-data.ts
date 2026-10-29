/**
 * The data that the parser reads from an image.
 *
 * @module
 */

import type { ByteStream, StreamMarker } from './byte-stream.ts';
import type { ExifTags } from './exif-tags.ts';
import { getSectionName, getSizeFromSOFSection, parseSections } from './jpeg-parser.ts';

// The original package named these enums' members, which this keeps for compatibility.
/* eslint-disable typescript/naming-convention -- See above. */

/**
 * The orientations of an image, as the `Orientation` tag gives them.
 */
enum OrientationTypes {
	/**
	 * The normal orientation.
	 */
	TOP_LEFT = 1,
	TOP_RIGHT = 2,
	BOTTOM_RIGHT = 3,
	BOTTOM_LEFT = 4,
	LEFT_TOP = 5,
	RIGHT_TOP = 6,
	RIGHT_BOTTOM = 7,
	LEFT_BOTTOM = 8,
}

/**
 * The formats of an embedded thumbnail, as the `Compression` tag gives them.
 */
enum ThumbnailTypes {
	tiff = 1,
	jpeg = 6,
}
/* eslint-enable typescript/naming-convention -- See above. */

/**
 * What the parser found in an image, from which {@link ExifData} is created.
 */
type ExifDataProperties = {
	/**
	 * The offset of the APP1 (Exif) section's data, from the start of the image.
	 */
	app1Offset?: number,

	/**
	 * The image's size, from its start of frame section.
	 */
	imageSize?: ImageSize,

	/**
	 * A marker at the start of the image.
	 */
	startMarker: StreamMarker,

	/**
	 * The tags, by name or (if tag names are disabled) as an array of {@link ExifTagEntry}.
	 */
	tags: ExifTags,

	/**
	 * The length of the embedded thumbnail, in bytes.
	 */
	thumbnailLength?: number,

	/**
	 * The offset of the embedded thumbnail, from the TIFF header.
	 */
	thumbnailOffset?: number,

	/**
	 * The format of the embedded thumbnail.
	 */
	thumbnailType?: ThumbnailTypes,
};

/**
 * The size of an image, in pixels.
 */
type ImageSize = {
	/**
	 * The number of rows of pixels.
	 */
	height: number,

	/**
	 * The number of columns of pixels.
	 */
	width: number,
};

/**
 * The length of the Exif header (`Exif\0\0`), which precedes the TIFF header from which the thumbnail's offset is
 * measured.
 */
const EXIF_HEADER_LENGTH = 6;

/**
 * The MIME types of the thumbnail formats.
 */
const THUMBNAIL_MIME_TYPES: ReadonlyMap<string, ThumbnailTypes> = /* @__PURE__ */ new Map([
	['image/jpeg', ThumbnailTypes.jpeg],
	['image/tiff', ThumbnailTypes.tiff],
]);

/**
 * The data that the parser reads from an image.
 */
class ExifData {
	/**
	 * The offset of the APP1 (Exif) section's data, from the start of the image.
	 */
	public app1Offset: number | undefined;

	/**
	 * The image's size, from its start of frame section.
	 */
	public imageSize: ImageSize | undefined;

	/**
	 * A marker at the start of the image.
	 */
	public startMarker: StreamMarker;

	/**
	 * The tags, by name or (if tag names are disabled) as an array of {@link ExifTagEntry}.
	 */
	public tags: ExifTags;

	/**
	 * The length of the embedded thumbnail, in bytes.
	 */
	public thumbnailLength: number | undefined;

	/**
	 * The offset of the embedded thumbnail, from the TIFF header.
	 */
	public thumbnailOffset: number | undefined;

	/**
	 * The format of the embedded thumbnail.
	 */
	public thumbnailType: ThumbnailTypes | undefined;

	/**
	 * Creates the data. {@link ExifParser.parse} Does this..
	 *
	 * @param properties - What the parser found in the image.
	 * @example
	 * const data = new ExifData(properties);
	 */
	// The data keeps the tags and the image size, which callers may change, as the original package did.
	// eslint-disable-next-line typescript/prefer-readonly-parameter-types -- See above.
	public constructor(properties: Readonly<ExifDataProperties>) {
		this.app1Offset = properties.app1Offset;
		this.imageSize = properties.imageSize;
		this.startMarker = properties.startMarker;
		this.tags = properties.tags;
		this.thumbnailLength = properties.thumbnailLength;
		this.thumbnailOffset = properties.thumbnailOffset;
		this.thumbnailType = properties.thumbnailType;
	}

	/**
	 * Gets the image's size, from its start of frame section.
	 *
	 * @returns The width and height, in pixels, if the image has a start of frame section.
	 * @example
	 * const width = data.getImageSize()?.width;
	 */
	public getImageSize(): ImageSize | undefined {
		return this.imageSize;
	}

	/**
	 * Gets the embedded thumbnail.
	 *
	 * @returns A copy of the thumbnail's bytes.
	 * @throws Error
	 * Thrown if the image has no embedded thumbnail.
	 * @example
	 * const thumbnail = data.getThumbnailBuffer();
	 */
	public getThumbnailBuffer(): ArrayBuffer {
		return this.getThumbnailStream().nextBuffer(this.getThumbnailLength());
	}

	/**
	 * Gets the length of the embedded thumbnail.
	 *
	 * @returns The number of bytes in the thumbnail.
	 * @throws Error
	 * Thrown if the image has no embedded thumbnail.
	 * @example
	 * const thumbnailLength = data.getThumbnailLength();
	 */
	public getThumbnailLength(): number {
		if (!this.hasThumbnail() || typeof this.thumbnailLength !== 'number') {
			throw new Error('The image has no embedded thumbnail.');
		}
		return this.thumbnailLength;
	}

	/**
	 * Gets the offset of the embedded thumbnail.
	 *
	 * @returns The thumbnail's offset from the start of the image, in bytes.
	 * @throws Error
	 * Thrown if the image has no embedded thumbnail.
	 * @example
	 * const thumbnailStart = data.getThumbnailOffset();
	 */
	public getThumbnailOffset(): number {
		const { app1Offset, thumbnailOffset } = this;
		if (typeof app1Offset !== 'number' || typeof thumbnailOffset !== 'number' || !this.hasThumbnail()) {
			throw new Error('The image has no embedded thumbnail.');
		}
		return app1Offset + EXIF_HEADER_LENGTH + thumbnailOffset;
	}

	/**
	 * Gets the size of the embedded thumbnail, if it's a JPEG image.
	 *
	 * @returns The thumbnail's width and height, in pixels, if it has a start of frame section.
	 * @throws Error
	 * Thrown if the image has no embedded thumbnail.
	 * @example
	 * const thumbnailWidth = data.getThumbnailSize()?.width;
	 */
	public getThumbnailSize(): ImageSize | undefined {
		let size: ImageSize | undefined;
		parseSections(this.getThumbnailStream(), (sectionType, sectionStream) => {
			if (getSectionName(sectionType).name === 'SOF') {
				size = getSizeFromSOFSection(sectionStream);
			}
		});
		return size;
	}

	/**
	 * Checks whether the image has an embedded thumbnail, optionally of a particular format.
	 *
	 * @param mime - The MIME type of the format that matters (`image/jpeg` or `image/tiff`), if one does.
	 * @returns Whether the image has such a thumbnail.
	 * @example
	 * const hasJpegThumbnail = data.hasThumbnail('image/jpeg');
	 */
	public hasThumbnail(mime?: string): boolean {
		if ((this.thumbnailOffset ?? 0) === 0 || (this.thumbnailLength ?? 0) === 0) {
			return false;
		}
		if (typeof mime !== 'string') {
			return true;
		}
		const thumbnailType = THUMBNAIL_MIME_TYPES.get(mime.toLowerCase().trim()) ?? null;
		return thumbnailType !== null && thumbnailType === this.thumbnailType;
	}

	/**
	 * Opens a stream at the start of the embedded thumbnail.
	 *
	 * @returns A stream that starts at the thumbnail.
	 * @throws Error
	 * Thrown if the image has no embedded thumbnail.
	 * @example
	 * const thumbnail = data.getThumbnailBuffer();
	 */
	private getThumbnailStream(): ByteStream {
		return this.startMarker.openWithOffset(this.getThumbnailOffset());
	}
}

export { ExifData, OrientationTypes, ThumbnailTypes };
export type { ExifDataProperties, ImageSize };
