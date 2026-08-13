import { test, expect, byName, localeUrl } from './fixtures';

// The tip jar at the end of the content. The one hard contract: the Stripe link must open in a new tab
// (a payment page replacing the app would throw away the reader's chosen location context) and must be
// exactly the configured payment URL.
const STRIPE = 'https://donate.stripe.com/00w6oJ3EMfca6J35Jb1ck00';
// The payment link is shared across datajournal.org projects, so it carries where the donation came
// from. Pinned as a literal rather than imported from config.ts: Stripe silently drops a malformed
// client_reference_id, so this is the copy that would notice a change in the shape.
const donateUrl = (lang: string) => `${STRIPE}?client_reference_id=eclipse-2026-${lang}`;

test.describe('donate box', () => {
	test('links to the Stripe payment page in a new tab', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const tip = page.locator('section.donate a.tip');
		await expect(tip).toHaveAttribute('href', donateUrl('de')); // default spec language
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
		const tip = page.locator('section.donate a.tip');
		await locatedPage(byName('Oviedo')); // default spec language: German
		await expect(page.locator('section.donate')).toContainText('Trinkgeld');
		// ...and the payment link says which language the donation came from, so the tip jar can be read
		// per audience rather than as one undifferentiated number
		await expect(tip).toHaveAttribute('href', donateUrl('de'));
		await locatedPage(byName('Oviedo'), 'en');
		await expect(page.locator('section.donate')).toContainText('Leave a tip');
		await expect(tip).toHaveAttribute('href', donateUrl('en'));
	});
});
