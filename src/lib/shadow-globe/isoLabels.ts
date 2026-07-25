// The live percent labels ("20 %" … "100 %") on the shadow globe. One DOM marker per iso ring, anchored
// where a ray from the umbra centre in the current VIEWPORT-DOWN direction crosses that ring. Using DOM
// markers (not a GeoJSON symbol layer) avoids the ±85° Mercator clamp near the pole and the async
// setData lag, and keeps the labels upright.
import type { Map as MlMap, Marker } from 'maplibre-gl';
import type { ShadowModel } from './shadowProfile';
import { radiusForCoverage } from './shadowProfile';
import { labelPoint, umbraGroundPoint } from './isoRing';
import { latLonToUnitVector } from './vec3';

type Ring = { percent: number; level: number; opacity: number };
type Entry = { marker: Marker; span: HTMLSpanElement };

export class IsoLabels {
	private markers: Entry[] = [];

	constructor(private rings: Ring[]) {}

	/** Create one marker per ring and add them to the map (hidden until the first `update`). */
	attach(map: MlMap, MarkerCtor: typeof import('maplibre-gl').Marker, center: [number, number]) {
		this.markers = this.rings.map((ring) => {
			const el = document.createElement('div');
			el.className = 'iso-label';
			el.style.display = 'none';
			const span = document.createElement('span');
			span.textContent = `${ring.percent} %`;
			el.appendChild(span);
			const marker = new MarkerCtor({
				element: el,
				anchor: 'top',
				offset: [0, 3],
				rotationAlignment: 'viewport',
				pitchAlignment: 'viewport'
			})
				.setLngLat(center)
				.addTo(map);
			return { marker, span };
		});
	}

	/** Reposition every label for the current frame + view. Call on frame change and on every map move. */
	update(map: MlMap, model: ShadowModel | null, visible: boolean) {
		if (!this.markers.length) return;
		const umbra = model ? umbraGroundPoint(model) : null;
		const down = umbra && model ? viewportDownDir(map, umbra) : null;
		// Shrink + fade the labels out when zoomed far out (unreadable clutter otherwise).
		const size = Math.min(12, Math.pow(2, map.getZoom()) * 2.5);
		const zoomFade = Math.max(0, Math.min(1, (size - 5) / 2));
		this.rings.forEach((ring, i) => {
			const { marker, span } = this.markers[i];
			const radius = model ? radiusForCoverage(model, ring.level) : null;
			const at = visible && model && down && radius != null ? labelPoint(model, radius, down) : null;
			const el = marker.getElement();
			if (at && zoomFade > 0) {
				marker.setLngLat(at);
				el.style.display = '';
				el.style.fontSize = size + 'px';
				span.style.opacity = (zoomFade * ring.opacity).toString();
			} else {
				el.style.display = 'none';
			}
		});
	}

	destroy() {
		this.markers.forEach((m) => m.marker.remove());
		this.markers = [];
	}
}

/** The unit tangent at the umbra centre that points straight DOWN in the current viewport. */
function viewportDownDir(map: MlMap, umbra: [number, number]): [number, number, number] | null {
	const p = map.project(umbra);
	const below = map.unproject([p.x, p.y + 40]);
	const u = latLonToUnitVector(umbra[1], umbra[0]);
	const b = latLonToUnitVector(below.lat, below.lng);
	const proj = b[0] * u[0] + b[1] * u[1] + b[2] * u[2];
	const t: [number, number, number] = [b[0] - proj * u[0], b[1] - proj * u[1], b[2] - proj * u[2]];
	const len = Math.hypot(t[0], t[1], t[2]);
	if (len < 1e-9) return null;
	return [t[0] / len, t[1] / len, t[2] / len];
}
