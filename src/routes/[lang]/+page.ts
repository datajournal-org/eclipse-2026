// One prerendered page per language. The route parameter is the single source of truth for the active
// language — see docs/I18N-ROUTING.md.
import { error } from '@sveltejs/kit';
import { LOCALES, isLocale, type Locale } from '$lib/i18n';

export const prerender = true;

/** Prerender exactly the languages we have; anything else is a 404, not an empty shell. */
export const entries = () => LOCALES.map((lang) => ({ lang }));

export function load({ params }: { params: { lang: string } }): { lang: Locale } {
	if (!isLocale(params.lang)) error(404, `Unknown language: ${params.lang}`);
	return { lang: params.lang };
}
