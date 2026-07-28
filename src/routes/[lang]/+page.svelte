<script lang="ts">
	import { userLocation, placeLabel } from '$lib/stores/location';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { eclipseVisible } from '$lib/eclipse';
	import { t } from '$lib/i18n';
	import Countdown from '$lib/components/Countdown.svelte';
	import ShadowRun from '$lib/components/ShadowRun.svelte';
	import LocationCall from '$lib/components/LocationCall.svelte';
	import LocationDialog from '$lib/components/LocationDialog.svelte';
	import TimeZoneNote from '$lib/components/TimeZoneNote.svelte';
	import SectionDivider from '$lib/components/SectionDivider.svelte';
	import Verdict from '$lib/components/Verdict.svelte';
	import SkyView from '$lib/components/SkyView.svelte';
	import Checklist from '$lib/components/Checklist.svelte';
	import Donate from '$lib/components/Donate.svelte';
	import SafetyFooter from '$lib/components/SafetyFooter.svelte';
	import SiteFooter from '$lib/components/SiteFooter.svelte';

	let pickerOpen = $state(false);
</script>

<main class="content">
	<!-- A — always visible (event overview) -->
	<Countdown />
	<ShadowRun />
	<TimeZoneNote />

	{#if $userLocation}
		<!-- B — the personal briefing, opened by a clear section break -->
		<SectionDivider label={$t('b.your_sky')} />
		<div class="place block">
			<div class="pname">📍 {placeLabel($userLocation)}</div>
			<button onclick={() => (pickerOpen = true)}>{$t('b.change')}</button>
		</div>
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

		<SectionDivider label={$t('b.prep')} />
		<Checklist />
	{:else}
		<LocationCall onchoose={() => (pickerOpen = true)} />
	{/if}

	<Donate />
</main>

<LocationDialog bind:open={pickerOpen} />
<SafetyFooter />
<SiteFooter />

<style>
	.place {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;

		.pname {
			font-size: 1.15rem;
			font-weight: 700;
			margin-top: 2px;
		}
	}
</style>
