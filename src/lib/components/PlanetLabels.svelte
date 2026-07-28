<!-- B3 planet labels: Venus, Mercury and Jupiter named in the sky, in the page's language. The star layer
     projects each labelled planet's direction to CSS pixels every rendered frame (starLayer.ts); the
     parent forwards positions and alphas here via place() — the same imperative contract as the Sun
     locator and the compass labels, so nothing re-renders reactively at frame rate. Each label fades
     with its planet's own visibility (PlacedObject.brightness): absent or washed-out planet, no label.
     Purely decorative for assistive tech — the sky is a picture; naming it aloud is the readout's job. -->
<script lang="ts">
	import { t } from '$lib/i18n';

	/** The three labelled planets, in draw order. Keys resolve via b3.planets.<key>. */
	const KEYS = ['venus', 'mercury', 'jupiter'] as const;

	/** Ceiling for the fade: even a fully visible planet keeps its label half-translucent, so the
	 * name reads as an annotation on the sky rather than an object in it. */
	const MAX_OPACITY = 0.5;

	let els: Partial<Record<(typeof KEYS)[number], HTMLSpanElement>> = $state({});

	export function place(items: { key: string; screen: [number, number] | null; alpha: number }[]) {
		for (const key of KEYS) {
			const el = els[key];
			if (!el) continue;
			const item = items.find((i) => i.key === key);
			const visible = !!item?.screen && item.alpha > 0.02;
			el.classList.toggle('hidden', !visible);
			if (visible && item.screen) {
				// anchored just below the planet's dot, so the label never covers the point it names
				el.style.transform = `translate(${item.screen[0]}px, ${item.screen[1]}px) translate(-50%, 9px)`;
				el.style.opacity = String(item.alpha * MAX_OPACITY);
			}
		}
	}
</script>

<div class="b3-planets" aria-hidden="true">
	{#each KEYS as key (key)}
		<span class="hidden" data-planet={key} bind:this={els[key]}>{$t(`b3.planets.${key}`)}</span>
	{/each}
</div>

<style>
	.b3-planets {
		position: absolute;
		inset: 0;
		overflow: hidden; /* labels sliding off the edge must not widen the page */
		pointer-events: none;

		span {
			position: absolute;
			top: 0;
			left: 0;
			font-size: 0.72rem;
			font-weight: 600;
			letter-spacing: 0.04em;
			color: rgba(255, 255, 255, 0.95);
			text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
			transition: opacity 0.25s linear; /* the fade the scrub steps through */
			&.hidden {
				display: none;
			}
		}
	}
</style>
