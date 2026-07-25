// The observer-specific eclipse circumstances for the current location — computed once (the search is
// iterative) and shared by the B-screens (verdict, timeline, checklist). Null when no location is set.
import { derived, type Readable } from 'svelte/store';
import { userLocation } from './location';
import { localCircumstances } from '$lib/eclipse';

export type LocalEclipse = NonNullable<ReturnType<typeof localCircumstances>>;

export const localEclipse: Readable<LocalEclipse | null> = derived(userLocation, ($loc) =>
	$loc ? localCircumstances($loc.lat, $loc.lon) : null
);
