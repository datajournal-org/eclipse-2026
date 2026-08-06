import { test, expect, PHOTON, localeUrl, openLocationDialog } from './fixtures';

const open = async (page: import('@playwright/test').Page) => {
	await page.goto(localeUrl());
	await openLocationDialog(page);
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

		await expect(page.locator('section.b1 h2')).toContainText('Partielle Sonnenfinsternis');
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

	test('labels itself with visible text, not a tooltip', async ({ page, stubGeocoder }) => {
		// The old control was an icon-only button whose label lived in title/aria-label — invisible on
		// touch, and the crosshair glyph alone is map-app vocabulary. The label IS the button now.
		await stubGeocoder();
		const gps = await open(page);
		await expect(gps).toHaveText(/Meinen Standort verwenden/);
		await expect(gps).toBeVisible();
	});

	test('sits outside the search field, as its own action', async ({ page, stubGeocoder }) => {
		// Inside the input it read as part of searching (clear/submit); as a separate chip it reads as
		// the alternative to typing. Pin the structure: not a descendant of the search bar, below it.
		await stubGeocoder();
		const gps = await open(page);
		expect(await page.locator('dialog.picker-dlg .searchbar button').count()).toBe(0);
		const bar = (await page.locator('dialog.picker-dlg .searchbar').boundingBox())!;
		const chip = (await gps.boundingBox())!;
		expect(chip.y).toBeGreaterThan(bar.y + bar.height - 1);
	});

	test('does not exist at all where the browser has no geolocation API', async ({ page, stubGeocoder }) => {
		// API absence is knowable before rendering (unlike permission denial, which stays a click-time
		// error), so an unsupported browser — insecure-context mirrors, locked-down webviews — gets no
		// dead-end button. Search and the map pin remain the working paths.
		await stubGeocoder();
		await page.addInitScript(() => {
			// geolocation is an accessor on Navigator.prototype; deleting it is exactly what an
			// insecure context looks like to feature detection.
			delete (Navigator.prototype as unknown as Record<string, unknown>).geolocation;
		});
		await page.goto(localeUrl());
		await openLocationDialog(page);
		await expect(page.locator('dialog.picker-dlg')).toBeVisible();
		await expect(page.locator('dialog.picker-dlg .geo-chip')).toHaveCount(0);
		// the other two paths are untouched
		await expect(page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Diesen Ort verwenden/ })).toBeEnabled();
	});

	test('reports progress in its own label while locating', async ({ page, context, stubGeocoder }) => {
		await context.grantPermissions(['geolocation']);
		await stubGeocoder(PHOTON.oviedo);
		// A geolocation fix that never resolves, so the busy state holds still long enough to read.
		await page.addInitScript(() => {
			navigator.geolocation.getCurrentPosition = () => {};
		});
		const gps = await open(page);
		await gps.click();
		const busy = page.locator('dialog.picker-dlg .geo-chip');
		await expect(busy).toHaveText(/Standort wird ermittelt/);
		await expect(busy).toBeDisabled();
	});
});
