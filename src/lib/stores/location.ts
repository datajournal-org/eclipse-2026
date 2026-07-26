// User location — stays on the device. Backed by localStorage AND the URL (?lat=&lon=&name=),
// so a set location is shareable yet never sent to a server.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'eclipse.location';

export type Place = { lat: number; lon: number; name: string | null };

/**
 * On the client the value is read SYNCHRONOUSLY (URL, then localStorage) at module load, so the very first
 * client render already shows the located "B" state. Deferring this to onMount flipped the layout a tick
 * after hydration, which grew the page after the browser had already restored the scroll position on a
 * reload — so the page jumped to the top. During prerender (no browser) it starts null (the un-located
 * state that ships in the static HTML).
 */
export const userLocation = writable<Place | null>(browser ? (fromUrl() ?? fromStorage()) : null);

function fromUrl(): Place | null {
	const u = new URLSearchParams(location.search);
	const lat = parseFloat(u.get('lat') ?? ''),
		lon = parseFloat(u.get('lon') ?? '');
	if (Number.isFinite(lat) && Number.isFinite(lon)) {
		return { lat, lon, name: u.get('name') };
	}
	return null;
}

function fromStorage(): Place | null {
	try {
		const s = localStorage.getItem(KEY);
		if (s) {
			const p = JSON.parse(s);
			if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) {
				return { lat: p.lat, lon: p.lon, name: p.name ?? null };
			}
		}
	} catch {
		/* ignore */
	}
	return null;
}

export function setLocation(loc: Place) {
	const clean: Place = { lat: +loc.lat, lon: +loc.lon, name: loc.name ?? null };
	userLocation.set(clean);
	persist(clean);
}

export function clearLocation() {
	userLocation.set(null);
	persist(null);
}

function persist(loc: Place | null) {
	if (!browser) return;
	try {
		if (loc) localStorage.setItem(KEY, JSON.stringify(loc));
		else localStorage.removeItem(KEY);
	} catch {
		/* ignore */
	}
	const u = new URL(location.href);
	if (loc) {
		u.searchParams.set('lat', loc.lat.toFixed(4));
		u.searchParams.set('lon', loc.lon.toFixed(4));
		if (loc.name) u.searchParams.set('name', loc.name);
		else u.searchParams.delete('name');
	} else {
		u.searchParams.delete('lat');
		u.searchParams.delete('lon');
		u.searchParams.delete('name');
	}
	history.replaceState(history.state, '', u);
}
