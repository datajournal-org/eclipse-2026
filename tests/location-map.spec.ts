import { test, expect, PHOTON } from './fixtures';

const DIALOG = 'dialog.picker-dlg';

async function openWithPin(page: import('@playwright/test').Page) {
	await page.goto('/');
	await page.getByRole('button', { name: /Standort wählen/ }).click();
	await expect(page.locator(DIALOG)).toBeVisible();
	// the picker map only mounts once a place is pending
	await page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' }).fill('Oviedo');
	await page.locator('.results li button').first().click();
	await expect(page.locator(`${DIALOG} .picker-map[data-map-ready="true"]`)).toBeAttached({ timeout: 60_000 });
}

test.describe('location picker map @webgl', () => {
	test.beforeEach(async ({ stubGeocoder }) => {
		await stubGeocoder(PHOTON.oviedo);
	});

	test('renders a map with the corridor drawn on it', async ({ page }) => {
		await openWithPin(page);
		await expect(page.locator(`${DIALOG} canvas`)).toBeVisible();
		await expect(page.locator(`${DIALOG} .maplibregl-marker`)).toBeVisible();
	});

	test('moves the pin when the map is clicked', async ({ page }) => {
		await openWithPin(page);
		const marker = page.locator(`${DIALOG} .maplibregl-marker`);
		const before = await marker.boundingBox();

		const map = (await page.locator(`${DIALOG} .picker-map`).boundingBox())!;
		await page.mouse.click(map.x + map.width * 0.7, map.y + map.height * 0.35);
		await page.waitForTimeout(500);

		const after = await marker.boundingBox();
		expect(Math.hypot(after!.x - before!.x, after!.y - before!.y)).toBeGreaterThan(10);
	});

	test('re-labels the place after the pin moves', async ({ page }) => {
		await openWithPin(page);
		const map = (await page.locator(`${DIALOG} .picker-map`).boundingBox())!;
		await page.mouse.click(map.x + map.width * 0.3, map.y + map.height * 0.6);
		// the reverse lookup is stubbed, so the summary settles on the stub's first feature
		await expect(page.locator(`${DIALOG} .summary .place`)).toContainText('Oviedo');
	});

	test('recomputes the verdict preview for the new pin', async ({ page }) => {
		await openWithPin(page);
		const verdict = page.locator(`${DIALOG} .verdict`);
		await expect(verdict).toContainText('Totalität');

		// drag far enough south-east to leave the corridor
		const map = (await page.locator(`${DIALOG} .picker-map`).boundingBox())!;
		await page.mouse.click(map.x + map.width * 0.95, map.y + map.height * 0.95);
		await page.waitForTimeout(600);
		await expect(verdict).toContainText(/%|nicht sichtbar/);
	});

	test('applies the pinned coordinate on confirm', async ({ page }) => {
		await openWithPin(page);
		await page.getByRole('button', { name: /Diesen Ort verwenden/ }).click();
		await expect(page.locator(DIALOG)).toBeHidden();
		await expect(page.locator('section.b1')).toBeVisible();

		const stored = JSON.parse((await page.evaluate(() => localStorage.getItem('eclipse.location')))!);
		expect(stored.lat).toBeCloseTo(43.3603, 1);
		expect(stored.lon).toBeCloseTo(-5.8448, 1);
	});

	test('offers a zoom control on the picker map', async ({ page }) => {
		await openWithPin(page);
		await expect(page.locator(`${DIALOG} .maplibregl-ctrl-zoom-in`)).toBeVisible();
	});
});
