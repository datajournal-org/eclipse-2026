// Stars and planets for the B3 sky view: one WebGL point sprite per object, drawn in the same 3D world as
// the Sun billboard so they orbit with the camera and sit at their true positions in the sky.
//
// Point sprites rather than the Sun's quad-per-object approach: a star is a point source, so its size on
// screen is a matter of brightness, not angular diameter — it must NOT scale with the field of view the
// way the Sun disc does. One draw call covers the whole sky.
//
// Like the Sun, they are drawn with the depth test off. Terrain occlusion is deliberately not modelled
// anywhere in this scene (the observer's height is unknown), and a star clipped by a hill it should have
// cleared would be a worse error than one showing through.
//
// Each star is stored as a unit DIRECTION and anchored to the camera in the vertex shader
// (u_cam + u_dist * direction), so the whole sky rides with the camera and shows zero parallax — see
// sunLayer.ts, which does the same for the Sun disc.
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { SKY_OFFSET_MERC, cameraMercator, projectDir } from './sunLayer';

/** A planet the sky view labels: its current direction, its fade, and where it landed on screen. */
export type PlanetLabel = {
	/** i18n key suffix ('venus', 'mercury', 'mars') — resolved to a name by PlanetLabels.svelte. */
	key: string;
	/** Unit direction (Mercator axes), refreshed per scrub frame by SkyView.update(). */
	dir: [number, number, number];
	/** The planet's own visibility (PlacedObject.brightness) — the label fades with its planet. */
	alpha: number;
	/** CSS-pixel position, written by the layer each rendered frame; null while behind the camera. */
	screen: [number, number] | null;
};

export type StarState = {
	/** Unit direction per object (Mercator axes: +x east, +y south, +z up), 3 floats each. */
	dirs: Float32Array;
	/** Point diameter in CSS pixels, one per object. */
	sizes: Float32Array;
	/** 0..1 per object. */
	alphas: Float32Array;
	count: number;
	/** Bumped whenever the arrays change, so the buffers re-upload only when they have to. */
	version: number;
	ready: boolean;
	/** The labelled planets among the placed objects — see PlanetLabel. */
	labels: PlanetLabel[];
};

export const emptyStarState = (): StarState => ({
	dirs: new Float32Array(0),
	sizes: new Float32Array(0),
	alphas: new Float32Array(0),
	count: 0,
	version: 0,
	ready: false,
	labels: []
});

const VERTEX = `
attribute vec3 a_dir;
attribute float a_size;
attribute float a_alpha;
uniform mat4 u_matrix;
uniform vec3 u_cam;         // camera position in Mercator units, fresh every frame
uniform float u_dist;       // sky offset in Mercator units — anchors the star to the camera (no parallax)
uniform float u_scale;      // devicePixelRatio: gl_PointSize is in device pixels, sizes are in CSS px
varying float v_alpha;
void main() {
  vec4 clip = u_matrix * vec4(u_cam + a_dir * u_dist, 1.0);
  // Same guard as the Sun: these sit far out in the sky, and without it the far plane clips them away.
  clip.z = min(clip.z, clip.w * 0.9999);
  gl_Position = clip;
  gl_PointSize = a_size * u_scale;
  v_alpha = a_alpha;
}`;

const FRAGMENT = `
precision highp float;
uniform vec3 u_color;
varying float v_alpha;
void main() {
  // Round, soft-edged dot. A hard-edged square would read as a UI artefact rather than a star, and the
  // falloff doubles as cheap antialiasing at these sizes.
  float r = length(gl_PointCoord - vec2(0.5)) * 2.0;
  if (r > 1.0) discard;
  // 1.0 - smoothstep(lo, hi, r), NOT smoothstep(hi, lo, r): GLSL leaves smoothstep undefined when
  // edge0 > edge1, and a driver that returns 0 for it draws nothing at all.
  float core = 1.0 - smoothstep(0.15, 1.0, r);
  gl_FragColor = vec4(u_color, v_alpha * core);
}`;

/** @param color Star colour as rgb in 0..1. */
export function createStarLayer(state: StarState, color: [number, number, number]): CustomLayerInterface {
	let prog: WebGLProgram;
	let posBuf: WebGLBuffer, sizeBuf: WebGLBuffer, alphaBuf: WebGLBuffer;
	let aPos: number, aSize: number, aAlpha: number;
	let uploaded = -1;
	let map: MlMap;
	const u: Record<string, WebGLUniformLocation | null> = {};

	return {
		id: 'stars',
		type: 'custom',
		renderingMode: '3d',

		onAdd(m, gl) {
			map = m;
			const compile = (type: number, src: string): WebGLShader => {
				const sh = gl.createShader(type)!;
				gl.shaderSource(sh, src);
				gl.compileShader(sh);
				if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
					throw new Error(gl.getShaderInfoLog(sh) ?? 'shader error');
				return sh;
			};
			prog = gl.createProgram()!;
			gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERTEX));
			gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAGMENT));
			gl.linkProgram(prog);
			if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link error');
			aPos = gl.getAttribLocation(prog, 'a_dir');
			aSize = gl.getAttribLocation(prog, 'a_size');
			aAlpha = gl.getAttribLocation(prog, 'a_alpha');
			for (const n of ['u_matrix', 'u_cam', 'u_dist', 'u_scale', 'u_color']) u[n] = gl.getUniformLocation(prog, n);
			posBuf = gl.createBuffer()!;
			sizeBuf = gl.createBuffer()!;
			alphaBuf = gl.createBuffer()!;
			uploaded = -1;
		},

		render(gl, options: CustomRenderMethodInput) {
			// The planet labels ride this layer's render pass (their dots are drawn here): project each
			// labelled direction to CSS pixels for the DOM overlay, every frame the camera can move.
			for (const label of state.labels) {
				label.screen = projectDir(map, options.defaultProjectionData.mainMatrix, label.dir);
			}
			if (!state.ready || state.count === 0) return;

			gl.useProgram(prog);
			// DYNAMIC_DRAW: the whole set is rewritten on every scrub step, as the sky turns.
			if (uploaded !== state.version) {
				gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
				gl.bufferData(gl.ARRAY_BUFFER, state.dirs, gl.DYNAMIC_DRAW);
				gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
				gl.bufferData(gl.ARRAY_BUFFER, state.sizes, gl.DYNAMIC_DRAW);
				gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
				gl.bufferData(gl.ARRAY_BUFFER, state.alphas, gl.DYNAMIC_DRAW);
				uploaded = state.version;
			}

			gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuf);
			gl.enableVertexAttribArray(aSize);
			gl.vertexAttribPointer(aSize, 1, gl.FLOAT, false, 0, 0);
			gl.bindBuffer(gl.ARRAY_BUFFER, alphaBuf);
			gl.enableVertexAttribArray(aAlpha);
			gl.vertexAttribPointer(aAlpha, 1, gl.FLOAT, false, 0, 0);

			gl.uniformMatrix4fv(u.u_matrix, false, options.defaultProjectionData.mainMatrix);
			// Camera anchoring (see the header): position = camera + direction x offset, every frame.
			const cam = cameraMercator(map);
			gl.uniform3f(u.u_cam, cam[0], cam[1], cam[2]);
			gl.uniform1f(u.u_dist, SKY_OFFSET_MERC);
			gl.uniform1f(u.u_scale, gl.drawingBufferHeight / (gl.canvas as HTMLCanvasElement).clientHeight || 1);
			gl.uniform3f(u.u_color, color[0], color[1], color[2]);

			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.drawArrays(gl.POINTS, 0, state.count);
		}
	};
}
