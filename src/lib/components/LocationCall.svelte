<!-- A4 — the location call-to-action shown before a location is chosen. Just the prompt; the actual picker
     lives in the shared LocationDialog, opened via onchoose (and reused by the "change" button later). -->
<script lang="ts">
	import { t } from '$lib/i18n';

	let { onchoose }: { onchoose: () => void } = $props();
</script>

<section class="block">
	<div class="cta">
		<div class="glyph" aria-hidden="true">🌘</div>
		<h2>{$t('a4.cta_title')}</h2>
		<p>{$t('a4.cta_sub')}</p>
		<button class="btn-cta" onclick={onchoose}>📍 {$t('a4.choose')}</button>
	</div>
</section>

<style>
	.cta {
		margin-bottom: var(--space-xl);
		text-align: center;
		padding: 26px 22px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background:
			radial-gradient(120% 90% at 50% -10%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%),
			var(--surface);

		.glyph {
			font-size: 2rem;
			line-height: 1;
		}
		h2 {
			font-size: 1.3rem;
			font-weight: 800;
			text-wrap: balance;
			margin: 10px 0 6px;
		}
		p {
			color: var(--muted);
			max-width: 36ch;
			margin: 0 auto 18px;
		}
		/* The button itself is .btn-cta (base.css) — shared with B0's "change location", because they are
		   the same act at two moments. */
	}
</style>
