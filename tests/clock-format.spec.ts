import { test, expect, mapReady, localeUrl, byName, setFrame, maxFrame } from './fixtures';

const B3 = 'section.b3';
const OVIEDO = byName('Oviedo');

/**
 * Clock formatting, in the one place a reader watches it change: the B3 scrubber readout.
 *
 * Anchorage rather than a European zone on purpose — Oviedo's maximum (18:27 UTC) is 10:27 there, so the
 * window straddles 9 → 10 and exercises both a one- and a two-digit hour in a single scrub.
 */
test.use({ locale: 'en-US', timezoneId: 'America/Anchorage' });

test.describe('clock format @webgl', () => {
	const readout = (page: import('@playwright/test').Page) =>
		page.locator(`${B3} .readout`).evaluate((el) => {
			const clock = el.querySelector('.clock') as HTMLElement;
			const chip = clock.nextElementSibling as HTMLElement;
			return { text: clock.textContent!.trim(), chipX: +chip.getBoundingClientRect().x.toFixed(1) };
		});

	test('writes the hour unpadded, and never shifts what follows it', async ({ page }) => {
		await page.goto(localeUrl('en', `?lat=${OVIEDO.lat}&lon=${OVIEDO.lon}`));
		await mapReady(page, B3);
		const max = await maxFrame(page, B3);

		const seen: { text: string; chipX: number }[] = [];
		for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
			await setFrame(page, B3, Math.round(max * fraction));
			seen.push(await readout(page));
		}

		// "07:30 AM" reads as a timetable; a clock says "7:30 AM".
		for (const { text } of seen) expect(text, text).toMatch(/^\d{1,2}:\d{2}\s?[AP]M$/);
		expect(
			seen.some(({ text }) => /^\d:/.test(text)),
			`no single-digit hour in ${JSON.stringify(seen)}`
		).toBe(true);
		expect(
			seen.some(({ text }) => /^\d{2}:/.test(text)),
			`no two-digit hour in ${JSON.stringify(seen)}`
		).toBe(true);

		// The unpadded hour makes the clock a digit narrower for half the window, so the chips beside it
		// would step sideways mid-scrub without the width `.clock` reserves. They must not move at all.
		const xs = new Set(seen.map((s) => s.chipX));
		expect(xs.size, `chip moved: ${JSON.stringify(seen)}`).toBe(1);
	});
});
