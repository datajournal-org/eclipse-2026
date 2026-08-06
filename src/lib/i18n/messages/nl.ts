import type { Messages } from './de';

const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 augustus 2026',
		page_title: 'Totale zonsverduistering, 12 augustus 2026 — wat ga jij zien?',
		page_description:
			'De eerste totale zonsverduistering boven het Europese vasteland sinds 1999. Simuleer de verduistering nu alvast voor jouw plaats.',
		og_headline: 'Simuleer de zonsverduistering voor jouw plaats',
		og_image_alt:
			'De bijna volledig verduisterde zon laag boven de daken van Madrid, gesimuleerd in het 3D-horizonbeeld van de app.'
	},
	nav: { about: 'Over', language: 'Taal' },
	countdown: {
		to_totality: 'tot het hoogtepunt van de totale zonsverduistering',
		since: 'De eerste totale zonsverduistering boven het Europese vasteland sinds 1999.',
		happening: 'De verduistering is nu bezig.',
		past: 'De verduistering is voorbij.',
		d: 'd',
		h: 'u',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'Schaduwloop',
		subtitle: 'De maanschaduw trekt over de aarde.',
		current_shadow: 'Actuele schaduw',
		path: 'Pad',
		core: 'Kernschaduw',
		loading: 'Globe wordt geladen …',
		load_error: 'De globe kon niet worden geladen. Herlaad de pagina.',
		toggle_overlay: 'Lijnen & corridor aan/uit',
		two_fingers: 'Beweeg de kaart met twee vingers',
		zoom_ctrl: 'Zoom met Ctrl + scrollen',
		zoom_cmd: 'Zoom met ⌘ + scrollen'
	},
	a3: {
		title: 'Hoe ziet dat eruit?',
		note: 'Drie plekken, dezelfde gebeurtenis, een totaal andere ervaring.'
	},
	a4: {
		cta_title: 'Kies je locatie om jouw persoonlijke verduistering te zien',
		cta_sub: 'Hoe hoog staat de zon, hoeveel wordt bedekt – en lig je in de totaliteitszone?',
		choose: 'Locatie kiezen',
		close: 'Sluiten',
		geo: 'Mijn locatie gebruiken',
		geo_busy: 'Locatie wordt bepaald …',
		search: 'Zoek een stad of adres',
		searching: 'Zoeken …',
		no_results: 'Niets gevonden',
		geo_error: 'Locatie niet beschikbaar. Zoek een plaats of tik op de kaart.',
		search_error: 'Zoeken mislukt. Probeer het opnieuw.',
		adjust_hint: 'Sleep de pin of tik op de kaart om de locatie aan te passen.',
		use_here: 'Deze locatie gebruiken',
		verdict_total: 'Totaliteit',
		verdict_partial: 'gedeeltelijk',
		verdict_none: 'niet zichtbaar'
	},
	b: { your_sky: 'Jouw hemel', change: 'Locatie wijzigen', clear: 'Locatie verwijderen', prep: 'Jouw voorbereiding' },

	b1: {
		total: 'Totale zonsverduistering',
		partial: 'Gedeeltelijke zonsverduistering',
		not_visible: 'Hiervandaan niet zichtbaar',
		not_visible_note: 'Op het maximum staat de zon al onder de horizon.',
		not_reached: 'Deze verduistering bereikt jouw locatie niet.',
		next_here: 'Volgende hiervandaan zichtbare verduistering: {date} — {kind}, {pct} % bedekt.',
		kind_total: 'totaal',
		kind_partial: 'gedeeltelijk',
		kind_annular: 'ringvormig',
		obscured: '{pct} % van de zon bedekt',
		max_at: 'Maximum om {time}',
		sun_alt: 'Zon {alt}° boven de horizon',
		sun_below: 'Zon onder de horizon',
		safe_total: 'Alleen tijdens de totaliteit ({from}–{to}) zonder bril — anders altijd een beschermbril.',
		safe_partial:
			'Doorlopend een gecertificeerde eclipsbril (ISO 12312-2) nodig — zelfs een korte blik in de zon kan de ogen blijvend beschadigen.'
	},
	b3: {
		title: 'Jouw zicht op de zon',
		subtitle: 'De zon boven jouw plek — sleep om rond te kijken.',
		altitude: 'Hoogte',
		azimuth: 'Azimut',
		coverage: 'Bedekking',
		loading: 'Terrein wordt geladen …',
		recenter: 'Weergave herstellen',
		phase_start: 'Begin',
		phase_max: 'Maximum',
		phase_end: 'Einde',
		sunset: 'Zonsondergang',
		// Compass points for the horizon ruler and the azimuth chip (cardinal initials are locale-specific)
		// Planet labels in the sky view, faded in with their planet's visibility
		planets: { venus: 'Venus', mercury: 'Mercurius', jupiter: 'Jupiter' },
		compass: { n: 'N', ne: 'NO', e: 'O', se: 'ZO', s: 'Z', sw: 'ZW', w: 'W', nw: 'NW' }
	},
	b6: {
		title: 'Jouw checklist',
		until_max: 'tot het maximum',
		past: 'Het maximum is voorbij.',
		glasses: 'Bescherm je ogen met een gecertificeerde eclipsbril (ISO 12312-2).',
		glasses_why:
			'Een gewone zonnebril is hiervoor niet genoeg. Wie zonder gecertificeerde eclipsbril naar de zon kijkt, riskeert blijvende oogschade.',
		view: 'Heb je vrij zicht naar het westen?',
		view_why:
			'Controleer van tevoren of bomen, gebouwen, bergen of andere obstakels de zon op dat moment verbergen. Zoek zo nodig een andere plek.',
		weather: 'Bekijk een paar dagen van tevoren de weersvoorspelling.',
		weather_why:
			'Bij dichte bewolking helpt alleen een andere locatie. Bekijk de voorspelling op tijd, zodat je zo nodig kunt uitwijken.',
		add_calendar: '📅 Aan agenda toevoegen',
		event_title: 'Zonsverduistering 2026'
	},
	tz: {
		all_in: 'Alle tijden in jouw tijdzone: {zone}',
		note: 'Tijdzone van je apparaat – niet per se die van de waarnemingslocatie.'
	},
	placeholder: {
		b1: 'Verdictkaart',
		b1_note: 'Bedekkingsgraad, contacttijden en oogbeschermingsverdict voor jouw locatie — volgt.'
	},
	donate: {
		text: 'In deze app zitten vele avonden werk. Toch geef ik hem cadeau aan jou en je vrienden – zonder reclame en zonder tracking. Bevalt hij je, dan is een kleine fooi zeer welkom.',
		button: 'Fooi achterlaten'
	},
	footer: {
		source: 'Broncode op GitHub',
		translation: 'Deze vertaling verbeteren',
		imprint: 'Colofon'
	},
	safety: 'Kijk nooit zonder gecertificeerde eclipsbril (ISO 12312-2) naar de zon.'
};

export default messages;
