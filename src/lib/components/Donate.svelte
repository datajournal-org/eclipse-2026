<!-- The tip jar: a personal note and a Stripe payment link, at the very end of the content. Quieter than
     the location CTA on purpose — it is a request, not a feature — but on the same visual system (card,
     accent button). Always present, located or not. -->
<script lang="ts">
	import { t } from '$lib/i18n';
	import { DONATE_URL } from '$lib/config';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve --
     The link leaves the site entirely (absolute Stripe URL from config.ts), so `resolve` and the `base`
     path do not apply. -->
<section class="block donate">
	<div class="card">
		<div class="glyph" aria-hidden="true">☕</div>
		<p>{$t('donate.text')}</p>
		<a class="tip" href={DONATE_URL} target="_blank" rel="noopener noreferrer">
			{$t('donate.button')}
		</a>
	</div>
</section>

<style>
	.card {
		text-align: center;
		padding: 22px 22px 24px;
		border-radius: var(--radius);
		border: 1px solid var(--border);
		background: var(--surface);

		.glyph {
			font-size: 1.6rem;
			line-height: 1;
		}
		p {
			color: var(--muted);
			max-width: 48ch;
			margin: 10px auto 16px;
			text-wrap: pretty;
		}
		.tip {
			display: inline-block;
			font-weight: 700;
			text-decoration: none;
			padding: 0.65rem 1.2rem;
			border-radius: var(--radius-sm);
			border: 1px solid var(--accent);
			background: var(--accent);
			color: #1a1206;

			&:focus-visible {
				outline: 2px solid var(--accent);
				outline-offset: 2px;
			}
		}
	}
</style>
