// German — the reference locale. Its shape defines the `Messages` type every other catalogue must match,
// so a missing or misspelled key in any locale is a compile error.
const messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12. August 2026',
		page_title: 'Sonnenfinsternis 12. August 2026 — was du von hier siehst',
		page_description:
			'Wie viel wird an deinem Ort bedeckt, wann ist das Maximum, und hast du freie Sicht nach Westen? Die erste totale Finsternis über Europa seit 1999.',
		og_image_alt:
			'Die Erdkugel aus dem All: der Schatten der Sonnenfinsternis zieht zwischen Island und Spanien über den Atlantik'
	},
	nav: { about: 'Über', language: 'Sprache' },
	countdown: {
		to_totality: 'bis zum Höhepunkt der totalen Sonnenfinsternis',
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
		subtitle: 'Der Mondschatten zieht über die Erde.',
		current_shadow: 'Aktueller Schatten',
		path: 'Pfad',
		core: 'Kernschatten',
		loading: 'Globus wird geladen …',
		load_error: 'Globus konnte nicht geladen werden. Bitte Seite neu laden.',
		toggle_overlay: 'Linien & Korridor ein/aus',
		two_fingers: 'Karte mit zwei Fingern bewegen'
	},
	a3: {
		title: 'Wie sieht das aus?',
		note: 'Drei Orte, dasselbe Ereignis, völlig anderes Erlebnis.'
	},
	a4: {
		cta_title: 'Wähle deinen Standort, um deine persönliche Finsternis zu sehen',
		cta_sub: 'Wie hoch steht die Sonne, wie viel wird bedeckt – und liegst du in der Totalitätszone?',
		choose: 'Standort wählen',
		close: 'Schließen',
		geo: 'Meinen Standort verwenden',
		geo_busy: 'Standort wird ermittelt …',
		search: 'Stadt oder Adresse suchen',
		searching: 'Suche …',
		no_results: 'Nichts gefunden',
		geo_error: 'Standort nicht verfügbar. Bitte suche einen Ort oder tippe auf die Karte.',
		search_error: 'Suche fehlgeschlagen. Bitte versuch es noch einmal.',
		adjust_hint: 'Pin ziehen oder auf die Karte tippen, um den Ort anzupassen.',
		use_here: 'Diesen Ort verwenden',
		verdict_total: 'Totalität',
		verdict_partial: 'partiell',
		verdict_none: 'nicht sichtbar'
	},
	b: { your_sky: 'Dein Himmel', change: 'ändern', clear: 'Ort entfernen', prep: 'Deine Vorbereitung' },

	b1: {
		total: 'Totale Sonnenfinsternis',
		partial: 'Partielle Sonnenfinsternis',
		not_visible: 'Von hier aus nicht sichtbar',
		not_visible_note: 'Beim Maximum steht die Sonne schon unter dem Horizont.',
		not_reached: 'Diese Finsternis erreicht deinen Ort nicht.',
		next_here: 'Nächste von hier sichtbare Finsternis: {date} — {kind}, {pct}\u2009% bedeckt.',
		kind_total: 'total',
		kind_partial: 'partiell',
		kind_annular: 'ringförmig',
		obscured: '{pct}\u2009% der Sonne bedeckt',
		max_at: 'Maximum um {time}',
		sun_alt: 'Sonne {alt}° über dem Horizont',
		sun_below: 'Sonne unter dem Horizont',
		safe_total: 'Nur während der Totalität ({from}–{to}) ohne Brille — sonst immer Schutzbrille.',
		safe_partial:
			'Durchgehend zertifizierte Finsternisbrille (ISO 12312-2) nötig — schon ein kurzer Blick in die Sonne kann die Augen dauerhaft schädigen.'
	},
	b3: {
		title: 'Deine Sicht zur Sonne',
		subtitle: 'Die Sonne über deinem Ort — zieh zum Umschauen.',
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
		sunset: 'Sonnenuntergang',
		// Compass points for the horizon ruler and the azimuth chip (cardinal initials are locale-specific)
		compass: { n: 'N', ne: 'NO', e: 'O', se: 'SO', s: 'S', sw: 'SW', w: 'W', nw: 'NW' }
	},
	b6: {
		title: 'Deine Checkliste',
		until_max: 'bis zum Maximum',
		past: 'Das Maximum ist vorüber.',
		glasses: 'Zertifizierte Sonnenfinsternisbrille (ISO 12312-2)',
		glasses_why: 'Normale Sonnenbrillen reichen nicht — ohne Schutz drohen bleibende Augenschäden.',
		view: 'Freie Sicht nach Westen (Azimut {az}°)',
		view_why: 'Prüfe vorher, ob Gebäude oder Bäume die Sonne zu dieser Zeit verdecken.',
		weather: 'Wettervorhersage prüfen',
		weather_why: 'Bei dichter Bewölkung hilft nur ein Ortswechsel — plane eine Alternative ein.',
		add_calendar: '📅 Zum Kalender hinzufügen',
		event_title: 'Sonnenfinsternis 2026'
	},
	tz: {
		all_in: 'Alle Zeiten in deiner Zeitzone: {zone}',
		note: 'Zeitzone deines Geräts – nicht unbedingt die des Beobachtungsorts.'
	},
	placeholder: {
		b1: 'Verdikt-Karte',
		b1_note: 'Bedeckungsgrad, Kontaktzeiten und Augenschutz-Verdikt für deinen Ort — folgt.'
	},
	donate: {
		text: 'In dieser App stecken viele Abende Arbeit. Trotzdem schenke ich sie dir und deinen Freunden – ohne Werbung und ohne Tracking. Wenn sie dir gefällt, freue ich mich über ein kleines Trinkgeld.',
		button: 'Trinkgeld hinterlassen'
	},
	footer: {
		source: 'Quelltext auf GitHub',
		translation: 'Diese Übersetzung verbessern'
	},
	safety: 'Nie ohne geprüfte Finsternisbrille (ISO 12312-2) in die Sonne schauen.'
};

/** The message shape every locale must implement, defined by the German reference locale. */
export type Messages = typeof messages;
export default messages;
