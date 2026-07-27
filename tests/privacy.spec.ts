import { test, expect, PHOTON, localeUrl } from './fixtures';

// The contract from stores/location.ts: the chosen place lives in localStorage only, so a shared link
// can never carry someone's address. Vitest checks the store; this checks the whole app honours it.
test.describe('location privacy', () => {
	test('keeps the chosen place out of the URL', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		await page.goto(localeUrl());
		await page.getByRole('button', { name: /Standort wählen/ }).click();
		await page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' }).fill('Oviedo');
		await page.locator('.results li button').first().click();
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();
		await expect(page.locator('section.b1')).toBeVisible();

		const url = new URL(page.url());
		expect(url.search).toBe('');
		expect(url.href).not.toContain('43.36');
	});

	test('persists it in localStorage instead', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		await page.goto(localeUrl());
		await page.getByRole('button', { name: /Standort wählen/ }).click();
		await page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' }).fill('Oviedo');
		await page.locator('.results li button').first().click();
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();
		await expect(page.locator('section.b1')).toBeVisible();

		const stored = await page.evaluate(() => window.localStorage.getItem('eclipse.location'));
		expect(JSON.parse(stored!)).toMatchObject({ lat: 43.3603, lon: -5.8448 });
	});

	test('restores the located state on reload, with no URL parameters', async ({ page, storedPage }) => {
		await storedPage({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		await expect(page.locator('section.b1 h2')).toHaveText('Totale Sonnenfinsternis');
		expect(new URL(page.url()).search).toBe('');

		await page.reload();
		await expect(page.locator('section.b1 h2')).toHaveText('Totale Sonnenfinsternis');
	});

	test('falls back to the un-located state when storage is cleared', async ({ page, stubGeocoder }) => {
		// Seeded by hand rather than with the storedPage fixture: that one re-seeds on every navigation
		// (addInitScript), which would undo the clear this test is about.
		await stubGeocoder();
		await page.goto(localeUrl());
		await page.evaluate(() =>
			window.localStorage.setItem('eclipse.location', JSON.stringify({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' }))
		);
		await page.reload();
		await expect(page.locator('section.b1')).toBeVisible();

		await page.evaluate(() => window.localStorage.clear());
		await page.reload();
		await expect(page.locator('section.b1')).toHaveCount(0);
		await expect(page.getByRole('button', { name: /Standort wählen/ })).toBeVisible();
	});

	test('accepts the ?lat&lon debug override without writing it back', async ({ page, locatedPage }) => {
		await locatedPage({ lat: 52.52, lon: 13.405, name: 'Berlin' });
		await expect(page.locator('section.b1 h2')).toHaveText('Partielle Sonnenfinsternis');
		// read once as a debug affordance — and not promoted into storage
		expect(await page.evaluate(() => window.localStorage.getItem('eclipse.location'))).toBeNull();
	});

	test('sends no coordinate to any third party on a plain load', async ({ page, storedPage }) => {
		const external: string[] = [];
		page.on('request', (r) => {
			const url = r.url();
			if (!url.startsWith('http://localhost') && /43\.36|-5\.84/.test(url)) external.push(url);
		});
		await storedPage({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		await expect(page.locator('section.b1')).toBeVisible();
		await page.waitForTimeout(1500);
		expect(external).toEqual([]);
	});
});
