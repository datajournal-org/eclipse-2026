import { test, expect, BASE } from './fixtures';

/**
 * The bare root dispatches readers to their language before first paint (the inline script in app.html).
 * Crawlers never run it and get the English page instead — that half is covered in seo.spec.ts.
 */
const ROOT = `${BASE}/`;

test.describe('root language dispatch @i18n', () => {
	test.describe('a German browser', () => {
		test.use({ locale: 'de-DE' });
		test('lands on the German page', async ({ page }) => {
			await page.goto(ROOT);
			await expect(page).toHaveURL(new RegExp(`${BASE}/de/$`));
			await expect(page.locator('html')).toHaveAttribute('lang', 'de');
		});
	});

	test.describe('an English browser', () => {
		test.use({ locale: 'en-GB' });
		test('lands on the English page', async ({ page }) => {
			await page.goto(ROOT);
			await expect(page).toHaveURL(new RegExp(`${BASE}/en/$`));
		});
	});

	test.describe('a Spanish browser', () => {
		test.use({ locale: 'es-ES' });
		test('lands on the Spanish page', async ({ page }) => {
			// A regional tag resolves to its base language.
			await page.goto(ROOT);
			await expect(page).toHaveURL(new RegExp(`${BASE}/es/$`));
		});
	});

	test.describe('a browser in a language we do not have', () => {
		test.use({ locale: 'it-IT' });
		test('falls back to the default language', async ({ page }) => {
			await page.goto(ROOT);
			await expect(page).toHaveURL(new RegExp(`${BASE}/en/$`));
		});
	});

	test.describe('a returning reader', () => {
		test.use({ locale: 'de-DE' });
		test('gets their stored choice, not their browser language', async ({ page }) => {
			await page.addInitScript(() => window.localStorage.setItem('locale', 'es'));
			await page.goto(ROOT);
			await expect(page).toHaveURL(new RegExp(`${BASE}/es/$`));
		});

		test('is not misled by a stored language we no longer support', async ({ page }) => {
			await page.addInitScript(() => window.localStorage.setItem('locale', 'it'));
			await page.goto(ROOT);
			await expect(page).toHaveURL(new RegExp(`${BASE}/de/$`));
		});
	});

	test('carries the query string through the redirect', async ({ page }) => {
		// The ?lat=&lon= debug override has to survive a root entry, or deep links break.
		await page.goto(`${ROOT}?lat=43.3603&lon=-5.8448`);
		await expect(page).toHaveURL(/lat=43\.3603&lon=-5\.8448/);
		await expect(page.locator('section.b1')).toBeVisible();
	});

	test('leaves the root out of the back stack', async ({ page }) => {
		// `location.replace`, not `assign`: otherwise Back from a language page bounces straight forward
		// again and the reader is trapped.
		await page.goto(`${BASE}/de/`);
		await page.goto(ROOT);
		await expect(page).toHaveURL(new RegExp(`${BASE}/(de|en|es)/$`));
		await page.goBack();
		await expect(page).toHaveURL(new RegExp(`${BASE}/de/$`));
	});

	test('never redirects a language page', async ({ page }) => {
		// The pathname guard is what stops an infinite loop.
		for (const lang of ['de', 'en', 'es', 'fr', 'nl', 'pt']) {
			await page.goto(`${BASE}/${lang}/`);
			await page.waitForTimeout(300);
			await expect(page).toHaveURL(new RegExp(`${BASE}/${lang}/$`));
		}
	});

	test('still offers every language when the script does not run', async ({ browser }) => {
		// Readers without JavaScript stay on the root, so it has to be a usable language chooser rather
		// than a "redirecting…" placeholder.
		const context = await browser.newContext({ javaScriptEnabled: false });
		const page = await context.newPage();
		await page.goto(ROOT);
		await expect(page).toHaveURL(new RegExp(`${BASE}/$`));
		for (const name of ['Deutsch', 'English', 'Español']) {
			await expect(page.getByRole('link', { name })).toBeVisible();
		}
		await context.close();
	});
});
