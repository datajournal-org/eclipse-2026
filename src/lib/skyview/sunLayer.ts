// An "eclipsed Sun" billboard for the B3 sky view (SkyView.svelte): the Sun's disc with the Moon crescent
// cut out, drawn at its real angular size along the Sun's current (az, alt) direction. The centre is
// re-anchored to the CAMERA every rendered frame (camera position + direction x offset), so the disc
// shows zero parallax however the camera dollies or orbits — the defining property of something at
// infinity; the offset's magnitude is arbitrary. It is DEPTH-TESTED against the scene at the far plane:
// a ridge or building whose silhouette rises above the Sun's altitude hides it, which is the concept's
// "do houses or mountains block your view west?" question answered by the picture itself (an Innsbruck
// Sun used to glow through the Nordkette). The camera stands in for the observer, so the silhouette is
// approximate — but a Sun in front of a mountain is always wrong, a Sun behind one usually right. The
// DOM locator/loupe still point at it while hidden, saying "it is there, your view is blocked". A WebGL
// layer in MapLibre's 3D custom-layer slot.
import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';

/**
 * How far from the camera the sky is placed, in Mercator units (the custom-layer world space, which is
 * conformal in 3D — identical x/y/z spans are identical real lengths — so a plain scalar offset keeps
 * the direction exact). NOT a physical distance: camera anchoring makes the parallax exactly zero
 * regardless, so the magnitude only has to sit comfortably inside the depth range — 0.001 of the world
 * is ~30 km of real distance at mid-latitudes; the shaders' far-plane clamp handles the rest. Shared
 * with starLayer.ts.
 */
export const SKY_OFFSET_MERC = 0.001;

/**
 * Project a camera-anchored sky direction to CSS pixels — the shared maths behind the Sun locator, the
 * compass labels and the planet labels: place the point at camera + dir x offset, run it through the
 * frame's projection matrix, and return null when it is behind the camera (w <= 0), where a screen
 * position would point at nothing.
 */
export function projectDir(
	m: MlMap,
	matrix: ArrayLike<number>,
	dir: readonly [number, number, number]
): [number, number] | null {
	const cam = cameraMercator(m);
	const x = cam[0] + dir[0] * SKY_OFFSET_MERC;
	const y = cam[1] + dir[1] * SKY_OFFSET_MERC;
	const z = cam[2] + dir[2] * SKY_OFFSET_MERC;
	const M = matrix;
	const cw = M[3] * x + M[7] * y + M[11] * z + M[15];
	if (cw <= 0) return null;
	const ndcX = (M[0] * x + M[4] * y + M[8] * z + M[12]) / cw;
	const ndcY = (M[1] * x + M[5] * y + M[9] * z + M[13]) / cw;
	const el = m.getCanvas();
	return [(ndcX * 0.5 + 0.5) * el.clientWidth, (0.5 - ndcY * 0.5) * el.clientHeight];
}

/**
 * The camera position in custom-layer (Mercator) space, fresh for this frame.
 *
 * MapLibre v6 has no public accessor for it (`getFreeCameraOptions` did not survive the v6 split), but
 * the transform's `cameraPosition` is typed on `_camera.transform`, so a future rename breaks the build
 * rather than the sky. It lives in the transform's INTERNAL space — x/y in world pixels, z in metres —
 * while a custom layer's `mainMatrix` expects 0..1 Mercator with conformal z: it bakes in exactly
 * `scale(EXTENT, EXTENT, worldSize / pixelsPerMeter)`, which the divisions below invert.
 */
export const cameraMercator = (m: MlMap): [number, number, number] => {
	const t = (
		m as unknown as {
			_camera: { transform: { cameraPosition: ArrayLike<number>; worldSize: number; pixelsPerMeter: number } };
		}
	)._camera.transform;
	const [x, y, z] = t.cameraPosition as unknown as [number, number, number];
	return [x / t.worldSize, y / t.worldSize, (z * t.pixelsPerMeter) / t.worldSize];
};

export type SunState = {
	dir: [number, number, number]; // unit direction to the Sun (Mercator axes: +x east, +y south, +z up)
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

			// Anchor the disc to the camera: its world position is wherever the camera is right now, plus
			// the Sun direction scaled to a fixed offset. The camera pose is fresh every frame, so orbiting
			// and dollying move the Sun exactly with the sky rather than parallaxing it against the terrain.
			const cam = cameraMercator(map);
			const k = SKY_OFFSET_MERC;
			const c = [cam[0] + sun.dir[0] * k, cam[1] + sun.dir[1] * k, cam[2] + sun.dir[2] * k, 1];

			// project the Sun centre to CSS pixels so the DOM overlay (locator ring + loupe leader line) can
			// point at the tiny real Sun. mainMatrix is column-major; we only need clip x/y/w.
			const M = options.defaultProjectionData.mainMatrix;
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
			gl.uniform4fv(u.u_center, c);
			// real angular size: map the Sun's angular radius through the vertical FOV to a clip-space (NDC)
			// half-extent. uy is the vertical half-size; ux keeps the disc circular in pixels despite aspect.
			const fovV = (map.getVerticalFieldOfView() * Math.PI) / 180;
			const uy = Math.tan(sun.angRad) / Math.tan(fovV / 2);
			const ux = (uy * gl.drawingBufferHeight) / gl.drawingBufferWidth;
			gl.uniform2f(u.u_pix, ux, uy);
			gl.uniform2f(u.u_moon, sun.moon[0], sun.moon[1]);
			gl.uniform1f(u.u_moonR, sun.moonR);
			gl.uniform3f(u.u_sun, color[0], color[1], color[2]);
			// Depth-tested, read-only: the vertex shader clamps the disc to just inside the far plane, so
			// any terrain or building drawn in front wins — see the header note. depthMask stays off (and
			// is restored) so the far-plane quad can never punch a hole into the depth buffer.
			gl.enable(gl.DEPTH_TEST);
			gl.depthFunc(gl.LESS);
			gl.depthMask(false);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			gl.depthMask(true);
		}
	};
}
