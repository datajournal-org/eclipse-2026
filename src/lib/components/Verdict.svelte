<!-- B1 — Verdict card: the headline answer for the chosen location (kind, obscuration, max time,
     eye-safety verdict). All from the shared localEclipse store; times in the browser timezone. -->
<script lang="ts">
	import { t, fmt } from '$lib/i18n';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { userLocation } from '$lib/stores/location';
	import { nextEclipseHere } from '$lib/eclipse';

	const lc = $derived($localEclipse);
	const peak = $derived(lc?.peak ?? null);
	const kind = $derived(String(lc?.kind ?? ''));
	const pct = $derived(lc ? Math.round(lc.obscuration * 100) : 0);
	const peakAlt = $derived(peak?.alt ?? -99);
	const visible = $derived(!!lc && !!peak && peakAlt > 0 && pct > 0);
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
	<div class="block-head">
		<h2>{visible ? (isTotal ? $t('b1.total') : $t('b1.partial')) : $t('b1.not_visible')}</h2>
	</div>

	{#if lc && peak && visible}
		<p class="obsc stat">{$t('b1.obscured', { pct })}</p>
		<p class="note tnum">
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
	.obsc {
		font-size: clamp(1.6rem, 7vw, 2.2rem);
		line-height: 1.1;
		margin: 4px 0 2px;

		.b1.total & {
			color: var(--accent-2, var(--accent));
		}
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
