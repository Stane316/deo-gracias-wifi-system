/**
 * IMP-12 — Point d'entrée runtime : `npm run start -w @dg/backend` (tsx)
 * ou `npm run dev -w @dg/backend` (watch). Nécessite DATABASE_URL et une base
 * migrée (tools/db-migrate.sh up). Aucun secret dans les logs (blueprint §7).
 */
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { SupabaseAuthVerifier } from './auth.js';
import { FedaPayClient } from './fedapay.js';
import { PgRepo } from './repo.js';

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
const verifier =
  supabaseUrl && supabaseAnonKey ? new SupabaseAuthVerifier(supabaseUrl, supabaseAnonKey) : undefined;
const devMode = ['1', 'true'].includes((process.env['AUTH_DEV_MODE'] ?? '').toLowerCase());

// IMP-14 — FedaPay : clés depuis l'environnement uniquement (jamais au repo).
const fedapaySecretKey = process.env['FEDAPAY_SECRET_KEY'];
const fedapayWebhookSecret = process.env['FEDAPAY_WEBHOOK_SECRET'];
const fedapayEnvironment = process.env['FEDAPAY_ENVIRONMENT'] === 'live' ? 'live' : 'sandbox';
const provider = fedapaySecretKey
  ? new FedaPayClient({ secretKey: fedapaySecretKey, environment: fedapayEnvironment })
  : undefined;

const app = await buildApp({
  repo,
  logger: true,
  auth: { devMode, ...(verifier ? { verifier } : {}) },
  payment: {
    ...(provider ? { provider } : {}),
    ...(fedapayWebhookSecret ? { webhookSecret: fedapayWebhookSecret } : {}),
  },
});
const host = process.env['HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORT'] ?? 3000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await app.listen({ host, port });
