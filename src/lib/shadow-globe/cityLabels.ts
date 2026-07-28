// City labels for the A2 globe — hardcoded, so ShadowRun does not have to load @versatiles/style at all
// and every property here is ours to fine-tune.
//
// Provenance: extracted from the generated VersaTiles "colorful" style (@versatiles/style 5.13.0,
// `colorful({ baseUrl: 'https://tiles.versatiles.org' })`) — the four place-label layers, the shortbread
// source and the glyphs URL, with the schema-facing parts (source-layer, kind filters, `name` field,
// population sort, fonts) kept verbatim. To re-extract after a dependency update, log the same call and
// compare; a unit test also cross-checks the schema-facing parts against the live generated style.
//
// Deliberate departures from colorful:
//  · paint — colorful sets dark text with a light halo for its light basemap; over darkened satellite
//    imagery the labels invert to white with a dark halo (readable inside the eclipse shadow too);
//  · only the four city-scale kinds — villages and below are noise at globe scale, and their tile
//    traffic; the kinds' own minzooms (5..9) double as the "zoomed in far enough" gate.
import type { SourceSpecification, SymbolLayerSpecification } from 'maplibre-gl';

/** Fonts for the labels — nothing else on the globe draws text. */
export const CITY_LABEL_GLYPHS = 'https://tiles.versatiles.org/assets/glyphs/{fontstack}/{range}.pbf';

/**
 * The shortbread vector source behind the labels. Not a byte of it is fetched at the opening framing:
 * every label layer carries a minzoom (5+), and MapLibre only requests a source once some layer using it
 * is in zoom range.
 */
export const CITY_LABEL_SOURCE: SourceSpecification = {
	type: 'vector',
	tiles: ['https://tiles.versatiles.org/tiles/osm/{z}/{x}/{y}'],
	scheme: 'xyz',
	bounds: [-180, -85.0511287798066, 180, 85.0511287798066],
	minzoom: 5,
	maxzoom: 14,
	attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
};

/** Readable over satellite imagery; shared by all four layers. */
const SATELLITE_PAINT: SymbolLayerSpecification['paint'] = {
	'text-color': 'rgb(255,255,255)',
	'text-halo-color': 'rgba(0,0,0,0.75)',
	'text-halo-width': 1.6,
	'text-halo-blur': 1
};

/** One place-label layer; everything not in the argument list is identical across the four kinds. */
const placeLayer = (
	id: string,
	kind: string,
	minzoom: number,
	sizeStops: [number, number][]
): SymbolLayerSpecification => ({
	id,
	type: 'symbol',
	source: 'versatiles-shortbread',
	'source-layer': 'place_labels',
	filter: ['==', ['get', 'kind'], kind],
	minzoom,
	layout: {
		'text-field': ['get', 'name'],
		// population-based collision priority: when labels compete for space, the bigger city wins
		'symbol-sort-key': ['-', ['to-number', ['get', 'population'], 0]],
		'text-font': ['noto_sans_regular'],
		// colorful ships legacy `stops`; written as the equivalent interpolate expression, which is what
		// MapLibre v6's types accept (and what the legacy form desugars to anyway)
		'text-size': ['interpolate', ['linear'], ['zoom'], ...sizeStops.flat()]
	},
	paint: { ...SATELLITE_PAINT }
});

/**
 * The four city-scale label layers, in colorful's own order (town first, capital last). The minzooms and
 * size ramps are colorful's values as extracted — tune freely; the unit tests pin only the schema-facing
 * parts.
 */
export const CITY_LABEL_LAYERS: readonly SymbolLayerSpecification[] = [
	placeLayer('label-place-town', 'town', 9, [
		[8, 11],
		[12, 14]
	]),
	placeLayer('label-place-city', 'city', 7, [
		[7, 11],
		[10, 14]
	]),
	placeLayer('label-place-statecapital', 'state_capital', 6, [
		[6, 11],
		[10, 15]
	]),
	placeLayer('label-place-capital', 'capital', 5, [
		[5, 12],
		[10, 16]
	])
];
