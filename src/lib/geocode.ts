// Forward + reverse geocoding via the VersaTiles Photon instance (OpenStreetMap data, no key, CORS-open).
// Photon returns plain GeoJSON; we flatten it into a place with a two-line label.
const BASE = 'https://geocode.versatiles.org';

export type GeoHit = { lat: number; lon: number; label: string; sub: string };

/** Shortest query worth sending: one character matches most of the planet. */
export const MIN_QUERY_LENGTH = 2;

type PhotonProps = Record<string, unknown>;
type PhotonFeature = { geometry: { coordinates: [number, number] }; properties?: PhotonProps };
type PhotonResponse = { features?: PhotonFeature[] };

// Photon supports a small set of languages; fall back to English otherwise.
function photonLang(locale: string): string {
	return locale === 'de' || locale === 'fr' || locale === 'it' ? locale : 'en';
}

function str(p: PhotonProps, key: string): string {
	return typeof p[key] === 'string' ? (p[key] as string) : '';
}

// A primary label (street/name or place) and a secondary context line (city, region, country), deduped.
function formatPlace(p: PhotonProps): { label: string; sub: string } {
	const street = [str(p, 'street'), str(p, 'housenumber')].filter(Boolean).join(' ');
	const label = str(p, 'name') || street || str(p, 'city') || str(p, 'county') || str(p, 'country') || '—';
	const context = [str(p, 'city'), str(p, 'state') || str(p, 'county'), str(p, 'country')]
		.filter(Boolean)
		.filter((v) => v !== label);
	return { label, sub: [...new Set(context)].join(', ') };
}

export async function searchPlaces(query: string, locale = 'de', limit = 6, signal?: AbortSignal): Promise<GeoHit[]> {
	const q = query.trim();
	if (q.length < MIN_QUERY_LENGTH) return [];
	const url = `${BASE}/api?q=${encodeURIComponent(q)}&limit=${limit}&lang=${photonLang(locale)}`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error(`geocode ${res.status}`);
	const data = (await res.json()) as PhotonResponse;
	return (data.features ?? [])
		.filter((f) => Array.isArray(f.geometry?.coordinates))
		.map((f) => {
			const [lon, lat] = f.geometry.coordinates;
			const { label, sub } = formatPlace(f.properties ?? {});
			return { lat, lon, label, sub };
		});
}

/** Nearest place name for a coordinate, as a single "Label, context" string (null on failure). */
export async function reverseGeocode(lat: number, lon: number, locale = 'de'): Promise<string | null> {
	try {
		const url = `${BASE}/reverse?lon=${lon}&lat=${lat}&lang=${photonLang(locale)}`;
		const res = await fetch(url);
		if (!res.ok) return null;
		const data = (await res.json()) as PhotonResponse;
		const f = data.features?.[0];
		if (!f) return null;
		const { label, sub } = formatPlace(f.properties ?? {});
		return sub ? `${label}, ${sub}` : label;
	} catch {
		return null;
	}
}
