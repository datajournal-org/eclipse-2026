import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// maplibre-gl loads its Web Worker as a sibling file (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`).
	// If Vite pre-bundles maplibre into .vite/deps, that sibling isn't copied there → the worker 404s in dev
	// and vector maps (B3) never load. Excluding it makes Vite serve maplibre from node_modules, where the
	// worker resolves. (The production build is handled separately via setWorkerUrl in $lib/maplibre.ts.)
	optimizeDeps: { exclude: ['maplibre-gl'] },
	test: {
		// Two projects, because the codebase has two kinds of module: pure maths (node environment — fastest,
		// and a failure there proves a module reached for the DOM by accident) and modules that need a
		// document/localStorage. The jsdom environment also flips `browser` in `$app/environment` to true,
		// without which the interesting branches of stores/location and i18n are dead code.
		projects: [
			{
				extends: true,
				test: {
					name: 'node',
					environment: 'node',
					include: ['src/**/*.test.ts'],
					exclude: ['src/**/*.dom.test.ts']
				}
			},
			{
				extends: true,
				// `$app/environment`'s `browser` is esm-env's BROWSER, picked by export condition. Vitest
				// transforms through Vite's SSR pipeline even for jsdom, so the condition has to be forced
				// here — otherwise `browser` is false and location/i18n behave as during prerender.
				ssr: { resolve: { conditions: ['browser'] } },
				resolve: { conditions: ['browser'] },
				test: {
					name: 'jsdom',
					environment: 'jsdom',
					include: ['src/**/*.dom.test.ts']
				}
			}
		],
		coverage: {
			provider: 'v8',
			include: ['src/lib/**/*.ts'],
			exclude: [
				'src/lib/**/*.test.ts',
				'src/lib/testing/**', // test-only helpers
				'src/lib/shadow-globe/corridor.generated.ts' // generated at build time
			],
			reporter: ['text', 'html'],
			// Set just under what the suite actually achieves, so a real regression fails but ordinary
			// churn does not. The gap to 100 % is mostly SSR-only guards (`if (!browser) return`) and
			// WebGL error paths that only a GPU can reach — those are Playwright's job.
			thresholds: { statements: 97, branches: 85, functions: 97, lines: 98 }
		}
	}
});
