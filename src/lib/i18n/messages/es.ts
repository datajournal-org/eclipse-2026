import type { Messages } from './de';

// Typed against the German reference: a missing or misspelled key is a compile error.
const messages: Messages = {
	app: { title: 'Eclipse 2026', tagline: '12 de agosto de 2026' },
	nav: { about: 'Acerca de', language: 'Idioma' },
	countdown: {
		to_totality: 'para el eclipse solar total',
		since: 'El primer eclipse solar total sobre Europa desde 1999.',
		happening: 'El eclipse está ocurriendo ahora.',
		past: 'El eclipse ha terminado.',
		d: 'd',
		h: 'h',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'Recorrido de la sombra',
		subtitle:
			'La sombra de la Luna recorre la Tierra — la franja de totalidad como banda, la sombra actual es en vivo desde la línea de tiempo.',
		current_shadow: 'Sombra actual',
		path: 'Trayectoria',
		core: 'Umbra',
		loading: 'Cargando globo …',
		toggle_overlay: 'Mostrar/ocultar líneas y corredor'
	},
	a3: {
		title: '¿Cómo se ve?',
		note: 'Tres lugares, el mismo evento, una experiencia completamente distinta.'
	},
	a4: {
		title: '¿Qué verás desde donde estás?',
		geo: 'Usar mi ubicación',
		search: 'Buscar un lugar',
		map: 'Tocar en el mapa',
		manual_hint: 'o introduce coordenadas (lat, lon)',
		use: 'Fijar',
		geo_error: 'Ubicación no disponible. Busca un lugar o introduce coordenadas.',
		soon: 'próximamente'
	},
	b: { your_sky: 'Tu cielo', change: 'cambiar', clear: 'Quitar ubicación' },

	b1: {
		total: 'Eclipse solar total',
		partial: 'Eclipse solar parcial',
		not_visible: 'No visible desde aquí',
		not_visible_note: 'En el máximo el Sol ya está bajo el horizonte.',
		obscured: '{pct}\u2009% del Sol cubierto',
		max_at: 'Máximo a las {time}',
		sun_alt: 'Sol a {alt}° sobre el horizonte',
		sun_below: 'Sol bajo el horizonte',
		safe_total:
			'Solo durante la totalidad ({from}–{to}) puedes mirar sin gafas — el resto del tiempo usa siempre gafas de eclipse.',
		safe_partial: 'Se necesitan gafas de eclipse certificadas (ISO 12312-2) todo el tiempo.'
	},
	b2: {
		title: 'Tu cronología',
		first_contact: 'Primer contacto',
		total_begin: 'Totalidad',
		maximum: 'Máximo',
		total_end: 'Fin de la totalidad',
		last_contact: 'Último contacto',
		sunset: 'Puesta de sol',
		below_horizon: 'bajo el horizonte',
		tz_note: 'Todas las horas en tu zona horaria.'
	},
	b3: {
		title: 'Tu vista del Sol',
		subtitle: 'Mirando hacia el Sol con relieve y edificios — asegúrate de tener vista despejada.',
		altitude: 'Altura',
		azimuth: 'Acimut',
		coverage: 'Cobertura',
		behind_horizon: 'Sol tras el horizonte/relieve',
		loading: 'Cargando relieve …'
	},
	b6: {
		title: 'Tu lista',
		until_max: 'hasta el máximo',
		past: 'El máximo ya ha pasado.',
		glasses: 'Gafas de eclipse certificadas (ISO 12312-2)',
		view: 'Vista despejada al oeste (acimut {az}°)',
		weather: 'Consulta la previsión del tiempo',
		add_calendar: '📅 Añadir al calendario',
		event_title: 'Eclipse solar 2026'
	},
	placeholder: {
		b1: 'Tarjeta de veredicto',
		b1_note: 'Ocultación, tiempos de contacto y veredicto de seguridad ocular para tu ubicación — próximamente.'
	},
	safety: 'Nunca mires al Sol sin gafas de eclipse certificadas (ISO 12312-2).'
};

export default messages;
