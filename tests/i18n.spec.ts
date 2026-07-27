import { test, expect, byName, localeUrl, BASE } from './fixtures';

// Titles come from the catalogues rather than being repeated here: the copy is expected to change, and a
// copy edit should not fail a routing test.
import de from '../src/lib/i18n/messages/de';
import en from '../src/lib/i18n/messages/en';
import es from '../src/lib/i18n/messages/es';

const LANGS = {
	de: { a2: de.a2.title, title: de.app.page_title },
	en: { a2: en.a2.title, title: en.app.page_title },
	es: { a2: es.a2.title, title: es.app.page_title }
};

test.describe('language switching @i18n', () => {
	test('offers all three languages as links in the header', async ({ page }) => {
		// Links, not buttons: each language is its own prerendered URL, so switching is navigation.
		await page.goto(localeUrl());
		const group = page.getByRole('group', { name: /Sprache|Language|Idioma/ });
		await expect(group.getByRole('link')).toHaveCount(3);
		for (const l of ['de', 'en', 'es']) {
			await expect(group.getByRole('link', { name: l.toUpperCase(), exact: true })).toHaveAttribute(
				'href',
				`${BASE}/${l}/`
			);
		}
	});

	test('navigates to the language’s own URL', async ({ page }) => {
		await page.goto(localeUrl('de'));
		await page.getByRole('link', { name: 'ES', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`${BASE}/es/$`));
		await expect(page.locator('section.a2 h2')).toHaveText(LANGS.es.a2);
	});

	test('serves each language its own prerendered copy', async ({ page }) => {
		for (const [code, { a2 }] of Object.entries(LANGS)) {
			await page.goto(localeUrl(code));
			await expect(page.locator('section.a2 h2')).toHaveText(a2);
		}
	});

	test('translates the personalised sections too', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'), 'en');
		await expect(page.locator('section.b1 h2')).toHaveText('Total solar eclipse');
		await locatedPage(byName('Oviedo'), 'es');
		await expect(page.locator('section.b1 h2')).toHaveText('Eclipse solar total');
	});

	test('marks the current language for assistive tech', async ({ page }) => {
		await page.goto(localeUrl('en'));
		await expect(page.getByRole('link', { name: 'EN', exact: true })).toHaveAttribute('aria-current', 'true');
		await expect(page.getByRole('link', { name: 'DE', exact: true })).not.toHaveAttribute('aria-current', 'true');
	});

	test('updates the document language and the tab title on a switch', async ({ page }) => {
		// A client-side navigation does not re-run the server hook, so this proves the layout keeps both
		// in step after hydration — not just in the prerendered file.
		await page.goto(localeUrl('de'));
		await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		await expect(page).toHaveTitle(LANGS.de.title);

		await page.getByRole('link', { name: 'ES', exact: true }).click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'es');
		await expect(page).toHaveTitle(LANGS.es.title);
	});

	test('remembers the choice for the next visit to the root', async ({ page }) => {
		await page.goto(localeUrl('de'));
		await page.getByRole('link', { name: 'EN', exact: true }).click();
		await expect(page).toHaveURL(new RegExp(`${BASE}/en/$`));
		expect(await page.evaluate(() => localStorage.getItem('locale'))).toBe('en');
	});

	test('keeps the chosen location across a language switch', async ({ page, locatedPage }) => {
		// The location lives in localStorage, so navigating between languages must not lose it — even
		// though the language links deliberately carry no query string.
		await locatedPage(byName('Oviedo'), 'de');
		await page
			.getByRole('button', { name: /Standort wählen/ })
			.isVisible()
			.catch(() => {});
		await expect(page.locator('section.b1')).toBeVisible();
		await page.getByRole('link', { name: 'EN', exact: true }).click();
		await expect(page.locator('section.b1 h2')).toHaveText('Total solar eclipse');
	});

	test('formats times in the reader’s zone, in the page’s language', async ({ page, locatedPage }) => {
		await locatedPage(byName('Berlin'), 'de');
		// Berlin's maximum is 18:08 UTC → 20:08 in Europe/Berlin, 14:08 in America/New_York.
		const expected = test.info().project.name === 'chromium-en' ? /\b02:08\s?PM\b|14:08/ : /\b20:08\b/;
		await expect(page.locator('section.b1 .note')).toContainText(expected);
	});

	test('names the reader’s own time zone', async ({ page }) => {
		// Assert the IANA zone, not an abbreviation: the note renders both, and the abbreviation's form
		// depends on the PAGE's language ("MESZ" in German, "UTC-4" for New York in German, "EDT" in
		// English). Since the URL owns the language now, the browser's locale no longer changes it.
		await page.goto(localeUrl());
		const zone = test.info().project.name === 'chromium-en' ? 'America/New_York' : 'Europe/Berlin';
		await expect(page.locator('.tz-note')).toContainText(zone);
	});

	test('keeps the brand name untranslated', async ({ page }) => {
		for (const code of ['de', 'en', 'es']) {
			await page.goto(localeUrl(code));
			await expect(page.locator('header.hdr .name')).toHaveText('Eclipse 2026');
		}
	});
});
