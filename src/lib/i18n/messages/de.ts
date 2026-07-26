// German — the reference locale. Its shape defines the `Messages` type that en.ts and es.ts must match,
// so a missing or misspelled key in any locale is a compile error.
const messages = {
	app: { title: 'Eclipse 2026', tagline: '12. August 2026' },
	nav: { about: 'Über', language: 'Sprache' },
	countdown: {
		to_totality: 'bis zur totalen Sonnenfinsternis',
		since: 'Die erste totale Sonnenfinsternis über Europa seit 1999.',
		happening: 'Die Finsternis findet gerade statt.',
		past: 'Die Finsternis ist vorüber.',
		d: 'T',
		h: 'Std',
		m: 'Min',
		s: 'Sek'
	},
	a2: {
		title: 'Schattenlauf',
		subtitle:
			'Der Mondschatten zieht über die Erde — Totalitätszone als Band, aktueller Schatten live aus der Zeitleiste.',
		current_shadow: 'Aktueller Schatten',
		path: 'Pfad',
		core: 'Kernschatten',
		loading: 'Globus wird geladen …',
		toggle_overlay: 'Linien & Korridor ein/aus'
	},
	a3: {
		title: 'Wie sieht das aus?',
		note: 'Drei Orte, dasselbe Ereignis, völlig anderes Erlebnis.'
	},
	a4: {
		title: 'Was siehst du von dir aus?',
		geo: 'Standort verwenden',
		search: 'Ort suchen',
		map: 'Auf Karte tippen',
		manual_hint: 'oder Koordinaten eingeben (Breite, Länge)',
		use: 'Setzen',
		geo_error: 'Standort nicht verfügbar. Bitte Ort suchen oder Koordinaten eingeben.',
		soon: 'folgt'
	},
	b: { your_sky: 'Dein Himmel', change: 'ändern', clear: 'Ort entfernen' },

	b1: {
		total: 'Totale Sonnenfinsternis',
		partial: 'Partielle Sonnenfinsternis',
		not_visible: 'Von hier aus nicht sichtbar',
		not_visible_note: 'Beim Maximum steht die Sonne schon unter dem Horizont.',
		obscured: '{pct}\u2009% der Sonne bedeckt',
		max_at: 'Maximum um {time}',
		sun_alt: 'Sonne {alt}° über dem Horizont',
		sun_below: 'Sonne unter dem Horizont',
		safe_total: 'Nur während der Totalität ({from}–{to}) ohne Brille — sonst immer Schutzbrille.',
		safe_partial: 'Durchgehend zertifizierte Finsternisbrille (ISO 12312-2) nötig.'
	},
	b3: {
		title: 'Deine Sicht zur Sonne',
		subtitle: 'Dein Standort und die Bahn der Sonne — zieh zum Umschauen, achte auf freie Sicht.',
		altitude: 'Höhe',
		azimuth: 'Azimut',
		coverage: 'Bedeckung',
		loading: 'Gelände wird geladen …',
		recenter: 'Ansicht zurücksetzen',
		zoom_in: 'Vergrößern',
		zoom_out: 'Verkleinern',
		phase_start: 'Beginn',
		phase_max: 'Maximum',
		phase_end: 'Ende',
		sunset: 'Sonnenuntergang'
	},
	b6: {
		title: 'Deine Checkliste',
		until_max: 'bis zum Maximum',
		past: 'Das Maximum ist vorüber.',
		glasses: 'Zertifizierte Sonnenfinsternisbrille (ISO 12312-2)',
		view: 'Freie Sicht nach Westen (Azimut {az}°)',
		weather: 'Wettervorhersage prüfen',
		add_calendar: '📅 Zum Kalender hinzufügen',
		event_title: 'Sonnenfinsternis 2026'
	},
	placeholder: {
		b1: 'Verdikt-Karte',
		b1_note: 'Bedeckungsgrad, Kontaktzeiten und Augenschutz-Verdikt für deinen Ort — folgt.'
	},
	safety: 'Nie ohne geprüfte Finsternisbrille (ISO 12312-2) in die Sonne schauen.'
};

/** The message shape every locale must implement, defined by the German reference locale. */
export type Messages = typeof messages;
export default messages;
