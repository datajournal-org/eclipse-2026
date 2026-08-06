import type { Messages } from './de';

// Typed against the German reference: a missing or misspelled key is a compile error.
const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 de agosto de 2026',
		page_title: 'Eclipse solar total, 12 de agosto de 2026 — ¿qué verás tú?',
		page_description:
			'El primer eclipse solar total sobre la Europa continental desde 1999. Simúlalo ya para tu lugar.',
		og_headline: 'Simula el eclipse para tu ubicación',
		og_image_alt:
			'El Sol casi totalmente eclipsado, bajo sobre los tejados de Madrid, simulado en la vista 3D del horizonte.'
	},
	nav: { about: 'Acerca de', language: 'Idioma' },
	countdown: {
		to_totality: 'hasta el punto máximo del eclipse solar total',
		since: 'El primer eclipse solar total sobre la Europa continental desde 1999.',
		happening: 'El eclipse está ocurriendo ahora.',
		past: 'El eclipse ha terminado.',
		d: 'd',
		h: 'h',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'Recorrido de la sombra',
		subtitle: 'La sombra de la Luna recorre la Tierra.',
		current_shadow: 'Sombra actual',
		path: 'Trayectoria',
		core: 'Umbra',
		loading: 'Cargando globo …',
		load_error: 'No se pudo cargar el globo. Recarga la página.',
		toggle_overlay: 'Mostrar/ocultar líneas y corredor',
		two_fingers: 'Usa dos dedos para mover el mapa',
		zoom_ctrl: 'Usa Ctrl + rueda para hacer zoom',
		zoom_cmd: 'Usa ⌘ + rueda para hacer zoom'
	},
	a3: {
		title: '¿Cómo se ve?',
		note: 'Tres lugares, el mismo evento, una experiencia completamente distinta.'
	},
	a4: {
		cta_title: 'Elige tu ubicación para ver tu eclipse personal',
		cta_sub: '¿Qué altura tiene el Sol, cuánto se cubre — y estás en la franja de totalidad?',
		choose: 'Elegir ubicación',
		close: 'Cerrar',
		geo: 'Usar mi ubicación',
		geo_busy: 'Determinando ubicación …',
		search: 'Buscar ciudad o dirección',
		searching: 'Buscando …',
		no_results: 'Nada encontrado',
		geo_error: 'Ubicación no disponible. Busca un lugar o toca el mapa.',
		search_error: 'La búsqueda falló. Inténtalo de nuevo.',
		adjust_hint: 'Arrastra el pin o toca el mapa para ajustar el punto.',
		use_here: 'Usar esta ubicación',
		verdict_total: 'Totalidad',
		verdict_partial: 'parcial',
		verdict_none: 'no visible'
	},
	b: {
		sim_for: 'Simulación del eclipse para {place}',
		change: 'Cambiar ubicación',
		clear: 'Quitar ubicación',
		prep: 'Tu preparación'
	},

	b1: {
		total: 'Eclipse solar total',
		partial: 'Eclipse solar parcial',
		not_visible: 'No visible desde aquí',
		not_visible_note: 'En el máximo el Sol ya está bajo el horizonte.',
		not_reached: 'Este eclipse no llega a tu ubicación.',
		next_here: 'Próximo eclipse visible desde aquí: {date} — {kind}, {pct}\u2009% cubierto.',
		kind_total: 'total',
		kind_partial: 'parcial',
		kind_annular: 'anular',
		obscured: '{pct}\u2009% del Sol cubierto',
		max_at: 'Máximo a las {time}',
		sun_alt: 'Sol a {alt}° sobre el horizonte',
		sun_below: 'Sol bajo el horizonte'
	},
	b3: {
		title: 'Tu vista del Sol',
		subtitle: 'El Sol sobre tu lugar — arrastra para mirar alrededor.',
		altitude: 'Altura',
		azimuth: 'Acimut',
		coverage: 'Cobertura',
		loading: 'Cargando relieve …',
		recenter: 'Restablecer vista',
		phase_start: 'Inicio',
		phase_max: 'Máximo',
		phase_end: 'Fin',
		sunset: 'Puesta de sol',
		// Compass points for the horizon ruler and the azimuth chip (cardinal initials are locale-specific)
		// Planet labels in the sky view, faded in with their planet's visibility
		planets: { venus: 'Venus', mercury: 'Mercurio', jupiter: 'Júpiter' },
		compass: { n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SO', w: 'O', nw: 'NO' }
	},
	b6: {
		title: 'Tu lista',
		until_max: 'hasta el máximo',
		past: 'El máximo ya ha pasado.',
		glasses: 'Protege tus ojos con gafas de eclipse certificadas (ISO 12312-2).',
		glasses_why:
			'Las gafas de sol normales no bastan para esto. Mirar al Sol sin gafas de eclipse certificadas supone riesgo de daños oculares permanentes.',
		view: '¿Tienes vista despejada hacia el oeste?',
		view_why:
			'Comprueba con antelación si árboles, edificios, montañas u otros obstáculos tapan el Sol a esa hora. Si hace falta, busca otro lugar.',
		weather: 'Consulta la previsión del tiempo unos días antes.',
		weather_why:
			'Con nubes densas solo ayuda cambiar de lugar. Consulta la previsión a tiempo para poder desplazarte a otro sitio si es necesario.',
		add_calendar: '📅 Añadir al calendario',
		event_title: 'Eclipse solar 2026'
	},
	tz: {
		all_in: 'Todas las horas en tu zona horaria: {zone}',
		note: 'La zona horaria de tu dispositivo, no necesariamente la del lugar de observación.'
	},
	placeholder: {
		b1: 'Tarjeta de veredicto',
		b1_note: 'Ocultación, tiempos de contacto y veredicto de seguridad ocular para tu ubicación — próximamente.'
	},
	donate: {
		text: 'En esta aplicación hay muchas tardes de trabajo. Aun así, te la regalo a ti y a tus amigos – sin publicidad y sin seguimiento. Si te gusta, me alegrará una pequeña propina.',
		button: 'Dejar una propina'
	},
	footer: {
		source: 'Código fuente en GitHub',
		translation: 'Mejorar esta traducción',
		imprint: 'Aviso legal'
	},
	safety: 'Nunca mires al Sol sin gafas de eclipse certificadas (ISO 12312-2).'
};

export default messages;
