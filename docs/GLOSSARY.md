# Glossary

Shared vocabulary for the Eclipse 2026 app, so astronomical concepts, UI elements, and libraries are named
precisely in discussion. Terms use the exact names found in the code where one exists.

## Page structure

- **Two-state page** — one prerendered page per language (`/eclipse-2026/de/` …): the **A** state (event
  overview, always shown) plus the **B** state (personal, appended once a location is chosen); otherwise
  the **LocationCall** prompt.
- **Language root** — `/eclipse-2026/`, the crawler-facing default-language page that dispatches browsers
  to `/de/`, `/en/` or `/es/`.
- **A-sections** — location-independent overview blocks: **A1** `Countdown` (`.cd`), **A2** `ShadowRun`
  (`.a2`), **A4** `LocationCall`. Plus `TimeZoneNote`, which carries no section number.
  (**A3**, the three side-by-side reference locations in WIREFRAMES.md, was never built.)
- **B-sections** — per-location blocks: **B1** `Verdict` (`.b1`), **B3** `SkyView` (`.b3`), **B6**
  `Checklist` (`.b6`). B6 alone also renders in state A, reduced to its tick-off list (no
  countdown or calendar export) — but not for a chosen location the eclipse misses. There is **no B2**: the phase timeline lives inside B3's scrubber (ticks, totality
  band, phase labels) rather than as its own section — see TESTING.md §7.
- **Eyebrow** — the small `.eyebrow` tag in a block header; today only A2 uses one, showing the date.
- **`userLocation`** — the chosen place (`{lat, lon, name}`); kept in `localStorage` only, never written to
  the URL and never sent to a server. `?lat&lon&name` is read once at load as a debug override.
- **`localEclipse`** — derived store: the local circumstances for the current `userLocation`.

## Astronomy & eclipse

- **Obscuration** — fraction of the Sun's **area** covered by the Moon (0–1); the "coverage %" we display.
- **Magnitude** — fraction of the Sun's **diameter** covered (distinct from obscuration).
- **Kind** — eclipse type at a location: `total`, `partial`, `annular`, or none.
- **First contact (C1)** — `partialBegin`: the Moon first touches the Sun's disc.
- **Second contact (C2)** — `totalBegin`: totality begins.
- **Greatest eclipse / maximum** — `peak`: instant of maximum coverage at the location.
- **Third contact (C3)** — `totalEnd`: totality ends.
- **Last contact (C4)** — `partialEnd`: the Moon leaves the Sun's disc.
- **Local circumstances** — the contact times, altitudes, kind, and obscuration for one observer (`localCircumstances`).
- **Altitude** — angle of a body above the horizon (deg); **Azimuth** — compass bearing of a body (deg, 0 = N, CW).
- **Angular radius** — apparent radius of the Sun/Moon disc (~0.25°); drives the billboard's real size.
- **Umbra / penumbra** — the Moon's full-shadow / partial-shadow cones; the umbra traces the totality path.
- **Totality band / corridor** — the ground track where totality is visible (`corridor.generated.ts`, build-time precomputed).
- **Iso-lines** — curves of equal obscuration drawn on the A2 globe (`isoLinesLayer`, `isoRing`, `isoLabels`).
- **Shadow center / path** — the Moon-shadow point on Earth and its track (`shadowCenter`, `shadowPath`).
- **Curvature dip** — how far the true horizon sits below eye level due to Earth's curvature.
- **ECEF** — Earth-Centered, Earth-Fixed coordinates (`sunMoonECEF`); **horizon frame** — observer alt/az (`sunMoonHorizon`).

## Rendering & UI (mostly B3 SkyView)

- **Stage** — the shared full-bleed media frame (`.stage` / `.stage-canvas`) that hosts a map/globe.
- **Segment grammar** — the four-slot section structure (header `.block-head`, intro `.sub`, content, footer `.seg-foot`); see WIREFRAMES.md, enforced by `tests/segments.spec.ts`.
- **Marker** — the user's location dot (`.user-pin`, dark-red dot + white ring); the A2 globe adds a `.is-pulsing` ring.
- **Dusk veil** — a DOM overlay (`.b3-dusk`, `DUSK_HEX`) inside the map canvas that dims the whole B3 scene as the eclipse deepens.
- **Scrubber / time slider** — the range input under B3 that scans time across the eclipse window.
- **Chips** — the altitude / azimuth / coverage readout row under the slider.
- **Reset button** — B3 control that returns the camera to the Sun-facing framing (orbit 0).
- **Sun billboard** — WebGL disc with the Moon crescent cut out (`sunLayer`), drawn at real angular size at the far plane; terrain and buildings occlude it (the locator still points at it).
- **Framing** — `computeFraming`: picks vertical FOV, center azimuth and the camera's two angles (`aimEl`, `camDep`) so one fixed B3 shot spans the Sun's arc.
- **`aimEl` / `camDep`** — where the shot points (elevation of the view centre; + = above the horizon) and how far the marker sits below the camera's horizontal. A high Sun drives `aimEl` positive — pitch past 90° — and `camDep` towards zero.
- **Envelope** — the Sun's azimuth span + peak altitude sampled over the eclipse window, fed to `computeFraming`.
- **Orbit** — horizontal drag on B3 rotates the camera around the marker (bearing only; height stays constant).
- **Planet labels** — B3 names Venus, Mercury and Jupiter in the sky (`PlanetLabels`, DOM; localized via `b3.planets.*`), each label fading with its planet's `brightness`; rows identified through `PLANET_INDEX` (sky.generated.ts).
- **Compass ruler** — B3's horizon orientation: camera-anchored tick lines along the true horizon (`compassLayer`, every 5°/15°/45°) with localized cardinal labels (`CompassLabels`, DOM) and the cardinal in the azimuth chip; shared azimuth logic in `skyview/compass.ts`.
- **Hillshade** — terrain relief-shading layer; its illumination direction tracks the Sun's azimuth.
- **3D buildings** — extruded building layer (`fill-extrusion`), lit by a constant directional light.
- **Environment** — `environment(obsc)`: the eclipse-driven veil opacity + directional light for the scene.

## Camera & map primitives (MapLibre)

- **FOV** — vertical field of view (`setVerticalFieldOfView`); **pitch** — camera tilt; **bearing** — camera heading.
- **`centerClampedToGround`** — when off, the camera keeps a fixed sea-level altitude instead of riding terrain (stops the B3 bob).
- **`queryTerrainElevation([lng,lat])`** — terrain height at a point; **`MercatorCoordinate`** — mercator XYZ used to place WebGL layers.
- **Custom layer** — a `CustomLayerInterface` WebGL layer drawn in the map's 3D slot (sun, moon shadow, iso-lines).
- **Depth test** — ON (read-only) for the Sun billboard, so ridges and buildings above its altitude hide it — the "is my view west clear?" answer drawn into the scene; OFF for the marker and the sky chrome (stars, compass), which must always be reference-visible.
- **`destPoint(lat, lon, az, dist)`** — the point a distance/bearing away from an origin (great-circle step).

## Libraries & tooling

- **SvelteKit** — app framework; **adapter-static** + **prerender** ship the site as static files
  (bunny.net in production).
- **Svelte 5 runes** — reactivity API (`$state`, `$derived`, `$effect`, `$props`) plus `onMount`.
- **MapLibre GL JS** (v6) — the map/globe engine; hosts the terrain, buildings, hillshade, and custom WebGL layers.
- **VersaTiles** — tile provider: `@versatiles/style` (the `colorful` base style) + hosted vector tiles and the elevation DEM.
- **Terrarium DEM** — the raster-encoded elevation tiles used for 3D terrain.
- **astronomy-engine** — ephemeris library for Sun/Moon positions and eclipse geometry.
- **Open Props** — CSS engineering scales (`--size-*`, `--font-*`, easings) imported once in the root layout.
- **Design tokens** — `tokens.css`, two tiers: primitives (raw brand values) → semantic roles (`--marker`, `--accent`, …).
- **`brand.ts`** — reads design tokens so WebGL layers honour the same palette (`readBrandColors`).
- **`map.css`** — shared styling for MapLibre chrome (controls, attribution) and the marker, scoped under `.stage-canvas`.
- **Playwright** — headless browser used to verify visuals/behaviour (screenshots, scroll, timings).
- **`npm run check`** — the full gate: Prettier + `tsc` + ESLint + `svelte-check` **and both test layers**
  (`npm run test` → Vitest, then Playwright), so it takes minutes, not seconds. `npm run check:ts`,
  `check:format`, `check:svelte` and `lint` are the individual steps; **`npm run build`** — the static build.
