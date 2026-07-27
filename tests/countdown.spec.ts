import { test, expect, freezeClock, countdownDigits, localeUrl } from './fixtures';

test.describe('countdown', () => {
	test('shows days, hours, minutes and seconds a month out', async ({ page }) => {
		await freezeClock(page, 'T-30d');
		await page.goto(localeUrl());
		const digits = await countdownDigits(page);
		expect(digits).toHaveLength(4);
		expect(Number(digits[0])).toBe(30); // days
		expect(digits[1]).toBe('05'); // hours — the fixture sits 5 h clear of the day boundary
		await expect(page.locator('section.cd .cap')).toContainText('totalen Sonnenfinsternis');
	});

	test('pads the small units to two digits', async ({ page }) => {
		await freezeClock(page, 'T-90s');
		await page.goto(localeUrl());
		const digits = await countdownDigits(page);
		const [, h, m, s] = digits;
		for (const value of [h, m, s]) expect(value).toMatch(/^\d\d$/);
		expect(digits[0]).toBe('0'); // no days left
		expect(h).toBe('00');
		expect(m).toBe('01'); // 90 s → 1 min 30 s
	});

	test('reads zero rather than counting upward once the eclipse has passed', async ({ page }) => {
		await freezeClock(page, 'T+1h');
		await page.goto(localeUrl());
		await expect(page.locator('section.cd .head')).toBeVisible();
		await expect(page.locator('section.cd .units')).toHaveCount(0);
	});

	test('keeps the digits from jittering as they tick', async ({ page }) => {
		// Tabular figures: a proportional font would make the whole row shuffle every second.
		await page.goto(localeUrl());
		const seconds = page.locator('section.cd .units .u').last().locator('.n');
		const before = await seconds.boundingBox();
		const text = await seconds.innerText();
		await expect(seconds).not.toHaveText(text, { timeout: 3000 });
		const after = await seconds.boundingBox();
		expect(Math.abs(after!.width - before!.width)).toBeLessThan(1);
		expect(after!.x).toBeCloseTo(before!.x, 0);
	});

	test('always carries the "since 1999" line', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('section.cd .since')).toContainText('1999');
	});
});
