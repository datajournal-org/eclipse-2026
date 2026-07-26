// Building the B3 map's static scene: the VersaTiles "colorful" style (labels off, DEM source added), the
// terrain / sky / hillshade / 3D-buildings / Sun layers added on load, and the Sun-arc envelope that the
// framing is derived from. All map mutation goes through the passed `m`, so no maplibre runtime is imported
// here (the component owns the dynamic import).
import type { Map as MlMap } from 'maplibre-gl';
import { sunMoonHorizon } from '$lib/eclipse';
import { createSunLayer, type SunState } from '$lib/skyview/sunLayer';
import { SKY_PALETTE } from '$lib/config';
import { hexToRgb } from '$lib/brand';

const ELEV = 'https://tiles.versatiles.org/tiles/elevation/{z}/{x}/{y}';

// The VersaTiles colorful style with labels removed and the elevation DEM wired in. Returns the style plus
// the base map's land colour, so the 3D buildings can share it (their lit faces match the ground).
export function buildMapStyle(colorful: (typeof import('@versatiles/style'))['colorful']) {
	const style = colorful({ baseUrl: 'https://tiles.versatiles.org' });
	style.layers = style.layers.filter((l) => l.type !== 'symbol'); // labels off
	style.sources.dem = { type: 'raster-dem', tiles: [ELEV], tileSize: 512, encoding: 'terrarium' };

	const bgPaint = style.layers.find((l) => l.id === 'background')?.paint as
		{ 'background-color'?: string } | undefined;
	const landColor = bgPaint?.['background-color'] ?? '#f9f4ee';
	return { style, landColor };
}

// Terrain, sky, hillshade, 3D buildings and the Sun billboard — added once the map has loaded.
export function addSceneLayers(m: MlMap, opts: { sun: SunState; landColor: string }) {
	m.setTerrain({ source: 'dem', exaggeration: 1.0 });
	// Pin the camera to the sea-level-referenced altitude we compute in the controller, instead of clamping
	// the view centre onto the terrain: over mountainous ground that terrain height swings as the camera
	// orbits, which bobbed the whole rig up and down and pushed the marker off-screen.
	m.setCenterClampedToGround(false);
	try {
		m.setSky({
			'sky-color': SKY_PALETTE.sky,
			'horizon-color': SKY_PALETTE.horizon,
			'fog-color': SKY_PALETTE.fog,
			'sky-horizon-blend': 0.7,
			'horizon-fog-blend': 0.6
		});
	} catch {
		/* older sky spec — ignore (the dusk veil still dims the scene) */
	}
	const firstSymbol = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
	m.addLayer(
		{
			id: 'hillshade',
			type: 'hillshade',
			source: 'dem',
			paint: {
				'hillshade-exaggeration': 0.5,
				'hillshade-illumination-anchor': 'map', // so the direction below tracks the Sun's azimuth
				'hillshade-illumination-direction': 90
			}
		},
		firstSymbol
	);
	for (const id of ['building', 'building:outline']) if (m.getLayer(id)) m.removeLayer(id);
	m.addLayer(
		{
			id: 'buildings-3d',
			type: 'fill-extrusion',
			source: 'versatiles-shortbread',
			'source-layer': 'buildings',
			filter: ['!=', ['get', 'hide_3d'], true],
			paint: {
				'fill-extrusion-color': opts.landColor,
				'fill-extrusion-height': ['coalesce', ['get', 'height'], 3],
				'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
				//'fill-extrusion-opacity': 0.3,
				'fill-extrusion-vertical-gradient': true
			}
		},
		firstSymbol
	);
	m.addLayer(createSunLayer(opts.sun, hexToRgb(SKY_PALETTE.sun)));
}

// The Sun-arc envelope over the eclipse window (coarse sample, azimuth unwrapped): the azimuth span and
// peak altitude that the one fixed orientation shot is framed around.
export function sunArcEnvelope(
	lat: number,
	lon: number,
	times: number[],
	N: number,
	step: number
): { azMin: number; azMax: number; altMax: number } {
	let azMin = Infinity,
		azMax = -Infinity,
		altMax = -Infinity,
		prevAz: number | null = null;
	for (let i = 0; i <= N; i += step) {
		const ss = sunMoonHorizon(lat, lon, new Date(times[i])).sun;
		let a = ss.az;
		if (prevAz !== null) {
			while (a - prevAz > 180) a -= 360;
			while (a - prevAz < -180) a += 360;
		}
		prevAz = a;
		azMin = Math.min(azMin, a);
		azMax = Math.max(azMax, a);
		altMax = Math.max(altMax, ss.alt);
	}
	return { azMin, azMax, altMax };
}
