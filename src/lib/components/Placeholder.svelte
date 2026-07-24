<script lang="ts">
	let { title, note, tag = '' }: { title: string; note: string; tag?: string } = $props();
</script>

<section class="block ph">
	<div class="block-head">
		<h2>{title}</h2>
		{#if tag}<span class="eyebrow">{tag}</span>{/if}
	</div>
	<p class="note">{note}</p>
</section>

<style>
	.ph {
		opacity: 0.72;
	}
	.note {
		color: var(--muted);
		font-size: 0.9rem;
	}
</style>
