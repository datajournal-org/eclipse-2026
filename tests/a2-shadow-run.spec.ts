import { test, expect, mapReady, setFrame, maxFrame, slider, localeUrl, openSharedPage } from './fixtures';
import type { Map as MlMap } from 'maplibre-gl';

const A2 = 'section.a2';

test.describe('A2 shadow run @webgl', () => {
	// One globe for the whole file — building it costs ~2 s and every test here inspects the same one.
	test.describe.configure({ mode: 'serial' });
	let page: import('@playwright/test').Page;
	let initialFrame: string;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedPage(browser, localeUrl());
		await mapReady(page, A2);
		// The frame the page opens on, not 0: at 16:45 UTC the umbra has not reached Earth, so frame 0
		// legitimately has no shadow and no percent labels to find.
		initialFrame = await slider(page, A2).inputValue();
	});

	test.afterAll(async () => {
		await page.context().close();
	});

	test.beforeEach(async () => {
		// Back to the opening frame and overlay on, so no test inherits another's state.
		await setFrame(page, A2, Number(initialFrame));
		const toggle = page.getByRole('button', { name: 'Linien & Korridor ein/aus' });
		if ((await toggle.getAttribute('aria-pressed')) === 'false') await toggle.click();
	});

	test('renders the globe and clears the loading state', async () => {
		await expect(page.locator(`${A2} canvas`)).toBeVisible();
		await expect(page.locator(`${A2} .stage-loading`)).toHaveCount(0);
	});

	test('draws the corridor and the percent labels', async () => {
		// The labels are DOM markers, so they are the observable proof the reference overlay came up.
		await expect(page.locator(`${A2} .iso-label`).first()).toBeVisible();
		const labels = await page.locator(`${A2} .iso-label`).allInnerTexts();
		expect(labels.join(' ')).toContain('100 %');
	});

	test('sweeps the umbra east as the scrubber moves', async () => {
		// The percent labels are anchored to the umbra, so their screen position tracks the shadow.
		const label = page.locator(`${A2} .iso-label`).first();
		const at = async (frame: number) => {
			await setFrame(page, A2, frame);
			await page.waitForTimeout(150);
			return label.boundingBox();
		};
		const max = await maxFrame(page, A2);
		const early = await at(Math.round(max * 0.35));
		const late = await at(Math.round(max * 0.75));
		expect(early).not.toBeNull();
		expect(late).not.toBeNull();
		// over the second half of the run the shadow crosses the Atlantic toward Spain: right and down
		expect(late!.x).toBeGreaterThan(early!.x);
		expect(late!.y).toBeGreaterThan(early!.y);
	});

	test('shows the frame time and advances it with the slider', async () => {
		const clock = page.locator(`${A2} .readout .clock`);
		await setFrame(page, A2, 0);
		const first = await clock.innerText();
		await setFrame(page, A2, await maxFrame(page, A2));
		const last = await clock.innerText();
		expect(first).toMatch(/\d\d:\d\d/);
		expect(last).not.toBe(first);
	});

	test('covers the whole animation window on the slider', async () => {
		// 16:45–18:45 UTC in 30 s steps = 240 intervals.
		expect(await maxFrame(page, A2)).toBe(240);
	});

	test('hides and restores the reference overlay from the eye toggle', async () => {
		const toggle = page.getByRole('button', { name: 'Linien & Korridor ein/aus' });
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator(`${A2} .iso-label`).first()).toBeVisible();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'false');
		await expect(page.locator(`${A2} .iso-label`).first()).toBeHidden();

		await toggle.click();
		await expect(toggle).toHaveAttribute('aria-pressed', 'true');
		await expect(page.locator(`${A2} .iso-label`).first()).toBeVisible();
	});

	test('offers the MapLibre navigation and fullscreen controls', async () => {
		await expect(page.locator(`${A2} .maplibregl-ctrl-zoom-in`)).toBeVisible();
		await expect(page.locator(`${A2} .maplibregl-ctrl-fullscreen`)).toBeVisible();
	});

	test('keeps its attribution visible', async () => {
		await expect(page.locator(`${A2} .maplibregl-ctrl-attrib`)).toBeVisible();
	});
});

/**
 * The opening shot must fit the stage it is drawn on. Under globe projection a zoom level fixes the
 * globe's size in PIXELS — the container's width does not enter into it — so a value framed on a desktop
 * stage drew a 406 px globe into a 390 px phone stage and lost its left and right edges. These run at
 * real viewport sizes rather than through the shared page, because the whole point is the container.
 */
test.describe('A2 opening framing', () => {
	/** Radius of the globe's silhouette in CSS pixels: centre → the point 90° of arc away. */
	const globeDiameter = (page: import('@playwright/test').Page) =>
		page.evaluate(() => {
			const m = (window as unknown as { __map: MlMap }).__map;
			const c = m.getCenter();
			const edge = m.project([c.lng + 90, c.lat]);
			const mid = m.project([c.lng, c.lat]);
			return 2 * Math.hypot(edge.x - mid.x, edge.y - mid.y);
		});

	const stageBox = (page: import('@playwright/test').Page) =>
		page.locator(`${A2} .stage-canvas`).evaluate((el) => {
			const r = el.getBoundingClientRect();
			return { width: r.width, height: r.height };
		});

	for (const size of [
		{ label: 'desktop', width: 1440, height: 900 },
		{ label: 'phone', width: 390, height: 844 },
		{ label: 'small phone', width: 320, height: 690 }
	]) {
		test(`fits the stage on ${size.label} @webgl`, async ({ page }) => {
			await page.setViewportSize({ width: size.width, height: size.height });
			await page.goto(localeUrl('de', '?debug'));
			await mapReady(page, A2);
			const [diameter, stage] = await Promise.all([globeDiameter(page), stageBox(page)]);
			const shortest = Math.min(stage.width, stage.height);
			expect(
				diameter,
				`globe ⌀${Math.round(diameter)} in a ${Math.round(stage.width)}×${Math.round(stage.height)} px stage`
			).toBeLessThanOrEqual(stage.width);
			// ...and still fills it: a globe that fits by being tiny is not a fix. Measured against the
			// stage's SHORTEST side, which is the height on a desktop and the width on a phone.
			expect(diameter).toBeGreaterThan(shortest * 0.7);
		});
	}

	test('keeps the hand-tuned framing where there is room @webgl', async ({ page }) => {
		// maxZoom pins the wide case, so a desktop opens exactly as it did before the fit was added.
		await page.setViewportSize({ width: 1440, height: 900 });
		await page.goto(localeUrl('de', '?debug'));
		await mapReady(page, A2);
		const view = await page.evaluate(() => {
			const m = (window as unknown as { __map: MlMap }).__map;
			return { zoom: m.getZoom(), lat: m.getCenter().lat, lng: m.getCenter().lng };
		});
		expect(view.zoom).toBeCloseTo(1.21, 2);
		expect(view.lat).toBeCloseTo(50, 1); // not the 59.7° a plain fitBounds would have produced
		expect(view.lng).toBeCloseTo(-18, 1);
	});
});
