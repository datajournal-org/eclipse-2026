// The B3 horizon ruler: fine tick lines along the TRUE horizon (altitude 0), a tick every 5°, taller
// every 15°, tallest on the eight compass points — plus the per-frame screen positions of those eight
// points, which the DOM labels (CompassLabels.svelte) are glued to.
//
// Camera-anchored like the Sun and the stars (position = camera + direction x offset, every rendered
// frame), so the ruler behaves as if painted on the celestial sphere: orbiting sweeps it past, dollying
// leaves it perfectly still. The geometry never changes — directions are baked into a static buffer at
// construction — so a frame costs a handful of uniforms.
//
// Drawn OVER the twilight veil (layer order in mapSetup.ts) and with the depth test off, like every
// other piece of sky furniture: it is reference chrome, and a hill hiding "W" would defeat its purpose.
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import { SKY_OFFSET_MERC, cameraMercator } from './sunLayer';
import { dirFromAzAlt } from './frameSync';
import { CARDINAL_KEYS, LABEL_ALT, compassTicks } from './compass';

export type CompassState = {
	/** Screen position (CSS px) of each of the eight compass-point labels, null while unprojectable. */
	labels: ([number, number] | null)[];
};

export const emptyCompassState = (): CompassState => ({
	labels: CARDINAL_KEYS.map(() => null)
});

const TICK_ALPHA = 0.55; // reference furniture: present, never competing with the scene

const VERTEX = `
attribute vec3 a_dir;
uniform mat4 u_matrix;
uniform vec3 u_cam;         // camera position in Mercator units, fresh every frame
uniform float u_dist;       // sky offset in Mercator units — anchors the ruler to the camera (no parallax)
void main() {
  vec4 clip = u_matrix * vec4(u_cam + a_dir * u_dist, 1.0);
  // Same guard as the Sun and stars: without it the far plane clips the sky away.
  clip.z = min(clip.z, clip.w * 0.9999);
  gl_Position = clip;
}`;

const FRAGMENT = `
precision highp float;
uniform vec4 u_color;
void main() { gl_FragColor = u_color; }`;

/** @param color Tick colour as rgb in 0..1 (from config's SKY_PALETTE via hexToRgb). */
export function createCompassLayer(state: CompassState, color: [number, number, number]): CustomLayerInterface {
	let prog: WebGLProgram;
	let buffer: WebGLBuffer;
	let aDir: number;
	let vertexCount = 0;
	let map: MlMap;
	const u: Record<string, WebGLUniformLocation | null> = {};

	// The eight label directions, projected each frame for the DOM overlay.
	const labelDirs = CARDINAL_KEYS.map((_, i) => dirFromAzAlt(i * 45, LABEL_ALT));

	return {
		id: 'compass',
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
			aDir = gl.getAttribLocation(prog, 'a_dir');
			for (const n of ['u_matrix', 'u_cam', 'u_dist', 'u_color']) u[n] = gl.getUniformLocation(prog, n);

			// One line per tick, from the horizon up to the tick's height — baked once, world-fixed.
			const ticks = compassTicks();
			const verts = new Float32Array(ticks.length * 6);
			ticks.forEach((tk, i) => {
				verts.set(dirFromAzAlt(tk.az, 0), i * 6);
				verts.set(dirFromAzAlt(tk.az, tk.top), i * 6 + 3);
			});
			vertexCount = ticks.length * 2;
			buffer = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
		},

		render(gl, options: CustomRenderMethodInput) {
			const cam = cameraMercator(map);
			const k = SKY_OFFSET_MERC;

			// Project the eight label points to CSS pixels for the DOM overlay — the same maths the Sun
			// locator uses (sunLayer.ts). Behind-the-camera (w <= 0) becomes null; the component decides
			// on-screen visibility.
			const M = options.defaultProjectionData.mainMatrix;
			const el = map.getCanvas();
			labelDirs.forEach((dir, i) => {
				const x = cam[0] + dir[0] * k,
					y = cam[1] + dir[1] * k,
					z = cam[2] + dir[2] * k;
				const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
				if (cw <= 0) {
					state.labels[i] = null;
					return;
				}
				const ndcX = (M[0] * x + M[4] * y + M[8] * z + M[12]) / cw;
				const ndcY = (M[1] * x + M[5] * y + M[9] * z + M[13]) / cw;
				state.labels[i] = [(ndcX * 0.5 + 0.5) * el.clientWidth, (0.5 - ndcY * 0.5) * el.clientHeight];
			});

			gl.useProgram(prog);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.enableVertexAttribArray(aDir);
			gl.vertexAttribPointer(aDir, 3, gl.FLOAT, false, 0, 0);
			gl.uniformMatrix4fv(u.u_matrix, false, options.defaultProjectionData.mainMatrix);
			gl.uniform3f(u.u_cam, cam[0], cam[1], cam[2]);
			gl.uniform1f(u.u_dist, k);
			gl.uniform4f(u.u_color, color[0], color[1], color[2], TICK_ALPHA);
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); // same convention as the Sun and star layers
			gl.drawArrays(gl.LINES, 0, vertexCount);
		}
	};
}
