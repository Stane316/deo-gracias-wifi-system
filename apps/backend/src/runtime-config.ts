/**
 * W2/P6 — garde-fous de configuration d'exécution.
 *
 * Le code DEV reste utile en local, mais ne doit jamais être activable par
 * accident dans un environnement de production. Cette validation est pure et
 * appelée avant la création du pool PostgreSQL dans server.ts.
 */

export type DeploymentEnvironment = 'local' | 'test' | 'staging' | 'production';

export interface RuntimeConfigResult {
  environment: DeploymentEnvironment;
  errors: string[];
  warnings: string[];
}

function truthy(value: string | undefined): boolean {
  return ['1', 'true', 'yes'].includes((value ?? '').trim().toLowerCase());
}

function nonEmpty(value: string | undefined): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function environmentOf(env: NodeJS.ProcessEnv): { environment: DeploymentEnvironment; errors: string[] } {
  const raw = (env['APP_ENV'] ?? (env['NODE_ENV'] === 'production' ? 'production' : 'local')).trim().toLowerCase();
  if (raw === 'local' || raw === 'test' || raw === 'staging' || raw === 'production') {
    return { environment: raw, errors: [] };
  }
  return {
    environment: 'local',
    errors: [`APP_ENV invalide : « ${raw} ». Valeurs autorisées : local, test, staging, production.`],
  };
}

/**
 * Vérifie les invariants de démarrage sans appeler le réseau ni lire de secret.
 * Les messages nomment uniquement les variables manquantes, jamais leur valeur.
 */
export function validateRuntimeConfig(env: NodeJS.ProcessEnv): RuntimeConfigResult {
  const selected = environmentOf(env);
  const errors = [...selected.errors];
  const warnings: string[] = [];
  const environment = selected.environment;
  const production = environment === 'production';
  const devAuth = truthy(env['AUTH_DEV_MODE']);
  const devPayment = truthy(env['PAYMENT_DEV_MODE']);
  const fedapayEnvironment = (env['FEDAPAY_ENVIRONMENT'] ?? 'sandbox').trim().toLowerCase();

  if (fedapayEnvironment !== 'sandbox' && fedapayEnvironment !== 'live') {
    errors.push('FEDAPAY_ENVIRONMENT doit valoir sandbox ou live.');
  }

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
    if (fedapayEnvironment !== 'live') {
      errors.push('FEDAPAY_ENVIRONMENT=live est obligatoire avec APP_ENV=production.');
    }
    if (devAuth) errors.push('AUTH_DEV_MODE doit être désactivé avec APP_ENV=production.');
    if (devPayment) errors.push('PAYMENT_DEV_MODE doit être désactivé avec APP_ENV=production.');
    if (nonEmpty(env['DEV_ADMIN_TOKEN'])) {
      errors.push('DEV_ADMIN_TOKEN doit être absent avec APP_ENV=production.');
    }
  } else {
    if (devAuth || devPayment || nonEmpty(env['DEV_ADMIN_TOKEN'])) {
      warnings.push('Un mode DEV est actif : réservé à local/test, jamais à une instance publique.');
    }
    if (environment === 'staging' && (devAuth || devPayment || nonEmpty(env['DEV_ADMIN_TOKEN']))) {
      errors.push('Les modes DEV sont interdits avec APP_ENV=staging.');
    }
    if (production === false && fedapayEnvironment === 'live') {
      warnings.push('FedaPay live est actif hors production : utiliser uniquement pour un smoke test explicitement contrôlé.');
    }
  }

  return { environment, errors, warnings };
}
