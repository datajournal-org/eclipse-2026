import { test, expect, REFERENCE, byName, localeUrl } from './fixtures';

// The reference table is the shared oracle: Vitest checks the astronomy produces these numbers, this
// spec checks they reach the screen. Times are shown in the browser's zone (Europe/Berlin = UTC+2).
const berlinTime = (utc: string) => {
	const [h, m] = utc.split(':').map(Number);
	return `${String((h + 2) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

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

	test('flags a total eclipse for its unaided-viewing window', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const safety = page.locator('section.b1 .safety');
		await expect(safety).toContainText('Totalität');
		await expect(safety).toContainText('Schutzbrille');
		// and it names the window, so the reader knows exactly when the glasses come off
		await expect(safety).toContainText(/\d\d:\d\d[–-]\d\d:\d\d/);
	});

	test('demands eye protection throughout at a partial location', async ({ page, locatedPage }) => {
		await locatedPage(byName('Berlin'));
		const safety = page.locator('section.b1 .safety');
		await expect(safety).toContainText('ISO 12312-2');
		await expect(safety).not.toContainText('Totalität');
	});

	test('marks the card as total only where totality happens', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		await expect(page.locator('section.b1')).toHaveClass(/total/);
		await locatedPage(byName('Berlin'));
		await expect(page.locator('section.b1')).not.toHaveClass(/total/);
	});

	test('says so when the eclipse is below the horizon', async ({ page, locatedPage }) => {
		// Eastern Europe: the maximum happens after the Sun has set.
		await locatedPage({ lat: 55.7558, lon: 37.6173, name: 'Moskau' });
		const card = page.locator('section.b1');
		await expect(card.locator('h2')).toHaveText('Von hier aus nicht sichtbar');
		await expect(card.locator('.note')).toContainText('unter dem Horizont');
		await expect(card.locator('.obsc')).toHaveCount(0);
	});

	test('is absent until a location is chosen', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.b1')).toHaveCount(0);
	});
});
