<script>
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
