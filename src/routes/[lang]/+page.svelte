<script lang="ts">
	import { userLocation } from '$lib/stores/location';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { eclipseVisible } from '$lib/eclipse';
	import { t } from '$lib/i18n';
	import Countdown from '$lib/components/Countdown.svelte';
	import ShadowRun from '$lib/components/ShadowRun.svelte';
	import LocationCall from '$lib/components/LocationCall.svelte';
	import LocationDialog from '$lib/components/LocationDialog.svelte';
	import SectionDivider from '$lib/components/SectionDivider.svelte';
	import SkyHeading from '$lib/components/SkyHeading.svelte';
	import Verdict from '$lib/components/Verdict.svelte';
	import SkyView from '$lib/components/SkyView.svelte';
	import Checklist from '$lib/components/Checklist.svelte';
	import Donate from '$lib/components/Donate.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';

	let pickerOpen = $state(false);
</script>

<main class="content">
	<!-- A — always visible (event overview) -->
	<Countdown />
	<ShadowRun />

	{#if $userLocation}
		<!-- B — the personal briefing. Its opening is a heading, not a divider: what a visitor has to
		     notice is not that a new section starts but that everything below is computed for a place
		     they can change, so B0 says which place and offers the change in the same breath. -->
		<SkyHeading onchange={() => (pickerOpen = true)} />
		<Verdict />
		<!-- B3 only where there is something in the sky to show: at a location the eclipse misses, or where
		     the Sun is down at maximum, the verdict above already says "not visible from here" — a sky view
		     of an untouched (or set) Sun under that headline would only contradict it. Same predicate as the
		     verdict's, so the two cannot disagree.

		     SkyView builds its map, timeline and camera framing once, from the location it sees at mount —
		     and `{#if $userLocation}` stays truthy when the location merely CHANGES, so Svelte would keep
		     the old instance and B3 would go on showing the previous place's sky under the new place's
		     heading. Keying on the coordinates forces a rebuild. It costs ~1.5 s of scene setup, which is
		     the right trade for a rare, deliberate interaction; keying on the object identity instead
		     would also rebuild when the same place is re-selected. -->
		{#if eclipseVisible($localEclipse)}
			{#key `${$userLocation.lat},${$userLocation.lon}`}
				<SkyView />
			{/key}
		{/if}
	{:else}
		<LocationCall onchoose={() => (pickerOpen = true)} />
	{/if}

	<!-- B6 serves both states: personal (local maximum, azimuth, phase times) once a location is
	     chosen, generic before one is — but not for a chosen place the eclipse misses, where prep
	     advice would contradict the verdict's "not visible from here". -->
	{#if !$userLocation || $localEclipse?.peak}
		<SectionDivider label={$t('b.prep')} />
		<Checklist />
	{/if}

	<Donate />
</main>

<LocationDialog bind:open={pickerOpen} />
<SiteFooter />
