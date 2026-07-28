import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Map as MlMap } from 'maplibre-gl';
import { createCameraController } from './cameraController';
import type { Framing } from './framing';
import { createFakeMap, fakeMaplibregl, installFakeRaf, type FakeMap } from '$lib/testing/fakes';
import { byName } from '$lib/testing/reference';

const OVIEDO = byName('Oviedo');
// A typical on-path shot: a wide-ish lens, the camera up behind the marker, aiming just below the horizon.
const FRAMING = { fov: 60, meanAz: 280, aimEl: -9, camDep: 30 };

type Rig = {
	m: FakeMap;
	controller: ReturnType<typeof createCameraController>;
	raf: ReturnType<typeof installFakeRaf>;
};

let rigs: Rig[] = [];

function makeRig(opts: { terrainElevation?: number | null; framing?: Partial<Framing> } = {}): Rig {
	const raf = installFakeRaf();
	const m = createFakeMap({ terrainElevation: opts.terrainElevation ?? 0 });
	const controller = createCameraController({
		maplibregl: fakeMaplibregl,
		m: m as unknown as MlMap,
		lat: OVIEDO.lat,
		lon: OVIEDO.lon,
		framing: { ...FRAMING, ...opts.framing },
		label: (key) => key
	});
	const rig = { m, controller, raf };
	rigs.push(rig);
	return rig;
}

/** The camera pose from the last jumpTo, read off the fake's recorded calculateCameraOptionsFromTo. */
function lastPose(m: FakeMap) {
	const call = m.lastCall('calculateCameraOptionsFromTo');
	if (!call) return null;
	const [from, fromAlt, to, toAlt] = call.args as [
		{ lng: number; lat: number },
		number,
		{ lng: number; lat: number },
		number
	];
	return { from, camAlt: fromAlt, to, targetAlt: toAlt };
}

beforeEach(() => {
	rigs = [];
});

afterEach(() => {
	for (const rig of rigs) rig.controller.detach();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe('applyFraming', () => {
	it('jumps the map to a camera behind the marker', () => {
		const { m, controller } = makeRig();
		controller.applyFraming();
		expect(m.callsTo('jumpTo')).toHaveLength(1);

		const pose = lastPose(m)!;
		// The shot looks along meanAz (280°, WNW toward the setting Sun), so the camera sits at the
		// opposite bearing — east of the marker — and the view centre lies further west, beyond it.
		expect(pose.from.lng).toBeGreaterThan(OVIEDO.lon);
		expect(pose.to.lng).toBeLessThan(OVIEDO.lon);
		expect(pose.camAlt).toBeGreaterThan(0);
		// Aiming below the horizon, the view centre is lower than the camera. Only the DIRECTION of that
		// centre is part of the shot — its distance just sets MapLibre's zoom, and so the tile LOD.
		expect(pose.targetAlt).toBeLessThan(pose.camAlt);
	});

	it('aims above the horizon when the Sun is too high to look down at', () => {
		// The New York case: a 64° Sun. The camera drops to eye level and the view centre lifts into the
		// sky — a MapLibre pitch past 90°, which is the only pose that can hold a Sun that high.
		const { m, controller } = makeRig({ framing: { aimEl: 33.7, camDep: 1.5 } });
		controller.applyFraming();
		const pose = lastPose(m)!;
		expect(pose.targetAlt).toBeGreaterThan(pose.camAlt); // the centre is up in the sky, not on the ground
	});

	it('backs the camera off far enough to clear the rooftops', () => {
		// camDep alone fixes the ratio of height to setback, so a nearly flat angle at the default 200 m
		// would leave the camera a few metres up — inside the nearest building. The rig is scale-invariant,
		// so the fix is distance: the angles, and with them the framing, are untouched.
		const flat = makeRig({ framing: { aimEl: 33.7, camDep: 1.5 } });
		const drone = makeRig({ framing: { aimEl: -9, camDep: 30 } });
		flat.controller.applyFraming();
		drone.controller.applyFraming();
		const setback = (rig: Rig) => {
			const { from } = lastPose(rig.m)!;
			return Math.hypot((from.lng - OVIEDO.lon) * Math.cos((OVIEDO.lat * Math.PI) / 180), from.lat - OVIEDO.lat);
		};
		expect(lastPose(flat.m)!.camAlt).toBeCloseTo(100, 6); // the clearance, exactly
		expect(setback(flat)).toBeGreaterThan(4 * setback(drone));
		// The drone shot is untouched: at 30° the default 200 m already clears everything.
		expect(lastPose(drone.m)!.camAlt).toBeCloseTo(200 * Math.tan((30 * Math.PI) / 180), 6);
	});

	it('reads the ground elevation under the marker', () => {
		const { m, controller } = makeRig();
		controller.applyFraming();
		expect(m.callsTo('queryTerrainElevation')[0].args[0]).toEqual([OVIEDO.lon, OVIEDO.lat]);
	});

	it('references the camera altitude to the ground, not to sea level', () => {
		const flat = makeRig({ terrainElevation: 0 });
		const alpine = makeRig({ terrainElevation: 1500 });
		flat.controller.applyFraming();
		alpine.controller.applyFraming();
		expect(lastPose(alpine.m)!.camAlt - lastPose(flat.m)!.camAlt).toBeCloseTo(1500, 6);
	});

	it('treats missing terrain as sea level', () => {
		const { m, controller } = makeRig({ terrainElevation: null });
		controller.applyFraming();
		expect(Number.isFinite(lastPose(m)!.camAlt)).toBe(true);
	});

	it('keeps the view centre finite at every aim, including dead level', () => {
		// aimEl = 0 is the singular case: the aim never meets the ground, so the ground-distance ratio is
		// infinite and only the FOCUS clamp keeps the view centre a real point.
		for (const aimEl of [-40, -9, -0.001, 0, 0.001, 20, 60]) {
			const { m, controller } = makeRig({ framing: { aimEl } });
			controller.applyFraming();
			const pose = lastPose(m)!;
			expect(Number.isFinite(pose.to.lat) && Number.isFinite(pose.to.lng), `aim ${aimEl}`).toBe(true);
			expect(Number.isFinite(pose.targetAlt), `aim ${aimEl}`).toBe(true);
			expect(pose.camAlt, `aim ${aimEl}`).toBeGreaterThan(0);
		}
	});
});

describe('orbit', () => {
	it('turns the camera when the canvas is dragged', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const start = lastPose(m)!.from;

		m.canvas.emit('mousedown', { clientX: 100 });
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }));

		// The camera moves on the next frame, not in the event handler: a pointer reports faster than the
		// display paints, and every move is a `jumpTo` that makes MapLibre re-derive its tile coverage.
		expect(raf.pending()).toBe(1);
		expect(lastPose(m)!.from.lng, 'moved inside the event handler').toBeCloseTo(start.lng, 6);
		raf.flush();

		const after = lastPose(m)!.from;
		expect(after.lng).not.toBeCloseTo(start.lng, 6);
	});

	it('collapses a burst of pointer events into one camera move', () => {
		// The whole point of the deferral: three moves inside one frame must cost one jumpTo, not three.
		const burst = makeRig();
		burst.controller.applyFraming();
		burst.m.canvas.emit('mousedown', { clientX: 100 });
		burst.m.reset();

		for (const x of [150, 200, 250]) window.dispatchEvent(new MouseEvent('mousemove', { clientX: x }));
		expect(burst.raf.pending()).toBe(1);
		burst.raf.flush();
		expect(burst.m.callsTo('jumpTo')).toHaveLength(1);
		const viaBurst = lastPose(burst.m)!.from.lng;
		burst.controller.detach(); // stop it hearing the second rig's events

		// ...and it lands exactly where the LAST event pointed, so no pointer movement is dropped —
		// coalescing must not turn into lagging behind the finger.
		const single = makeRig();
		single.controller.applyFraming();
		single.m.canvas.emit('mousedown', { clientX: 100 });
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 250 }));
		single.raf.flush();
		expect(viaBurst).toBeCloseTo(lastPose(single.m)!.from.lng, 9);
	});

	it('does nothing while no drag is in progress', () => {
		const { m, controller } = makeRig();
		controller.applyFraming();
		m.reset();
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
		expect(m.callsTo('jumpTo')).toHaveLength(0);
	});

	it('stops orbiting after mouseup', () => {
		const { m, controller } = makeRig();
		controller.applyFraming();
		m.canvas.emit('mousedown', { clientX: 100 });
		window.dispatchEvent(new MouseEvent('mouseup'));
		m.reset();
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 300 }));
		expect(m.callsTo('jumpTo')).toHaveLength(0);
	});

	it('shows a grab cursor, and a grabbing one mid-drag', () => {
		const { m } = makeRig();
		expect(m.canvas.style.cursor).toBe('grab');
		m.canvas.emit('mousedown', { clientX: 10 });
		expect(m.canvas.style.cursor).toBe('grabbing');
		window.dispatchEvent(new MouseEvent('mouseup'));
		expect(m.canvas.style.cursor).toBe('grab');
	});

	it('keeps the camera altitude constant right around the orbit', () => {
		// The documented "never bobs" property: only the bearing changes as you orbit, so the camera
		// height stays put even over mountainous ground.
		const { m, controller, raf } = makeRig({ terrainElevation: 900 });
		controller.applyFraming();
		const alt0 = lastPose(m)!.camAlt;

		m.canvas.emit('mousedown', { clientX: 0 });
		const alts: number[] = [];
		for (let x = 100; x <= 1200; x += 100) {
			window.dispatchEvent(new MouseEvent('mousemove', { clientX: x }));
			raf.flush(); // the move lands next frame — without this every sample is the same stale pose
			alts.push(lastPose(m)!.camAlt);
		}
		window.dispatchEvent(new MouseEvent('mouseup'));

		for (const alt of alts) expect(alt).toBeCloseTo(alt0, 6);
	});

	it('keeps the camera at a constant distance from the marker while orbiting', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const dist = () => {
			const { from } = lastPose(m)!;
			return Math.hypot((from.lng - OVIEDO.lon) * Math.cos((OVIEDO.lat * Math.PI) / 180), from.lat - OVIEDO.lat);
		};
		const d0 = dist();
		m.canvas.emit('mousedown', { clientX: 0 });
		for (const x of [200, 600, 1000]) {
			window.dispatchEvent(new MouseEvent('mousemove', { clientX: x }));
			raf.flush();
			expect(dist()).toBeCloseTo(d0, 6);
		}
		window.dispatchEvent(new MouseEvent('mouseup'));
	});
});

describe('zoom', () => {
	/** Ground distance (deg) from the marker to the camera — the dolly distance in disguise. */
	const camDistance = (m: FakeMap) => {
		const { from } = lastPose(m)!;
		return Math.hypot((from.lng - OVIEDO.lon) * Math.cos((OVIEDO.lat * Math.PI) / 180), from.lat - OVIEDO.lat);
	};

	it('eases the wheel toward its target instead of jumping', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const before = camDistance(m);

		m.canvas.emit('wheel', { deltaY: -200, deltaMode: 0 });
		expect(raf.pending()).toBe(1); // queued, not applied instantly
		raf.flush();
		const afterOne = camDistance(m);
		expect(afterOne).toBeLessThan(before); // scroll up → closer
		raf.flush(20);
		expect(camDistance(m)).toBeLessThan(afterOne); // and it keeps gliding
	});

	it('interprets line- and page-mode wheel deltas', () => {
		for (const deltaMode of [0, 1, 2]) {
			const { m, controller, raf } = makeRig();
			controller.applyFraming();
			const before = camDistance(m);
			m.canvas.emit('wheel', { deltaY: 10, deltaMode });
			raf.flush(40);
			expect(camDistance(m), `deltaMode ${deltaMode}`).toBeGreaterThan(before);
		}
	});

	it('clamps the dolly to its 50..1000 m range', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const start = camDistance(m);

		for (let i = 0; i < 60; i++) m.canvas.emit('wheel', { deltaY: -400, deltaMode: 0 });
		raf.flush(80);
		const nearest = camDistance(m);

		for (let i = 0; i < 120; i++) m.canvas.emit('wheel', { deltaY: 400, deltaMode: 0 });
		raf.flush(120);
		const farthest = camDistance(m);

		// default is 200 m, so the range is 0.25× to 5× the starting distance
		expect(nearest / start).toBeCloseTo(0.25, 2);
		expect(farthest / start).toBeCloseTo(5, 2);
	});

	it('zooms in on double-click and out with shift', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const before = camDistance(m);

		m.canvas.emit('dblclick', { shiftKey: false });
		raf.flush(40);
		const closer = camDistance(m);
		expect(closer).toBeLessThan(before);

		m.canvas.emit('dblclick', { shiftKey: true });
		raf.flush(40);
		expect(camDistance(m)).toBeGreaterThan(closer);
	});

	it('pinches directly, without easing', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const before = camDistance(m);

		const touch = (x: number, y: number) => ({ clientX: x, clientY: y });
		m.canvas.emit('touchstart', { touches: [touch(0, 0), touch(100, 0)] });
		m.canvas.emit('touchmove', { touches: [touch(0, 0), touch(200, 0)] });
		raf.flush();

		// fingers apart → closer: no easing, just deferred to the frame that can show it
		expect(camDistance(m)).toBeLessThan(before);
	});

	it('cancels an in-flight eased zoom when a pinch starts', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		m.canvas.emit('wheel', { deltaY: -300, deltaMode: 0 });
		expect(raf.pending()).toBe(1);
		m.canvas.emit('touchstart', {
			touches: [
				{ clientX: 0, clientY: 0 },
				{ clientX: 80, clientY: 0 }
			]
		});
		expect(raf.cancel).toHaveBeenCalled();
	});

	it('orbits with a single finger', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const start = lastPose(m)!.from.lng;
		m.canvas.emit('touchstart', { touches: [{ clientX: 100, clientY: 0 }] });
		m.canvas.emit('touchmove', { touches: [{ clientX: 220, clientY: 0 }] });
		raf.flush();
		expect(lastPose(m)!.from.lng).not.toBeCloseTo(start, 6);
	});

	it('ends the drag when the last finger lifts', () => {
		const { m, controller } = makeRig();
		controller.applyFraming();
		m.canvas.emit('touchstart', { touches: [{ clientX: 100, clientY: 0 }] });
		m.canvas.emit('touchend', { touches: [] });
		expect(m.canvas.style.cursor).toBe('grab');
	});
});

describe('controls', () => {
	it('adds only the reset control — zooming is gesture-only', () => {
		// The dolly keeps three direct inputs (wheel, pinch, double-click); +/- buttons were the least
		// discoverable of the four and cost the most chrome. Reset stays: it is the only way BACK.
		const { m, controller } = makeRig();
		controller.addControls();
		expect(m.callsTo('addControl')).toHaveLength(1);
		expect(m.callsTo('addControl')[0].args[1]).toBe('top-right');
		const group = (m.controls[0].control as { onAdd: () => HTMLElement }).onAdd();
		expect(group.querySelector('.maplibregl-ctrl-zoom-in')).toBeNull();
	});

	it('restores the initial pose from the reset button', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		const initial = lastPose(m)!;

		m.canvas.emit('mousedown', { clientX: 0 });
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500 }));
		window.dispatchEvent(new MouseEvent('mouseup'));
		m.canvas.emit('wheel', { deltaY: -300, deltaMode: 0 });
		raf.flush(40);
		expect(lastPose(m)!.from.lng).not.toBeCloseTo(initial.from.lng, 6);

		controller.addControls();
		const resetGroup = (m.controls[0].control as { onAdd: () => HTMLElement }).onAdd();
		resetGroup.querySelector('button')!.click();

		const reset = lastPose(m)!;
		expect(reset.from.lng).toBeCloseTo(initial.from.lng, 9);
		expect(reset.from.lat).toBeCloseTo(initial.from.lat, 9);
		expect(reset.camAlt).toBeCloseTo(initial.camAlt, 9);
	});

	it('labels the reset button', () => {
		const { m, controller } = makeRig();
		controller.addControls();
		const resetGroup = (m.controls[0].control as { onAdd: () => HTMLElement }).onAdd();
		expect(resetGroup.querySelector('button')!.getAttribute('aria-label')).toBe('b3.recenter');
	});
});

describe('detach', () => {
	it('removes the window listeners it added', () => {
		// These are on `window`, not the canvas, so they outlive the map unless detach runs.
		const add = vi.spyOn(window, 'addEventListener');
		const remove = vi.spyOn(window, 'removeEventListener');
		const { controller } = makeRig();

		const added = add.mock.calls.map((c) => c[0]);
		controller.detach();
		const removed = remove.mock.calls.map((c) => c[0]);

		expect(added).toEqual(['mousemove', 'mouseup']);
		expect(removed).toEqual(expect.arrayContaining(added));
	});

	it('stops responding to window events afterwards', () => {
		const { m, controller } = makeRig();
		controller.applyFraming();
		m.canvas.emit('mousedown', { clientX: 100 });
		controller.detach();
		m.reset();
		window.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 }));
		expect(m.callsTo('jumpTo')).toHaveLength(0);
	});

	it('cancels a pending zoom animation', () => {
		const { m, controller, raf } = makeRig();
		controller.applyFraming();
		m.canvas.emit('wheel', { deltaY: -300, deltaMode: 0 });
		expect(raf.pending()).toBe(1);
		controller.detach();
		expect(raf.cancel).toHaveBeenCalled();
	});
});
