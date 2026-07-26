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
		<button class="choose" onclick={onchoose}>📍 {$t('a4.choose')}</button>
	</div>
</section>

<style>
	.cta {
		text-align: center;
		padding: 26px 22px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background:
			radial-gradient(120% 90% at 50% -10%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%),
			var(--surface);
	}
	.glyph {
		font-size: 2rem;
		line-height: 1;
	}
	.cta h2 {
		font-size: 1.3rem;
		font-weight: 800;
		text-wrap: balance;
		margin: 10px 0 6px;
	}
	.cta p {
		color: var(--muted);
		max-width: 36ch;
		margin: 0 auto 18px;
	}
	.choose {
		font: inherit;
		font-size: 1.02rem;
		font-weight: 700;
		cursor: pointer;
		padding: 0.8rem 1.4rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--accent);
		background: var(--accent);
		color: #1a1206;

		&:focus-visible {
			outline: 2px solid var(--accent);
			outline-offset: 2px;
		}
	}
</style>
