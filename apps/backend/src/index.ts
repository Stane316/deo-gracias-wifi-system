/**
 * IMP-12 — API catalogue/commandes (Fastify, zod, healthz).
 * buildApp est injectable (BackendRepo) : tests unitaires sans base,
 * intégration réelle via PgRepo (DATABASE_URL).
 */
export const APP_NAME = 'dg-backend' as const;
export { buildApp, type BuildAppOptions } from './app.js';
export { allocateAndDeliver, type DeliveryLog, type DeliveryOutcome } from './tickets.js';
export {
  PgRepo,
  buildPlanSnapshot,
  type ActivePlan,
  type BackendRepo,
  type CreateOrderInputDb,
  type AllocateResult,
  type OrderRecord,
  type PaymentRecord,
  type TicketRecord,
} from './repo.js';
export {
  FEDAPAY_SIGNATURE_HEADER,
  FedaPayClient,
  computeWebhookSignature,
  generateTestHeaderString,
  parseWebhookEvent,
  verifyWebhookSignature,
  type CheckoutInput,
  type CheckoutResult,
  type FedaPayClientOptions,
  type FedaPayWebhookEvent,
  type PaymentProvider,
  type WebhookVerifyResult,
} from './fedapay.js';
export {
  ADMIN_ROLES,
  OtpStore,
  SessionStore,
  SupabaseAuthVerifier,
  bearerToken,
  type AuthIdentity,
  type AuthVerifier,
  type OtpConfig,
} from './auth.js';
export {
  authPhoneRequestSchema,
  authPhoneVerifySchema,
  createOrderBodySchema,
  normalizePhone,
  idempotencyKeySchema,
  orderIdParamsSchema,
  phoneSchema,
  problem,
  type OrderView,
  type ProblemDetail,
} from './schemas.js';
