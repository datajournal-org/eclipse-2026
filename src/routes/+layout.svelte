<script lang="ts">
	// Open Props engineering scales (tokens.css maps these into our semantic roles).
	import 'open-props/sizes';
	import 'open-props/fonts';
	import 'open-props/easings';
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { page } from '$app/state';
	import { base } from '$app/paths';
	import { applyLocale, isLocale, t, locale, LOCALES, OG_LOCALE, DEFAULT_LOCALE } from '$lib/i18n';
	import { SITE_URL } from '$lib/config';
	import Header from '$lib/components/Header.svelte';

	let { children }: { children: Snippet } = $props();

	// The URL owns the language. On the bare root there is no parameter, so the default applies — that is
	// the page crawlers see, and its metadata has to be the default language's.
	// `routeLang` keeps the "am I the bare root?" bit that routeLocale throws away by collapsing onto the
	// default; only the social card needs to tell those two apart (see og:image below).
	const routeLang = $derived(isLocale(page.params.lang) ? page.params.lang : null);
	const routeLocale = $derived(routeLang ?? DEFAULT_LOCALE);
	// Set synchronously as well as reactively: effects do not run during prerendering, and without the
	// synchronous call every prerendered page would ship the DEFAULT language's metadata — which is the
	// one thing crawlers read. The effect then covers client-side navigations (the language switcher).
	// Reading it once here is the point: this call is what runs during prerendering, where effects never
	// fire. The effect below owns every subsequent change.
	// svelte-ignore state_referenced_locally
	applyLocale(routeLocale);
	$effect(() => applyLocale(routeLocale));

	/** Absolute URL of a language's page — hreflang and canonical are ignored unless absolute. */
	const href = (l: string) => `${SITE_URL}${base}/${l}/`;
	const canonical = $derived(`${SITE_URL}${base}/${routeLocale}/`);

	const SCROLL_KEY = 'eclipse.scroll';

	onMount(() => {
		// Manual scroll restoration. The located "B" state renders on the client, so on a reload the page
		// grows past the prerendered "A" shell only AFTER SvelteKit has already restored the scroll against
		// the short shell — landing too high. We restore it ourselves once the real layout is in place.
		const saved = sessionStorage.getItem(SCROLL_KEY);
		if (saved != null) {
			const y = +saved;
			let active = true;
			const stop = () => (active = false);
			addEventListener('wheel', stop, { passive: true, once: true });
			addEventListener('touchstart', stop, { passive: true, once: true });
			addEventListener('keydown', stop, { once: true });
			// Re-apply the saved position every frame until we've actually held y for ~400 ms, or the visitor
			// scrolls. Keying off "y held" (not "height constant") rides out the async layout — the late "B"
			// content climbing off a clamped short page, and scroll-anchoring nudges after it lands — while a
			// jittering page height (map tiles) can't keep the loop alive and fight a later manual scroll.
			const start = performance.now();
			let heldSince = 0;
			const tick = (now: number) => {
				if (!active) return;
				scrollTo(0, y);
				if (Math.abs(scrollY - y) <= 1) heldSince ||= now;
				else heldSince = 0; // clamped (page still short) or knocked off by a shift — keep going
				const settled = heldSince && now - heldSince >= 400;
				if (!settled && now - start < 5000) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}

		// Keep the position saved: live (throttled) while scrolling, and a guaranteed synchronous flush on
		// pagehide so a reload always sees the latest position even if the throttled write hasn't fired.
		let last = Math.round(scrollY);
		const flush = () => sessionStorage.setItem(SCROLL_KEY, String(last));
		let raf = 0;
		const save = () => {
			last = Math.round(scrollY);
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				flush();
			});
		};
		addEventListener('scroll', save, { passive: true });
		addEventListener('pagehide', flush);
		return () => {
			removeEventListener('scroll', save);
			removeEventListener('pagehide', flush);
		};
	});
</script>

<svelte:head>
	<!-- The satellite/vector tiles dominate real load time, and their DNS+TLS handshake would otherwise
	     start only after MapLibre has loaded and asked for the first tile. Warming the connection during
	     HTML parse buys 1-3 round trips on every first visit. `crossorigin`, because MapLibre fetches
	     tiles in CORS mode — a non-CORS preconnect would warm a connection the tiles cannot reuse.
	     The geocoder gets only a DNS prefetch: it is not used until the location dialog opens, and an
	     idle preconnected socket would be closed again long before that. -->
	<link rel="preconnect" href="https://tiles.versatiles.org" crossorigin="anonymous" />
	<link rel="dns-prefetch" href="https://geocode.versatiles.org" />

	<title>{$t('app.page_title')}</title>
	<meta name="description" content={$t('app.page_description')} />
	<link rel="canonical" href={canonical} />

	<meta property="og:title" content={$t('app.page_title')} />
	<meta property="og:description" content={$t('app.page_description')} />
	<meta property="og:url" content={canonical} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={$t('app.title')} />
	<meta property="og:locale" content={OG_LOCALE[$locale]} />
	{#each LOCALES.filter((l) => l !== $locale) as other (other)}
		<meta property="og:locale:alternate" content={OG_LOCALE[other]} />
	{/each}

	<!-- Reciprocal and absolute, generated from one list: a single relative or one-way annotation
	     silently invalidates the whole set. x-default is the root, which is what dispatches readers
	     whose language we do not have. -->
	{#each LOCALES as l (l)}
		<link rel="alternate" hreflang={l} href={href(l)} />
	{/each}
	<link rel="alternate" hreflang="x-default" href={`${SITE_URL}${base}/`} />

	<!-- The 1200×630 card image: the B3 sky view over Madrid at 20:30 CEST, generated from the real scene
	     by `npm run og:image` (scripts/build-og-image.ts) and committed to static/. One card per language,
	     because the pitch is baked INTO the image — most clients truncate or drop og:description, so a
	     locale-neutral asset would leave the card mute. Absolute URL, because crawlers ignore relative ones.
	     The bare root keeps the unsuffixed `og.jpg` (a copy of the default language's card): static/meta.json
	     advertises that exact filename to datajournal.org, and publish.spec.ts pins it. -->
	<meta property="og:image" content={`${SITE_URL}${base}/${routeLang ? `og-${routeLang}.jpg` : 'og.jpg'}`} />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content={$t('app.og_image_alt')} />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="app">
	<Header />
	{@render children()}
</div>
