import { describe, it, expect } from 'vitest';
import { colorful } from '@versatiles/style';
import type { SymbolLayerSpecification } from 'maplibre-gl';
import { CITY_LABEL_GLYPHS, CITY_LABEL_SOURCE, CITY_LABEL_LAYERS } from './cityLabels';

describe('the hardcoded city-label constants', () => {
	it('carry the four city-scale kinds, town first, capital last', () => {
		expect(CITY_LABEL_LAYERS.map((l) => l.id)).toEqual([
			'label-place-town',
			'label-place-city',
			'label-place-statecapital',
			'label-place-capital'
		]);
	});

	it('gate every layer past the opening framing, so no tile loads before zooming in', () => {
		// The globe opens at ~z2.5; the earliest labels (capitals) come at 5. If any minzoom ever drops
		// to the opening zoom, the shortbread source starts costing tiles on every page view.
		for (const l of CITY_LABEL_LAYERS) expect(l.minzoom, l.id).toBeGreaterThanOrEqual(5);
	});

	it('paint light text with a dark halo — the satellite-imagery inversion of colorful', () => {
		for (const l of CITY_LABEL_LAYERS) {
			expect(l.paint?.['text-color'], l.id).toBe('rgb(255,255,255)');
			expect(l.paint?.['text-halo-color'], l.id).toBe('rgba(0,0,0,0.75)');
		}
	});

	it('label by name with population-based collision priority', () => {
		for (const l of CITY_LABEL_LAYERS) {
			expect(l.layout?.['text-field'], l.id).toEqual(['get', 'name']);
			expect(JSON.stringify(l.layout?.['symbol-sort-key']), l.id).toContain('population');
		}
	});

	it('point at the shortbread tiles and the VersaTiles glyphs, with OSM attribution', () => {
		expect(CITY_LABEL_GLYPHS).toContain('tiles.versatiles.org/assets/glyphs/');
		expect('tiles' in CITY_LABEL_SOURCE && CITY_LABEL_SOURCE.tiles?.[0]).toContain('/tiles/osm/');
		expect('attribution' in CITY_LABEL_SOURCE && CITY_LABEL_SOURCE.attribution).toContain('OpenStreetMap');
	});
});

describe('parity with the upstream colorful style', () => {
	/**
	 * The constants are hardcoded so they can be TUNED — minzooms, sizes and paint may freely diverge
	 * from colorful. What may NOT diverge is the tile-schema coupling: the source layer, the `kind`
	 * values and the font stack come from the shortbread tiles and the VersaTiles server. This test
	 * checks exactly that split against the live generated style, so a dependency update that renames a
	 * kind or drops a font fails here instead of silently rendering an empty label layer.
	 */
	const generated = colorful({ baseUrl: 'https://tiles.versatiles.org' });

	it('still finds every layer upstream, on the same source layer with the same kind filter', () => {
		for (const ours of CITY_LABEL_LAYERS) {
			const theirs = generated.layers.find((l) => l.id === ours.id) as SymbolLayerSpecification | undefined;
			expect(theirs, `${ours.id} vanished from colorful`).toBeDefined();
			expect(ours['source-layer'], ours.id).toBe(theirs!['source-layer']);
			expect(ours.filter, ours.id).toEqual(theirs!.filter);
		}
	});

	it('uses a font stack colorful itself still uses', () => {
		const upstreamFonts = new Set(
			generated.layers
				.filter((l): l is SymbolLayerSpecification => l.type === 'symbol')
				.flatMap((l) => (l.layout?.['text-font'] as string[] | undefined) ?? [])
		);
		for (const l of CITY_LABEL_LAYERS) {
			for (const font of (l.layout?.['text-font'] as string[]) ?? []) {
				expect(upstreamFonts.has(font), `${font} no longer served`).toBe(true);
			}
		}
	});

	it('matches the upstream glyphs and tile endpoints', () => {
		expect(CITY_LABEL_GLYPHS).toBe(generated.glyphs);
		const upstream = generated.sources['versatiles-shortbread'];
		expect('tiles' in CITY_LABEL_SOURCE && CITY_LABEL_SOURCE.tiles).toEqual(
			'tiles' in upstream ? upstream.tiles : undefined
		);
	});
});
