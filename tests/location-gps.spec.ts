import { test, expect, PHOTON, localeUrl } from './fixtures';

const open = async (page: import('@playwright/test').Page) => {
	await page.goto(localeUrl());
	await page.getByRole('button', { name: /Standort wählen/ }).click();
	await expect(page.locator('dialog.picker-dlg')).toBeVisible();
	return page.getByRole('button', { name: 'Meinen Standort verwenden' });
};

test.describe('use my location', () => {
	test('fills the pending place from a granted position', async ({ page, context, stubGeocoder }) => {
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation({ latitude: 43.3603, longitude: -5.8448 });
		await stubGeocoder(PHOTON.oviedo);

		const gps = await open(page);
		await gps.click();
		// the coordinate is reverse-geocoded into a readable name
		await expect(page.locator('dialog.picker-dlg .summary .place')).toContainText('Oviedo');
		await expect(page.locator('dialog.picker-dlg .verdict')).toContainText('Totalität');
	});

	test('applies the position when confirmed', async ({ page, context, stubGeocoder }) => {
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation({ latitude: 52.52, longitude: 13.405 });
		await stubGeocoder(PHOTON.bare);

		const gps = await open(page);
		await gps.click();
		await expect(page.locator('dialog.picker-dlg .summary .place')).toContainText('Berlin');
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();

		await expect(page.locator('section.b1 h2')).toHaveText('Partielle Sonnenfinsternis');
	});

	test('shows an error and stays usable when permission is denied', async ({ page, context, stubGeocoder }) => {
		await context.clearPermissions();
		await stubGeocoder();
		const gps = await open(page);
		await gps.click();

		await expect(page.locator('.results .hint')).toContainText('Standort nicht verfügbar');
		// the dialog is still open and the search still works
		await expect(page.locator('dialog.picker-dlg')).toBeVisible();
		await expect(gps).toBeEnabled();
	});

	test('re-enables the button after a failed attempt', async ({ page, context, stubGeocoder }) => {
		await context.clearPermissions();
		await stubGeocoder();
		const gps = await open(page);
		await gps.click();
		await expect(page.locator('.results .hint')).toBeVisible();
		await expect(gps).toBeEnabled();
	});

	test('clears any previous results when asked for the current position', async ({ page, context, stubGeocoder }) => {
		await context.grantPermissions(['geolocation']);
		await context.setGeolocation({ latitude: 43.3603, longitude: -5.8448 });
		await stubGeocoder(PHOTON.oviedo);

		const gps = await open(page);
		const input = page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' });
		await input.fill('Oviedo');
		await expect(page.locator('.results li button').first()).toBeVisible();

		await gps.click();
		await expect(page.locator('.results li button')).toHaveCount(0);
	});

	test('is labelled for pointer and screen-reader users', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		const gps = await open(page);
		await expect(gps).toHaveAttribute('title', 'Meinen Standort verwenden');
		await expect(gps).toHaveAttribute('aria-label', 'Meinen Standort verwenden');
	});
});
