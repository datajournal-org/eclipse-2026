// Precompute the totality corridor once and write it to corridor.generated.ts (imported at runtime).
// Run via `npm run precompute` (also runs automatically before `npm run build` and `npm run check`).
// The rendering lives in corridorModule.ts so it can be unit-tested without touching the filesystem.
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCorridor } from '../src/lib/shadow-globe/corridorCompute';
import { renderCorridorModule } from '../src/lib/shadow-globe/corridorModule';

const edges = computeCorridor();
const target = resolve(dirname(fileURLToPath(import.meta.url)), '../src/lib/shadow-globe/corridor.generated.ts');
writeFileSync(target, renderCorridorModule(edges));
console.log(`corridor: ${edges.north.length} north / ${edges.south.length} south points → ${target}`);
