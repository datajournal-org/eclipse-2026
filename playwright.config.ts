import { defineConfig, devices } from '@playwright/test';

// Static SvelteKit app (adapter-static) → test against the production build served by `vite preview`,
// so the tests exercise exactly what gets deployed.
export default defineConfig({
	testDir: 'tests',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	reporter: 'list',
	webServer: {
		command: 'npm run build && npm run preview -- --port 4173',
		port: 4173,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	},
	use: {
		baseURL: 'http://localhost:4173',
		locale: 'de-DE', // → the app resolves to the German locale, so UI text is deterministic
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
				// MapLibre needs a WebGL context; enable software GL so headless Chromium can create one.
				launchOptions: { args: ['--enable-unsafe-swiftshader'] }
			}
		}
	]
});
