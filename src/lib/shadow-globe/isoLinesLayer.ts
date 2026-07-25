// A MapLibre custom layer that draws thin polylines and filled bands through MapLibre's own
// `projectTile`, so they render correctly at ANY latitude — over the poles included. GeoJSON can't:
// data is clamped to the ±85.05° Mercator tiling limit. `projectTile` also applies the globe's
// horizon clipping (it sets gl_Position.z), so a line crossing to the far side is cut cleanly.
//
// Lines are 1px (WebGL line width is effectively capped at 1px anyway — which is exactly our design).

import type { CustomLayerInterface, CustomRenderMethodInput } from 'maplibre-gl';
import { DEG_TO_RAD, RAD_TO_DEG } from '$lib/constants';

/** One coloured primitive; `positions` is interleaved web-mercator x,y. `mode` picks LINE_STRIP
 *  (thin line, the default) or TRIANGLE_STRIP (a filled band). */
export type LinePrimitive = {
	color: [number, number, number]; // rgb 0..1
	opacity: number;
	positions: Float32Array;
	segments: { first: number; count: number }[]; // vertex ranges within `positions`
	mode?: 'line' | 'fill';
};

/** Shared state: the component swaps in fresh lines each frame and bumps `version`. `visible` lets the
 *  UI hide the whole overlay (corridor + rings) without tearing the layer down. */
export type IsoLinesState = { lines: LinePrimitive[]; version: number; ready: boolean; visible: boolean };

/** Geodetic lon/lat (deg) → global web-mercator [0,1] (y leaves [0,1] beyond ±85°, which is fine —
 *  `projectTile`'s inverse handles it and places the vertex at the right latitude on the globe). */
export function lngLatToMercator(lon: number, lat: number): [number, number] {
	const x = (lon + 180) / 360;
	const clamped = Math.max(-89.9999, Math.min(89.9999, lat));
	const y = (180 - RAD_TO_DEG * Math.log(Math.tan(Math.PI / 4 + (clamped * DEG_TO_RAD) / 2))) / 360;
	return [x, y];
}

/** Build a LinePrimitive from GeoJSON MultiLineString coordinates (segments of [lon, lat]). */
export function linePrimitiveFromSegments(
	segments: number[][][],
	color: [number, number, number],
	opacity: number
): LinePrimitive {
	const flat: number[] = [];
	const ranges: { first: number; count: number }[] = [];
	let vertex = 0;
	for (const seg of segments) {
		if (seg.length < 2) continue;
		const first = vertex;
		for (const p of seg) {
			const [x, y] = lngLatToMercator(p[0], p[1]);
			flat.push(x, y);
			vertex++;
		}
		ranges.push({ first, count: seg.length });
	}
	return { color, opacity, positions: new Float32Array(flat), segments: ranges };
}

/** Build a filled band (TRIANGLE_STRIP) between two equal-length edge polylines (each of [lon, lat]). */
export function fillStripPrimitive(
	edgeA: number[][],
	edgeB: number[][],
	color: [number, number, number],
	opacity: number
): LinePrimitive {
	const n = Math.min(edgeA.length, edgeB.length);
	const flat: number[] = [];
	for (let i = 0; i < n; i++) {
		const [ax, ay] = lngLatToMercator(edgeA[i][0], edgeA[i][1]);
		const [bx, by] = lngLatToMercator(edgeB[i][0], edgeB[i][1]);
		flat.push(ax, ay, bx, by); // A,B,A,B… → a strip of quads between the two edges
	}
	return { color, opacity, mode: 'fill', positions: new Float32Array(flat), segments: [{ first: 0, count: 2 * n }] };
}

type ShaderData = CustomRenderMethodInput['shaderData'];

type ProgramInfo = {
	program: WebGLProgram;
	pos: number;
	uniforms: {
		projMatrix: WebGLUniformLocation | null;
		tileMercatorCoords: WebGLUniformLocation | null;
		clippingPlane: WebGLUniformLocation | null;
		transition: WebGLUniformLocation | null;
		fallbackMatrix: WebGLUniformLocation | null;
		color: WebGLUniformLocation | null;
	};
};

type Draw = {
	r: number;
	g: number;
	b: number;
	a: number;
	mode: 'line' | 'fill';
	segments: { first: number; count: number }[];
};

interface IsoLinesLayer extends CustomLayerInterface {
	uploadedVersion: number;
	drawList: Draw[];
	buffer?: WebGLBuffer;
	_programFor(gl: WebGL2RenderingContext, shaderData: ShaderData): ProgramInfo;
	_upload(gl: WebGL2RenderingContext, lines: LinePrimitive[]): void;
}

// projectTile's z-clip keeps a small tolerance, so far-side geometry near the limb leaks through and
// looks like it floats inside the globe. We cut it precisely per-fragment: the vertex shader measures
// the signed distance to MapLibre's own horizon plane (< 0 on the hidden hemisphere) and the fragment
// discards there. `projectToSphere` gives the ground point in MapLibre's globe frame, so the plane test
// is exact.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform vec4 u_color;
in float v_horizon;
out vec4 fragColor;
void main() {
  if (v_horizon < 0.0) discard; // hidden (far) hemisphere
  fragColor = u_color;
}`;

function vertexShaderSource(shaderData: ShaderData): string {
	return `#version 300 es
${shaderData.vertexShaderPrelude}
${shaderData.define}
in vec2 a_pos;
out float v_horizon;      // signed distance to the horizon plane (< 0 = far side)
void main() {
  gl_Position = projectTile(a_pos, vec2(0.0));
  vec3 spherePos = projectToSphere(a_pos);
  v_horizon = dot(spherePos, u_projection_clipping_plane.xyz) + u_projection_clipping_plane.w;
}`;
}

function compileProgram(gl: WebGL2RenderingContext, vertexSrc: string): WebGLProgram {
	const compile = (type: number, src: string): WebGLShader => {
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, src);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
			throw new Error(gl.getShaderInfoLog(shader) ?? 'shader error');
		return shader;
	};
	const program = gl.createProgram()!;
	gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
	gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link error');
	return program;
}

/** Build the iso-lines layer. `state.lines` is read (and re-uploaded) whenever `state.version` changes. */
export function createIsoLinesLayer(state: IsoLinesState): CustomLayerInterface {
	const programByVariant: Record<string, ProgramInfo> = {};

	const layer: IsoLinesLayer = {
		id: 'iso-lines',
		type: 'custom',
		renderingMode: '2d',
		uploadedVersion: -1,
		drawList: [],

		onAdd(_map, gl) {
			this.buffer = (gl as WebGL2RenderingContext).createBuffer()!;
		},

		_programFor(gl, shaderData) {
			const cached = programByVariant[shaderData.variantName];
			if (cached) return cached;
			const program = compileProgram(gl, vertexShaderSource(shaderData));
			const uniform = (name: string) => gl.getUniformLocation(program, name);
			const built: ProgramInfo = {
				program,
				pos: gl.getAttribLocation(program, 'a_pos'),
				uniforms: {
					projMatrix: uniform('u_projection_matrix'),
					tileMercatorCoords: uniform('u_projection_tile_mercator_coords'),
					clippingPlane: uniform('u_projection_clipping_plane'),
					transition: uniform('u_projection_transition'),
					fallbackMatrix: uniform('u_projection_fallback_matrix'),
					color: uniform('u_color')
				}
			};
			programByVariant[shaderData.variantName] = built;
			return built;
		},

		_upload(gl, lines) {
			let floats = 0;
			for (const line of lines) floats += line.positions.length;
			const combined = new Float32Array(floats);
			const drawList: Draw[] = [];
			let offset = 0;
			for (const line of lines) {
				const base = offset / 2; // vertex offset into the combined buffer
				combined.set(line.positions, offset);
				drawList.push({
					r: line.color[0],
					g: line.color[1],
					b: line.color[2],
					a: line.opacity,
					mode: line.mode ?? 'line',
					segments: line.segments.map((s) => ({ first: base + s.first, count: s.count }))
				});
				offset += line.positions.length;
			}
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer!);
			gl.bufferData(gl.ARRAY_BUFFER, combined, gl.DYNAMIC_DRAW);
			this.drawList = drawList;
		},

		render(gl, options) {
			if (!state.ready || !state.visible || state.lines.length === 0) return;
			const gl2 = gl as WebGL2RenderingContext;
			const prog = this._programFor(gl2, options.shaderData);
			const projection = options.defaultProjectionData;
			gl2.useProgram(prog.program);

			const u = prog.uniforms;
			if (u.projMatrix) gl2.uniformMatrix4fv(u.projMatrix, false, projection.mainMatrix);
			if (u.tileMercatorCoords && projection.tileMercatorCoords)
				gl2.uniform4fv(u.tileMercatorCoords, projection.tileMercatorCoords);
			if (u.clippingPlane && projection.clippingPlane) gl2.uniform4fv(u.clippingPlane, projection.clippingPlane);
			if (u.transition != null && projection.projectionTransition != null)
				gl2.uniform1f(u.transition, projection.projectionTransition);
			if (u.fallbackMatrix && projection.fallbackMatrix)
				gl2.uniformMatrix4fv(u.fallbackMatrix, false, projection.fallbackMatrix);

			if (state.version !== this.uploadedVersion) {
				this._upload(gl2, state.lines);
				this.uploadedVersion = state.version;
			}

			gl2.bindBuffer(gl2.ARRAY_BUFFER, this.buffer!);
			gl2.enableVertexAttribArray(prog.pos);
			gl2.vertexAttribPointer(prog.pos, 2, gl2.FLOAT, false, 0, 0);

			gl2.enable(gl2.BLEND);
			gl2.blendFunc(gl2.SRC_ALPHA, gl2.ONE_MINUS_SRC_ALPHA);
			gl2.disable(gl2.DEPTH_TEST);

			for (const d of this.drawList) {
				gl2.uniform4f(u.color, d.r, d.g, d.b, d.a);
				const primitive = d.mode === 'fill' ? gl2.TRIANGLE_STRIP : gl2.LINE_STRIP;
				for (const seg of d.segments) gl2.drawArrays(primitive, seg.first, seg.count);
			}
		}
	};

	return layer;
}
