import { defineConfig, devices } from '@playwright/test';

// Static SvelteKit app (adapter-static) → test against the production build served by `vite preview`,
// so the tests exercise exactly what gets deployed.
//
// Projects: chromium desktop carries the whole suite; mobile and webkit cover the layout, <dialog> and
// Intl differences. Specs tagged @webgl run on chromium only — headless WebKit's software GL is not
// worth the flake. Specs tagged @live hit the real geocoder and are excluded unless PWLIVE is set,
// so an upstream API change shows up in a nightly run rather than as a red PR.
/**
 * Real GPU for the WebGL specs.
 *
 * Playwright's default headless chromium is `chrome-headless-shell`, which ships no GPU stack at all — so
 * MapLibre could only get a context through SwiftShader, rasterising B3's terrain scene on the CPU.
 * `channel: 'chromium'` launches the full binary in new-headless mode, which reaches the real device:
 * measured on an M4 Pro, B3 goes from ~19-23 s to ~1.4 s to reach `idle`.
 *
 * `--enable-unsafe-swiftshader` stays as a FALLBACK, not a preference: with a GPU present Chromium still
 * picks it (verified — the renderer string stays "ANGLE Metal Renderer"), and without one, as on a
 * typical Linux CI runner, it is what keeps WebGL available at all. `--use-angle=metal` was measured and
 * made no difference, so it is deliberately absent.
 */
const GPU = {
	channel: 'chromium',
	launchOptions: { args: ['--enable-unsafe-swiftshader'] }
} as const;

export default defineConfig({
	testDir: 'tests',
	// File-level parallelism only. The worker cap is about GL contention, which now only bites where
	// there is no GPU: a CI runner falls back to SwiftShader, and concurrent software contexts starve
	// each other badly enough that B3 never reaches `idle`. Locally the GPU handles the load, so the
	// default worker count is fine.
	fullyParallel: false,
	workers: process.env.CI ? 2 : undefined,
	// One number for the whole suite — no per-test overrides, which only ever drifted away from reality.
	// Locally the slowest test is ~8 s (GPU, warm tile cache), so 30 s is ~4x headroom: enough to ride out
	// a busy machine, tight enough that a genuine hang is reported in seconds rather than minutes.
	//
	// CI is a different world: no GPU, so B3's terrain scene is rasterised on the CPU by SwiftShader, and
	// on a two-core runner that took longer than 60 s just to reach `idle`. This has to stay above the
	// mapReady budget in tests/fixtures.ts so the map's own wait is what reports the failure.
	timeout: process.env.CI ? 300_000 : 30_000,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	grepInvert: process.env.PWLIVE ? undefined : /@live/,
	reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	},
	use: {
		baseURL: 'http://localhost:4173',
		locale: 'de-DE', // → the app resolves to the German locale, so UI text is deterministic
		timezoneId: 'Europe/Berlin', // every local time on screen depends on this
		permissions: [], // geolocation is granted per-spec, where it is the thing under test
		// `retain-on-failure` keeps a full trace for every attempt, and with retries a single broken
		// beforeAll produced a 213 MB artifact. The first retry is enough to debug from.
		trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	expect: {
		// GPU rasterisation differs between machines; the few screenshots we keep need slack.
		toHaveScreenshot: { maxDiffPixelRatio: 0.02 }
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				...GPU
			}
		},
		{
			name: 'mobile',
			grep: /@mobile/,
			// seo.spec.ts fetches raw HTML and never opens a page, so it only needs to run once —
			// chromium carries it.
			testIgnore: '**/seo.spec.ts',

			use: { ...devices['Pixel 7'], ...GPU }
		},
		{
			// WebKit's headless GL cannot be relied on, so it skips the GPU specs. @live has to be repeated
			// here: a project-level grepInvert REPLACES the top-level one rather than adding to it, so
			// listing only /@webgl/ silently let the live-network specs run on this project.
			name: 'webkit',
			grepInvert: process.env.PWLIVE ? /@webgl/ : /@webgl|@live/,
			// WebKit runs what the ENGINE can plausibly break, not a second copy of everything. The test
			// for each file is whether it exercises browser-provided behaviour or our own JavaScript.
			//
			// Kept, and why: location-dialog (<dialog>, focus trap, backdrop), responsive (layout),
			// i18n (Intl formatting), a11y (focus, keyboard, contrast), countdown (tabular-figure metrics
			// are font rendering), b6-checklist (download handling differs by engine), location-gps
			// (the geolocation permission model differs), root-redirect (hand-written ES5 running before
			// the bundle, plus navigator.languages and location.replace), shell (does it boot at all).
			//
			// Dropped below: pure app logic that a second engine cannot fail differently — astronomy
			// rendered as text, a debounce over stubbed JSON, the localStorage/URL contract, section
			// presence. All of it is covered on chromium.
			testIgnore: [
				'**/seo.spec.ts', // fetches raw HTML, never opens a page — chromium carries it
				'**/b1-verdict.spec.ts',
				'**/location-search.spec.ts',
				'**/privacy.spec.ts',
				'**/state-a.spec.ts'
			],

			use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }
		},
		{
			// One English run in a US timezone: locale detection and every formatted time take a
			// different path, and a tester outside Europe should not see a red suite.
			name: 'chromium-en',
			grep: /@i18n/,
			// seo.spec.ts fetches raw HTML and never opens a page, so it only needs to run once —
			// chromium carries it.
			testIgnore: '**/seo.spec.ts',

			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				locale: 'en-GB',
				timezoneId: 'America/New_York',
				...GPU
			}
		}
	]
});
