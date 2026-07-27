// Approximates a GPU-less Linux runner: no `channel: 'chromium'`, so Chromium falls back to the
// headless shell + SwiftShader, plus CI's worker count.
import { defineConfig, devices } from '@playwright/test';
const shell = { launchOptions: { args: ['--enable-unsafe-swiftshader'] } };
export default defineConfig({
	testDir: 'tests',
	fullyParallel: false,
	workers: 2,
	timeout: 150_000,
	grepInvert: /@live/,
	reporter: [['json', { outputFile: process.env.OUT ?? '/tmp/shard.json' }]],
	webServer: { command: 'npm run build && npm run preview -- --port 4173', port: 4173, reuseExistingServer: true, timeout: 180_000 },
	use: { baseURL: 'http://localhost:4173', locale: 'de-DE', timezoneId: 'Europe/Berlin', permissions: [], trace: 'off' },
	projects: [
		{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, ...shell } },
		{ name: 'mobile', grep: /@mobile/, use: { ...devices['Pixel 7'], ...shell } },
		{
			name: 'webkit',
			grepInvert: /@webgl|@live/,
			testIgnore: ['**/seo.spec.ts', '**/b1-verdict.spec.ts', '**/location-search.spec.ts', '**/privacy.spec.ts', '**/state-a.spec.ts'],
			use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } }
		},
		{ name: 'chromium-en', grep: /@i18n/, testIgnore: '**/seo.spec.ts', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, locale: 'en-GB', timezoneId: 'America/New_York', ...shell } }
	]
});
