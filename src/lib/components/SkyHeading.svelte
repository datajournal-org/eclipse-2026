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
		<!-- Title and place are two lines, not one sentence. The geocoder's names are as long as it likes
		     — "Friedliche Revolution, Berlin, Deutschland" — and inside the heading they turned a title
		     into a paragraph set at 2.2rem. The heading is now a constant, and the place sits under it at
		     a size that can absorb a long name.

		     `.place > .pname` is kept from the old verdict eyebrow: it is the selector the location specs
		     read the current place from, and they match on substring. -->
		<h2 class="title">{$t('b.sim_title')}</h2>
		<p class="place"><span class="pname"><span aria-hidden="true">📍</span> {placeLabel($userLocation)}</span></p>
		<button class="change btn-cta" onclick={onchange}>{$t('b.change')}</button>
		<!-- A place the reader never chose has to say so, right where it is named. Not `.sub`: the segment
		     grammar caps intros at one element and one rendered line, and this is provenance, not an intro. -->
		{#if $userLocation.source !== 'user'}
			<p class="provenance">{$t($userLocation.source === 'guess' ? 'b.guessed' : 'b.showcase')}</p>
		{/if}
	{/if}
</section>

<style>
	.b0 {
		text-align: center;
	}
	.title {
		/* Deliberately larger than a normal section h2: this is the line that has to be read first. */
		font-size: clamp(1.5rem, 4.2vw, 2.2rem);
		font-weight: 800;
		text-wrap: balance;
		line-height: 1.15;
		margin-bottom: var(--space-2xs);
	}
	.place {
		margin: 0 auto var(--space-sm);
		max-width: 30ch;
		font-size: 1.05rem;
		font-weight: 600;
		line-height: 1.35;
		text-wrap: balance;
		/* Geocoder names can be a single very long token (a street or an institution). Without this one
		   of them widens the section past the viewport instead of wrapping. */
		overflow-wrap: anywhere;
	}
	.provenance {
		margin: var(--space-sm) auto 0;
		max-width: 44ch;
		color: var(--muted);
		font-size: 0.9rem;
		text-wrap: balance;
	}
</style>
