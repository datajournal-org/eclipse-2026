/**
 * Test doubles for the MapLibre surfaces the adapter modules touch.
 *
 * These modules are thin, but they are exactly where a silent typo — a wrong uniform name, a paint
 * property that does not exist, a listener never removed — breaks B3 with no error anywhere. The fakes
 * record calls so the tests can assert the contract without a GPU.
 */
import { vi } from 'vitest';

export type Recorded = { name: string; args: unknown[] };

/** A minimal WebGL2 context that records the calls the custom layers make. */
export function createFakeGl() {
	const calls: Recorded[] = [];
	const record =
		<T>(name: string, result: T) =>
		(...args: unknown[]) => {
			calls.push({ name, args });
			return result;
		};

	const gl = {
		calls,
		// enums the layers reference
		VERTEX_SHADER: 35633,
		FRAGMENT_SHADER: 35632,
		COMPILE_STATUS: 35713,
		LINK_STATUS: 35714,
		ARRAY_BUFFER: 34962,
		STATIC_DRAW: 35044,
		DYNAMIC_DRAW: 35048,
		FLOAT: 5126,
		LINE_STRIP: 3,
		TRIANGLE_STRIP: 5,
		TRIANGLES: 4,
		BLEND: 3042,
		DEPTH_TEST: 2929,
		SRC_ALPHA: 770,
		ONE_MINUS_SRC_ALPHA: 771,
		ONE: 1,
		TEXTURE_2D: 3553,
		TEXTURE0: 33984,
		RGBA: 6408,
		RGBA32F: 34836,
		R32F: 33326,
		RED: 6403,
		UNSIGNED_BYTE: 5121,
		TEXTURE_MIN_FILTER: 10241,
		TEXTURE_MAG_FILTER: 10240,
		TEXTURE_WRAP_S: 10242,
		TEXTURE_WRAP_T: 10243,
		LINEAR: 9729,
		NEAREST: 9728,
		CLAMP_TO_EDGE: 33071,
		ELEMENT_ARRAY_BUFFER: 34963,
		UNSIGNED_INT: 5125,
		CULL_FACE: 2884,
		BACK: 1029,
		LESS: 513,
		R16F: 33325,
		UNPACK_ALIGNMENT: 3317,
		drawingBufferWidth: 800,
		drawingBufferHeight: 600,
		cullFace: (...args: unknown[]) => void calls.push({ name: 'cullFace', args }),
		depthFunc: (...args: unknown[]) => void calls.push({ name: 'depthFunc', args }),

		createShader: record('createShader', {} as WebGLShader),
		shaderSource: record('shaderSource', undefined),
		compileShader: record('compileShader', undefined),
		getShaderParameter: record('getShaderParameter', true),
		getShaderInfoLog: record('getShaderInfoLog', ''),
		deleteShader: record('deleteShader', undefined),
		createProgram: record('createProgram', {} as WebGLProgram),
		attachShader: record('attachShader', undefined),
		linkProgram: record('linkProgram', undefined),
		getProgramParameter: record('getProgramParameter', true),
		getProgramInfoLog: record('getProgramInfoLog', ''),
		useProgram: record('useProgram', undefined),
		deleteProgram: record('deleteProgram', undefined),
		getAttribLocation: record('getAttribLocation', 0),
		getUniformLocation: (_p: unknown, name: string) => {
			calls.push({ name: 'getUniformLocation', args: [name] });
			return { name } as unknown as WebGLUniformLocation;
		},
		createBuffer: record('createBuffer', {} as WebGLBuffer),
		bindBuffer: record('bindBuffer', undefined),
		bufferData: record('bufferData', undefined),
		deleteBuffer: record('deleteBuffer', undefined),
		enableVertexAttribArray: record('enableVertexAttribArray', undefined),
		disableVertexAttribArray: record('disableVertexAttribArray', undefined),
		vertexAttribPointer: record('vertexAttribPointer', undefined),
		createTexture: record('createTexture', {} as WebGLTexture),
		bindTexture: record('bindTexture', undefined),
		texImage2D: record('texImage2D', undefined),
		texSubImage2D: record('texSubImage2D', undefined),
		texParameteri: record('texParameteri', undefined),
		deleteTexture: record('deleteTexture', undefined),
		activeTexture: record('activeTexture', undefined),
		pixelStorei: record('pixelStorei', undefined),
		uniform1i: record('uniform1i', undefined),
		uniform1f: record('uniform1f', undefined),
		uniform2f: record('uniform2f', undefined),
		uniform2fv: record('uniform2fv', undefined),
		uniform3f: record('uniform3f', undefined),
		uniform3fv: record('uniform3fv', undefined),
		uniform4f: record('uniform4f', undefined),
		uniform4fv: record('uniform4fv', undefined),
		uniformMatrix4fv: record('uniformMatrix4fv', undefined),
		enable: record('enable', undefined),
		disable: record('disable', undefined),
		blendFunc: record('blendFunc', undefined),
		blendFuncSeparate: record('blendFuncSeparate', undefined),
		depthMask: record('depthMask', undefined),
		drawArrays: record('drawArrays', undefined),
		drawElements: record('drawElements', undefined),
		getExtension: record('getExtension', {}),

		/** Every recorded call with the given name. */
		callsTo(name: string) {
			return calls.filter((c) => c.name === name);
		},
		/** Uniform names the layer looked up. */
		uniformNames() {
			return calls.filter((c) => c.name === 'getUniformLocation').map((c) => c.args[0] as string);
		},
		/** Uniform-setter calls, keyed by the location object the layer passed. */
		uniformWrites() {
			return calls
				.filter((c) => c.name.startsWith('uniform'))
				.map((c) => ({
					setter: c.name,
					uniform: (c.args[0] as { name?: string } | null)?.name,
					value: c.args.slice(1)
				}));
		},
		drawCalls() {
			return calls.filter((c) => c.name === 'drawArrays' || c.name === 'drawElements');
		},
		reset() {
			calls.length = 0;
		}
	};
	return gl as typeof gl & WebGL2RenderingContext;
}

export type FakeGl = ReturnType<typeof createFakeGl>;

/** The shaderData MapLibre hands a custom layer's render method. */
export const fakeShaderData = {
	variantName: 'globe',
	vertexShaderPrelude: '// prelude\nvec4 projectTile(vec2 p, vec2 o) { return vec4(p, 0.0, 1.0); }',
	define: '#define GLOBE'
};

/** The render input MapLibre passes alongside it. */
export const fakeRenderInput = {
	shaderData: fakeShaderData,
	defaultProjectionData: {
		mainMatrix: new Float64Array(16).fill(0),
		tileMercatorCoords: [0, 0, 1, 1] as [number, number, number, number],
		clippingPlane: [0, 0, 1, 0] as [number, number, number, number],
		projectionTransition: 1,
		fallbackMatrix: new Float64Array(16).fill(0)
	}
};

/**
 * A MapLibre `Map` double. Records every call; `terrainElevation` and the canvas are configurable
 * because the camera and Sun placement read them.
 */
export function createFakeMap(
	opts: {
		terrainElevation?: number | null;
		width?: number;
		height?: number;
		cameraPosition?: [number, number, number];
	} = {}
) {
	const calls: Recorded[] = [];
	const listeners = new Map<string, Set<EventListener>>();
	const canvas = {
		style: { cursor: '' } as CSSStyleDeclaration,
		width: opts.width ?? 800,
		height: opts.height ?? 600,
		clientWidth: opts.width ?? 800,
		clientHeight: opts.height ?? 600,
		addedListeners: [] as string[],
		removedListeners: [] as string[],
		addEventListener(type: string, fn: EventListener) {
			canvas.addedListeners.push(type);
			if (!listeners.has(type)) listeners.set(type, new Set());
			listeners.get(type)!.add(fn);
		},
		removeEventListener(type: string, fn: EventListener) {
			canvas.removedListeners.push(type);
			listeners.get(type)?.delete(fn);
		},
		/** Fire a canvas event as the browser would. */
		emit(type: string, event: Record<string, unknown> = {}) {
			for (const fn of listeners.get(type) ?? []) {
				fn({ preventDefault() {}, ...event } as unknown as Event);
			}
		}
	};

	const record =
		<T>(name: string, result: T) =>
		(...args: unknown[]) => {
			calls.push({ name, args });
			return result;
		};

	const map = {
		calls,
		canvas,
		// The slice of MapLibre's internal transform the sky layers read (see cameraMercator in
		// sunLayer.ts). worldSize/pixelsPerMeter of 1 make the internal space coincide with Mercator
		// space, so a test states the camera position directly in the units the layers work in.
		_camera: {
			transform: { cameraPosition: opts.cameraPosition ?? [0.5, 0.4, 0], worldSize: 1, pixelsPerMeter: 1 }
		},
		controls: [] as { control: unknown; position?: string }[],
		layers: [] as unknown[],
		sources: new Map<string, unknown>(),

		getCanvas: () => canvas,
		getContainer: () => canvas,
		queryTerrainElevation: (..._args: unknown[]) => {
			calls.push({ name: 'queryTerrainElevation', args: _args });
			return opts.terrainElevation === undefined ? 0 : opts.terrainElevation;
		},
		jumpTo: record('jumpTo', undefined),
		easeTo: record('easeTo', undefined),
		setLight: record('setLight', undefined),
		setPaintProperty: record('setPaintProperty', undefined),
		setLayoutProperty: record('setLayoutProperty', undefined),
		getLayer: (id: string) => map.layers.find((l) => (l as { id: string }).id === id),
		addLayer: (layer: unknown, before?: string) => {
			calls.push({ name: 'addLayer', args: [layer, before] });
			map.layers.push(layer);
		},
		removeLayer: (id: string) => {
			calls.push({ name: 'removeLayer', args: [id] });
			map.layers = map.layers.filter((l) => (l as { id: string }).id !== id);
		},
		addSource: (id: string, source: unknown) => {
			calls.push({ name: 'addSource', args: [id, source] });
			map.sources.set(id, source);
		},
		getSource: (id: string) => {
			calls.push({ name: 'getSource', args: [id] });
			return map.sources.get(id);
		},
		removeSource: (id: string) => {
			calls.push({ name: 'removeSource', args: [id] });
			map.sources.delete(id);
		},
		addControl: (control: unknown, position?: string) => {
			calls.push({ name: 'addControl', args: [control, position] });
			map.controls.push({ control, position });
		},
		removeControl: record('removeControl', undefined),
		triggerRepaint: record('triggerRepaint', undefined),
		getBearing: record('getBearing', 0),
		getPitch: record('getPitch', 0),
		getVerticalFieldOfView: record('getVerticalFieldOfView', 60),
		zoom: 12,
		getZoom: () => {
			calls.push({ name: 'getZoom', args: [] });
			return map.zoom;
		},
		project: (lngLat: [number, number]) => {
			calls.push({ name: 'project', args: [lngLat] });
			return { x: lngLat[0] * 10, y: -lngLat[1] * 10 };
		},
		/** Inverse of the `project` above: screen px back to lng/lat. */
		unproject: (point: [number, number]) => {
			calls.push({ name: 'unproject', args: [point] });
			return { lng: point[0] / 10, lat: -point[1] / 10 };
		},
		calculateCameraOptionsFromTo: (from: unknown, fromAlt: number, to: unknown, toAlt: number) => {
			calls.push({ name: 'calculateCameraOptionsFromTo', args: [from, fromAlt, to, toAlt] });
			return { center: to, bearing: 0, pitch: 80, elevation: fromAlt };
		},
		on: record('on', undefined),
		off: record('off', undefined),
		once: record('once', undefined),

		callsTo(name: string) {
			return calls.filter((c) => c.name === name);
		},
		lastCall(name: string) {
			return [...calls].reverse().find((c) => c.name === name);
		},
		reset() {
			calls.length = 0;
		}
	};
	return map;
}

export type FakeMap = ReturnType<typeof createFakeMap>;

/**
 * The tiny slice of the maplibre-gl runtime that frameSync and cameraController import. Typed as the
 * real thing so call sites read like production code; only these two members are ever touched.
 */
export const fakeMaplibregl = {
	LngLat: class LngLat {
		constructor(
			public lng: number,
			public lat: number
		) {}
	},
	MercatorCoordinate: {
		fromLngLat([lng, lat]: [number, number], altitude = 0) {
			// The real formula, so the tests exercise real numbers rather than a stand-in.
			const x = (180 + lng) / 360;
			const y = (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360;
			const z = altitude / (2 * Math.PI * 6378137 * Math.cos((lat * Math.PI) / 180));
			return { x, y, z };
		}
	}
} as unknown as {
	LngLat: typeof import('maplibre-gl').LngLat;
	MercatorCoordinate: typeof import('maplibre-gl').MercatorCoordinate;
};

/** Deterministic requestAnimationFrame: hand-pump the queue instead of waiting on a real frame. */
export function installFakeRaf() {
	let next = 1;
	const queued = new Map<number, FrameRequestCallback>();
	const request = vi.fn((cb: FrameRequestCallback) => {
		const id = next++;
		queued.set(id, cb);
		return id;
	});
	const cancel = vi.fn((id: number) => void queued.delete(id));
	vi.stubGlobal('requestAnimationFrame', request);
	vi.stubGlobal('cancelAnimationFrame', cancel);
	return {
		request,
		cancel,
		pending: () => queued.size,
		/** Run every queued callback once (which may queue more). */
		flush(times = 1) {
			for (let i = 0; i < times; i++) {
				const due = [...queued.entries()];
				queued.clear();
				for (const [, cb] of due) cb(performance.now());
			}
		}
	};
}
