<!-- Shared section break: a hairline rule that groups the page's flat block stack into legible sections.
     With a `label` it carries a centred kicker ("DEIN HIMMEL"); without one it's a plain rule. Its own
     vertical margin adds to the content gap, so a section break reads as a bigger gap than the space
     between blocks within a section (grouping by proximity). -->
<script lang="ts">
	let { label = '' }: { label?: string } = $props();
</script>

<div class="section-divider" class:has-label={!!label} role="separator" aria-label={label || undefined}>
	{#if label}
		<span class="line"></span>
		<span class="kicker">{label}</span>
		<span class="line"></span>
	{/if}
</div>

<style>
	.section-divider {
		margin-block: var(--space-xs); /* on top of the .content gap → a clear, larger section break */
		margin-inline: var(--edge); /* align the rule with the text column */

		&.has-label {
			display: flex;
			align-items: center;
			gap: 12px;
		}
		&:not(.has-label) {
			border-top: 1px solid var(--border);
		}
	}
	.line {
		flex: 1;
		block-size: 1px;
		background: var(--border);
	}
	.kicker {
		font-size: var(--text-caption);
		font-weight: 600;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--faint);
		white-space: nowrap;
	}
</style>
