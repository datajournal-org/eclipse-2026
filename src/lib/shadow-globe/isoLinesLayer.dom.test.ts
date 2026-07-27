import { describe, it, expect, beforeEach } from 'vitest';
import type { CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import {
	createIsoLinesLayer,
	linePrimitiveFromSegments,
	fillStripPrimitive,
	type IsoLinesState
} from './isoLinesLayer';
import { createFakeGl, createFakeMap, fakeRenderInput, type FakeGl, type FakeMap } from '$lib/testing/fakes';

const input = fakeRenderInput as unknown as CustomRenderMethodInput;

const ring = () =>
	linePrimitiveFromSegments(
		[
			[
				[0, 0],
				[10, 10],
				[20, 0]
			]
		],
		[1, 0.5, 0],
		0.4
	);
const band = () =>
	fillStripPrimitive(
		[
			[0, 10],
			[10, 10]
		],
		[
			[0, 0],
			[10, 0]
		],
		[0, 0.5, 1],
		0.2
	);

const readyState = (): IsoLinesState => ({ lines: [ring()], version: 1, ready: true, visible: true });

let gl: FakeGl;
let map: FakeMap;

const add = (state: IsoLinesState) => {
	const layer = createIsoLinesLayer(state);
	layer.onAdd!(map as unknown as MlMap, gl);
	return layer;
};

beforeEach(() => {
	gl = createFakeGl();
	map = createFakeMap();
});

describe('layer contract', () => {
	it('declares itself as a 2D custom layer', () => {
		const layer = createIsoLinesLayer(readyState());
		expect(layer.id).toBe('iso-lines');
		expect(layer.type).toBe('custom');
		expect(layer.renderingMode).toBe('2d');
	});

	it('creates its vertex buffer on add', () => {
		add(readyState());
		expect(gl.callsTo('createBuffer')).toHaveLength(1);
	});
});

describe('render gating', () => {
	it('draws nothing before the state is ready', () => {
		const layer = add({ ...readyState(), ready: false });
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(0);
	});

	it('draws nothing while the overlay is hidden', () => {
		// The eye toggle hides the overlay without tearing the layer down.
		const layer = add({ ...readyState(), visible: false });
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(0);
	});

	it('draws nothing when there are no lines', () => {
		const layer = add({ ...readyState(), lines: [] });
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(0);
	});

	it('resumes drawing when the overlay is switched back on', () => {
		const state = { ...readyState(), visible: false };
		const layer = add(state);
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(0);

		state.visible = true;
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(1);
	});
});

describe('render', () => {
	it('compiles once per projection variant', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		layer.render(gl, input);
		expect(gl.callsTo('linkProgram')).toHaveLength(1);

		layer.render(gl, {
			...input,
			shaderData: { ...fakeRenderInput.shaderData, variantName: 'mercator' }
		} as unknown as CustomRenderMethodInput);
		expect(gl.callsTo('linkProgram')).toHaveLength(2);
	});

	it('sets MapLibre’s projection uniforms', () => {
		const layer = add(readyState());
		layer.render(gl, input);
		expect(gl.uniformNames()).toEqual(
			expect.arrayContaining([
				'u_projection_matrix',
				'u_projection_tile_mercator_coords',
				'u_projection_clipping_plane',
				'u_projection_transition',
				'u_projection_fallback_matrix',
				'u_color'
			])
		);
	});

	it('uploads the vertex data on the first frame', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		const upload = gl.callsTo('bufferData');
		expect(upload).toHaveLength(1);
		expect(upload[0].args[2]).toBe(gl.DYNAMIC_DRAW);
		expect((upload[0].args[1] as Float32Array).length).toBe(ring().positions.length);
	});

	it('re-uploads only when the version changes', () => {
		// The rings are rebuilt every frame; without this guard the whole buffer would be re-sent 30×/s.
		const state = readyState();
		const layer = add(state);
		layer.render(gl, input);
		layer.render(gl, input);
		expect(gl.callsTo('bufferData')).toHaveLength(1);

		state.lines = [ring(), band()];
		state.version = 2;
		layer.render(gl, input);
		expect(gl.callsTo('bufferData')).toHaveLength(2);
	});

	it('packs several primitives into one buffer with offset draw ranges', () => {
		const a = ring();
		const b = band();
		const layer = add({ lines: [a, b], version: 1, ready: true, visible: true });
		gl.reset();
		layer.render(gl, input);

		expect((gl.callsTo('bufferData')[0].args[1] as Float32Array).length).toBe(
			a.positions.length + b.positions.length
		);
		// the second primitive's draw range starts after the first one's vertices
		const draws = gl.drawCalls();
		expect(draws).toHaveLength(2);
		expect(draws[0].args[1]).toBe(0);
		expect(draws[1].args[1]).toBe(a.positions.length / 2);
	});

	it('picks LINE_STRIP for lines and TRIANGLE_STRIP for bands', () => {
		const layer = add({ lines: [ring(), band()], version: 1, ready: true, visible: true });
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls().map((c) => c.args[0])).toEqual([gl.LINE_STRIP, gl.TRIANGLE_STRIP]);
	});

	it('sets each primitive’s colour and opacity before its draw', () => {
		const layer = add({ lines: [ring(), band()], version: 1, ready: true, visible: true });
		gl.reset();
		layer.render(gl, input);
		const colours = gl.uniformWrites().filter((w) => w.uniform === 'u_color');
		expect(colours.map((c) => c.value)).toEqual([
			[1, 0.5, 0, 0.4],
			[0, 0.5, 1, 0.2]
		]);
	});

	it('emits one draw call per segment', () => {
		const twoSegments = linePrimitiveFromSegments(
			[
				[
					[0, 0],
					[10, 0]
				],
				[
					[20, 0],
					[30, 0],
					[40, 0]
				]
			],
			[1, 1, 1],
			1
		);
		const layer = add({ lines: [twoSegments], version: 1, ready: true, visible: true });
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls().map((c) => c.args.slice(1))).toEqual([
			[0, 2],
			[2, 3]
		]);
	});

	it('blends without depth testing', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('enable').map((c) => c.args[0])).toContain(gl.BLEND);
		expect(gl.callsTo('disable').map((c) => c.args[0])).toContain(gl.DEPTH_TEST);
	});

	it('binds the attribute as a vec2 of floats', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('vertexAttribPointer')[0].args.slice(1, 4)).toEqual([2, gl.FLOAT, false]);
	});
});
