// A MapLibre control button (an eye / eye-off toggle) that shows or hides the reference overlay
// — the corridor band, iso rings, terminator and percent labels. Styling lives in the A2 component CSS.
import type { IControl } from 'maplibre-gl';

// Feather icons (currentColor).
const EYE_ICON =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_ICON =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

export type OverlayToggleOptions = { label: string; active: boolean; onToggle: () => void };

export class OverlayToggleControl implements IControl {
	private button?: HTMLButtonElement;
	private container?: HTMLDivElement;

	constructor(private opts: OverlayToggleOptions) {}

	onAdd(): HTMLElement {
		this.container = document.createElement('div');
		this.container.className = 'maplibregl-ctrl maplibregl-ctrl-group';
		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'a2-overlay-toggle';
		button.title = this.opts.label;
		button.setAttribute('aria-label', this.opts.label);
		button.addEventListener('click', () => this.opts.onToggle());
		this.button = button;
		this.container.appendChild(button);
		this.setActive(this.opts.active);
		return this.container;
	}

	setActive(active: boolean) {
		if (!this.button) return;
		this.button.innerHTML = active ? EYE_ICON : EYE_OFF_ICON;
		this.button.classList.toggle('is-off', !active);
		this.button.setAttribute('aria-pressed', String(active));
	}

	onRemove() {
		this.container?.remove();
	}
}
