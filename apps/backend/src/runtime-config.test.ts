import { describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from './runtime-config.js';

describe('W2/P6 — configuration d’exécution', () => {
  it('autorise la démo locale explicitement', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'local',
      AUTH_DEV_MODE: '1',
      PAYMENT_DEV_MODE: '1',
      DEV_ADMIN_TOKEN: 'local-only',
      FEDAPAY_ENVIRONMENT: 'sandbox',
    });
    expect(result.errors).toEqual([]);
    expect(result.warnings.join(' ')).toContain('mode DEV');
  });

  it('refuse une production incomplète et les modes DEV', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'production',
      AUTH_DEV_MODE: '1',
      PAYMENT_DEV_MODE: 'true',
      DEV_ADMIN_TOKEN: 'must-not-exist',
      FEDAPAY_ENVIRONMENT: 'sandbox',
    });
    expect(result.environment).toBe('production');
    expect(result.errors).toEqual(expect.arrayContaining([
      'SUPABASE_URL est obligatoire avec APP_ENV=production.',
      'SUPABASE_ANON_KEY est obligatoire avec APP_ENV=production.',
      'FEDAPAY_SECRET_KEY est obligatoire avec APP_ENV=production.',
      'FEDAPAY_WEBHOOK_SECRET est obligatoire avec APP_ENV=production.',
      'TICKET_VAULT_KEY est obligatoire avec APP_ENV=production.',
      'FEDAPAY_ENVIRONMENT=live est obligatoire avec APP_ENV=production.',
      'AUTH_DEV_MODE doit être désactivé avec APP_ENV=production.',
      'PAYMENT_DEV_MODE doit être désactivé avec APP_ENV=production.',
      'DEV_ADMIN_TOKEN doit être absent avec APP_ENV=production.',
    ]));
  });

  it('accepte la configuration production complète sans exposer les valeurs', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'production',
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'public-anon-key',
      FEDAPAY_SECRET_KEY: 'live-secret',
      FEDAPAY_WEBHOOK_SECRET: 'wh_live_secret',
      FEDAPAY_ENVIRONMENT: 'live',
      TICKET_VAULT_KEY: 'long-secret',
    });
    expect(result).toEqual({ environment: 'production', errors: [], warnings: [] });
  });

  it('refuse staging avec des modes DEV et live sans clé', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'staging',
      AUTH_DEV_MODE: '1',
      FEDAPAY_ENVIRONMENT: 'live',
    });
    expect(result.errors).toContain('FEDAPAY_SECRET_KEY est obligatoire lorsque FEDAPAY_ENVIRONMENT=live.');
    expect(result.errors).toContain('Les modes DEV sont interdits avec APP_ENV=staging.');
  });
});
