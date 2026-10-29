# Changelog

## 1.0.0

The first release of the fork, as `@unicarehealth/ts-exif-parser`. It reads the
same tags, image sizes and thumbnails as `ts-exif-parser` 0.2.3 from the sample
images, apart from the fixes below.

### Breaking changes

- The package is an ES module only (no CommonJS or UMD bundle), for ES2024 and
  later.
- `ExifParserFactory.create` takes any `ArrayBuffer`, typed array (including a
  Node.js `Buffer`) or `DataView`, and no longer takes a `global` argument. It
  no longer uses `eval` to find the global object.
- Binary tag values and `getThumbnailBuffer()` are always `ArrayBuffer`s, even
  for a Node.js `Buffer`, and strings are always read as one character per
  byte.
- The `ExifData` constructor takes a single object. The parser creates it, so
  this only matters to code that created one itself.
- `getThumbnailOffset()`, `getThumbnailLength()` and `getThumbnailBuffer()`
  throw if there's no thumbnail, instead of returning `NaN`, `undefined` or
  garbage.
- `thumbnailType` is only set for the known formats (`ThumbnailTypes`).
- Tags with the invalid format 0 have an empty array as their value, instead of
  `undefined`.
- `XMPReader`, which wasn't exported, and its dependency on `sax` are removed.

### Fixes

- Signed 16-bit and 32-bit values (the `SSHORT` and `SLONG` formats) are read as
  signed.
- Time zone offsets with minutes (e.g., `+09:30` or `-08:30`) are applied with
  the right sign.
- With tag names disabled, GPS coordinates and dates are simplified (they
  weren't), and tags in the Exif sub-IFD have the `SubIFD` section (they had
  `InteropIFD`).
- `ResolutionUnit` is typed as a number, from
  [bpatrik/ts-exif-parser#6](https://github.com/bpatrik/ts-exif-parser/pull/6)
  by Slobodan Babic.

### Other changes

- The source has been rewritten in strict TypeScript, and is linted with
  `@unicarehealth/eslint-config`.
- The build, tests and release scripts use Bun, and the tests cover every line.
