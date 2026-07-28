/**
 * Post-build: inject a `<link rel="modulepreload">` for the MapLibre chunk into every prerendered page.
 *
 * MapLibre is dynamically imported on purpose (its ~1 MB must not block hydration), but the A2 globe sits
 * at the top of every page, so the import always fires — after HTML → app → page chunk → import(), a
 * four-hop waterfall. SvelteKit only emits modulepreload links for statically imported chunks, so the
 * dynamic one is announced here instead: the browser starts fetching it during HTML parse, in parallel
 * with hydration, and the eventual import() resolves from cache.
 *
 * Runs as part of `npm run build` (see package.json). Fails loudly if the chunk cannot be found in the
 * Vite manifest — a silently missing preload would just quietly restore the waterfall.
 */
import { globSync, readFileSync, writeFileSync } from 'node:fs';

const MANIFEST = '.svelte-kit/output/client/.vite/manifest.json';

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as Record<
	string,
	{ file: string; isDynamicEntry?: boolean }
>;
const entry = Object.entries(manifest).find(([key]) => key.includes('node_modules/maplibre-gl/'));
if (!entry) {
	console.error('[preload] maplibre-gl not found in the client manifest — did the import move?');
	process.exit(1);
}
const chunk = entry[1].file; // e.g. _app/immutable/chunks/<hash>.js

// Both artifacts: build/ is what deploys; .svelte-kit/output/prerendered is what `vite preview` — and
// with it the whole Playwright suite — actually serves. Patching only the first made the e2e contract
// test fail against pages that looked correct on disk.
const pages = [...globSync('build/**/index.html'), ...globSync('.svelte-kit/output/prerendered/pages/**/*.html')];
if (pages.length === 0) {
	console.error('[preload] no prerendered pages found — run this after `vite build`.');
	process.exit(1);
}

let injected = 0;
for (const page of pages) {
	const html = readFileSync(page, 'utf8');
	// Reuse the base path the page already uses for its own module links, so a base change cannot desync.
	const base = html.match(/href="([^"]*)\/_app\/immutable\//)?.[1];
	if (base === undefined) continue; // a page without module links has nothing to speed up
	const link = `<link rel="modulepreload" href="${base}/_app/immutable/${chunk.replace('_app/immutable/', '')}">`;
	if (html.includes(link)) continue; // idempotent
	writeFileSync(page, html.replace('</head>', `\t\t${link}\n\t</head>`));
	injected++;
}
console.log(`[preload] ${chunk} modulepreloaded in ${injected}/${pages.length} pages`);
