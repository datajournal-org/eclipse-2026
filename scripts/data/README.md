# Vendored IANA time-zone tables

Input for `scripts/build-timezones.ts` → `src/lib/data/timezones.generated.ts`, which lets the app guess
a starting location from `Intl.DateTimeFormat().resolvedOptions().timeZone`.

All files are from the IANA time zone database and are **public domain** (see `LICENSE`).

| File            | Release   | Source                                                                          |
| --------------- | --------- | ------------------------------------------------------------------------------- |
| `zone1970.tab`  | **2026c** | `https://data.iana.org/time-zones/releases/tzdata2026c.tar.gz`                  |
| `backward`      | **2026c** | same archive                                                                    |
| `zone2022a.tab` | **2022a** | `https://data.iana.org/time-zones/releases/tzdata2022a.tar.gz` (its `zone.tab`) |

## Why vendored rather than fetched or read from the host

`npm run precompute` runs from both `prebuild` and `precheck`, so it runs in CI and on every build.
`build-corridor.ts` and `build-sky.ts` are pure computation with no network, and a `fetch` here would
make `npm run build` fail on an offline machine or a locked-down runner. Reading the host's own copy is
not reproducible either: macOS ships only the legacy `zone.tab`, Linux ships `zone1970.tab`, and neither
ships the pre-2022 coordinates below — the generated table would differ per developer. Committed input
plus committed output makes a data refresh a reviewable diff.

## Why an old release is in here

Since 2022b the database **merges zones whose clocks have agreed since 1970**, replacing them with
`Link` lines. `Europe/Oslo` and `Europe/Stockholm` became links to `Europe/Berlin`; `Europe/Amsterdam`
and `Europe/Luxembourg` became links to `Europe/Brussels`; `Europe/Copenhagen`, `Europe/Vienna`,
`Europe/Monaco`, `Europe/Zagreb` and nine others went the same way. Their own coordinates were dropped
from `zone1970.tab` along with them.

That merge is a statement about **clock agreement, not geography**, and this app needs the geography:
Stockholm is 750 km from Berlin, and at Stockholm's latitude the 2026 eclipse has a visibly different
depth, Sun altitude and timing. Resolving a Swedish reader's zone to Berlin would open the app on a
plainly wrong sky.

So `zone2022a.tab` — the last `zone.tab` published before the merges — supplies coordinates for zones
that `zone1970.tab` no longer carries. `zone1970.tab` still wins wherever both have a zone, so ordinary
updates (new zones, corrected coordinates) come from the current release.

`backward` is used only for the genuine renames that no tab file covers — `Asia/Calcutta` →
`Asia/Kolkata`, `Europe/Kiev` → `Europe/Kyiv`, `US/Pacific` → `America/Los_Angeles` — which browsers
still report, because ECMA-402 no longer requires `resolvedOptions().timeZone` to be canonicalised.

## Refreshing

```sh
curl -sO https://data.iana.org/time-zones/releases/tzdata2026c.tar.gz   # or a newer release
tar xzf tzdata2026c.tar.gz -C scripts/data zone1970.tab backward LICENSE
npm run precompute
```

Leave `zone2022a.tab` alone — it is a frozen snapshot, not a copy of the current release, and updating
it would delete exactly the coordinates it exists to provide. Update the release column above, and
re-run the unit tests: `src/lib/data/timezones.generated.test.ts` checks every zone the running
JavaScript engine knows about still resolves.
