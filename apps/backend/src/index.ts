/**
 * IMP-12 — API catalogue/commandes (Fastify, zod, healthz).
 * buildApp est injectable (BackendRepo) : tests unitaires sans base,
 * intégration réelle via PgRepo (DATABASE_URL).
 */
export const APP_NAME = 'dg-backend' as const;
export { buildApp, type BuildAppOptions } from './app.js';
export {
  PgRepo,
  buildPlanSnapshot,
  type ActivePlan,
  type BackendRepo,
  type CreateOrderInputDb,
  type OrderRecord,
} from './repo.js';
export {
  createOrderBodySchema,
  idempotencyKeySchema,
  orderIdParamsSchema,
  phoneSchema,
  problem,
  type OrderView,
  type ProblemDetail,
} from './schemas.js';
