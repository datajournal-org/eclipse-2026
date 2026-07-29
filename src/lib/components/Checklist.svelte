<!-- B6 — Personal checklist & countdown: a live countdown to this location's maximum, a tick-off list
     (glasses, clear view to the Sun's azimuth, weather) and a one-tap calendar export (.ics, built
     client-side so nothing leaves the device). Times/azimuth from the shared localEclipse store.

     Also serves state A: before a location is chosen, only the tick-off list renders — no countdown
     and no calendar export, since both would have to point at a maximum that is nowhere in particular —
     so the safety and preparation advice still reaches readers who never pick a place. A chosen
     location the eclipse misses still hides it (the page gates on that): generic prep under a verdict
     that says "not visible from here" would contradict it. -->
<script lang="ts">
	import { t, fmt } from '$lib/i18n';
	import { localEclipse } from '$lib/stores/localEclipse';
	import { userLocation } from '$lib/stores/location';
	import { sunMoonHorizon } from '$lib/eclipse';
	import { now, splitDuration, pad2 } from '$lib/stores/now';

	const lc = $derived($localEclipse);
	const loc = $derived($userLocation);
	const peak = $derived(lc?.peak ?? null);

	// Sun azimuth at maximum → "look toward the west (azimuth N°)".
	const az = $derived(peak && loc ? Math.round(sunMoonHorizon(loc.lat, loc.lon, peak.time).sun.az) : null);

	const remaining = $derived(peak ? peak.time.getTime() - $now : 0);
	const parts = $derived(splitDuration(remaining));

	const items = $derived([
		{ key: 'glasses', text: $t('b6.glasses'), why: $t('b6.glasses_why') },
		{ key: 'view', text: az == null ? $t('b6.view_generic') : $t('b6.view', { az }), why: $t('b6.view_why') },
		{ key: 'weather', text: $t('b6.weather'), why: $t('b6.weather_why') }
	]);

	function icsStamp(d: Date): string {
		return d
			.toISOString()
			.replace(/[-:]/g, '')
			.replace(/\.\d{3}/, '');
	}
	/** RFC 5545 text escaping: backslash first, then the separators; newlines become literal \n. */
	function icsText(text: string): string {
		return text.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n');
	}
	function downloadIcs() {
		if (!lc || !peak) return;
		const start = lc.partialBegin?.time ?? new Date(peak.time.getTime() - 3600_000);
		const end = lc.partialEnd?.time ?? new Date(peak.time.getTime() + 3600_000);
		// The entry should be useful when it fires: the local phase times, how much of the Sun is
		// covered here, and the one safety line — reusing the exact strings the page itself shows.
		// Times are formatted in the viewer's zone, matching how their calendar will display DTSTART.
		const description = [
			`${$t('b3.phase_start')}: ${$fmt.time(start)}`,
			`${$t('b3.phase_max')}: ${$fmt.time(peak.time)} — ${$t('b1.obscured', { pct: Math.round(lc.obscuration * 100) })}`,
			`${$t('b3.phase_end')}: ${$fmt.time(end)}`,
			$t('safety')
		].join('\n');
		const ics = [
			'BEGIN:VCALENDAR',
			'VERSION:2.0',
			'PRODID:-//eclipse2026//EN',
			'BEGIN:VEVENT',
			`UID:eclipse2026-${peak.time.getTime()}@local`,
			`DTSTAMP:${icsStamp(new Date())}`,
			`DTSTART:${icsStamp(start)}`,
			`DTEND:${icsStamp(end)}`,
			`SUMMARY:${icsText($t('b6.event_title'))}`,
			`DESCRIPTION:${icsText(description)}`,
			loc?.name ? `LOCATION:${icsText(loc.name)}` : '',
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

{#if peak || !loc}
	<section class="block b6">
		<div class="block-head">
			<h2>{$t('b6.title')}</h2>
		</div>

		<!-- Countdown and calendar export are LOCAL promises — state A gets only the list below. -->
		{#if peak}
			{#if remaining > 0}
				<div class="count tnum" aria-live="off">
					{#if parts.d > 0}<span class="seg"><b class="stat">{parts.d}</b>{$t('countdown.d')}</span>{/if}
					<span class="seg"><b class="stat">{pad2(parts.h)}</b>{$t('countdown.h')}</span>
					<span class="seg"><b class="stat">{pad2(parts.m)}</b>{$t('countdown.m')}</span>
					<span class="seg"><b class="stat">{pad2(parts.s)}</b>{$t('countdown.s')}</span>
					<span class="note">{$t('b6.until_max')}</span>
				</div>
			{:else}
				<p class="past">{$t('b6.past')}</p>
			{/if}
		{/if}

		<ul class="checks">
			{#each items as it (it.key)}
				<li>
					{it.text}
					<span class="why">{it.why}</span>
				</li>
			{/each}
		</ul>

		{#if peak}
			<button class="cal" onclick={downloadIcs}>{$t('b6.add_calendar')}</button>
		{/if}
	</section>
{/if}

<style>
	.why {
		display: block;
		margin-top: 2px;
		font-size: var(--text-caption);
		color: var(--muted);
	}

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

		b {
			font-size: 1.6rem;
			margin-right: 2px;
		}
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

		li {
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
