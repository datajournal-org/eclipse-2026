import type { Messages } from './de';

// Typed against the German reference: a missing or misspelled key is a compile error.
const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 August 2026',
		page_title: 'Total solar eclipse, 12 August 2026 — what will you see?',
		page_description:
			'The first total solar eclipse over mainland Europe since 1999. Simulate it for your location right now.',
		og_image_alt: 'Earth from space: the eclipse shadow sweeping from Iceland across the Atlantic to Spain.'
	},
	nav: { about: 'About', language: 'Language' },
	countdown: {
		to_totality: 'until the peak of the total solar eclipse',
		since: 'The first total solar eclipse over mainland Europe since 1999.',
		happening: 'The eclipse is happening now.',
		past: 'The eclipse is over.',
		d: 'd',
		h: 'h',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'Shadow run',
		subtitle: 'The Moon’s shadow sweeps across the Earth.',
		current_shadow: 'Current shadow',
		path: 'Path',
		core: 'Umbra',
		loading: 'Loading globe …',
		load_error: 'Could not load the globe. Please reload the page.',
		toggle_overlay: 'Toggle lines & corridor',
		two_fingers: 'Use two fingers to move the map',
		zoom_ctrl: 'Use Ctrl + scroll to zoom the map',
		zoom_cmd: 'Use ⌘ + scroll to zoom the map'
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
		geo_busy: 'Locating …',
		search: 'Search a city or address',
		searching: 'Searching …',
		no_results: 'Nothing found',
		geo_error: 'Location unavailable. Search a place or tap the map.',
		search_error: 'Search failed. Please try again.',
		adjust_hint: 'Drag the pin or tap the map to adjust the spot.',
		use_here: 'Use this location',
		verdict_total: 'Totality',
		verdict_partial: 'partial',
		verdict_none: 'not visible'
	},
	b: { your_sky: 'Your sky', change: 'Change location', clear: 'Remove location', prep: 'Your preparation' },

	b1: {
		total: 'Total solar eclipse',
		partial: 'Partial solar eclipse',
		not_visible: 'Not visible from here',
		not_visible_note: 'At maximum the Sun is already below the horizon.',
		not_reached: 'This eclipse does not reach your location.',
		next_here: 'Next eclipse visible from here: {date} — {kind}, {pct}\u2009% covered.',
		kind_total: 'total',
		kind_partial: 'partial',
		kind_annular: 'annular',
		obscured: '{pct}\u2009% of the Sun covered',
		max_at: 'Maximum at {time}',
		sun_alt: 'Sun {alt}° above the horizon',
		sun_below: 'Sun below the horizon',
		safe_total:
			'Only during totality ({from}–{to}) may you look without glasses — otherwise always wear eclipse glasses.',
		safe_partial:
			'Certified eclipse glasses (ISO 12312-2) required the whole time — even a brief look at the Sun can permanently damage your eyes.'
	},
	b3: {
		title: 'Your view of the Sun',
		subtitle: 'The Sun over your place — drag to look around.',
		altitude: 'Altitude',
		azimuth: 'Azimuth',
		coverage: 'Coverage',
		loading: 'Loading terrain …',
		recenter: 'Reset view',
		phase_start: 'Start',
		phase_max: 'Maximum',
		phase_end: 'End',
		sunset: 'Sunset',
		// Compass points for the horizon ruler and the azimuth chip (cardinal initials are locale-specific)
		// Planet labels in the sky view, faded in with their planet's visibility
		planets: { venus: 'Venus', mercury: 'Mercury', jupiter: 'Jupiter' },
		compass: { n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW', w: 'W', nw: 'NW' }
	},
	b6: {
		title: 'Your checklist',
		until_max: 'until maximum',
		past: 'Maximum has passed.',
		glasses: 'Protect your eyes with certified eclipse glasses (ISO 12312-2).',
		glasses_why:
			'Ordinary sunglasses are not enough for this. Looking at the Sun without certified eclipse glasses risks lasting eye damage.',
		view: 'Do you have a clear view to the west?',
		view_why:
			'Check in advance whether trees, buildings, mountains or other obstacles hide the Sun at that time. If need be, pick a different spot.',
		weather: 'Check the weather forecast a few days ahead.',
		weather_why:
			'Under thick clouds only a change of place helps. Check the forecast in time so you can move somewhere else if necessary.',
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
	donate: {
		text: 'It took many evenings to develop this app. Nevertheless, it is my gift to you and your friends: there are no ads or tracking. If you like it, please consider leaving a small tip.',
		button: 'Leave a tip'
	},
	footer: {
		source: 'Source code on GitHub',
		translation: 'Improve this translation',
		imprint: 'Imprint'
	},
	safety: 'Never look at the Sun without certified eclipse glasses (ISO 12312-2).'
};

export default messages;
