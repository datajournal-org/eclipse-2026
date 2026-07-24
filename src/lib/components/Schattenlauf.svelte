<script>
  import { onMount } from 'svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';
  import { t } from '$lib/i18n';
  import { shadowCenter, sunMoonECEF } from '$lib/eclipse';

  // ---------- precomputed (pure math; runs at prerender & once on the client) ----------
  const SAT = 'https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}';
  // Path/timeline start at 17:30 UTC — before that the umbra sits on the polar cap, where
  // MapLibre's globe line rendering breaks up (data clamps to the ±85° Mercator limit).
  const T0 = Date.UTC(2026, 7, 12, 17, 30), T1 = Date.UTC(2026, 7, 12, 19, 0), STEP = 30 * 1000;
  const samples = [];
  for (let tt = T0; tt <= T1; tt += STEP) { const p = shadowCenter(new Date(tt)); if (p) samples.push({ t: tt, ...p }); }
  const pathCoords = samples.map((s) => [s.lon, s.lat]);
  const tMin = samples[0].t, tMax = samples[samples.length - 1].t;
  const utc = (ms) => new Date(ms).toISOString().slice(11, 16);

  // ---- live iso-coverage rings: outline of the Moon's shadow at the current instant ----
  const D2R = Math.PI / 180;
  const EMPTY = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [] } };
  function discOverlap(rS, rM, d) {
    if (d >= rS + rM) return 0;
    if (d <= Math.abs(rM - rS)) return rM >= rS ? 1 : (rM * rM) / (rS * rS);
    const a = Math.max(-1, Math.min(1, (d * d + rS * rS - rM * rM) / (2 * d * rS)));
    const b = Math.max(-1, Math.min(1, (d * d + rM * rM - rS * rS) / (2 * d * rM)));
    const A = rS * rS * Math.acos(a) + rM * rM * Math.acos(b) -
      0.5 * Math.sqrt(Math.max(0, (-d + rS + rM) * (d + rS - rM) * (d - rS + rM) * (d + rS + rM)));
    return A / (Math.PI * rS * rS);
  }
  const gridLats = [], gridLons = [];
  for (let la = 12; la <= 90 + 1e-9; la += 0.7) gridLats.push(la);
  for (let lo = -150; lo <= 90 + 1e-9; lo += 0.7) gridLons.push(lo);
  const NLA = gridLats.length, NLO = gridLons.length;
  const clatA = gridLats.map((la) => Math.cos(la * D2R)), slatA = gridLats.map((la) => Math.sin(la * D2R));
  const clonA = gridLons.map((lo) => Math.cos(lo * D2R)), slonA = gridLons.map((lo) => Math.sin(lo * D2R));
  const gv = new Float32Array(NLA * NLO);
  function fillGrid(sm) {
    const su = sm.sun, mo = sm.moon, sar = sm.sunAngR;
    for (let i = 0; i < NLA; i++) {
      const cl = clatA[i], sl = slatA[i], row = i * NLO;
      for (let j = 0; j < NLO; j++) {
        const Px = cl * clonA[j], Py = cl * slonA[j], Pz = sl;
        const s = Px * su[0] + Py * su[1] + Pz * su[2];        // sin(solar elevation)
        let dayf = (s + 0.03) / 0.11; dayf = dayf < 0 ? 0 : dayf > 1 ? 1 : dayf;  // soft horizon gate
        if (dayf <= 0) { gv[row + j] = 0; continue; }
        const mx = mo[0] - Px, my = mo[1] - Py, mz = mo[2] - Pz, md = Math.sqrt(mx * mx + my * my + mz * mz);
        let dt = (su[0] * mx + su[1] * my + su[2] * mz) / md; dt = dt > 1 ? 1 : dt < -1 ? -1 : dt;
        gv[row + j] = discOverlap(sar, 0.27271 / md, Math.acos(dt)) * dayf;
      }
    }
  }
  function isoContour(level) {
    const segs = [];
    for (let i = 0; i < NLA - 1; i++) {
      const la0 = gridLats[i], la1 = gridLats[i + 1], r0 = i * NLO, r1 = r0 + NLO;
      for (let j = 0; j < NLO - 1; j++) {
        const lo0 = gridLons[j], lo1 = gridLons[j + 1];
        const v00 = gv[r0 + j], v01 = gv[r0 + j + 1], v11 = gv[r1 + j + 1], v10 = gv[r1 + j], cr = [];
        const ip = (va, vb, pa, pb) => { const tt = (level - va) / (vb - va); return [pa[0] + (pb[0] - pa[0]) * tt, pa[1] + (pb[1] - pa[1]) * tt]; };
        if ((v00 > level) !== (v01 > level)) cr.push(ip(v00, v01, [lo0, la0], [lo1, la0]));
        if ((v01 > level) !== (v11 > level)) cr.push(ip(v01, v11, [lo1, la0], [lo1, la1]));
        if ((v11 > level) !== (v10 > level)) cr.push(ip(v11, v10, [lo1, la1], [lo0, la1]));
        if ((v10 > level) !== (v00 > level)) cr.push(ip(v10, v00, [lo0, la1], [lo0, la0]));
        if (cr.length === 2) segs.push([cr[0], cr[1]]);
        else if (cr.length === 4) { segs.push([cr[0], cr[1]]); segs.push([cr[2], cr[3]]); }
      }
    }
    return { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: segs } };
  }

  // ---------- per-pixel moon shadow (custom WebGL layer on MapLibre's own projection) ----------
  const shadow = { sun: [0, 0, 1], moon: [60, 0, 0], sunAngR: 0.00465, ready: false };
  const GRID = 200;
  const FRAG = `#version 300 es
    precision highp float; in vec3 v_ecef;
    uniform vec3 u_sun; uniform vec3 u_moon; uniform float u_sunAngR;
    out vec4 fragColor;
    float ov(float rS,float rM,float d){ if(d>=rS+rM)return 0.0; if(d<=abs(rM-rS))return rM>=rS?1.0:(rM*rM)/(rS*rS);
      float a=clamp((d*d+rS*rS-rM*rM)/(2.0*d*rS),-1.,1.), b=clamp((d*d+rM*rM-rS*rS)/(2.0*d*rM),-1.,1.);
      float A=rS*rS*acos(a)+rM*rM*acos(b)-0.5*sqrt(max(0.,(-d+rS+rM)*(d+rS-rM)*(d-rS+rM)*(d+rS+rM)));
      return A/(3.141592653*rS*rS); }
    void main(){ vec3 P=normalize(v_ecef);
      float s=dot(P,u_sun);
      float dayness=smoothstep(-0.18, 0.10, s);
      vec3 mv=u_moon-P; float mR=0.27271/length(mv);
      float sep=acos(clamp(dot(u_sun,normalize(mv)),-1.,1.));
      float o=ov(u_sunAngR,mR,sep);
      float ecl=1.0 - o*0.97;
      float bright = mix(0.09, 1.0, dayness) * mix(1.0, ecl, dayness);
      float a = clamp(1.0 - bright, 0.0, 0.92);
      if(a < 0.004) discard;
      vec3 night = vec3(0.015,0.03,0.07);
      vec3 umbra = vec3(0.0,0.005,0.02);
      vec3 col = mix(night, umbra, smoothstep(0.45,1.0,o)*dayness);
      fragColor = vec4(col, a); }`;
  function compile(gl, vs, fs) {
    const c = (ty, src) => { const sh = gl.createShader(ty); gl.shaderSource(sh, src); gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(sh); return sh; };
    const p = gl.createProgram(); gl.attachShader(p, c(gl.VERTEX_SHADER, vs)); gl.attachShader(p, c(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p); return p;
  }
  const shadowLayer = {
    id: 'moon-shadow', type: 'custom', renderingMode: '2d',
    onAdd(map, gl) {
      const pos = [], raw = [], idx = [], G1 = GRID + 1;
      for (let iy = 0; iy <= GRID; iy++) for (let ix = 0; ix <= GRID; ix++) { pos.push(ix / GRID, iy / GRID); raw.push(0, 0); }
      for (let iy = 0; iy < GRID; iy++) for (let ix = 0; ix < GRID; ix++) { const a = iy * G1 + ix, b = a + 1, c = a + G1, d = c + 1; idx.push(a, c, b, b, c, d); }
      const np = pos.length / 2; pos.push(0.5, 0.0); raw.push(0, -40000);   // north pole
      const sp = pos.length / 2; pos.push(0.5, 1.0); raw.push(0, 40000);    // south pole
      const bb = GRID * G1;
      for (let ix = 0; ix < GRID; ix++) idx.push(np, ix, ix + 1);
      for (let ix = 0; ix < GRID; ix++) idx.push(bb + ix, sp, bb + ix + 1);
      this.count = idx.length;
      const buf = (d) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(d), gl.STATIC_DRAW); return b; };
      this.vbo = buf(pos); this.rbo = buf(raw);
      this.ibo = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
      this.progs = {};
    },
    prog(gl, sd) {
      if (this.progs[sd.variantName]) return this.progs[sd.variantName];
      const vs = `#version 300 es\n` + sd.vertexShaderPrelude + `\n` + sd.define + `\n` +
        `in vec2 a_pos; in vec2 a_raw; out vec3 v_ecef;
         void main(){ gl_Position=projectTile(a_pos, a_raw);
           if(a_raw.y < -32767.5){ v_ecef=vec3(0.0,0.0,1.0); }
           else if(a_raw.y > 32766.5){ v_ecef=vec3(0.0,0.0,-1.0); }
           else { float lon=a_pos.x*6.283185307-3.141592653;
             float lat=atan(sinh(3.141592653*(1.0-2.0*a_pos.y)));
             float cl=cos(lat); v_ecef=vec3(cl*cos(lon), cl*sin(lon), sin(lat)); } }`;
      const p = compile(gl, vs, FRAG); const L = (n) => gl.getUniformLocation(p, n);
      return (this.progs[sd.variantName] = { p, a: gl.getAttribLocation(p, 'a_pos'), ar: gl.getAttribLocation(p, 'a_raw'),
        pm: L('u_projection_matrix'), tmc: L('u_projection_tile_mercator_coords'),
        cp: L('u_projection_clipping_plane'), tr: L('u_projection_transition'), fm: L('u_projection_fallback_matrix'),
        sun: L('u_sun'), moon: L('u_moon'), sar: L('u_sunAngR') });
    },
    render(gl, opt) {
      if (!shadow.ready) return;
      const o = this.prog(gl, opt.shaderData), pd = opt.defaultProjectionData;
      gl.useProgram(o.p);
      if (o.pm) gl.uniformMatrix4fv(o.pm, false, pd.mainMatrix);
      if (o.tmc && pd.tileMercatorCoords) gl.uniform4fv(o.tmc, pd.tileMercatorCoords);
      if (o.cp && pd.clippingPlane) gl.uniform4fv(o.cp, pd.clippingPlane);
      if (o.tr != null && pd.projectionTransition != null) gl.uniform1f(o.tr, pd.projectionTransition);
      if (o.fm && pd.fallbackMatrix) gl.uniformMatrix4fv(o.fm, false, pd.fallbackMatrix);
      gl.uniform3fv(o.sun, shadow.sun); gl.uniform3fv(o.moon, shadow.moon); gl.uniform1f(o.sar, shadow.sunAngR);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo); gl.enableVertexAttribArray(o.a); gl.vertexAttribPointer(o.a, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.rbo); gl.enableVertexAttribArray(o.ar); gl.vertexAttribPointer(o.ar, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.ibo);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.disable(gl.DEPTH_TEST);
      gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
      gl.disable(gl.CULL_FACE);
    }
  };

  // ---------- Svelte glue ----------
  let mapEl;
  let sliderValue = $state(Math.floor(samples.length / 2));
  let clockText = $state(utc(samples[Math.floor(samples.length / 2)].t));
  let coreText = $state('');
  let ready = $state(false);
  /** @type {(idx: number) => void} */
  let applyFrame = () => {};

  onMount(() => {
    let map;
    let disposed = false;
    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (disposed) return;
      map = new maplibregl.Map({
        container: mapEl, center: [-18, 58], zoom: 2.1, scrollZoom: false, attributionControl: { compact: true },
        style: { version: 8,
          sources: { sat: { type: 'raster', tiles: [SAT], tileSize: 256, maxzoom: 19, attribution: '© VersaTiles / Mapterhorn' } },
          layers: [ { id: 'bg', type: 'background', paint: { 'background-color': '#05070d' } },
                    { id: 'sat', type: 'raster', source: 'sat', paint: { 'raster-brightness-max': 0.9 } } ] }
      });
      map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

      map.on('load', () => {
        map.setProjection({ type: 'globe' });
        map.addLayer(shadowLayer);
        map.addSource('path', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: pathCoords } } });
        map.addLayer({ id: 'path', type: 'line', source: 'path', paint: { 'line-color': '#e8a33d', 'line-width': 1, 'line-opacity': 0.45 } });
        for (const pct of [50, 75, 100]) {
          map.addSource(`iso${pct}`, { type: 'geojson', data: EMPTY });
          map.addLayer({ id: `iso${pct}`, type: 'line', source: `iso${pct}`, paint: { 'line-color': '#ffd27f', 'line-width': 1, 'line-opacity': pct / 100 } });
        }

        applyFrame = (idx) => {
          const s = samples[idx], date = new Date(s.t);
          const sm = sunMoonECEF(date);
          shadow.sun = sm.sun; shadow.moon = sm.moon; shadow.sunAngR = sm.sunAngR; shadow.ready = true;
          map.triggerRepaint();
          fillGrid(sm);
          map.getSource('iso50').setData(isoContour(0.5));
          map.getSource('iso75').setData(isoContour(0.75));
          map.getSource('iso100').setData(isoContour(0.99));
          const p = shadowCenter(date);
          clockText = utc(s.t);
          coreText = `${p.lat.toFixed(2)}°, ${p.lon.toFixed(2)}°`;
        };
        applyFrame(sliderValue);
        ready = true;
      });
    })();
    return () => { disposed = true; if (map) map.remove(); };
  });

  function onSlider(e) { sliderValue = +e.currentTarget.value; applyFrame(sliderValue); }
</script>

<section class="block a2">
  <div class="block-head">
    <h2>{$t('a2.title')}</h2>
    <span class="eyebrow">12.08.2026</span>
  </div>
  <p class="sub">{$t('a2.subtitle')}</p>

  <div class="map-wrap bleed">
    <div class="map" bind:this={mapEl}></div>
    {#if !ready}<div class="map-loading">{$t('a2.loading')}</div>{/if}
  </div>

  <div class="panel">
    <div class="row">
      <div class="clock tnum">{clockText}<small> UTC</small></div>
      <input type="range" min="0" max={samples.length - 1} step="1" value={sliderValue}
        oninput={onSlider} aria-label="{$t('a2.title')} — {utc(tMin)}–{utc(tMax)} UTC" />
    </div>
    <div class="meta tnum">{$t('a2.core')} @ {coreText} · {utc(tMin)}–{utc(tMax)} UTC</div>
    <div class="legend">
      <span class="lbl">{$t('a2.current_shadow')}:</span>
      <span style="color:#ffd27f;opacity:.55"><i></i>50 %</span>
      <span style="color:#ffd27f;opacity:.8"><i></i>75 %</span>
      <span style="color:#ffd27f"><i></i>100 %</span>
      <span style="color:#e8a33d;opacity:.7"><i></i>{$t('a2.path')}</span>
    </div>
  </div>
</section>

<style>
  .sub { color: var(--muted); font-size: 0.9rem; margin: 2px 0 14px; }
  .map-wrap { position: relative; overflow: hidden; background: #05070d; border-block: 1px solid var(--border); }
  .map { height: min(64vh, 480px); background: #05070d; }
  .map-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--muted); pointer-events: none; }
  .panel { margin-top: 12px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .clock { font-weight: 700; font-size: 1.1rem; }
  .clock small { font-weight: 400; opacity: 0.6; }
  input[type='range'] { flex: 1; accent-color: var(--accent); }
  .meta { color: var(--muted); font-size: 0.8rem; margin-top: 8px; }
  .legend { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin-top: 8px; font-size: 0.8rem; }
  .legend .lbl { color: var(--muted); }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .legend i { width: 20px; height: 0; border-top: 2px solid currentColor; display: inline-block; }
  /* MapLibre's controls on a dark surface */
  :global(.a2 .maplibregl-ctrl-group) { background: rgba(10, 14, 22, 0.85); }
  :global(.a2 .maplibregl-ctrl-attrib) { background: rgba(10, 14, 22, 0.6); }
</style>
