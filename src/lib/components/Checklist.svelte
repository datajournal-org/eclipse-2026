<!-- B6 — Personal checklist & countdown: a live countdown to this location's maximum, a tick-off list
     (glasses, clear view to the Sun's azimuth, weather) and a one-tap calendar export (.ics, built
     client-side so nothing leaves the device). Times/azimuth from the shared localEclipse store. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { userLocation } from '$lib/stores/location';
	import { sunMoonHorizon } from '$lib/eclipse';

	const lc = $derived($localEclipse);
	const loc = $derived($userLocation);
	const peak = $derived(lc?.peak ?? null);

	// Sun azimuth at maximum → "look toward the west (azimuth N°)".
	const az = $derived(peak && loc ? Math.round(sunMoonHorizon(loc.lat, loc.lon, peak.time).sun.az) : null);

	let now = $state(0);
	onMount(() => {
		now = Date.now();
		const id = setInterval(() => (now = Date.now()), 1000);
		return () => clearInterval(id);
	});

	const remaining = $derived(peak ? peak.time.getTime() - now : 0);
	const parts = $derived.by(() => {
		const s = Math.max(0, Math.floor(remaining / 1000));
		return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
	});
	const pad = (n: number) => String(n).padStart(2, '0');

	const items = $derived([
		{ key: 'glasses', text: $t('b6.glasses') },
		{ key: 'view', text: $t('b6.view', { az: az ?? '—' }) },
		{ key: 'weather', text: $t('b6.weather') }
	]);

	function icsStamp(d: Date): string {
		return d
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}/, '');
	}
	function downloadIcs() {
		if (!lc || !peak) return;
		const start = lc.partialBegin?.time ?? new Date(peak.time.getTime() - 3600_000);
		const end = lc.partialEnd?.time ?? new Date(peak.time.getTime() + 3600_000);
		const ics = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//eclipse2026//EN',
			'BEGIN:VEVENT',
			`UID:eclipse2026-${peak.time.getTime()}@local`,
			`DTSTAMP:${icsStamp(new Date())}`,
			`DTSTART:${icsStamp(start)}`,
			`DTEND:${icsStamp(end)}`,
			`SUMMARY:${$t('b6.event_title')}`,
			loc?.name ? `LOCATION:${loc.name}` : '',
			'END:VEVENT',
			'END:VCALENDAR'
		]
			.filter(Boolean)
			.join('\r\n');
		const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = 'eclipse-2026.ics';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

{#if peak}
	<section class="block b6">
		<div class="block-head">
			<h2>{$t('b6.title')}</h2>
			<span class="eyebrow">B6</span>
		</div>

		{#if remaining > 0}
			<div class="count tnum" aria-live="off">
				{#if parts.d > 0}<span class="seg"><b>{parts.d}</b>{$t('countdown.d')}</span>{/if}
				<span class="seg"><b>{pad(parts.h)}</b>{$t('countdown.h')}</span>
				<span class="seg"><b>{pad(parts.m)}</b>{$t('countdown.m')}</span>
				<span class="seg"><b>{pad(parts.s)}</b>{$t('countdown.s')}</span>
				<span class="until">{$t('b6.until_max')}</span>
			</div>
		{:else}
			<p class="past">{$t('b6.past')}</p>
		{/if}

		<ul class="checks">
			{#each items as it (it.key)}
				<li>{it.text}</li>
			{/each}
		</ul>

		<button class="cal" onclick={downloadIcs}>{$t('b6.add_calendar')}</button>
	</section>
{/if}

<style>
	.count {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 10px;
		margin-bottom: 4px;
	}
	.seg {
		font-size: 0.8rem;
		color: var(--muted);

		& b {
			font-size: 1.6rem;
			font-weight: 800;
			color: var(--accent);
			margin-right: 2px;
		}
	}
	.until {
		font-size: 0.9rem;
		color: var(--muted);
	}
	.past {
		font-weight: 600;
		color: var(--muted);
	}
	.checks {
		list-style: none;
		padding: 0;
		margin: 14px 0;
		display: flex;
		flex-direction: column;
		gap: 10px;

		& li {
			position: relative;
			padding-left: 26px;
			font-size: 0.95rem;
			line-height: 1.35;

			&::before {
				content: '';
				position: absolute;
				left: 4px;
				top: 0.5em;
				width: 8px;
				height: 8px;
				border-radius: 50%;
				background: var(--accent);
			}
		}
	}
	.cal {
		width: 100%;
		padding: 12px;
		border: 0;
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--fg);
		font-weight: 600;
		font-size: 0.95rem;
		cursor: pointer;

		&:hover {
			background: var(--accent);
			color: var(--bg);
		}
	}
</style>
