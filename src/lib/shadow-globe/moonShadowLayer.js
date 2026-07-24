// A MapLibre CustomLayerInterface that paints a realistic, per-pixel Moon shadow onto the globe:
// day/night terminator + umbra/penumbra, using MapLibre's own projection so the shadow sits
// correctly on the sphere (poles included).
//
// The per-pixel work is cheap: instead of a disc-overlap formula, each pixel measures its
// perpendicular distance to the shadow axis and looks the coverage up in a 1D profile texture
// (see shadowProfile.js). The component updates a shared `shadowState` every frame.

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
uniform sampler2D u_profile;          // 1D coverage LUT (N×1, R channel)
out vec4 fragColor;

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

  float alpha = clamp(1.0 - brightness, 0.0, 0.92);               // overlay opacity over the tiles
                                                                  // (0.92 cap keeps faint night geography)
  if (alpha < 0.004) discard;                                     // bright, uneclipsed noon: leave tiles

  float dayGate = smoothstep(0.0, 0.05, sinElevation);            // suppress the umbra tint on the night side
  vec3 nightTint = vec3(0.015, 0.03, 0.07);                       // deep-blue night
  vec3 umbraTint = vec3(0.0, 0.005, 0.02);                        // near-black core of totality
  vec3 color = mix(nightTint, umbraTint, smoothstep(0.45, 1.0, coverage) * dayGate);
  fragColor = vec4(color, alpha);
}`;

// Vertex shader is assembled per projection variant so it can call MapLibre's own `projectTile`.
function vertexShaderSource(shaderData) {
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

function compileProgram(gl, vertexSrc, fragmentSrc) {
  const compileShader = (type, src) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  };
  const program = gl.createProgram();
  gl.attachShader(program, compileShader(gl.VERTEX_SHADER, vertexSrc));
  gl.attachShader(program, compileShader(gl.FRAGMENT_SHADER, fragmentSrc));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}

// A grid covering the whole globe, plus one extra vertex on each pole. The mercator grid only
// reaches ±85°, so the top/bottom rows are fanned to a pole vertex whose sentinel poleFlag makes
// `projectTile` place it exactly on the pole.
function buildGlobeMesh() {
  const N = GRID_RESOLUTION, VERTS_PER_ROW = N + 1;
  const tilePositions = [], poleFlags = [], indices = [];

  for (let iy = 0; iy <= N; iy++)
    for (let ix = 0; ix <= N; ix++) { tilePositions.push(ix / N, iy / N); poleFlags.push(0, 0); }

  for (let iy = 0; iy < N; iy++)
    for (let ix = 0; ix < N; ix++) {
      const topLeft = iy * VERTS_PER_ROW + ix;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + VERTS_PER_ROW;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }

  const northPole = tilePositions.length / 2; tilePositions.push(0.5, 0.0); poleFlags.push(0, -40000);
  const southPole = tilePositions.length / 2; tilePositions.push(0.5, 1.0); poleFlags.push(0, 40000);
  const bottomRowStart = N * VERTS_PER_ROW;
  for (let ix = 0; ix < N; ix++) indices.push(northPole, ix, ix + 1);                                    // north cap fan
  for (let ix = 0; ix < N; ix++) indices.push(bottomRowStart + ix, southPole, bottomRowStart + ix + 1);  // south cap fan

  return { tilePositions, poleFlags, indices };
}

function createBuffer(gl, target, data) {
  const buffer = gl.createBuffer();
  gl.bindBuffer(target, buffer);
  gl.bufferData(target, data, gl.STATIC_DRAW);
  return buffer;
}

function bindVec2Attribute(gl, buffer, location) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
}

/**
 * Build the custom shadow layer.
 * @param {{ center:number[], axis:number[], sunDir:number[], rMax:number,
 *           profile:Uint8Array|null, profileVersion:number, ready:boolean }} shadowState
 *   Shared, mutated by the component each frame. `ready` gates the first render; `profileVersion`
 *   bumps whenever `profile` (the coverage LUT) changes so the texture is re-uploaded.
 */
export function createMoonShadowLayer(shadowState) {
  const programByVariant = {}; // projectTile differs per projection variant (globe/mercator/transition)

  return {
    id: 'moon-shadow',
    type: 'custom',
    renderingMode: '2d',

    onAdd(_map, gl) {
      const mesh = buildGlobeMesh();
      this.indexCount = mesh.indices.length;
      this.positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(mesh.tilePositions));
      this.poleFlagBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(mesh.poleFlags));
      this.indexBuffer = createBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(mesh.indices));

      // 1D coverage LUT as an N×1 R8 texture (linear-filterable → smooth penumbra).
      this.profileTexture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.profileTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      this.uploadedProfileVersion = -1;
    },

    _programFor(gl, shaderData) {
      const cached = programByVariant[shaderData.variantName];
      if (cached) return cached;
      const program = compileProgram(gl, vertexShaderSource(shaderData), FRAGMENT_SHADER);
      const uniform = (name) => gl.getUniformLocation(program, name);
      const built = {
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

    render(gl, options) {
      if (!shadowState.ready) return;
      const { program, attribs, uniforms } = this._programFor(gl, options.shaderData);
      const projection = options.defaultProjectionData;
      gl.useProgram(program);

      // MapLibre's projection uniforms (supplied via the shader prelude).
      if (uniforms.projMatrix) gl.uniformMatrix4fv(uniforms.projMatrix, false, projection.mainMatrix);
      if (uniforms.tileMercatorCoords && projection.tileMercatorCoords) gl.uniform4fv(uniforms.tileMercatorCoords, projection.tileMercatorCoords);
      if (uniforms.clippingPlane && projection.clippingPlane) gl.uniform4fv(uniforms.clippingPlane, projection.clippingPlane);
      if (uniforms.transition != null && projection.projectionTransition != null) gl.uniform1f(uniforms.transition, projection.projectionTransition);
      if (uniforms.fallbackMatrix && projection.fallbackMatrix) gl.uniformMatrix4fv(uniforms.fallbackMatrix, false, projection.fallbackMatrix);

      // Shadow axis + profile.
      gl.uniform3fv(uniforms.sunDir, shadowState.sunDir);
      gl.uniform3fv(uniforms.center, shadowState.center);
      gl.uniform3fv(uniforms.axis, shadowState.axis);
      gl.uniform1f(uniforms.rMax, shadowState.rMax);

      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.profileTexture);
      if (shadowState.profile && shadowState.profileVersion !== this.uploadedProfileVersion) {
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, shadowState.profile.length, 1, 0, gl.RED, gl.UNSIGNED_BYTE, shadowState.profile);
        this.uploadedProfileVersion = shadowState.profileVersion;
      }
      gl.uniform1i(uniforms.profile, 0);

      bindVec2Attribute(gl, this.positionBuffer, attribs.tilePos);
      bindVec2Attribute(gl, this.poleFlagBuffer, attribs.poleFlag);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);

      // Blend the darkening over the tiles; cull the far hemisphere; ignore depth.
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.enable(gl.CULL_FACE);
      gl.cullFace(gl.BACK);
      gl.disable(gl.DEPTH_TEST);
      gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
      gl.disable(gl.CULL_FACE);
    }
  };
}
