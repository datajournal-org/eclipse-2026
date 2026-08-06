import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderCorridorModule, round5 } from './corridorModule';
import { computeCorridor } from './corridorCompute';

const SAMPLE = {
	north: [
		[114.659433, 75.042904],
		[-25.2524, 65.2222]
	],
	south: [
		[114.659433, 75.042904],
		[-24.9, 64.8]
	]
} as { north: [number, number][]; south: [number, number][] };

describe('round5', () => {
	it('keeps five decimal places (~1 m)', () => {
		expect(round5(114.6594335)).toBe(114.65943);
		expect(round5(-25.2523751)).toBe(-25.25238);
		expect(round5(0)).toBe(0);
	});

	it('drops trailing precision that would only bloat the file', () => {
		expect(String(round5(65.22220349904109))).toBe('65.2222');
	});
});

describe('renderCorridorModule', () => {
	const source = renderCorridorModule(SAMPLE);

	it('marks the file as generated and says how to rebuild it', () => {
		expect(source.startsWith('// AUTO-GENERATED')).toBe(true);
		// The named command must be one that actually exists: this header used to say `npm run corridor`,
		// a script that was never in package.json, and this very test pinned the broken instruction.
		expect(source).toContain('npm run precompute');
		const scripts = JSON.parse(readFileSync('package.json', 'utf8')).scripts as Record<string, string>;
		expect(Object.keys(scripts)).toContain('precompute');
	});

	it('imports and applies the shared type', () => {
		expect(source).toContain(`import type { CorridorEdges } from './corridorCompute';`);
		expect(source).toContain('export const corridorEdges: CorridorEdges = {');
	});

	it('emits both edges', () => {
		expect(source).toContain('north: [[114.65943,75.0429],[-25.2524,65.2222]]');
		expect(source).toContain('south: [[114.65943,75.0429],[-24.9,64.8]]');
	});

	it('ends with a newline', () => {
		expect(source.endsWith('};\n')).toBe(true);
	});

	it('round-trips: the emitted literal parses back to the rounded input', () => {
		const parsed = parseGenerated(source);
		expect(parsed.north).toEqual(SAMPLE.north.map(([a, b]) => [round5(a), round5(b)]));
		expect(parsed.south).toEqual(SAMPLE.south.map(([a, b]) => [round5(a), round5(b)]));
	});

	// Explicit budget: this recomputes the whole corridor (~1.6 s alone) and shares the worker pool with
	// every other node suite, so the default 5 s leaves it at the mercy of what else is running. Same
	// reasoning as the globe sweep in eclipse.test.ts.
	it('renders the real corridor as valid, parseable data', () => {
		const parsed = parseGenerated(renderCorridorModule(computeCorridor()));
		expect(parsed.north.length).toBeGreaterThan(100);
		expect(parsed.south).toHaveLength(parsed.north.length);
		for (const edge of [parsed.north, parsed.south]) {
			for (const [lon, lat] of edge) {
				expect(Number.isFinite(lon) && Number.isFinite(lat)).toBe(true);
				expect(Math.abs(lat)).toBeLessThanOrEqual(90);
			}
		}
	}, 30_000);

	it('handles empty edges without emitting broken syntax', () => {
		const parsed = parseGenerated(renderCorridorModule({ north: [], south: [] }));
		expect(parsed).toEqual({ north: [], south: [] });
	});

	it('is Prettier-compatible: tabs for indentation, no trailing comma', () => {
		// The repo checks formatting on every file, generated ones included.
		expect(source).toContain('\tnorth: ');
		expect(source).toContain('\tsouth: ');
		expect(source).not.toMatch(/,\s*\n};/);
	});
});

/** Pull the two coordinate arrays back out of the generated source. */
function parseGenerated(source: string): { north: [number, number][]; south: [number, number][] } {
	const grab = (key: 'north' | 'south') => {
		const match = source.match(new RegExp(`${key}: (\\[.*?\\])(?:,\\n|\\n)`, 's'));
		if (!match) throw new Error(`no ${key} array in generated source`);
		return JSON.parse(match[1]) as [number, number][];
	};
	return { north: grab('north'), south: grab('south') };
}
