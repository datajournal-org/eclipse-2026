# Eclipse 2026

What the total solar eclipse of **12 August 2026** looks like from _your_ place: a static
[SvelteKit](https://svelte.dev/docs/kit) app served at
[datajournal.org/eclipse-2026](https://datajournal.org/eclipse-2026/). All personalisation — chosen
location, maps, the 3D sky view — runs client-side; the location is stored in `localStorage` only,
never in a URL.

## Install

Requires **Node 24** (what CI runs).

```sh
npm install
npx playwright install chromium webkit   # only needed for the browser tests
```

## Develop

```sh
npm run dev            # Vite dev server
npm run check          # the full gate: format + types + lint + svelte-check + Vitest + Playwright
```

The full gate takes minutes; the individual steps (`check:format`, `check:ts`, `lint`,
`check:svelte`, `test:unit`, `test:e2e`) exist for quick passes. The Playwright suite tests the
**production build** (it builds and serves via `vite preview` itself).

## Build

```sh
npm run build          # → build/, a fully static site (adapter-static, prerendered)
npm run preview        # serve the build locally
```

`prebuild` regenerates the committed data (`npm run precompute`): the totality corridor and the
eclipse-day star/planet catalogue. The social image is also a committed artifact — regenerate it
with `npm run og:image` (needs a completed build) whenever the A2 globe's design changes.

## Update

```sh
npm run upgrade:check  # list available dependency updates (npm-check-updates)
npm run upgrade        # apply minor/patch updates and install
npm run check          # nothing lands without the gate
```

Majors are deliberately left to a human. Dependabot proposes grouped bumps on its own; a red
Dependabot PR usually means a peer-dependency conflict upstream (e.g. a TypeScript major the Svelte
toolchain does not support yet), not a fault in this repo.

## Where things are explained

| Doc                                    | What it holds                                              |
| -------------------------------------- | ---------------------------------------------------------- |
| [CONCEPT](./docs/CONCEPT.md)           | What this is for, and the editorial stance                 |
| [ARCHITECTURE](./docs/ARCHITECTURE.md) | Structure, technical decisions, validated reference values |
| [GLOSSARY](./docs/GLOSSARY.md)         | The shared vocabulary (astronomy, UI, libraries)           |
| [WIREFRAMES](./docs/WIREFRAMES.md)     | Screen layouts and design intent                           |
| [TESTING](./docs/TESTING.md)           | The two test layers and why they are shaped this way       |
| [I18N-ROUTING](./docs/I18N-ROUTING.md) | Per-locale URLs and SEO metadata                           |

Translations live in [`src/lib/i18n/messages/`](./src/lib/i18n/messages/) — one typed file per
language, German is the reference shape.
