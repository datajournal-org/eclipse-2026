import { test, expect, byName, localeUrl } from './fixtures';

/**
 * B0 — the heading that opens the personal section. It replaced a "Dein Himmel" divider plus a small
 * grey eyebrow inside the verdict card, because the analytics said the thing visitors were missing was
 * not that a section started but that the sky below is computed for a place THEY choose. So the two
 * claims worth pinning are: the heading names that place, and the way to change it is unmissable.
 */
test.describe('B0 — the simulation heading', () => {
	test('names the place the simulation is for', async ({ page, locatedPage }) => {
		await locatedPage(byName('Berlin'));
		// Substring, not equality: the surrounding sentence is translated copy and free to change.
		await expect(page.locator('section.b0 .place')).toContainText('Berlin');
		// It is the section's heading, not decoration — the outline has to carry it (a11y.spec.ts).
		await expect(page.locator('section.b0 h2.place')).toBeVisible();
	});

	test('offers a change button big enough to hit on a phone', async ({ page, locatedPage }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await locatedPage(byName('Berlin'));
		const button = page.locator('section.b0 button.change');
		await expect(button).toBeVisible();
		// The old eyebrow button was a 0.86rem pill at 4px padding — this is the whole point of B0.
		const box = (await button.boundingBox())!;
		expect(box.width, 'width').toBeGreaterThanOrEqual(44);
		expect(box.height, 'height').toBeGreaterThanOrEqual(44);
	});

	test('opens the location dialog', async ({ page, locatedPage }) => {
		await locatedPage(byName('Berlin'));
		await page.locator('section.b0 button.change').click();
		await expect(page.locator('dialog.picker-dlg')).toBeVisible();
	});

	test('sits above the verdict, which no longer carries the place itself', async ({ page, locatedPage }) => {
		await locatedPage(byName('Berlin'));
		// One place line on the page, and it is B0's — a leftover eyebrow in B1 would say it twice.
		await expect(page.locator('.place .pname')).toHaveCount(1);
		const b0 = (await page.locator('section.b0').boundingBox())!;
		const b1 = (await page.locator('section.b1').boundingBox())!;
		expect(b0.y).toBeLessThan(b1.y);
	});

	test('never claims a partial eclipse covers 100 %', async ({ page }) => {
		// Just outside the corridor the obscuration reaches 99.96 %, which used to round to the
		// self-contradicting headline "Partielle Sonnenfinsternis: 100 % der Sonne bedeckt".
		await page.goto(localeUrl('de', '?lat=40.390326735482034&lon=-3.655240992662044&name=Madrid'));
		const headline = page.locator('section.b1 h2');
		await expect(headline).toContainText('Partielle');
		await expect(headline).toContainText('99');
		await expect(headline).not.toContainText('100');
	});
});
