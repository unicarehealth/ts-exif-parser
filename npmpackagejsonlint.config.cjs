/**
 * The [npm-package-json-lint](https://npmpackagejsonlint.org/) configuration.
 *
 * @module
 * @remarks
 * This extends our shared configuration. Rules here replace the shared ones, including their options, so
 * they repeat any exceptions from the shared configuration that this project still needs.
 */

/*
 * These are npm package namespaces, and the original author's surname.
 * cspell:ignore unicarehealth Windels
 */

'use strict';

module.exports = {
	extends: '@unicarehealth/npm-package-json-lint-config',
	rules: {
		'prefer-caret-version-devDependencies': [
			'warning',
			{
				exceptions: [
					/*
					 * Minor releases of these packages may add warnings, so this project,
					 * which treats warnings as errors, uses tilde ranges for them.
					 */
					'@unicarehealth/eslint-config',
					'@unicarehealth/npm-package-json-lint-config',
					/*
					 * These are npm aliases for TypeScript 6 and 7, whose ranges the
					 * README of @unicarehealth/eslint-config gives.
					 */
					'@typescript/native',
					'typescript',
				],
			},
		],
		// This is a fork of an open-source package, so it keeps its original author.
		'valid-values-author': [
			'warning',
			[
				'Bruno Windels',
			],
		],
		// This is a fork of an MIT-licensed package, so it keeps that licence.
		'valid-values-license': [
			'warning',
			['MIT'],
		],
	},
};
