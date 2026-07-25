import type { Messages } from './de';

// Typed against the German reference: a missing or misspelled key is a compile error.
const messages: Messages = {
	app: { title: 'Eclipse 2026', tagline: '12 August 2026' },
	nav: { about: 'About', language: 'Language' },
	countdown: {
		to_totality: 'until the total solar eclipse',
		since: 'The first total solar eclipse over Europe since 1999.',
		happening: 'The eclipse is happening now.',
		past: 'The eclipse is over.',
		d: 'd',
		h: 'h',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'Shadow run',
		subtitle:
			"The Moon's shadow sweeps across Earth — the totality corridor as a band, the current shadow is live from the timeline.",
		current_shadow: 'Current shadow',
		path: 'Path',
		core: 'Umbra',
		loading: 'Loading globe …',
		toggle_overlay: 'Toggle lines & corridor'
	},
	a3: {
		title: 'What does it look like?',
		note: 'Three places, the same event, a completely different experience.'
	},
	a4: {
		title: 'What will you see from where you are?',
		geo: 'Use my location',
		search: 'Search a place',
		map: 'Tap on the map',
		manual_hint: 'or enter coordinates (lat, lon)',
		use: 'Set',
		geo_error: 'Location unavailable. Please search a place or enter coordinates.',
		soon: 'coming soon'
	},
	b: { your_sky: 'Your sky', change: 'change', clear: 'Remove location' },
	placeholder: {
		b1: 'Verdict card',
		b1_note: 'Obscuration, contact times and eye-safety verdict for your location — coming soon.',
		b2: 'Personal timeline',
		b2_note: 'First contact → maximum → sunset with local times — coming soon.',
		b3: '3D horizon',
		b3_note: 'The eclipsed Sun over your surroundings with mountains and buildings — coming soon.',
		b6: 'Checklist & countdown',
		b6_note: 'Eclipse glasses, a clear western view, calendar export — coming soon.'
	},
	safety: 'Never look at the Sun without certified eclipse glasses (ISO 12312-2).'
};

export default messages;
