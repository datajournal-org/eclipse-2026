// A MapLibre CustomLayerInterface that paints a realistic, per-pixel Moon shadow onto the
// globe: day/night terminator + umbra/penumbra, using MapLibre's own projection so the shadow
// sits correctly on the sphere (poles included). The layer reads a small shared `shadowState`
// object that the component updates every frame from the timeline.

// Segments per axis of the full-globe overlay mesh.
const GRID_RESOLUTION = 200;

// Moon radius in Earth radii (same unit as `shadowState.moonPos`); see obscurationField.js.
const MOON_RADIUS_IN_EARTH_RADII = 0.27271;

// Fragment shader: for each pixel's ground point, work out how much of the Sun is covered and
// how brightly lit it is, then output a translucent darkening over the satellite tiles.
const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 v_surfaceDir;                 // unit vector from Earth's centre to this ground point
uniform vec3 u_sunDir;                // unit direction to the Sun (Earth-fixed frame)
uniform vec3 u_moonPos;               // Moon position, Earth radii
uniform float u_sunAngularRadius;     // Sun's angular radius, radians
out vec4 fragColor;

// Fraction of the Sun's disc hidden by the Moon's disc (two-circle lens overlap).
float discOverlap(float sunR, float moonR, float sep) {
  if (sep >= sunR + moonR) return 0.0;
  if (sep <= abs(moonR - sunR)) return moonR >= sunR ? 1.0 : (moonR * moonR) / (sunR * sunR);
  float a = clamp((sep * sep + sunR * sunR - moonR * moonR) / (2.0 * sep * sunR), -1.0, 1.0);
  float b = clamp((sep * sep + moonR * moonR - sunR * sunR) / (2.0 * sep * moonR), -1.0, 1.0);
  float lens = sunR * sunR * acos(a) + moonR * moonR * acos(b)
    - 0.5 * sqrt(max(0.0, (-sep + sunR + moonR) * (sep + sunR - moonR) * (sep - sunR + moonR) * (sep + sunR + moonR)));
  return lens / (3.141592653 * sunR * sunR);
}

void main() {
  vec3 surfaceDir = normalize(v_surfaceDir);
  float sinElevation = dot(surfaceDir, u_sunDir);
  float dayness = smoothstep(-0.18, 0.10, sinElevation);          // soft day/night terminator

  vec3 toMoon = u_moonPos - surfaceDir;
  float moonAngularRadius = ${MOON_RADIUS_IN_EARTH_RADII} / length(toMoon);
  float separation = acos(clamp(dot(u_sunDir, normalize(toMoon)), -1.0, 1.0));
  float coverage = discOverlap(u_sunAngularRadius, moonAngularRadius, separation);

  // From space the ground brightness ≈ 1 − coverage; the night side is darkened toward 0.09.
  float eclipseBrightness = 1.0 - coverage * 0.97;
  float brightness = mix(0.09, 1.0, dayness) * mix(1.0, eclipseBrightness, dayness);

  float alpha = clamp(1.0 - brightness, 0.0, 0.92);               // overlay opacity over the tiles
  if (alpha < 0.004) discard;                                     // bright, uneclipsed day: leave tiles

  vec3 nightTint = vec3(0.015, 0.03, 0.07);                       // deep-blue night
  vec3 umbraTint = vec3(0.0, 0.005, 0.02);                        // near-black core of totality
  vec3 color = mix(nightTint, umbraTint, smoothstep(0.45, 1.0, coverage) * dayness);
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
  for (let ix = 0; ix < N; ix++) indices.push(northPole, ix, ix + 1);                          // north cap fan
  for (let ix = 0; ix < N; ix++) indices.push(bottomRowStart + ix, southPole, bottomRowStart + ix + 1); // south cap fan

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
 * @param {{ sunDir: number[], moonPos: number[], sunAngularRadius: number, ready: boolean }} shadowState
 *   Shared, mutated by the component each frame. `ready` gates the first render.
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
          moonPos: uniform('u_moonPos'),
          sunAngularRadius: uniform('u_sunAngularRadius')
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

      // Current Sun/Moon state.
      gl.uniform3fv(uniforms.sunDir, shadowState.sunDir);
      gl.uniform3fv(uniforms.moonPos, shadowState.moonPos);
      gl.uniform1f(uniforms.sunAngularRadius, shadowState.sunAngularRadius);

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
