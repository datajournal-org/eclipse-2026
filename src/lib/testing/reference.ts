/**
 * Validated reference values for the 2026-08-12 eclipse — the shared oracle for both test layers.
 * Vitest asserts that the astronomy produces these numbers; Playwright asserts that they reach the screen.
 *
 * Source: docs/ARCHITECTURE.md § "Validated reference values (astronomy-engine, UTC)". Keep the two in sync;
 * the tolerances below are what the table's precision (whole minutes, one decimal) can actually support.
 */

export type ReferenceSite = {
	name: string;
	lat: number;
	lon: number;
	kind: 'total' | 'partial';
	/** Obscuration as a fraction (0..1). */
	obsc: number;
	/** Local maximum, UTC "HH:MM". */
	maxUtc: string;
	/** Sun altitude at maximum, degrees. */
	sunAlt: number;
	/** Sun azimuth at maximum, degrees — only tabulated for Berlin. */
	az?: number;
};

export const REFERENCE: ReferenceSite[] = [
	{ name: 'Reykjavík', lat: 64.1466, lon: -21.9426, kind: 'total', obsc: 1.0, maxUtc: '17:48', sunAlt: 24.6 },
	{ name: 'Oviedo', lat: 43.3603, lon: -5.8448, kind: 'total', obsc: 1.0, maxUtc: '18:27', sunAlt: 10.3 },
	{ name: 'Palma', lat: 39.5696, lon: 2.6502, kind: 'total', obsc: 1.0, maxUtc: '18:31', sunAlt: 2.6 },
	{ name: 'Berlin', lat: 52.52, lon: 13.405, kind: 'partial', obsc: 0.848, maxUtc: '18:08', sunAlt: 3.5, az: 290 },
	{ name: 'München', lat: 48.1372, lon: 11.5756, kind: 'partial', obsc: 0.887, maxUtc: '18:15', sunAlt: 2.1 }
];

export const byName = (name: string): ReferenceSite => {
	const site = REFERENCE.find((s) => s.name === name);
	if (!site) throw new Error(`unknown reference site: ${name}`);
	return site;
};

/** Greatest eclipse, off Iceland (ARCHITECTURE.md, same table). */
export const GREATEST = { utc: '2026-08-12T17:45:46Z', lat: 65.2, lon: -25.2 };

/** "HH:MM" of a Date, in UTC. */
export const hhmmUtc = (d: Date): string => d.toISOString().slice(11, 16);
