import { test, expect, mapReady, byName, localeUrl, openSharedPage } from './fixtures';

const B3 = 'section.b3';
const OVIEDO = byName('Oviedo');

/**
 * The stage canvas' centre in VIEWPORT coordinates — which is what page.mouse takes. B3 sits well below
 * the fold, so the section has to be scrolled into view first or every synthetic click lands on nothing.
 */
async function stageCentre(page: import('@playwright/test').Page) {
	await page.locator(`${B3} .stage-canvas`).scrollIntoViewIfNeeded();
	await page.waitForTimeout(150); // let smooth scrolling settle before measuring
	const box = (await page.locator(`${B3} .stage-canvas`).boundingBox())!;
	return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}

/**
 * The Sun locator's own transform, which the render loop rewrites every frame — plus whether it is
 * currently shown. Reading the transform (not boundingBox) matters: when the Sun leaves the frame the
 * element is only class-hidden, so its box keeps reporting the last on-screen position.
 */
async function locatorState(page: import('@playwright/test').Page) {
	return page.locator(`${B3} .b3-locator`).evaluate((el) => ({
		visible: !el.classList.contains('hidden'),
		transform: (el as HTMLElement).style.transform
	}));
}

test.describe('B3 camera @webgl', () => {
	// Serial + one shared page: building the B3 scene costs ~2 s and every test here drives that same
	// scene. Each test restores the camera first, so they stay independent of each other's gestures.
	test.describe.configure({ mode: 'serial' });
	let page: import('@playwright/test').Page;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedPage(browser, localeUrl('de', `?lat=${OVIEDO.lat}&lon=${OVIEDO.lon}`));
		await mapReady(page, B3);
	});

	test.afterAll(async () => {
		await page.context().close();
	});

	test.beforeEach(async () => {
		// Reset the camera so one test's drag cannot leak into the next.
		await page.locator(`${B3} .b3-recenter`).click();
		await page.waitForTimeout(400);
	});

	test('orbits the scene when the canvas is dragged sideways', async () => {
		const before = await locatorState(page);
		expect(before.visible).toBe(true);
		const { x, y } = await stageCentre(page);

		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 120, y, { steps: 12 });
		await page.mouse.up();
		await page.waitForTimeout(400);

		// Turning the camera moves the Sun across the frame — either to a new spot, or out of it.
		const after = await locatorState(page);
		expect(after.visible !== before.visible || after.transform !== before.transform).toBe(true);
	});

	test('shows a grab cursor over the canvas', async () => {
		await stageCentre(page);
		const cursor = await page.locator(`${B3} canvas`).evaluate((el) => getComputedStyle(el).cursor);
		expect(cursor).toBe('grab');
	});

	test('offers only the recentre control — zooming is gesture-only', async () => {
		// Wheel, pinch and double-click drive the dolly; the +/- buttons are deliberately gone.
		await expect(page.locator(`${B3} .maplibregl-ctrl-zoom-in`)).toHaveCount(0);
		await expect(page.locator(`${B3} .maplibregl-ctrl-zoom-out`)).toHaveCount(0);
		const recentre = page.locator(`${B3} .b3-recenter`);
		await expect(recentre).toBeVisible();
		// Translated at runtime, so assert a non-empty label rather than pinning copy.
		await expect(recentre).toHaveAttribute('aria-label', /\S/);
	});

	test('dollies the scene by wheel without parallaxing the Sun', async () => {
		// Zoom is a dolly: the camera moves hundreds of metres, the near terrain grows, and the Sun must
		// NOT move — the sky is camera-anchored (sunLayer.ts), so it behaves as if at infinity. The old
		// observer-anchored placement put it 30 km out, and this very dolly swung it visibly against the
		// horizon.
		const before = await locatorState(page);
		expect(before.visible).toBe(true);
		const scene = () => page.locator(`${B3} .stage-canvas canvas`).screenshot();
		const sceneBefore = await scene();

		const { x, y } = await stageCentre(page);
		await page.mouse.move(x, y);
		await page.mouse.wheel(0, 600); // scroll down → dolly out
		await page.waitForTimeout(900);

		expect((await scene()).equals(sceneBefore), 'the dolly moved nothing at all').toBe(false);
		const after = await locatorState(page);
		expect(after.visible).toBe(true);
		// The locator is re-glued to the projected Sun every rendered frame; parse its translate() and
		// allow sub-pixel re-rounding.
		const px = (t: string) =>
			t
				.match(/-?[\d.]+/g)!
				.slice(0, 2)
				.map(Number);
		const [x0, y0] = px(before.transform);
		const [x1, y1] = px(after.transform);
		expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(2);
	});

	test('zooms on the wheel without scrolling the page', async () => {
		// The wheel is captured by the dolly (as on the A2 globe), so the page must stay put.
		const { x, y } = await stageCentre(page);
		const scrollBefore = await page.evaluate(() => window.scrollY);
		const scene = () => page.locator(`${B3} .stage-canvas canvas`).screenshot();
		const sceneBefore = await scene();
		await page.mouse.move(x, y);
		await page.mouse.wheel(0, -300);
		await page.waitForTimeout(600);
		expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
		expect((await scene()).equals(sceneBefore), 'the wheel dollied nothing').toBe(false);
	});

	test('goes fullscreen with the time slider riding along', async () => {
		// The fullscreen target is the map+timebar wrapper, not the bare canvas: a fullscreen sky view
		// without its slider would freeze the reader at one instant of the eclipse.
		const fs = page.locator(`${B3} .maplibregl-ctrl-fullscreen`);
		await expect(fs).toBeVisible();
		await fs.click();
		await expect.poll(() => page.evaluate(() => document.fullscreenElement?.className ?? null)).toContain('b3-stage');
		await expect(page.locator(`${B3} .timebar input[type="range"]`)).toBeVisible();
		// leave through the control (it toggles to "shrink"): the Escape key is browser chrome that a
		// synthetic keypress cannot reach — and this file's shared page must not stay fullscreen.
		await page.locator(`${B3} .maplibregl-ctrl-shrink`).click();
		await expect.poll(() => page.evaluate(() => document.fullscreenElement)).toBeNull();
	});

	test('labels the horizon with localized compass points', async () => {
		// The German page: the shot faces the setting Sun (~west), so W must be on screen — and in this
		// locale east would be O, so a hardcoded ASCII compass would fail here by design.
		const visible = page.locator(`${B3} .b3-compass span:not(.hidden)`);
		await expect(visible.filter({ hasText: /^W$/ })).toHaveCount(1);
		// A ~100° horizontal field of view shows a handful of the eight points, never all of them.
		const n = await visible.count();
		expect(n).toBeGreaterThanOrEqual(2);
		expect(n).toBeLessThan(8);
	});

	test('sweeps the compass with the orbit and restores it on reset', async () => {
		const west = page.locator(`${B3} .b3-compass span`, { hasText: /^W$/ });
		const xOf = async () => Number((await west.evaluate((el) => el.style.transform)).match(/-?[\d.]+/)![0]);
		const before = await xOf();

		const { x, y } = await stageCentre(page);
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 120, y, { steps: 10 }); // drag right → the camera turns left → labels sweep right
		await page.mouse.up();
		await page.waitForTimeout(400);
		expect(await xOf()).toBeGreaterThan(before + 40);

		await page.locator(`${B3} .b3-recenter`).click();
		await page.waitForTimeout(400);
		expect(Math.abs((await xOf()) - before)).toBeLessThan(2);
	});

	test('keeps the compass still while dollying, like the rest of the sky', async () => {
		// The ruler is camera-anchored (compassLayer.ts) — the same no-parallax property the Sun has.
		const west = page.locator(`${B3} .b3-compass span`, { hasText: /^W$/ });
		const posOf = async () =>
			(await west.evaluate((el) => el.style.transform))
				.match(/-?[\d.]+/g)!
				.slice(0, 2)
				.map(Number);
		const [x0, y0] = await posOf();
		const { x, y } = await stageCentre(page);
		await page.mouse.move(x, y);
		await page.mouse.wheel(0, 600); // dolly out by wheel — the buttons are gone
		await page.waitForTimeout(900);
		const [x1, y1] = await posOf();
		expect(Math.hypot(x1 - x0, y1 - y0)).toBeLessThan(2);
	});

	test('carries the compass point in the azimuth readout', async () => {
		// The textual counterpart of the ruler — and the only orientation assistive tech gets, since the
		// on-canvas labels are aria-hidden.
		await expect(page.locator(`${B3} .readout`)).toContainText(/\(\w{1,2}\)/);
	});

	test('restores the framing from the recentre button', async () => {
		const before = await locatorState(page);
		expect(before.visible).toBe(true);
		const { x, y } = await stageCentre(page);

		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(x + 120, y, { steps: 10 });
		await page.mouse.up();
		await page.waitForTimeout(400);
		const dragged = await locatorState(page);
		expect(dragged.transform).not.toBe(before.transform);

		// the last control in the B3 group is the recentre button
		await page.locator(`${B3} .b3-recenter`).click();
		await page.waitForTimeout(800);

		const after = await locatorState(page);
		expect(after.visible).toBe(true);
		expect(after.transform).toBe(before.transform);
	});

	test('leaves the page scrollable outside the stage', async () => {
		await page.evaluate(() => window.scrollTo(0, 0));
		await page.mouse.move(10, 300); // the page margin, clear of any map
		await page.mouse.wheel(0, 400);
		await page.waitForTimeout(300);
		expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
	});
});
