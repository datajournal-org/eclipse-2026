// User location — stays on the device. Backed by localStorage AND the URL (?lat=&lon=&name=),
// so a set location is shareable yet never sent to a server.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

const KEY = 'eclipse.location';

/** @typedef {{ lat: number, lon: number, name: string|null }} Place */

/** Start null so SSR and first client render agree; initLocation() hydrates the real value. */
export const userLocation = writable(/** @type {Place|null} */ (null));

function fromUrl() {
	const u = new URLSearchParams(location.search);
	const lat = parseFloat(u.get('lat')),
		lon = parseFloat(u.get('lon'));
	if (Number.isFinite(lat) && Number.isFinite(lon)) {
		return { lat, lon, name: u.get('name') };
	}
	return null;
}

function fromStorage() {
	try {
		const s = localStorage.getItem(KEY);
		if (s) {
			const p = JSON.parse(s);
			if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
				return { lat: p.lat, lon: p.lon, name: p.name ?? null };
		}
	} catch {
		/* ignore */
	}
	return null;
}

/** Call once on the client (root layout onMount). URL wins over storage. */
export function initLocation() {
	if (!browser) return;
	const loc = fromUrl() ?? fromStorage();
	if (loc) userLocation.set(loc);
}

export function setLocation(/** @type {Place} */ loc) {
	const clean = { lat: +loc.lat, lon: +loc.lon, name: loc.name ?? null };
	userLocation.set(clean);
	persist(clean);
}

export function clearLocation() {
	userLocation.set(null);
	persist(null);
}

function persist(/** @type {Place|null} */ loc) {
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
