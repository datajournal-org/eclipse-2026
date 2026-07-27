/**
 * On-disk cache for the VersaTiles assets the maps pull in.
 *
 * One located page load fetches ~66 objects / ~6.8 MB from tiles.versatiles.org (vector tiles, the
 * elevation DEM, satellite raster, sprites). With ~120 map-loading call sites across the suite that is
 * thousands of requests and hundreds of megabytes per full run, all of it the same handful of tiles over
 * Oviedo — slow, and impolite to a free community service that could reasonably rate-limit us.
 *
 * The cache is incremental and self-healing: a miss is fetched once and written, so there is no
 * record/replay mode to keep in sync and a new viewport just costs one extra fetch. It also makes the
 * suite runnable offline once warm.
 *
 * A note on error handling: a test can finish while tiles are still in flight. The context then closes,
 * any in-progress APIResponse is disposed, and `fulfill`/`body()` reject — which Playwright attributes to
 * the test that just passed, producing failures whose identity changes from run to run. Every interaction
 * with a route or response here is therefore allowed to fail silently: a test that has ended does not care
 * whether its last tile arrived.
 *
 * Two deliberate limits:
 *  - **Only 200s are stored.** Caching a 404 would have permanently hidden the elevation-tile bug (the
 *    DEM source requesting zoom levels that do not exist, which stopped B3 ever reaching `idle`). Errors
 *    go to the network every time.
 *  - **`TILES_NOCACHE=1` bypasses it entirely**, so a nightly job can talk to the real server and notice
 *    upstream changes that a warm cache would otherwise mask.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserContext } from '@playwright/test';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = join(ROOT, '.cache', 'tiles');

/** Only the tile host. The geocoder is stubbed per-spec and must stay under the specs' control. */
const TILE_URL = 'https://tiles.versatiles.org/**';

type Meta = { status: number; headers: Record<string, string> };

/**
 * Headers that describe the wire encoding of the *original* response. `route.fetch()` hands back a
 * decoded body and `fulfill` sets its own length, so replaying these would make the browser try to
 * gunzip plain bytes. Everything else is preserved — CORS in particular, without which the browser
 * rejects these cross-origin responses.
 */
const DROP_HEADERS = new Set(['content-encoding', 'content-length', 'transfer-encoding']);

/** Hit/miss counters, so a run can show whether the cache is actually doing its job. */
const stats = { hits: 0, misses: 0, uncacheable: 0 };
export const tileCacheStats = () => ({ ...stats });

const keyFor = (method: string, url: string) => createHash('sha1').update(`${method} ${url}`).digest('hex');

/**
 * Run a route/response interaction, swallowing the errors that mean "the test already ended" — a disposed
 * response or a closed context. Anything else is re-thrown, so a genuine bug here is still visible.
 */
async function ignoreIfGone<T>(fn: () => Promise<T>): Promise<T | undefined> {
	try {
		return await fn();
	} catch (err) {
		const message = String(err);
		const gone =
			message.includes('has been disposed') ||
			message.includes('Test ended') ||
			message.includes('Target page, context or browser has been closed') ||
			message.includes('has been closed');
		if (!gone) throw err;
		return undefined;
	}
}

/** Write via a unique temp name and rename, so parallel workers cannot observe a half-written file. */
function writeAtomic(path: string, data: Buffer | string) {
	const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
	writeFileSync(tmp, data);
	renameSync(tmp, path);
}

/** Route tile requests through the on-disk cache. Call once per browser context. */
export async function installTileCache(context: BrowserContext) {
	if (process.env.TILES_NOCACHE) return;
	mkdirSync(CACHE_DIR, { recursive: true });

	await context.route(TILE_URL, async (route) => {
		const request = route.request();
		if (request.method() !== 'GET') return route.fallback();

		const key = keyFor(request.method(), request.url());
		const bodyPath = join(CACHE_DIR, `${key}.bin`);
		const metaPath = join(CACHE_DIR, `${key}.json`);

		if (existsSync(bodyPath) && existsSync(metaPath)) {
			try {
				const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as Meta;
				const body = readFileSync(bodyPath);
				stats.hits++;
				await ignoreIfGone(() => route.fulfill({ status: meta.status, headers: meta.headers, body }));
				return;
			} catch {
				// A corrupt or partially written entry: fall through and re-fetch rather than fail the test.
			}
		}

		stats.misses++;
		if (process.env.TILES_OFFLINE) {
			await ignoreIfGone(() => route.abort('failed')); // prove the cache stands alone
			return;
		}

		const response = await ignoreIfGone(() => route.fetch());
		if (!response) {
			// Either the fetch failed (offline with a cold cache) or the test ended mid-flight.
			await ignoreIfGone(() => route.abort());
			return;
		}

		const status = response.status();
		const body = await ignoreIfGone(() => response.body());
		if (body === undefined) return; // disposed because the test finished; nothing left to serve
		if (status !== 200) stats.uncacheable++;
		if (status === 200) {
			const headers: Record<string, string> = {};
			for (const [name, value] of Object.entries(response.headers())) {
				if (!DROP_HEADERS.has(name.toLowerCase())) headers[name] = value;
			}
			try {
				writeAtomic(bodyPath, body);
				writeAtomic(metaPath, JSON.stringify({ status, headers } satisfies Meta));
			} catch {
				// A full disk or a racing worker must not fail the test; serving the response is enough.
			}
		}
		await ignoreIfGone(() => route.fulfill({ response, body }));
	});
}
