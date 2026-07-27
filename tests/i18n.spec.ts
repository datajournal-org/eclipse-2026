import { test, expect, byName } from './fixtures';

const LANGS = { de: 'Schattenlauf', en: 'Shadow run', es: 'Recorrido de la sombra' };

test.describe('language switching @i18n', () => {
	test('offers all three languages in the header', async ({ page }) => {
		await page.goto('/');
		const group = page.getByRole('group', { name: /Sprache|Language|Idioma/ });
		await expect(group.getByRole('button')).toHaveCount(3);
		await expect(group.getByRole('button', { name: 'DE' })).toBeVisible();
		await expect(group.getByRole('button', { name: 'EN' })).toBeVisible();
		await expect(group.getByRole('button', { name: 'ES' })).toBeVisible();
	});

	test('switches the copy across every section', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		for (const [code, a2Title] of Object.entries(LANGS)) {
			await page.getByRole('button', { name: code.toUpperCase(), exact: true }).click();
			await expect(page.locator('section.a2 h2')).toHaveText(a2Title);
			// a personalised section too, so the switch is proven beyond the static shell
			await expect(page.locator('section.b1 h2')).not.toHaveText('');
		}
	});

	test('marks the active language as pressed', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'EN', exact: true }).click();
		await expect(page.getByRole('button', { name: 'EN', exact: true })).toHaveAttribute('aria-pressed', 'true');
		await expect(page.getByRole('button', { name: 'DE', exact: true })).toHaveAttribute('aria-pressed', 'false');
	});

	test('updates the document language', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'ES', exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
	});

	test('remembers the choice across a reload', async ({ page }) => {
		await page.goto('/');
		await page.getByRole('button', { name: 'EN', exact: true }).click();
		await expect(page.locator('section.a2 h2')).toHaveText(LANGS.en);
		await page.reload();
		await expect(page.locator('section.a2 h2')).toHaveText(LANGS.en);
		expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe('en');
	});

	test('detects the browser language on a fresh profile', async ({ page }) => {
		// The chromium-en project runs with locale en-GB; the default projects with de-DE.
		await page.goto('/');
		const expected = test.info().project.name === 'chromium-en' ? LANGS.en : LANGS.de;
		await expect(page.locator('section.a2 h2')).toHaveText(expected);
	});

	test('formats times and dates in the active locale and zone', async ({ page, locatedPage }) => {
		await locatedPage(byName('Berlin'));
		const note = page.locator('section.b1 .note');
		await expect(note).toContainText(/\d{1,2}:\d{2}/);
		// Berlin's maximum is 18:08 UTC → 20:08 in Europe/Berlin, 14:08 in America/New_York.
		// The app resolves to the base locale 'en', whose Intl default is a 12-hour clock → "02:08 PM".
		const expected = test.info().project.name === 'chromium-en' ? /\b02:08\s?PM\b|14:08/ : /\b20:08\b/;
		await expect(note).toContainText(expected);
	});

	test('names the reader’s own time zone', async ({ page }) => {
		await page.goto('/');
		const zone = test.info().project.name === 'chromium-en' ? /EDT|GMT-4/ : /MESZ|GMT\+2/;
		await expect(page.locator('.tz-note')).toContainText(zone);
	});

	test('keeps the brand name untranslated', async ({ page }) => {
		await page.goto('/');
		for (const code of ['EN', 'ES', 'DE']) {
			await page.getByRole('button', { name: code, exact: true }).click();
			await expect(page.locator('header.hdr .name')).toHaveText('Eclipse 2026');
		}
	});
});
