import { test, expect, BASE, localeUrl, ALL_LANGS } from './fixtures';

// The two network warm-ups that beat the map's load waterfall (see scripts/inject-maplibre-preload.ts
// and the head of +layout.svelte). Asserted against the PRERENDERED HTML — both only help if the browser
// sees them during HTML parse, long before any JS runs.

test.describe('resource hints', () => {
	test('preconnects to the tile server, in CORS mode', async ({ request }) => {
		// MapLibre fetches tiles with CORS; a non-crossorigin preconnect would warm a connection the
		// tile requests cannot reuse — present but useless, which no visual test would ever notice.
		const html = await (await request.get(localeUrl())).text();
		expect(html).toMatch(/<link rel="preconnect" href="https:\/\/tiles\.versatiles\.org" crossorigin/);
	});

	test('modulepreloads the MapLibre chunk it will dynamically import', async ({ request }) => {
		// SvelteKit only emits preloads for static imports; the postbuild script announces the dynamic
		// MapLibre chunk. The href must resolve — a stale hash would silently restore the four-hop
		// waterfall while everything still works.
		for (const path of ['/', ...ALL_LANGS.map((l) => `/${l}/`)].map((p) => `${BASE}${p}`)) {
			const html = await (await request.get(path)).text();
			const href = html.match(/<link rel="modulepreload" href="([^"]*)">\s*<\/head>/)?.[1];
			expect(href, `${path} carries the injected preload`).toBeTruthy();
			const res = await request.get(href!);
			expect(res.status(), `${href} resolves`).toBe(200);
			expect(await res.text()).toContain('maplibregl'); // it really is the map chunk, not a stray file
		}
	});
});
