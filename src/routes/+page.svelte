<script lang="ts">
	import { userLocation, type Place } from '$lib/stores/location';
	import { t } from '$lib/i18n';
	import Countdown from '$lib/components/Countdown.svelte';
	import ShadowRun from '$lib/components/ShadowRun.svelte';
	import LocationCall from '$lib/components/LocationCall.svelte';
	import LocationDialog from '$lib/components/LocationDialog.svelte';
	import Verdict from '$lib/components/Verdict.svelte';
	import SkyView from '$lib/components/SkyView.svelte';
	import Checklist from '$lib/components/Checklist.svelte';
	import SafetyFooter from '$lib/components/SafetyFooter.svelte';

	const label = (p: Place) => p.name ?? `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`;
	let pickerOpen = $state(false);
</script>

<main class="content">
	<!-- A — always visible (event overview) -->
	<Countdown />
	<ShadowRun />

	{#if $userLocation}
		<!-- B — appended once a location is chosen -->
		<div class="place block">
			<div class="place-id">
				<span class="eyebrow">{$t('b.your_sky')}</span>
				<div class="pname">📍 {label($userLocation)}</div>
			</div>
			<button onclick={() => (pickerOpen = true)}>{$t('b.change')}</button>
		</div>
		<Verdict />
		<SkyView />
		<Checklist />
	{:else}
		<LocationCall onchoose={() => (pickerOpen = true)} />
	{/if}
</main>

<LocationDialog bind:open={pickerOpen} />
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
