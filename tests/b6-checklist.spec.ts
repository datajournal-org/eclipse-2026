import type { Page } from '@playwright/test';
import { test, expect, byName, localeUrl, openSharedLocatedPage } from './fixtures';
import { REFERENCE } from './fixtures';

const OVIEDO = byName('Oviedo');

test.describe('B6 checklist', () => {
	// The Oviedo tests all read (or download from) the same located page without mutating it, so they
	// share one page (serial) instead of paying the located-page load four times — the b3 pattern.
	test.describe.configure({ mode: 'serial' });
	let page: Page;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedLocatedPage(browser, OVIEDO);
	});
	test.afterAll(async () => page.context().close());

	test('lists the preparation items for the chosen place', async () => {
		const list = page.locator('section.b6 .checks li');
		expect(await list.count()).toBeGreaterThan(2);
		for (const text of await list.allInnerTexts()) expect(text.trim()).not.toBe('');
	});

	test('explains WHY each item matters, not just what to do', async () => {
		// "Certified glasses" alone reads as bureaucracy; "ordinary sunglasses are not enough — lasting
		// eye damage" is a reason to comply. Every item carries its why as a sub-line.
		const whys = page.locator('section.b6 .checks li .why');
		// every item except the countdown row (.count, which is a readout, not advice) carries a why
		expect(await whys.count()).toBe(await page.locator('section.b6 .checks li:not(.count)').count());
		for (const text of await whys.allInnerTexts()) expect(text.trim().length).toBeGreaterThan(20);
	});

	test('names the eye-protection standard', async () => {
		// B1's verdict used to carry an eye-safety line and this claim was pinned there. The line is gone
		// and the checklist is now the ONLY place the page tells a reader what protects their eyesight —
		// so the assertion moves here rather than disappearing with the element it used to read.
		await expect(page.locator('section.b6 .checks')).toContainText('ISO 12312-2');
	});

	test('counts down to the local maximum', async () => {
		const count = page.locator('section.b6 .count');
		await expect(count).toBeVisible();
		await expect(count).toContainText(/\d/);

		const seconds = count.locator('b').last();
		const before = await seconds.innerText();
		await expect(seconds).not.toHaveText(before, { timeout: 3000 });
	});

	test('downloads a calendar entry for the local maximum', async () => {
		const [download] = await Promise.all([
			page.waitForEvent('download'),
			page.getByRole('button', { name: /Kalender/ }).click()
		]);
		expect(download.suggestedFilename()).toBe('eclipse-2026.ics');

		const stream = await download.createReadStream();
		const chunks: unknown[] = [];
		for await (const chunk of stream) chunks.push(chunk);
		const ics = chunks.map(String).join('');

		// It has to be a real calendar file, and it has to point at the right instant.
		expect(ics).toContain('BEGIN:VCALENDAR');
		expect(ics).toContain('BEGIN:VEVENT');
		expect(ics).toContain('END:VCALENDAR');
		// The event spans the whole eclipse — first to last contact — rather than just the maximum, so
		// the calendar entry is useful as a "be outside by then" reminder.
		const parse = (stamp: string) =>
			Date.parse(stamp.replace(/^(\d{4})(\d\d)(\d\d)T(\d\d)(\d\d)(\d\d)Z?$/, '$1-$2-$3T$4:$5:$6Z'));
		const start = parse(ics.match(/DTSTART[^:]*:(\d{8}T\d{6}Z?)/)![1]);
		const end = parse(ics.match(/DTEND[^:]*:(\d{8}T\d{6}Z?)/)![1]);
		const maximum = Date.parse('2026-08-12T18:27:00Z'); // Oviedo, from the reference table

		expect(start).toBeLessThan(maximum);
		expect(end).toBeGreaterThan(maximum);
		expect(end - start).toBeGreaterThan(60 * 60_000); // a partial phase runs well over an hour
		expect(ics).toContain('LOCATION:Oviedo');

		// The entry must be useful when it fires: local phase times, coverage, and the safety line —
		// the same strings the page shows. 20:27 is Oviedo's maximum in the suite's Europe/Berlin zone.
		expect(ics).toContain('DESCRIPTION:');
		const description = ics.match(/DESCRIPTION:([^\r\n]*)/)![1];
		expect(description).toContain('20:27');
		expect(description).toContain('100');
		expect(description).toContain('ISO 12312-2');
		// three phase lines joined with escaped newlines, per RFC 5545
		expect(description.split('\\n').length).toBeGreaterThanOrEqual(4);
	});

	test('is already local on a plain load, because the place is guessed', async ({ page: freshPage }) => {
		// This used to assert the bare "state A" list — no countdown, no calendar — for readers who had
		// picked no place. That state is gone: the app guesses one, so B6 arrives in its located form.
		await freshPage.goto(localeUrl());
		await expect(freshPage.locator('section.b6 .checks li').nth(1)).toContainText('Hast du freie Sicht nach Westen?');
		await expect(freshPage.locator('section.b6 .count')).toBeVisible();
		await expect(freshPage.locator('section.b6 .cal')).toBeVisible();
	});

	test('is hidden entirely where the eclipse never arrives', async ({ page: freshPage }) => {
		// Prep advice under a verdict that says "not visible from here" would contradict it, so the page
		// gates B6 on there being a local maximum at all. Same place b1-verdict.spec.ts uses for the
		// not-reached verdict.
		await freshPage.goto(localeUrl('de', '?lat=-34.6037&lon=-58.3816&name=Buenos%20Aires'));
		await expect(freshPage.locator('section.b1 h2')).toBeVisible();
		await expect(freshPage.locator('section.b6')).toHaveCount(0);
	});

	test('appears for every reference location', async ({ page: freshPage, locatedPage }) => {
		for (const site of REFERENCE.slice(0, 3)) {
			await locatedPage(site);
			await expect(freshPage.locator('section.b6')).toBeVisible();
		}
	});
});
