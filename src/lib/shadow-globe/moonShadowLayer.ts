// A MapLibre CustomLayerInterface that paints a realistic, per-pixel Moon shadow onto the globe:
// day/night terminator + umbra/penumbra, using MapLibre's own projection so the shadow sits
// correctly on the sphere (poles included).
//
// The per-pixel work is cheap: instead of a disc-overlap formula, each pixel measures its
// perpendicular distance to the shadow axis and looks the coverage up in a 1D profile texture
// (see shadowProfile.ts). The component updates a shared `shadowState` every frame.

import type { CustomLayerInterface, CustomRenderMethodInput, Map as MlMap } from 'maplibre-gl';
import type { Vec3 } from '$lib/types';

/** Shared state the component mutates every frame and the layer reads while rendering. */
export type ShadowState = {
	center: Vec3;
	axis: Vec3;
	sunDir: Vec3;
	rMax: number;
	/** Coverage LUT (0..1 floats) uploaded to the profile texture; null before the first frame. */
	profile: Float32Array | null;
	/** Bumped whenever `profile` changes so the texture is re-uploaded. */
	profileVersion: number;
	/** Gates the first render. */
	ready: boolean;
};

type ShaderData = CustomRenderMethodInput['shaderData'];

type ProgramInfo = {
	program: WebGLProgram;
	attribs: { tilePos: number; poleFlag: number };
	uniforms: {
		projMatrix: WebGLUniformLocation | null;
		tileMercatorCoords: WebGLUniformLocation | null;
		clippingPlane: WebGLUniformLocation | null;
		transition: WebGLUniformLocation | null;
		fallbackMatrix: WebGLUniformLocation | null;
		sunDir: WebGLUniformLocation | null;
		center: WebGLUniformLocation | null;
		axis: WebGLUniformLocation | null;
		rMax: WebGLUniformLocation | null;
		profile: WebGLUniformLocation | null;
	};
};

interface MoonShadowLayer extends CustomLayerInterface {
	indexCount: number;
	uploadedProfileVersion: number;
	positionBuffer?: WebGLBuffer;
	poleFlagBuffer?: WebGLBuffer;
	indexBuffer?: WebGLBuffer;
	profileTexture?: WebGLTexture;
	_programFor(gl: WebGL2RenderingContext, shaderData: ShaderData): ProgramInfo;
}

// Segments per axis of the full-globe overlay mesh.
const GRID_RESOLUTION = 200;

// Fragment shader: coverage from the profile LUT (by off-axis distance) → day/night + shadow tint.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 v_surfaceDir;                 // unit vector from Earth's centre to this ground point
uniform vec3 u_sunDir;                // unit direction to the Sun (Earth-fixed frame)
uniform vec3 u_center;                // shadow axis anchor on the sphere (unit)
uniform vec3 u_axis;                  // unit shadow-axis direction (toward the Moon)
uniform float u_rMax;                 // penumbra radius (coverage → 0), Earth radii
uniform sampler2D u_profile;          // 1D coverage LUT (N×1, R channel, float)
out vec4 fragColor;

// Interleaved-gradient noise (Jimenez) → ±0.5/255 dither, to break the 8-bit output banding on the
// big smooth day→night gradient. Screen-space, so it stays fixed while the globe holds still.
float ign(vec2 p) {
  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));
}

void main() {
  vec3 surfaceDir = normalize(v_surfaceDir);

  // Lambert illumination: brightness = sin(solar elevation) = cosine of the incidence angle.
  // 90° (Sun at the zenith) → 1.0, 30° → 0.5, 0° (terminator) → 0.0, night → 0.
  float sinElevation = dot(surfaceDir, u_sunDir);
  float sunBrightness = max(0.0, sinElevation);

  // Perpendicular distance from this ground point to the shadow axis, looked up in the profile.
  vec3 delta = surfaceDir - u_center;
  float offAxis = length(delta - dot(delta, u_axis) * u_axis);
  float coverage = texture(u_profile, vec2(clamp(offAxis / u_rMax, 0.0, 1.0), 0.5)).r;

  // The eclipse dims the sunlight further (from space, ground brightness ≈ 1 − coverage).
  float brightness = sunBrightness * (1.0 - coverage);

  float alpha = clamp(1.0 - brightness, 0.0, 1.0) * 0.95; // overlay opacity over the tiles
  alpha += (ign(gl_FragCoord.xy) - 0.5) / 255.0; // dither away 8-bit banding
  if (alpha < 0.004) discard; // bright, uneclipsed noon: leave tiles
  fragColor = vec4(0.0, 0.0, 0.0, clamp(alpha, 0.0, 1.0));
}`;

// Vertex shader is assembled per projection variant so it can call MapLibre's own `projectTile`.
function vertexShaderSource(shaderData: ShaderData): string {
	return `#version 300 es
${shaderData.vertexShaderPrelude}
${shaderData.define}
in vec2 a_tilePos;      // position in web-mercator tile space, 0..1
in vec2 a_poleFlag;     // (0,0) for grid vertices; y-sentinel marks the exact poles
out vec3 v_surfaceDir;

void main() {
  gl_Position = projectTile(a_tilePos, a_poleFlag);   // 2-arg form snaps the sentinels onto the poles
  if (a_poleFlag.y < -32767.5) {                       // north pole (frame: +z)
    v_surfaceDir = vec3(0.0, 0.0, 1.0);
  } else if (a_poleFlag.y > 32766.5) {                 // south pole (frame: -z)
    v_surfaceDir = vec3(0.0, 0.0, -1.0);
  } else {                                             // mercator tile coords → lon/lat → unit vector
    float lon = a_tilePos.x * 6.283185307 - 3.141592653;
    float lat = atan(sinh(3.141592653 * (1.0 - 2.0 * a_tilePos.y)));
    float cosLat = cos(lat);
    v_surfaceDir = vec3(cosLat * cos(lon), cosLat * sin(lon), sin(lat));
  }
}`;
}

function compileProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
	const compileShader = (type: number, src: string): WebGLShader => {
		const shader = gl.createShader(type)!;
		gl.shaderSource(shader, src);
		gl.compileShader(shader);
		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
			throw new Error(gl.getShaderInfoLog(shader) ?? 'shader error');
		return shader;
	};
	const program = gl.createProgram()!;
	gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSrc));
	gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSrc));
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'link error');
	return program;
}

// A grid covering the whole globe, plus one extra vertex on each pole. The mercator grid only
// reaches ±85°, so the top/bottom rows are fanned to a pole vertex whose sentinel poleFlag makes
// `projectTile` place it exactly on the pole.
function buildGlobeMesh(): { tilePositions: number[]; poleFlags: number[]; indices: number[] } {
	const N = GRID_RESOLUTION,
		VERTS_PER_ROW = N + 1;
	const tilePositions: number[] = [],
		poleFlags: number[] = [],
		indices: number[] = [];

	for (let iy = 0; iy <= N; iy++)
		for (let ix = 0; ix <= N; ix++) {
			tilePositions.push(ix / N, iy / N);
			poleFlags.push(0, 0);
		}

	for (let iy = 0; iy < N; iy++)
		for (let ix = 0; ix < N; ix++) {
			const topLeft = iy * VERTS_PER_ROW + ix;
			const topRight = topLeft + 1;
			const bottomLeft = topLeft + VERTS_PER_ROW;
			const bottomRight = bottomLeft + 1;
			indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
		}

	const northPole = tilePositions.length / 2;
	tilePositions.push(0.5, 0.0);
	poleFlags.push(0, -40000);
	const southPole = tilePositions.length / 2;
	tilePositions.push(0.5, 1.0);
	poleFlags.push(0, 40000);
	const bottomRowStart = N * VERTS_PER_ROW;
	for (let ix = 0; ix < N; ix++) indices.push(northPole, ix, ix + 1); // north cap fan
	for (let ix = 0; ix < N; ix++) indices.push(bottomRowStart + ix, southPole, bottomRowStart + ix + 1); // south cap fan

	return { tilePositions, poleFlags, indices };
}

function createBuffer(gl: WebGL2RenderingContext, target: number, data: BufferSource): WebGLBuffer {
	const buffer = gl.createBuffer()!;
	gl.bindBuffer(target, buffer);
	gl.bufferData(target, data, gl.STATIC_DRAW);
	return buffer;
}

function bindVec2Attribute(gl: WebGL2RenderingContext, buffer: WebGLBuffer, location: number): void {
	gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
	gl.enableVertexAttribArray(location);
	gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
}

/**
 * Build the custom shadow layer. `shadowState` is shared and mutated by the component each frame.
 */
export function createMoonShadowLayer(shadowState: ShadowState): CustomLayerInterface {
	const programByVariant: Record<string, ProgramInfo> = {}; // projectTile differs per projection variant

	const layer: MoonShadowLayer = {
		id: 'moon-shadow',
		type: 'custom',
		renderingMode: '2d',
		indexCount: 0,
		uploadedProfileVersion: -1,

		onAdd(_map: MlMap, gl: WebGL2RenderingContext) {
			const mesh = buildGlobeMesh();
			this.indexCount = mesh.indices.length;
			this.positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(mesh.tilePositions));
			this.poleFlagBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(mesh.poleFlags));
			this.indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices));

			// 1D coverage LUT as an N×1 R16F float texture (linear-filterable in WebGL2 → smooth penumbra,
			// no 8-bit stepping in the gradient).
			this.profileTexture = gl.createTexture()!;
			gl.bindTexture(gl.TEXTURE_2D, this.profileTexture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			this.uploadedProfileVersion = -1;
		},

		_programFor(gl: WebGL2RenderingContext, shaderData: ShaderData): ProgramInfo {
			const cached = programByVariant[shaderData.variantName];
			if (cached) return cached;
			const program = compileProgram(gl, vertexShaderSource(shaderData), FRAGMENT_SHADER);
			const uniform = (name: string) => gl.getUniformLocation(program, name);
			const built: ProgramInfo = {
				program,
				attribs: {
					tilePos: gl.getAttribLocation(program, 'a_tilePos'),
					poleFlag: gl.getAttribLocation(program, 'a_poleFlag')
				},
				uniforms: {
					projMatrix: uniform('u_projection_matrix'),
					tileMercatorCoords: uniform('u_projection_tile_mercator_coords'),
					clippingPlane: uniform('u_projection_clipping_plane'),
					transition: uniform('u_projection_transition'),
					fallbackMatrix: uniform('u_projection_fallback_matrix'),
					sunDir: uniform('u_sunDir'),
					center: uniform('u_center'),
					axis: uniform('u_axis'),
					rMax: uniform('u_rMax'),
					profile: uniform('u_profile')
				}
			};
			programByVariant[shaderData.variantName] = built;
			return built;
		},

		render(gl: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput) {
			if (!shadowState.ready) return;
			const gl2 = gl as WebGL2RenderingContext; // globe custom layers get a WebGL2 context
			const { program, attribs, uniforms } = this._programFor(gl2, options.shaderData);
			const projection = options.defaultProjectionData;
			gl2.useProgram(program);

			// MapLibre's projection uniforms (supplied via the shader prelude).
			if (uniforms.projMatrix) gl2.uniformMatrix4fv(uniforms.projMatrix, false, projection.mainMatrix);
			if (uniforms.tileMercatorCoords && projection.tileMercatorCoords)
				gl2.uniform4fv(uniforms.tileMercatorCoords, projection.tileMercatorCoords);
			if (uniforms.clippingPlane && projection.clippingPlane)
				gl2.uniform4fv(uniforms.clippingPlane, projection.clippingPlane);
			if (uniforms.transition != null && projection.projectionTransition != null)
				gl2.uniform1f(uniforms.transition, projection.projectionTransition);
			if (uniforms.fallbackMatrix && projection.fallbackMatrix)
				gl2.uniformMatrix4fv(uniforms.fallbackMatrix, false, projection.fallbackMatrix);

			// Shadow axis + profile.
			gl2.uniform3fv(uniforms.sunDir, shadowState.sunDir);
			gl2.uniform3fv(uniforms.center, shadowState.center);
			gl2.uniform3fv(uniforms.axis, shadowState.axis);
			gl2.uniform1f(uniforms.rMax, shadowState.rMax);

			gl2.activeTexture(gl2.TEXTURE0);
			gl2.bindTexture(gl2.TEXTURE_2D, this.profileTexture!);
			if (shadowState.profile && shadowState.profileVersion !== this.uploadedProfileVersion) {
				gl2.pixelStorei(gl2.UNPACK_ALIGNMENT, 1);
				gl2.texImage2D(
					gl2.TEXTURE_2D,
					0,
					gl2.R16F,
					shadowState.profile.length,
					1,
					0,
					gl2.RED,
					gl2.FLOAT,
					shadowState.profile
				);
				this.uploadedProfileVersion = shadowState.profileVersion;
			}
			gl2.uniform1i(uniforms.profile, 0);

			bindVec2Attribute(gl2, this.positionBuffer!, attribs.tilePos);
			bindVec2Attribute(gl2, this.poleFlagBuffer!, attribs.poleFlag);
			gl2.bindBuffer(gl2.ELEMENT_ARRAY_BUFFER, this.indexBuffer!);

			// Blend the darkening over the tiles; cull the far hemisphere; ignore depth.
			gl2.enable(gl2.BLEND);
			gl2.blendFunc(gl2.SRC_ALPHA, gl2.ONE_MINUS_SRC_ALPHA);
			gl2.enable(gl2.CULL_FACE);
			gl2.cullFace(gl2.BACK);
			gl2.disable(gl2.DEPTH_TEST);
			gl2.drawElements(gl2.TRIANGLES, this.indexCount, gl2.UNSIGNED_INT, 0);
			gl2.disable(gl2.CULL_FACE);
		}
	};

	return layer;
}
