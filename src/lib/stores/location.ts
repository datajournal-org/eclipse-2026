// User location — stays on the device. Persisted ONLY in localStorage, and only when the reader actually
// chose it; the app never WRITES it to the URL, so copying/sharing the current link can't leak the
// user's address. GET params (?lat=&lon=&name=) are still READ once at load as a debug override, but are
// never written back.
//
// When there is neither, the app falls back to a place GUESSED from the browser's time zone (or, where
// that cannot see the eclipse, to a fixed showcase place). That guess is derived from `Intl` alone — no
// network request, no permission prompt — and is never persisted, because storage means "the reader told
// us this". See $lib/geoguess.
import { writable } from 'svelte/store';
import { browser } from '$app/environment';
import { guessPlace } from '$lib/geoguess';
import type { Place } from '$lib/place';

const KEY = 'eclipse.location';

export type { Place, PlaceSource } from '$lib/place';
export { placeLabel } from '$lib/place';

/**
 * On the client the value is read SYNCHRONOUSLY (URL debug override, then localStorage, then the time-zone
 * guess) at module load, so the very first client render already shows a located "B" state. Deferring this
 * to onMount flipped the layout a tick after hydration, which grew the page after the browser had already
 * restored the scroll position on a reload — so the page jumped to the top. `Intl` is synchronous too, so
 * the guess costs nothing extra here.
 *
 * During prerender (no browser) it stays null — the un-located state that ships in the static HTML. That
 * is deliberate: it keeps the prerendered pages free of a B3 shell and a place nobody chose, and leaves
 * LocationCall as the honest fallback for readers without JavaScript.
 */
export const userLocation = writable<Place | null>(browser ? (fromUrl() ?? fromStorage() ?? guessPlace()) : null);

// Debug override only: lets you deep-link a location (?lat=&lon=&name=) for testing. Not written back, so
// normal use never puts a location in the URL. It counts as `user`: it stands in for a real choice, and
// anything else would put a provenance line under every spec's fixture.
function fromUrl(): Place | null {
	const u = new URLSearchParams(location.search);
	const lat = parseFloat(u.get('lat') ?? ''),
		lon = parseFloat(u.get('lon') ?? '');
	if (Number.isFinite(lat) && Number.isFinite(lon)) {
		return { lat, lon, name: u.get('name'), source: 'user' };
	}
	return null;
}

// Anything in storage is `user` by construction — the guess is never written, so a stored record can only
// have come from a choice. The `source` field is deliberately NOT read back from the blob: a stale or
// hand-edited one claiming 'guess' would otherwise produce a persisted guess, which is the one state this
// module exists to prevent.
function fromStorage(): Place | null {
	try {
		const s = localStorage.getItem(KEY);
		if (s) {
			const p = JSON.parse(s);
			if (Number.isFinite(p?.lat) && Number.isFinite(p?.lon)) {
				return { lat: p.lat, lon: p.lon, name: p.name ?? null, source: 'user' };
			}
		}
	} catch {
		/* ignore */
	}
	return null;
}

export function setLocation(loc: Omit<Place, 'source'>) {
	const clean: Place = { lat: +loc.lat, lon: +loc.lon, name: loc.name ?? null, source: 'user' };
	userLocation.set(clean);
	persist(clean);
}

/** Forget the chosen place and fall back to the guess — there is no un-located state to return to. */
export function clearLocation() {
	persist(null);
	userLocation.set(guessPlace());
}

// Persist to localStorage only — deliberately never touches the URL (see file header). The stored shape
// stays {lat, lon, name}: `source` is always 'user' on the way back in, so writing it would add a field
// that can only ever be wrong.
function persist(loc: Place | null) {
	if (!browser) return;
	try {
		if (loc) localStorage.setItem(KEY, JSON.stringify({ lat: loc.lat, lon: loc.lon, name: loc.name }));
		else localStorage.removeItem(KEY);
	} catch {
		/* ignore */
	}
}
