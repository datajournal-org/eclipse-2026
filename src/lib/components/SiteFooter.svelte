<!-- Colophon: where the code lives, and where the words on this page live. The translation link is
     locale-aware, so a reader who spots a clumsy sentence lands on the file that contains it rather than
     on a repository root they then have to search.

     Deliberately NOT a second <footer> element: SafetyFooter already contributes one, and two of them map
     to two `contentinfo` landmarks, which is exactly the ambiguity landmarks exist to avoid. Two utility
     links also do not warrant a <nav> of their own — reading order reaches them fine. -->
<script lang="ts">
	import { t, locale } from '$lib/i18n';
	import { REPO_URL, translationFileUrl } from '$lib/config';
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve --
     Both links leave the site entirely (absolute github.com URLs from config.ts), so `resolve` and the
     `base` path do not apply. The rule cannot tell that through the constant and the helper. -->
<div class="colophon">
	<div class="inner">
		<a href={REPO_URL}>{$t('footer.source')}</a>
		<span class="sep" aria-hidden="true">·</span>
		<!-- The file for the language currently being read, not a fixed one. -->
		<a href={translationFileUrl($locale)}>{$t('footer.translation')}</a>
	</div>
</div>

<style>
	.colophon {
		/* Quieter than the safety bar above it: this is provenance, not a warning. */
		font-size: 0.82rem;
		color: var(--muted);

		.inner {
			display: flex;
			flex-wrap: wrap; /* on a narrow phone the two links stack rather than overflow */
			align-items: baseline;
			gap: 8px;
			max-width: var(--maxw);
			margin: 0 auto;
			padding: 14px var(--edge) 28px;
		}
		a {
			color: inherit;
			text-decoration: underline;
			text-underline-offset: 2px;

			&:hover {
				color: var(--fg);
			}
		}
		.sep {
			opacity: 0.6;
		}
	}
</style>
