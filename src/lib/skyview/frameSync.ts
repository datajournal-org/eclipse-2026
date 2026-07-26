// Per-frame map side effects for the B3 sky view: placing the Sun billboard in the scene and steering the
// map's light + hillshade to match the simulated Sun. Kept out of the component so update() reads as a list
// of steps. Only the MercatorCoordinate constructor is needed from the (dynamically imported) maplibre runtime.
import type { Map as MlMap } from 'maplibre-gl';
import { destPoint } from '$lib/shadow-globe/vec3';
import { DEG_TO_RAD as D2R } from '$lib/constants';
import type { SunState } from '$lib/skyview/sunLayer';
import type { EclipseGeometry } from '$lib/skyview/eclipseGeometry';

type Mlgl = { MercatorCoordinate: typeof import('maplibre-gl').MercatorCoordinate };

const SUN_DIST = 30000; // metres: far out in the sky (parallax negligible; the Sun reads at infinity)
const EYE = 1.7; // eye height (m) used to place the Sun disc above the ground

// Update the Sun billboard state from the current geometry: the Moon-disc offset/size (in Sun-radius units)
// that shapes the crescent, the real angular radius, the Mercator position far out along (az, alt), and
// whether the Sun is above the horizon.
export function placeSun(
	sun: SunState,
	geo: EclipseGeometry,
	opts: { maplibregl: Mlgl; m: MlMap; lat: number; lon: number }
) {
	const { maplibregl, m, lat: LAT, lon: LON } = opts;
	const s = geo.sun;
	const { sunAngR, dx, dy } = geo;
	sun.moon = [dx / sunAngR, dy / sunAngR];
	sun.moonR = geo.moonAngR / sunAngR;
	sun.angRad = sunAngR * D2R; // real angular radius (rad) → billboard drawn at true size

	const ground = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
	const eyeAlt = ground + EYE;
	// place the Sun disc along (az, alt), far out in the sky
	const hd = SUN_DIST * Math.cos(s.alt * D2R),
		vd = SUN_DIST * Math.sin(s.alt * D2R);
	const [slng, slat] = destPoint(LAT, LON, s.az, hd);
	const merc = maplibregl.MercatorCoordinate.fromLngLat([slng, slat], eyeAlt + vd);
	sun.center = [merc.x, merc.y, merc.z, 1];

	// The Sun is drawn on top (sunLayer, depth test off): terrain occlusion is intentionally ignored — we
	// don't know the observer's height (street level vs. a rooftop), so a hill that would block the Sun from
	// the ground might not from a roof. Keep it visible until the whole disc has set — the apparent upper
	// limb below the horizon, i.e. the centre at -(angular radius). `s.alt` is the refracted centre altitude,
	// so this coincides with the standard sunset (astronomy-engine's SearchRiseSet) shown on the slider,
	// instead of vanishing ~2 min early when the centre (half the disc) crosses the horizon.
	sun.visible = s.alt > -sunAngR;
}

// Steer the map's directional light and hillshade to match the simulated Sun's azimuth/altitude and the
// eclipse's brightness/colour (same numbers that drive the Sun billboard and the twilight veil).
export function syncMapLighting(m: MlMap, az: number, alt: number, env: { light: string; intensity: number }) {
	m.setLight({
		anchor: 'map',
		position: [1.15, az, 90 - alt] as [number, number, number],
		color: env.light,
		intensity: env.intensity
	});
	m.setPaintProperty('hillshade', 'hillshade-illumination-direction', Math.round(((az % 360) + 360) % 360));
}
