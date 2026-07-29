import { test as base, expect, type Browser, type BrowserContext, type Page, type Locator } from '@playwright/test';
import { installTileCache } from './tileCache';
import { REFERENCE, GREATEST, byName, type ReferenceSite } from '../src/lib/testing/reference';

export { expect, REFERENCE, GREATEST, byName };
export type { ReferenceSite };

const GEOCODER = 'https://geocode.versatiles.org/**';
const STORAGE_KEY = 'eclipse.location';

/** kit.paths.base — the site is deployed under https://datajournal.org/eclipse-2026/. */
export const BASE = '/eclipse-2026';
/** The language every spec uses unless it is specifically about language selection. */
export const LANG = 'de';

/**
 * Every language the site ships, pinned HERE rather than imported from $lib/i18n — deliberately. This is
 * the test suite's independent statement of what the product offers: if a language is accidentally
 * dropped from the app's registry, specs iterating this list fail loudly instead of silently adapting.
 * Adding a language therefore means extending this pin too — that is the review moment, not a chore.
 */
export const ALL_LANGS = ['de', 'en', 'es', 'fr', 'nl', 'pt'] as const;

/** URL of a language's page, with optional query. */
export const localeUrl = (lang = LANG, query = '') => `${BASE}/${lang}/${query}`;

/** Recorded-shape Photon responses, so the dialog's parsing is exercised without the network. */
export const PHOTON = {
	oviedo: {
		features: [
			{
				geometry: { type: 'Point', coordinates: [-5.8448, 43.3603] },
				properties: { name: 'Oviedo', city: 'Oviedo', state: 'Asturias', country: 'España' }
			},
			{
				geometry: { type: 'Point', coordinates: [-5.85, 43.36] },
				properties: { street: 'Calle Uría', housenumber: '10', city: 'Oviedo', country: 'España' }
			}
		]
	},
	bare: {
		features: [{ geometry: { type: 'Point', coordinates: [13.405, 52.52] }, properties: { name: 'Berlin' } }]
	},
	empty: { features: [] }
};

type Fixtures = {
	/** Serves tiles.versatiles.org from an on-disk cache. Automatic — see tileCache.ts for why. */
	tileCache: void;
	/**
	 * The geocoder, stubbed. Installed automatically for every test — leaving it opt-in meant the
	 * no-network property held only as long as each new spec remembered to ask for it. Specs still call
	 * it to choose a different body or status. Tests tagged `@live` get the real service instead.
	 */
	stubGeocoder: (body?: unknown, status?: number, delayMs?: number) => Promise<void>;
	/** Load a language's page with a location already chosen, via the ?lat&lon debug override. */
	locatedPage: (site: { lat: number; lon: number; name?: string }, lang?: string) => Promise<void>;
	/** Load the app with a location seeded into localStorage instead of the URL. */
	storedPage: (site: { lat: number; lon: number; name?: string }) => Promise<void>;
	/** Console errors and failed requests collected over the whole test. */
	pageProblems: { errors: string[]; failedRequests: string[] };
};

export const test = base.extend<Fixtures>({
	// `auto` so no spec has to remember it: the point is that the whole suite stops re-downloading the
	// same tiles. Installed on the context, so page-level routes in specs still take precedence.
	tileCache: [
		async ({ context }, use) => {
			await installTileCache(context);
			await use();
		},
		{ auto: true }
	],

	stubGeocoder: [
		async ({ context }, use, testInfo) => {
			// @live tests exercise the real Photon instance; anything else must not touch it.
			if (testInfo.tags.includes('@live')) {
				await use(async () => {});
				return;
			}
			await use(await stubGeocoderOn(context));
		},
		{ auto: true }
	],

	locatedPage: async ({ page, stubGeocoder }, use) => {
		await stubGeocoder();
		await use(async (site, lang = LANG) => {
			const name = site.name ? `&name=${encodeURIComponent(site.name)}` : '';
			await page.goto(localeUrl(lang, `?lat=${site.lat}&lon=${site.lon}${name}`));
			// The B sections exist only once hydration has read the location out of the URL. Several
			// specs then inspect the page with reads that do NOT auto-retry — `page.evaluate`, `count()`,
			// `allInnerTexts()` — unlike `expect(locator)`. Waiting here fixes the whole class centrally
			// instead of leaving each spec to race hydration on a slow or loaded machine.
			await page.locator('section.b1').waitFor({ state: 'visible' });
		});
	},

	storedPage: async ({ page, stubGeocoder }, use) => {
		await stubGeocoder();
		await use(async (site) => {
			await page.addInitScript(([key, value]) => window.localStorage.setItem(key as string, value as string), [
				STORAGE_KEY,
				JSON.stringify({ lat: site.lat, lon: site.lon, name: site.name ?? null })
			] as const);
			await page.goto(localeUrl());
		});
	},

	pageProblems: async ({ page }, use) => {
		const problems = { errors: [] as string[], failedRequests: [] as string[] };
		page.on('console', (msg) => {
			if (msg.type() === 'error') problems.errors.push(msg.text());
		});
		page.on('pageerror', (err) => problems.errors.push(String(err)));
		page.on('requestfailed', (req) => {
			// Aborted routes and tile fetches cancelled on navigation are noise, not failures.
			const failure = req.failure()?.errorText ?? '';
			if (!failure.includes('ERR_ABORTED')) problems.failedRequests.push(`${req.url()} — ${failure}`);
		});
		await use(problems);
	}
});

// --- helpers ---

/**
 * Install the geocoder stub on a context and return the setter that changes what it answers. Shared by
 * the auto fixture and by `openSharedPage`, which builds its own context and so misses the fixture.
 */
export async function stubGeocoderOn(context: BrowserContext) {
	let body: unknown = PHOTON.oviedo;
	let status = 200;
	let delayMs = 0;
	await context.route(GEOCODER, async (route) => {
		// An optional delay lets a spec stage the "response lands after the user moved on" races that an
		// instant stub can never reproduce.
		if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
		await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
	});
	return async (nextBody: unknown = PHOTON.oviedo, nextStatus = 200, nextDelayMs = 0) => {
		body = nextBody;
		status = nextStatus;
		delayMs = nextDelayMs;
	};
}

/**
 * One page shared by every test in a file, for the map-heavy specs.
 *
 * Building a MapLibre scene costs ~2 s, and these files each drive the *same* scene from many angles —
 * paying that per test was ~75 % of their runtime. The page is created once in `beforeAll`; each test
 * resets whatever it might have disturbed (camera pose, slider frame) in `beforeEach`, and the file runs
 * in `serial` mode so a failure does not leave the next test looking at unexplained state.
 *
 * The trade-off is real: tests in these files are no longer independent, and a failure part-way through
 * makes the ones after it harder to read. It is worth it only where setup dominates, which is why the
 * cheap specs still get a fresh page each.
 */
export async function openSharedPage(browser: Browser, path: string) {
	const context = await browser.newContext();
	await installTileCache(context);
	await stubGeocoderOn(context);
	const page = await context.newPage();
	await page.goto(path);
	return page;
}

/**
 * A shared page with a location already chosen — `openSharedPage` through the same `?lat&lon&name`
 * debug override and hydration wait that the per-test `locatedPage` fixture uses, for serial groups
 * of READ-ONLY tests that all inspect the same located state (a11y, verdict, checklist, segments).
 */
export async function openSharedLocatedPage(
	browser: Browser,
	site: { lat: number; lon: number; name?: string },
	lang = LANG
) {
	const name = site.name ? `&name=${encodeURIComponent(site.name)}` : '';
	const page = await openSharedPage(browser, localeUrl(lang, `?lat=${site.lat}&lon=${site.lon}${name}`));
	await page.locator('section.b1').waitFor({ state: 'visible' });
	return page;
}

/**
 * Wait for a section's MapLibre instance to reach `idle` (the data-map-ready hook in the components).
 *
 * The budget has to be CI-aware. A GPU-less runner rasterises B3's terrain scene on the CPU, and a
 * hardcoded 60 s was the constraint that actually failed the first CI run — not the per-test timeout,
 * which was two and a half times larger and never came into play. Keep this comfortably BELOW the test
 * timeout in playwright.config.ts, so a slow scene reports "the map never became ready" rather than the
 * far less useful "test timed out".
 */
export async function mapReady(page: Page, selector: string, timeout = process.env.CI ? 180_000 : 60_000) {
	await expect(page.locator(`${selector} [data-map-ready="true"]`)).toBeAttached({ timeout });
}

/**
 * Switch the page language through the header's disclosure menu (summary opens, then a real link
 * navigates). Selecting by `hreflang` keeps specs independent of the links' translated labels.
 */
export async function switchLanguage(page: Page, lang: string) {
	await page.locator('header.hdr .langs summary').click();
	await page.locator(`header.hdr .langs a[hreflang="${lang}"]`).click();
}

/** The scrubber slider inside a section. */
export const slider = (page: Page, section: string): Locator => page.locator(`${section} input[type="range"]`);

/** Move a slider to a frame and let the app render it. */
export async function setFrame(page: Page, section: string, frame: number) {
	await slider(page, section).evaluate((el, value) => {
		(el as HTMLInputElement).value = String(value);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, frame);
	await page.waitForTimeout(80);
}

/** A slider's maximum frame index. */
export async function maxFrame(page: Page, section: string): Promise<number> {
	return Number(await slider(page, section).getAttribute('max'));
}

/**
 * Freeze the clock before navigating. Offsets are relative to GREATEST ECLIPSE, which is what the
 * countdown actually targets (Countdown.svelte reads greatestEclipse().date) — not the local maximum.
 */
export async function freezeClock(page: Page, at: 'T-30d' | 'T-90s' | 'T+1h') {
	const peak = Date.parse(GREATEST.utc);
	// Deliberately round at NO unit: 30 d 5 h 30 m 30 s. An instant that is exact at any granularity makes
	// that digit flip on a millisecond of drift — first seen as a day-boundary flake, then reintroduced at
	// the hour boundary when the offset was a whole number of hours.
	const offsets = {
		'T-30d': -(30 * 86_400 + 5 * 3_600 + 30 * 60 + 30) * 1000,
		'T-90s': -90_000,
		'T+1h': 3_600_000
	};
	await page.clock.install({ time: new Date(peak + offsets[at]) });
}

/**
 * The four countdown numbers, as rendered.
 *
 * `.units` is absent from the prerendered HTML: `$now` is 0 during SSR, so `diff` is 0 and the countdown
 * renders its "happening now" branch until hydration swaps in a real clock. `allInnerTexts` takes a
 * snapshot rather than retrying, so wait for the digits to exist first.
 */
export async function countdownDigits(page: Page): Promise<string[]> {
	const digits = page.locator('section.cd .units .n');
	await digits.first().waitFor({ state: 'visible' });
	return digits.allInnerTexts();
}
