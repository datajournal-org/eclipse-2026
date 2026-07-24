<script>
  import { userLocation, clearLocation } from '$lib/stores/location';
  import { t } from '$lib/i18n';
  import Countdown from '$lib/components/Countdown.svelte';
  import Schattenlauf from '$lib/components/Schattenlauf.svelte';
  import LocationCall from '$lib/components/LocationCall.svelte';
  import Placeholder from '$lib/components/Placeholder.svelte';
  import SafetyFooter from '$lib/components/SafetyFooter.svelte';

  const label = (p) => p.name ?? `${p.lat.toFixed(3)}°, ${p.lon.toFixed(3)}°`;
</script>

<main class="content">
  {#if $userLocation}
    <!-- Zustand B — mit Standort -->
    <div class="place block">
      <div class="place-id">
        <span class="eyebrow">{$t('b.your_sky')}</span>
        <div class="pname">📍 {label($userLocation)}</div>
      </div>
      <button onclick={clearLocation}>{$t('b.change')}</button>
    </div>
    <Placeholder title={$t('placeholder.b1')} note={$t('placeholder.b1_note')} tag="B1" />
    <Placeholder title={$t('placeholder.b3')} note={$t('placeholder.b3_note')} tag="B3" />
    <Placeholder title={$t('placeholder.b2')} note={$t('placeholder.b2_note')} tag="B2" />
    <Placeholder title={$t('placeholder.b6')} note={$t('placeholder.b6_note')} tag="B6" />
  {:else}
    <!-- Zustand A — ohne Standort -->
    <Countdown />
    <Schattenlauf />
    <Placeholder title={$t('a3.title')} note={$t('a3.note')} tag="A3" />
    <LocationCall />
  {/if}
</main>

<SafetyFooter />

<style>
  .place { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .pname { font-size: 1.15rem; font-weight: 700; margin-top: 2px; }
</style>
