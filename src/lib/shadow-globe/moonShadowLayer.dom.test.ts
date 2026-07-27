import { describe, it, expect, beforeEach } from 'vitest';
import type { CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { createMoonShadowLayer, type ShadowState } from './moonShadowLayer';
import { computeShadowModel, PROFILE_SIZE } from './shadowProfile';
import { sunMoonECEF } from '$lib/eclipse';
import { GREATEST } from '$lib/testing/reference';
import { createFakeGl, createFakeMap, fakeRenderInput, type FakeGl, type FakeMap } from '$lib/testing/fakes';

const model = computeShadowModel(sunMoonECEF(new Date(GREATEST.utc)));

const readyState = (): ShadowState => ({
	ready: true,
	sunDir: model.sunDir,
	center: model.center,
	axis: model.axis,
	rMax: model.rMax,
	profile: model.coverage,
	profileVersion: 1
});

const input = fakeRenderInput as unknown as CustomRenderMethodInput;

let gl: FakeGl;
let map: FakeMap;

const add = (state: ShadowState) => {
	const layer = createMoonShadowLayer(state);
	layer.onAdd!(map as unknown as MlMap, gl);
	return layer;
};

beforeEach(() => {
	gl = createFakeGl();
	map = createFakeMap();
});

describe('layer contract', () => {
	it('declares itself as a 2D custom layer', () => {
		const layer = createMoonShadowLayer(readyState());
		expect(layer.id).toBe('moon-shadow');
		expect(layer.type).toBe('custom');
		expect(layer.renderingMode).toBe('2d');
	});
});

describe('onAdd', () => {
	it('uploads the globe mesh: positions, pole flags and indices', () => {
		add(readyState());
		const buffers = gl.callsTo('bufferData');
		expect(buffers).toHaveLength(3);
		expect(buffers[0].args[1]).toBeInstanceOf(Float32Array);
		expect(buffers[1].args[1]).toBeInstanceOf(Float32Array);
		expect(buffers[2].args[1]).toBeInstanceOf(Uint32Array);
		expect((buffers[2].args[1] as Uint32Array).length).toBeGreaterThan(0);
	});

	it('creates a linear-filtered, clamped LUT texture', () => {
		// LINEAR is what keeps the penumbra gradient smooth instead of stepping.
		add(readyState());
		expect(gl.callsTo('createTexture')).toHaveLength(1);
		const params = gl.callsTo('texParameteri').map((c) => [c.args[1], c.args[2]]);
		expect(params).toEqual([
			[gl.TEXTURE_MIN_FILTER, gl.LINEAR],
			[gl.TEXTURE_MAG_FILTER, gl.LINEAR],
			[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
			[gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]
		]);
	});

	it('does not compile a program until the first render', () => {
		// The program depends on the projection variant, which only arrives with the render input.
		add(readyState());
		expect(gl.callsTo('linkProgram')).toHaveLength(0);
	});
});

describe('render', () => {
	it('draws nothing until the state is ready', () => {
		const state = readyState();
		state.ready = false;
		const layer = add(state);
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(0);
	});

	it('compiles the program on first render and caches it per projection variant', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('linkProgram')).toHaveLength(1);

		layer.render(gl, input);
		expect(gl.callsTo('linkProgram')).toHaveLength(1); // cached

		// A different projection (globe ↔ mercator) needs its own program.
		layer.render(gl, {
			...input,
			shaderData: { ...fakeRenderInput.shaderData, variantName: 'mercator' }
		} as unknown as CustomRenderMethodInput);
		expect(gl.callsTo('linkProgram')).toHaveLength(2);
	});

	it('looks up MapLibre’s projection uniforms and the shadow uniforms', () => {
		const layer = add(readyState());
		layer.render(gl, input);
		expect(gl.uniformNames()).toEqual(
			expect.arrayContaining([
				'u_projection_matrix',
				'u_projection_tile_mercator_coords',
				'u_projection_clipping_plane',
				'u_projection_transition',
				'u_projection_fallback_matrix',
				'u_sunDir',
				'u_center',
				'u_axis',
				'u_rMax',
				'u_profile'
			])
		);
	});

	it('feeds the shadow axis into the uniforms', () => {
		const state = readyState();
		const layer = add(state);
		gl.reset();
		layer.render(gl, input);

		const writes = gl.uniformWrites();
		expect(writes.find((w) => w.uniform === 'u_sunDir')!.value[0]).toEqual(state.sunDir);
		expect(writes.find((w) => w.uniform === 'u_center')!.value[0]).toEqual(state.center);
		expect(writes.find((w) => w.uniform === 'u_axis')!.value[0]).toEqual(state.axis);
		expect(writes.find((w) => w.uniform === 'u_rMax')!.value).toEqual([state.rMax]);
		expect(writes.find((w) => w.uniform === 'u_profile')!.value).toEqual([0]); // texture unit 0
	});

	it('uploads the coverage profile as a single-channel float texture', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);

		const upload = gl.callsTo('texImage2D');
		expect(upload).toHaveLength(1);
		const [, , internalFormat, width, height, , format, type, data] = upload[0].args;
		expect(internalFormat).toBe(gl.R16F);
		expect(width).toBe(PROFILE_SIZE);
		expect(height).toBe(1);
		expect(format).toBe(gl.RED);
		expect(type).toBe(gl.FLOAT);
		expect(data).toBe(readyState().profile === null ? null : (data as Float32Array));
		expect((data as Float32Array).length).toBe(PROFILE_SIZE);
	});

	it('re-uploads the profile only when its version changes', () => {
		// The version guard is a real performance contract: the LUT is 512 floats per frame otherwise.
		const state = readyState();
		const layer = add(state);

		layer.render(gl, input);
		expect(gl.callsTo('texImage2D')).toHaveLength(1);

		layer.render(gl, input);
		layer.render(gl, input);
		expect(gl.callsTo('texImage2D')).toHaveLength(1); // unchanged version → no re-upload

		state.profileVersion = 2;
		layer.render(gl, input);
		expect(gl.callsTo('texImage2D')).toHaveLength(2);
	});

	it('binds the LUT to texture unit 0 every frame', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('activeTexture')[0].args[0]).toBe(gl.TEXTURE0);
		expect(gl.callsTo('bindTexture').length).toBeGreaterThan(0);
	});

	it('draws the mesh as indexed triangles', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.drawCalls()).toHaveLength(1);
		const [mode, count, type, offset] = gl.drawCalls()[0].args;
		expect(mode).toBe(gl.TRIANGLES);
		expect(count).toBeGreaterThan(0);
		expect(type).toBe(gl.UNSIGNED_INT); // a 32-bit index buffer, so the mesh can exceed 65k vertices
		expect(offset).toBe(0);
	});

	it('culls the far hemisphere and leaves culling off afterwards', () => {
		// Leaving CULL_FACE enabled would corrupt every layer MapLibre draws after this one.
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('enable').map((c) => c.args[0])).toContain(gl.CULL_FACE);
		expect(gl.callsTo('cullFace')[0].args[0]).toBe(gl.BACK);
		expect(gl.callsTo('disable').map((c) => c.args[0])).toContain(gl.CULL_FACE);
		expect(gl.calls.at(-1)!.name).toBe('disable');
	});

	it('blends over the tiles without depth testing', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('enable').map((c) => c.args[0])).toContain(gl.BLEND);
		expect(gl.callsTo('blendFunc')[0].args).toEqual([gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA]);
		expect(gl.callsTo('disable').map((c) => c.args[0])).toContain(gl.DEPTH_TEST);
	});

	it('binds both vertex attributes and the index buffer', () => {
		const layer = add(readyState());
		gl.reset();
		layer.render(gl, input);
		expect(gl.callsTo('vertexAttribPointer')).toHaveLength(2);
		for (const call of gl.callsTo('vertexAttribPointer')) expect(call.args.slice(1, 3)).toEqual([2, gl.FLOAT]);
		expect(gl.callsTo('bindBuffer').map((c) => c.args[0])).toContain(gl.ELEMENT_ARRAY_BUFFER);
	});

	it('tolerates a state with no profile yet', () => {
		const state = readyState();
		state.profile = null;
		const layer = add(state);
		gl.reset();
		expect(() => layer.render(gl, input)).not.toThrow();
		expect(gl.callsTo('texImage2D')).toHaveLength(0);
	});

	it('follows the shadow as the state is mutated between frames', () => {
		const state = readyState();
		const layer = add(state);
		layer.render(gl, input);

		const later = computeShadowModel(sunMoonECEF(new Date(Date.parse(GREATEST.utc) + 1800_000)));
		state.center = later.center;
		state.axis = later.axis;
		state.sunDir = later.sunDir;
		gl.reset();
		layer.render(gl, input);

		expect(gl.uniformWrites().find((w) => w.uniform === 'u_axis')!.value[0]).toEqual(later.axis);
	});
});
