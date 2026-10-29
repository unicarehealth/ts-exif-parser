# ts-exif-parser

Reads [Exif](https://en.wikipedia.org/wiki/Exif) metadata from JPEG images, in
[Node.js](https://nodejs.org/), [Bun](https://bun.sh/), browsers and
[NetSuite](https://www.netsuite.com/) SuiteScript. It has no dependencies.

This is [Unicare Health](https://unicare.au/)'s fork of
[`ts-exif-parser`](https://github.com/bpatrik/ts-exif-parser) by Patrik J.
Braun, which is based on
[`exif-parser`](https://github.com/bwindels/exif-parser) by Bruno Windels. The
original package hasn't been updated since 2022. The fork is published as
`@unicarehealth/ts-exif-parser` on
[our Verdaccio instance](https://npm.unicarehealth.com.au/). See the
[changelog](CHANGELOG.md) for how it differs from the original.

## Installation

Configure your package manager to use our Verdaccio instance for the
`@unicarehealth` scope, and then install the package:

```sh
bun add @unicarehealth/ts-exif-parser
```

## Usage

```ts
import { ExifParserFactory, OrientationTypes } from '@unicarehealth/ts-exif-parser';

const data = ExifParserFactory.create(bytes).parse();
const isRotated = (data.tags.Orientation ?? OrientationTypes.TOP_LEFT) >= OrientationTypes.LEFT_TOP;
```

`bytes` can be an `ArrayBuffer`, any typed array (including a Node.js
`Buffer`), or a `DataView`. It doesn't have to be the whole image: the Exif
data is in a section of at most 64 KiB near the start of the file, so the first
64 KiB or so are usually enough.

`parse()` throws a `RangeError` if the Exif data is truncated or malformed, and
an `Error` if a tag has an unknown format. Sections that aren't Exif data (or
have invalid headers) are ignored.

### Options

Set these before calling `parse()`. Each returns the parser, so they can be
chained.

| Method | Default | What it does |
| --- | --- | --- |
| `enableBinaryFields(enable)` | `false` | Reads tags in the undefined format (mostly internal data, such as `Padding`) as `ArrayBuffer`s. |
| `enablePointers(enable)` | `false` | Returns the tags that point to the embedded thumbnail. The tags that point to other directories are never returned. |
| `enableTagNames(enable)` | `true` | Returns the tags as an object keyed by tag name. When disabled, `tags` is an array of `{ section, type, value }` (`ExifTagEntry`) instead. |
| `enableImageSize(enable)` | `true` | Reads the image's size from its start of frame section. |
| `enableReturnTags(enable)` | `true` | Returns the tags at all. The thumbnail is still found when this is disabled. |
| `enableSimpleValues(enable)` | `true` | Converts rationals to numbers, lists of one value to that value, GPS coordinates to signed degrees, and dates to timestamps in seconds since the Unix epoch. |

### Results

- `data.tags` holds the tags (see `enableTagNames`). The `ExifTags` type lists
  the known tags, but its value types are only approximate.
- `data.getImageSize()` returns `{ width, height }` from the start of frame
  section, if there is one.
- `data.hasThumbnail()` checks for an embedded thumbnail, and
  `data.hasThumbnail('image/jpeg')` (or `'image/tiff'`) checks for one in that
  format.
- `data.getThumbnailBuffer()` returns a copy of the thumbnail's bytes,
  `data.getThumbnailSize()` its size (for a JPEG thumbnail), and
  `data.getThumbnailOffset()` and `data.getThumbnailLength()` where it is in the
  image. These throw if there's no thumbnail.

## Development

This project uses [Bun](https://bun.sh/) (the version in `packageManager` in
`package.json`).

- `bun install` installs the dependencies, from our Verdaccio instance.
- `bun run lint` checks the types (with
  [TypeScript](https://www.typescriptlang.org/) 7) and runs
  [ESLint](https://eslint.org/) (with `@unicarehealth/eslint-config`) and
  [npm-package-json-lint](https://npmpackagejsonlint.org/). There must be no
  warnings.
- `bun run test` runs the tests, which must cover every line. The snapshots in
  `test/__snapshots__` record what the parser reads from each sample image in
  `test/fixtures`. Update them with `bun test --update-snapshots`, and check that
  the changes are the ones you intended.
- `bun run build` builds the package into `dist`: an ES module bundle for
  ES2024 and later, and type declarations.

To release a version, run `bun run release-patch`, `bun run release-minor` or
`bun run release-major`. Each lints and tests the package, sets the version
(committing and tagging it), builds and publishes it, and pushes the commit and
tag. Add the version's changes to the [changelog](CHANGELOG.md) first.

## Licence

[MIT](LICENSE.md), as the original package is.
