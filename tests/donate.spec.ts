import { test, expect, byName, localeUrl } from './fixtures';

// The tip jar at the end of the content. The one hard contract: the Stripe link must open in a new tab
// (a payment page replacing the app would throw away the reader's chosen location context) and must be
// exactly the configured payment URL.
const STRIPE = 'https://donate.stripe.com/00w6oJ3EMfca6J35Jb1ck00';

test.describe('donate box', () => {
	test('links to the Stripe payment page in a new tab', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const tip = page.locator('section.donate a.tip');
		await expect(tip).toHaveAttribute('href', STRIPE);
		await expect(tip).toHaveAttribute('target', '_blank');
		await expect(tip).toHaveAttribute('rel', /noopener/);
	});

	test('is present before a location is chosen too', async ({ page, stubGeocoder }) => {
		// A gift to every visitor, not a reward for personalising.
		await stubGeocoder();
		await page.goto(localeUrl());
		await expect(page.locator('section.donate a.tip')).toBeVisible();
	});

	test('sits at the end of the content, after the checklist', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const donate = (await page.locator('section.donate').boundingBox())!;
		const checklist = (await page.locator('section.b6').boundingBox())!;
		expect(donate.y).toBeGreaterThan(checklist.y);
	});

	test('speaks the page language @i18n', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo')); // default spec language: German
		await expect(page.locator('section.donate')).toContainText('Trinkgeld');
		await locatedPage(byName('Oviedo'), 'en');
		await expect(page.locator('section.donate')).toContainText('Leave a tip');
	});
});
