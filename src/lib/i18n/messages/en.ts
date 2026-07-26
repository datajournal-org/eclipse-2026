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

	b1: {
		total: 'Total solar eclipse',
		partial: 'Partial solar eclipse',
		not_visible: 'Not visible from here',
		not_visible_note: 'At maximum the Sun is already below the horizon.',
		obscured: '{pct}\u2009% of the Sun covered',
		max_at: 'Maximum at {time}',
		sun_alt: 'Sun {alt}° above the horizon',
		sun_below: 'Sun below the horizon',
		safe_total:
			'Only during totality ({from}–{to}) may you look without glasses — otherwise always wear eclipse glasses.',
		safe_partial: 'Certified eclipse glasses (ISO 12312-2) required the whole time.'
	},
	b2: {
		title: 'Your timeline',
		first_contact: 'First contact',
		total_begin: 'Totality',
		maximum: 'Maximum',
		total_end: 'Totality ends',
		last_contact: 'Last contact',
		sunset: 'Sunset',
		below_horizon: 'below horizon',
		tz_note: 'All times in your timezone.'
	},
	b3: {
		title: 'Your view of the Sun',
		subtitle: 'Your location and the Sun’s path — drag to look around, mind a clear view.',
		altitude: 'Altitude',
		azimuth: 'Azimuth',
		coverage: 'Coverage',
		loading: 'Loading terrain …',
		recenter: 'Reset view',
		zoom_in: 'Zoom in',
		zoom_out: 'Zoom out'
	},
	b6: {
		title: 'Your checklist',
		until_max: 'until maximum',
		past: 'Maximum has passed.',
		glasses: 'Certified eclipse glasses (ISO 12312-2)',
		view: 'Clear view to the west (azimuth {az}°)',
		weather: 'Check the weather forecast',
		add_calendar: '📅 Add to calendar',
		event_title: 'Solar eclipse 2026'
	},
	placeholder: {
		b1: 'Verdict card',
		b1_note: 'Obscuration, contact times and eye-safety verdict for your location — coming soon.'
	},
	safety: 'Never look at the Sun without certified eclipse glasses (ISO 12312-2).'
};

export default messages;
