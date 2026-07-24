<script>
	import { t, locale, setLocale, LOCALES, LOCALE_NAMES } from '$lib/i18n';
</script>

<header class="hdr">
	<div class="brand">
		<span class="mark" aria-hidden="true">☀︎</span>
		<span class="name">{$t('app.title')}</span>
	</div>
	<div class="langs" role="group" aria-label={$t('nav.language')}>
		{#each LOCALES as l (l)}
			<button
				class:active={$locale === l}
				aria-pressed={$locale === l}
				title={LOCALE_NAMES[l]}
				onclick={() => setLocale(l)}>{l.toUpperCase()}</button
			>
		{/each}
	</div>
</header>

<style>
	.hdr {
		position: sticky;
		top: 0;
		z-index: 20;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 16px;
		margin-bottom: 4px;
		background: color-mix(in oklab, var(--bg) 82%, transparent);
		backdrop-filter: blur(10px);
		border-bottom: 1px solid var(--border);
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 8px;
		font-weight: 800;
		letter-spacing: -0.01em;
	}
	.mark {
		color: var(--accent);
		font-size: 1.15rem;
	}
	.langs {
		display: flex;
		gap: 4px;
	}
	.langs button {
		padding: 4px 8px;
		font-size: 0.78rem;
		font-weight: 600;
		border-radius: 8px;
		color: var(--muted);
	}
	.langs button.active {
		color: var(--bg);
		background: var(--accent);
		border-color: var(--accent);
	}
</style>
