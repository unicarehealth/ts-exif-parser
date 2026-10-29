/**
 * The [ESLint](https://eslint.org/) configuration for this project.
 *
 * @module
 */

import { defineConfig } from 'eslint/config';

import { createConfig, SOURCE_FILE_GLOBS, TYPESCRIPT_FILE_GLOBS } from '@unicarehealth/eslint-config';

/**
 * The types that `typescript/prefer-readonly-parameter-types` accepts as they are.
 *
 * @remarks
 * The parser reads byte arrays through streams that keep their position, so these can't be readonly, and
 * `ExifData` holds the tags, which callers may change, as the original package allowed.
 */
const MUTABLE_PARAMETER_TYPES = [
	{ from: 'file', name: ['ByteStream', 'ExifData', 'StreamMarker'] },
	{ from: 'lib', name: ['ArrayBuffer', 'ArrayBufferView', 'DataView', 'Uint8Array'] },
];

/**
 * The [ESLint](https://eslint.org/) configuration for this project.
 */
export default defineConfig([
	createConfig({ rootDirectory: import.meta.dirname }),
	{
		files: SOURCE_FILE_GLOBS,
		rules: {
			// This package is MIT-licensed, so its files don't carry our proprietary copyright header.
			'sonarjs/file-header': 'off',
		},
	},
	{
		files: TYPESCRIPT_FILE_GLOBS,
		rules: {
			'typescript/prefer-readonly-parameter-types': [
				'warn',
				{
					allow: MUTABLE_PARAMETER_TYPES,
					// These repeat the shared configuration's options, which this replaces.
					ignoreInferredTypes: true,
					treatMethodsAsReadonly: true,
				},
			],
		},
	},
]);
