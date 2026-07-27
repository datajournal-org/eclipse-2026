// Sets <html lang> per prerendered page. `<svelte:head>` cannot write attributes on <html>, and server
// hooks DO run during prerendering — so this is what bakes the right language into each static file.
// A client-side language switch does not re-run this; the layout's applyLocale keeps the attribute in
// step after hydration.
import type { Handle } from '@sveltejs/kit';
import { isLocale, DEFAULT_LOCALE } from '$lib/i18n';

export const handle: Handle = ({ event, resolve }) => {
	const lang = isLocale(event.params.lang) ? event.params.lang : DEFAULT_LOCALE;
	return resolve(event, { transformPageChunk: ({ html }) => html.replace('%lang%', lang) });
};
