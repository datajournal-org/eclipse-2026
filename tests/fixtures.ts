import { test as base, expect, type Page, type Locator } from '@playwright/test';
import { REFERENCE, GREATEST, byName, type ReferenceSite } from '../src/lib/testing/reference';

export { expect, REFERENCE, GREATEST, byName };
export type { ReferenceSite };

const GEOCODER = 'https://geocode.versatiles.org/**';
const STORAGE_KEY = 'eclipse.location';

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
	/** Every test gets the geocoder stubbed; opt out with the @live tag. */
	stubGeocoder: (body?: unknown, status?: number) => Promise<void>;
	/** Load the app with a location already chosen, via the documented ?lat&lon debug override. */
	locatedPage: (site: { lat: number; lon: number; name?: string }) => Promise<void>;
	/** Load the app with a location seeded into localStorage instead of the URL. */
	storedPage: (site: { lat: number; lon: number; name?: string }) => Promise<void>;
	/** Console errors and failed requests collected over the whole test. */
	pageProblems: { errors: string[]; failedRequests: string[] };
};

export const test = base.extend<Fixtures>({
	stubGeocoder: async ({ page }, use) => {
		let body: unknown = PHOTON.oviedo;
		let status = 200;
		await page.route(GEOCODER, (route) =>
			route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
		);
		await use(async (nextBody = PHOTON.oviedo, nextStatus = 200) => {
			body = nextBody;
			status = nextStatus;
		});
	},

	locatedPage: async ({ page, stubGeocoder }, use) => {
		await stubGeocoder();
		await use(async (site) => {
			const name = site.name ? `&name=${encodeURIComponent(site.name)}` : '';
			await page.goto(`/?lat=${site.lat}&lon=${site.lon}${name}`);
		});
	},

	storedPage: async ({ page, stubGeocoder }, use) => {
		await stubGeocoder();
		await use(async (site) => {
			await page.addInitScript(([key, value]) => window.localStorage.setItem(key as string, value as string), [
				STORAGE_KEY,
				JSON.stringify({ lat: site.lat, lon: site.lon, name: site.name ?? null })
			] as const);
			await page.goto('/');
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

/** Wait for a section's MapLibre instance to reach `idle` (the data-map-ready hook in the components). */
export async function mapReady(page: Page, selector: string, timeout = 60_000) {
	await expect(page.locator(`${selector} [data-map-ready="true"]`)).toBeAttached({ timeout });
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
	const offsets = { 'T-30d': -30 * 86_400_000, 'T-90s': -90_000, 'T+1h': 3_600_000 };
	await page.clock.install({ time: new Date(peak + offsets[at]) });
}

/** The four countdown numbers, as rendered. */
export async function countdownDigits(page: Page): Promise<string[]> {
	return page.locator('section.cd .units .n').allInnerTexts();
}
