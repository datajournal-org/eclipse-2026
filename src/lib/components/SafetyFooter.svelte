<script lang="ts">
	import { t } from '$lib/i18n';
</script>

<footer class="safety">
	<div class="inner">
		<span class="icon" aria-hidden="true">⚠</span>
		<span>{$t('safety')}</span>
	</div>
</footer>

<style>
	.safety {
		/* full-bleed accent bar; the text stays in the centred content column */
		border-top: 1px solid color-mix(in oklab, var(--warn) 40%, var(--border));
		background: color-mix(in oklab, var(--warn) 9%, transparent);
		margin-top: 8px;

		& .inner {
			display: flex;
			align-items: flex-start;
			gap: 10px;
			max-width: var(--maxw);
			margin: 0 auto;
			padding: 14px var(--edge);
			font-size: 0.88rem;
			font-weight: 600;
		}
		& .icon {
			color: var(--warn);
			font-size: 1.1rem;
			line-height: 1.4;
		}
	}
</style>
