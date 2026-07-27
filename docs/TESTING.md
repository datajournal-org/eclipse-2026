# Testing

**Status: implemented.** 609 Vitest tests (`npm run test:unit`, ~2 s) and 319 Playwright tests across four
browser projects (`npm run test:e2e`, ~1.5 min). `npm run check` runs both. What follows is the plan the
suite was built from; §7 records where the implementation diverged from it and what the suite found.

Two layers, no overlap:

- **Vitest** — every `.ts` module under `src/lib` and `scripts/`. Pure functions, stores, and the thin
  MapLibre adapters (via doubles). Fast, run on every save, no browser.
- **Playwright** — every screen, component and interaction from [WIREFRAMES.md](./WIREFRAMES.md), against the
  real `adapter-static` build in a real browser (WebGL, MapLibre, terrain, `<dialog>`, geolocation).

Rule of thumb for where a test belongs: if it can be expressed as "input numbers → output numbers/strings",
it is Vitest. If it needs a GPU, a layout, a pointer or a network request, it is Playwright.

---

## 1. Tooling setup

### 1.1 Dependencies

```
npm i -D vitest @vitest/coverage-v8 jsdom
```

Nothing else. Svelte components are **not** unit-tested (no `@testing-library/svelte`,
no `vitest-browser-svelte`) — they are covered by Playwright, which is the honest environment for them.

### 1.2 Vitest config

Add a `test` block to `vite.config.ts` (keeps the `sveltekit()` plugin, so `$lib/*` and `$app/*` resolve
exactly as in the app) with two **projects**, because the codebase has two kinds of module:

| Project | Environment | Matches                          | Why                                                                      |
| ------- | ----------- | -------------------------------- | ------------------------------------------------------------------------ |
| `node`  | `node`      | `src/lib/**/*.test.ts` (default) | Pure maths/astronomy — fastest, catches accidental DOM use               |
| `jsdom` | `jsdom`     | `src/lib/**/*.dom.test.ts`       | `stores/location`, `i18n`, `brand`, layers driven through DOM/GL doubles |

For the `jsdom` project set `resolve.conditions: ['browser']` so `$app/environment` reports
`browser === true` — otherwise `userLocation` initialises to `null` and `setLocale` never touches
`localStorage`, i.e. the exact branches worth testing are dead.

Co-locate specs next to sources (`src/lib/skyview/colors.test.ts`) — the pairing is the documentation. Specs
stay under Prettier and ESLint like the rest of `src/` (no ignore entries), and
`src/lib/shadow-globe/corridor.generated.ts` is excluded from coverage because it is generated.

### 1.3 Scripts

```jsonc
"test:unit": "vitest run",
"test:unit:watch": "vitest",
"test:unit:cov": "vitest run --coverage",
"test:e2e": "playwright test",
"test": "npm run test:unit && npm run test:e2e",
```

`npm run check` already calls `npm run test`, so the gate picks both layers up automatically. Add
`/playwright-report/` and `/coverage/` to `.gitignore` (only `/test-results/` is ignored today).

### 1.4 Fixtures shared by both layers

Create `src/lib/testing/reference.ts` (plain module, importable by Vitest **and** by Playwright specs) holding
the validated numbers from [ARCHITECTURE.md](./ARCHITECTURE.md#validated-reference-values-astronomy-engine-utc):

```ts
export const REFERENCE = [
	{ name: 'Reykjavík', lat: 64.1466, lon: -21.9426, kind: 'total', obsc: 1.0, maxUtc: '17:48', sunAlt: 24.6 },
	{ name: 'Oviedo', lat: 43.3603, lon: -5.8448, kind: 'total', obsc: 1.0, maxUtc: '18:27', sunAlt: 10.3 },
	{ name: 'Palma', lat: 39.5696, lon: 2.6502, kind: 'total', obsc: 1.0, maxUtc: '18:31', sunAlt: 2.6 },
	{ name: 'Berlin', lat: 52.52, lon: 13.405, kind: 'partial', obsc: 0.848, maxUtc: '18:08', sunAlt: 3.5, az: 290 },
	{ name: 'München', lat: 48.1372, lon: 11.5756, kind: 'partial', obsc: 0.887, maxUtc: '18:15', sunAlt: 2.1 }
];
```

This is the oracle for the astronomy tests and the expected on-screen values for the B1/B2 Playwright tests.
The doc table and the code stay in sync because both cite the same file.

---

## 2. Vitest — module-by-module

Ordered by risk. Each bullet is one `describe` block; the sub-points are the assertions worth writing.

### 2.1 Foundations (trivial, high leverage)

- **`constants.ts`** — `norm180` at `-180 / 180 / 181 / 359 / -541` (wrap-around is the only thing that can
  break); `DEG_TO_RAD * RAD_TO_DEG === 1`.
- **`types.ts`** — nothing to test.
- **`config.ts`** — `TIMELINE_START/END` are the exact UTC instants for 2026-08-12 16:45/18:45; the window is
  120 min and divides evenly by `FRAME_STEP_MS` (frame count is an integer — off-by-one here shifts every
  slider label); `ECLIPSE_DATE` matches the timeline day.
- **`brand.ts`** — `hexToRgb` on `#fff`-short, `#RRGGBB`, upper/lower case, and garbage (must not throw);
  components normalised to `0..1`. `readBrandColors` in the **jsdom** project: reads the CSS custom
  properties, falls back to defaults when the stylesheet is absent.
- **`vec3.ts`** — the whole file, table-driven: `dot/cross/length/normalize/sub/negate/lerp/offset/clamp`
  against hand-computed values; orthonormality of `cross`; `normalize` of a zero vector.
  `latLonToUnitVector` ↔ `toLonLat` round-trip over a lat/lon grid (poles and the antimeridian included, since
  that's where the `atan2` conventions bite). `destPoint` against a known great-circle: 1 km due north moves
  latitude by ~0.00899°, due east at 60°N moves twice the longitude it does at the equator, and a
  bearing-then-reverse-bearing round-trip returns to the start.

### 2.2 Astronomy (`eclipse.ts`, `skyview/eclipseGeometry.ts`, `shadow-globe/shadowProfile.ts`)

The core of the product, and fully pure — this is where Vitest earns its keep.

- **`localCircumstances`** — for each `REFERENCE` entry: obscuration within ±0.5 pp, maximum within ±60 s of
  the tabulated UTC minute, Sun altitude within ±0.3°, azimuth within ±2° where tabulated, and
  `kind === 'total' | 'partial'`. Plus: a location far outside the eclipse (Sydney) yields no eclipse /
  obscuration 0; totality duration in Oviedo is in the 1–2 min range and greater than in Palma is _not_
  asserted (it isn't a documented value) — assert only that a total site reports a positive duration and a
  partial site reports none.
- **`greatestEclipse`** — 17:45:46 UTC ±30 s, and the position lands in the North Atlantic off Iceland
  (bounding box), so a sign flip in the search can't pass.
- **`shadowCenter`** — returns a point inside the corridor at greatest eclipse; returns `null` well outside
  the eclipse window (before ~15:30 UTC); the returned track is monotonic in longitude across the window
  (the shadow never runs backwards).
- **`sunMoonECEF` / `sunMoonHorizon`** — `sunAngR` ≈ 0.26° (Sun's apparent radius in mid-August, aphelion
  side); the Sun/Moon separation at Reykjavík's maximum is smaller than the sum of the radii (i.e. geometry
  and obscuration agree); horizon altitude/azimuth agree with `localCircumstances` for the same instant.
- **`sunset`** — matches the tabulated sunset ordering (Palma before Oviedo in UTC), returns `null` at a
  polar location in permanent day, and is _after_ the local maximum for every `REFERENCE` site (an eclipse at
  night would be a catastrophic sign error).
- **`eclipseGeometry`** — `dx/dy` offsets are zero-ish at maximum and grow monotonically away from it; the
  crescent's position angle rotates in the correct direction over the window (the "wrong way round" risk
  called out in ARCHITECTURE.md — assert the sign of `dy` before vs. after maximum); `moonAngR / sunAngR` is
  ~1.02–1.06 for a total eclipse.
- **`discOverlapFraction`** — the analytic identities are exact test material: separation ≥ r₁+r₂ → 0;
  separation ≤ |r₁−r₂| → full occultation (1 when the moon disc covers the sun disc); equal radii with
  separation 0 → 1; symmetry `f(a,b,d) === f(a,b,d)` under swapping which disc is larger where defined;
  monotonic decrease as `separation` grows; a mid-value cross-checked against the closed-form lens area.
- **`computeShadowModel`** / **`radiusForCoverage`** — `radiusForCoverage(model, 1)` (totality) < the 50%
  radius < the 1% radius; `radiusForCoverage` returns `null` for a level the model never reaches; profile
  sampling is `PROFILE_SIZE` long and monotonically non-increasing in coverage.

### 2.3 Shadow globe geometry (`shadow-globe/`)

- **`corridorCompute.computeCorridor`** — north and south edge arrays are non-empty and equal in length;
  every north point is north of the corresponding south point; both edges pass within ~200 km of the
  greatest-eclipse point; no `NaN` and no longitude jumps > 180° except at a deliberate antimeridian split.
  Then: **`corridor.generated.ts` is byte-identical to a fresh `computeCorridor()`** — a regression test that
  the checked-in generated file isn't stale (it is `.gitignore`d and rebuilt in `prebuild`, so this guards the
  script, not the artefact).
- **`isoRing`** — for a known model: returns a `MultiLineString` `Feature`, all coordinates finite and in
  range, ring is closed (or split into exactly two parts across the antimeridian), and a larger `radius`
  produces a ring that encloses the smaller one (compare bounding boxes). `steps` controls the vertex count.
- **`terminatorLine`** — every point has a Sun altitude of ~0° when fed back through the geometry (the
  defining property); great-circle length ≈ Earth's circumference.
- **`umbraGroundPoint`** — matches `shadowCenter` within a few km at the same instant; `null` when the umbra
  misses the Earth.
- **`labelPoint`** — lies on the ring of the given radius; `null` when the direction points off the globe.
- **`shadowPath.ts`** — `shadowFrames` is strictly increasing in time, spans `timelineStart..timelineEnd`,
  frame spacing equals `FRAME_STEP_MS`; `shadowPathLine` has one coordinate per frame with a landed umbra;
  `formatUtc` renders `17:45` for a known ms value (and pads single digits).
- **`isoLinesLayer`** pure half — `lngLatToMercator` at (0,0) → (0.5, 0.5), at (180, 85.05) → (1, ~0),
  round-trip against MapLibre's own `MercatorCoordinate` (imported in the jsdom project);
  `linePrimitiveFromSegments` and `fillStripPrimitive` produce vertex/index buffers of the expected length
  and winding for a 2-segment input, and cope with an empty input without producing a degenerate buffer.

### 2.4 SkyView pure logic (`skyview/`)

- **`colors.ts`** — `mix3` endpoints and midpoint; `cssRgb` rounding (`0.5` → `128`, clamping at `0`/`1`);
  `veilColour` is neutral at obscuration 0 and darkest at 1, and darker at low Sun altitude than high;
  `loupeSkyCss` / `loupeGroundCss` return parseable `rgb()` / gradient strings and interpolate with
  `veilOpacity` 0 → the untouched base colour.
- **`environment.ts`** — `environment(0)` is full daylight and `environment(1)` reaches `DUSK_HEX`;
  `light`/`intensity` are monotonic in obscuration; `duskVeil` is 0 for a high Sun, 1 below the twilight
  threshold, and continuous across the threshold (no visible pop — assert a small delta across the boundary).
- **`framing.computeFraming`** — for a high-Sun arc (Reykjavík) and a low-Sun arc (Palma): the returned `fov`
  contains the arc's altitude span with the documented margin, `meanAz` is the circular mean (test the
  wrap-around case, an arc straddling 350°→10°, which a naïve average gets wrong by 180°), and a wider
  `aspect` widens the horizontal fit without changing the vertical fit.
- **`overlay.bridgeSegments`** — `null` when the marker overlaps the loupe (test just inside and just outside
  the overlap box); otherwise exactly 2 segments, each with one endpoint on a loupe corner and one on a
  marker corner; the segments don't cross each other; correct for markers in all four diagonal directions and
  directly right/below (the axis-aligned cases are where a convex-hull bug hides).
- **`timeline.buildTimeline`** and **`timeAxis.buildTimeAxis`** — frame count matches
  `(end - start) / FRAME_STEP_MS + 1`; frame ↔ time mapping is invertible; tick labels are in ascending
  order, unique, and include the eclipse-maximum tick; the maximum's frame is the closest frame to the true
  maximum time.
- **`components/timeScrubber.buildTimeGrid`** — bands cover the full range with no gaps or overlaps; band
  boundaries fall on real phase transitions (C1/C2/max/C3/C4 for a total site, first/max/last for a partial
  one); ticks stay inside `[0, max]`; a degenerate range (start === end) yields a single band instead of
  throwing.
- **`mapSetup.sunArcEnvelope`** — returns a polygon enclosing every sampled Sun position of the window;
  handles the arc dipping below the horizon.

### 2.5 MapLibre adapters — tested with doubles (jsdom project)

These modules are thin, but they are exactly where a silent typo (a wrong uniform name, a paint property that
doesn't exist) breaks B3 with no error. Test them against **fake `map` / `gl` objects** that record calls:
a `createFakeMap()` helper returning stubs for `queryTerrainElevation`, `setLight`, `setPaintProperty`,
`getCanvas`, `jumpTo`, `calculateCameraOptionsFromTo`, `addLayer`, `getSource`, `triggerRepaint`, and a
`createFakeGl()` recording `createShader/shaderSource/compileShader/getUniformLocation/drawElements`.

- **`frameSync.placeSun`** — with a fake map at Oviedo: `sun.moon` and `sun.moonR` are in Sun-radius units,
  `angRad` equals the real angular radius in radians, `center` is a 4-vector of finite Mercator coordinates
  that moves west as time advances, and `visible` flips exactly at `alt === -sunAngR` (the documented sunset
  rule — test both sides of the boundary).
- **`frameSync.syncMapLighting`** — `setLight` receives `anchor: 'map'`, `position[1] === az`,
  `position[2] === 90 - alt`; `hillshade-illumination-direction` is normalised into `0..359` for negative and
   > 360 azimuths.
- **`cameraController`** — with fakes: `applyFraming()` computes a camera altitude above ground and a
  view-centre in front of the marker; the depression term is clamped to `[6, 18]`; zoom is clamped to
  `[50, 1000]` (dolly in past the minimum and out past the maximum); `orbitDeg` wraps and the camera stays at
  constant altitude across a full orbit (the documented "never bobs" property); `detach()` removes every
  window/rAF listener it added (count `addEventListener` vs. `removeEventListener` on the fake).
- **`sunLayer.createSunLayer`** — returns a `CustomLayerInterface` with `id`, `type: 'custom'`,
  `renderingMode: '3d'`; `onAdd(fakeMap, fakeGl)` compiles both shaders and links a program without hitting a
  `getShaderParameter` failure path; `render` reads the current `SunState` (mutate the state object between
  two `render` calls and assert the uniform values change); `onRemove` deletes its buffers.
- **`moonShadowLayer.createMoonShadowLayer`** and **`isoLinesLayer.createIsoLinesLayer`** — same lifecycle
  contract; plus: `render` early-returns when `state.ready === false` or `state.visible === false` (no
  `drawElements`), and re-uploads buffers when `state.version` changes but not when it doesn't (the version
  guard is a real performance contract).
- **`isoLabels.IsoLabels`** — `update()` adds/updates a GeoJSON source and removes labels that fell off the
  globe; `destroy()` removes every layer and source it created.
- **`overlayToggleControl.OverlayToggleControl`** — `onAdd` returns a container with the label, clicking it
  calls `onToggle` and flips the pressed state, `onRemove` detaches (jsdom gives us real DOM here).
- **`maplibre.loadMaplibre`** — memoises (two calls → one dynamic import) and sets the worker URL. Keep this
  one minimal; the real proof is the B3 Playwright test, which is the regression test for the worker-404
  problem documented in `vite.config.ts`.

### 2.6 Stores and i18n (jsdom project)

- **`stores/location`** — module-load precedence: URL params win over `localStorage`; invalid/partial params
  (`?lat=abc`, `?lat=1` with no `lon`) fall through to storage; corrupt JSON in storage yields `null` without
  throwing; `setLocation` coerces string inputs to numbers, defaults `name` to `null`, and writes storage;
  `clearLocation` removes the key; **nothing ever writes to the URL** (assert `location.search` unchanged and
  no `history.pushState`/`replaceState` calls — this is the privacy contract from the file header, so it
  deserves an explicit test); a throwing `localStorage` (Safari private mode) doesn't break the store.
  Use `vi.resetModules()` + a fresh jsdom URL per case, since the read happens at module load.
- **`stores/localEclipse`** — `null` while unlocated; recomputes on every `userLocation` change; matches
  `localCircumstances` for the same coordinates; only one recompute per set (spy on the derived callback).
- **`stores/now`** — with `vi.useFakeTimers()`: emits on a 1 s cadence and stops on unsubscribe (no leaked
  interval). `pad2` for 0/9/10/100. `splitDuration` for 0 ms, 999 ms, exactly 1 day, 25 h, and a negative
  input (the countdown after the eclipse — assert the chosen clamping behaviour rather than leaving it
  undefined).
- **`i18n`** — `match` resolves `en-GB` → `en`, `de` → `de`, `fr` → `null`; `detect` precedence
  localStorage → `navigator.languages` → `de`; `setLocale` ignores an unknown tag, persists, and sets
  `document.documentElement.lang`; `t` interpolates `{params}`, returns the key (not `undefined`) for a
  missing message, and falls back to German for a message missing from `en`/`es`; `fmt` date/number output is
  stable per locale (pin with `Intl` outputs asserted loosely — `toContain`, not exact strings, so an ICU
  update doesn't break the suite).
- **Message-catalogue parity** — one test iterating `de`/`en`/`es`: identical key sets (no missing, no extra),
  no empty strings, and the same `{placeholder}` names per key. This single test prevents most i18n bugs and
  costs nothing.

### 2.7 Build script

- **`scripts/build-corridor.ts`** — factor the file-writing out of the computation (it is 19 lines; extract a
  `renderModule(edges): string`), then test that the rendered module parses, exports `corridorEdges`, and
  round-trips through `JSON.parse` to the input. Covered together with §2.3's staleness check.

### 2.8 Coverage target

Aim for **≥90% statements on `src/lib/**/*.ts` excluding the three GPU layer files** (`sunLayer`,
`moonShadowLayer`, `isoLinesLayer`, whose `render` bodies only truly execute on a GPU) and excluding
`corridor.generated.ts`. Configure those thresholds in `vite.config.ts` so `test:unit:cov` fails on
regression, but only _after_ the suite exists — a threshold added first just gets lowered.

---

## 3. Playwright — screens and interactions

### 3.1 Config changes

Keep the current shape (build + `vite preview`, swiftshader for WebGL) and add:

- **Projects**: `chromium-desktop` (1440×900), `chromium-mobile` (`devices['Pixel 7']`, the primary audience
  for a page you check on a field trip), and `webkit-desktop` for the layout/`<dialog>`/`Intl` differences.
  Tag the WebGL-heavy specs `@webgl` and run them on chromium only — WebKit headless GL is not worth the
  flake. Firefox: skip for now, note the gap.
- **`locale`**: keep `de-DE` as the default and add a `?lang`-free English project that sets
  `locale: 'en-GB'` plus a cleared `localStorage`, so the locale-detection path is exercised end to end.
- **`permissions: []`** by default; grant `geolocation` (with a fixed `geolocation` coordinate) only in the
  spec that tests the GPS button.
- **`timezone Id`**: pin to `Europe/Berlin` for the default projects and add one spec run with
  `America/New_York` — the TimeZoneNote and every local-time string depend on it, and a tester in another zone
  should not see a red suite.
- `reporter: [['list'], ['html', { open: 'never' }]]`, `trace: 'retain-on-failure'`,
  `screenshot: 'only-on-failure'`.
- `expect.toHaveScreenshot` config with `maxDiffPixelRatio` — see §3.5.

### 3.2 Shared fixtures (`tests/fixtures.ts`)

1. **`locatedPage`** — navigates to `/?lat=…&lon=…&name=…` for a chosen `REFERENCE` site (the documented debug
   override) and waits for the B sections. Parameterised by site so B1/B2/B3 specs run for a total _and_ a
   partial location.
2. **`storagePage`** — seeds `localStorage['eclipse.location']` before load via `addInitScript`, for the
   persistence tests (and to prove the app doesn't need the URL).
3. **`stubGeocoder`** — `page.route('https://geocode.versatiles.org/**')` fulfilling recorded Photon JSON
   (one fixture with street+city+country, one with a bare `name`, one empty result set, one HTTP 500).
   **Every** spec installs this by default; exactly one opt-in spec (tagged `@live`, excluded from CI) hits
   the real service, so an upstream API change is noticed without making CI depend on it.
4. **`stubTiles`** — optional: route `*.versatiles.org` tile/font/sprite requests to local fixtures so the
   suite is offline-capable and fast. Start without it; add it the first time CI flakes on tiles.
5. **`frozenClock`** — `page.clock.install({ time: … })` at a fixed instant before eclipse day, so the
   countdown and "eclipse is over" states are deterministic. Three canned instants: T-30 days, T-90 seconds,
   T+1 hour.
6. **`mapReady(section)`** — waits for the section's canvas plus a `data-map-ready` attribute. **Add this
   attribute** to `ShadowRun`, `SkyView` and `LocationPicker` (set on MapLibre's `idle` event); today
   `b3-loupe.spec.ts` waits on a visual side effect with a 45 s timeout, which is slow and indirect.
7. **`setFrame(section, frame)`** — the slider-driving helper already inlined in `b3-loupe.spec.ts`, lifted out
   and reused.

### 3.3 Spec inventory

One file per wireframe unit. `@webgl` marks GPU-dependent specs.

| Spec file                 | Covers                                                                                                                                                                                                                                                                                                       |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `shell.spec.ts`           | Header brand, section order matches `+page.svelte`, `SafetyFooter` present, no console errors and no failed requests on load (assert on `page.on('console'/'requestfailed')` — this alone catches the maplibre-worker class of bug)                                                                          |
| `i18n.spec.ts`            | Language buttons switch all visible copy (sample one string per section), `aria-pressed` follows the active locale, `<html lang>` updates, choice survives a reload, detection from `Accept-Language` on a fresh profile                                                                                     |
| `state-a.spec.ts`         | Un-located state: `Countdown` counts down and ticks (two samples one second apart), `LocationCall` visible, B sections absent, `TimeZoneNote` names the right zone                                                                                                                                           |
| `countdown.spec.ts`       | With `frozenClock`: T-30 d shows days/hours/minutes/seconds, T-90 s shows only the small units, T+1 h shows the post-eclipse state; digits are tabular (no layout jitter — compare the element's box width across two ticks)                                                                                 |
| `a2-shadow-run.spec.ts`   | `@webgl` Globe loads, corridor and iso-lines render, the scrubber moves the umbra (sample the umbra marker's screen position at frame 0 / mid / max — strictly moving east), the overlay toggle control hides/shows the iso-lines                                                                            |
| `location-dialog.spec.ts` | Opens from `LocationCall`, focus moves into the dialog and is trapped, `Esc` and the close button dismiss it, backdrop click behaviour, body scroll locked while open, focus returns to the trigger on close                                                                                                 |
| `location-search.spec.ts` | Typing < 2 chars issues no request, debounce coalesces keystrokes into one request, results render label + sub, choosing a hit enables "use here", confirming sets the location and closes, empty results and a 500 show a message                                                                           |
| `location-gps.spec.ts`    | Granted geolocation fills the pending place via reverse geocode; denied permission leaves the dialog usable and shows the error state; the button is disabled while busy                                                                                                                                     |
| `location-map.spec.ts`    | `@webgl` `LocationPicker`: clicking/dragging the map moves the pin, the pending coordinate updates, reverse geocode labels it                                                                                                                                                                                |
| `privacy.spec.ts`         | After picking a location the URL still has no `lat`/`lon` (the contract from `stores/location`), `localStorage` holds it, a reload restores the located state, and clearing storage returns to state A                                                                                                       |
| `b1-verdict.spec.ts`      | For each `REFERENCE` site: obscuration percentage, maximum local time, "total/partial" wording — asserted against the shared reference table, i.e. the same oracle Vitest uses                                                                                                                               |
| `b2-timeline.spec.ts`     | Phase list order and labels, C1–C4 present for a total site and absent for a partial one, times ascending, maximum highlighted                                                                                                                                                                               |
| `b3-skyview.spec.ts`      | `@webgl` Extends today's loupe spec: map ready, Sun marker tracks the real Sun (marker moves right-to-down over the window), loupe sky colour darkens toward maximum and the ground colour follows, leader lines appear only when the marker is outside the loupe (drive it to overlap and assert they hide) |
| `b3-camera.spec.ts`       | `@webgl` Drag to orbit (the horizon tilts, the Sun's screen x shifts), wheel and +/- buttons dolly, double-click zooms, reset button restores the initial pose, pinch on the mobile project                                                                                                                  |
| `b3-scrubber.spec.ts`     | Keyboard (arrows/Home/End) moves the slider, clicking a band or tick jumps to that frame, the readout matches the frame, `aria-label`s present, scrub across the full range without a console error and with an interaction budget (see §3.5)                                                                |
| `b6-checklist.spec.ts`    | Items toggle and persist across reload, the counter updates, the calendar button downloads an `.ics` whose `DTSTART` matches the local maximum (assert on the download body, not just that a download happened)                                                                                              |
| `responsive.spec.ts`      | Mobile project: no horizontal overflow at 360 px, dialog is a full-height sheet, B3 keeps a usable aspect ratio, header language buttons stay reachable                                                                                                                                                      |
| `a11y.spec.ts`            | Tab order through the whole page, every interactive element reachable and labelled, visible focus ring, `prefers-reduced-motion` honoured, `role`/`aria-*` on the divider, dialog and scrubber. Optionally add `@axe-core/playwright` for the automated ruleset — one extra devDependency, high value        |

### 3.4 What Playwright deliberately does _not_ assert

Numbers already pinned by Vitest (obscuration to three decimals, camera altitudes, mercator maths). The E2E
layer checks that the right _number reaches the right pixel_ — one representative assertion per surface —
not the arithmetic. Keeping this line is what stops the E2E suite from becoming slow and brittle.

### 3.5 Performance and visual regression

- **Interaction budget** instead of screenshots for the render pipeline: in `b3-scrubber.spec.ts`, scrub 60
  frames and assert the total wall time stays under a generous ceiling (e.g. 6 s locally, doubled in CI). This
  addresses the "check scrubbing performance" risk in ARCHITECTURE.md without pinning pixels.
- **Screenshots**: only three, all on the chromium desktop project — A2 globe at maximum, B3 at maximum, B3
  at sunset — with `maxDiffPixelRatio: 0.02` and masks over the map tiles. GPU rasterisation differs between
  machines; treat any wider screenshot coverage as a maintenance cost that isn't paid back here.

---

## 4. CI

A single GitHub Actions job (`node 24`, `npm ci`, `npx playwright install --with-deps chromium webkit`)
running `npm run check`. Vitest first — it fails in seconds and saves the browser run. Upload
`playwright-report/` and `test-results/` as artefacts on failure. `@live`-tagged specs run in a separate
scheduled (nightly) job, so an upstream Photon/VersaTiles change surfaces as a nightly failure and never as a
red PR.

---

## 5. Rollout order

Each step ends green, so the suite is useful before it is complete.

1. **Setup** — vitest deps, config with both projects, scripts, `.gitignore`, `src/lib/testing/reference.ts`.
2. **§2.1 + §2.2** — foundations and astronomy. This is the highest-value block: it pins the numbers the whole
   product is about, and it is pure, so it will never flake.
3. **§2.6** — stores and i18n, including the catalogue-parity test and the privacy contract.
4. **§2.3 + §2.4** — geometry and SkyView logic.
5. **Playwright infrastructure** — `data-map-ready` attributes, `tests/fixtures.ts`, geocoder stubs, then
   split the existing two specs into `shell.spec.ts` and `b3-skyview.spec.ts` on the new fixtures.
6. **§3.3 non-WebGL specs** — dialog, search, GPS, privacy, i18n, countdown, checklist, verdict, timeline.
7. **§3.3 WebGL specs** — A2, B3 sky/camera/scrubber, plus the three screenshots.
8. **§2.5 + §2.7** — MapLibre adapters via doubles and the corridor script. Last, because the Playwright
   specs from step 7 already cover their happy path; the doubles add the error/lifecycle branches.
9. **Coverage thresholds + CI**, once the suite reflects reality.

## 6. Known gaps after this plan

- No Firefox and no real iOS Safari; WebKit desktop is the closest proxy.
- Terrain-dependent values (`queryTerrainElevation`) are stubbed in Vitest and only smoke-covered in
  Playwright — a wrong DEM source would show as a visual bug, not a failing test.
- Shader output is never asserted, only that shaders compile and uniforms are set. The three screenshots are
  the only thing standing between a broken shader and a green suite.
- Astronomy correctness is anchored to the reference table in ARCHITECTURE.md, which is itself derived from
  `astronomy-engine`. An upstream ephemeris change would move both. Cross-checking two or three values
  against an independent source (e.g. NASA's eclipse pages) once, by hand, is worth doing before the table
  becomes load-bearing for the whole suite.

---

## 7. What the implementation changed, and what it found

### Divergences from the plan above

- **`fullyParallel: false`.** With it on, several software-GL contexts starve each other and B3 never
  reaches `idle`. Parallelism is now per file, which is enough.
- **Playwright projects** are `chromium` (full suite), `mobile` (`@mobile` specs), `webkit` (everything
  except `@webgl`) and `chromium-en` (`@i18n` specs in en-GB / America/New_York).
- **No B2 spec.** There is no separate phase-timeline component; the B3 scrubber's ticks and totality band
  carry that information, and `b3-scrubber.spec.ts` covers them.
- **No checklist toggling.** B6's items are static `<li>`s, not checkboxes, so the spec covers the list, the
  countdown and the `.ics` download instead.
- **No screenshots.** The three planned visual comparisons were dropped: under headless software GL the
  output is not stable enough for a 2 % threshold to mean anything. The behavioural assertions (loupe
  horizon, veil luminance, locator tracking) cover the same ground without the flake.
- **No wall-clock scrub budget.** Under swiftshader the time is dominated by rasterisation, so a threshold
  would measure the renderer rather than the app. `b3-scrubber.spec.ts` sweeps the full range and asserts a
  live readout and no console errors instead.
- **`corridorModule.ts`** was extracted from `scripts/build-corridor.ts` so the generated-file rendering is
  testable without touching the filesystem, as §2.7 proposed.

### Defects the suite found

Three were fixed as part of building it:

1. **`norm180` was wrong below -540°** (`constants.ts`) — JS `%` keeps the dividend's sign, so a single
   `(deg + 540) % 360` returned out-of-range values. Both call sites happened to stay just inside the safe
   range. Fixed with an inner `% 360`.
2. **The DEM source requested zoom levels that do not exist** (`skyview/mapSetup.ts`) — the VersaTiles
   elevation tiles stop at z12, but the source declared no `maxzoom`, so B3 (zoom 16) fired a stream of
   404s and the map never reached `idle`. Fixed with `maxzoom: 12`.
3. **The loupe emitted an invalid negative `<rect height>`** (`components/SkyLoupe.svelte`) — with the Sun
   well up, `300 - horizonY` goes negative, the browser rejects the attribute and logs an error every
   frame. Fixed with a `Math.max(0, …)` clamp.

Four are recorded by tests but left alone, because each needs a product decision rather than a fix:

- **`app.html` has no `<title>`.** The browser tab and any shared link show the bare URL.
- **`localCircumstances` silently returns a different eclipse** for locations the 2026 event misses — it
  searches forward from eclipse day, so Sydney gets the 2028 one. Callers that care must compare the
  returned date against `ECLIPSE_DATE`. Pinned in `eclipse.test.ts`.
- **The "Nichts gefunden" message is unreachable.** `LocationDialog` renders the result list only
  `{#if searching || searchErr || results.length}`, so zero hits removes the `<ul>` before the no-results
  branch can run — the user gets silence. Pinned in `location-search.spec.ts`.
- **The time scrubber's track is 18 px tall**, under WCAG 2.5.8's 24×24 target guidance. It does work by
  touch (`responsive.spec.ts` proves it), but it is smaller than the guideline wants.

Two more are documented in tests as deliberate behaviour rather than bugs: `radiusForCoverage(model, 1)`
returns 0 rather than the umbra rim (every caller passes 0.999), and `sunMoonHorizon`'s `elevation`
parameter models parallax only, not the ~1.8° horizon dip a mountain observer actually gains.

---

## 8. Making the browser suite fast

The end-to-end suite went from 12.5 min to ~1.5 min through two changes, both of which are about the
environment rather than the tests. Recorded here because both look like micro-optimisations and are not.

### 8.1 A real GPU (`channel: 'chromium'`)

Playwright's default headless chromium is `chrome-headless-shell`, a stripped binary with **no GPU stack at
all** — so MapLibre could only obtain a WebGL context through SwiftShader, rasterising B3's terrain scene on
the CPU. That is what pegged several cores per worker. `channel: 'chromium'` launches the full binary in
new-headless mode, which reaches the real device. Measured on an M4 Pro, warm, repeated:

| Configuration                | Renderer                   | B3 to `idle` |
| ---------------------------- | -------------------------- | ------------ |
| headless shell + SwiftShader | SwiftShader (software)     | 19–23 s      |
| `channel: 'chromium'`        | ANGLE Metal — Apple M4 Pro | 1.3–1.5 s    |
| … plus `--use-angle=metal`   | ANGLE Metal — Apple M4 Pro | 1.4–1.7 s    |
| headed                       | ANGLE Metal — Apple M4 Pro | 1.9 s        |

`--use-angle=metal` makes no measurable difference and is deliberately absent — a first, cold-cache
measurement suggested it was 4× faster, which repeating disproved. `--enable-unsafe-swiftshader` is kept as
a **fallback**: with a GPU present the renderer string stays ANGLE Metal, and without one (a typical Linux CI
runner) it is what keeps WebGL available at all.

Both `workers` and `timeout` are consequently CI-conditional. The worker cap and the 150 s timeout existed
to survive software GL; locally the GPU handles the load, so the default worker count and a 60 s timeout
give faster feedback while CI keeps its margins.

### 8.2 An on-disk tile cache (`tests/tileCache.ts`)

One located page load pulls ~66 objects / ~6.8 MB from `tiles.versatiles.org`. Across ~120 map-loading call
sites that is thousands of requests per run for the same handful of tiles over Oviedo — slow, and impolite
to a free community service that could reasonably rate-limit us.

An auto fixture routes that host through `.cache/tiles/`, keyed on `sha1(method + url)`. It is incremental
and self-healing, so there is no record/replay mode to keep in sync, and the suite runs offline once warm
(verified: with `TILES_OFFLINE=1` turning every miss into an abort, both maps still reach `idle`).

Four details that each cost a wrong turn:

- **Strip `content-encoding`.** `route.fetch()` returns a decoded body and `fulfill` sets its own length, so
  replaying the original encoding headers makes the browser try to gunzip plain bytes. Everything else is
  preserved — CORS especially, without which these cross-origin responses are rejected outright.
- **Store only 200s.** Caching a 404 would have permanently hidden the elevation-tile bug (§7 of
  I18N-ROUTING.md). Errors go to the network every time.
- **Tolerate tests ending mid-fetch.** A test can finish while tiles are in flight; the context closes, the
  `APIResponse` is disposed, and `body()`/`fulfill()` reject — which Playwright charges to the test that just
  passed. Symptom: six failures whose _identity changed between runs_. `ignoreIfGone()` swallows exactly
  those two error shapes and re-throws everything else.
- **`TILES_NOCACHE=1` bypasses it**, so a nightly `@live` job still notices upstream changes that a warm
  cache would mask. A stale cache hides breakage the same way a stale mock does.

`.cache/` is git-ignored; CI should restore it via `actions/cache` rather than commit binary tiles.

### 8.3 Why the geocoder is stubbed, not cached

A fair question given §8.2, and the answer is that the two hosts play different roles.

Tiles are **scenery** — no assertion depends on their content, so replaying whatever the server happened to
send is fine. The geocoder is **under test**: `location-search.spec.ts` asserts on an HTTP 500, an empty
result set, a bare `name` with no context line, a feature with broken geometry, a non-string property.
Those are authored responses; a cache can only replay what actually came back, so it could never produce
them. Volume settles it either way — a Photon response is a few KB against 6.8 MB of tiles per page load.

`stubGeocoder` is an **auto fixture**, so the no-network property is enforced rather than depending on each
new spec remembering to ask. Measured before making it automatic: zero un-stubbed geocoder requests across
the whole suite — but only by luck, since nothing prevented the next spec from forgetting.

`tests/geocode-live.spec.ts` is the deliberate exception, and the reason the stubs are safe: a suite built
entirely on hand-written fixtures cannot notice the one upstream failure that matters most, the response
shape changing. It calls `searchPlaces`/`reverseGeocode` against the real service and asserts the contract
— coordinates in `[lon, lat]` order above all, since swapping them puts every result in the wrong
hemisphere and silently corrupts the eclipse verdict — rather than the data, which changes with OSM.

Run it with `PWLIVE=1 npx playwright test --grep @live` (~4 s, no browser work), nightly.

**A trap worth knowing about:** a project-level `grepInvert` **replaces** the top-level one instead of
adding to it. With `grepInvert: /@live/` set globally, the live specs still ran on the `webkit` project,
because that project sets `grepInvert: /@webgl/`. Every PR would have hit the geocoder unnoticed. Both the
per-project regex and a `beforeAll` guard inside the live spec — which throws unless `PWLIVE` is set — now
prevent that.

### 8.4 What the speed itself exposed

The disposal race above was latent in the cache from the moment it was written, and only became reachable
once the suite was fast enough for tests to routinely end with requests outstanding. Worth remembering when
reading a green suite as evidence: a slow suite can hide races that a fast one surfaces immediately.
