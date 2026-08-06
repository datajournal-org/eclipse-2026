/// <reference types="vitest/config" />
import { existsSync, readFileSync } from 'node:fs';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

/**
 * HTTPS for the dev server, opt-in via `npm run dev:https`.
 *
 * `navigator.geolocation` needs a secure context. Browsers treat localhost as secure but NOT a LAN
 * hostname over plain http, so the GPS button in the location dialog cannot be exercised on a phone
 * without this. It stays opt-in because everything else works over http and a certificate is one more
 * thing to go wrong. Run `npm run cert` first; see scripts/dev-cert.sh.
 */
const devHttps = () => {
	if (!process.env.DEV_HTTPS) return undefined;
	const key = '.cert/dev-key.pem';
	const cert = '.cert/dev.pem';
	if (!existsSync(key) || !existsSync(cert)) {
		throw new Error('DEV_HTTPS is set but .cert is missing — run `npm run cert` first.');
	}
	return { key: readFileSync(key), cert: readFileSync(cert) };
};

export default defineConfig({
	plugins: [sveltekit()],
	// maplibre-gl loads its Web Worker as a sibling file (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`).
	// If Vite pre-bundles maplibre into .vite/deps, that sibling isn't copied there → the worker 404s in dev
	// and vector maps (B3) never load. Excluding it makes Vite serve maplibre from node_modules, where the
	// worker resolves. (The production build is handled separately via setWorkerUrl in $lib/maplibre.ts.)
	optimizeDeps: { exclude: ['maplibre-gl'] },
	server: {
		// Bind every interface so a phone on the same Wi-Fi can reach the dev server; by default Vite
		// listens on loopback only, which looks exactly like the machine being unreachable.
		host: true,
		https: devHttps(),
		// Vite rejects requests whose Host header it does not recognise (DNS-rebinding protection), which
		// includes this Mac's own mDNS name. Allowing the .local suffix covers any machine's Bonjour name
		// without hardcoding one, and stays narrow: it does not open the dev server to public DNS names.
		allowedHosts: ['.local']
	},
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
				'src/lib/shadow-globe/corridor.generated.ts', // generated at build time
				'src/lib/data/timezones.generated.ts' // generated at build time
			],
			reporter: ['text', 'html'],
			// Set just under what the suite actually achieves, so a real regression fails but ordinary
			// churn does not. The gap to 100 % is mostly SSR-only guards (`if (!browser) return`) and
			// WebGL error paths that only a GPU can reach — those are Playwright's job.
			thresholds: { statements: 97, branches: 85, functions: 97, lines: 98 }
		}
	}
});
