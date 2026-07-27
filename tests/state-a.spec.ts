import { test, expect, localeUrl } from './fixtures';

test.describe('state A — no location', () => {
	test('shows the countdown, the shadow run and the call to choose a place', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.cd')).toBeVisible();
		await expect(page.locator('section.a2')).toBeVisible();
		await expect(page.getByRole('button', { name: /Ort wählen|📍/ }).first()).toBeVisible();
	});

	test('hides every personalised section', async ({ page }) => {
		await page.goto(localeUrl());
		for (const section of ['section.b1', 'section.b3', 'section.b6']) {
			await expect(page.locator(section)).toHaveCount(0);
		}
	});

	test('names the reader’s time zone', async ({ page }) => {
		// The whole page is in local time, so it has to say which local.
		await page.goto(localeUrl());
		const note = page.locator('.tz-note');
		await expect(note).toBeVisible();
		await expect(note).toContainText(/MESZ|GMT\+2/);
	});

	test('counts down once per second', async ({ page }) => {
		await page.goto(localeUrl());
		const seconds = page.locator('section.cd .units .u').last().locator('.n');
		const first = await seconds.innerText();
		await expect(seconds).not.toHaveText(first, { timeout: 3000 });
	});

	test('switches to state B once a location is chosen', async ({ page, locatedPage }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.b1')).toHaveCount(0);
		await locatedPage({ lat: 43.3603, lon: -5.8448, name: 'Oviedo' });
		await expect(page.locator('section.b1')).toBeVisible();
		await expect(page.locator('section.b6')).toBeVisible();
	});
});
