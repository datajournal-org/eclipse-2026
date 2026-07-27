import js from '@eslint/js';
import ts from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import svelteConfig from './svelte.config.js';

export default ts.config(
	// Not linted: build output, SvelteKit cache, test artefacts, and the generated corridor data.
	{
		ignores: [
			'.svelte-kit/',
			'build/',
			'coverage/',
			'test-results/',
			'playwright-report/',
			'src/lib/shadow-globe/corridor.generated.ts'
		]
	},

	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs.recommended,

	// Prettier owns formatting — disable ESLint rules that would conflict with it.
	prettier,
	...svelte.configs.prettier,

	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		// .svelte files: parse the `<script lang="ts">` with the TS parser and hand ESLint the Svelte config.
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: { parser: ts.parser, svelteConfig }
		}
	}
);
