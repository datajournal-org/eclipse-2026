import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * The real maplibre-gl is a large WebGL bundle, and importing it under jsdom is both slow and
 * pointless — what this module actually does is import it once and register a worker URL. So the
 * import itself is mocked and the test checks the wiring, not maplibre.
 *
 * The regression this guards against (a worker URL that 404s in the production build, leaving every
 * vector map stuck loading) is ultimately proven by the B3 Playwright spec — see tests/b3-skyview.spec.ts.
 */
const setWorkerUrl = vi.fn();
vi.mock('maplibre-gl', () => ({ setWorkerUrl, default: { setWorkerUrl } }));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url', () => ({ default: '/assets/maplibre-worker-abc123.js' }));

beforeEach(() => {
	vi.resetModules();
	setWorkerUrl.mockClear();
});

describe('loadMaplibre', () => {
	it('resolves to the maplibre module', async () => {
		const { loadMaplibre } = await import('./maplibre');
		const mod = await loadMaplibre();
		expect(mod.setWorkerUrl).toBe(setWorkerUrl);
	});

	it('returns the same module on repeated calls', async () => {
		const { loadMaplibre } = await import('./maplibre');
		expect(await loadMaplibre()).toBe(await loadMaplibre());
	});

	it('configures the worker at most once', async () => {
		// `configured` is module state; a second call must not re-register (maplibre warns, and in some
		// versions throws, once a map already exists).
		const { loadMaplibre } = await import('./maplibre');
		await loadMaplibre();
		await loadMaplibre();
		await loadMaplibre();
		expect(setWorkerUrl.mock.calls.length).toBeLessThanOrEqual(1);
	});

	it('leaves the worker URL to maplibre in dev', async () => {
		// In dev Vite serves the worker as an ES module, which maplibre would load as a classic worker
		// and choke on ("Cannot use import statement outside a module").
		vi.stubEnv('PROD', false);
		const { loadMaplibre } = await import('./maplibre');
		await loadMaplibre();
		expect(setWorkerUrl).not.toHaveBeenCalled();
		vi.unstubAllEnvs();
	});

	it('registers the bundled worker URL in the production build', async () => {
		vi.stubEnv('PROD', true);
		vi.resetModules();
		const { loadMaplibre } = await import('./maplibre');
		await loadMaplibre();
		expect(setWorkerUrl).toHaveBeenCalledWith('/assets/maplibre-worker-abc123.js');
		vi.unstubAllEnvs();
	});
});
