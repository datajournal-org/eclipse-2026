# Eclipse 2026

Static SvelteKit app (adapter-static, prerendered) for the 2026-08-12 total solar eclipse, deployed as
static files to bunny.net. All personalisation — chosen location, maps, countdown — runs client-side.

## Reference documents

- [Glossary](./docs/GLOSSARY.md) — shared vocabulary (astronomy, UI elements, libraries); use these exact names.
- [Architecture](./docs/ARCHITECTURE.md) — structure and technical decisions.
- [Concept](./docs/CONCEPT.md) — product concept and goals.
- [Wireframes](./docs/WIREFRAMES.md) — screen layouts (source: `docs/wireframes.html`).
- [Test plan](./docs/TESTING.md) — Vitest for `src/lib` modules, Playwright for UI and interactions.
- [i18n routing](./docs/I18N-ROUTING.md) — proposed per-locale URLs and SEO metadata (not built yet).

## Working notes

- Gate before calling work done: `npm run check` (tsc + svelte-check + Prettier + ESLint). Build: `npm run build`.
- Prettier checks every file, including Markdown — keep new docs formatted.
