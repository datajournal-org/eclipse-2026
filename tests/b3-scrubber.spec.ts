import { test, expect, mapReady, slider, maxFrame, setFrame, byName, localeUrl, openSharedPage } from './fixtures';

const B3 = 'section.b3';
const OVIEDO = byName('Oviedo');

test.describe('B3 time scrubber @webgl', () => {
	// One B3 scene for the whole file — every test here drives the same slider over the same location.
	test.describe.configure({ mode: 'serial' });
	let page: import('@playwright/test').Page;
	let initialFrame: string;

	test.beforeAll(async ({ browser }) => {
		page = await openSharedPage(browser, localeUrl('de', `?lat=${OVIEDO.lat}&lon=${OVIEDO.lon}`));
		await mapReady(page, B3);
		initialFrame = await slider(page, B3).inputValue();
	});

	test.afterAll(async () => {
		await page.context().close();
	});

	test.beforeEach(async () => {
		// Restore the opening frame so one test's scrubbing cannot change what the next one sees.
		await setFrame(page, B3, Number(initialFrame));
	});

	test('is a labelled range input over the local eclipse', async () => {
		const input = slider(page, B3);
		await expect(input).toHaveAttribute('aria-label', /\S/);
		await expect(input).toHaveAttribute('min', '0');
		// One frame ≈ 10 s of the local window (timeline.ts), so Oviedo's ~2.2 h window needs ~780
		// frames — a range, not a constant, so a padding tweak doesn't fail the spec.
		const max = await maxFrame(page, B3);
		expect(max).toBeGreaterThan(600);
		expect(max).toBeLessThan(1100);
	});

	test('moves with the arrow keys', async () => {
		const input = slider(page, B3);
		await input.focus();
		const before = await input.inputValue();
		await page.keyboard.press('ArrowRight');
		await page.keyboard.press('ArrowRight');
		expect(Number(await input.inputValue())).toBe(Number(before) + 2);
		await page.keyboard.press('ArrowLeft');
		expect(Number(await input.inputValue())).toBe(Number(before) + 1);
	});

	test('jumps to the ends with Home and End', async () => {
		const input = slider(page, B3);
		await input.focus();
		await page.keyboard.press('Home');
		expect(await input.inputValue()).toBe('0');
		await page.keyboard.press('End');
		expect(await input.inputValue()).toBe(String(await maxFrame(page, B3)));
	});

	test('updates the readout as the slider moves', async () => {
		const clock = page.locator(`${B3} .readout .clock`);
		await setFrame(page, B3, 0);
		const first = await clock.innerText();
		await setFrame(page, B3, 200);
		expect(await clock.innerText()).not.toBe(first);
		expect(first).toMatch(/\d\d:\d\d/);
	});

	test('jumps to a phase when its label is clicked', async () => {
		const input = slider(page, B3);
		await setFrame(page, B3, 0);
		const label = page.locator(`${B3} .labels .lab`).first();
		await label.scrollIntoViewIfNeeded();
		await label.click();
		expect(Number(await input.inputValue())).toBeGreaterThan(0);
	});

	test('jumps to maximum from the totality band label', async () => {
		const input = slider(page, B3);
		await setFrame(page, B3, 0);
		// at a total location "Maximum" is carried by the totality band, not a standalone tick
		const band = page.locator(`${B3} .labels .lab`).filter({ hasText: 'Maximum' });
		await expect(band).toHaveCount(1);
		await band.scrollIntoViewIfNeeded();
		await band.click();
		await page.waitForTimeout(300);
		const frame = Number(await input.inputValue());
		expect(frame).toBeGreaterThan(0);
		// at maximum the coverage readout is at its highest
		const coverage = Number(
			(await page.locator(`${B3} .readout`).innerText()).match(/([\d.,]+)\s*%/)![1].replace(',', '.')
		);
		expect(coverage).toBeGreaterThan(95);
	});

	test('labels every phase for screen readers', async () => {
		const labels = page.locator(`${B3} .labels .lab`);
		const count = await labels.count();
		expect(count).toBeGreaterThan(1);
		for (let i = 0; i < count; i++) {
			await expect(labels.nth(i)).toHaveAttribute('aria-label', /\S/);
		}
	});

	test('scrubs across the whole range without error', async () => {
		// The pageProblems fixture watches the fixture's page, not this file's shared one, so collect
		// console errors here instead.
		const errors: string[] = [];
		const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
			if (msg.type() === 'error') errors.push(msg.text());
		};
		page.on('console', onConsole);
		// The "check scrubbing performance" risk in ARCHITECTURE.md: every frame recomputes the geometry
		// and redraws the scene. No wall-clock budget is asserted — under headless software GL the time
		// is dominated by rasterisation, so a threshold here would measure swiftshader, not this app.
		// What it does prove is that a full sweep produces a live readout and no errors at any point.
		const max = await maxFrame(page, B3);
		const readouts = new Set<string>();
		for (let frame = 0; frame <= max; frame += 20) {
			await setFrame(page, B3, frame);
			readouts.add(await page.locator(`${B3} .readout .clock`).innerText());
		}
		page.off('console', onConsole);
		expect(readouts.size).toBeGreaterThan(10); // every sampled frame produced a distinct time
		expect(errors).toEqual([]);
	});

	test('keeps the A2 and B3 sliders independent', async () => {
		await setFrame(page, B3, 10);
		await setFrame(page, 'section.a2', 200);
		expect(await slider(page, B3).inputValue()).toBe('10');
	});
});
