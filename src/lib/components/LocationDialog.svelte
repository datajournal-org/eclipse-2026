<!-- The location picker as a modal dialog (bottom sheet on mobile): the "map as stage" layout — a unified
     search field + GPS control overlaid on the map, the totality corridor drawn on it, a draggable pin, and
     a sticky confirm bar with a live eclipse verdict. Opened by the CTA and by "change"; non-destructive
     (nothing is committed until "use this location"). -->
<script lang="ts">
	import { get } from 'svelte/store';
	import { browser } from '$app/environment';
	import { t, locale } from '$lib/i18n';
	import { userLocation, setLocation, placeLabel } from '$lib/stores/location';
	import { SHOWCASE } from '$lib/geoguess';
	import { localCircumstances } from '$lib/eclipse';
	import { reverseGeocode, type GeoHit } from '$lib/geocode';
	import { createPlaceSearch } from '$lib/placeSearch';
	import LocationPicker from './LocationPicker.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let dlgEl: HTMLDialogElement;
	let sheetEl: HTMLDivElement;
	let opened = $state(false); // mount the (heavy) map lazily on first open

	type Pending = { lat: number; lon: number; name: string | null };
	let pending = $state<Pending | null>(null);

	// Only reachable where there is no location at all — i.e. without JavaScript, or before hydration has
	// run the time-zone guess. In a hydrated browser the dialog always opens on the committed or guessed
	// place. Kept as the showcase point so that edge, if it is ever hit, still lands inside totality.
	function defaultPoint(): { lat: number; lon: number } {
		return { lat: SHOWCASE.lat, lon: SHOWCASE.lon };
	}

	// ---- open / close plumbing (native <dialog>) ----
	$effect(() => {
		if (!dlgEl) return;
		if (open) {
			if (!dlgEl.open) dlgEl.showModal();
			// showModal() makes the background inert for clicks and focus, but NOT for scrolling — the
			// document behind the modal still scrolls (chained from the sheet's edges on touch), which
			// visibly shifts and re-composites the page under the dialog. Freezing the body via
			// position:fixed is the only lock every engine honours (WebKit scrolls straight past a mere
			// overflow:hidden); the negative top keeps the page visually where it was, and the cleanup
			// (close OR unmount) restores the scroll position instantly.
			const lockY = window.scrollY;
			document.documentElement.classList.add('modal-open');
			document.body.style.top = `-${lockY}px`;
			opened = true;
			// (re)initialise from the committed location, else a point in the totality corridor
			const loc = get(userLocation);
			const start = loc ?? defaultPoint();
			setPending(start.lat, start.lon, loc?.name ?? null);
			query = '';
			geoErr = false;
			placeSearch.reset();
			// declared inside the open branch, so it can restore the scroll position it captured
			return () => {
				document.documentElement.classList.remove('modal-open');
				document.body.style.top = '';
				window.scrollTo({ top: lockY, behavior: 'instant' });
			};
		} else if (dlgEl.open) {
			dlgEl.close();
		}
	});
	function backdropClose(e: MouseEvent) {
		const r = sheetEl.getBoundingClientRect();
		if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) open = false;
	}

	// ---- pending pin: reverse-geocode its name + preview the eclipse verdict ----
	let revSeq = 0;
	// Whether a name lookup is in flight for the CURRENT pin. Split from `pending.name` deliberately:
	// name === null means two different things — "still resolving" (show …) and "the service failed"
	// (show the coordinates, which are the real content anyway). One nullable field cannot say both.
	let nameResolving = $state(false);
	function setPending(lat: number, lon: number, name: string | null) {
		pending = { lat, lon, name };
		nameResolving = true;
		const seq = ++revSeq;
		reverseGeocode(lat, lon, get(locale)).then((n) => {
			if (seq !== revSeq) return;
			nameResolving = false;
			if (pending && n) pending = { ...pending, name: n };
			// The user may have confirmed before the name arrived — the committed location then carries
			// name: null and the page shows raw coordinates. If the answer is for exactly that point,
			// upgrade the committed location in place (same coordinates → SkyView's key won't rebuild).
			// Only a place the reader actually CHOSE may be upgraded this way: setLocation persists, and a
			// guessed place must never reach storage on the strength of the dialog merely having opened.
			const committed = get(userLocation);
			if (
				n &&
				committed?.source === 'user' &&
				committed.name === null &&
				committed.lat === lat &&
				committed.lon === lon
			) {
				setLocation({ lat, lon, name: n });
			}
		});
	}
	function onPinMove(lat: number, lon: number) {
		setPending(lat, lon, null);
	}

	const preview = $derived.by(() => {
		if (!pending) return null;
		const lc = localCircumstances(pending.lat, pending.lon);
		const pct = lc ? Math.round(lc.obscuration * 100) : 0;
		const alt = lc?.peak?.alt ?? -1;
		const visible = pct > 0 && alt > 0;
		return { visible, isTotal: lc?.kind === 'total' && visible, pct };
	});

	// ---- city/address search (debounced) ----
	let query = $state('');
	// The search owns its own debounce, cancellation and outcome states — see $lib/placeSearch.
	const placeSearch = createPlaceSearch();
	const searchState = placeSearch.state;
	// Deliberately NOT part of the search state: a device-location failure has nothing to do with the
	// geocoder, and folding it into the search error is what made both hard to reason about.
	let geoErr = $state(false);

	function onSearchInput() {
		geoErr = false;
		placeSearch.setQuery(query, get(locale));
	}
	function pick(h: GeoHit) {
		placeSearch.reset();
		const name = h.sub ? `${h.label}, ${h.sub}` : h.label;
		query = name;
		setPending(h.lat, h.lon, name);
	}

	// ---- device location ----
	// API support is knowable synchronously, so an unsupported browser gets no button at all rather than
	// a dead-end click (geolocation is [SecureContext]: it is absent on insecure mirrors and in some
	// locked-down webviews). Permission denial and timeouts are only discoverable on click — those stay
	// as the error path below. `browser`-guarded so prerendering (no `navigator`) does not crash; the
	// dialog only opens after hydration anyway.
	const geoSupported = browser && 'geolocation' in navigator;
	let geoBusy = $state(false);
	function useGeo() {
		if (!navigator.geolocation) {
			geoErr = true; // belt and braces — unreachable while the chip is gated on geoSupported
			return;
		}
		geoBusy = true;
		placeSearch.reset();
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				geoBusy = false;
				setPending(pos.coords.latitude, pos.coords.longitude, null);
			},
			() => {
				geoBusy = false;
				geoErr = true;
			},
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
		);
	}

	function confirm() {
		if (pending) {
			setLocation(pending);
			open = false;
		}
	}
</script>

<dialog
	class="picker-dlg"
	bind:this={dlgEl}
	onclose={() => (open = false)}
	onmousedown={backdropClose}
	aria-label={$t('a4.choose')}
>
	<div class="sheet" bind:this={sheetEl}>
		<div class="head">
			<h2>{$t('a4.choose')}</h2>
			<button class="icon-btn" onclick={() => (open = false)} aria-label={$t('a4.close')}>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
					stroke-linecap="round"
					aria-hidden="true"
				>
					<path d="M6 6l12 12M18 6L6 18" />
				</svg>
			</button>
		</div>

		<div class="stage">
			{#if opened && pending}
				<LocationPicker lat={pending.lat} lon={pending.lon} onmove={onPinMove} />
			{/if}

			<div class="search-overlay">
				<div class="searchbar">
					<span class="s-ico" aria-hidden="true">🔍</span>
					<input
						type="search"
						bind:value={query}
						oninput={onSearchInput}
						placeholder={$t('a4.search')}
						aria-label={$t('a4.search')}
						autocomplete="off"
					/>
				</div>

				<!-- The "fast path": a labelled chip rather than an icon in the search bar. The crosshair glyph
				     alone is map-app vocabulary; the visible sentence is what tells a general reader that NOT
				     typing is an option. While the device is locating, the label says so. Not rendered at all
				     where the API does not exist — search and map remain the two working paths. -->
				{#if geoSupported}
					<button class="geo-chip" onclick={useGeo} disabled={geoBusy}>
						<svg
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2"
							stroke-linecap="round"
							aria-hidden="true"
						>
							<circle cx="12" cy="12" r="6" />
							<path d="M12 1v4M12 19v4M1 12h4M19 12h4" />
						</svg>
						{geoBusy ? $t('a4.geo_busy') : $t('a4.geo')}
					</button>
				{/if}

				{#if geoErr || $searchState.status !== 'idle'}
					<ul class="results">
						{#if geoErr}
							<li class="hint">{$t('a4.geo_error')}</li>
						{:else if $searchState.status === 'searching'}
							<li class="hint">{$t('a4.searching')}</li>
						{:else if $searchState.status === 'error'}
							<li class="hint">{$t('a4.search_error')}</li>
						{:else if $searchState.status === 'empty'}
							<li class="hint">{$t('a4.no_results')}</li>
						{:else if $searchState.status === 'results'}
							{#each $searchState.hits as h (h.lat + ',' + h.lon)}
								<li>
									<button type="button" onclick={() => pick(h)}>
										<span class="ico" aria-hidden="true">📍</span>
										<span class="txt">
											<span class="lbl">{h.label}</span>
											{#if h.sub}<span class="sub">{h.sub}</span>{/if}
										</span>
									</button>
								</li>
							{/each}
						{/if}
					</ul>
				{/if}
			</div>
		</div>

		<p class="adjust">{$t('a4.adjust_hint')}</p>
		<footer class="foot">
			<div class="summary">
				<!-- "…" only while a name is actually being resolved; once the lookup fails or times out,
				     the coordinates are the honest label (and what would be committed). -->
				<span class="place">📍 {pending ? (pending.name ?? (nameResolving ? '…' : placeLabel(pending))) : '…'}</span
				>
				{#if preview}
					{#if !preview.visible}
						<span class="verdict none">{$t('a4.verdict_none')}</span>
					{:else}
						<span class="verdict" class:total={preview.isTotal}>
							◐ {preview.pct}&thinsp;% ·
							{preview.isTotal ? $t('a4.verdict_total') : $t('a4.verdict_partial')}
						</span>
					{/if}
				{/if}
			</div>
			<button class="use" onclick={confirm} disabled={!pending}>{$t('a4.use_here')} →</button>
		</footer>
	</div>
</dialog>

<style>
	/* full-viewport dialog so clicks outside the sheet hit the backdrop; content is the .sheet card.
	   Layout only when [open] — otherwise the UA `dialog:not([open]){display:none}` must win, or the closed
	   dialog would cover the page and swallow clicks. */
	.picker-dlg {
		width: 100vw;
		height: 100dvh;
		max-width: none;
		max-height: none;
		margin: 0;
		padding: 0;
		border: 0;
		background: transparent;

		&::backdrop {
			background: color-mix(in oklab, var(--bg) 60%, transparent);
			backdrop-filter: blur(8px);
		}
		&[open] {
			display: grid;
			place-items: center;

			.sheet {
				animation: pop 0.18s ease-out;
			}
		}
	}

	.sheet {
		display: flex;
		flex-direction: column;
		overscroll-behavior: contain; /* results list & map gestures must not chain into the page */
		width: min(460px, 94vw);
		height: min(660px, 88vh);
		background: var(--bg);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	@keyframes pop {
		from {
			transform: translateY(8px) scale(0.98);
			opacity: 0;
		}
	}

	.head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 14px;
		border-bottom: 1px solid var(--border);

		h2 {
			font-size: 1.05rem;
			margin: 0;
		}
	}
	.icon-btn {
		display: grid;
		place-items: center;
		margin-left: auto;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: var(--text);
		padding: 0;
		line-height: 1;
		cursor: pointer;

		svg {
			width: 16px;
			height: 16px;
		}
	}

	/* map is the stage; search + results overlay its top */
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		background: var(--bg);
	}
	/* search + fast-path chip + results, stacked over the map's top edge. The container itself must not
	   swallow map gestures in the empty space between its children, hence the pointer-events split. */
	.search-overlay {
		position: absolute;
		z-index: 2;
		top: 10px;
		left: 10px;
		right: 10px;
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		pointer-events: none;

		> * {
			pointer-events: auto;
		}
	}
	.searchbar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 5px 3px 10px;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

		.s-ico {
			color: var(--muted);
			font-size: 0.9rem;
		}
		input {
			flex: 1;
			min-width: 0;
			border: 0;
			background: none;
			color: var(--text);
			font: inherit;
			padding: 0.45rem 0.2rem;
			outline: none;
		}
	}
	.geo-chip {
		align-self: flex-start; /* a chip, not a bar — it should read as one tappable phrase */
		display: flex;
		align-items: center;
		gap: 7px;
		padding: 0.5rem 0.9rem;
		border-radius: 999px;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--bg);
		font: inherit;
		font-size: 0.88rem;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);

		svg {
			width: 16px;
			height: 16px;
			flex: none;
		}

		&:disabled {
			opacity: 0.7; /* still readable: while disabled it is SAYING something ("locating …") */
			cursor: progress;
		}
		&:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	}

	.results {
		margin: 0;
		padding: 5px;
		list-style: none;
		background: var(--bg-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
		/* below the chip in the column, so a device-location error never covers the button to retry it */
		max-height: min(310px, 46dvh);
		overflow-y: auto;

		.hint {
			padding: 9px 10px;
			color: var(--muted);
			font-size: 0.88rem;
		}
		li button {
			display: flex;
			align-items: center;
			gap: 9px;
			width: 100%;
			text-align: left;
			padding: 9px 10px;
			border: 0;
			border-radius: 8px;
			background: none;
			color: var(--text);
			cursor: pointer;
			font: inherit;

			&:hover,
			&:focus-visible {
				background: color-mix(in oklab, var(--accent) 16%, transparent);
				outline: none;
			}
			.ico {
				color: var(--accent);
			}
			.txt {
				display: flex;
				flex-direction: column;
				gap: 1px;
				min-width: 0;
			}
			.lbl {
				font-weight: 600;
			}
			.sub {
				font-size: 0.8rem;
				color: var(--muted);
			}
		}
	}

	.adjust {
		margin: 0;
		padding: 6px 12px 0;
		font-size: 0.78rem;
		color: var(--muted);
		text-align: center;
	}
	.foot {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 10px;
		padding: 10px 14px 14px;
		border-top: 1px solid var(--border);

		.summary {
			display: flex;
			flex-wrap: wrap;
			align-items: baseline;
			justify-content: center;
			gap: 4px 10px;
			text-align: center;

			.place {
				font-weight: 600;
			}
			.verdict {
				white-space: nowrap;
				font-size: 0.9rem;
				font-variant-numeric: tabular-nums;
				color: var(--accent);

				&.total {
					color: var(--accent-2, var(--accent));
					font-weight: 700;
				}
				&.none {
					color: var(--muted);
				}
			}
		}
		.use {
			font: inherit;
			font-weight: 700;
			white-space: nowrap;
			cursor: pointer;
			padding: 0.6rem 1rem;
			border-radius: var(--radius-sm);
			border: 1px solid var(--accent);
			background: var(--accent);
			color: var(--bg);

			&:disabled {
				opacity: 0.5;
				cursor: not-allowed;
			}
		}
	}

	/* mobile → fullscreen modal. This was a 92dvh bottom sheet, which real phones defeated: browser
	   toolbars and the on-screen keyboard shifted the sheet until the confirm button hung below the
	   viewport, with nothing to scroll. Covering the whole viewport removes the failure mode — every
	   control is inside by construction, and the flexing stage absorbs all height changes. */
	@media (max-width: 560px) {
		.picker-dlg[open] {
			place-items: stretch;

			.sheet {
				animation: sheetUp 0.24s ease-out;
			}
		}
		.sheet {
			width: 100%;
			height: 100dvh;
			border-radius: 0;
			border: 0;
		}
		.foot {
			/* viewport-fit=cover pulls content under the iOS home indicator — keep the button above it */
			padding-bottom: max(14px, env(safe-area-inset-bottom));
		}
		@keyframes sheetUp {
			from {
				transform: translateY(100%);
			}
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.picker-dlg[open] .sheet {
			animation: none;
		}
	}
</style>
