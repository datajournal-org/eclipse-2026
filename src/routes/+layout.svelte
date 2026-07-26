<script lang="ts">
	// Open Props engineering scales (tokens.css maps these into our semantic roles).
	import 'open-props/sizes';
	import 'open-props/fonts';
	import 'open-props/easings';
	import '../app.css';
	import { onMount, type Snippet } from 'svelte';
	import { initLocale } from '$lib/i18n';
	import Header from '$lib/components/Header.svelte';

	let { children }: { children: Snippet } = $props();

	const SCROLL_KEY = 'eclipse.scroll';

	onMount(() => {
		initLocale();

		// Manual scroll restoration. The located "B" state renders on the client, so on a reload the page
		// grows past the prerendered "A" shell only AFTER SvelteKit has already restored the scroll against
		// the short shell — landing too high. We restore it ourselves once the real layout is in place.
		const saved = sessionStorage.getItem(SCROLL_KEY);
		if (saved != null) {
			const y = +saved;
			let active = true;
			const stop = () => (active = false);
			addEventListener('wheel', stop, { passive: true, once: true });
			addEventListener('touchstart', stop, { passive: true, once: true });
			addEventListener('keydown', stop, { once: true });
			// Re-apply the saved position every frame until we've actually held y for ~400 ms, or the visitor
			// scrolls. Keying off "y held" (not "height constant") rides out the async layout — the late "B"
			// content climbing off a clamped short page, and scroll-anchoring nudges after it lands — while a
			// jittering page height (map tiles) can't keep the loop alive and fight a later manual scroll.
			const start = performance.now();
			let heldSince = 0;
			const tick = (now: number) => {
				if (!active) return;
				scrollTo(0, y);
				if (Math.abs(scrollY - y) <= 1) heldSince ||= now;
				else heldSince = 0; // clamped (page still short) or knocked off by a shift — keep going
				const settled = heldSince && now - heldSince >= 400;
				if (!settled && now - start < 5000) requestAnimationFrame(tick);
			};
			requestAnimationFrame(tick);
		}

		// Keep the position saved: live (throttled) while scrolling, and a guaranteed synchronous flush on
		// pagehide so a reload always sees the latest position even if the throttled write hasn't fired.
		let last = Math.round(scrollY);
		const flush = () => sessionStorage.setItem(SCROLL_KEY, String(last));
		let raf = 0;
		const save = () => {
			last = Math.round(scrollY);
			if (raf) return;
			raf = requestAnimationFrame(() => {
				raf = 0;
				flush();
			});
		};
		addEventListener('scroll', save, { passive: true });
		addEventListener('pagehide', flush);
		return () => {
			removeEventListener('scroll', save);
			removeEventListener('pagehide', flush);
		};
	});
</script>

<div class="app">
	<Header />
	{@render children()}
</div>
