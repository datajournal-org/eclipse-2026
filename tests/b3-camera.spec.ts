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
		await page.locator(`${B3} .maplibregl-ctrl-group`).last().locator('button').last().click();
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

	test('offers zoom and recentre controls', async () => {
		await expect(page.locator(`${B3} .maplibregl-ctrl-zoom-in`)).toBeVisible();
		await expect(page.locator(`${B3} .maplibregl-ctrl-zoom-out`)).toBeVisible();
		const buttons = page.locator(`${B3} .maplibregl-ctrl button`);
		expect(await buttons.count()).toBeGreaterThanOrEqual(3); // zoom in, zoom out, recentre
	});

	test('labels the camera controls', async () => {
		// Translated at runtime, so assert that each carries a non-empty label rather than pinning copy.
		await expect(page.locator(`${B3} .maplibregl-ctrl-zoom-in`)).toHaveAttribute('aria-label', /\S/);
		await expect(page.locator(`${B3} .maplibregl-ctrl-zoom-out`)).toHaveAttribute('aria-label', /\S/);
		const recentre = page.locator(`${B3} .maplibregl-ctrl-group`).last().locator('button').last();
		await expect(recentre).toHaveAttribute('aria-label', /\S/);
	});

	test('dollies the camera from the zoom buttons', async () => {
		// Zoom is a dolly: the camera moves toward the marker, so the projected Sun shifts even though
		// the sky and the Sun's angular size do not scale.
		const before = await locatorState(page);
		await page.locator(`${B3} .maplibregl-ctrl-zoom-in`).click();
		await page.waitForTimeout(700);
		const after = await locatorState(page);
		expect(after.transform).not.toBe(before.transform);
	});

	test('zooms on the wheel without scrolling the page', async () => {
		// The wheel is captured by the dolly (as on the A2 globe), so the page must stay put.
		const { x, y } = await stageCentre(page);
		const scrollBefore = await page.evaluate(() => window.scrollY);
		const before = await locatorState(page);
		await page.mouse.move(x, y);
		await page.mouse.wheel(0, -300);
		await page.waitForTimeout(600);
		expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
		expect((await locatorState(page)).transform).not.toBe(before.transform);
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
		await page.locator(`${B3} .maplibregl-ctrl-group`).last().locator('button').last().click();
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
