/**
 * Reads Exif metadata from JPEG images, in Node.js, Bun, browsers and NetSuite.
 *
 * @module
 */

export { ExifData, type ImageSize, OrientationTypes, ThumbnailTypes } from './exif-data.ts';
export { ExifParserFactory } from './exif-parser-factory.ts';
export { ExifParser } from './exif-parser.ts';
export { type ExifComponent, type ExifRational, ExifSections } from './exif-section-parser.ts';
export type { ExifTags } from './exif-tags.ts';
export type { TagValue } from './simplify.ts';
export type { ExifParserFlags, ExifTagEntry } from './tag-collector.ts';
