# Eclipse 2026

Static SvelteKit app (adapter-static, prerendered) for the 2026-08-12 total solar eclipse, deployed as
static files to bunny.net at `https://datajournal.org/eclipse-2026/`; CI also publishes a copy to GitHub
Pages. All personalisation — chosen location, maps, countdown — runs client-side, and the chosen location
is persisted to `localStorage` only, never to the URL.

## Reference documents

- [Glossary](./docs/GLOSSARY.md) — shared vocabulary (astronomy, UI elements, libraries); use these exact names.
- [Architecture](./docs/ARCHITECTURE.md) — structure and technical decisions.
- [Concept](./docs/CONCEPT.md) — product concept and goals.
- [Wireframes](./docs/WIREFRAMES.md) — screen layouts (source: `docs/wireframes.html`); design intent, with
  the unbuilt blocks (A3, B2, About) marked inline.
- [Test plan](./docs/TESTING.md) — Vitest for `src/lib` modules, Playwright for UI and interactions.
- [i18n routing](./docs/I18N-ROUTING.md) — per-locale URLs and SEO metadata; **implemented**.

## Working notes

- Gate before calling work done: `npm run check` — Prettier + tsc + ESLint + svelte-check **and both test
  layers** (Vitest, then Playwright), so it takes minutes. For a quick pass use the individual steps
  (`check:format`, `check:ts`, `lint`, `check:svelte`, `test:unit`). Build: `npm run build`.
- Prettier checks every file, including Markdown — keep new docs formatted.
