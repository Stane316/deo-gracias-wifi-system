/**
 * IMP-25.6 — garde-fous de configuration d'exécution.
 *
 * Cette validation est pure : elle ne contacte ni PostgreSQL, ni Supabase, ni
 * FedaPay. Elle est exécutée avant la création du pool PostgreSQL.
 * Les erreurs indiquent uniquement les noms de variables et des consignes,
 * jamais les valeurs fournies.
 */
import { explainDatabaseUrlProblem } from './env-check.js';

export type DeploymentEnvironment = 'local' | 'test' | 'staging' | 'production';
export type FedaPayEnvironment = 'sandbox' | 'live';

export interface RuntimeConfigResult {
  environment: DeploymentEnvironment;
  fedapayEnvironment: FedaPayEnvironment;
  authDevMode: boolean;
  paymentDevMode: boolean;
  errors: string[];
  warnings: string[];
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateFlag(
  name: string,
  value: string | undefined,
  errors: string[],
): boolean {
  if (!nonEmpty(value)) return false;
  const normalized = value!.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  errors.push(`${name} doit valoir 0, 1, false, true, no, yes, off ou on.`);
  return false;
}

function environmentOf(env: NodeJS.ProcessEnv): { environment: DeploymentEnvironment; errors: string[] } {
  const raw = (env['APP_ENV'] ?? '').trim().toLowerCase();
  if (raw === 'local' || raw === 'test' || raw === 'staging' || raw === 'production') {
    return { environment: raw, errors: [] };
  }
  if (raw.length === 0) {
    return {
      environment: 'local',
      errors: ['APP_ENV est obligatoire. Valeurs autorisées : local, test, staging, production.'],
    };
  }
  return {
    environment: 'local',
    errors: [`APP_ENV invalide : « ${raw} ». Valeurs autorisées : local, test, staging, production.`],
  };
}

function parseFedaPayEnvironment(
  value: string | undefined,
  errors: string[],
): FedaPayEnvironment {
  const normalized = (value ?? 'sandbox').trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'live') return normalized;
  errors.push('FEDAPAY_ENVIRONMENT doit valoir sandbox ou live.');
  return 'sandbox';
}

function validatePort(env: NodeJS.ProcessEnv, errors: string[]): void {
  const raw = env['PORT'];
  if (!nonEmpty(raw)) return;
  const port = Number(raw!.trim());
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    errors.push('PORT doit être un entier compris entre 1 et 65535.');
  }
}

function validateWorkers(env: NodeJS.ProcessEnv, errors: string[]): void {
  const raw = env['WORKERS'];
  if (!nonEmpty(raw)) return;
  const normalized = raw!.trim().toLowerCase();
  if (normalized !== 'on' && normalized !== 'off') {
    errors.push('WORKERS doit valoir on ou off.');
  }
}

/**
 * Valide les invariants de démarrage sans appeler le réseau ni exposer de secret.
 */
export function validateRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfigResult {
  const selected = environmentOf(env);
  const errors = [...selected.errors];
  const warnings: string[] = [];
  const environment = selected.environment;
  const production = environment === 'production';
  const fedapayEnvironment = parseFedaPayEnvironment(env['FEDAPAY_ENVIRONMENT'], errors);
  const authDevMode = validateFlag('AUTH_DEV_MODE', env['AUTH_DEV_MODE'], errors);
  const paymentDevMode = validateFlag('PAYMENT_DEV_MODE', env['PAYMENT_DEV_MODE'], errors);

  const databaseProblem = explainDatabaseUrlProblem(env['DATABASE_URL']);
  if (databaseProblem) errors.push(databaseProblem);
  validatePort(env, errors);
  validateWorkers(env, errors);

  if (fedapayEnvironment === 'live' && !nonEmpty(env['FEDAPAY_SECRET_KEY'])) {
    errors.push('FEDAPAY_SECRET_KEY est obligatoire lorsque FEDAPAY_ENVIRONMENT=live.');
  }

  if (production) {
    const required = [
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'FEDAPAY_SECRET_KEY',
      'FEDAPAY_WEBHOOK_SECRET',
      'TICKET_VAULT_KEY',
    ];
    for (const name of required) {
      if (!nonEmpty(env[name])) errors.push(`${name} est obligatoire avec APP_ENV=production.`);
    }
    if (nonEmpty(env['SUPABASE_URL']) && !env['SUPABASE_URL']!.trim().startsWith('https://')) {
      errors.push('SUPABASE_URL doit commencer par https:// avec APP_ENV=production.');
    }
    if (fedapayEnvironment !== 'live') {
      errors.push('FEDAPAY_ENVIRONMENT=live est obligatoire avec APP_ENV=production.');
    }
    if (authDevMode) errors.push('AUTH_DEV_MODE doit être désactivé avec APP_ENV=production.');
    if (paymentDevMode) errors.push('PAYMENT_DEV_MODE doit être désactivé avec APP_ENV=production.');
    if (nonEmpty(env['DEV_ADMIN_TOKEN'])) {
      errors.push('DEV_ADMIN_TOKEN doit être absent avec APP_ENV=production.');
    }
  } else {
    if (authDevMode || paymentDevMode) {
      warnings.push('Un mode DEV est actif : réservé à local/test, jamais à une instance publique.');
    } else if (nonEmpty(env['DEV_ADMIN_TOKEN'])) {
      warnings.push('DEV_ADMIN_TOKEN est renseigné mais aucun mode DEV ne l’utilise.');
    }
    if (environment === 'staging' && (authDevMode || paymentDevMode || nonEmpty(env['DEV_ADMIN_TOKEN']))) {
      errors.push('Les modes DEV sont interdits avec APP_ENV=staging.');
    }
    if (fedapayEnvironment === 'live') {
      errors.push('FEDAPAY_ENVIRONMENT=live est interdit hors APP_ENV=production.');
    }
  }

  return { environment, fedapayEnvironment, authDevMode, paymentDevMode, errors, warnings };
}
