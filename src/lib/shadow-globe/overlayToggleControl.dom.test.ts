import { describe, it, expect, vi } from 'vitest';
import { OverlayToggleControl } from './overlayToggleControl';

const make = (active = true) => {
	const onToggle = vi.fn();
	const control = new OverlayToggleControl({ label: 'Linien & Korridor ein/aus', active, onToggle });
	return { control, onToggle };
};

describe('OverlayToggleControl', () => {
	it('renders a MapLibre control group with one button', () => {
		const { control } = make();
		const container = control.onAdd();
		expect(container.className).toBe('maplibregl-ctrl maplibregl-ctrl-group');
		const buttons = container.querySelectorAll('button');
		expect(buttons).toHaveLength(1);
		expect(buttons[0].type).toBe('button'); // not a submit inside any surrounding form
	});

	it('labels the button for pointer and screen-reader users', () => {
		const { control } = make();
		const button = control.onAdd().querySelector('button')!;
		expect(button.title).toBe('Linien & Korridor ein/aus');
		expect(button.getAttribute('aria-label')).toBe('Linien & Korridor ein/aus');
	});

	it('starts in the state it was constructed with', () => {
		const on = make(true).control.onAdd().querySelector('button')!;
		expect(on.getAttribute('aria-pressed')).toBe('true');
		expect(on.classList.contains('is-off')).toBe(false);

		const off = make(false).control.onAdd().querySelector('button')!;
		expect(off.getAttribute('aria-pressed')).toBe('false');
		expect(off.classList.contains('is-off')).toBe(true);
	});

	it('shows the eye icon when on and the crossed-out eye when off', () => {
		const { control } = make(true);
		const button = control.onAdd().querySelector('button')!;
		expect(button.innerHTML).toContain('<circle');
		expect(button.innerHTML).not.toContain('<line');

		control.setActive(false);
		expect(button.innerHTML).toContain('<line'); // the strike-through
	});

	it('calls back on click', () => {
		const { control, onToggle } = make();
		const button = control.onAdd().querySelector('button')!;
		button.click();
		button.click();
		expect(onToggle).toHaveBeenCalledTimes(2);
	});

	it('leaves the pressed state to the caller', () => {
		// The control does not own the overlay's visibility — the component does, and calls setActive.
		const { control, onToggle } = make(true);
		const button = control.onAdd().querySelector('button')!;
		button.click();
		expect(button.getAttribute('aria-pressed')).toBe('true'); // unchanged until told otherwise
		expect(onToggle).toHaveBeenCalled();

		control.setActive(false);
		expect(button.getAttribute('aria-pressed')).toBe('false');
	});

	it('toggles cleanly back and forth', () => {
		const { control } = make(true);
		const button = control.onAdd().querySelector('button')!;
		for (const active of [false, true, false, true]) {
			control.setActive(active);
			expect(button.getAttribute('aria-pressed')).toBe(String(active));
			expect(button.classList.contains('is-off')).toBe(!active);
		}
	});

	it('ignores setActive before it is added to a map', () => {
		const { control } = make();
		expect(() => control.setActive(false)).not.toThrow();
	});

	it('detaches its container on remove', () => {
		const { control } = make();
		const container = control.onAdd();
		document.body.appendChild(container);
		expect(document.body.contains(container)).toBe(true);

		control.onRemove();
		expect(document.body.contains(container)).toBe(false);
	});

	it('survives a remove before it was ever added', () => {
		const { control } = make();
		expect(() => control.onRemove()).not.toThrow();
	});
});
