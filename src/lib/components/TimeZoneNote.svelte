<!-- Shared time-zone note: states, once and clearly, which zone every clock on the page is shown in — the
     viewer's own browser/device zone (IANA name + short abbreviation + UTC offset). Reusable wherever a
     reminder is useful. Client-only: the zone is read from the browser, so it renders after mount (the
     prerendered HTML carries no — possibly wrong — server zone). -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t, fmt } from '$lib/i18n';
	import { TIMELINE_START } from '$lib/config';

	let mounted = $state(false);
	onMount(() => (mounted = true));

	// "Europe/Berlin (MESZ · UTC+2)" — the abbreviation/offset are taken for the eclipse day, so DST is
	// reflected correctly. The abbreviation is dropped when it's just another spelling of the offset (e.g. en's
	// "GMT+2"), to avoid "…(GMT+2 · UTC+2)".
	const zone = $derived.by(() => {
		if (!mounted) return null;
		const iana = $fmt.zoneName();
		const abbr = $fmt.zone(TIMELINE_START);
		const mins = -TIMELINE_START.getTimezoneOffset();
		const a = Math.abs(mins);
		const offset = `UTC${mins < 0 ? '-' : '+'}${Math.floor(a / 60)}${a % 60 ? ':' + String(a % 60).padStart(2, '0') : ''}`;
		const showAbbr = abbr && !/^(gmt|utc)/i.test(abbr);
		return `${iana} (${showAbbr ? `${abbr} · ` : ''}${offset})`;
	});
</script>

{#if zone}
	<p class="tz-note" title={$t('tz.note')}>
		<span class="ico" aria-hidden="true">🌐</span>
		<span>{$t('tz.all_in', { zone })}</span>
	</p>
{/if}

<style>
	.tz-note {
		display: flex;
		align-items: baseline;
		justify-content: center;
		gap: 6px;
		color: var(--muted);
		font-size: 0.82rem;
		text-align: center;
		text-wrap: balance;

		.ico {
			font-size: 0.9em;
		}
	}
</style>
