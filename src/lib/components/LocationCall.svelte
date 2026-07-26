<script lang="ts">
	import { get } from 'svelte/store';
	import { t, locale } from '$lib/i18n';
	import { setLocation } from '$lib/stores/location';
	import { localCircumstances } from '$lib/eclipse';
	import { searchPlaces, reverseGeocode, type GeoHit } from '$lib/geocode';
	import LocationPicker from './LocationPicker.svelte';

	type Pending = { lat: number; lon: number; name: string | null };
	let pending = $state<Pending | null>(null);

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
	let busy = $state(false);
	let error = $state('');

	function useGeo() {
		error = '';
		if (!navigator.geolocation) {
			error = $t('a4.geo_error');
			return;
		}
		busy = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				busy = false;
				setPending(pos.coords.latitude, pos.coords.longitude, null);
			},
			() => {
				busy = false;
				error = $t('a4.geo_error');
			},
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
		);
	}

	// ---- pending pin: reverse-geocode its name, preview the eclipse verdict ----
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

	function confirm() {
		if (pending) setLocation(pending);
	}
</script>

<section class="block call">
	<h2>{$t('a4.title')}</h2>

	<div class="entries">
		<button class="primary" onclick={useGeo} disabled={busy}>📍 {$t('a4.geo')}</button>
		<div class="search">
			<input
				type="search"
				bind:value={query}
				oninput={onSearchInput}
				placeholder="🔍 {$t('a4.search')}"
				aria-label={$t('a4.search')}
				autocomplete="off"
			/>
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
									<span class="lbl">{h.label}</span>
									{#if h.sub}<span class="sub">{h.sub}</span>{/if}
								</button>
							</li>
						{/each}
					{/if}
				</ul>
			{/if}
		</div>
	</div>
	{#if error}<p class="err">{error}</p>{/if}

	{#if pending}
		<div class="picker-wrap">
			<LocationPicker lat={pending.lat} lon={pending.lon} onmove={onPinMove} />
			<p class="adjust">{$t('a4.adjust_hint')}</p>
			<div class="confirm">
				<div class="summary">
					<span class="place">📍 {pending.name ?? '…'}</span>
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
				<button class="use primary" onclick={confirm}>{$t('a4.use_here')} →</button>
			</div>
		</div>
	{/if}
</section>

<style>
	.call h2 {
		margin-bottom: 12px;
	}
	.entries {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.primary {
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.search {
		position: relative;
	}
	.search input {
		width: 100%;
		box-sizing: border-box;
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: var(--text);
		font: inherit;

		&:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 1px;
		}
	}
	.results {
		position: absolute;
		z-index: 5;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 4px;
		list-style: none;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		box-shadow: 0 6px 20px rgba(0, 0, 0, 0.35);
		max-height: 260px;
		overflow-y: auto;

		& .hint {
			padding: 8px 10px;
			color: var(--muted);
			font-size: 0.88rem;
		}
		& li button {
			display: flex;
			flex-direction: column;
			gap: 1px;
			width: 100%;
			text-align: left;
			padding: 8px 10px;
			border: 0;
			border-radius: calc(var(--radius-sm) - 2px);
			background: none;
			color: var(--text);
			cursor: pointer;

			&:hover,
			&:focus-visible {
				background: color-mix(in oklab, var(--accent) 16%, transparent);
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
	.err {
		margin-top: 10px;
		color: var(--warn);
		font-size: 0.85rem;
	}

	.picker-wrap {
		margin-top: 14px;
	}
	.adjust {
		margin: 8px 2px 0;
		font-size: 0.82rem;
		color: var(--muted);
	}
	.confirm {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-top: 10px;
	}
	.summary {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 6px 12px;
		min-width: 0;
	}
	.place {
		font-weight: 600;
	}
	.verdict {
		font-size: 0.9rem;
		color: var(--accent);
		white-space: nowrap;

		&.total {
			color: var(--accent-2, var(--accent));
			font-weight: 600;
		}
		&.none {
			color: var(--muted);
		}
	}
	.use {
		font-weight: 700;
		white-space: nowrap;
	}
</style>
