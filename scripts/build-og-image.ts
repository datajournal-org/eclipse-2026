/**
 * Generate the 1200×630 Open Graph image → static/og.jpg.
 *
 * The image is a real screenshot of the A2 shadow globe at greatest eclipse — the same scene a visitor
 * lands on, not a mock-up that drifts from the product. It is COMMITTED (like the generated corridor and
 * sky data): crawlers need a stable asset, CI must not depend on a GPU, and the scene only changes when
 * the globe itself is redesigned — rerun `npm run og:image` then.
 *
 * Runs against the DEV server (`vite dev`), not a production build: the scene is compiled from the
 * same source either way, and requiring a fresh `npm run build` first only ever produced stale or
 * missing-build errors when regenerating the image. Satellite tiles come from the live tile server.
 */
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { TIMELINE_START, TIMELINE_END } from '../src/lib/config';
import { GREATEST } from '../src/lib/testing/reference';

const PORT = 4317;
const BASE = '/eclipse-2026';
const OUT = 'static/og.jpg';
const WIDTH = 1200,
	HEIGHT = 630;

// ---- dev server -----------------------------------------------------------------------------------
const server = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const kill = () => {
	if (!server.killed) server.kill();
};
process.on('exit', kill);

// ?og: screenshot mode — the geometry overlay (iso labels, iso lines, corridor band) renders at its
// hardcoded card opacities (`ogOpacity` per ring, ShadowRun/IsoLabels) and the labels skip their zoom
// fade, so the card reads at a glance instead of ghosting at the wide opening zoom.
const url = `http://localhost:${PORT}${BASE}/de/?og`;
for (let tries = 0; ; tries++) {
	try {
		const res = await fetch(url);
		if (res.ok) break;
	} catch {
		/* not up yet */
	}
	// Dev cold-starts slower than preview (svelte-kit sync + on-demand compile) — allow ~60 s.
	if (tries > 300) {
		console.error('[og] preview server did not come up');
		process.exit(1);
	}
	await new Promise((r) => setTimeout(r, 200));
}

// ---- screenshot -----------------------------------------------------------------------------------
// Same launch setup as the Playwright config: the full chromium binary reaches the real GPU, and
// SwiftShader stays as the no-GPU fallback.
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-swiftshader'] });
// deviceScaleFactor 2: the clip is specified in CSS pixels at half size, so the JPEG comes out at the
// exact 1200×630 the card renderers want, with retina-sharp tiles.
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 }, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'load' });

const A2 = 'section.a2';
await page.locator(`${A2} .stage-canvas`).scrollIntoViewIfNeeded();
await page.locator(`${A2} [data-map-ready="true"]`).waitFor({ timeout: 120_000 });

// Drive the A2 slider to greatest eclipse — the most dramatic, most truthful frame: the umbra mid-ocean
// between Iceland and Spain, the whole corridor lit.
const frac =
	(Date.parse(GREATEST.utc) - TIMELINE_START.getTime()) / (TIMELINE_END.getTime() - TIMELINE_START.getTime());
const slider = page.locator(`${A2} input[type="range"]`);
const max = Number(await slider.getAttribute('max'));
await slider.evaluate(
	(el, v) => {
		(el as HTMLInputElement).value = String(v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	},
	Math.round(max * frac)
);
// let the shadow render and any late tiles land
await page.waitForTimeout(3000);

// Clip a 1200:630 window centred on the globe (the canvas centre), in CSS pixels at dpr 2.
const box = (await page.locator(`${A2} .stage-canvas`).boundingBox())!;
const w = WIDTH / 2,
	h = HEIGHT / 2;
const clip = {
	x: Math.max(box.x, box.x + (box.width - w) / 2),
	y: Math.max(box.y, box.y + (box.height - h) / 2),
	width: w,
	height: h
};
if (box.width < w || box.height < h) {
	console.error(`[og] A2 canvas ${box.width}×${box.height} is smaller than the ${w}×${h} CSS clip`);
	process.exit(1);
}
await page.screenshot({ path: OUT, type: 'jpeg', quality: 95, clip });
await browser.close();
kill();
console.log(`[og] ${OUT} written (${WIDTH}×${HEIGHT}, greatest eclipse at ${GREATEST.utc})`);
process.exit(0);
