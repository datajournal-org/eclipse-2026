<!-- The bare root (/eclipse-2026/). Two audiences, one document:
     • Crawlers and link scrapers do not run JavaScript, so they get this page — English metadata plus the
       full hreflang set, canonical-ing to /en/. This is the preview any shared root link produces.
     • Browsers never see it: the inline script in app.html redirects before first paint, so this markup is
       the no-JavaScript fallback. It has to be genuinely usable, which is why it renders the language
       choice as real links rather than a "redirecting…" placeholder. -->
<script lang="ts">
	import { resolve } from '$app/paths';
	import { LOCALES, LOCALE_NAMES, DEFAULT_LOCALE } from '$lib/i18n';
	import de from '$lib/i18n/messages/de';
	import en from '$lib/i18n/messages/en';
	import es from '$lib/i18n/messages/es';

	// Read straight from the catalogues rather than through the `t` store: this page is deliberately
	// multilingual — its own chrome is in the default language, but each link names its language natively.
	const DICTS = { de, en, es };
	const copy = DICTS[DEFAULT_LOCALE];

	// Trailing slash appended for the same reason as in Header.svelte: it is what the canonical form is.
	const langHref = (l: string) => `${resolve('/[lang]', { lang: l })}/`;
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- see Header.svelte: `langHref` uses `resolve`. -->
<main class="pick">
	<h1>{copy.app.title}</h1>
	<p class="tagline">{copy.app.tagline}</p>
	<p class="lead">{copy.app.page_description}</p>

	<nav aria-label="Language">
		<ul>
			{#each LOCALES as l (l)}
				<li><a href={langHref(l)} hreflang={l} lang={l}>{LOCALE_NAMES[l]}</a></li>
			{/each}
		</ul>
	</nav>
</main>

<style>
	.pick {
		max-width: 34rem;
		margin: 0 auto;
		padding: var(--sp-6, 2rem) var(--sp-4, 1rem);
		text-align: center;
	}
	.tagline {
		color: var(--fg-muted, #98a2b3);
		margin-block: 0.25rem 1.5rem;
	}
	.lead {
		margin-block-end: 2rem;
	}
	ul {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		justify-content: center;
		list-style: none;
		padding: 0;
	}
	a {
		display: inline-block;
		padding: 0.6rem 1.1rem;
		border: 1px solid var(--line, #2a3244);
		border-radius: var(--radius-2, 8px);
		color: inherit;
		text-decoration: none;
	}
	a:hover,
	a:focus-visible {
		border-color: var(--accent, #ffb703);
	}
</style>
