// Load maplibre-gl and point it at a Vite-bundled Web Worker.
//
// maplibre 6 builds its worker URL as `new URL(`./${name}`, import.meta.url)` where `name` is chosen at
// runtime (dev vs prod). Because the path is a variable, Vite/Rollup can't statically detect the worker,
// so the worker chunk is never emitted — the reference 404s in the production build and any vector map
// (B3, and A2 intermittently) never finishes loading. We bundle the worker ourselves via `?worker&url`
// (Vite pulls in its `maplibre-gl-shared.mjs` dependency too) and register the emitted URL with
// setWorkerUrl before any map is created.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';

let configured = false;

/** Dynamically import maplibre-gl, registering the bundled worker URL once. */
export async function loadMaplibre() {
	const mod = await import('maplibre-gl');
	if (!configured) {
		// Only override in the production build: there maplibre's own worker URL 404s (see above), and our
		// `?worker&url` worker is a self-contained bundle that loads fine. In dev, Vite serves the worker as
		// an ES module with imports, which maplibre would load as a classic worker ("Cannot use import
		// statement outside a module") — so leave dev to maplibre's own (working) worker loading.
		if (import.meta.env.PROD) mod.setWorkerUrl(workerUrl);
		configured = true;
	}
	return mod;
}
