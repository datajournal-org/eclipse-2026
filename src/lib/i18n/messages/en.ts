import type { Messages } from './de';

// Typed against the German reference: a missing or misspelled key is a compile error.
const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 August 2026',
		page_title: 'Solar eclipse on 12 August 2026',
		page_description:
			'The first total solar eclipse over Europe since 1999. See how much of the Sun is covered where you are.',
		og_image_alt: 'The eclipsed Sun with its corona visible'
	},
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
		load_error: 'Could not load the globe. Please reload the page.',
		toggle_overlay: 'Toggle lines & corridor'
	},
	a3: {
		title: 'What does it look like?',
		note: 'Three places, the same event, a completely different experience.'
	},
	a4: {
		cta_title: 'Choose your location to see your personal eclipse',
		cta_sub: 'How high is the Sun, how much gets covered — and are you in the totality path?',
		choose: 'Choose location',
		close: 'Close',
		geo: 'Use my location',
		search: 'Search a city or address',
		searching: 'Searching …',
		no_results: 'Nothing found',
		geo_error: 'Location unavailable. Search a place or tap the map.',
		adjust_hint: 'Drag the pin or tap the map to adjust the spot.',
		use_here: 'Use this location',
		verdict_total: 'Totality',
		verdict_partial: 'partial',
		verdict_none: 'not visible'
	},
	b: { your_sky: 'Your sky', change: 'change', clear: 'Remove location', prep: 'Your preparation' },

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
	b3: {
		title: 'Your view of the Sun',
		subtitle: 'Your location and the Sun’s path — drag to look around, mind a clear view.',
		altitude: 'Altitude',
		azimuth: 'Azimuth',
		coverage: 'Coverage',
		loading: 'Loading terrain …',
		recenter: 'Reset view',
		zoom_in: 'Zoom in',
		zoom_out: 'Zoom out',
		phase_start: 'Start',
		phase_max: 'Maximum',
		phase_end: 'End',
		sunset: 'Sunset'
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
	tz: {
		all_in: 'All times in your time zone: {zone}',
		note: "Your device's time zone — not necessarily the one at the viewing site."
	},
	placeholder: {
		b1: 'Verdict card',
		b1_note: 'Obscuration, contact times and eye-safety verdict for your location — coming soon.'
	},
	safety: 'Never look at the Sun without certified eclipse glasses (ISO 12312-2).'
};

export default messages;
