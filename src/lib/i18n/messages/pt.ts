import type { Messages } from './de';

const messages: Messages = {
	app: {
		title: 'Eclipse 2026',
		tagline: '12 de agosto de 2026',
		page_title: 'Eclipse solar total, 12 de agosto de 2026 — o que vais ver?',
		page_description:
			'O primeiro eclipse solar total sobre a Europa continental desde 1999. Simula-o já para a tua localidade.',
		og_headline: 'Simula o eclipse para a tua localidade',
		og_image_alt:
			'O Sol quase totalmente eclipsado, baixo sobre os telhados de Madrid, simulado na vista 3D do horizonte.'
	},
	nav: { about: 'Sobre', language: 'Idioma' },
	countdown: {
		to_totality: 'até ao ponto máximo do eclipse solar total',
		since: 'O primeiro eclipse solar total sobre a Europa continental desde 1999.',
		happening: 'O eclipse está a decorrer.',
		past: 'O eclipse já passou.',
		d: 'd',
		h: 'h',
		m: 'min',
		s: 's'
	},
	a2: {
		title: 'A corrida da sombra',
		subtitle: 'A sombra da Lua percorre a Terra.',
		current_shadow: 'Sombra atual',
		path: 'Trajeto',
		core: 'Umbra',
		loading: 'A carregar o globo …',
		load_error: 'Não foi possível carregar o globo. Recarrega a página.',
		toggle_overlay: 'Mostrar/ocultar linhas e corredor',
		two_fingers: 'Usa dois dedos para mover o mapa',
		zoom_ctrl: 'Usa Ctrl + roda para fazer zoom',
		zoom_cmd: 'Usa ⌘ + roda para fazer zoom'
	},
	a3: {
		title: 'Como é que isso se vê?',
		note: 'Três lugares, o mesmo evento, uma experiência completamente diferente.'
	},
	a4: {
		cta_title: 'Escolhe o teu local para veres o teu eclipse pessoal',
		cta_sub: 'A que altura está o Sol, quanto fica coberto – e estás na zona de totalidade?',
		choose: 'Escolher local',
		close: 'Fechar',
		geo: 'Usar a minha localização',
		geo_busy: 'A determinar a localização …',
		search: 'Procurar cidade ou morada',
		searching: 'A procurar …',
		no_results: 'Nada encontrado',
		geo_error: 'Localização indisponível. Procura um lugar ou toca no mapa.',
		search_error: 'A pesquisa falhou. Tenta novamente.',
		adjust_hint: 'Arrasta o pino ou toca no mapa para ajustar o local.',
		use_here: 'Usar este local',
		verdict_total: 'Totalidade',
		verdict_partial: 'parcial',
		verdict_none: 'não visível'
	},
	b: { your_sky: 'O teu céu', change: 'Alterar local', clear: 'Remover local', prep: 'A tua preparação' },

	b1: {
		total: 'Eclipse solar total',
		partial: 'Eclipse solar parcial',
		not_visible: 'Não visível daqui',
		not_visible_note: 'No máximo, o Sol já está abaixo do horizonte.',
		not_reached: 'Este eclipse não chega ao teu local.',
		next_here: 'Próximo eclipse visível daqui: {date} — {kind}, {pct}\u2009% coberto.',
		kind_total: 'total',
		kind_partial: 'parcial',
		kind_annular: 'anular',
		obscured: '{pct}\u2009% do Sol coberto',
		max_at: 'Máximo às {time}',
		sun_alt: 'Sol a {alt}° acima do horizonte',
		sun_below: 'Sol abaixo do horizonte',
		safe_total: 'Sem óculos apenas durante a totalidade ({from}–{to}) — de resto, sempre com óculos de proteção.',
		safe_partial:
			'Óculos de eclipse certificados (ISO 12312-2) necessários todo o tempo — até um olhar breve para o Sol pode danificar os olhos de forma permanente.'
	},
	b3: {
		title: 'A tua vista para o Sol',
		subtitle: 'O Sol sobre o teu local — arrasta para olhar em volta.',
		altitude: 'Altura',
		azimuth: 'Azimute',
		coverage: 'Cobertura',
		loading: 'A carregar o terreno …',
		recenter: 'Repor a vista',
		phase_start: 'Início',
		phase_max: 'Máximo',
		phase_end: 'Fim',
		sunset: 'Pôr do sol',
		// Compass points for the horizon ruler and the azimuth chip (cardinal initials are locale-specific)
		// Planet labels in the sky view, faded in with their planet's visibility
		planets: { venus: 'Vénus', mercury: 'Mercúrio', jupiter: 'Júpiter' },
		compass: { n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SO', w: 'O', nw: 'NO' }
	},
	b6: {
		title: 'A tua checklist',
		until_max: 'até ao máximo',
		past: 'O máximo já passou.',
		glasses: 'Protege os teus olhos com óculos de eclipse certificados (ISO 12312-2).',
		glasses_why:
			'Óculos de sol comuns não chegam para isto. Olhar para o Sol sem óculos de eclipse certificados arrisca danos oculares permanentes.',
		view: 'Tens vista desimpedida para oeste?',
		view_why:
			'Verifica com antecedência se árvores, edifícios, montanhas ou outros obstáculos tapam o Sol a essa hora. Se for preciso, procura outro lugar.',
		weather: 'Consulta a previsão do tempo uns dias antes.',
		weather_why:
			'Com nuvens densas, só ajuda mudar de lugar. Consulta a previsão a tempo para poderes ir para outro sítio se necessário.',
		add_calendar: '📅 Adicionar ao calendário',
		event_title: 'Eclipse solar 2026'
	},
	tz: {
		all_in: 'Todas as horas no teu fuso horário: {zone}',
		note: 'Fuso horário do teu aparelho – não necessariamente o do local de observação.'
	},
	placeholder: {
		b1: 'Cartão de veredicto',
		b1_note: 'Grau de cobertura, tempos de contacto e veredicto de proteção ocular para o teu local — em breve.'
	},
	donate: {
		text: 'Esta app levou muitas noites de trabalho. Mesmo assim, ofereço-ta a ti e aos teus amigos – sem publicidade e sem rastreio. Se gostares, fico feliz com uma pequena gorjeta.',
		button: 'Deixar uma gorjeta'
	},
	footer: {
		source: 'Código-fonte no GitHub',
		translation: 'Melhorar esta tradução',
		imprint: 'Aviso legal'
	},
	safety: 'Nunca olhes para o Sol sem óculos de eclipse certificados (ISO 12312-2).'
};

export default messages;
