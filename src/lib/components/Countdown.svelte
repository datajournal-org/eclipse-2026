<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { greatestEclipse } from '$lib/eclipse';

	// Target = instant of greatest eclipse (peak), computed once from astronomy-engine.
	const target = new Date(greatestEclipse().date).getTime();

	let now = $state(target); // SSR-safe placeholder; real time set on mount
	onMount(() => {
		now = Date.now();
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const diff = $derived(target - now);
	const phase = $derived(diff > 0 ? 'before' : diff > -3 * 3600 * 1000 ? 'now' : 'past');
	const parts = $derived.by(() => {
		const s = Math.max(0, Math.floor(diff / 1000));
		return {
			d: Math.floor(s / 86400),
			h: Math.floor((s % 86400) / 3600),
			m: Math.floor((s % 3600) / 60),
			s: s % 60
		};
	});
	const pad = (n: number) => String(n).padStart(2, '0');
</script>

<section class="block cd">
	{#if phase === 'before'}
		<div class="units" aria-live="off">
			<div class="u">
				<span class="n tnum">{parts.d}</span><span class="l">{$t('countdown.d')}</span>
			</div>
			<div class="u">
				<span class="n tnum">{pad(parts.h)}</span><span class="l">{$t('countdown.h')}</span>
			</div>
			<div class="u">
				<span class="n tnum">{pad(parts.m)}</span><span class="l">{$t('countdown.m')}</span>
			</div>
			<div class="u">
				<span class="n tnum">{pad(parts.s)}</span><span class="l">{$t('countdown.s')}</span>
			</div>
		</div>
		<p class="cap">{$t('countdown.to_totality')}</p>
	{:else if phase === 'now'}
		<p class="head">{$t('countdown.happening')}</p>
	{:else}
		<p class="head">{$t('countdown.past')}</p>
	{/if}
	<p class="since">{$t('countdown.since')}</p>
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
	}
	.n {
		font-size: clamp(1.8rem, 8vw, 2.6rem);
		font-weight: 800;
		line-height: 1;
		color: var(--accent);
	}
	.l {
		font-size: 0.7rem;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--muted);
		margin-top: 6px;
	}
	.cap {
		margin-top: 12px;
		font-weight: 600;
	}
	.head {
		font-size: 1.4rem;
		font-weight: 800;
		color: var(--accent);
	}
	.since {
		margin-top: 6px;
		color: var(--muted);
		font-size: 0.92rem;
	}
</style>
