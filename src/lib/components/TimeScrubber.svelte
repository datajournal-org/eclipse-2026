<!-- A time slider with event markers: one draggable range over a decorative track that carries the eclipse's
     contact ticks, the totality band, a below-horizon (post-sunset) tail, and tappable phase labels. The
     native <input type=range> stays the control (drag + keyboard + a11y); everything else is decoration or a
     jump shortcut. Data comes from skyview/timeAxis.ts. -->
<script lang="ts">
	import type { Tick, TimeBand } from '$lib/skyview/timeAxis';

	let {
		value,
		max,
		ariaLabel,
		ticks,
		band = null,
		sunsetFrac = null,
		sunsetNote = null,
		onscrub
	}: {
		value: number;
		max: number;
		ariaLabel: string;
		ticks: Tick[];
		band?: TimeBand | null;
		sunsetFrac?: number | null;
		sunsetNote?: string | null;
		onscrub: (i: number) => void;
	} = $props();

	const pct = (f: number) => `${f * 100}%`;
</script>

<div class="axis">
	<div class="track" aria-hidden="true">
		<span class="fill" style:width={pct(max ? value / max : 0)}></span>
		{#if sunsetFrac !== null}
			<span class="dusk" style:left={pct(sunsetFrac)}></span>
		{/if}
		{#if band}
			<span class="band" style:left={pct(band.from)} style:width={pct(band.to - band.from)}></span>
			<span class="peak" style:left={pct(band.peak)}></span>
		{/if}
		{#each ticks as tk (tk.label)}
			<span class="tick {tk.kind}" style:left={pct(tk.frac)}></span>
		{/each}
		{#if sunsetFrac !== null}
			<span class="sun" style:left={pct(sunsetFrac)}></span>
		{/if}
	</div>

	<input
		type="range"
		min="0"
		{max}
		step="1"
		{value}
		oninput={(e) => onscrub(+e.currentTarget.value)}
		aria-label={ariaLabel}
	/>

	{#if band || ticks.length}
		<div class="labels">
			{#if band}
				<button
					class="lab"
					data-align="center"
					style:left={pct((band.from + band.to) / 2)}
					onclick={() => onscrub(band.frame)}
					aria-label={band.label}
				>
					<span class="name">{band.label}</span>
				</button>
			{/if}
			{#each ticks as tk (tk.label)}
				<button
					class="lab"
					data-align={tk.align}
					style:left={pct(tk.frac)}
					onclick={() => onscrub(tk.frame)}
					aria-label={`${tk.label} · ${tk.sub}`}
				>
					<span class="name">{tk.label}</span>
					<span class="sub tnum">{tk.sub}</span>
				</button>
			{/each}
		</div>
	{/if}

	{#if sunsetNote}
		<p class="sunset-note tnum">☾ {sunsetNote}</p>
	{/if}
</div>

<style>
	.axis {
		position: relative;
		margin-top: 10px;
	}

	/* decorative track, vertically centred under the range thumb (input is 22px tall) */
	.track {
		position: absolute;
		left: 0;
		right: 0;
		top: 11px;
		height: 6px;
		transform: translateY(-50%);
		border-radius: 3px;
		background: var(--border);
		pointer-events: none;
	}
	.fill {
		position: absolute;
		top: 0;
		bottom: 0;
		left: 0;
		border-radius: 3px 0 0 3px;
		background: color-mix(in oklab, var(--accent) 30%, transparent);
	}
	/* below-horizon tail: from sunset to the end of the window */
	.dusk {
		position: absolute;
		top: 0;
		bottom: 0;
		right: 0;
		background: var(--muted);
		opacity: 0.4;
	}
	/* totality window (thin sliver → keep a minimum visible width) */
	.band {
		position: absolute;
		top: -1px;
		bottom: -1px;
		min-width: 4px;
		border-radius: 2px;
		background: var(--accent-2, var(--accent));
	}
	.peak {
		position: absolute;
		top: 50%;
		width: 8px;
		height: 8px;
		transform: translate(-50%, -50%) rotate(45deg);
		background: var(--bg);
		border: 2px solid var(--accent-2, var(--accent));
	}
	.tick {
		position: absolute;
		top: 50%;
		width: 2px;
		height: 12px;
		transform: translate(-50%, -50%);
		border-radius: 1px;
		background: var(--accent);
	}
	/* hollow circle for sunset */
	.sun {
		position: absolute;
		top: 50%;
		width: 9px;
		height: 9px;
		transform: translate(-50%, -50%);
		border-radius: 50%;
		background: var(--bg);
		border: 2px solid var(--muted);
	}

	/* the control: transparent track (decoration shows through), a visible accent thumb */
	input[type='range'] {
		position: relative;
		z-index: 1;
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 22px;
		margin: 0;
		background: transparent;
		cursor: pointer;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 22px;
		background: transparent;
	}
	input[type='range']::-moz-range-track {
		height: 22px;
		background: transparent;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 12px;
		height: 20px;
		border-radius: 3px;
		background: var(--accent);
		border: 2px solid var(--bg);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
	input[type='range']::-moz-range-thumb {
		box-sizing: border-box;
		width: 12px;
		height: 20px;
		border-radius: 3px;
		background: var(--accent);
		border: 2px solid var(--bg);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
	input[type='range']:focus-visible {
		outline: none;
	}
	input[type='range']:focus-visible::-webkit-slider-thumb {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}
	input[type='range']:focus-visible::-moz-range-thumb {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	/* phase labels under their ticks — tap to jump; edge labels align inward so they don't clip */
	.labels {
		position: relative;
		height: 2.6em;
		margin-top: 6px;
		font-size: 0.8rem;
	}
	.lab {
		position: absolute;
		top: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 0;
		border: 0;
		background: none;
		color: var(--fg);
		line-height: 1.15;
		white-space: nowrap;
		cursor: pointer;
	}
	.lab[data-align='start'] {
		align-items: flex-start;
		transform: translateX(0);
	}
	.lab[data-align='center'] {
		align-items: center;
		transform: translateX(-50%);
	}
	.lab[data-align='end'] {
		align-items: flex-end;
		transform: translateX(-100%);
	}
	.lab .name {
		font-weight: 600;
	}
	.lab .sub {
		color: var(--muted);
		font-size: 0.72rem;
	}
	.lab:hover .name,
	.lab:focus-visible .name {
		color: var(--accent);
	}

	.sunset-note {
		margin: 2px 0 0;
		text-align: right;
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>
