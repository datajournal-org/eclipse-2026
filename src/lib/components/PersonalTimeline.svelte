<!-- B2 — Personal timeline: the ordered contact times for the chosen location (first contact → totality →
     maximum → last contact → sunset). Times in the browser timezone; steps whose Sun sits below the
     horizon are dimmed. All from the shared localEclipse store. -->
<script lang="ts">
	import { t, fmt } from '$lib/i18n';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { userLocation } from '$lib/stores/location';
	import { sunset } from '$lib/eclipse';

	type Step = { key: string; time: Date; alt: number | null; total: boolean };

	const lc = $derived($localEclipse);
	const loc = $derived($userLocation);
	const ss = $derived(loc ? sunset(loc.lat, loc.lon) : null);

	const steps = $derived.by<Step[]>(() => {
		if (!lc) return [];
		const out: Step[] = [];
		const add = (p: { time: Date; alt: number } | null, key: string, total = false) => {
			if (p) out.push({ key, time: p.time, alt: p.alt, total });
		};
		add(lc.partialBegin, 'first_contact');
		add(lc.totalBegin, 'total_begin', true);
		add(lc.peak, 'maximum', lc.kind === 'total');
		add(lc.totalEnd, 'total_end', true);
		add(lc.partialEnd, 'last_contact');
		if (ss) out.push({ key: 'sunset', time: ss, alt: 0, total: false });
		return out.sort((a, b) => a.time.getTime() - b.time.getTime());
	});
</script>

{#if steps.length}
	<section class="block b2">
		<div class="block-head">
			<h2>{$t('b2.title')}</h2>
			<span class="eyebrow">B2</span>
		</div>

		<ol class="timeline">
			{#each steps as s (s.key)}
				<li class="step" class:below={s.alt !== null && s.alt < 0} class:total={s.total}>
					<time class="clock tnum">{$fmt.time(s.time)}</time>
					<span class="dot" aria-hidden="true"></span>
					<span class="label">{$t(`b2.${s.key}`)}</span>
					<span class="alt tnum">
						{#if s.alt !== null && s.alt < 0}
							{$t('b2.below_horizon')}
						{:else if s.key !== 'sunset'}
							{Math.round(s.alt ?? 0)}°
						{/if}
					</span>
				</li>
			{/each}
		</ol>

		<p class="tz">{$t('b2.tz_note')}</p>
	</section>
{/if}

<style>
	.timeline {
		display: flex;
		gap: 0;
		overflow-x: auto;
		padding: 8px 0 4px;
		margin: 0;
		list-style: none;
		scrollbar-width: none;
	}
	.timeline::-webkit-scrollbar {
		display: none;
	}
	.step {
		flex: 1 0 auto;
		min-width: 84px;
		display: grid;
		grid-template-rows: auto 16px auto auto;
		align-items: center;
		justify-items: center;
		text-align: center;
		gap: 4px;
		position: relative;
	}
	.clock {
		font-weight: 700;
		font-size: 0.95rem;
	}
	/* the connecting rail lives on the dot row */
	.dot {
		width: 12px;
		height: 12px;
		border-radius: 50%;
		background: var(--accent);
		box-shadow: 0 0 0 3px var(--bg);
		z-index: 1;
	}
	.step.total .dot {
		background: var(--accent-2, var(--accent));
	}
	.step::before {
		content: '';
		position: absolute;
		top: calc(0.95rem + 4px + 8px); /* centre of the 16px dot row */
		left: 0;
		right: 0;
		height: 2px;
		background: var(--border, rgba(128, 128, 128, 0.35));
		z-index: 0;
	}
	.step:first-child::before {
		left: 50%;
	}
	.step:last-child::before {
		right: 50%;
	}
	.label {
		font-size: 0.82rem;
		line-height: 1.2;
		color: var(--fg);
	}
	.alt {
		font-size: 0.75rem;
		color: var(--muted);
	}
	.step.below {
		opacity: 0.4;
	}
	.tz {
		margin-top: 12px;
		font-size: 0.8rem;
		color: var(--muted);
	}
</style>
