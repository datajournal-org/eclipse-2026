<!-- B3 overlay: the A) loupe inset (the eclipsed Sun's crescent, magnified) plus B) the Sun locator square
     and the two tangent "leader" lines that funnel from the loupe to it. The parent drives these each render
     frame via place(): it owns the map, this component owns the overlay DOM + its visibility. -->
<script lang="ts">
	import { bridgeSegments } from '$lib/skyview/overlay';
	import { SKY_PALETTE } from '$lib/config';

	let {
		ready,
		loupeR,
		loupeSky,
		loupeGround,
		horizonY,
		crescent,
		coronaSize,
		coronaOpacity
	}: {
		ready: boolean;
		loupeR: number;
		loupeSky: string;
		loupeGround: string;
		horizonY: number; // horizon offset from the centred Sun, in loupe SVG units (+y down)
		crescent: { x: number; y: number; r: number };
		coronaSize: number;
		coronaOpacity: number;
	} = $props();

	let pointerVisible = $state(false); // Sun above the horizon AND on-screen (locator square)
	let tangentVisible = $state(false); // ...and far enough from the loupe to draw the tangent lines
	let locatorEl: HTMLDivElement;
	let leaderA: SVGLineElement;
	let leaderB: SVGLineElement;

	// Called by the parent every render frame with the Sun's on-screen position (or null when it is off-screen
	// / below the horizon): glue the locator square to it and re-derive the two loupe→locator tangent lines.
	export function place(screen: [number, number] | null) {
		pointerVisible = !!screen;
		if (!screen) {
			tangentVisible = false;
			return;
		}
		if (locatorEl) locatorEl.style.transform = `translate(${screen[0]}px, ${screen[1]}px) translate(-50%, -50%)`;

		const segs = bridgeSegments(screen[0], screen[1]);
		if (!segs || !leaderA || !leaderB) {
			tangentVisible = false;
			return;
		}
		const lines = [leaderA, leaderB];
		segs.forEach((seg, i) => {
			lines[i].setAttribute('x1', String(seg.x1));
			lines[i].setAttribute('y1', String(seg.y1));
			lines[i].setAttribute('x2', String(seg.x2));
			lines[i].setAttribute('y2', String(seg.y2));
		});
		tangentVisible = true;
	}
</script>

<!-- B: two tangent lines connecting the loupe and the locator square (a magnifier funnel) -->
<svg class="b3-leader" class:hidden={!tangentVisible} aria-hidden="true">
	<line bind:this={leaderA} />
	<line bind:this={leaderB} />
</svg>
<!-- B: locator square around the real Sun -->
<div class="b3-locator" class:hidden={!pointerVisible} bind:this={locatorEl} aria-hidden="true"></div>
<!-- A: loupe inset — the eclipsed Sun's crescent, magnified -->
<div
	class="b3-loupe"
	class:hidden={!ready}
	aria-hidden="true"
	style:--loupe-sun={SKY_PALETTE.sun}
	style:--loupe-sky={loupeSky}
	style:--loupe-ground={loupeGround}
>
	<svg viewBox="-50 -50 100 100">
		<defs>
			<linearGradient id="loupe-glow-grad" x1="0" y1="0" x2="0" y2="1">
				<stop class="glow-top" offset="0" />
				<stop class="glow-bottom" offset="1" />
			</linearGradient>
		</defs>
		<!-- warm sunset glow in the sky just above the horizon (off-frame until the Sun nears setting) -->
		<rect class="loupe-sky" x="-60" y="-60" width="120" height="120" />
		<circle class="loupe-sun" r={loupeR} />
		<circle class="loupe-moon" cx={crescent.x} cy={crescent.y} r={crescent.r} />
		<rect class="loupe-glow" x="-50" y={horizonY - 80} width="100" height="80" />
		<image
			href="/corona_512.webp"
			x={-coronaSize / 2}
			y={-coronaSize / 2}
			width={coronaSize}
			height={coronaSize}
			opacity={coronaOpacity}
			preserveAspectRatio="xMidYMid meet"
		/>
		<!-- ground silhouette below the horizon → the Sun / corona sink into it at sunset (tall enough to
		     always reach the bottom of the frame, even once the horizon has risen well above centre).
		     Clamped at 0: with the Sun high, horizonY runs to several hundred units and a negative height
		     is invalid SVG — the browser rejects the attribute and logs an error every frame. -->
		<rect class="loupe-ground" x="-50" y={horizonY} width="100" height={Math.max(0, 300 - horizonY)} />
	</svg>
</div>

<style>
	/* A) loupe inset (magnified crescent) + B) Sun locator square & leader lines. These sit above the
	   twilight veil (added by the parent), so they stay legible as the eclipse darkens the scene. */
	/* the loupe is a square (same shape as the locator marker), showing the crescent on the same sky colour
	   that is behind the real Sun → reads as a straight magnification of the marked spot. */
	.b3-loupe {
		position: absolute;
		top: 10px;
		left: 10px;
		box-sizing: border-box;
		width: 96px;
		height: 96px;
		border-radius: 0;
		overflow: hidden;
		background: var(--loupe-sky, #8fb4e0);
		border: 2px solid #fff;
		box-shadow: 0 1px 5px rgba(0, 0, 0, 0.5);
		pointer-events: none;
		--loupe-glow: #f2894b; /* warm sunset tint for the horizon glow + line */

		svg {
			display: block;
			width: 100%;
			height: 100%;
		}
		.loupe-sun {
			fill: var(--loupe-sun);
		}
		.loupe-sky {
			fill: var(--loupe-sky, #8fb4e0); /* the Moon reveals the sky, same as in the scene */
		}
		.loupe-moon {
			fill: var(--loupe-sky, #8fb4e0); /* the Moon reveals the sky, same as in the scene */
		}
		.loupe-glow {
			fill: url(#loupe-glow-grad);
			mix-blend-mode: overlay; /* subtle warm tint over the sky, just above the horizon */
		}
		.glow-top {
			stop-color: var(--loupe-glow);
			stop-opacity: 0;
		}
		.glow-bottom {
			stop-color: var(--loupe-glow);
			stop-opacity: 0.5;
		}
		.loupe-ground {
			fill: var(--loupe-ground, #15110d); /* dusk-darkened land silhouette below the horizon */
		}
	}
	/* same white rim + shadow as the loupe, only a bit thinner (the loupe is its magnification) */
	.b3-locator {
		position: absolute;
		top: 0;
		left: 0;
		box-sizing: border-box;
		width: 26px;
		height: 26px;
		border: 1px solid #fff;
		border-radius: 0;
		pointer-events: none;
	}
	.b3-leader {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
		pointer-events: none;
		line {
			stroke: #fff;
			stroke-width: 0.5;
		}
	}
	:is(.b3-loupe, .b3-locator, .b3-leader).hidden {
		display: none;
	}
</style>
