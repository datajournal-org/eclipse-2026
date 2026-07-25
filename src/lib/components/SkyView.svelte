<!-- B3 — first-person "your view of the Sun": a tilted 3D map (VersaTiles terrain + buildings) aimed at
     the Sun's azimuth, with the eclipsed Sun drawn as a depth-tested billboard so hills/buildings occlude
     it. Time slider over the local eclipse window. Ported from prototype/b3.html. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import 'maplibre-gl/dist/maplibre-gl.css';
	import type { Map as MlMap } from 'maplibre-gl';
	import { t, fmt } from '$lib/i18n';
	import { userLocation } from '$lib/stores/location';
	import { sunMoonHorizon, localCircumstances } from '$lib/eclipse';
	import { discOverlapFraction } from '$lib/shadow-globe/shadowProfile';
	import { destPoint } from '$lib/shadow-globe/vec3';
	import { createSunLayer, type SunState } from '$lib/skyview/sunLayer';

	const ELEV = 'https://tiles.versatiles.org/tiles/elevation/{z}/{x}/{y}';
	const D2R = Math.PI / 180,
		R2D = 180 / Math.PI;
	const AU = 149597870.7,
		RSUN = 696000,
		RMOON = 1737.4;
	const norm180 = (d: number) => ((d + 540) % 360) - 180;

	let mapContainer: HTMLDivElement;
	let ready = $state(false);
	let clock = $state('--:--');
	let altTxt = $state('–');
	let azTxt = $state('–');
	let obscTxt = $state('–');
	let note = $state('');
	let frameIndex = $state(0);
	let frameMax = $state(1);
	let setFrame: (i: number) => void = () => {};

	onMount(() => {
		const loc = get(userLocation);
		if (!loc) return;
		const LAT = loc.lat,
			LON = loc.lon;
		let map: MlMap | undefined;
		let disposed = false;

		(async () => {
			const maplibregl = (await import('maplibre-gl')).default;
			const { colorful } = await import('@versatiles/style');
			if (disposed) return;

			const lc = localCircumstances(LAT, LON);
			const tStart = (lc?.partialBegin?.time ?? new Date('2026-08-12T16:30:00Z')).getTime();
			const tEnd = (lc?.partialEnd?.time ?? new Date('2026-08-12T19:00:00Z')).getTime();
			const N = 240;
			const times = Array.from({ length: N + 1 }, (_, i) => tStart + ((tEnd - tStart) * i) / N);
			frameMax = N;

			const sun: SunState = { center: [0, 0, 0, 1], moon: [0, 0], moonR: 1, visible: false, opacity: 1 };
			const SUN_DIST = 30000; // metres: far enough that buildings (<1 km) occlude it

			const style = colorful({ baseUrl: 'https://tiles.versatiles.org' });
			style.layers = style.layers.filter((l) => l.type !== 'symbol'); // labels off
			style.sources.dem = { type: 'raster-dem', tiles: [ELEV], tileSize: 512, encoding: 'terrarium' };

			const m = new maplibregl.Map({
				container: mapContainer,
				center: [LON, LAT],
				zoom: 16,
				pitch: 85,
				bearing: 290,
				maxPitch: 85,
				attributionControl: { compact: false },
				style
			});
			map = m;
			m.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

			m.on('load', () => {
				m.setTerrain({ source: 'dem', exaggeration: 1.0 });
				try {
					m.setSky({
						'sky-color': '#8fb4e0',
						'horizon-color': '#f4c48a',
						'fog-color': '#e6c39a',
						'sky-horizon-blend': 0.7,
						'horizon-fog-blend': 0.6
					});
				} catch {
					/* older sky spec — ignore */
				}
				const firstSymbol = m.getStyle().layers.find((l) => l.type === 'symbol')?.id;
				m.addLayer(
					{ id: 'hillshade', type: 'hillshade', source: 'dem', paint: { 'hillshade-exaggeration': 0.35 } },
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
							'fill-extrusion-color': '#d7c9b6',
							'fill-extrusion-height': ['coalesce', ['get', 'height'], 3],
							'fill-extrusion-base': ['coalesce', ['get', 'min_height'], 0],
							'fill-extrusion-opacity': 0.96
						}
					},
					firstSymbol
				);
				m.addLayer(createSunLayer(sun));

				const EYE = 1.7,
					CAM_TGT = 3000,
					AIM_DOWN = 6; // eye height, camera target distance, fixed slight downward aim

				// max elevation angle of the terrain along an azimuth (incl. Earth-curvature dip)
				function terrainHorizonAlt(az: number, eyeAlt: number): number {
					let maxAng = -90;
					for (const d of [150, 300, 600, 1200, 2500, 5000, 10000, 20000, 40000]) {
						const [lng2, lat2] = destPoint(LAT, LON, az, d);
						const e = m.queryTerrainElevation([lng2, lat2]);
						if (e == null) continue;
						const drop = (d * d) / (2 * 6371000); // horizon dip from curvature
						const ang = Math.atan2(e - drop - eyeAlt, d) * R2D;
						if (ang > maxAng) maxAng = ang;
					}
					return maxAng;
				}

				function update() {
					const date = new Date(times[frameIndex]);
					const sm = sunMoonHorizon(LAT, LON, date);
					const s = sm.sun,
						mo = sm.moon;
					const sunAngR = Math.atan(RSUN / (s.distAu * AU)) * R2D;
					const moonAngR = Math.atan(RMOON / (mo.distAu * AU)) * R2D;
					const dx = norm180(mo.az - s.az) * Math.cos(s.alt * D2R); // +x east, +y up (screen)
					const dy = mo.alt - s.alt;
					sun.moon = [dx / sunAngR, dy / sunAngR];
					sun.moonR = moonAngR / sunAngR;

					const ground = m.queryTerrainElevation([LON, LAT] as [number, number]) ?? 0;
					const eyeAlt = ground + EYE;

					// place the Sun disc along (az, alt), far away so buildings occlude it
					const hd = SUN_DIST * Math.cos(s.alt * D2R),
						vd = SUN_DIST * Math.sin(s.alt * D2R);
					const [slng, slat] = destPoint(LAT, LON, s.az, hd);
					const merc = maplibregl.MercatorCoordinate.fromLngLat([slng, slat], eyeAlt + vd);
					sun.center = [merc.x, merc.y, merc.z, 1];

					// terrain occlusion: fade the Sun out as it drops below the terrain/curvature horizon
					const horizon = terrainHorizonAlt(s.az, eyeAlt);
					sun.opacity = Math.min(1, Math.max(0, (s.alt - horizon + 0.25) / 0.5));
					sun.visible = sun.opacity > 0.01;

					// eye-level first-person camera toward the Sun azimuth at a FIXED slight downward angle
					// (independent of Sun altitude → pitch stays within maxPitch; the Sun rides up/down in frame)
					try {
						const tgtAlt = eyeAlt - CAM_TGT * Math.tan(AIM_DOWN * D2R);
						const [tlng, tlat] = destPoint(LAT, LON, s.az, CAM_TGT);
						m.jumpTo(
							m.calculateCameraOptionsFromTo(
								new maplibregl.LngLat(LON, LAT),
								eyeAlt,
								new maplibregl.LngLat(tlng, tlat),
								tgtAlt
							)
						);
					} catch {
						m.setBearing(s.az);
					}

					const obsc = discOverlapFraction(sunAngR, moonAngR, Math.hypot(dx, dy));
					clock = get(fmt).time(date);
					altTxt = s.alt.toFixed(1) + '°';
					azTxt = s.az.toFixed(0) + '°';
					obscTxt = (obsc * 100).toFixed(0) + '%';
					note = s.alt <= horizon ? get(t)('b3.behind_horizon') : '';
					m.triggerRepaint();
				}

				setFrame = (i: number) => {
					frameIndex = i;
					update();
				};
				// start at greatest eclipse
				const peakT = (lc?.peak?.time ?? new Date('2026-08-12T18:08:00Z')).getTime();
				frameIndex = Math.round(((peakT - tStart) / (tEnd - tStart)) * N);
				m.once('idle', update); // recompute once terrain tiles are loaded (queryTerrainElevation needs them)
				update();
				ready = true;
			});
		})();

		return () => {
			disposed = true;
			map?.remove();
		};
	});
	function onScrub(e: Event) {
		setFrame(+(e.currentTarget as HTMLInputElement).value);
	}
</script>

<section class="block b3">
	<div class="block-head">
		<h2>{$t('b3.title')}</h2>
		<span class="eyebrow">B3</span>
	</div>
	<p class="sub">{$t('b3.subtitle')}</p>

	<div class="sky-wrap bleed">
		<div class="sky" bind:this={mapContainer}></div>
		{#if !ready}<div class="loading">{$t('b3.loading')}</div>{/if}
	</div>

	<div class="panel">
		<div class="row">
			<div class="clock tnum">{clock}</div>
			<input
				type="range"
				min="0"
				max={frameMax}
				step="1"
				value={frameIndex}
				oninput={onScrub}
				aria-label={$t('b3.title')}
			/>
		</div>
		<div class="chips tnum">
			<span>☀ {$t('b3.altitude')} <b>{altTxt}</b></span>
			<span>{$t('b3.azimuth')} <b>{azTxt}</b></span>
			<span>◐ {$t('b3.coverage')} <b>{obscTxt}</b></span>
			{#if note}<span class="warn">{note}</span>{/if}
		</div>
	</div>
</section>

<style>
	.sub {
		color: var(--muted);
		font-size: 0.9rem;
		margin: 2px 0 12px;
	}
	.sky-wrap {
		position: relative;
		overflow: hidden;
		background: var(--bg);
	}
	.sky {
		height: min(60vh, 440px);
		background: var(--bg);
	}
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: var(--muted);
		pointer-events: none;
	}
	.panel {
		margin-top: 12px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.clock {
		font-weight: 700;
		font-size: 1.1rem;
		white-space: nowrap;
	}
	input[type='range'] {
		flex: 1;
		accent-color: var(--accent);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 14px;
		margin-top: 8px;
		font-size: 0.86rem;
		color: var(--muted);
	}
	.chips b {
		color: var(--accent);
	}
	.chips .warn {
		color: var(--accent-2, #ffcf9a);
	}
</style>
