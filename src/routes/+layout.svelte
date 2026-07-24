<script>
  // Open Props engineering scales (tokens.css maps these into our semantic roles).
  import 'open-props/sizes';
  import 'open-props/fonts';
  import 'open-props/easings';
  import '../app.css';
  import { onMount } from 'svelte';
  import { initLocale } from '$lib/i18n';
  import { initLocation } from '$lib/stores/location';
  import Header from '$lib/components/Header.svelte';

  let { children } = $props();

  onMount(() => {
    initLocale();
    initLocation();
  });
</script>

<div class="app">
  <Header />
  {@render children()}
</div>
