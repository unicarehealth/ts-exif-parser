/**
 * A stream that reads numbers, strings and bytes from part of a byte array.
 *
 * @module
 */

/**
 * The part of a byte array that a {@link ByteStream} reads, and how it reads it.
 */
type ByteStreamWindow = {
	/**
	 * Whether multi-byte numbers are big-endian (rather than little-endian, as they are by default).
	 */
	readonly bigEndian?: boolean,

	/**
	 * The number of bytes in the window, which runs to the end of the array by default.
	 */
	readonly length?: number,

	/**
	 * The offset of the window from the start of the array, which is 0 by default.
	 */
	readonly start?: number,
};

/**
 * A position in a {@link ByteStream}, from which other streams can be opened.
 */
type StreamMarker = {
	/**
	 * Gets the position, relative to the start of the whole byte array.
	 *
	 * @returns The offset from the start of the array, in bytes.
	 */
	readonly getAbsoluteOffset: () => number,

	/**
	 * The position, relative to the start of the window of the stream that made the marker.
	 */
	readonly offset: number,

	/**
	 * Opens a stream at an offset from the marker, running to the end of the window of the stream that made
	 * the marker and using that stream's byte order at the time of opening.
	 *
	 * @param offset - The distance from the marker to the start of the new stream, in bytes.
	 * @returns A stream that starts at that offset.
	 */
	readonly openWithOffset: (offset?: number) => ByteStream,
};

/**
 * The most character codes that are passed to `String.fromCharCode` at once, to stay well within the engine's
 * limit on the number of arguments.
 */
const STRING_CHUNK_LENGTH = 8_192;

/**
 * Clamps a number to a range.
 *
 * @param value - The number to clamp.
 * @param minimum - The smallest result.
 * @param maximum - The largest result.
 * @returns The number, or whichever end of the range it's beyond.
 * @example
 * const start = clamp(offset, 0, bytes.length);
 */
const clamp = (value: number, minimum: number, maximum: number): number => Math.min(Math.max(value, minimum), maximum);

/**
 * A stream that reads numbers, strings and bytes from a window of a byte array.
 *
 * @remarks
 * A window that would extend past the end of the array is cut short, and reading past the end of the window
 * throws a `RangeError`.
 */
class ByteStream {
	/**
	 * The bytes that the stream reads, which may extend beyond its window.
	 */
	private readonly bytes: Uint8Array;

	/**
	 * The end of the window, relative to the start of {@link ByteStream.bytes}.
	 */
	private readonly end: number;

	/**
	 * Whether multi-byte numbers are little-endian.
	 */
	private littleEndian: boolean;

	/**
	 * The position of the next read, relative to the start of the window.
	 */
	private position = 0;

	/**
	 * The start of the window, relative to the start of {@link ByteStream.bytes}.
	 */
	private readonly start: number;

	/**
	 * A view of the window, through which numbers are read.
	 */
	private readonly view: DataView;

	/**
	 * Creates a stream.
	 *
	 * @param bytes - The byte array that the stream reads.
	 * @param window - The part of the array that the stream reads, and how it reads it.
	 * @example
	 * const stream = new ByteStream(bytes);
	 */
	public constructor(bytes: Uint8Array, window: ByteStreamWindow = {}) {
		const { bigEndian = false, length = bytes.length, start = 0 } = window;
		this.bytes = bytes;
		this.start = clamp(start, 0, bytes.length);
		this.end = clamp(start + Math.max(length, 0), this.start, bytes.length);
		this.view = new DataView(bytes.buffer, bytes.byteOffset + this.start, this.end - this.start);
		this.littleEndian = !bigEndian;
	}

	/**
	 * Opens a stream on part of this stream's window, at an offset from the current position.
	 *
	 * @param offset - The distance from the current position to the start of the new stream, in bytes.
	 * @param length - The length of the new stream, which runs to the end of this stream's window by default.
	 * @returns A stream with this stream's byte order.
	 * @example
	 * const sectionStream = stream.branch(0, sectionLength);
	 */
	public branch(offset: number, length?: number): ByteStream {
		return this.open(this.start + this.position + offset, length);
	}

	/**
	 * Marks the current position, from which other streams can be opened.
	 *
	 * @returns A marker at the current position.
	 * @example
	 * const start = stream.mark();
	 */
	public mark(): StreamMarker {
		const absoluteOffset = this.start + this.position;
		return {
			/**
			 * Gets the marker's position, relative to the start of the whole byte array.
			 *
			 * @returns The offset from the start of the array, in bytes.
			 * @example
			 * const absoluteOffset = marker.getAbsoluteOffset();
			 */
			getAbsoluteOffset: (): number => absoluteOffset,
			offset: this.position,

			/**
			 * Opens a stream at an offset from the marker.
			 *
			 * @param offset - The distance from the marker to the start of the new stream, in bytes.
			 * @returns A stream that starts at that offset.
			 * @example
			 * const ifd0Stream = tiffMarker.openWithOffset(ifd0Offset);
			 */
			openWithOffset: (offset = 0): ByteStream => this.open(absoluteOffset + offset),
		};
	}

	/**
	 * Reads some bytes.
	 *
	 * @param length - The number of bytes to read, which is cut short at the end of the window.
	 * @returns A copy of the bytes.
	 * @example
	 * const thumbnail = stream.nextBuffer(thumbnailLength);
	 */
	public nextBuffer(length: number): ArrayBuffer {
		const position = this.start + this.position;
		this.position += length;
		return this.bytes.slice(position, Math.min(position + length, this.end)).buffer;
	}

	/**
	 * Reads a 64-bit floating-point number.
	 *
	 * @returns The number that was read.
	 * @example
	 * const value = stream.nextDouble();
	 */
	public nextDouble(): number {
		const value = this.view.getFloat64(this.position, this.littleEndian);
		this.position += 8;
		return value;
	}

	/**
	 * Reads a 32-bit floating-point number.
	 *
	 * @returns The number that was read.
	 * @example
	 * const value = stream.nextFloat();
	 */
	public nextFloat(): number {
		const value = this.view.getFloat32(this.position, this.littleEndian);
		this.position += 4;
		return value;
	}

	/**
	 * Reads a signed 8-bit integer.
	 *
	 * @returns The integer that was read.
	 * @example
	 * const value = stream.nextInt8();
	 */
	public nextInt8(): number {
		const value = this.view.getInt8(this.position);
		this.position += 1;
		return value;
	}

	/**
	 * Reads a signed 16-bit integer.
	 *
	 * @returns The integer that was read.
	 * @example
	 * const value = stream.nextInt16();
	 */
	public nextInt16(): number {
		const value = this.view.getInt16(this.position, this.littleEndian);
		this.position += 2;
		return value;
	}

	/**
	 * Reads a signed 32-bit integer.
	 *
	 * @returns The integer that was read.
	 * @example
	 * const value = stream.nextInt32();
	 */
	public nextInt32(): number {
		const value = this.view.getInt32(this.position, this.littleEndian);
		this.position += 4;
		return value;
	}

	/**
	 * Reads a string, with one character for each byte (as in ISO 8859-1).
	 *
	 * @param length - The number of bytes to read, which is cut short at the end of the window.
	 * @returns The string that was read.
	 * @example
	 * const text = stream.nextString(length);
	 */
	public nextString(length: number): string {
		const position = this.start + this.position;
		const bytes = this.bytes.subarray(position, Math.min(position + length, this.end));
		let value = '';
		for (let index = 0; index < bytes.length; index += STRING_CHUNK_LENGTH) {
			// These are bytes, not code points, so String.fromCodePoint would be no better.
			// eslint-disable-next-line unicorn/prefer-code-point -- See above.
			value += String.fromCharCode(...bytes.subarray(index, index + STRING_CHUNK_LENGTH));
		}
		this.position += length;
		return value;
	}

	/**
	 * Reads an unsigned 8-bit integer.
	 *
	 * @returns The integer that was read.
	 * @example
	 * const value = stream.nextUInt8();
	 */
	public nextUInt8(): number {
		const value = this.view.getUint8(this.position);
		this.position += 1;
		return value;
	}

	/**
	 * Reads an unsigned 16-bit integer.
	 *
	 * @returns The integer that was read.
	 * @example
	 * const value = stream.nextUInt16();
	 */
	public nextUInt16(): number {
		const value = this.view.getUint16(this.position, this.littleEndian);
		this.position += 2;
		return value;
	}

	/**
	 * Reads an unsigned 32-bit integer.
	 *
	 * @returns The integer that was read.
	 * @example
	 * const value = stream.nextUInt32();
	 */
	public nextUInt32(): number {
		const value = this.view.getUint32(this.position, this.littleEndian);
		this.position += 4;
		return value;
	}

	/**
	 * Gets the distance from a marker to the current position.
	 *
	 * @param marker - A marker made by any stream on the same byte array.
	 * @returns The distance, in bytes.
	 * @example
	 * const sectionOffset = sectionStream.offsetFrom(start);
	 */
	public offsetFrom(marker: StreamMarker): number {
		return this.start + this.position - marker.getAbsoluteOffset();
	}

	/**
	 * Gets the number of bytes between the current position and the end of the window.
	 *
	 * @returns The number of bytes, which is negative if the position has been moved past the end.
	 * @example
	 * const remainingLength = stream.remainingLength();
	 */
	public remainingLength(): number {
		return this.end - this.start - this.position;
	}

	/**
	 * Sets the byte order of multi-byte numbers.
	 *
	 * @param bigEndian - Whether they're big-endian (rather than little-endian).
	 * @example
	 * stream.setBigEndian(true);
	 */
	public setBigEndian(bigEndian: boolean): void {
		this.littleEndian = !bigEndian;
	}

	/**
	 * Moves the current position forward.
	 *
	 * @param amount - The number of bytes to move it by.
	 * @example
	 * stream.skip(length);
	 */
	public skip(amount: number): void {
		this.position += amount;
	}

	/**
	 * Opens a stream on part of the byte array, with this stream's current byte order.
	 *
	 * @param start - The start of the new stream's window, relative to the start of the byte array.
	 * @param length - The length of the new stream's window, which runs to the end of this stream's by default.
	 * @returns A stream on that window.
	 * @example
	 * const branch = stream.branch(offset, length);
	 */
	private open(start: number, length = this.end - start): ByteStream {
		return new ByteStream(this.bytes, { bigEndian: !this.littleEndian, length, start });
	}
}

export { ByteStream };
export type { ByteStreamWindow, StreamMarker };
