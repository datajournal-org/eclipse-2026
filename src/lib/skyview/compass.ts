// Orientation for the B3 sky view: the eight compass points and the horizon-ruler geometry. Everything
// azimuthal in one place, so the readout chip, the WebGL tick ruler (compassLayer.ts) and the DOM labels
// (CompassLabels.svelte) cannot disagree about where north is or what east is called.
//
// The letters themselves are i18n keys, not constants: German east is O, Spanish west is O — the
// component resolves `b3.compass.<key>` through the normal message files.

/** The eight compass points, clockwise from north. Index i sits at azimuth i x 45°. */
export const CARDINAL_KEYS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

/** The message key of the compass point nearest an azimuth (0..360, wrap-safe). */
export function cardinalKey(azDeg: number): (typeof CARDINAL_KEYS)[number] {
	return CARDINAL_KEYS[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8];
}

/**
 * Altitude of the DOM labels above the true horizon, in degrees — high enough to clear most terrain
 * silhouettes (distant hills rarely rise past ~2° from a lowland viewpoint), low enough to read as
 * belonging to the horizon rather than to the sky.
 */
export const LABEL_ALT = 2.8;

export type CompassTick = {
	/** Azimuth of the tick, degrees. */
	az: number;
	/** Top of the tick, in degrees of altitude above the true horizon. */
	top: number;
};

// Tick heights in degrees of altitude — the minor tick is about one Sun diameter, so the ruler shares
// the scene's angular scale rather than a pixel one, and dollying (which changes nothing angular)
// leaves it alone.
const MINOR = 0.55, // every 5°
	MEDIUM = 0.95, // every 15°
	MAJOR = 1.6; // the eight compass points

/** The full horizon ruler: a tick every 5°, taller every 15°, tallest on the eight compass points. */
export function compassTicks(): CompassTick[] {
	const ticks: CompassTick[] = [];
	for (let az = 0; az < 360; az += 5) {
		ticks.push({ az, top: az % 45 === 0 ? MAJOR : az % 15 === 0 ? MEDIUM : MINOR });
	}
	return ticks;
}
