import { test, expect, byName, localeUrl } from './fixtures';
import { REFERENCE } from './fixtures';

const OVIEDO = byName('Oviedo');

test.describe('B6 checklist', () => {
	test('lists the preparation items for the chosen place', async ({ page, locatedPage }) => {
		await locatedPage(OVIEDO);
		const list = page.locator('section.b6 .checks li');
		expect(await list.count()).toBeGreaterThan(2);
		for (const text of await list.allInnerTexts()) expect(text.trim()).not.toBe('');
	});

	test('explains WHY each item matters, not just what to do', async ({ page, locatedPage }) => {
		// "Certified glasses" alone reads as bureaucracy; "ordinary sunglasses are not enough — lasting
		// eye damage" is a reason to comply. Every item carries its why as a sub-line.
		await locatedPage(OVIEDO);
		const whys = page.locator('section.b6 .checks li .why');
		expect(await whys.count()).toBe(await page.locator('section.b6 .checks li').count());
		for (const text of await whys.allInnerTexts()) expect(text.trim().length).toBeGreaterThan(20);
	});

	test('counts down to the local maximum', async ({ page, locatedPage }) => {
		await locatedPage(OVIEDO);
		const count = page.locator('section.b6 .count');
		await expect(count).toBeVisible();
		await expect(count).toContainText(/\d/);

		const seconds = count.locator('.seg').last();
		const before = await seconds.innerText();
		await expect(seconds).not.toHaveText(before, { timeout: 3000 });
	});

	test('tailors the advice to a total versus a partial location', async ({ page, locatedPage }) => {
		await locatedPage(OVIEDO);
		const total = (await page.locator('section.b6 .checks li').allInnerTexts()).join('\n');
		await locatedPage(byName('Berlin'));
		const partial = (await page.locator('section.b6 .checks li').allInnerTexts()).join('\n');
		expect(total).not.toBe(partial);
	});

	test('downloads a calendar entry for the local maximum', async ({ page, locatedPage }) => {
		await locatedPage(OVIEDO);
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

	test('is absent until a location is chosen', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.b6')).toHaveCount(0);
	});

	test('appears for every reference location', async ({ page, locatedPage }) => {
		for (const site of REFERENCE.slice(0, 3)) {
			await locatedPage(site);
			await expect(page.locator('section.b6')).toBeVisible();
		}
	});
});
