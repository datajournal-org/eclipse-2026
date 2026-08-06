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
	{#if $userLocation}
		<!-- B FIRST. The personal simulation is what this app has that a corridor map does not, and it used
		     to sit roughly four screens down — past a full-height globe, behind a button, behind a dialog.
		     Almost nobody got there. Now the page opens on it.

		     B0 and B1 lead rather than B3 itself, deliberately: both are instant text, so the first paint
		     says "Sonnenfinsternis-Simulation für Berlin · 85 % der Sonne bedeckt" while B3's WebGL scene
		     builds just below the fold. Opening ON the canvas would mean opening on "Gelände wird geladen …".

		     Its opening is a heading, not a divider: what a visitor has to notice is not that a section
		     starts but that everything below is computed for a place they can change, so B0 says which
		     place and offers the change in the same breath. -->
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
		<!-- Only reachable during prerender and without JavaScript: on the client the location store falls
		     back to a time-zone guess, so `$userLocation` is never null there. See LocationCall's header. -->
		<LocationCall onchoose={() => (pickerOpen = true)} />
	{/if}

	<!-- A — the world stage, now the SECOND movement: the countdown and the shadow crossing the Earth are
	     the event in general, which is context for the reader's own sky rather than the way in to it. The
	     divider marks the handover; without it the giant countdown digits read as a non-sequitur under a
	     sky view. TimeZoneNote rides along as A2's segment footer, where it has always been. -->
	<SectionDivider label={$t('event_overview')} />
	<Countdown />
	<ShadowRun />

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
