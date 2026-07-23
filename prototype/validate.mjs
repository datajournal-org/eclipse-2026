// Validation: prove the eclipse math before building UI on top of it.
import { shadowCenter, greatestEclipse, localCircumstances, sunMoonHorizon } from './eclipse.mjs';

const km = (aLat, aLon, bLat, bLon) => {
  const R = 6371, d = Math.PI / 180;
  const dLat = (bLat - aLat) * d, dLon = (bLon - aLon) * d;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * d) * Math.cos(bLat * d) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

console.log('=== 1. Shadow center vs. astronomy-engine greatest eclipse ===');
const g = greatestEclipse();
const mine = shadowCenter(g.date);
console.log(`  reference (engine): ${g.lat.toFixed(3)}, ${g.lon.toFixed(3)}  @ ${g.date.toISOString()}`);
console.log(`  shadowCenter():     ${mine.lat.toFixed(3)}, ${mine.lon.toFixed(3)}`);
console.log(`  error: ${km(g.lat, g.lon, mine.lat, mine.lon).toFixed(1)} km  (want < ~20 km)`);

console.log('\n=== 2. Shadow path trace (should run Arctic -> Iceland -> N Atlantic -> N Spain) ===');
for (const hhmm of ['16:00', '16:30', '17:00', '17:30', '17:46', '18:00', '18:15', '18:30']) {
  const d = new Date(`2026-08-12T${hhmm}:00Z`);
  const p = shadowCenter(d);
  console.log(`  ${hhmm} UTC -> ${p ? `${p.lat.toFixed(2).padStart(6)}, ${p.lon.toFixed(2).padStart(7)}` : 'axis misses Earth'}`);
}

console.log('\n=== 3. Local circumstances for reference locations ===');
const cities = [
  ['Reykjavik', 64.147, -21.940],
  ['Oviedo (N Spain)', 43.362, -5.849],
  ['Palma', 39.570, 2.650],
  ['Madrid', 40.417, -3.703],
  ['Berlin', 52.520, 13.405],
  ['Munich', 48.137, 11.575],
];
for (const [name, lat, lon] of cities) {
  const lc = localCircumstances(lat, lon);
  if (!lc) { console.log(`  ${name.padEnd(18)} no eclipse`); continue; }
  const peakUtc = lc.peak.time.toISOString().slice(11, 16);
  const obsc = (lc.obscuration * 100).toFixed(1) + '%';
  console.log(`  ${name.padEnd(18)} ${lc.kind.padEnd(7)} obsc ${obsc.padStart(6)}  peak ${peakUtc}Z  sun alt ${lc.peak.alt.toFixed(1)}°`);
}

console.log('\n=== 4. Sun/Moon az-alt at Berlin peak (for B3 camera) ===');
const bl = localCircumstances(52.520, 13.405);
const sm = sunMoonHorizon(52.520, 13.405, bl.peak.time);
console.log(`  Sun  az ${sm.sun.az.toFixed(1)}°  alt ${sm.sun.alt.toFixed(1)}°`);
console.log(`  Moon az ${sm.moon.az.toFixed(1)}°  alt ${sm.moon.alt.toFixed(1)}°`);
