import type { Messages } from './de';

// Typed against the German reference: a missing or misspelled key is a compile error.
const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 de agosto de 2026',
		page_title: 'Eclipse solar 12 de agosto de 2026 — qué verás desde aquí',
		page_description:
			'Cuánto se cubre en tu ubicación, cuándo es el máximo y si tienes vista libre al oeste. El primer eclipse total sobre Europa desde 1999.',
		og_image_alt: 'El Sol eclipsado con su corona visible'
	},
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
		load_error: 'No se pudo cargar el globo. Recarga la página.',
		toggle_overlay: 'Mostrar/ocultar líneas y corredor'
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
		search: 'Buscar ciudad o dirección',
		searching: 'Buscando …',
		no_results: 'Nada encontrado',
		geo_error: 'Ubicación no disponible. Busca un lugar o toca el mapa.',
		adjust_hint: 'Arrastra el pin o toca el mapa para ajustar el punto.',
		use_here: 'Usar esta ubicación',
		verdict_total: 'Totalidad',
		verdict_partial: 'parcial',
		verdict_none: 'no visible'
	},
	b: { your_sky: 'Tu cielo', change: 'cambiar', clear: 'Quitar ubicación', prep: 'Tu preparación' },

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
		sun_below: 'Sol bajo el horizonte',
		safe_total:
			'Solo durante la totalidad ({from}–{to}) puedes mirar sin gafas — el resto del tiempo usa siempre gafas de eclipse.',
		safe_partial: 'Se necesitan gafas de eclipse certificadas (ISO 12312-2) todo el tiempo.'
	},
	b3: {
		title: 'Tu vista del Sol',
		subtitle: 'Tu ubicación y la trayectoria del Sol — arrastra para mirar alrededor, procura vista despejada.',
		altitude: 'Altura',
		azimuth: 'Acimut',
		coverage: 'Cobertura',
		loading: 'Cargando relieve …',
		recenter: 'Restablecer vista',
		zoom_in: 'Acercar',
		zoom_out: 'Alejar',
		phase_start: 'Inicio',
		phase_max: 'Máximo',
		phase_end: 'Fin',
		sunset: 'Puesta de sol'
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
	tz: {
		all_in: 'Todas las horas en tu zona horaria: {zone}',
		note: 'La zona horaria de tu dispositivo, no necesariamente la del lugar de observación.'
	},
	placeholder: {
		b1: 'Tarjeta de veredicto',
		b1_note: 'Ocultación, tiempos de contacto y veredicto de seguridad ocular para tu ubicación — próximamente.'
	},
	safety: 'Nunca mires al Sol sin gafas de eclipse certificadas (ISO 12312-2).'
};

export default messages;
