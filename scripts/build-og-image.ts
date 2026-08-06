/**
 * Generate the seven 1200×630 Open Graph cards → static/og-{locale}.jpg, plus static/og.jpg for the
 * bare root.
 *
 * The card is a real screenshot of the B3 sky view over Madrid at 20:30 CEST: the almost fully eclipsed
 * Sun low over real rooftops, with the pitch set in type across the bottom. It replaces a screenshot of
 * the A2 shadow globe, which advertised the one thing every other eclipse site already has (a corridor
 * map) and, being pure thin-line geometry with no text, dissolved into a dark blob at the ~500 px a
 * social card actually renders at.
 *
 * WHY THE TEXT IS INJECTED HERE and not rendered by SkyView behind a `?og` flag, the way ShadowRun's
 * old screenshot mode worked: the scene is built ONCE and captured seven times with only the words
 * swapped. Rebuilding per locale would cost 7× the scene setup and — worse — produce seven visibly
 * different scenes, because terrain and building tiles keep landing at their own pace after `idle`. The
 * cards have to read as a family. It also keeps marketing copy out of a production component.
 *
 * The cards are COMMITTED (like the generated corridor and sky data): crawlers need stable assets, CI
 * must not depend on a GPU, and the scene only changes when B3 itself is redesigned — rerun
 * `npm run og:image` then.
 *
 * Runs against the DEV server (`vite dev`), not a production build: the scene is compiled from the same
 * source either way, and requiring a fresh `npm run build` first only ever produced stale or
 * missing-build errors when regenerating the image. Terrain and building tiles come from the live tile
 * server.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, statSync, readFileSync } from 'node:fs';
import { chromium, type Page } from '@playwright/test';
import { localCircumstances, eclipseVisible } from '../src/lib/eclipse';
import { buildTimeline } from '../src/lib/skyview/timeline';
import de from '../src/lib/i18n/messages/de';
import en from '../src/lib/i18n/messages/en';
import es from '../src/lib/i18n/messages/es';
import fr from '../src/lib/i18n/messages/fr';
import nl from '../src/lib/i18n/messages/nl';
import pt from '../src/lib/i18n/messages/pt';

const PORT = 4317;
const BASE = '/eclipse-2026';

// The scene. Madrid rather than a totality city: at 99.96 % the Sun is a hairline crescent (the most
// dramatic thing a still frame can show) and the skyline is dense enough that "behind the buildings"
// reads instantly. The card carries no verdict text, so the partial/total distinction never surfaces.
const OG_PLACE = { lat: 40.390326735482034, lon: -3.655240992662044, name: 'Madrid' };
const OG_TZ = 'Europe/Madrid';
const OG_INSTANT = '2026-08-12T20:30:00+02:00'; // 18:30 Z — just past local maximum, Sun ~7° up

// The card, in its own pixels. The overlay is authored at full card size and scaled by 0.5 onto a
// 600×315 CSS-pixel clip, so every length below is a FINAL-IMAGE pixel and needs no mental arithmetic.
const CARD_W = 1200,
	CARD_H = 630;
const CSS_W = CARD_W / 2,
	CSS_H = CARD_H / 2; // at deviceScaleFactor 2 → exactly 1200×630 device px, 1:1, no resampling

// Pinned deliberately rather than imported from $lib/i18n, which pulls in $app/environment (a SvelteKit
// virtual module tsx cannot resolve). tests/fixtures.ts pins the same list for the same reason.
const DICTS = { de, en, es, fr, nl, pt };
const LOCALES = Object.keys(DICTS) as (keyof typeof DICTS)[];
const DEFAULT_LANG = 'en'; // must match DEFAULT_LOCALE in src/lib/i18n/index.ts

const B3 = 'section.b3';
const MIN_CARD_BYTES = 30_000; // a blank or half-rendered frame compresses far smaller than this

const fail = (msg: string): never => {
	console.error(`[og] ${msg}`);
	process.exit(1);
};

// ---- frame index, computed exactly ------------------------------------------------------------------
// `buildTimeline` snaps the window onto the global 10 s grid, so every frame is a whole multiple of
// 10 000 ms since the epoch and the target instant either IS a frame or is not on the timeline at all.
// Computing it (rather than seeking by eye) means a future change to the window fails loudly here
// instead of silently shifting the card to a different minute.
const lc = localCircumstances(OG_PLACE.lat, OG_PLACE.lon);
if (!lc || !eclipseVisible(lc)) fail('the card location cannot see the eclipse — B3 would not render there');
const { times } = buildTimeline(OG_PLACE.lat, OG_PLACE.lon, lc!);
const FRAME = times.indexOf(Date.parse(OG_INSTANT));
if (FRAME < 0) fail(`${OG_INSTANT} is not on B3's timeline grid for ${OG_PLACE.name}`);
// Formatted the way the page will format it, so the DOM check below compares like with like.
const EXPECTED_CLOCK = new Intl.DateTimeFormat('de', {
	hour: 'numeric',
	minute: '2-digit',
	timeZone: OG_TZ
}).format(Date.parse(OG_INSTANT));

// ---- dev server -------------------------------------------------------------------------------------
const server = spawn('npx', ['vite', 'dev', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
const kill = () => {
	if (!server.killed) server.kill();
};
process.on('exit', kill);

// `?lat&lon&name` is the documented debug override (src/lib/stores/location.ts): it pins the scene to
// Madrid regardless of the machine's own timezone or stored location. `?debug` exposes window.__b3map,
// which is the only handle on the camera — cameraController returns no setter for distance or pitch.
const q = `lat=${OG_PLACE.lat}&lon=${OG_PLACE.lon}&name=${encodeURIComponent(OG_PLACE.name)}&debug`;
const url = `http://localhost:${PORT}${BASE}/de/?${q}`;
for (let tries = 0; ; tries++) {
	try {
		const res = await fetch(url);
		if (res.ok) break;
	} catch {
		/* not up yet */
	}
	// Dev cold-starts slower than preview (svelte-kit sync + on-demand compile) — allow ~60 s.
	if (tries > 300) fail('dev server did not come up');
	await new Promise((r) => setTimeout(r, 200));
}

// ---- browser ----------------------------------------------------------------------------------------
// Same launch setup as the Playwright config: the full chromium binary reaches the real GPU, and
// SwiftShader stays as the no-GPU fallback.
const browser = await chromium.launch({ channel: 'chromium', args: ['--enable-unsafe-swiftshader'] });
const page = await browser.newPage({
	viewport: { width: 1400, height: 1000 },
	deviceScaleFactor: 2,
	// B3 renders every clock in the BROWSER's zone, so the frame check below only means "20:30 in Madrid"
	// if the browser is in Madrid.
	timezoneId: OG_TZ
});

// Size the stage to the card's aspect BEFORE the map exists. SkyView derives its framing (the Sun sits
// at 88 % of frame height, the marker at 10 %) from the container's clientWidth/clientHeight at
// construction, so a centred crop out of the page's ~1.75:1 stage would cut the Sun off the top. At
// document-start this style is in place before Svelte mounts B3, so the framing is computed FOR the
// card. The consequence, stated plainly: the card is composed for 1.905:1 and is therefore not
// pixel-identical to what a visitor sees at any real viewport.
const STAGE_CSS = `
	section.b3 .stage, section.b3 .stage-canvas {
		width: ${CSS_W}px !important; height: ${CSS_H}px !important;
		margin-inline: 0 !important;
	}
	/* Zoom/fullscreen/recenter buttons are interaction chrome, meaningless on a still. The attribution
	   is NOT dropped — it is re-set inside the overlay, above the scrim. */
	section.b3 .maplibregl-ctrl-group, section.b3 .maplibregl-ctrl-attrib { display: none !important; }
`;
// Injected into the served HTML rather than via addInitScript: an init script runs at document-start,
// where <html> does not exist yet, and every workaround for that (appending on the first mutation,
// waiting for DOMContentLoaded) either loses the node or lands after SvelteKit has already hydrated —
// and the framing is computed once, at mount. Rewriting <head> is the only point that is unambiguously
// before both.
await page.route(`**${BASE}/de/**`, async (route) => {
	if (route.request().resourceType() !== 'document') return route.fallback();
	const res = await route.fetch();
	const html = (await res.text()).replace('</head>', `<style id="og-stage-size">${STAGE_CSS}</style></head>`);
	await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
});

await page.goto(url, { waitUntil: 'load' });
await page.locator(`${B3} .stage-canvas`).scrollIntoViewIfNeeded();
await page.locator(`${B3} [data-map-ready="true"]`).waitFor({ timeout: 240_000 });

/** Camera pose, as the two numbers that actually move when the rig dollies. */
const pose = () =>
	page.evaluate(() => {
		type MapHandle = { getCenter(): { lng: number; lat: number }; getZoom(): number };
		const m = (window as unknown as { __b3map?: MapHandle }).__b3map;
		if (!m) throw new Error('window.__b3map is missing — did the ?debug flag survive?');
		const c = m.getCenter();
		return [c.lng, c.lat, m.getZoom()] as [number, number, number];
	});
const same = (a: [number, number, number], b: [number, number, number]) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

/** Wait until the rig stops moving on its own. */
const settle = async (p: Page, samples = 3, gap = 300) => {
	let prev = await pose();
	for (let stable = 0; stable < samples;) {
		await p.waitForTimeout(gap);
		const now = await pose();
		stable = same(prev, now) ? stable + 1 : 0;
		prev = now;
	}
};

// `data-map-ready` fires on the FIRST idle, but SkyView registers a second `idle` handler that runs
// cam.applyFraming() afterwards — touching the camera before that lands would simply be overwritten.
await settle(page);

// ---- dolly to minimum height ------------------------------------------------------------------------
// The camera controller exposes no setter for distance, height or pitch (it returns only applyFraming /
// addControls / detach, with camDist closure-private), so the only way in is the wheel handler — the
// same route tests/b3-camera.spec.ts takes. Safe to over-scroll: zoomBy clamps its target every call,
// so the dolly cannot wind up past DIST_MIN.
//
// Convergence must be read off getCenter(), NOT getZoom(): the focus distance saturates at its 400 m
// floor once camDist drops below ~160 m, so zoom goes still well before the dolly actually bottoms out,
// while the centre keeps walking toward the marker all the way down.
const canvas = page.locator(`${B3} .stage-canvas`);
const box0 = (await canvas.boundingBox())!;
await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);

// If the minimum ever lands inside a building — the failure cameraController.ts warns about, having
// measured it in Manhattan and the Chicago Loop — back off by a named number of notches rather than
// fudging the loop below.
const DOLLY_NOTCHES_BACK_OFF = 0;

let prev = await pose();
let bottomed = false;
for (let i = 0; i < 12; i++) {
	await page.mouse.wheel(0, -600); // scroll up = closer; ~0.22× per event against a 4× total range
	await page.waitForTimeout(400); // the rig eases at 0.25/frame
	const now = await pose();
	if (same(prev, now)) {
		bottomed = true;
		break;
	}
	prev = now;
}
// Prove it is the clamp and not a stalled ease: one more notch must move nothing at all.
await page.mouse.wheel(0, -600);
await page.waitForTimeout(600);
if (!bottomed || !same(prev, await pose())) fail('the camera never reached its minimum height');
for (let i = 0; i < DOLLY_NOTCHES_BACK_OFF; i++) {
	await page.mouse.wheel(0, 600);
	await page.waitForTimeout(400);
}

// ---- time -------------------------------------------------------------------------------------------
const slider = page.locator(`${B3} input[type="range"]`);
await slider.evaluate((el, v) => {
	(el as HTMLInputElement).value = String(v);
	el.dispatchEvent(new Event('input', { bubbles: true }));
}, FRAME);
// Computed in Node, verified in the DOM: the arithmetic above is exact, and this is the guard that it
// still means what it says.
await page
	.waitForFunction(
		(want) => document.querySelector('section.b3 .readout .clock')?.textContent?.trim() === want,
		EXPECTED_CLOCK,
		{ timeout: 15_000 }
	)
	.catch(() => fail(`frame ${FRAME} did not put the clock at ${EXPECTED_CLOCK}`));

// Closing in pulls higher-LOD terrain and building tiles; give them time to land before the first shot.
await page.waitForTimeout(4000);
await settle(page);

// ---- overlay ----------------------------------------------------------------------------------------
// Authored at full card size and scaled by 0.5 onto the clip, so every length here is a final-image
// pixel. position: fixed puts it in viewport coordinates — the same space boundingBox() reports and
// page.screenshot({clip}) reads — so it lines up on the canvas exactly, without measuring anything twice.
const box = (await canvas.boundingBox())!;
if (Math.round(box.width) !== CSS_W || Math.round(box.height) !== CSS_H) {
	fail(`stage is ${box.width}×${box.height} CSS px, expected ${CSS_W}×${CSS_H} — the size override missed`);
}

const attribution = await page.evaluate(
	() => document.querySelector('section.b3 .maplibregl-ctrl-attrib-inner')?.textContent?.trim() ?? ''
);
if (!attribution) fail('could not read the map attribution — it must not be dropped from the card');

await page.addStyleTag({
	content: `
		#og-overlay {
			position: fixed; z-index: 2147483647; pointer-events: none;
			left: ${box.x}px; top: ${box.y}px;
			width: ${CARD_W}px; height: ${CARD_H}px;
			transform: scale(0.5); transform-origin: 0 0;
			display: flex; flex-direction: column; justify-content: flex-end;
			font-family: var(--font); color: #fff;
			/* The scrim only has to beat the ground, which is the darkest, least interesting part of the
			   frame — the Sun and the loupe inset sit in the top half and stay clear of it. */
			background: linear-gradient(to top, rgba(6,10,20,.94) 0%, rgba(6,10,20,.80) 34%, transparent 62%);
		}
		#og-overlay .pad { padding: 0 62px 54px; }
		#og-overlay .b {
			font-size: 25px; font-weight: 700; letter-spacing: .10em; text-transform: uppercase;
			color: #f0a92a; margin: 0 0 18px;
		}
		#og-overlay .h {
			font-size: 60px; font-weight: 800; line-height: 1.1; letter-spacing: -.015em;
			margin: 0; max-width: 950px; text-wrap: balance;
			text-shadow: 0 2px 24px rgba(0,0,0,.55);
		}
		#og-overlay .a {
			position: absolute; right: 18px; bottom: 14px;
			font-size: 15px; color: rgba(255,255,255,.5);
		}
	`
});
await page.evaluate((attr) => {
	const el = document.createElement('div');
	el.id = 'og-overlay';
	el.innerHTML = `<div class="pad"><p class="b"></p><p class="h"></p></div><div class="a"></div>`;
	el.querySelector('.a')!.textContent = attr;
	document.body.appendChild(el);
}, attribution);

// ---- capture ----------------------------------------------------------------------------------------
const clip = { x: box.x, y: box.y, width: CSS_W, height: CSS_H };
for (const l of LOCALES) {
	const d = DICTS[l];
	await page.evaluate(
		({ brand, headline }) => {
			document.querySelector<HTMLElement>('#og-overlay .b')!.textContent = brand;
			document.querySelector<HTMLElement>('#og-overlay .h')!.textContent = headline;
		},
		{ brand: `${d.app.title} · ${d.app.tagline}`, headline: d.app.og_headline }
	);
	await page.waitForTimeout(120); // let the reflow settle before the raster
	await page.screenshot({ path: `static/og-${l}.jpg`, type: 'jpeg', quality: 92, clip });
}
await browser.close();
kill();

// The bare root serves the unsuffixed name (static/meta.json advertises it, publish.spec.ts pins it), so
// it gets a byte copy of the default language's card rather than a route-specific one.
copyFileSync(`static/og-${DEFAULT_LANG}.jpg`, 'static/og.jpg');

// ---- self-check -------------------------------------------------------------------------------------
// A blank canvas, a stalled scene or a text swap that silently failed all produce plausible-looking
// files. Size catches the first two; pairwise difference catches the third.
const digests = new Map<string, string>();
for (const f of [...LOCALES.map((l) => `static/og-${l}.jpg`), 'static/og.jpg']) {
	const bytes = statSync(f).size;
	if (bytes < MIN_CARD_BYTES) fail(`${f} is only ${bytes} B — the scene probably did not render`);
}
for (const l of LOCALES) {
	const f = `static/og-${l}.jpg`;
	const key = readFileSync(f).toString('base64');
	const twin = digests.get(key);
	if (twin) fail(`${f} is byte-identical to ${twin} — the headline swap did not take`);
	digests.set(key, f);
}

console.log(
	`[og] ${LOCALES.length + 1} cards written (${CARD_W}×${CARD_H}) — ${OG_PLACE.name}, frame ${FRAME} = ${EXPECTED_CLOCK} ${OG_TZ}`
);
process.exit(0);
