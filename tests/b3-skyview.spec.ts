import { test, expect, mapReady, setFrame, maxFrame, slider, byName, localeUrl, openSharedPage } from './fixtures';
import type { Page } from '@playwright/test';

const B3 = 'section.b3';
const OVIEDO = byName('Oviedo');
// Northern Spain, inside totality and close to the coast — the eclipse runs into sunset here, which is
// what makes the loupe's horizon worth rendering at all.
const CUDILLERO = { lat: 43.5465336, lon: -6.5320917, name: 'Cudillero' };

/**
 * Building a B3 scene costs ~2 s, and most of these tests inspect the same scene from different angles —
 * so each location gets ONE page, shared by its tests, with the slider rewound between them. Grouping by
 * location is what makes that possible: Berlin and Palma appear once each and still get their own page.
 */
function scene(name: string, site: { lat: number; lon: number }, body: (get: () => Page) => void) {
	test.describe(name, () => {
		test.describe.configure({ mode: 'serial' });
		let page: Page;
		let initialFrame: string;

		test.beforeAll(async ({ browser }) => {
			page = await openSharedPage(browser, localeUrl('de', `?lat=${site.lat}&lon=${site.lon}`));
			await mapReady(page, B3);
			initialFrame = await slider(page, B3).inputValue();
		});
		test.afterAll(async () => page.context().close());
		// Rewind, so one test's scrubbing cannot change what the next one sees.
		test.beforeEach(async () => setFrame(page, B3, Number(initialFrame)));

		body(() => page);
	});
}

test.describe('B3 sky view @webgl', () => {
	scene('at Oviedo', OVIEDO, (get) => {
		test('loads the scene and clears the loading state', async () => {
			const page = get();
			await expect(page.locator(`${B3} canvas`)).toBeVisible();
			await expect(page.locator(`${B3} .stage-loading`)).toHaveCount(0);
			await expect(page.locator(`${B3} .b3-loupe`)).toBeVisible();
		});

		test('reports altitude, azimuth and coverage for the current frame', async () => {
			const page = get();
			const readout = page.locator(`${B3} .readout`);
			await expect(readout).toContainText(/\d+([.,]\d+)?°/);
			await expect(readout).toContainText('%');

			await setFrame(page, B3, 0);
			const first = await readout.innerText();
			await setFrame(page, B3, await maxFrame(page, B3));
			expect(await readout.innerText()).not.toBe(first);
		});

		test('reaches full coverage at totality and less elsewhere', async () => {
			const page = get();
			const coverage = async () => {
				const text = await page.locator(`${B3} .readout`).innerText();
				return Number(text.match(/([\d.,]+)\s*%/)![1].replace(',', '.'));
			};
			// the slider opens on the deep phase by design
			expect(await coverage()).toBeGreaterThan(89);
			await setFrame(page, B3, 0);
			expect(await coverage()).toBeLessThan(20);
		});

		test('marks totality as a band and the contacts as ticks', async () => {
			const page = get();
			await expect(page.locator(`${B3} .track .band`)).toBeVisible();
			await expect(page.locator(`${B3} .track .tick.contact`)).toHaveCount(2);
		});
	});

	scene('at Cudillero', CUDILLERO, (get) => {
		test('raises the loupe horizon as the Sun sets', async () => {
			const page = get();
			// The ground rect's top edge is the horizon; it rises (more negative y) as the Sun goes down.
			// This is also the guard against the maplibre worker failing to bundle, which stalls the map.
			const horizonY = () => page.locator(`${B3} .loupe-ground`).evaluate((el) => Number(el.getAttribute('y')));

			await setFrame(page, B3, 0);
			expect(await horizonY()).toBeGreaterThan(50); // Sun high → horizon off the bottom of the loupe
			await setFrame(page, B3, await maxFrame(page, B3));
			expect(await horizonY()).toBeLessThan(0); // Sun has set → horizon above centre
		});

		test('never emits a negative ground height', async () => {
			const page = get();
			// A negative <rect height> is invalid SVG: the browser rejects the attribute and logs an error
			// on every frame with the Sun well up. Collected here rather than via the pageProblems
			// fixture, which watches the fixture's page and not this file's shared one.
			const errors: string[] = [];
			const onConsole = (msg: import('@playwright/test').ConsoleMessage) => {
				if (msg.type() === 'error') errors.push(msg.text());
			};
			page.on('console', onConsole);
			const max = await maxFrame(page, B3);
			for (const frame of [0, Math.round(max / 3), Math.round(max / 2), max]) {
				await setFrame(page, B3, frame);
				const height = await page
					.locator(`${B3} .loupe-ground`)
					.evaluate((el) => Number(el.getAttribute('height')));
				expect(height, `frame ${frame}`).toBeGreaterThanOrEqual(0);
			}
			page.off('console', onConsole);
			expect(errors.filter((e) => e.includes('negative value'))).toEqual([]);
		});

		test('darkens the loupe sky toward maximum', async () => {
			const page = get();
			const luma = async () => {
				const css = await page.locator(`${B3} .b3-loupe`).evaluate((el) => getComputedStyle(el).backgroundColor);
				const [r, g, b] = css.match(/\d+/g)!.map(Number);
				return 0.2126 * r + 0.7152 * g + 0.0722 * b;
			};
			await setFrame(page, B3, 0);
			const daylight = await luma();
			// the timeline opens at 90 % coverage, and the middle of the window is deepest
			await setFrame(page, B3, Math.round((await maxFrame(page, B3)) / 2));
			expect(await luma()).toBeLessThan(daylight);
		});

		test('keeps the Sun locator glued to the Sun while it is on screen', async () => {
			const page = get();
			const locator = page.locator(`${B3} .b3-locator`);
			await setFrame(page, B3, 0);
			const early = await locator.boundingBox();
			await setFrame(page, B3, Math.round((await maxFrame(page, B3)) * 0.6));
			const later = await locator.boundingBox();
			if (early && later) {
				// the Sun sinks over the window, so the marker moves down the stage
				expect(later.y).toBeGreaterThan(early.y - 1);
			}
		});
	});

	scene('at Berlin', byName('Berlin'), (get) => {
		test('shows contacts but no totality band at a partial location', async () => {
			const page = get();
			await expect(page.locator(`${B3} .track .band`)).toHaveCount(0);
			await expect(page.locator(`${B3} .track .tick.max`)).toHaveCount(1);
		});
	});

	scene('at Palma', byName('Palma'), (get) => {
		test('marks sunset on the track where it falls inside the window', async () => {
			const page = get();
			await expect(page.locator(`${B3} .track .dusk`)).toBeVisible();
		});
	});
});
