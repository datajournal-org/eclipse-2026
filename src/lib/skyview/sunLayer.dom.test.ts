import { describe, it, expect, beforeEach } from 'vitest';
import type { CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { createSunLayer, projectDir, type SunState } from './sunLayer';
import { createFakeGl, createFakeMap, fakeRenderInput, type FakeGl, type FakeMap } from '$lib/testing/fakes';

const YELLOW: [number, number, number] = [1, 0.93, 0.72];

// Pointed straight up from the fake camera at (0.5, 0.4, 0): with SKY_OFFSET_MERC = 0.001 the disc's
// world centre lands on (0.5, 0.4, 0.001), which the identity matrix maps to NDC (0.5, 0.4).
const visibleSun = (): SunState => ({
	dir: [0, 0, 1],
	moon: [0.2, -0.1],
	moonR: 1.03,
	angRad: 0.00459,
	visible: true,
	screen: null
});

/** Where the camera-anchored disc must sit: fake camera + dir x offset. */
const expectedCentre = (sun: SunState) => [
	0.5 + sun.dir[0] * 0.001,
	0.4 + sun.dir[1] * 0.001,
	0 + sun.dir[2] * 0.001,
	1
];

/** An identity-ish projection matrix, column-major, so the screen projection has real numbers to chew on. */
const identityInput = (): CustomRenderMethodInput =>
	({
		...fakeRenderInput,
		defaultProjectionData: {
			...fakeRenderInput.defaultProjectionData,
			mainMatrix: new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
		}
	}) as unknown as CustomRenderMethodInput;

let gl: FakeGl;
let map: FakeMap;

const add = (sun: SunState) => {
	const layer = createSunLayer(sun, YELLOW);
	layer.onAdd!(map as unknown as MlMap, gl);
	return layer;
};

beforeEach(() => {
	gl = createFakeGl();
	map = createFakeMap();
});

describe('projectDir', () => {
	// The shared projection behind the Sun locator, the compass labels and the planet labels. Fake
	// camera at (0.5, 0.4, 0), identity matrix: a zenith direction lands the point at (0.5, 0.4, 0.001)
	// → NDC (0.5, 0.4) → CSS (600, 180) on the fake's 800×600 canvas.
	const IDENTITY = new Float64Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

	it('projects a camera-anchored direction to CSS pixels', () => {
		const m = createFakeMap();
		expect(projectDir(m as never, IDENTITY, [0, 0, 1])).toEqual([600, 180]);
	});

	it('returns null behind the camera, where a screen point would lie', () => {
		const m = createFakeMap();
		const behind = Float64Array.from(IDENTITY);
		behind[15] = -1; // w flips negative
		expect(projectDir(m as never, behind, [0, 0, 1])).toBeNull();
	});
});

describe('layer contract', () => {
	it('declares itself as a 3D custom layer', () => {
		const layer = createSunLayer(visibleSun(), YELLOW);
		expect(layer.id).toBe('sun');
		expect(layer.type).toBe('custom');
		expect(layer.renderingMode).toBe('3d');
	});
});

describe('onAdd', () => {
	it('compiles both shaders and links a program', () => {
		add(visibleSun());
		expect(gl.callsTo('createShader')).toHaveLength(2);
		expect(gl.callsTo('compileShader')).toHaveLength(2);
		expect(gl.callsTo('linkProgram')).toHaveLength(1);
		expect(gl.callsTo('createShader').map((c) => c.args[0])).toEqual([gl.VERTEX_SHADER, gl.FRAGMENT_SHADER]);
	});

	it('looks up every uniform the shaders declare', () => {
		add(visibleSun());
		expect(gl.uniformNames().sort()).toEqual(['u_center', 'u_matrix', 'u_moon', 'u_moonR', 'u_pix', 'u_sun']);
	});

	it('uploads the billboard quad once', () => {
		add(visibleSun());
		const upload = gl.callsTo('bufferData');
		expect(upload).toHaveLength(1);
		expect([...(upload[0].args[1] as Float32Array)]).toEqual([-1, -1, 1, -1, -1, 1, 1, 1]);
		expect(upload[0].args[2]).toBe(gl.STATIC_DRAW);
	});

	it('throws with the shader log when compilation fails', () => {
		// Silent shader failure is the difference between "no Sun" and "no Sun and no idea why".
		const badGl = createFakeGl();
		badGl.getShaderParameter = (() => false) as unknown as typeof badGl.getShaderParameter;
		badGl.getShaderInfoLog = (() => 'ERROR: undeclared identifier') as unknown as typeof badGl.getShaderInfoLog;
		const layer = createSunLayer(visibleSun(), YELLOW);
		expect(() => layer.onAdd!(map as unknown as MlMap, badGl)).toThrow(/undeclared identifier/);
	});

	it('throws when linking fails', () => {
		const badGl = createFakeGl();
		badGl.getProgramParameter = (() => false) as unknown as typeof badGl.getProgramParameter;
		badGl.getProgramInfoLog = (() => 'link failed') as unknown as typeof badGl.getProgramInfoLog;
		const layer = createSunLayer(visibleSun(), YELLOW);
		expect(() => layer.onAdd!(map as unknown as MlMap, badGl)).toThrow(/link failed/);
	});
});

describe('render', () => {
	it('draws nothing while the Sun is below the horizon', () => {
		const sun = visibleSun();
		sun.visible = false;
		const layer = add(sun);
		gl.reset();
		layer.render(gl, identityInput());
		expect(gl.drawCalls()).toHaveLength(0);
	});

	it('draws the billboard as a four-vertex triangle strip', () => {
		const layer = add(visibleSun());
		gl.reset();
		layer.render(gl, identityInput());
		expect(gl.drawCalls()).toHaveLength(1);
		expect(gl.drawCalls()[0].args).toEqual([gl.TRIANGLE_STRIP, 0, 4]);
	});

	it('feeds the current state into the uniforms', () => {
		const sun = visibleSun();
		const layer = add(sun);
		gl.reset();
		layer.render(gl, identityInput());

		const writes = gl.uniformWrites();
		expect(writes.find((w) => w.uniform === 'u_center')!.value[0]).toEqual(expectedCentre(sun));
		expect(writes.find((w) => w.uniform === 'u_moon')!.value).toEqual([sun.moon[0], sun.moon[1]]);
		expect(writes.find((w) => w.uniform === 'u_moonR')!.value).toEqual([sun.moonR]);
		expect(writes.find((w) => w.uniform === 'u_sun')!.value).toEqual([...YELLOW]);
	});

	it('re-reads the shared state on every frame', () => {
		// The component mutates this object rather than rebuilding the layer, so a cached copy would
		// freeze the crescent.
		const sun = visibleSun();
		const layer = add(sun);
		layer.render(gl, identityInput());

		sun.moon = [-0.4, 0.3];
		sun.moonR = 1.06;
		gl.reset();
		layer.render(gl, identityInput());

		const writes = gl.uniformWrites();
		expect(writes.find((w) => w.uniform === 'u_moon')!.value).toEqual([-0.4, 0.3]);
		expect(writes.find((w) => w.uniform === 'u_moonR')!.value).toEqual([1.06]);
	});

	it('sizes the disc from the angular radius and the vertical FOV', () => {
		// Real angular size: half-extent = tan(angRad) / tan(fov/2), with x corrected for aspect so the
		// disc stays round.
		const sun = visibleSun();
		const layer = add(sun);
		gl.reset();
		layer.render(gl, identityInput());

		const [ux, uy] = gl.uniformWrites().find((w) => w.uniform === 'u_pix')!.value as [number, number];
		const expectedY = Math.tan(sun.angRad) / Math.tan((60 * Math.PI) / 180 / 2);
		expect(uy).toBeCloseTo(expectedY, 12);
		expect(ux).toBeCloseTo((expectedY * gl.drawingBufferHeight) / gl.drawingBufferWidth, 12);
		expect(ux).toBeLessThan(uy); // a landscape buffer needs a narrower x half-extent
	});

	it('scales the disc with the FOV', () => {
		const layer = add(visibleSun());
		gl.reset();
		layer.render(gl, identityInput());
		const wide = (gl.uniformWrites().find((w) => w.uniform === 'u_pix')!.value as number[])[1];

		map.getVerticalFieldOfView = (() => 30) as unknown as typeof map.getVerticalFieldOfView;
		gl.reset();
		layer.render(gl, identityInput());
		const narrow = (gl.uniformWrites().find((w) => w.uniform === 'u_pix')!.value as number[])[1];

		expect(narrow).toBeGreaterThan(wide); // a narrower FOV makes the Sun fill more of the frame
	});

	it('projects the Sun to CSS pixels for the DOM locator', () => {
		const sun = visibleSun();
		const layer = add(sun);
		layer.render(gl, identityInput());

		expect(sun.screen).not.toBeNull();
		const [x, y] = sun.screen!;
		// centre (0.5, 0.4) in NDC → right of and above the middle of an 800×600 canvas
		expect(x).toBeCloseTo((0.5 * 0.5 + 0.5) * 800, 6);
		expect(y).toBeCloseTo((0.5 - 0.4 * 0.5) * 600, 6);
	});

	it('clears the screen position when the Sun is behind the camera', () => {
		// w <= 0 means the point is behind the eye; drawing a leader line to it would point off-screen.
		const sun = visibleSun();
		const layer = add(sun);
		const behind = identityInput();
		(behind.defaultProjectionData.mainMatrix as unknown as Float64Array)[15] = -1;
		layer.render(gl, behind);
		expect(sun.screen).toBeNull();
	});

	it('draws on top with blending and no depth test', () => {
		// Documented decision: terrain occlusion is ignored because the observer's height is unknown.
		const layer = add(visibleSun());
		gl.reset();
		layer.render(gl, identityInput());
		expect(gl.callsTo('disable').map((c) => c.args[0])).toContain(gl.DEPTH_TEST);
		expect(gl.callsTo('enable').map((c) => c.args[0])).toContain(gl.BLEND);
		expect(gl.callsTo('blendFunc')[0].args).toEqual([gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA]);
	});

	it('binds the quad and its attribute before drawing', () => {
		const layer = add(visibleSun());
		gl.reset();
		layer.render(gl, identityInput());
		const order = gl.calls.map((c) => c.name);
		expect(order.indexOf('bindBuffer')).toBeLessThan(order.indexOf('vertexAttribPointer'));
		expect(order.indexOf('vertexAttribPointer')).toBeLessThan(order.indexOf('drawArrays'));
		expect(gl.callsTo('vertexAttribPointer')[0].args.slice(1, 3)).toEqual([2, gl.FLOAT]);
	});
});
