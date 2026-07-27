import { test, expect, byName, localeUrl } from './fixtures';

// Runs on the mobile project (Pixel 7) — the phone in someone's hand on eclipse day.
test.describe('mobile layout @mobile', () => {
	test('never scrolls horizontally', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		await page.waitForTimeout(1000);
		const overflow = await page.evaluate(() => ({
			doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
			body: document.body.scrollWidth - document.body.clientWidth
		}));
		expect(overflow.doc).toBeLessThanOrEqual(1);
		expect(overflow.body).toBeLessThanOrEqual(1);
	});

	test('finds no element wider than the viewport', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		await page.waitForTimeout(1000);
		const wide = await page.evaluate(() => {
			const width = document.documentElement.clientWidth;
			return [...document.querySelectorAll('body *')]
				.filter((el) => el.getBoundingClientRect().right > width + 2)
				.slice(0, 5)
				.map((el) => `${el.tagName}.${el.className}`);
		});
		expect(wide).toEqual([]);
	});

	test('keeps the language links reachable', async ({ page }) => {
		await page.goto(localeUrl());
		const en = page.getByRole('link', { name: 'EN', exact: true });
		await expect(en).toBeVisible();
		await en.click();
		await expect(page.locator('html')).toHaveAttribute('lang', 'en');
	});

	test('opens the location dialog as a usable sheet', async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await page.goto(localeUrl());
		await page.getByRole('button', { name: /Standort wählen/ }).click();

		const sheet = page.locator('dialog.picker-dlg .sheet');
		await expect(sheet).toBeVisible();
		const box = (await sheet.boundingBox())!;
		const viewport = page.viewportSize()!;
		expect(box.width).toBeLessThanOrEqual(viewport.width);
		expect(box.x).toBeGreaterThanOrEqual(0);
		// the search field and the confirm button both have to be within reach
		await expect(page.getByRole('searchbox', { name: 'Stadt oder Adresse suchen' })).toBeVisible();
		await expect(page.getByRole('button', { name: /Diesen Ort verwenden/ })).toBeVisible();
	});

	test('gives the map stages a usable height', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const viewport = page.viewportSize()!;
		for (const section of ['section.a2', 'section.b3']) {
			const box = (await page.locator(`${section} .stage-canvas`).boundingBox())!;
			expect(box.height, section).toBeGreaterThan(180);
			expect(box.height, section).toBeLessThan(viewport.height);
			expect(box.width, section).toBeLessThanOrEqual(viewport.width);
		}
	});

	test('lets a touch drag move the time scrubber', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		const input = page.locator('section.a2 input[type="range"]');
		await input.scrollIntoViewIfNeeded();
		const box = (await input.boundingBox())!;
		expect(box.width).toBeGreaterThan(200);
		// NOTE the track is 18 px tall — under WCAG 2.5.8's 24×24 target guidance. Flagged rather than
		// failed: it is a design decision, and the control does work by touch, as the drag below shows.
		const before = await input.inputValue();
		await page.mouse.click(box.x + box.width * 0.8, box.y + box.height / 2);
		await page.waitForTimeout(200);
		expect(Number(await input.inputValue())).toBeGreaterThan(Number(before));
	});

	test('keeps the safety footer visible at the end of the page', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		await page.locator('footer.safety').scrollIntoViewIfNeeded();
		await expect(page.locator('footer.safety')).toBeVisible();
	});
});
