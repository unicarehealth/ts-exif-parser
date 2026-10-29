/**
 * Creates Exif parsers.
 *
 * @module
 */

import { ByteStream } from './byte-stream.ts';
import { ExifParser } from './exif-parser.ts';

/**
 * Creates Exif parsers.
 */
// This keeps the original package's API.
// eslint-disable-next-line typescript/no-extraneous-class -- See above.
class ExifParserFactory {
	/**
	 * Creates a parser for a JPEG image.
	 *
	 * @param buffer - The image, or at least its start: the Exif data is near the start, in a section no longer
	 * than 64 KiB. This can be any typed array (including a Node.js `Buffer`) or a `DataView`.
	 * @returns A parser for the image.
	 * @example
	 * const data = ExifParserFactory.create(arrayBuffer).parse();
	 */
	public static create(buffer: ArrayBuffer | ArrayBufferView): ExifParser {
		const bytes = ArrayBuffer.isView(buffer)
			? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength)
			: new Uint8Array(buffer);
		return new ExifParser(new ByteStream(bytes, { bigEndian: true }));
	}
}

// eslint-disable-next-line import/prefer-default-export -- The original package's API has named exports only.
export { ExifParserFactory };
