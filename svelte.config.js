import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// Fully static build for bunny.net. Every route is prerendered (the root plus one page per
		// language), so there is no SPA fallback: it would answer unknown URLs with HTTP 200, which
		// search engines read as a soft 404. Query-param state (?lat=&lon=) needs no fallback — it is a
		// query string on a route that exists.
		adapter: adapter({ fallback: undefined, precompress: false }),
		// Deployed under https://datajournal.org/eclipse-2026/ — every asset and link carries the prefix.
		// `relative: false` because the canonical and hreflang URLs are absolute: with SvelteKit's default
		// relative paths, `base` renders as `..` during prerendering and those tags come out malformed.
		paths: { base: '/eclipse-2026', relative: false },
		prerender: { handleHttpError: 'warn' }
	}
};
