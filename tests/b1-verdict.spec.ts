import type { Page } from '@playwright/test';
import { test, expect, REFERENCE, byName, localeUrl, openSharedLocatedPage } from './fixtures';

// The reference table is the shared oracle: Vitest checks the astronomy produces these numbers, this
// spec checks they reach the screen. Times are shown in the browser's zone (Europe/Berlin = UTC+2).
const berlinTime = (utc: string) => {
	const [h, m] = utc.split(':').map(Number);
	return `${String((h + 2) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * One shared page per location (serial), because every test against a given place only READS its
 * verdict — the b3 pattern. Locations that appear once keep the plain per-test fixture.
 */
function atLocation(site: { lat: number; lon: number; name?: string }, body: (get: () => Page) => void) {
	test.describe(`at ${site.name}`, () => {
		test.describe.configure({ mode: 'serial' });
		let page: Page;

		test.beforeAll(async ({ browser }) => {
			page = await openSharedLocatedPage(browser, site);
		});
		test.afterAll(async () => page.context().close());

		body(() => page);
	});
}

test.describe('B1 verdict card', () => {
	for (const site of REFERENCE) {
		test(`states the verdict for ${site.name}`, async ({ page, locatedPage }) => {
			await locatedPage(site);
			const card = page.locator('section.b1');
			await expect(card).toBeVisible();

			await expect(card.locator('h2')).toHaveText(
				site.kind === 'total' ? 'Totale Sonnenfinsternis' : 'Partielle Sonnenfinsternis'
			);
			// obscuration, rounded to a whole percent
			await expect(card.locator('.obsc')).toContainText(String(Math.round(site.obsc * 100)));
			// local maximum, ±1 min for the rounding between the table and Intl
			await expect(card.locator('.note')).toContainText(new RegExp(berlinTime(site.maxUtc).replace(':', ':')));
			await expect(card.locator('.note')).toContainText(`${Math.round(site.sunAlt)}°`);
		});
	}

	atLocation(byName('Oviedo'), (get) => {
		test('flags a total eclipse for its unaided-viewing window', async () => {
			const safety = get().locator('section.b1 .safety');
			await expect(safety).toContainText('Totalität');
			await expect(safety).toContainText('Schutzbrille');
			// and it names the window, so the reader knows exactly when the glasses come off
			await expect(safety).toContainText(/\d\d:\d\d[–-]\d\d:\d\d/);
		});

		test('marks the card as total', async () => {
			await expect(get().locator('section.b1')).toHaveClass(/total/);
		});

		test('shows the sky view wherever it declares the eclipse visible', async () => {
			// The other half of the shared predicate: visible verdict ⇒ B3 present (its map loads lazily;
			// the section itself must be there at once).
			await expect(get().locator('section.b3')).toBeAttached();
		});
	});

	atLocation(byName('Berlin'), (get) => {
		test('demands eye protection throughout at a partial location', async () => {
			const safety = get().locator('section.b1 .safety');
			await expect(safety).toContainText('ISO 12312-2');
			await expect(safety).not.toContainText('Totalität');
		});

		test('does not mark the card as total where totality never happens', async () => {
			await expect(get().locator('section.b1')).not.toHaveClass(/total/);
		});
	});

	test('says so when the eclipse is below the horizon', async ({ page, locatedPage }) => {
		// Eastern Europe: the eclipse DOES reach Moscow, but the maximum falls after sunset. A different
		// answer from "does not reach you" — and no next-eclipse redirect, because this one is theirs.
		await locatedPage({ lat: 55.7558, lon: 37.6173, name: 'Moskau' });
		const card = page.locator('section.b1');
		await expect(card.locator('h2')).toHaveText('Von hier aus nicht sichtbar');
		await expect(card.locator('.note')).toContainText('unter dem Horizont');
		await expect(card.locator('.obsc')).toHaveCount(0);
		await expect(card.locator('.next')).toHaveCount(0);
		// ...and no sky view either: a 3D scene of an untouched Sun would contradict the headline.
		await expect(page.locator('section.b3')).toHaveCount(0);
	});

	test.describe('a location this eclipse misses', () => {
		// SearchLocalSolarEclipse scans forward until it finds an eclipse the observer can see, so without
		// the guard in localCircumstances these places were shown a DIFFERENT eclipse — Sydney the 2028
		// one — rendered as a confident verdict with a time-only "Maximum um …" that hid the year.
		const notVisibleHere = (get: () => Page, name: string) => {
			test(`tells a visitor in ${name} it is not visible`, async () => {
				const card = get().locator('section.b1');
				await expect(card.locator('h2')).toHaveText('Von hier aus nicht sichtbar');
				await expect(card.locator('.obsc')).toHaveCount(0);
				// and nothing anywhere claims a coverage figure or a contact time
				await expect(get().locator('section.b6')).toHaveCount(0);
				// nor is there a sky view of an eclipse that never arrives
				await expect(get().locator('section.b3')).toHaveCount(0);
			});
		};

		atLocation({ lat: -33.8688, lon: 151.2093, name: 'Sydney' }, (get) => {
			notVisibleHere(get, 'Sydney');

			test('points a Sydney visitor at the eclipse they can actually see', async () => {
				// CONCEPT.md's fourth question — "should I travel for it?" — answered from the other side:
				// the data is already computed, so a dead end becomes the most useful line on the page.
				const next = get().locator('section.b1 .next');
				await expect(next).toBeVisible();
				await expect(next).toContainText('2028'); // 22 July 2028
				await expect(next).toContainText('total');
				await expect(next).toContainText('100');
			});

			test('says the eclipse does not reach here, not that the Sun has set', async () => {
				// The old copy claimed "at maximum the Sun is already below the horizon" for Sydney, which
				// is simply false — the eclipse never gets there at all.
				const note = get().locator('section.b1 .note').first();
				await expect(note).toHaveText('Diese Finsternis erreicht deinen Ort nicht.');
			});

			test('offers no calendar entry for the wrong eclipse', async () => {
				// The .ics used to be written from the found eclipse's peak — a 2028 DTSTART for Sydney.
				await expect(get().locator('section.b1')).toBeVisible();
				await expect(get().getByRole('button', { name: /Kalender/ })).toHaveCount(0);
			});
		});

		atLocation({ lat: 35.6762, lon: 139.6503, name: 'Tokio' }, (get) => {
			notVisibleHere(get, 'Tokio');

			test('names the right kind and coverage for a partial one', async () => {
				const next = get().locator('section.b1 .next');
				await expect(next).toContainText('2030');
				await expect(next).toContainText('partiell');
				await expect(next).toContainText('72');
			});
		});

		test('tells a visitor in Buenos Aires it is not visible', async ({ page, locatedPage }) => {
			await locatedPage({ lat: -34.6037, lon: -58.3816, name: 'Buenos Aires' });
			const card = page.locator('section.b1');
			await expect(card.locator('h2')).toHaveText('Von hier aus nicht sichtbar');
			await expect(card.locator('.obsc')).toHaveCount(0);
			await expect(page.locator('section.b6')).toHaveCount(0);
			await expect(page.locator('section.b3')).toHaveCount(0);
		});
	});

	test('is absent until a location is chosen', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.b1')).toHaveCount(0);
	});
});
