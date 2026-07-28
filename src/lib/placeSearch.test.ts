import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { get } from 'svelte/store';
import { createPlaceSearch, SEARCH_DEBOUNCE_MS, type SearchState } from './placeSearch';
import type { GeoHit } from './geocode';

const hit = (label: string): GeoHit => ({ lat: 43.36, lon: -5.84, label, sub: 'Asturias' });

/** A search double whose responses are resolved by hand, so races can be staged deterministically. */
function deferredSearch() {
	const calls: { query: string; locale: string; limit: number; signal?: AbortSignal }[] = [];
	const pending: { resolve: (h: GeoHit[]) => void; reject: (e: unknown) => void }[] = [];
	const search = (query: string, locale = 'de', limit = 6, signal?: AbortSignal) => {
		calls.push({ query, locale, limit, signal });
		return new Promise<GeoHit[]>((resolve, reject) => pending.push({ resolve, reject }));
	};
	return { search, calls, pending };
}

/** Let the microtask queue drain so an awaited response is applied to the store. */
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => vi.useRealTimers());

describe('idle', () => {
	it('starts idle', () => {
		const { state } = createPlaceSearch({ search: deferredSearch().search });
		expect(get(state)).toEqual({ status: 'idle' });
	});

	it.each(['', ' ', 'a', '  b  '])('stays idle and issues no request for %o', async (query) => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery(query, 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
		expect(get(s.state)).toEqual({ status: 'idle' });
		expect(fake.calls).toHaveLength(0);
	});

	it('returns to idle when the query is cleared', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		fake.pending[0].resolve([hit('Oviedo')]);
		await settle();
		expect(get(s.state).status).toBe('results');

		s.setQuery('', 'de');
		expect(get(s.state)).toEqual({ status: 'idle' });
	});
});

describe('debounce', () => {
	it('shows "searching" immediately, before the request goes out', () => {
		// The window the old implementation could not render: typed, but nothing sent yet.
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		expect(get(s.state)).toEqual({ status: 'searching' });
		expect(fake.calls).toHaveLength(0);
	});

	it('coalesces a burst of keystrokes into one request', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		for (const q of ['Ov', 'Ovi', 'Ovie', 'Ovied', 'Oviedo']) {
			s.setQuery(q, 'de');
			await vi.advanceTimersByTimeAsync(50);
		}
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.calls).toHaveLength(1);
		expect(fake.calls[0].query).toBe('Oviedo'); // the last one typed, not the first
	});

	it('sends a second request once the user pauses again', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		s.setQuery('Palma', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.calls.map((c) => c.query)).toEqual(['Oviedo', 'Palma']);
	});

	it('trims the query it sends', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('  Oviedo  ', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.calls[0].query).toBe('Oviedo');
	});

	it('passes the locale and limit through', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search, limit: 3 });
		s.setQuery('Oviedo', 'es');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.calls[0]).toMatchObject({ locale: 'es', limit: 3 });
	});
});

describe('outcomes', () => {
	const run = async (result: GeoHit[] | Error) => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		if (result instanceof Error) fake.pending[0].reject(result);
		else fake.pending[0].resolve(result);
		await settle();
		return get(s.state);
	};

	it('reports hits', async () => {
		expect(await run([hit('Oviedo'), hit('Oviedo Centro')])).toEqual({
			status: 'results',
			hits: [hit('Oviedo'), hit('Oviedo Centro')]
		});
	});

	it('reports empty — the state the old code could never reach', async () => {
		// The list used to be rendered only when there were results, so "nothing found" was dead code and
		// a search that matched nothing showed the user silence.
		expect(await run([])).toEqual({ status: 'empty' });
	});

	it('reports an error when the service fails', async () => {
		expect(await run(new Error('geocode 500'))).toEqual({ status: 'error' });
	});
});

describe('superseded requests', () => {
	it('ignores a response that lands after the query changed', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });

		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		s.setQuery('Palma', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		// The first response arrives last — the classic out-of-order case.
		fake.pending[0].resolve([hit('Oviedo')]);
		fake.pending[1].resolve([hit('Palma')]);
		await settle();

		const state = get(s.state) as Extract<SearchState, { status: 'results' }>;
		expect(state.hits[0].label).toBe('Palma');
	});

	it('does not repopulate a cleared field when the response lands afterwards', async () => {
		// The bug this replaces: the guard advanced when a request STARTED, so clearing the box left the
		// in-flight response still considered current — and the results reappeared under the empty input.
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });

		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.pending).toHaveLength(1); // request is in flight

		s.setQuery('', 'de'); // user clears the box
		fake.pending[0].resolve([hit('Oviedo')]); // and only then does it answer
		await settle();

		expect(get(s.state)).toEqual({ status: 'idle' });
	});

	it('does not surface an error from a request the user has moved on from', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		s.setQuery('', 'de');
		fake.pending[0].reject(new Error('geocode 500'));
		await settle();
		expect(get(s.state)).toEqual({ status: 'idle' });
	});

	it('aborts the in-flight request rather than just ignoring it', async () => {
		// Ignoring a stale response still pays for it; aborting frees the connection.
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.calls[0].signal?.aborted).toBe(false);

		s.setQuery('Palma', 'de');
		expect(fake.calls[0].signal?.aborted).toBe(true);
	});

	it('reports a timed-out request as an error, not as superseded', async () => {
		// geocode.ts aborts stalled requests with a TimeoutError after its deadline. Unlike an AbortError
		// (us superseding ourselves), a timeout is a real service failure the user must hear about.
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		const timeout = new Error('signal timed out');
		timeout.name = 'TimeoutError';
		fake.pending[0].reject(timeout);
		await settle();
		expect(get(s.state).status).toBe('error');
	});

	it('treats an AbortError as nothing to report', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		const abort = new Error('aborted');
		abort.name = 'AbortError';
		fake.pending[0].reject(abort);
		await settle();
		// still searching from the user's point of view; nothing has superseded it
		expect(get(s.state).status).toBe('searching');
	});

	it('never fires a request for a query the user has already replaced', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS / 2); // still inside the debounce
		s.setQuery('Palma', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		expect(fake.calls.map((c) => c.query)).toEqual(['Palma']);
	});
});

describe('reset', () => {
	it('returns to idle and drops a pending request', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);

		s.reset();
		expect(get(s.state)).toEqual({ status: 'idle' });
		expect(fake.calls[0].signal?.aborted).toBe(true);

		fake.pending[0].resolve([hit('Oviedo')]);
		await settle();
		expect(get(s.state)).toEqual({ status: 'idle' }); // and stays there
	});

	it('cancels a debounce that has not fired yet', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		s.setQuery('Oviedo', 'de');
		s.reset();
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS * 2);
		expect(fake.calls).toHaveLength(0);
	});

	it('is safe to call from idle', () => {
		const s = createPlaceSearch({ search: deferredSearch().search });
		expect(() => s.reset()).not.toThrow();
		expect(get(s.state)).toEqual({ status: 'idle' });
	});
});

describe('store contract', () => {
	it('notifies subscribers on every transition', async () => {
		const fake = deferredSearch();
		const s = createPlaceSearch({ search: fake.search });
		const seen: string[] = [];
		const unsub = s.state.subscribe((v) => seen.push(v.status));

		s.setQuery('Oviedo', 'de');
		await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS);
		fake.pending[0].resolve([]);
		await settle();
		unsub();

		expect(seen).toEqual(['idle', 'searching', 'empty']);
	});
});
