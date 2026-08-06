// Precompute the IANA time-zone → representative-city table and write it to timezones.generated.ts
// (imported at runtime by $lib/geoguess). Run via `npm run precompute` (also runs automatically before
// `npm run build` and `npm run check`).
//
// The inputs are vendored under scripts/data/ rather than fetched or read from the host — see the README
// there for why, and for which release each file comes from. The parsing lives in
// src/lib/data/timezoneTable.ts so it can be unit-tested without the filesystem (the corridor pattern).
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildTimezoneTable, renderTimezoneModule } from '../src/lib/data/timezoneTable';

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string) => readFileSync(resolve(here, 'data', name), 'utf8');

const table = buildTimezoneTable(read('zone1970.tab'), read('zone2022a.tab'), read('backward'));

const zones = Object.keys(table.places).length;
const aliases = Object.keys(table.aliases).length;
// A half-parsed tab file still produces a plausible-looking module; a floor catches that at build time
// rather than as a mysteriously large number of visitors landing on the showcase place.
if (zones < 350) {
	console.error(`timezones: only ${zones} zones parsed — the input tabs look wrong`);
	process.exit(1);
}

const target = resolve(here, '../src/lib/data/timezones.generated.ts');
writeFileSync(target, renderTimezoneModule(table, 'tzdata 2026c, with 2022a coordinates for merged zones'));
console.log(`timezones: ${zones} zones / ${aliases} aliases → ${target}`);
