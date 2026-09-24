/**
 * IMP-12 — Point d'entrée runtime : `npm run start -w @dg/backend` (tsx)
 * ou `npm run dev -w @dg/backend` (watch). Nécessite DATABASE_URL et une base
 * migrée (tools/db-migrate.sh up). Aucun secret dans les logs (blueprint §7).
 */
import { config as loadDotenv } from 'dotenv';
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { DevStaticAuthVerifier, SupabaseAuthVerifier } from './auth.js';
import { DevPaymentProvider } from './dev-payment.js';
import { FedaPayClient } from './fedapay.js';
import { PgRepo } from './repo.js';

// FIX IMP-25.1 — le backend lit désormais `.env` (dossier backend OU racine du
// monorepo) ; les variables d'environnement réelles gardent priorité (dotenv
// n'écrase jamais une variable déjà définie). GUIDE-09 §2 documente chaque variable.
for (const envPath of ['.env', '../../.env']) loadDotenv({ path: envPath });

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL manquante (voir .env.example). Abandon.');
  process.exit(1);
}

const repo = new PgRepo(new Pool({ connectionString: databaseUrl }));

// IMP-13 — auth : Supabase Auth si configuré (clés non secrètes, blueprint §7) ;
// AUTH_DEV_MODE=1 active le renvoi du code OTP en local (jamais en production).
const supabaseUrl = process.env['SUPABASE_URL'];
const supabaseAnonKey = process.env['SUPABASE_ANON_KEY'];
const devMode = ['1', 'true'].includes((process.env['AUTH_DEV_MODE'] ?? '').toLowerCase());
// IMP-25 — démo visuelle locale : si Supabase est absent, AUTH_DEV_MODE=1 et
// DEV_ADMIN_TOKEN défini, un jeton statique donne le rôle ADMIN (JAMAIS en prod).
const devAdminToken = process.env['DEV_ADMIN_TOKEN'];
const verifier =
  supabaseUrl && supabaseAnonKey
    ? new SupabaseAuthVerifier(supabaseUrl, supabaseAnonKey)
    : devMode && devAdminToken && devAdminToken.length > 0
      ? new DevStaticAuthVerifier(devAdminToken)
      : undefined;

// IMP-14 — FedaPay : clés depuis l'environnement uniquement (jamais au repo).
const fedapaySecretKey = process.env['FEDAPAY_SECRET_KEY'];
const fedapayWebhookSecret = process.env['FEDAPAY_WEBHOOK_SECRET'];
// IMP-21 — auth Connector : token long-lived dédié (blueprint §7).
const connectorToken = process.env['CONNECTOR_TOKEN'];
const fedapayEnvironment = process.env['FEDAPAY_ENVIRONMENT'] === 'live' ? 'live' : 'sandbox';
// IMP-25 — démo visuelle locale : paiement simulé seulement si PAYMENT_DEV_MODE=1
// ET aucune clé FedaPay (la vraie integration prime toujours). Jamais en prod.
const paymentDevMode =
  ['1', 'true'].includes((process.env['PAYMENT_DEV_MODE'] ?? '').toLowerCase()) && !fedapaySecretKey;
const provider = fedapaySecretKey
  ? new FedaPayClient({ secretKey: fedapaySecretKey, environment: fedapayEnvironment })
  : paymentDevMode
    ? new DevPaymentProvider()
    : undefined;

const app = await buildApp({
  repo,
  logger: true,
  auth: { devMode, ...(verifier ? { verifier } : {}) },
  payment: {
    ...(provider ? { provider } : {}),
    ...(fedapayWebhookSecret ? { webhookSecret: fedapayWebhookSecret } : {}),
    ...(paymentDevMode ? { devMode: true } : {}),
  },
  // IMP-21 — contrat Connector : absent => routes /connector 503 (honnête).
  ...(connectorToken && connectorToken.length > 0 ? { connector: { token: connectorToken } } : {}),
  // IMP-20 — workers in-process : order-expiry (1 min), webhook-sweeper (5 min),
  // reconciler simulé (1 h). Périodes par défaut ; désactivables via WORKERS=off.
  ...((process.env['WORKERS'] ?? '').toLowerCase() === 'off' ? {} : { workers: { enabled: true } }),
});
const host = process.env['HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORT'] ?? 3000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await app.listen({ host, port });
