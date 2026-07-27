/**
 * The place-search interaction, as a state machine.
 *
 * This used to live inside LocationDialog as three booleans (`searching`, `searchErr`, `results.length`)
 * plus a debounce timer and a sequence counter, and it produced three bugs that no test could catch:
 *
 *  - the "nothing found" branch was unreachable, because the list was only rendered when there were
 *    results — so a search with no hits showed nothing at all;
 *  - the sequence counter advanced when a request *started*, not when the user's intent changed, so
 *    clearing the field could be undone by an in-flight response landing afterwards;
 *  - a geolocation failure was reported by setting the *search* error flag.
 *
 * The root cause was structural: interaction logic living in a component is only reachable from an
 * end-to-end test, and the states in question are the ones a browser test is least likely to stage. As a
 * plain factory it is ordinary unit-testable code, and the component becomes a renderer of one value.
 *
 * `status` is a discriminated union precisely so contradictory combinations cannot be represented.
 */
import { writable, type Readable } from 'svelte/store';
import { searchPlaces, MIN_QUERY_LENGTH, type GeoHit } from '$lib/geocode';

/** Long enough to coalesce typing, short enough not to feel laggy. */
export const SEARCH_DEBOUNCE_MS = 300;

export type SearchState =
	| { status: 'idle' } // nothing typed yet, or too short to be worth a request
	| { status: 'searching' }
	| { status: 'empty' } // the search ran and matched nothing
	| { status: 'error' } // the service failed
	| { status: 'results'; hits: GeoHit[] };

export type PlaceSearch = {
	state: Readable<SearchState>;
	/** Called on every keystroke; debounced and de-duplicated internally. */
	setQuery: (query: string, locale: string) => void;
	/** Abandon anything pending and return to idle — on picking a hit, or closing the dialog. */
	reset: () => void;
};

export function createPlaceSearch(opts?: {
	search?: typeof searchPlaces;
	delay?: number;
	limit?: number;
}): PlaceSearch {
	const search = opts?.search ?? searchPlaces;
	const delay = opts?.delay ?? SEARCH_DEBOUNCE_MS;
	const limit = opts?.limit ?? 6;

	const state = writable<SearchState>({ status: 'idle' });
	let timer: ReturnType<typeof setTimeout> | undefined;
	let controller: AbortController | undefined;
	/**
	 * Advanced whenever the user's intent changes — every keystroke, every reset — not when a request
	 * starts. That ordering is the whole fix: a response can only be applied if nothing has happened
	 * since it was asked for.
	 */
	let generation = 0;

	function abandonPending() {
		generation++;
		clearTimeout(timer);
		timer = undefined;
		controller?.abort();
		controller = undefined;
	}

	function setQuery(raw: string, locale: string) {
		abandonPending();
		const query = raw.trim();
		if (query.length < MIN_QUERY_LENGTH) {
			state.set({ status: 'idle' });
			return;
		}

		// Set synchronously, so the debounce window reads as "searching" rather than briefly as "nothing
		// found" — the gap the old implementation could never show at all.
		state.set({ status: 'searching' });

		const mine = generation;
		timer = setTimeout(async () => {
			controller = new AbortController();
			try {
				const hits = await search(query, locale, limit, controller.signal);
				if (mine !== generation) return;
				state.set(hits.length ? { status: 'results', hits } : { status: 'empty' });
			} catch (err) {
				// An abort is us superseding ourselves, not a failure worth showing.
				if (mine !== generation || (err as Error)?.name === 'AbortError') return;
				state.set({ status: 'error' });
			}
		}, delay);
	}

	function reset() {
		abandonPending();
		state.set({ status: 'idle' });
	}

	return { state: { subscribe: state.subscribe }, setQuery, reset };
}
