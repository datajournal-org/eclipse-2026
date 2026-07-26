// An "eclipsed Sun" billboard for the B3 sky view (SkyView.svelte): the Sun's disc with the Moon crescent
// cut out, drawn at its real angular size at a clip-space centre set each frame from the Sun's az/alt. It
// is drawn on top (depth test off) — terrain occlusion is intentionally ignored, since we don't know the
// observer's height. A WebGL layer in MapLibre's 3D custom-layer slot.
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';

export type SunState = {
	center: [number, number, number, number]; // clip-space centre (mercator x, y, z, w)
	moon: [number, number]; // Moon-centre offset from the Sun, in Sun-radius units (+x east, +y up)
	moonR: number; // Moon angular radius / Sun angular radius
	angRad: number; // the Sun's angular radius (rad) → billboard drawn at its real angular size
	visible: boolean;
	screen: [number, number] | null; // Sun centre in CSS px (for the DOM locator/loupe leader), null if behind
};

const VERTEX = `
attribute vec2 a_corner;
uniform mat4 u_matrix; uniform vec4 u_center; uniform vec2 u_pix;
varying vec2 v_uv;
void main() {
  vec4 clip = u_matrix * u_center;
  clip.z = min(clip.z, clip.w * 0.9999); // keep the far-away Sun just inside the far plane (never clipped)
  gl_Position = clip + vec4(a_corner * u_pix * clip.w, 0.0, 0.0);
  v_uv = a_corner;
}`;

const FRAGMENT = `
precision highp float; varying vec2 v_uv;
uniform vec2 u_moon; uniform float u_moonR; uniform vec3 u_sun;
void main() {
  float rs = length(v_uv); if (rs > 1.0) discard;              // outside the Sun disc
  float rm = length(v_uv - u_moon);
  float moon = smoothstep(u_moonR - 0.03, u_moonR + 0.01, rm); // 0 inside the Moon, 1 outside
  float limb = smoothstep(1.0, 0.90, rs);
  float a = moon * limb; if (a < 0.01) discard;
  gl_FragColor = vec4(u_sun, a);
}`;

/** @param color Sun-disc colour as rgb in 0..1 (from config's SKY_PALETTE via hexToRgb). */
export function createSunLayer(sun: SunState, color: [number, number, number]): CustomLayerInterface {
	let prog: WebGLProgram;
	let buffer: WebGLBuffer;
	let aCorner: number;
	let map: MlMap;
	const u: Record<string, WebGLUniformLocation | null> = {};

	return {
		id: 'sun',
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
			aCorner = gl.getAttribLocation(prog, 'a_corner');
			for (const n of ['u_matrix', 'u_center', 'u_pix', 'u_moon', 'u_moonR', 'u_sun'])
				u[n] = gl.getUniformLocation(prog, n);
			buffer = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		},

		render(gl, options: CustomRenderMethodInput) {
			if (!sun.visible) return;

			// project the Sun centre to CSS pixels so the DOM overlay (locator ring + loupe leader line) can
			// point at the tiny real Sun. mainMatrix is column-major; we only need clip x/y/w.
			const M = options.defaultProjectionData.mainMatrix;
			const c = sun.center;
			const cw = M[3] * c[0] + M[7] * c[1] + M[11] * c[2] + M[15] * c[3];
			if (cw > 0) {
				const ndcX = (M[0] * c[0] + M[4] * c[1] + M[8] * c[2] + M[12] * c[3]) / cw;
				const ndcY = (M[1] * c[0] + M[5] * c[1] + M[9] * c[2] + M[13] * c[3]) / cw;
				const el = map.getCanvas();
				sun.screen = [(ndcX * 0.5 + 0.5) * el.clientWidth, (0.5 - ndcY * 0.5) * el.clientHeight];
			} else {
				sun.screen = null;
			}

			gl.useProgram(prog);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.enableVertexAttribArray(aCorner);
			gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
			gl.uniformMatrix4fv(u.u_matrix, false, options.defaultProjectionData.mainMatrix);
			gl.uniform4fv(u.u_center, sun.center);
			// real angular size: map the Sun's angular radius through the vertical FOV to a clip-space (NDC)
			// half-extent. uy is the vertical half-size; ux keeps the disc circular in pixels despite aspect.
			const fovV = (map.getVerticalFieldOfView() * Math.PI) / 180;
			const uy = Math.tan(sun.angRad) / Math.tan(fovV / 2);
			const ux = (uy * gl.drawingBufferHeight) / gl.drawingBufferWidth;
			gl.uniform2f(u.u_pix, ux, uy);
			gl.uniform2f(u.u_moon, sun.moon[0], sun.moon[1]);
			gl.uniform1f(u.u_moonR, sun.moonR);
			gl.uniform3f(u.u_sun, color[0], color[1], color[2]);
			gl.disable(gl.DEPTH_TEST); // always on top — terrain occlusion is ignored (observer height unknown)
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
		}
	};
}
