<script lang="ts">
	import { t } from '$lib/i18n';
	import { greatestEclipse } from '$lib/eclipse';
	import { now, splitDuration, pad2 } from '$lib/stores/now';

	// Target = instant of greatest eclipse (peak), computed once from astronomy-engine.
	const target = new Date(greatestEclipse().date).getTime();

	// $now is 0 until the client clock starts → fall back to `target` so SSR / first paint shows zeros
	// rather than a bogus multi-thousand-day countdown.
	const diff = $derived(target - ($now || target));
	const phase = $derived(diff > 0 ? 'before' : diff > -3 * 3600 * 1000 ? 'now' : 'past');
	const parts = $derived(splitDuration(diff));
</script>

<section class="block cd">
	{#if phase === 'before'}
		<div class="units" aria-live="off">
			<div class="u">
				<span class="n tnum stat">{parts.d}</span><span class="l">{$t('countdown.d')}</span>
			</div>
			<div class="u">
				<span class="n tnum stat">{pad2(parts.h)}</span><span class="l">{$t('countdown.h')}</span>
			</div>
			<div class="u">
				<span class="n tnum stat">{pad2(parts.m)}</span><span class="l">{$t('countdown.m')}</span>
			</div>
			<div class="u">
				<span class="n tnum stat">{pad2(parts.s)}</span><span class="l">{$t('countdown.s')}</span>
			</div>
		</div>
		<p class="cap">{$t('countdown.to_totality')}</p>
	{:else if phase === 'now'}
		<p class="head stat">{$t('countdown.happening')}</p>
	{:else}
		<p class="head stat">{$t('countdown.past')}</p>
	{/if}
	<p class="since note">{$t('countdown.since')}</p>
</section>

<style>
	.cd {
		text-align: center;
	}
	.units {
		display: flex;
		justify-content: center;
		gap: 10px;
	}
	.u {
		display: flex;
		flex-direction: column;
		align-items: center;
		min-width: 62px;
		background: var(--surface);
		border-radius: var(--radius-sm);
		padding: 10px 6px;

		.n {
			font-size: clamp(1.8rem, 8vw, 2.6rem);
			line-height: 1;
		}
		.l {
			font-size: 0.7rem;
			letter-spacing: 0.1em;
			text-transform: uppercase;
			color: var(--muted);
			margin-top: 6px;
		}
	}
	.cap {
		margin-top: 12px;
		font-weight: 600;
	}
	.head {
		font-size: 1.4rem;
	}
	.since {
		margin-top: 6px;
	}
</style>
