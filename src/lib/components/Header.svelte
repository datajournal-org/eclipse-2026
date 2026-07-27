<script lang="ts">
	import { resolve } from '$app/paths';
	import { t, locale, LOCALES, LOCALE_NAMES } from '$lib/i18n';

	// Switching language is navigation now, not state: each language is its own prerendered URL. The
	// links carry no query string — prerendered markup may not depend on one — which costs nothing real:
	// ?lat=&lon= is a debug override, and the reader's actual location lives in localStorage and survives
	// the navigation either way.
	//
	// The trailing slash is appended by hand: `resolve` applies `base` but knows nothing about the
	// `trailingSlash` page option, and a link to /de would not match the /de/ canonical.
</script>

<header class="hdr">
	<div class="brand">
		<span class="mark" aria-hidden="true">☀︎</span>
		<span class="name">{$t('app.title')}</span>
	</div>
	<div class="langs" role="group" aria-label={$t('nav.language')}>
		{#each LOCALES as l (l)}
			<a
				class:active={$locale === l}
				aria-current={$locale === l ? 'true' : undefined}
				href={`${resolve('/[lang]', { lang: l })}/`}
				hreflang={l}
				title={LOCALE_NAMES[l]}>{l.toUpperCase()}</a
			>
		{/each}
	</div>
</header>

<style>
	.hdr {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		margin-bottom: 4px;
		background: color-mix(in oklab, var(--bg) 82%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.mark {
		color: var(--accent);
		font-size: 1.15rem;
	}
	.langs {
		display: flex;
		gap: 4px;

		a {
			padding: 4px 8px;
			font-size: 0.78rem;
			font-weight: 600;
			border-radius: 8px;
			color: var(--muted);
			text-decoration: none;

			&.active {
				color: var(--bg);
				background: var(--accent);
				border-color: var(--accent);
			}
		}
	}
</style>
