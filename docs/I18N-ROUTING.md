# Per-locale routing & SEO metadata

Plan for moving the app from one prerendered document with client-side language detection to one
prerendered document **per language**, each with its own title, description and social metadata, tied
together with `hreflang`.

Status: **implemented.** The three questions in §1 are answered; §7 records what the build actually needed.

## Why

Today the locale is detected in `onMount` and everything is served from a single prerendered page.
Scrapers and search-engine crawlers do not run JavaScript, so they only ever see the German shell:

- Link previews are German for every reader, in every chat app.
- Search engines index one German page; the English and Spanish translations are invisible to them.
- `<html lang>` is hardcoded `de`, so assistive tech announces English copy with German pronunciation.

Per-locale URLs fix all three, because each language becomes a real document a crawler can fetch.

---

## 1. Decisions

**1.1 — Sub-path.** The site is deployed at `https://datajournal.org/eclipse-2026/`, so
`kit.paths.base = '/eclipse-2026'`. Every link and asset URL in the build carries that prefix, and tests
navigate through it.

**1.2 — Default language: English.** The bare root serves English metadata and `x-default`. This changes
`DEFAULT` in `i18n/index.ts` from `de` to `en`, and the `<html lang>` baseline in `app.html` with it.

**1.3 — Production origin: `https://datajournal.org`.** Held as `SITE_URL` in `src/lib/config.ts`, matching
that file's "single place to tweak the event" role. `hreflang` and `canonical` are ignored unless absolute,
so every one of them is built from this constant.

Still outstanding, and not blocking the routing work:

- ~~Copy for `app.page_title` / `app.page_description`.~~ Done: the personalisation hook — the title names
  the event, date and "what you'll see from here"; the description leads with coverage, timing and the
  clear-view-west question, closing on the since-1999 rarity. Chosen over a rarity-first or
  horizon-event-first framing because it is what distinguishes the page from a generic astronomy table in
  a search result. Unit tests hold the 60/155-character caps that search results and preview cards
  truncate at.
- **A 1200×630 social image.** Until it exists, `twitter:card` stays `summary` and no `og:image` is emitted;
  a `summary_large_image` card with no valid image renders worse than no card at all.

---

## 2. The one part that cannot work as written

> "/eclipse-2026/" redirects to "/eclipse-2026/de" … depending on the browser language

There is no server. `adapter-static` emits files and bunny.net serves them, so nothing can read
`Accept-Language` and issue a 302 — unless it is done in a bunny.net Edge Rule, outside this repo.

That is also in direct tension with the next requirement: if the edge redirected everyone, a scraper would
be redirected too and would never see the root's default-language metadata. Making the edge redirect
humans but not scrapers means matching on `User-Agent`, which is exactly the pattern search engines treat
as cloaking.

**Resolution: redirect on the client.** The root is a real prerendered page carrying the default
language's metadata. A scraper fetches it and reads that metadata — precisely what §3 of the proposal
asks for. A browser runs the redirect script and lands on its own language. No cloaking, no edge config,
and the behaviour lives in the repo where it can be tested.

Two ways to do it, differing only in how early the redirect fires:

| Approach                                                        | Flash                    | Trade-off                                                         |
| --------------------------------------------------------------- | ------------------------ | ----------------------------------------------------------------- |
| `redirect()` in a `browser`-guarded universal load (`+page.ts`) | brief blank/shell moment | Idiomatic SvelteKit, easy to test                                 |
| Blocking inline `<script>` in `app.html`'s `<head>`             | none                     | Runs before first paint; logic sits in `app.html`, less idiomatic |

Recommended: the inline script. It is ~8 lines, it is the only version with no visible flash, and the root
page is the one place where a pre-paint decision is genuinely warranted. Guard it on the pathname so it
can never fire on `/de`, `/en` or `/es` and loop.

---

## 3. Structure

### 3.1 Routes

```
src/routes/
	+layout.svelte          # shell; reads the locale from the route, not from navigator
	+page.svelte            # the root: default-language metadata + the redirect
	[lang]/
		+page.ts            # validates the param, sets prerender entries
		+page.svelte        # the app itself (today's +page.svelte, unchanged)
```

`[lang]/+page.ts`:

```ts
import { error } from '@sveltejs/kit';
import { LOCALES, type Locale } from '$lib/i18n';

export const prerender = true;
export const entries = () => LOCALES.map((lang) => ({ lang }));

export function load({ params }) {
	if (!(LOCALES as readonly string[]).includes(params.lang)) error(404, 'Unknown language');
	return { lang: params.lang as Locale };
}
```

Set `kit.trailingSlash: 'always'` so each route emits `de/index.html` — static hosts serve directory
indexes, not extensionless files.

**Reconsider `fallback: '200.html'`.** With every real route prerendered, the SPA fallback's only remaining
job is answering unknown URLs — and it answers them with HTTP 200, which search engines read as a soft 404.
A static `404.html` is the better default now. The fallback is not needed for the `?lat=&lon=` debug
override, since that is a query string on an existing route.

### 3.2 The root page

Prerenders with the default language's metadata (§1.2: English), carries the full `hreflang` set, and
redirects browsers. Because it is a distinct URL from `/en`, it needs `<link rel="canonical">` pointing at
`/en` so the two are not treated as competing duplicates.

`x-default` should point at the **root**, not at `/en`: that annotation is defined as "the page for readers
whose language you do not handle", which is exactly what a language-dispatching root is.

### 3.3 Locale becomes URL-derived

The route param becomes the single source of truth. `i18n/index.ts` changes shape:

- `initLocale()` / `detect()` move out of the app and into the root redirect script, which is now the only
  place `navigator.languages` is read.
- `setLocale()` stops being how the UI switches language. `Header.svelte` becomes navigation —
  `goto(`${base}/${lang}${location.search}`)` — preserving the query string so the `?lat=&lon=` debug
  override survives a language switch.
- `localStorage['locale']` is demoted from source of truth to a _preference the root consults first_, so a
  returning reader who chose Spanish is not re-detected as German.
- The layout sets the store from `data.lang` on every navigation, so a client-side language switch still
  re-renders instantly without a full page load.

### 3.4 `<html lang>` per page

`<svelte:head>` cannot set attributes on `<html>`. The idiomatic fix is `transformPageChunk` in
`src/hooks.server.ts` — server hooks _do_ run during prerendering, so this is compatible with
`adapter-static`:

```ts
// app.html: <html lang="%lang%">
export const handle = async ({ event, resolve }) =>
	resolve(event, {
		transformPageChunk: ({ html }) => html.replace('%lang%', event.params.lang ?? 'en')
	});
```

The client-side switcher must also assign `document.documentElement.lang` on navigation, since a
client-side route change does not re-run the hook.

### 3.5 Head metadata

In `+layout.svelte`, driven by the route locale (so it is correct both in the prerendered file and after a
client-side switch):

```svelte
<svelte:head>
	<title>{$t('app.page_title')}</title>
	<meta name="description" content={$t('app.page_description')} />
	<link rel="canonical" href={`${SITE_URL}${base}/${$locale}/`} />

	<meta property="og:title" content={$t('app.page_title')} />
	<meta property="og:description" content={$t('app.page_description')} />
	<meta property="og:url" content={`${SITE_URL}${base}/${$locale}/`} />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content={$t('app.title')} />
	<meta property="og:locale" content={OG_LOCALE[$locale]} />
	{#each LOCALES.filter((l) => l !== $locale) as other}
		<meta property="og:locale:alternate" content={OG_LOCALE[other]} />
	{/each}

	{#each LOCALES as l}
		<link rel="alternate" hreflang={l} href={`${SITE_URL}${base}/${l}/`} />
	{/each}
	<link rel="alternate" hreflang="x-default" href={`${SITE_URL}${base}/`} />
</svelte:head>
```

`hreflang` has two rules that are easy to get wrong and silently invalidate the whole set: the annotations
must be **reciprocal** (every page lists every language _including itself_), and the URLs must be
**absolute**. Both are covered by generating them from one list.

New i18n keys, added to `de.ts` first — `Messages = typeof messages` turns the other two catalogues into
compile errors until they are filled in, and the existing catalogue-parity Vitest test enforces the same
at runtime:

| Key                    | Cap        | Used by                              |
| ---------------------- | ---------- | ------------------------------------ |
| `app.page_title`       | ~60 chars  | `<title>`, `og:title`                |
| `app.page_description` | ~155 chars | `meta description`, `og:description` |
| `app.og_image_alt`     | —          | `og:image:alt`                       |

### 3.6 Social image

Still needs a 1200×630 PNG or JPEG; `static/corona_512.webp` is the wrong ratio, under half the required
width, and WebP support across scrapers is uneven. Per-locale images would be ideal but one language-neutral
image is a reasonable start. Keep `twitter:card` at `summary` until a valid image exists —
`summary_large_image` without one renders worse than no card at all.

---

## 4. Impact on the existing suite

The locale surface is small — `i18n/index.ts`, `+layout.svelte`, `Header.svelte` — but the URL change
touches every end-to-end test, since all 213 navigate to `/` or `/?lat=…`.

- **`tests/fixtures.ts`** absorbs most of it: `locatedPage` and `storedPage` already build the URLs, so
  they gain a locale prefix and the specs are largely untouched.
- **`i18n.spec.ts`** changes the most — the switcher becomes navigation, so the assertions move from
  "the store updated" to "the URL, `<html lang>`, `<title>` and the copy all changed together".
- **New `seo.spec.ts`**, asserting against the **raw prerendered HTML** (`page.request.get`), never the
  live DOM — a DOM assertion would pass even if the tags only appeared after hydration, which is exactly
  what a crawler cannot see:
   - each of `/`, `/de/`, `/en/`, `/es/` has exactly one `<title>`, and the three locales differ;
   - `hreflang` sets are reciprocal and absolute across all four documents;
   - `x-default` points at the root and `canonical` on the root points at the default language;
   - `<html lang>` matches the route;
   - the root carries the default language's `og:title`.
- **New root-redirect tests**, driven by Playwright's `locale` option: `de-DE` lands on `/de/`, `en-GB` on
  `/en/`, an unhandled language (`fr-FR`) on the default, a stored preference beats the browser language,
  and no locale page ever redirects (loop guard).
- **`i18n/index.dom.test.ts`** loses the `detect()`/`initLocale()` cases and gains coverage of whatever the
  root's detection helper becomes — worth extracting as a pure function so it stays unit-testable.

## 5. Sequence

1. Answer §1: sub-path, default language, production origin.
2. Routing skeleton — `[lang]` route, `trailingSlash`, entries, 404 handling. No metadata yet; prove the
   three pages build and the existing suite passes with prefixed URLs.
3. Locale from the route — `i18n` refactor, `Header` becomes navigation, `hooks.server.ts` for `<html lang>`.
4. Root page — default-language metadata plus the redirect, and its tests.
5. Head metadata — titles, descriptions, canonical, `hreflang`, Open Graph. Add `seo.spec.ts`.
6. Social image, then switch `twitter:card` to `summary_large_image`.
7. After deploy, verify with each platform's own scraper debugger and Search Console's international
   targeting report — the caches are aggressive, so a chat paste proves nothing.

## 6. Risks

- **`hreflang` is unforgiving.** A single non-reciprocal or relative URL invalidates the set silently.
  Generating the tags from one list and asserting reciprocity in `seo.spec.ts` is the mitigation.
- **The redirect is a real cost for JS-less humans**, not just scrapers. They land on the default language
  with no way to switch except the in-page links — so the root must render the full language switcher, not
  a bare "redirecting…" placeholder.
- **Three URLs where there was one.** Any link already shared points at the root, which still works, but
  analytics and any external references now split across languages.
- **The service worker in ARCHITECTURE.md is not built yet.** When it is, it must not cache the root's
  redirect decision, or a reader who switches language will be sent back to the old one.

---

## 7. Implementation notes

Things the plan did not anticipate, all found by building it:

- **`paths.relative: false` is required.** SvelteKit's default relative paths render `base` as `..` during
  prerendering, so every `canonical` and `hreflang` came out as `https://datajournal.org../de/`. Absolute
  paths are correct here anyway — the deploy path is known and fixed.
- **The layout must set the locale synchronously, not only in an `$effect`.** Effects do not run during
  prerendering, so with the effect alone every generated page shipped the default language's metadata —
  the one thing crawlers read. It now does both: a synchronous call for prerender and first render, an
  effect for client-side language switches.
- **Language links cannot carry the query string.** `page.url.search` throws during prerendering
  ("Cannot access url.search on a page with prerendering enabled") — prerendered markup may not depend on
  a query string. No real loss: `?lat=&lon=` is a debug override and the reader's actual location lives in
  localStorage, so it survives the navigation regardless.
- **`resolve('/[lang]', …)` applies `base` but not `trailingSlash`.** It returns `/eclipse-2026/de`, which
  does not match the `/eclipse-2026/de/` canonical, so the slash is appended by hand. `seo.spec.ts`
  asserts every internal language link is in canonical form.
- **The root dispatch script duplicates the language list.** It runs before the bundle loads, so it cannot
  import from `$lib/i18n`. `src/lib/i18n/rootDispatch.test.ts` reads `app.html` and asserts the list, the
  default, the base path, the loop guard and the use of `replace` over `assign` all still agree with the
  app — cheap insurance against the two copies drifting.

### Coverage added

- `tests/seo.spec.ts` — 15 tests against the raw prerendered HTML of all four documents.
- `tests/root-redirect.spec.ts` — 10 tests over the language dispatch, including a stored-preference
  override, an unsupported browser language, the loop guard, Back not being a trap, and the
  JavaScript-disabled fallback.
- `src/lib/i18n/rootDispatch.test.ts` — the drift guard described above.
- `src/lib/i18n/index.dom.test.ts` — `detect`/`initLocale` cases replaced with `detectLocale` (pure, so
  the root's decision is unit-tested) and `applyLocale`.

### Still open

- ~~Copy.~~ Written (personalisation hook, see §1). The English strings carry the most weight: they are
  what the root serves, what `x-default` gives readers whose language we lack, and what every shared root
  link previews as.
- **The 1200×630 social image**, and with it `og:image`, `og:image:alt` and `twitter:card`'s upgrade to
  `summary_large_image`.
- **A base-path trap to watch for.** `paths.base` means a root-absolute asset URL resolves against the
  origin root and 404s. `SkyLoupe` shipped exactly that (`href="/corona_512.webp"`); the fix is `asset()`
  from `$app/paths`. Two things now catch it: the console-error assertion in `shell.spec.ts`, and a
  structural check over every component in `rootDispatch.test.ts`.
- **Verify on the real host.** bunny.net has to serve `de/index.html` for `/eclipse-2026/de/`; every
  internal link and the canonical use the trailing-slash form, so directory indexes must resolve.

### WebKit and the keyboard: a browser preference, not a defect

`a11y.spec.ts` skips its keyboard-traversal test on WebKit. The reason is Safari's, not this app's.

macOS Safari ships with **"Press Tab to highlight each item on a webpage" turned off**, and under that
restricted tab order Tab visits _form controls only_ — `<button>` and `<a>` are both skipped. Verified
directly: injecting a bare `<input type="text">`, `<button>` and `<a>` into the page and tabbing reaches
the input and nothing else. So on WebKit the page has effectively no tab stops until a dialog with a text
field is open, and Tab appears to cycle because it is wrapping an almost-empty tab order.

This is true of every site in that configuration and is not affected by the switcher being links rather
than buttons, nor by the A2 map canvas. On Chromium the order is exactly as intended: the three language
links, then the map canvas, then the map's own controls. Readers who want full keyboard traversal in Safari
enable the preference; VoiceOver reaches links regardless.

(An earlier note here claimed the MapLibre canvas captured the tab order. That was a misreading of the
`BODY ↔ canvas` cycle — the cause is the empty tab order above.)
