// A first-person "eclipsed Sun" billboard for the B3 sky view (SkyView.svelte): the Sun's disc with the
// Moon crescent cut out, drawn at a clip-space centre set each frame from the Sun's az/alt. It is
// depth-tested so terrain and 3D buildings occlude it when the Sun is behind them. Ported from
// prototype/b3.html — a WebGL layer in MapLibre's 3D custom-layer slot.
import type { CustomLayerInterface, CustomRenderMethodInput } from 'maplibre-gl';

export type SunState = {
	center: [number, number, number, number]; // clip-space centre (mercator x, y, z, w)
	moon: [number, number]; // Moon-centre offset from the Sun, in Sun-radius units (+x east, +y up)
	moonR: number; // Moon angular radius / Sun angular radius
	visible: boolean;
	opacity: number; // faded out as the Sun drops below the terrain/curvature horizon
};

const SUN_PX = 46; // on-screen radius in px (enlarged for legibility)

const VERTEX = `
attribute vec2 a_corner;
uniform mat4 u_matrix; uniform vec4 u_center; uniform vec2 u_pix;
varying vec2 v_uv;
void main() {
  vec4 clip = u_matrix * u_center;
  // keep the far-away Sun just inside the far plane (never depth-clipped) while still sitting behind
  // nearer buildings for the depth test
  clip.z = min(clip.z, clip.w * 0.9999);
  gl_Position = clip + vec4(a_corner * u_pix * clip.w, 0.0, 0.0);
  v_uv = a_corner;
}`;

const FRAGMENT = `
precision highp float; varying vec2 v_uv;
uniform vec2 u_moon; uniform float u_moonR; uniform float u_opacity; uniform vec3 u_sun;
void main() {
  float rs = length(v_uv); if (rs > 1.0) discard;              // outside the Sun disc
  float rm = length(v_uv - u_moon);
  float moon = smoothstep(u_moonR - 0.03, u_moonR + 0.01, rm); // 0 inside the Moon, 1 outside
  float limb = smoothstep(1.0, 0.90, rs);
  float a = moon * limb * u_opacity; if (a < 0.01) discard;
  gl_FragColor = vec4(u_sun, a);
}`;

/** @param color Sun-disc colour as rgb in 0..1 (from config's SKY_PALETTE via hexToRgb). */
export function createSunLayer(sun: SunState, color: [number, number, number]): CustomLayerInterface {
	let prog: WebGLProgram;
	let buffer: WebGLBuffer;
	let aCorner: number;
	const u: Record<string, WebGLUniformLocation | null> = {};

	return {
		id: 'sun',
		type: 'custom',
		renderingMode: '3d',

		onAdd(_map, gl) {
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
			for (const n of ['u_matrix', 'u_center', 'u_pix', 'u_moon', 'u_moonR', 'u_opacity', 'u_sun'])
				u[n] = gl.getUniformLocation(prog, n);
			buffer = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
		},

		render(gl, options: CustomRenderMethodInput) {
			if (!sun.visible || sun.opacity <= 0.01) return;
			gl.useProgram(prog);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.enableVertexAttribArray(aCorner);
			gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);
			gl.uniformMatrix4fv(u.u_matrix, false, options.defaultProjectionData.mainMatrix);
			gl.uniform4fv(u.u_center, sun.center);
			gl.uniform2f(u.u_pix, (SUN_PX * 2) / gl.drawingBufferWidth, (SUN_PX * 2) / gl.drawingBufferHeight);
			gl.uniform2f(u.u_moon, sun.moon[0], sun.moon[1]);
			gl.uniform1f(u.u_moonR, sun.moonR);
			gl.uniform1f(u.u_opacity, sun.opacity);
			gl.uniform3f(u.u_sun, color[0], color[1], color[2]);
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LEQUAL);
			gl.depthMask(false);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			gl.depthMask(true); // restore for MapLibre's next layer/frame
		}
	};
}
