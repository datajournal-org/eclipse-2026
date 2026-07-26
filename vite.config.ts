import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	// maplibre-gl loads its Web Worker as a sibling file (`new URL('./maplibre-gl-worker.mjs', import.meta.url)`).
	// If Vite pre-bundles maplibre into .vite/deps, that sibling isn't copied there → the worker 404s in dev
	// and vector maps (B3) never load. Excluding it makes Vite serve maplibre from node_modules, where the
	// worker resolves. (The production build is handled separately via setWorkerUrl in $lib/maplibre.ts.)
	optimizeDeps: { exclude: ['maplibre-gl'] }
});
