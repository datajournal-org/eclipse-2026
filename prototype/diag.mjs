import { chromium } from 'playwright';

const URL = process.argv[2] || 'http://localhost:8137/b3.html';
const OUT = process.argv[3] || '/tmp/b3-shot.png';

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
         '--ignore-gpu-blocklist', '--enable-webgl'],
});
const page = await browser.newPage({ viewport: { width: 960, height: 640 } });

const logs = [];
page.on('console', m => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', e => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', r => logs.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
page.on('response', r => { if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`); });

await page.goto(URL, { waitUntil: 'load' });

// wait for the map to exist and finish its first full render
try {
  await page.waitForFunction(() => window.map && window.map.loaded(), { timeout: 20000 });
} catch { logs.push('[warn] map.loaded() timeout'); }
await page.waitForTimeout(4000); // let tiles + terrain settle

// optionally move the time slider (fraction 0..1) before screenshot
const frac = process.argv[4];
if (frac != null) {
  await page.evaluate((f) => {
    const s = document.getElementById('slider');
    s.value = Math.round(f * (+s.max));
    s.dispatchEvent(new Event('input'));
  }, parseFloat(frac));
  await page.waitForTimeout(2500);
}

const info = await page.evaluate(() => {
  const m = window.map;
  if (!m) return { error: 'no window.map' };
  const feats = m.queryRenderedFeatures();
  const bySL = {};
  for (const f of feats) { const k = f.sourceLayer || f.source || '?'; bySL[k] = (bySL[k]||0)+1; }
  const style = m.getStyle();
  return {
    center: m.getCenter(), zoom: +m.getZoom().toFixed(2),
    pitch: +m.getPitch().toFixed(1), bearing: +m.getBearing().toFixed(1),
    terrain: !!m.getTerrain?.(),
    srcShortbreadLoaded: m.isSourceLoaded('versatiles-shortbread'),
    srcDemLoaded: m.isSourceLoaded('dem'),
    styleLayerCount: style.layers.length,
    hasBuildings3d: !!m.getLayer('buildings-3d'),
    renderedFeatureCount: feats.length,
    renderedBySourceLayer: bySL,
    dbg: document.getElementById('dbg')?.textContent,
    note: document.getElementById('note')?.textContent,
    canvasSize: [m.getCanvas().width, m.getCanvas().height],
    mapErrors: window.__errors || [],
    sunClip: window.__sunClip || null,
    sunRenders: window.__sunRenders || 0,
    // a couple of concrete style layers to check paint/source
    landLayer: (() => { const l = style.layers.find(x => x.id === 'land' || x.type === 'background'); return l ? { id: l.id, type: l.type, source: l.source, sl: l['source-layer'] } : null; })(),
    firstFewLayerIds: style.layers.slice(0, 8).map(l => `${l.id}(${l.type})`),
  };
});

await page.screenshot({ path: OUT });
await browser.close();

console.log('=== CONSOLE / ERRORS ===');
console.log(logs.length ? logs.join('\n') : '(none)');
console.log('\n=== MAP STATE ===');
console.log(JSON.stringify(info, null, 2));
console.log('\nscreenshot ->', OUT);
