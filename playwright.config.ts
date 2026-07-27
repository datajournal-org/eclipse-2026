import { defineConfig, devices } from '@playwright/test';

// Static SvelteKit app (adapter-static) → test against the production build served by `vite preview`,
// so the tests exercise exactly what gets deployed.
//
// Projects: chromium desktop carries the whole suite; mobile and webkit cover the layout, <dialog> and
// Intl differences. Specs tagged @webgl run on chromium only — headless WebKit's software GL is not
// worth the flake. Specs tagged @live hit the real geocoder and are excluded unless PWLIVE is set,
// so an upstream API change shows up in a nightly run rather than as a red PR.
export default defineConfig({
	testDir: 'tests',
	// File-level parallelism only. With fullyParallel the WebGL specs run several software-GL contexts
	// at once and starve each other — B3 then never reaches `idle` inside the timeout.
	fullyParallel: false,
	// WebGL specs build a terrain scene under software GL; B3 reaches `idle` in ~10 s locally.
	timeout: 90_000,
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
		trace: 'retain-on-failure',
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
				// MapLibre needs a WebGL context; enable software GL so headless Chromium can create one.
				launchOptions: { args: ['--enable-unsafe-swiftshader'] }
			}
		},
		{
			name: 'mobile',
			grep: /@mobile/,
			use: {
				...devices['Pixel 7'],
				launchOptions: { args: ['--enable-unsafe-swiftshader'] }
			}
		},
		{
			// WebKit's headless GL cannot be relied on, so it skips the GPU specs.
			name: 'webkit',
			grepInvert: /@webgl/,
			use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }
		},
		{
			// One English run in a US timezone: locale detection and every formatted time take a
			// different path, and a tester outside Europe should not see a red suite.
			name: 'chromium-en',
			grep: /@i18n/,
			use: {
				...devices['Desktop Chrome'],
				viewport: { width: 1440, height: 900 },
				locale: 'en-GB',
				timezoneId: 'America/New_York',
				launchOptions: { args: ['--enable-unsafe-swiftshader'] }
			}
		}
	]
});
