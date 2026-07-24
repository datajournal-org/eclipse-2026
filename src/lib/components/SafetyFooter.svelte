<script>
  import { t } from '$lib/i18n';
</script>

<footer class="safety">
  <span class="icon" aria-hidden="true">⚠</span>
  <span>{$t('safety')}</span>
</footer>

<style>
  .safety {
    display: flex; align-items: flex-start; gap: 10px;
    max-width: var(--maxw); margin: 12px auto 0; padding: 14px 16px;
    color: var(--text); font-size: 0.88rem; font-weight: 600;
    border-top: 1px solid color-mix(in oklab, var(--warn) 40%, var(--border));
    background: color-mix(in oklab, var(--warn) 9%, transparent);
  }
  .icon { color: var(--warn); font-size: 1.1rem; line-height: 1.4; }
</style>
