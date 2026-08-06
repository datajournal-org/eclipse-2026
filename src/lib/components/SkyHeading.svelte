<!-- B0 — the personal section's title: which place the sky below is computed for, and the way to change
     it. It replaces the "your sky" divider that used to sit here.

     A divider only names a section. The one thing a visitor has to notice on this page is that
     everything below it is a simulation of a SPECIFIC place and that the place is theirs to set — which
     a small grey eyebrow inside the verdict card (where this line used to live) never managed to say. -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { userLocation, placeLabel } from '$lib/stores/location';

	let { onchange }: { onchange: () => void } = $props();
</script>

<section class="block b0">
	{#if $userLocation}
		<!-- `.place > .pname` is kept from the old verdict eyebrow: it is the selector the location specs
		     read the current place from, and they match on substring, so the surrounding sentence is free
		     to change without touching them. -->
		<h2 class="place"><span class="pname">{$t('b.sim_for', { place: placeLabel($userLocation) })}</span></h2>
		<button class="change btn-cta" onclick={onchange}>
			<span aria-hidden="true">📍</span>
			{$t('b.change')}
		</button>
	{/if}
</section>

<style>
	.b0 {
		text-align: center;
	}
	.place {
		/* Deliberately larger than a normal section h2: this is the line that has to be read first. */
		font-size: clamp(1.5rem, 4.2vw, 2.2rem);
		font-weight: 800;
		text-wrap: balance;
		line-height: 1.15;
	}
	.change {
		/* No border of its own beyond .btn-cta's — segments.spec.ts allows borders on controls, not on
		   section surfaces. */
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}
</style>
