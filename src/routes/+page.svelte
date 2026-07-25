<script lang="ts">
	import { userLocation, clearLocation, type Place } from '$lib/stores/location';
	import { t } from '$lib/i18n';
	import Countdown from '$lib/components/Countdown.svelte';
	import ShadowRun from '$lib/components/ShadowRun.svelte';
	import LocationCall from '$lib/components/LocationCall.svelte';
	import Verdict from '$lib/components/Verdict.svelte';
	import SkyView from '$lib/components/SkyView.svelte';
	import PersonalTimeline from '$lib/components/PersonalTimeline.svelte';
	import Checklist from '$lib/components/Checklist.svelte';
	import Placeholder from '$lib/components/Placeholder.svelte';
	import SafetyFooter from '$lib/components/SafetyFooter.svelte';

	const label = (p: Place) => p.name ?? `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`;
</script>

<main class="content">
	<!-- A — always visible (event overview) -->
	<Countdown />
	<ShadowRun />
	<Placeholder title={$t('a3.title')} note={$t('a3.note')} tag="A3" />

	{#if $userLocation}
		<!-- B — appended once a location is chosen -->
		<div class="place block">
			<div class="place-id">
				<span class="eyebrow">{$t('b.your_sky')}</span>
				<div class="pname">📍 {label($userLocation)}</div>
			</div>
			<button onclick={clearLocation}>{$t('b.change')}</button>
		</div>
		<Verdict />
		<SkyView />
		<PersonalTimeline />
		<Checklist />
	{:else}
		<LocationCall />
	{/if}
</main>

<SafetyFooter />

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
