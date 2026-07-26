<!-- B1 — Verdict card: the headline answer for the chosen location (kind, obscuration, max time,
     eye-safety verdict). All from the shared localEclipse store; times in the browser timezone. -->
<script lang="ts">
	import { t, fmt } from '$lib/i18n';
	import { localEclipse } from '$lib/stores/localEclipse';

	const lc = $derived($localEclipse);
	const peak = $derived(lc?.peak ?? null);
	const kind = $derived(String(lc?.kind ?? ''));
	const pct = $derived(lc ? Math.round(lc.obscuration * 100) : 0);
	const peakAlt = $derived(peak?.alt ?? -99);
	const visible = $derived(!!lc && !!peak && peakAlt > 0 && pct > 0);
	const isTotal = $derived(kind === 'total' && visible);
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
		<p class="note">{$t('b1.not_visible_note')}</p>
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
