<script lang="ts">
	import { t } from '$lib/i18n';
	import { setLocation } from '$lib/stores/location';

	let manual = $state('');
	let error = $state('');
	let busy = $state(false);

	function useGeo() {
		error = '';
		if (!navigator.geolocation) {
			error = $t('a4.geo_error');
			return;
		}
		busy = true;
		navigator.geolocation.getCurrentPosition(
			(pos) => {
				busy = false;
				setLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude, name: null });
			},
			() => {
				busy = false;
				error = $t('a4.geo_error');
			},
			{ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }
		);
	}

	function useManual() {
		const nums = manual
			.split(/[\s,;]+/)
			.map(Number)
			.filter((n) => Number.isFinite(n));
		if (nums.length >= 2 && Math.abs(nums[0]) <= 90 && Math.abs(nums[1]) <= 180) {
			error = '';
			setLocation({ lat: nums[0], lon: nums[1], name: null });
		} else {
			error = $t('a4.geo_error');
		}
	}
</script>

<section class="block call">
	<h2>{$t('a4.title')}</h2>
	<div class="actions">
		<button class="primary" onclick={useGeo} disabled={busy}>📍 {$t('a4.geo')}</button>
		<button disabled title={$t('a4.soon')}>🔍 {$t('a4.search')}</button>
		<button disabled title={$t('a4.soon')}>🗺 {$t('a4.map')}</button>
	</div>
	<form
		class="manual"
		onsubmit={(e) => {
			e.preventDefault();
			useManual();
		}}
	>
		<input
			inputmode="decimal"
			placeholder={$t('a4.manual_hint')}
			bind:value={manual}
			aria-label={$t('a4.manual_hint')}
		/>
		<button type="submit">{$t('a4.use')}</button>
	</form>
	{#if error}<p class="err">{error}</p>{/if}
</section>

<style>
	.call h2 {
		margin-bottom: 12px;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}
	.actions .primary {
		border-color: var(--accent);
		color: var(--accent);
		font-weight: 600;
	}
	.actions button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.manual {
		display: flex;
		gap: 8px;
		margin-top: 12px;
	}
	.manual input {
		flex: 1;
		min-width: 0;
		padding: 0.55rem 0.7rem;
		border-radius: var(--radius-sm);
		border: 1px solid var(--border);
		background: var(--bg-2);
		color: var(--text);
		font: inherit;
	}
	.manual input:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 1px;
	}
	.err {
		margin-top: 10px;
		color: var(--warn);
		font-size: 0.85rem;
	}
</style>
