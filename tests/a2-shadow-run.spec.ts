import { test, expect, mapReady, setFrame, maxFrame } from './fixtures';

const A2 = 'section.a2';

test.describe('A2 shadow run @webgl', () => {
	test.beforeEach(async ({ page, stubGeocoder }) => {
		await stubGeocoder();
		await page.goto('/');
		await mapReady(page, A2);
	});

	test('renders the globe and clears the loading state', async ({ page }) => {
		await expect(page.locator(`${A2} canvas`)).toBeVisible();
		await expect(page.locator(`${A2} .stage-loading`)).toHaveCount(0);
	});

	test('draws the corridor and the percent labels', async ({ page }) => {
		// The labels are DOM markers, so they are the observable proof the reference overlay came up.
		await expect(page.locator(`${A2} .iso-label`).first()).toBeVisible();
		const labels = await page.locator(`${A2} .iso-label`).allInnerTexts();
		expect(labels.join(' ')).toContain('100 %');
	});

	test('sweeps the umbra east as the scrubber moves', async ({ page }) => {
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

	test('shows the frame time and advances it with the slider', async ({ page }) => {
		const clock = page.locator(`${A2} .readout .clock`);
		await setFrame(page, A2, 0);
		const first = await clock.innerText();
		await setFrame(page, A2, await maxFrame(page, A2));
		const last = await clock.innerText();
		expect(first).toMatch(/\d\d:\d\d/);
		expect(last).not.toBe(first);
	});

	test('covers the whole animation window on the slider', async ({ page }) => {
		// 16:45–18:45 UTC in 30 s steps = 240 intervals.
		expect(await maxFrame(page, A2)).toBe(240);
	});

	test('hides and restores the reference overlay from the eye toggle', async ({ page }) => {
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

	test('offers the MapLibre navigation and fullscreen controls', async ({ page }) => {
		await expect(page.locator(`${A2} .maplibregl-ctrl-zoom-in`)).toBeVisible();
		await expect(page.locator(`${A2} .maplibregl-ctrl-fullscreen`)).toBeVisible();
	});

	test('keeps its attribution visible', async ({ page }) => {
		await expect(page.locator(`${A2} .maplibregl-ctrl-attrib`)).toBeVisible();
	});
});
