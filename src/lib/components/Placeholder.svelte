<script>
  /** @type {{ title: string, note: string, tag?: string }} */
  let { title, note, tag = '' } = $props();
</script>

<section class="block ph">
  <div class="block-head">
    <h2>{title}</h2>
    {#if tag}<span class="eyebrow">{tag}</span>{/if}
  </div>
  <p class="note">{note}</p>
</section>

<style>
  .ph { border-style: dashed; opacity: 0.85; }
  .note { color: var(--muted); font-size: 0.9rem; }
</style>
