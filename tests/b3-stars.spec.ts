import { test, expect, mapReady, localeUrl, byName, setFrame, maxFrame } from './fixtures';
import type { Map as MlMap } from 'maplibre-gl';

const B3 = 'section.b3';
const OVIEDO = byName('Oviedo'); // total — the sky really does go dark here
const BERLIN = byName('Berlin'); // 85 % partial — it does not

type PlacedDebug = { mag: number };
const sky = (page: import('@playwright/test').Page) =>
	page.evaluate(() => {
		const w = window as unknown as { __b3stars?: number; __b3sky?: { mag: number }[] };
		return { count: w.__b3stars ?? 0, objects: (w.__b3sky ?? []) as PlacedDebug[] };
	});

const open = async (page: import('@playwright/test').Page, site: { lat: number; lon: number }) => {
	await page.goto(localeUrl('de', `?lat=${site.lat}&lon=${site.lon}&debug`));
	await mapReady(page, B3);
};

/**
 * How many bright pixels sit in the sky, read straight off the live framebuffer.
 *
 * An ABSOLUTE threshold rather than a diff against the same frame with the layer removed. The diff was
 * the obvious approach and was flaky one run in three under parallel load: two GPU readbacks taken a
 * moment apart are not guaranteed to show the same scene. Absolute works because totality has enormous
 * separation — the veiled sky measures luma ~28 while the sprites are drawn at near-white over it, and at
 * totality the Sun itself is an occulted disc with nothing bright left in the canvas.
 *
 * This test exists because the first version of the spec asserted only that objects were *placed*, and
 * passed while the screen showed nothing. Counting placements tests the arithmetic; this tests the feature.
 */
const brightSkyPixels = (page: import('@playwright/test').Page) =>
	page.evaluate(
		() =>
			new Promise<number>((resolve) => {
				const m = (window as unknown as { __b3map: MlMap }).__b3map;
				const gl = (m.getCanvas() as HTMLCanvasElement).getContext('webgl2') as WebGL2RenderingContext;
				const once = () => {
					m.off('render', once);
					// Sky half only, and inside a render callback: MapLibre's context does not preserve its
					// drawing buffer, so reading anywhere else returns black.
					const w = gl.drawingBufferWidth;
					const h = Math.round(gl.drawingBufferHeight * 0.5);
					const buf = new Uint8Array(w * h * 4);
					gl.readPixels(0, gl.drawingBufferHeight - h, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
					let bright = 0;
					for (let i = 0; i < buf.length; i += 4) {
						if (0.2126 * buf[i] + 0.7152 * buf[i + 1] + 0.0722 * buf[i + 2] > 150) bright++;
					}
					resolve(bright);
				};
				m.on('render', once);
				m.triggerRepaint();
			})
	);

test.describe('B3 stars and planets @webgl', () => {
	test('shows nothing at a partial location, at any moment of the eclipse', async ({ page }) => {
		// The concept's line about "90 % is almost total" being wrong, made enforceable: at 85 % coverage
		// the sky stays daylight-bright and a real observer sees not one star. Drawing any would be a lie.
		// Every frame, not a sample: a single frame that let one through would be the bug.
		await open(page, BERLIN);
		const max = await maxFrame(page, B3);
		// Sample every ~3 min of simulated time, independent of the slider's own resolution. Dense enough
		// that no star-visible window could hide between samples — visibility needs >95 % obscuration and
		// Berlin never exceeds 85 %, with coverage changing over tens of minutes — and sparse enough that
		// this sweep stays well inside the 30 s test budget on a loaded machine (at ~80 samples it did
		// not, and flaked exactly when the full suite ran in parallel).
		const step = Math.max(1, Math.round(max / 45));
		for (let f = 0; f <= max; f += step) {
			await setFrame(page, B3, f);
			const { count, objects } = await sky(page);
			expect(count, `frame ${f} of ${max} showed mags ${objects.map((o) => o.mag).join(', ')}`).toBe(0);
		}
	});

	test('fills the sky at totality, and only there', async ({ page }) => {
		await open(page, OVIEDO);
		const max = await maxFrame(page, B3);

		await setFrame(page, B3, 0);
		expect((await sky(page)).count, 'at first contact the Sun is still almost whole').toBe(0);

		// Totality at Oviedo lasts about 100 s inside a two-hour window — about TEN of the ~780 slider
		// positions at the 10 s resolution. A coarse sweep steps clean over it — which is exactly how an
		// earlier version of this test passed while proving nothing.
		let peak = { count: 0, objects: [] as PlacedDebug[], frame: -1 };
		// Every second frame (20 s of simulated time): totality spans ~10 frames at the 10 s resolution,
		// so this cannot step over it — and the full-density sweep breached the 30 s test budget when the
		// suite ran in parallel on a loaded machine.
		for (let f = Math.round(max * 0.45); f <= Math.round(max * 0.55); f += 2) {
			await setFrame(page, B3, f);
			const seen = await sky(page);
			if (seen.count > peak.count) peak = { ...seen, frame: f };
		}

		expect(peak.count, 'nothing appeared anywhere near maximum').toBeGreaterThan(8);
		// Venus is the object every eclipse guide tells you to look for: magnitude -4.4, 46° from the Sun.
		// The debug hook carries magnitudes only (SKY_OBJECTS has neither names nor kinds) — and only
		// Venus is brighter than -4.
		expect(peak.objects.some((o) => o.mag < -4)).toBe(true);
		// ...and it must not be alone — the stars come out too. Anything fainter than Mars (+1.29, the
		// faintest planet in this sky) is necessarily a star.
		expect(peak.objects.filter((o) => o.mag > 1.3).length).toBeGreaterThan(3);
	});

	test('actually puts them on the screen, not just in the buffers', async ({ page }) => {
		await open(page, OVIEDO);
		const max = await maxFrame(page, B3);
		let best = { frame: -1, n: 0 };
		// Every second frame (20 s of simulated time): totality spans ~10 frames at the 10 s resolution,
		// so this cannot step over it — and the full-density sweep breached the 30 s test budget when the
		// suite ran in parallel on a loaded machine.
		for (let f = Math.round(max * 0.45); f <= Math.round(max * 0.55); f += 2) {
			await setFrame(page, B3, f);
			const n = (await sky(page)).count;
			if (n > best.n) best = { frame: f, n };
		}
		await setFrame(page, B3, best.frame);
		// Scrub updates are coalesced into an animation frame, so under load the buffers can still be a
		// frame behind when the readback runs. Wait for the placement before measuring the pixels.
		await expect.poll(async () => (await sky(page)).count, { timeout: 5000 }).toBeGreaterThan(0);
		const bright = await brightSkyPixels(page);
		// Calibrated to the current sprite tuning (frameSync.ts: 0.3 px floor): the dots are small and
		// soft, so even Venus contributes only a handful of pixels over the luma threshold. What the test
		// exists to catch — a layer that draws nothing at all — reads 0 here.
		expect(bright, 'the star layer put nothing bright in the sky').toBeGreaterThan(2);
	});

	test('labels the planets in the page language, fading with their visibility', async ({ page }) => {
		// The three labelled planets (PlanetLabels.svelte) all stand above Oviedo's horizon at totality:
		// Mercury and Jupiter low in the west-northwest inside the default framing, Venus higher up. On
		// the German page the words themselves prove localization — 'Merkur' exists in no other supported
		// language.
		await open(page, OVIEDO);
		const max = await maxFrame(page, B3);
		const label = (key: string) => page.locator(`${B3} [data-planet="${key}"]`);

		// At first contact the sky is daylight-bright: no planet is drawn, so no planet is named.
		await setFrame(page, B3, 0);
		for (const key of ['venus', 'mercury', 'jupiter']) {
			await expect(label(key), `${key} at first contact`).toHaveClass(/hidden/);
		}

		// Find the darkest frame the same way the star tests do — totality is ~10 of ~780 frames.
		let best = { frame: -1, n: 0 };
		for (let f = Math.round(max * 0.45); f <= Math.round(max * 0.55); f += 2) {
			await setFrame(page, B3, f);
			const n = (await sky(page)).count;
			if (n > best.n) best = { frame: f, n };
		}
		await setFrame(page, B3, best.frame);

		// Mercury (3.6° up, inside the default framing) is the planet the shot actually shows — named,
		// localized ('Merkur' exists in no other supported language), at full strength at totality.
		// Label placement runs on the next rendered frame after the scrub, hence the poll.
		await expect.poll(async () => label('mercury').getAttribute('class')).not.toMatch(/hidden/);
		await expect(label('mercury')).toHaveText('Merkur');
		// Labels top out at half opacity by design (PlanetLabels.MAX_OPACITY): annotation, not object.
		const opacity = await label('mercury').evaluate((el) => Number((el as HTMLElement).style.opacity));
		expect(opacity, 'Mercury is at full visibility at totality').toBeGreaterThan(0.45);
		expect(opacity, 'labels stay half-translucent even at totality').toBeLessThanOrEqual(0.5);

		// Jupiter sits 4° from Mercury in azimuth, also inside the default framing.
		await expect(label('jupiter')).not.toHaveClass(/hidden/);
		await expect(label('jupiter')).toHaveText('Jupiter');

		// Venus (27° up) sits ABOVE the default framing's top edge here, so only its text is pinned —
		// whether it is on screen belongs to the camera framing, not to this feature.
		await expect(label('venus')).toHaveText('Venus');

		// The fade: walking back out of totality, Mercury's label must pass through intermediate opacity —
		// it fades with the planet (PlacedObject.brightness) rather than snapping on. The run-up from 95 %
		// to full obscuration takes minutes, so several 10 s frames sit inside the ramp.
		let sawIntermediate = false;
		for (let f = best.frame - 1; f > best.frame - 40; f--) {
			await setFrame(page, B3, f);
			const cls = (await label('mercury').getAttribute('class')) ?? '';
			if (/hidden/.test(cls)) break;
			const a = await label('mercury').evaluate((el) => Number((el as HTMLElement).style.opacity));
			if (a > 0.02 && a < 0.45) sawIntermediate = true;
		}
		expect(sawIntermediate, 'the label snapped on instead of fading in').toBe(true);
	});

	test('takes them away again as the Moon moves off', async ({ page }) => {
		await open(page, OVIEDO);
		const max = await maxFrame(page, B3);
		// 5 % of the window (~7 min) past mid-eclipse the Sun is well clear again and the sky has
		// recovered. Proportional rather than a frame count, so the slider's resolution can change
		// without silently moving this probe into (or out of) totality.
		await setFrame(page, B3, Math.round(max * 0.55));
		expect((await sky(page)).count).toBe(0);
	});
});
