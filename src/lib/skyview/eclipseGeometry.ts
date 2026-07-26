// Sun/Moon positions and the derived eclipse geometry at one instant, for the B3 sky view. Pure math,
// shared by SkyView's per-frame update, its start-frame scan, and anything else that needs the coverage.
import { sunMoonHorizon } from '$lib/eclipse';
import { discOverlapFraction } from '$lib/shadow-globe/shadowProfile';
import {
	norm180,
	AU_KM as AU,
	SUN_RADIUS_KM as RSUN,
	MOON_RADIUS_KM as RMOON,
	DEG_TO_RAD as D2R,
	RAD_TO_DEG as R2D
} from '$lib/constants';

type SunMoon = ReturnType<typeof sunMoonHorizon>;

export type EclipseGeometry = {
	sun: SunMoon['sun'];
	moon: SunMoon['moon'];
	sunAngR: number; // Sun angular radius (deg)
	moonAngR: number; // Moon angular radius (deg)
	dx: number; // Moon-centre offset from the Sun: east (deg, screen +x)
	dy: number; // Moon-centre offset from the Sun: up (deg, screen +y)
	obsc: number; // fraction of the Sun's disc covered (0..1)
};

export function eclipseGeometry(lat: number, lon: number, date: Date): EclipseGeometry {
	const { sun, moon } = sunMoonHorizon(lat, lon, date);
	const sunAngR = Math.atan(RSUN / (sun.distAu * AU)) * R2D;
	const moonAngR = Math.atan(RMOON / (moon.distAu * AU)) * R2D;
	const dx = norm180(moon.az - sun.az) * Math.cos(sun.alt * D2R); // +x east, +y up (screen)
	const dy = moon.alt - sun.alt;
	const obsc = discOverlapFraction(sunAngR, moonAngR, Math.hypot(dx, dy));
	return { sun, moon, sunAngR, moonAngR, dx, dy, obsc };
}
