<!-- A flat 2D map for choosing/adjusting a location: a draggable pin over the VersaTiles basemap, with the
     totality corridor drawn on top so users can see whether their spot is in the path (and drag into it).
     Fills its (positioned) parent; the parent owns the coordinate and the search/confirm chrome. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { Map as MlMap, Marker as MlMarker } from 'maplibre-gl';
	import { loadMaplibre } from '$lib/maplibre';
	import { readBrandColors } from '$lib/brand';
	import { corridorEdges } from '$lib/shadow-globe/corridor';
	import { t } from '$lib/i18n';

	let { lat, lon, onmove }: { lat: number; lon: number; onmove: (lat: number, lon: number) => void } = $props();

	let mapContainer: HTMLDivElement;
	let ready = $state(false);
	let map: MlMap | undefined;
	let marker: MlMarker | undefined;

	onMount(() => {
		let disposed = false;
		let ro: ResizeObserver | undefined;

		(async () => {
			const [maplibregl, versatiles] = await Promise.all([loadMaplibre(), import('@versatiles/style')]).catch(
				(err) => {
					console.error('[picker] failed to load map libraries', err);
					return [null, null] as const;
				}
			);
			if (!maplibregl || !versatiles || disposed) return;

			const brand = readBrandColors();
			const style = versatiles.eclipse({ baseUrl: 'https://tiles.versatiles.org', recolor: { saturate: -0.8 } });

			const m = new maplibregl.Map({
				container: mapContainer,
				style,
				center: [lon, lat],
				zoom: 6,
				attributionControl: { compact: false }
			});
			map = m;
			m.on('error', (e) => console.error('[picker] map error:', (e as { error?: unknown }).error ?? e));
			// Test hook: the end-to-end suite waits on this instead of guessing at a timeout or watching
			// for a visual side effect. `idle` fires once the style, sources and first frame are all done.
			m.once('idle', () => mapContainer.setAttribute('data-map-ready', 'true'));
			m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
			// the map may mount inside a dialog that sizes up after open → keep the canvas in sync
			ro = new ResizeObserver(() => m.resize());
			ro.observe(mapContainer);

			m.on('load', () => {
				const ring = [...corridorEdges.north, ...[...corridorEdges.south].reverse()];
				if (ring.length) {
					ring.push(ring[0]);
					m.addSource('corridor', {
						type: 'geojson',
						data: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [ring] }, properties: {} }
					});
					m.addLayer({
						id: 'corridor-fill',
						type: 'fill',
						source: 'corridor',
						paint: { 'fill-color': brand.accent.hex, 'fill-opacity': 0.05 }
					});
					m.addLayer({
						id: 'corridor-line',
						type: 'line',
						source: 'corridor',
						paint: { 'line-color': brand.accent.hex, 'line-width': 1.5, 'line-opacity': 0.3 }
					});
				}

				marker = new maplibregl.Marker({ draggable: true, color: brand.accent.hex }).setLngLat([lon, lat]).addTo(m);
				marker.on('dragend', () => {
					const p = marker!.getLngLat();
					onmove(p.lat, p.lng);
				});
				m.on('click', (e) => {
					marker!.setLngLat(e.lngLat);
					onmove(e.lngLat.lat, e.lngLat.lng);
				});
				m.getCanvas().style.cursor = 'crosshair';
				ready = true;
			});
		})().catch((err) => console.error('[picker] init failed', err));

		return () => {
			disposed = true;
			ro?.disconnect();
			map?.remove();
		};
	});

	// Follow external coordinate changes (a search hit / GPS) without feeding our own moves back into a loop.
	$effect(() => {
		const la = lat,
			lo = lon;
		if (!map || !marker) return;
		const cur = marker.getLngLat();
		if (Math.abs(cur.lat - la) > 1e-6 || Math.abs(cur.lng - lo) > 1e-6) {
			marker.setLngLat([lo, la]);
			map.easeTo({ center: [lo, la], duration: 500 });
		}
	});
</script>

<div class="picker">
	<!-- stage-canvas: inherit the shared map-chrome styling (controls/attribution) from map.css, so the
	     picker's MapLibre UI matches the A2/B3 maps. -->
	<div class="picker-map stage-canvas" bind:this={mapContainer}></div>
	{#if !ready}<div class="picker-loading">{$t('a2.loading')}</div>{/if}
</div>

<style>
	.picker {
		position: absolute;
		inset: 0;

		.picker-map {
			position: absolute;
			inset: 0;
			height: auto; /* fill via inset:0; override .stage-canvas' fixed height */
		}
		.picker-loading {
			position: absolute;
			inset: 0;
			display: grid;
			place-items: center;
			color: var(--muted);
			font-size: 0.9rem;
			background: var(--bg);
		}
		/* the search bar overlays the map top → push the top-right zoom control below it */
		:global(.maplibregl-ctrl-top-right) {
			top: 48px;
		}
	}
</style>
