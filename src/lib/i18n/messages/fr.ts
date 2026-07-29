import type { Messages } from './de';

const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 août 2026',
		page_title: 'Éclipse totale de Soleil, 12 août 2026 — que verras-tu ?',
		page_description:
			'La première éclipse totale de Soleil au-dessus de l’Europe continentale depuis 1999. Simule-la dès maintenant pour ta ville.',
		og_image_alt: 'La Terre vue de l’espace : l’ombre de l’éclipse traverse l’Atlantique de l’Islande à l’Espagne.'
	},
	nav: { about: 'À propos', language: 'Langue' },
	countdown: {
		to_totality: 'avant le maximum de l’éclipse totale de Soleil',
		since: 'La première éclipse totale de Soleil au-dessus de l’Europe continentale depuis 1999.',
		happening: 'L’éclipse est en cours.',
		past: 'L’éclipse est terminée.',
		d: 'j',
		h: 'h',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'La course de l’ombre',
		subtitle: 'L’ombre de la Lune parcourt la Terre.',
		current_shadow: 'Ombre actuelle',
		path: 'Trajectoire',
		core: 'Ombre centrale',
		loading: 'Chargement du globe …',
		load_error: 'Impossible de charger le globe. Recharge la page.',
		toggle_overlay: 'Afficher/masquer lignes et corridor',
		two_fingers: 'Déplace la carte avec deux doigts',
		zoom_ctrl: 'Utilise Ctrl + molette pour zoomer',
		zoom_cmd: 'Utilise ⌘ + molette pour zoomer'
	},
	a3: {
		title: 'À quoi ça ressemble ?',
		note: 'Trois lieux, le même événement, une expérience totalement différente.'
	},
	a4: {
		cta_title: 'Choisis ton lieu pour voir ton éclipse personnelle',
		cta_sub: 'À quelle hauteur sera le Soleil, quelle part sera couverte – et es-tu dans la zone de totalité ?',
		choose: 'Choisir un lieu',
		close: 'Fermer',
		geo: 'Utiliser ma position',
		geo_busy: 'Localisation en cours …',
		search: 'Chercher une ville ou une adresse',
		searching: 'Recherche …',
		no_results: 'Aucun résultat',
		geo_error: 'Position indisponible. Cherche un lieu ou touche la carte.',
		search_error: 'La recherche a échoué. Réessaie.',
		adjust_hint: 'Fais glisser l’épingle ou touche la carte pour ajuster le lieu.',
		use_here: 'Utiliser ce lieu',
		verdict_total: 'Totalité',
		verdict_partial: 'partielle',
		verdict_none: 'non visible'
	},
	b: { your_sky: 'Ton ciel', change: 'modifier', clear: 'Supprimer le lieu', prep: 'Ta préparation' },

	b1: {
		total: 'Éclipse totale de Soleil',
		partial: 'Éclipse partielle de Soleil',
		not_visible: 'Non visible depuis ici',
		not_visible_note: 'Au maximum, le Soleil est déjà sous l’horizon.',
		not_reached: 'Cette éclipse n’atteint pas ton lieu.',
		next_here: 'Prochaine éclipse visible d’ici : {date} — {kind}, {pct} % couverts.',
		kind_total: 'totale',
		kind_partial: 'partielle',
		kind_annular: 'annulaire',
		obscured: '{pct} % du Soleil couverts',
		max_at: 'Maximum à {time}',
		sun_alt: 'Soleil à {alt}° au-dessus de l’horizon',
		sun_below: 'Soleil sous l’horizon',
		safe_total:
			'Sans lunettes uniquement pendant la totalité ({from}–{to}) — sinon toujours des lunettes de protection.',
		safe_partial:
			'Lunettes d’éclipse certifiées (ISO 12312-2) indispensables en permanence — même un bref regard vers le Soleil peut abîmer les yeux de façon durable.'
	},
	b3: {
		title: 'Ta vue vers le Soleil',
		subtitle: 'Le Soleil au-dessus de chez toi — fais glisser pour regarder autour.',
		altitude: 'Hauteur',
		azimuth: 'Azimut',
		coverage: 'Couverture',
		loading: 'Chargement du terrain …',
		recenter: 'Réinitialiser la vue',
		phase_start: 'Début',
		phase_max: 'Maximum',
		phase_end: 'Fin',
		sunset: 'Coucher du soleil',
		// Compass points for the horizon ruler and the azimuth chip (cardinal initials are locale-specific)
		// Planet labels in the sky view, faded in with their planet's visibility
		planets: { venus: 'Vénus', mercury: 'Mercure', jupiter: 'Jupiter' },
		compass: { n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SO', w: 'O', nw: 'NO' }
	},
	b6: {
		title: 'Ta checklist',
		until_max: 'avant le maximum',
		past: 'Le maximum est passé.',
		glasses: 'Protège tes yeux avec des lunettes d’éclipse certifiées (ISO 12312-2).',
		glasses_why:
			'Les lunettes de soleil ordinaires ne suffisent pas. Regarder le Soleil sans lunettes d’éclipse certifiées expose à des lésions oculaires irréversibles.',
		view: 'As-tu une vue dégagée vers l’ouest ?',
		view_why:
			'Vérifie à l’avance si des arbres, des bâtiments, des montagnes ou d’autres obstacles cachent le Soleil à ce moment-là. Au besoin, choisis un autre endroit.',
		weather: 'Vérifie les prévisions météo quelques jours avant.',
		weather_why:
			'Sous une couverture nuageuse épaisse, seul un changement de lieu aide. Vérifie les prévisions à temps pour pouvoir te déplacer si nécessaire.',
		add_calendar: '📅 Ajouter au calendrier',
		event_title: 'Éclipse solaire 2026'
	},
	tz: {
		all_in: 'Toutes les heures dans ton fuseau horaire : {zone}',
		note: 'Fuseau de ton appareil – pas forcément celui du lieu d’observation.'
	},
	placeholder: {
		b1: 'Carte de verdict',
		b1_note: 'Taux de couverture, temps de contact et verdict de protection oculaire pour ton lieu — à venir.'
	},
	donate: {
		text: 'Cette appli représente de nombreuses soirées de travail. Je te l’offre pourtant, à toi et à tes amis – sans publicité et sans traçage. Si elle te plaît, je serai ravi d’un petit pourboire.',
		button: 'Laisser un pourboire'
	},
	footer: {
		source: 'Code source sur GitHub',
		translation: 'Améliorer cette traduction',
		imprint: 'Mentions légales'
	},
	safety: 'Ne regarde jamais le Soleil sans lunettes d’éclipse certifiées (ISO 12312-2).'
};

export default messages;
