<!-- The location picker as a modal dialog (bottom sheet on mobile): the "map as stage" layout — a unified
     search field + GPS control overlaid on the map, the totality corridor drawn on it, a draggable pin, and
     a sticky confirm bar with a live eclipse verdict. Opened by the CTA and by "change"; non-destructive
     (nothing is committed until "use this location"). -->
<script lang="ts">
	import { get } from 'svelte/store';
	import { t, locale } from '$lib/i18n';
	import { userLocation, setLocation } from '$lib/stores/location';
	import { localCircumstances } from '$lib/eclipse';
	import { searchPlaces, reverseGeocode, type GeoHit } from '$lib/geocode';
	import LocationPicker from './LocationPicker.svelte';

	let { open = $bindable(false) }: { open?: boolean } = $props();

	let dlgEl: HTMLDialogElement;
	let sheetEl: HTMLDivElement;
	let opened = $state(false); // mount the (heavy) map lazily on first open

	type Pending = { lat: number; lon: number; name: string | null };
	let pending = $state<Pending | null>(null);

	// A welcoming default over land inside the totality corridor (northern Spain) — the pin lands on a
	// recognisable place with a "Totalität" verdict, inviting the user to search / GPS / drag from there.
	function defaultPoint(): { lat: number; lon: number } {
		return { lat: 43.0, lon: -4.5 };
	}

	// ---- open / close plumbing (native <dialog>) ----
	$effect(() => {
		if (!dlgEl) return;
		if (open) {
			if (!dlgEl.open) dlgEl.showModal();
			opened = true;
			// (re)initialise from the committed location, else a point in the totality corridor
			const loc = get(userLocation);
			const start = loc ?? defaultPoint();
			setPending(start.lat, start.lon, loc?.name ?? null);
			query = '';
			results = [];
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
	function setPending(lat: number, lon: number, name: string | null) {
		pending = { lat, lon, name };
		const seq = ++revSeq;
		reverseGeocode(lat, lon, get(locale)).then((n) => {
			if (seq === revSeq && pending && n) pending = { ...pending, name: n };
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
	let results = $state<GeoHit[]>([]);
	let searching = $state(false);
	let searchErr = $state(false);
	let searchTimer: ReturnType<typeof setTimeout> | undefined;
	let searchSeq = 0;

	function onSearchInput() {
		clearTimeout(searchTimer);
		searchErr = false;
		if (query.trim().length < 2) {
			results = [];
			searching = false;
			return;
		}
		searching = true;
		const q = query;
		searchTimer = setTimeout(async () => {
			const seq = ++searchSeq;
			try {
				const hits = await searchPlaces(q, get(locale));
				if (seq === searchSeq) {
					results = hits;
					searching = false;
				}
			} catch {
				if (seq === searchSeq) {
					results = [];
					searching = false;
					searchErr = true;
				}
			}
		}, 300);
	}
	function pick(h: GeoHit) {
		results = [];
		const name = h.sub ? `${h.label}, ${h.sub}` : h.label;
		query = name;
		setPending(h.lat, h.lon, name);
	}

	// ---- device location ----
	let geoBusy = $state(false);
	function useGeo() {
		if (!navigator.geolocation) {
			searchErr = true;
			return;
		}
		geoBusy = true;
		results = [];
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				geoBusy = false;
				setPending(pos.coords.latitude, pos.coords.longitude, null);
			},
			() => {
				geoBusy = false;
				searchErr = true;
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
			<button class="icon-btn" onclick={() => (open = false)} aria-label={$t('a4.close')}>✕</button>
		</div>

		<div class="stage">
			{#if opened && pending}
				<LocationPicker lat={pending.lat} lon={pending.lon} onmove={onPinMove} />
			{/if}

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
				<button class="gps" onclick={useGeo} disabled={geoBusy} title={$t('a4.geo')} aria-label={$t('a4.geo')}
					>⌖</button
				>
			</div>

			{#if searching || searchErr || results.length}
				<ul class="results">
					{#if searching}
						<li class="hint">{$t('a4.searching')}</li>
					{:else if searchErr}
						<li class="hint">{$t('a4.geo_error')}</li>
					{:else if !results.length}
						<li class="hint">{$t('a4.no_results')}</li>
					{:else}
						{#each results as h (h.lat + ',' + h.lon)}
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

		<p class="adjust">{$t('a4.adjust_hint')}</p>
		<footer class="foot">
			<div class="summary">
				<span class="place">📍 {pending?.name ?? '…'}</span>
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
	}
	.picker-dlg[open] {
		display: grid;
		place-items: center;
	}
	.picker-dlg::backdrop {
		background: rgba(4, 6, 10, 0.62);
		backdrop-filter: blur(3px);
	}

	.sheet {
		display: flex;
		flex-direction: column;
		width: min(460px, 94vw);
		height: min(660px, 88vh);
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		overflow: hidden;
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
	}
	.picker-dlg[open] .sheet {
		animation: pop 0.18s ease-out;
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
		padding: 13px 14px 11px;
		border-bottom: 1px solid var(--border);
	}
	.head h2 {
		font-size: 1.05rem;
		margin: 0;
	}
	.icon-btn {
		margin-left: auto;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2, var(--surface));
		color: var(--text);
		cursor: pointer;
	}

	/* map is the stage; search + results overlay its top */
	.stage {
		position: relative;
		flex: 1;
		min-height: 0;
		background: var(--bg);
	}
	.searchbar {
		position: absolute;
		z-index: 2;
		top: 10px;
		left: 10px;
		right: 10px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 3px 5px 3px 10px;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}
	.searchbar .s-ico {
		color: var(--muted);
		font-size: 0.9rem;
	}
	.searchbar input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		color: var(--text);
		font: inherit;
		padding: 0.45rem 0.2rem;
		outline: none;
	}
	.gps {
		display: grid;
		place-items: center;
		width: 34px;
		height: 34px;
		border-radius: 8px;
		border: 1px solid var(--border);
		background: var(--bg-2, var(--surface));
		color: var(--accent);
		cursor: pointer;
		font-size: 1.05rem;

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		&:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	}

	.results {
		position: absolute;
		z-index: 2;
		top: 56px;
		left: 10px;
		right: 10px;
		margin: 0;
		padding: 5px;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
		max-height: 62%;
		overflow-y: auto;

		& .hint {
			padding: 9px 10px;
			color: var(--muted);
			font-size: 0.88rem;
		}
		& li button {
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
			& .ico {
				color: var(--accent);
			}
			& .txt {
				display: flex;
				flex-direction: column;
				gap: 1px;
				min-width: 0;
			}
			& .lbl {
				font-weight: 600;
			}
			& .sub {
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
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 8px 12px;
		padding: 10px 14px 14px;
		border-top: 1px solid var(--border);
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 4px 10px;
		min-width: 0;
	}
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
	.use {
		font: inherit;
		font-weight: 700;
		white-space: nowrap;
		cursor: pointer;
		padding: 0.6rem 1rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--accent);
		background: var(--accent);
		color: #1a1206;

		&:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
	}

	/* mobile → bottom sheet */
	@media (max-width: 560px) {
		.picker-dlg[open] {
			place-items: end stretch;
		}
		.sheet {
			width: 100%;
			height: 92dvh;
			border-radius: 18px 18px 0 0;
			border-bottom: 0;
		}
		.picker-dlg[open] .sheet {
			animation: sheetUp 0.24s ease-out;
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
