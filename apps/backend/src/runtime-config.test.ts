import { describe, expect, it } from 'vitest';
import { validateRuntimeConfig } from './runtime-config.js';

const DATABASE_URL = 'postgres://postgres:local-only@127.0.0.1:5432/postgres';

describe('IMP-25.6 — configuration d’exécution', () => {
  it('autorise la démo locale explicitement et normalise les flags', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'local',
      DATABASE_URL,
      AUTH_DEV_MODE: 'yes',
      PAYMENT_DEV_MODE: 'on',
      DEV_ADMIN_TOKEN: 'local-only',
      FEDAPAY_ENVIRONMENT: 'SANDBOX',
      WORKERS: 'off',
    });
    expect(result).toMatchObject({
      environment: 'local',
      fedapayEnvironment: 'sandbox',
      authDevMode: true,
      paymentDevMode: true,
      errors: [],
    });
    expect(result.warnings.join(' ')).toContain('mode DEV');
  });

  it('refuse une configuration sans APP_ENV ni DATABASE_URL', () => {
    const result = validateRuntimeConfig({});
    expect(result.errors).toEqual(expect.arrayContaining([
      'APP_ENV est obligatoire. Valeurs autorisées : local, test, staging, production.',
      'DATABASE_URL manquante. Renseignez-la dans .env (GUIDE-10 §3).',
    ]));
  });

  it('refuse une production incomplète et les modes DEV', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'production',
      DATABASE_URL,
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
      DATABASE_URL,
      SUPABASE_URL: 'https://project.supabase.co',
      SUPABASE_ANON_KEY: 'public-anon-key',
      FEDAPAY_SECRET_KEY: 'live-secret',
      FEDAPAY_WEBHOOK_SECRET: 'wh_live_secret',
      FEDAPAY_ENVIRONMENT: 'live',
      TICKET_VAULT_KEY: 'long-secret',
      AUTH_DEV_MODE: '0',
      PAYMENT_DEV_MODE: '0',
    });
    expect(result).toEqual({
      environment: 'production',
      fedapayEnvironment: 'live',
      authDevMode: false,
      paymentDevMode: false,
      errors: [],
      warnings: [],
    });
    expect(JSON.stringify(result)).not.toContain('live-secret');
    expect(JSON.stringify(result)).not.toContain('wh_live_secret');
  });

  it('refuse staging avec des modes DEV et FedaPay live', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'staging',
      DATABASE_URL,
      AUTH_DEV_MODE: '1',
      FEDAPAY_ENVIRONMENT: 'live',
      FEDAPAY_SECRET_KEY: 'present-but-not-allowed-here',
    });
    expect(result.errors).toContain('Les modes DEV sont interdits avec APP_ENV=staging.');
    expect(result.errors).toContain('FEDAPAY_ENVIRONMENT=live est interdit hors APP_ENV=production.');
  });

  it('refuse une valeur de flag, un port ou un mode worker ambigus', () => {
    const result = validateRuntimeConfig({
      APP_ENV: 'local',
      DATABASE_URL,
      AUTH_DEV_MODE: 'maybe',
      PORT: '70000',
      WORKERS: 'sometimes',
    });
    expect(result.errors).toEqual(expect.arrayContaining([
      'AUTH_DEV_MODE doit valoir 0, 1, false, true, no, yes, off ou on.',
      'PORT doit être un entier compris entre 1 et 65535.',
      'WORKERS doit valoir on ou off.',
    ]));
  });
});
