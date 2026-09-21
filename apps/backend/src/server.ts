/**
 * IMP-12 — Point d'entrée runtime : `npm run start -w @dg/backend` (tsx)
 * ou `npm run dev -w @dg/backend` (watch). Nécessite DATABASE_URL et une base
 * migrée (tools/db-migrate.sh up). Aucun secret dans les logs (blueprint §7).
 */
import { Pool } from 'pg';
import { buildApp } from './app.js';
import { PgRepo } from './repo.js';

const databaseUrl = process.env['DATABASE_URL'];
if (!databaseUrl) {
  console.error('DATABASE_URL manquante (voir .env.example). Abandon.');
  process.exit(1);
}

const repo = new PgRepo(new Pool({ connectionString: databaseUrl }));
const app = await buildApp({ repo, logger: true });
const host = process.env['HOST'] ?? '0.0.0.0';
const port = Number(process.env['PORT'] ?? 3000);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    app.close().then(() => process.exit(0), () => process.exit(1));
  });
}

await app.listen({ host, port });
