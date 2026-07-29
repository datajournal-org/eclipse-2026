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
	const langHref = (l: string) => `${resolve('/[lang]', { lang: l })}/`;

	// The switcher is a native <details> disclosure, not a <select>: six languages no longer fit as a
	// chip row, but each entry must stay a real LINK (navigation, crawlable, works before hydration).
	// The JS below is enhancement only — close on choose, on outside click and on Escape; without it the
	// disclosure still opens and the links still navigate.
	let menu: HTMLDetailsElement | undefined = $state();
	const close = () => {
		if (menu) menu.open = false;
	};
	const onDocClick = (e: MouseEvent) => {
		if (menu?.open && !menu.contains(e.target as Node)) close();
	};
	const onKey = (e: KeyboardEvent) => {
		if (e.key === 'Escape') close();
	};
</script>

<svelte:window onclick={onDocClick} onkeydown={onKey} />

<!-- eslint-disable svelte/no-navigation-without-resolve --
     The language links go through `resolve` (see `langHref`), so `base` is applied — the rule just
     cannot see it through the helper. The brand-mark link leaves the site entirely (datajournal.org),
     so `resolve` does not apply to it either. -->
<header class="hdr">
	<div class="brand">
		<!-- The same mark as the favicon (static/favicon.svg, where its derivation is documented), but
		     without the favicon's dark tile — the header supplies the background itself. Inline so the
		     columns can take their colour from the accent token; the swoosh keeps the favicon's
		     hand-tuned lighter amber. It is datajournal.org's mark, so it links there; the SVG stays
		     decorative (aria-hidden) and the link speaks its destination through the aria-label. -->
		<a class="home" href="https://datajournal.org/" aria-label="datajournal.org">
			<svg class="mark" aria-hidden="true" viewBox="0 0 16 16" width="20" height="20">
				<g fill="var(--accent)">
					<path d="M1,9h2v3h-2Z" />
					<path d="M4,7h2v5h-2Z" />
					<path d="M7,5h2v7h-2Z" />
					<path d="M10,3h2v9h-2Z" />
					<path fill="#e8c48e" d="M11,13h-10v2h10c3,0 4,-1 4,-4v-10h-2v10c0,1.5-0.5,2-2,2Z" />
				</g>
			</svg>
		</a>
		<span class="name">{$t('app.title')}</span>
	</div>
	<!-- <details> carries the implicit `group` role, so the accessible shape ("Language" group holding
	     the links) is unchanged from the old chip row. The summary announces itself with the current
	     language, e.g. "Sprache: Deutsch". -->
	<details class="langs" bind:this={menu} aria-label={$t('nav.language')}>
		<summary aria-label={`${$t('nav.language')}: ${LOCALE_NAMES[$locale]}`}>
			{$locale.toUpperCase()}<span class="caret" aria-hidden="true">▾</span>
		</summary>
		<ul>
			{#each LOCALES as l (l)}
				<li>
					<a
						class:active={$locale === l}
						aria-current={$locale === l ? 'true' : undefined}
						href={langHref(l)}
						hreflang={l}
						lang={l}
						onclick={close}>{LOCALE_NAMES[l]}</a
					>
				</li>
			{/each}
		</ul>
	</details>
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
	.home {
		display: block;
		border-radius: 4px;

		&:hover .mark,
		&:focus-visible .mark {
			filter: brightness(1.25);
		}
	}
	.mark {
		display: block;
		width: 20px;
		height: 20px;
	}
	.langs {
		position: relative;

		summary {
			display: flex;
			align-items: center;
			gap: 5px;
			padding: 4px 10px;
			font-size: 0.78rem;
			font-weight: 600;
			border: 1px solid var(--border);
			border-radius: 8px;
			color: var(--muted);
			cursor: pointer;
			list-style: none; /* no disclosure triangle — the caret below is the affordance */
			user-select: none;

			&::-webkit-details-marker {
				display: none;
			}
			.caret {
				font-size: 0.65rem;
				opacity: 0.7;
			}
		}
		&[open] summary {
			color: var(--text);
			border-color: var(--accent);
		}

		ul {
			position: absolute;
			right: 0;
			top: calc(100% + 6px);
			margin: 0;
			padding: 5px;
			min-width: 10.5rem;
			list-style: none;
			background: var(--bg-2);
			border: 1px solid var(--border);
			border-radius: var(--radius-sm);
			box-shadow: 0 14px 34px rgba(0, 0, 0, 0.5);
		}
		a {
			display: block;
			padding: 7px 10px;
			font-size: 0.86rem;
			font-weight: 600;
			border-radius: 8px;
			color: var(--text);
			text-decoration: none;

			&:hover,
			&:focus-visible {
				background: color-mix(in oklab, var(--accent) 16%, transparent);
				outline: none;
			}
			&.active {
				color: var(--bg);
				background: var(--accent);
			}
		}
	}
</style>
