import { test, expect } from '@playwright/test';

// A northern-Spain totality location → B3 (SkyView) renders and its loupe shows the sunset horizon.
const LOCATION = '/?lat=43.5465336&lon=-6.5320917';

test('B3 loads and the loupe horizon rises at sunset', async ({ page }) => {
	test.setTimeout(60_000);
	await page.goto(LOCATION);

	// The loupe only shows once B3's vector map has finished loading — a guard against the maplibre worker
	// failing to bundle (which 404s and stalls the map indefinitely).
	const loupe = page.locator('section.b3 .b3-loupe');
	await expect(loupe).toBeVisible({ timeout: 45_000 });

	const slider = page.locator('section.b3 input[type="range"]');
	const max = Number(await slider.getAttribute('max'));
	const horizonY = () => page.locator('section.b3 .loupe-horizon').evaluate((el) => Number(el.getAttribute('y1')));
	const setFrame = (f: number) =>
		slider
			.evaluate((el, v) => {
				(el as HTMLInputElement).value = String(v);
				el.dispatchEvent(new Event('input', { bubbles: true }));
			}, f)
			.then(() => page.waitForTimeout(60));

	await setFrame(0);
	expect(await horizonY()).toBeGreaterThan(50); // Sun high → horizon off the bottom of the loupe
	await setFrame(max);
	expect(await horizonY()).toBeLessThan(0); // end of window → horizon risen above centre (Sun has set)
});
