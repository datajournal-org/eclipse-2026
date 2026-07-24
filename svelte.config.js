import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
export default {
	preprocess: vitePreprocess(),
	kit: {
		// Fully static build for bunny.net. `fallback` gives an SPA entry so client-side
		// navigations / query-param states (?lat=&lon=) resolve without server rendering.
		adapter: adapter({ fallback: '200.html', precompress: false }),
		prerender: { handleHttpError: 'warn' }
	}
};
