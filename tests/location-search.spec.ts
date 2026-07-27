import { test, expect, PHOTON } from './fixtures';

const open = async (page: import('@playwright/test').Page) => {
	await page.goto('/');
	await page.getByRole('button', { name: /Standort wählen/ }).click();
	await expect(page.locator('dialog.picker-dlg')).toBeVisible();
	return page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' });
};

test.describe('location search', () => {
	test('does not query for one character', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		// Count forward searches only: opening the dialog also reverse-geocodes the initial pin.
		let requests = 0;
		page.on('request', (r) => {
			if (r.url().includes('geocode.versatiles.org/api')) requests++;
		});
		const input = await open(page);
		await input.fill('O');
		await page.waitForTimeout(600);
		expect(requests).toBe(0);
		await expect(page.locator('.results')).toHaveCount(0);
	});

	test('debounces a burst of keystrokes into one request', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		const urls: string[] = [];
		page.on('request', (r) => {
			if (r.url().includes('geocode.versatiles.org/api')) urls.push(r.url());
		});
		const input = await open(page);
		await input.pressSequentially('Oviedo', { delay: 30 });
		// wait for a real hit, not the "Suche …" placeholder that also matches `.results li`
		await expect(page.locator('.results li button').first()).toBeVisible();
		expect(urls).toHaveLength(1);
		expect(decodeURIComponent(urls[0])).toContain('q=Oviedo');
	});

	test('renders each hit with its label and context line', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		const input = await open(page);
		await input.fill('Oviedo');
		const results = page.locator('.results li');
		await expect(results).toHaveCount(2);
		await expect(results.nth(0).locator('.lbl')).toHaveText('Oviedo');
		await expect(results.nth(0).locator('.sub')).toHaveText('Asturias, España');
		await expect(results.nth(1).locator('.lbl')).toHaveText('Calle Uría 10');
	});

	test('omits the context line when there is none', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.bare);
		const input = await open(page);
		await input.fill('Berlin');
		await expect(page.locator('.results li .lbl')).toHaveText('Berlin');
		await expect(page.locator('.results li .sub')).toHaveCount(0);
	});

	test('shows no result list when nothing matches', async ({ page, stubGeocoder }) => {
		// NOTE the a4.no_results message ("Nichts gefunden") is currently unreachable: the list is only
		// rendered `{#if searching || searchErr || results.length}`, so zero hits removes the whole <ul>
		// before that branch can run. The user gets silence instead of an answer. Asserted as-is so the
		// behaviour is pinned; making the message appear needs a "has searched" flag in the component.
		await stubGeocoder(PHOTON.empty);
		const input = await open(page);
		await input.fill('Zzzzzzz');
		await expect(page.locator('.results .hint')).toHaveText('Suche …');
		await expect(page.locator('.results')).toHaveCount(0);
	});

	test('shows an error rather than an empty list when the service fails', async ({ page, stubGeocoder }) => {
		await stubGeocoder({}, 500);
		const input = await open(page);
		await input.fill('Oviedo');
		await expect(page.locator('.results .hint')).toContainText('Standort nicht verfügbar');
	});

	test('picking a hit puts it in the footer summary', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		const input = await open(page);
		await input.fill('Oviedo');
		await page.locator('.results li button').first().click();
		await expect(page.locator('dialog.picker-dlg .summary .place')).toContainText('Oviedo');
	});

	test('previews the verdict for the pending place before committing', async ({ page, stubGeocoder }) => {
		// The point of the preview: you can compare places without leaving the dialog.
		await stubGeocoder(PHOTON.oviedo);
		const input = await open(page);
		await input.fill('Oviedo');
		await page.locator('.results li button').first().click();
		await expect(page.locator('dialog.picker-dlg .verdict')).toContainText('Totalität');
		await expect(page.locator('dialog.picker-dlg .verdict')).toContainText('100');
	});

	test('confirming applies the location and closes the dialog', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		const input = await open(page);
		await input.fill('Oviedo');
		await page.locator('.results li button').first().click();
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();

		await expect(page.locator('dialog.picker-dlg')).toBeHidden();
		await expect(page.locator('section.b1')).toBeVisible();
		await expect(page.locator('section.b1 h2')).toHaveText('Totale Sonnenfinsternis');
	});

	test('clearing the query drops the results', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		const input = await open(page);
		await input.fill('Oviedo');
		await expect(page.locator('.results li button').first()).toBeVisible();
		await input.fill('');
		await expect(page.locator('.results')).toHaveCount(0);
	});

	test('sends the active locale to the geocoder @i18n', async ({ page, stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
		const urls: string[] = [];
		page.on('request', (r) => {
			if (r.url().includes('geocode.versatiles.org/api')) urls.push(r.url());
		});
		const input = await open(page);
		await input.fill('Oviedo');
		await expect(page.locator('.results li button').first()).toBeVisible();
		// Photon supports de/fr/it and falls back to en for everything else.
		expect(urls[0]).toMatch(/lang=(de|en)/);
	});
});
