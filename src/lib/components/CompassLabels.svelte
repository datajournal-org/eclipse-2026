<!-- B3 compass labels: the eight cardinal points, glued just above the true horizon. The WebGL ruler
     (compassLayer.ts) projects their screen positions each rendered frame; the parent forwards them here
     via place(), same contract as SkyLoupe. DOM rather than WebGL text: crisp, styleable, and localized
     through the normal message files (German east is O, Spanish west is O). Purely decorative for
     assistive tech — the azimuth readout chip carries the same information as text. -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { CARDINAL_KEYS } from '$lib/skyview/compass';

	let els: (HTMLSpanElement | undefined)[] = $state(Array(CARDINAL_KEYS.length).fill(undefined));

	// Called by the parent every render frame with each label's on-screen position (null = off-screen or
	// behind the camera). Imperative DOM, like the Sun locator: these move every frame the camera does,
	// and routing that through reactive state would re-render the component per frame for nothing.
	export function place(screens: ([number, number] | null)[]) {
		screens.forEach((screen, i) => {
			const el = els[i];
			if (!el) return;
			el.classList.toggle('hidden', !screen);
			if (screen) el.style.transform = `translate(${screen[0]}px, ${screen[1]}px) translate(-50%, -50%)`;
		});
	}
</script>

<div class="b3-compass" aria-hidden="true">
	{#each CARDINAL_KEYS as key, i (key)}
		<span class="hidden" bind:this={els[i]}>{$t(`b3.compass.${key}`)}</span>
	{/each}
</div>

<style>
	.b3-compass {
		position: absolute;
		inset: 0;
		overflow: hidden; /* labels sliding off the edge must not widen the page */
		pointer-events: none;

		span {
			position: absolute;
			top: 0;
			left: 0;
			font-size: 0.7rem;
			font-weight: 600;
			letter-spacing: 0.08em;
			color: rgba(255, 255, 255, 0.85);
			text-shadow: 0 1px 3px rgba(0, 0, 0, 0.55); /* readable on the bright day sky AND in totality */
			&.hidden {
				display: none;
			}
		}
	}
</style>
