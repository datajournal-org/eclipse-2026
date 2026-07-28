import { test, expect, byName, localeUrl, mapReady, switchLanguage } from './fixtures';

// Runs on the mobile project (Pixel 7) — the phone in someone's hand on eclipse day.
test.describe('mobile layout @mobile', () => {
	test('declares a non-scalable viewport', async ({ page }) => {
		// The maps carry their own zoom; pinching mid-gesture should never scale the page chrome.
		// (iOS ignores user-scalable for pinch — the touch-action rule below the fold covers the
		// double-tap vector there; Android honours this outright.)
		await page.goto(localeUrl());
		const content = await page.locator('meta[name="viewport"]').getAttribute('content');
		expect(content).toContain('maximum-scale=1');
		expect(content).toContain('user-scalable=no');
		expect(await page.evaluate(() => getComputedStyle(document.documentElement).touchAction)).toBe('manipulation');
	});

	test('never scrolls horizontally', async ({ page, locatedPage }) => {
		await locatedPage(byName('Oviedo'));
		// ...and the page is GLUED to the viewport: horizontal overflow is clipped without creating a
		// scroll container, so canvas/slider gestures cannot nudge the page sideways.
		expect(await page.evaluate(() => getComputedStyle(document.documentElement).overflowX)).toBe('clip');
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

	test('moves the globe with two fingers only, so one finger scrolls the page @webgl', async ({ page }) => {
		// The accidental-rotation trap: a reader scrolling past the tall globe used to grab and spin it.
		// Cooperative gestures make the interaction deliberate WITHOUT disabling anything — and the
		// built-in overlay must speak the page's language, or the instruction is chrome noise.
		// Pointer-dependent: @mobile specs also run on desktop chromium, where a fine pointer rightly
		// gets direct dragging — only the touch device makes this assertion meaningful.
		test.skip(test.info().project.name !== 'mobile', 'coarse-pointer behaviour — mobile project only');
		await page.goto(localeUrl('de', '?debug'));
		await mapReady(page, 'section.a2');
		const coop = await page.evaluate(() =>
			(
				window as unknown as { __map: { cooperativeGestures: { isEnabled: () => boolean } } }
			).__map.cooperativeGestures.isEnabled()
		);
		expect(coop).toBe(true);
		await expect(page.locator('section.a2 .maplibregl-cooperative-gesture-screen')).toContainText('zwei Fingern');
	});

	test('offers no fullscreen control on a phone @webgl', async ({ page }) => {
		// A phone screen already is the full screen — the browser chrome stays either way. Holds for
		// both map screens: the A2 globe and the B3 sky view.
		test.skip(test.info().project.name !== 'mobile', 'coarse-pointer behaviour — mobile project only');
		await page.goto(localeUrl('de', '?debug&lat=43.3603&lon=-5.8448'));
		await mapReady(page, 'section.a2');
		await expect(page.locator('section.a2 .maplibregl-ctrl-fullscreen')).toHaveCount(0);
		await mapReady(page, 'section.b3');
		await expect(page.locator('section.b3 .maplibregl-ctrl-fullscreen')).toHaveCount(0);
	});

	test('keeps the language switcher usable', async ({ page }) => {
		await page.goto(localeUrl());
		await expect(page.locator('header.hdr .langs summary')).toBeVisible();
		await switchLanguage(page, 'en');
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

/**
 * How much room the two maps get. They carry dense spatial information, so on a wide screen they step
 * outside the 680 px reading column; on a phone they are capped at half the viewport so the content
 * below them stays discoverable rather than being pushed off-screen.
 */
test.describe('map sizing', () => {
	const stages = (page: import('@playwright/test').Page) =>
		page.evaluate(() => {
			const box = (sel: string) => {
				const r = document.querySelector(sel)!.getBoundingClientRect();
				return { w: r.width, h: r.height };
			};
			return {
				a2: box('section.a2 .stage-canvas'),
				b3: box('section.b3 .stage-canvas'),
				bar: box('section.a2 .timebar'),
				column: box('main.content').w,
				vh: window.innerHeight,
				overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
			};
		});

	test('never taller than half the viewport on a phone @webgl @mobile', async ({ page, locatedPage }) => {
		await page.setViewportSize({ width: 390, height: 844 });
		await locatedPage(byName('Oviedo'));
		await mapReady(page, 'section.b3');
		const s = await stages(page);
		expect(s.a2.h).toBeLessThanOrEqual(s.vh / 2 + 1);
		expect(s.b3.h).toBeLessThanOrEqual(s.vh / 2 + 1);
		// ...while still spanning the full width.
		expect(s.a2.w).toBe(390);
		expect(s.b3.w).toBe(390);
		expect(s.overflow).toBeLessThanOrEqual(1);
	});

	test('breaks out of the reading column on a desktop @webgl', async ({ page, locatedPage }) => {
		await page.setViewportSize({ width: 1440, height: 900 });
		await locatedPage(byName('Oviedo'));
		await mapReady(page, 'section.b3');
		const s = await stages(page);
		expect(s.a2.w).toBeGreaterThan(s.column);
		expect(s.b3.w).toBeGreaterThan(s.column);
		// The slider has to widen with its map, or the control ends short of what it controls.
		expect(s.bar.w).toBeGreaterThan(s.column - 64);
		// Widening must not cost a horizontal scrollbar.
		expect(s.overflow).toBeLessThanOrEqual(1);
	});
});
