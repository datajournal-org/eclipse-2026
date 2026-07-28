// The twilight veil: a full-screen wash that darkens and tints the whole B3 scene as the eclipse deepens
// and the Sun sets.
//
// This used to be a DOM overlay sitting on top of the map canvas, which was simpler but put it above
// everything drawn inside the canvas — including the stars. A veil above the stars destroys exactly the
// contrast that makes them visible: it compresses star and sky towards the same darkness, so a white star
// at 255 and a daylit sky at 180 end up 27 levels apart instead of 75. No CSS blend mode can darken a sky
// while sparing the points of light inside it, because both arrive as one flattened image.
//
// As a custom layer it draws in the layer order instead: after the map, terrain and buildings, and BEFORE
// the stars and the Sun. Everything under it dims; everything over it keeps its brightness. The marker and
// the loupe are DOM elements above the canvas and are unaffected either way, which is what they want.
import type { CustomLayerInterface } from 'maplibre-gl';

export type VeilState = {
	/** Veil colour as rgb in 0..1. */
	color: [number, number, number];
	/** 0 = clear daylight, 1 = fully covered. */
	alpha: number;
};

export const emptyVeilState = (): VeilState => ({ color: [0, 0, 0], alpha: 0 });

// A clip-space quad — no projection: this covers the viewport, not a place in the world.
const VERTEX = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAGMENT = `
precision highp float;
uniform vec3 u_color;
uniform float u_alpha;
void main() { gl_FragColor = vec4(u_color, u_alpha); }`;

export function createVeilLayer(state: VeilState): CustomLayerInterface {
	let prog: WebGLProgram;
	let buffer: WebGLBuffer;
	let aPos: number;
	const u: Record<string, WebGLUniformLocation | null> = {};

	return {
		id: 'twilight-veil',
		type: 'custom',
		// '3d', not '2d', even though this draws no geometry in the world. With terrain enabled MapLibre
		// DRAPES 2d layers — it renders them into an offscreen texture once per terrain tile — so a
		// viewport-filling quad was composited several times over, stacking 0.64 opacity into near-total
		// black (measured: sky luma 5 where 68 was intended). 3d layers render once, in the main pass.
		renderingMode: '3d',

		onAdd(_m, gl) {
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
			aPos = gl.getAttribLocation(prog, 'a_pos');
			for (const n of ['u_color', 'u_alpha']) u[n] = gl.getUniformLocation(prog, n);
			buffer = gl.createBuffer()!;
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
		},

		render(gl) {
			if (state.alpha <= 0.001) return; // full daylight: nothing to draw
			gl.useProgram(prog);
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.enableVertexAttribArray(aPos);
			gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
			gl.uniform3f(u.u_color, state.color[0], state.color[1], state.color[2]);
			gl.uniform1f(u.u_alpha, state.alpha);
			gl.disable(gl.DEPTH_TEST);
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			// One oversized triangle rather than two: the clipped-away area costs nothing and it avoids the
			// seam a quad's diagonal can show at low alpha.
			gl.drawArrays(gl.TRIANGLES, 0, 3);
		}
	};
}
