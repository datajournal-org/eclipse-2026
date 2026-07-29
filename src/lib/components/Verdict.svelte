<!-- B1 — Verdict card: the headline answer for the chosen location (kind, obscuration, max time,
     eye-safety verdict). All from the shared localEclipse store; times in the browser timezone. -->
<script lang="ts">
	import { t, fmt } from '$lib/i18n';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { userLocation, placeLabel } from '$lib/stores/location';
	import { eclipseVisible, nextEclipseHere } from '$lib/eclipse';

	// The verdict header carries the place it is about (and the way to change it) — segment grammar's
	// header-meta slot, like A2's date eyebrow, instead of a floating row above the section.
	let { onchange }: { onchange?: () => void } = $props();

	const lc = $derived($localEclipse);
	const peak = $derived(lc?.peak ?? null);
	const kind = $derived(String(lc?.kind ?? ''));
	const pct = $derived(lc ? Math.round(lc.obscuration * 100) : 0);
	const peakAlt = $derived(peak?.alt ?? -99);
	// The shared predicate (eclipse.ts): the same answer decides whether the page shows B3 at all.
	const visible = $derived(eclipseVisible(lc));
	const isTotal = $derived(kind === 'total' && visible);

	// Two different reasons the card can say "not visible from here", and they need different answers:
	// the 2026 eclipse never reaches this place (localCircumstances is null), or it does but the Sun is
	// below the horizon at maximum. Only the first is a dead end worth redirecting.
	const missed = $derived(!!$userLocation && !lc);

	// For a visitor the 2026 event misses, the useful answer is which eclipse they *can* see from home.
	const next = $derived.by(() => {
		if (!missed || !$userLocation) return null;
		const n = nextEclipseHere($userLocation.lat, $userLocation.lon);
		const nextPct = n ? Math.round(n.obscuration * 100) : 0;
		// astronomy-engine reports eclipses all the way down to a 0 % graze and to peaks below the
		// horizon; neither is something anyone could actually watch, so say nothing rather than tease.
		if (!n?.peak || n.peak.alt <= 0 || nextPct < 1) return null;
		return { time: n.peak.time, kind: n.kind, pct: nextPct };
	});
</script>

<section class="block b1" class:total={isTotal}>
	{#if $userLocation}
		<div class="place">
			<span class="pname"
				>📍 {placeLabel($userLocation)}
				{#if onchange}<button class="change" onclick={onchange}>{$t('b.change')}</button>{/if}</span
			>
		</div>
	{/if}

	{#if lc && peak && visible}
		<!-- Kind and coverage as ONE centered headline — the section's h2 (segment grammar) sits in the
		     content here rather than in a .block-head, with the place line above it as the eyebrow. -->
		<h2 class="headline stat">
			{isTotal ? $t('b1.total') : $t('b1.partial')}:<br />{$t('b1.obscured', { pct })}
		</h2>
		<p class="when note tnum">
			{$t('b1.max_at', { time: $fmt.time(peak.time) })} ·
			{peakAlt > 0 ? $t('b1.sun_alt', { alt: Math.round(peakAlt) }) : $t('b1.sun_below')}
		</p>
		<p class="safety">
			{#if isTotal && lc.totalBegin && lc.totalEnd}
				{$t('b1.safe_total', { from: $fmt.time(lc.totalBegin.time), to: $fmt.time(lc.totalEnd.time) })}
			{:else}
				{$t('b1.safe_partial')}
			{/if}
		</p>
	{:else}
		<!-- The verdict is a verdict here too: the headline must say "not visible", not fall silent. -->
		<h2 class="headline">{$t('b1.not_visible')}</h2>
		<p class="note">{missed ? $t('b1.not_reached') : $t('b1.not_visible_note')}</p>
		{#if next}
			<p class="next note tnum">
				{$t('b1.next_here', {
					date: $fmt.date(next.time),
					kind: $t(`b1.kind_${next.kind}`),
					pct: next.pct
				})}
			</p>
		{/if}
	{/if}
</section>

<style>
	.place {
		text-align: center;

		.pname {
			font-size: 0.9rem;
			font-weight: 600;
			color: var(--muted);
		}
		.change {
			font: inherit;
			font-size: 0.82rem;
			padding: 0;
			border: 0;
			background: none;
			color: var(--accent);
			cursor: pointer;
			text-decoration: underline;
			text-underline-offset: 2px;
		}
	}
	.headline {
		margin-top: var(--space-lg);
		text-align: center;
	}
	.when {
		margin-bottom: var(--space-lg);
		text-align: center;
	}
	.next {
		margin-block-start: 0.5rem;
	}
	.safety {
		margin-top: 12px;
		padding: 10px 12px;
		border-radius: var(--radius-sm);
		background: var(--surface);
		border-left: 3px solid var(--accent);
		font-size: 0.9rem;

		.b1.total & {
			border-left-color: var(--accent-2, var(--accent));
		}
	}
</style>
