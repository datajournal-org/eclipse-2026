<!-- A time slider with event markers: one draggable range over a decorative track that carries the eclipse's
     contact ticks, the totality band, a below-horizon (post-sunset) tail, and tappable phase labels. The
     native <input type=range> stays the control (drag + keyboard + a11y); everything else is decoration or a
     jump shortcut. Data comes from skyview/timeAxis.ts. -->
<script lang="ts">
	import type { Tick, TimeBand } from '$lib/components/timeScrubber';

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
	// single-line labels (grid ticks, no second line) → a shorter label strip
	const compact = $derived(!band && ticks.every((t) => !t.sub));

	let input: HTMLInputElement;
	/** Thumb diameter — must match the ::-webkit-slider-thumb / ::-moz-range-thumb width below. */
	const THUMB = 24;

	/**
	 * The frame a finger at `clientX` points at, in the input's own geometry: the thumb CENTRE only
	 * travels between `THUMB/2` and `width - THUMB/2`, so the usable track is narrower than the element
	 * and the ends stay reachable.
	 */
	function frameAt(clientX: number) {
		const r = input.getBoundingClientRect();
		const usable = r.width - THUMB;
		if (usable <= 0 || max <= 0) return 0;
		const f = Math.min(1, Math.max(0, (clientX - r.left - THUMB / 2) / usable));
		return Math.round(f * max);
	}

	/**
	 * The touch we are scrubbing with, by identifier, or null between gestures. A slider tracks ONE
	 * finger: whichever landed first stays in charge until it lifts, so a second finger arriving
	 * mid-drag cannot yank the time somewhere else.
	 */
	let touchId: number | null = null;
	/** Last frame handed to `onscrub` — dedupes the move stream, which fires far denser than frames. */
	let sent = -1;

	function scrubTo(clientX: number) {
		const frame = frameAt(clientX);
		if (frame === sent) return;
		sent = frame;
		onscrub(frame);
	}

	/** The tracked finger inside a TouchList, or null if it is not in this event. */
	function tracked(list: TouchList) {
		for (let i = 0; i < list.length; i++) if (list[i].identifier === touchId) return list[i];
		return null;
	}

	/**
	 * Take the gesture on touchDOWN — the whole track answers the moment it is touched, rather than a
	 * beat later when the tap completes.
	 *
	 * This also means the native control never gets to own the drag: it only starts tracking a touch
	 * that lands ON the thumb, so a finger landing anywhere else would jump the thumb once and then sit
	 * still while the finger moved. Hence onTouchMove below — from here the gesture is ours.
	 */
	function onTouchStart(e: TouchEvent) {
		if (touchId !== null || e.touches.length > 1) return; // a second finger — pinching the page, not scrubbing
		const touch = e.changedTouches[0];
		if (!touch) return;
		touchId = touch.identifier;
		sent = -1; // this gesture has sent nothing yet — its first frame must go through even if unchanged
		scrubTo(touch.clientX);
	}

	/**
	 * Follow the finger. No preventDefault needed (and none possible — Svelte registers touch handlers
	 * passive): `touch-action: pan-y` on the input already tells the browser that horizontal gestures
	 * here are ours. A vertical swipe still scrolls the page, and the browser then sends touchcancel,
	 * which ends the scrub.
	 *
	 * Touch events stay retargeted to the element the gesture STARTED on, so this keeps firing while the
	 * finger drifts off the 24 px-tall input — which is exactly what a drag along a thin slider does.
	 */
	function onTouchMove(e: TouchEvent) {
		const touch = tracked(e.changedTouches);
		if (touch) scrubTo(touch.clientX);
	}

	function onTouchEnd(e: TouchEvent) {
		if (tracked(e.changedTouches)) touchId = null;
	}
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
		bind:this={input}
		type="range"
		min="0"
		{max}
		step="1"
		{value}
		oninput={(e) => onscrub(+e.currentTarget.value)}
		ontouchstart={onTouchStart}
		ontouchmove={onTouchMove}
		ontouchend={onTouchEnd}
		ontouchcancel={onTouchEnd}
		aria-label={ariaLabel}
	/>

	{#if band || ticks.length}
		<div class="labels" class:compact>
			{#if band}
				<button
					class="lab"
					data-align="center"
					style:left={pct((band.from + band.to) / 2)}
					onclick={() => onscrub(band.frame)}
					aria-label={band.sub ? `${band.label} · ${band.sub}` : band.label}
				>
					<span class="name">{band.label}</span>
					{#if band.sub}<span class="sub tnum">{band.sub}</span>{/if}
				</button>
			{/if}
			{#each ticks as tk (tk.label)}
				<button
					class="lab {tk.kind}"
					data-align={tk.align}
					style:left={pct(tk.frac)}
					onclick={() => onscrub(tk.frame)}
					aria-label={tk.sub ? `${tk.label} · ${tk.sub}` : tk.label}
				>
					<span class="name">{tk.label}</span>
					{#if tk.sub}<span class="sub tnum">{tk.sub}</span>{/if}
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

	/* decorative track, vertically centred under the range thumb (input is 24px tall → centre at 12px).
	   Everything drawn on the track positions itself against THIS element, so this offset is the only
	   number that has to follow the input's height. */
	.track {
		position: absolute;
		left: 0;
		right: 0;
		top: 12px;
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
	/* regular time-grid ticks (A2): shorter and subtler than the eclipse event ticks */
	.tick.grid {
		width: 1px;
		height: 9px;
		background: var(--muted);
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

	/* The control: transparent track (the decoration above shows through), a round accent thumb. Input
	   height == thumb height so the thumb centres on the track with no per-browser margin tweaks.
	   24px, not the 18 it used to be, for two reasons: at 18 the thumb read as a dot rather than
	   something you grab, and 24 is WCAG 2.5.8's target-size minimum — which the old size only met by
	   way of the spacing exception. */
	input[type='range'] {
		position: relative;
		z-index: 1;
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 24px;
		margin: 0;
		background: transparent;
		cursor: pointer;
		/* horizontal gestures belong to the scrub handlers (no browser pan to compete with, and the
		   touchmove events keep coming); vertical ones still scroll the page past the slider. */
		touch-action: pan-y;
	}
	input[type='range']::-webkit-slider-runnable-track {
		height: 24px;
		background: transparent;
	}
	input[type='range']::-moz-range-track {
		height: 24px;
		background: transparent;
	}
	input[type='range']::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: var(--accent);
		border: 2px solid var(--bg);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
	}
	input[type='range']::-moz-range-thumb {
		box-sizing: border-box;
		width: 24px;
		height: 24px;
		border-radius: 50%;
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
	.labels.compact {
		height: 1.4em; /* single-line grid labels (A2) */
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
	.lab.grid .name {
		font-weight: 500;
		font-size: 0.72rem;
		color: var(--muted);
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
