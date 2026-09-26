/**
 * IMP-12 — Couche d'accès données du backend (ADR 0001 : `pg` natif dans Fastify).
 * L'interface BackendRepo permet des tests unitaires sans base (fake en mémoire)
 * et des tests d'intégration réels (PgRepo sur Postgres éphémère CI / sandbox).
 */
import type { Pool } from 'pg';
import { createHash } from 'node:crypto';
import { sealCode } from './ticketvault.js';
import type {
  AdminActivityEvent,
  AdminDashboardDbStats,
  AlertAckRecord,
  ConnectorHeartbeat,
} from './admin.js';
import { FIRST_BACKEND_BATCH_SEQ, generateTicketSpecs, type GeneratedTicketSpec } from './ticketgen.js';
import { STOCK_MANIFEST_IMP06 } from './stock-manifest.js';
import { DEFAULT_RESERVED_TTL_MS } from './workers.js';


export interface ActivePlan {
  planId: string;
  offerId: string;
  priceFcfa: number;
  accessHours: number;
  validityHours: number;
  mikrotikProfile: string;
  limitUptime: string;
  version: number;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  /** IMP-15 : plan de la commande (mapping tickets.plan_id lors de l'allocation). */
  planId: string;
  state: string;
  currency: string;
  planSnapshot: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInputDb {
  customerId: string;
  planId: string;
  planSnapshot: Record<string, unknown>;
  idempotencyKey: string;
}

/** IMP-18 — résultat de la génération d'un lot digital (le code clair n'est
 * retourné QU'À la création : affichage unique, puis uniquement sha256 en base). */
export interface CreatedBackendBatch {
  batchId: string;
  seq: number;
  offerId: string;
  quantity: number;
  generatedAt: Date;
  specs: GeneratedTicketSpec[];
}

/** IMP-27 — listes admin paginées : aucune liste historique n'est chargée en bloc. */
export interface AdminListOptions {
  limit: number;
  offset: number;
  search?: string;
  state?: string;
  offerId?: string;
  paymentState?: string;
  ticketState?: string;
  /** IMP-32 — destination du lot (doc 09 §28). */
  destination?: string;
  from?: Date;
  to?: Date;
}

export interface AdminPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminOrderSummary {
  id: string;
  phone: string;
  state: string;
  offerId: string;
  priceFcfa: number;
  paymentState: string | null;
  ticketState: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminPaymentSummary {
  id: string;
  orderId: string;
  phone: string;
  provider: string;
  providerRef: string | null;
  amountFcfa: number;
  state: string;
  confirmedAt: string | null;
  createdAt: string;
}

export interface AdminOrderTimelineEvent {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  fromState: string | null;
  toState: string | null;
  actor: string;
  at: string;
}

export interface AdminCorrectionRequest {
  id: string;
  orderId: string;
  requestedAction: 'REVIEW_PAYMENT' | 'REVIEW_ALLOCATION' | 'REVIEW_DELIVERY';
  reason: string;
  requestedBy: string;
  state: 'OPEN' | 'REVIEWED' | 'REJECTED' | 'APPLIED';
  idempotencyKey: string;
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  payment: AdminPaymentSummary | null;
  ticket: AdminTicketSummary | null;
  timeline: AdminOrderTimelineEvent[];
}

export interface AdminTicketSummary {
  id: string;
  batchId: string;
  offerId: string;
  source: string;
  /** IMP-32 — destination du lot (doc 09 §28). */
  destination: string;
  dbState: string;
  routerState: string;
  orderId: string | null;
  codePrefixHint: string | null;
  /** IMP-32 — un ticket est révélable uniquement si un sceau coffre existe. */
  revealable: boolean;
  soldAt: string | null;
  reservedAt: string | null;
  createdAt: string | null;
  mikrotikComment: string | null;
  activationDeadline: string | null;
}

export interface AdminBatchSummary {
  id: string;
  source: string;
  quantity: number;
  /** IMP-32 — destination DIGITAL/PHYSICAL (doc 09 §28-30). */
  destination: string;
  offerId: string | null;
  generatedAt: string;
  createdAt: string;
  notes: string | null;
  manifestSha256: string | null;
  /** IMP-32 — compteurs doc 09 §30 (AVAILABLE+RELEASED = réallouables). */
  availableCount: number;
  reservedCount: number;
  /** Réservations au-delà du TTL D11 : le worker order-expiry les libèrera. */
  reservedStaleCount: number;
  soldCount: number;
  usedCount: number;
  expiredCount: number;
  releasedCount: number;
  ticketsCount: number;
}

export interface AdminAuditSummary {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string | null;
  at: string;
}

export interface AdminIncidentSummary {
  id: string;
  type: string;
  severity: string;
  state: string;
  details: Record<string, unknown>;
  openedAt: string;
  closedAt: string | null;
  createdAt: string;
}

/** IMP-32 — format d'un code ticket (contrat Mikmon §3.4, seed 0010) : 8 caractères [0-9a-z]. */
export const TICKET_CODE_FORMAT = /^[0-9a-z]{8}$/;

/** IMP-32 — lot importé en attente de validation (doc 09 §33). */
export interface TicketImportInput {
  offerId: string;
  destination: 'DIGITAL' | 'PHYSICAL';
  codes: string[];
  notes?: string;
  manifestSha256?: string;
}

/** IMP-32 — résultat de validation d'une ligne ; le code n'est jamais renvoyé en clair. */
export interface TicketImportRowResult {
  line: number;
  codeHint: string;
  valid: boolean;
  reason: string | null;
}

/** IMP-32 — prévisualisation d'import : lecture seule, rien n'est persisté (doc 09 §33). */
export interface TicketImportPreview {
  offerId: string;
  destination: string;
  analyzed: number;
  valid: number;
  invalid: number;
  rows: TicketImportRowResult[];
  canImport: boolean;
}

/** IMP-32 — résultat d'import ; jamais d'import partiel silencieux (doc 09 §34). */
export interface TicketImportResult {
  created: boolean;
  batchId: string;
  offerId: string;
  destination: string;
  imported: number;
  rejected: number;
  importPerformed: boolean;
  message: string;
}

/** IMP-32 — réconciliation avec le manifeste du stock IMP-06. */
export interface TicketReconciliationRow {
  batchNote: string;
  offerId: string;
  expected: number;
  actual: number;
  status: 'OK' | 'DIVERGENT' | 'MISSING';
}

export interface TicketReconciliation {
  manifestId: string;
  generatedAt: string;
  expectedTotal: number;
  actualTotal: number;
  ok: boolean;
  rows: TicketReconciliationRow[];
}

export interface BackendRepo {
  /** Sonde de disponibilité (readyz). */
  ping(): Promise<void>;
  /** Catalogue actif : dernière version de chaque offre sans active_to (doc 06 §08). */
  listActivePlans(): Promise<ActivePlan[]>;
  getActivePlanByOffer(offerId: string): Promise<ActivePlan | null>;
  /** Identification minimale (doc 06 §06) : find-or-create atomique par phone. */
  findOrCreateCustomer(phone: string): Promise<string>;
  /**
   * Création idempotente (doc 06 §21) : UNIQUE(idempotency_key) en base.
   * created=false => replay d'une clé déjà utilisée (même commande retournée).
   */
  createOrder(input: CreateOrderInputDb): Promise<{ order: OrderRecord; created: boolean }>;
  getOrderById(id: string): Promise<OrderRecord | null>;
  // --- IMP-14 : paiements + webhooks (doc 06 §14-24) ---
  getCustomerById(customerId: string): Promise<{ id: string; phone: string } | null>;
  createPayment(orderId: string, amountFcfa: number): Promise<PaymentRecord>;
  /** CREATED→INITIATED→PENDING + order CREATED→PAYMENT_PENDING (une transaction). */
  markPaymentAwaitingResult(paymentId: string, providerRef: string): Promise<'initiated' | 'illegal'>;
  getPaymentById(id: string): Promise<PaymentRecord | null>;
  /** Dernier paiement de la commande, y compris CONFIRMED, pour la reprise client. */
  getLatestPaymentForOrder(orderId: string): Promise<PaymentRecord | null>;
  getOpenPaymentForOrder(orderId: string): Promise<PaymentRecord | null>;
  getPaymentByProviderRef(providerRef: string): Promise<PaymentRecord | null>;
  /** Insert-only ; false = déjà présent (idempotence doc 06 §20-21). */
  insertPaymentEvent(entry: {
    paymentId: string | null;
    providerEventId: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<boolean>;
  /** PENDING→CONFIRMED + order PAYMENT_PENDING→PAID (une transaction, doc 06 §24). */
  confirmPayment(paymentId: string): Promise<'confirmed' | 'illegal'>;
  /** PENDING→FAILED|CANCELLED + order aligné (une transaction). */
  failPayment(
    paymentId: string,
    to: { payment: 'FAILED' | 'CANCELLED'; order: 'FAILED' | 'CANCELLED' },
  ): Promise<'failed' | 'illegal'>;
  // --- IMP-15 : allocation atomique + livraison (doc 06 §29-31, blueprint §3.3) ---
  /**
   * Allocation atomique : un ticket AVAILABLE du plan de la commande passe
   * RESERVED→SOLD et la commande PAID→TICKET_ALLOCATED, en UNE transaction
   * (FOR UPDATE SKIP LOCKED — doc 06 §30, invariant 2). Jamais deux commandes
   * sur le même ticket, même sous concurrence.
   */
  allocateTicketForOrder(orderId: string): Promise<AllocateResult>;
  /** TICKET_ALLOCATED→DELIVERED ; idempotent (invariant 7 : jamais double livraison). */
  deliverOrder(orderId: string): Promise<'delivered' | 'already-delivered' | 'illegal'>;
  /** Tickets vendus d'un client (own rows, blueprint §6) — JAMAIS de code en clair. */
  getSoldTicketsForCustomer(customerId: string): Promise<Array<TicketRecord & { offerId: string | null }>>;
  /** Journalisation des connexions admin (doc 09 §8) — audit_logs insert-only. */
  logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
    /** Projection auditée, sans secret ; utilisée par les demandes de correction. */
    after?: Record<string, unknown>;
  }): Promise<void>;
  /** Lie un compte Supabase Auth au client (RLS « own rows » via auth_user_id, 0007). */
  linkCustomerAuth(customerId: string, authUserId: string): Promise<void>;

  /** IMP-20 — commandes PAYMENT_PENDING trop anciennes => EXPIRED (+ paiements PENDING). */
  expireStaleOrders(olderThan: Date): Promise<{ orderIds: string[]; paymentsExpired: number }>;
  /** IMP-20 — tickets RESERVED bloqués trop anciens => RELEASED puis AVAILABLE. */
  releaseStaleReservedTickets(olderThan: Date): Promise<string[]>;
  /** IMP-20 — paiements ouverts avec provider_ref, plus anciens que la date donnée. */
  getOpenPaymentsWithRefOlderThan(olderThan: Date): Promise<PaymentRecord[]>;
  /** IMP-20 — instantané de cohérence interne (reconciler Phase 1). */
  getReconciliationSnapshot(): Promise<{
    soldWithoutOrder: number;
    deliveredWithoutTicket: number;
    totalTickets: number;
    byState: Record<string, number>;
  }>;
  /** IMP-20 — trace de réconciliation (garde-fou INC-03). */
  insertReconciliationRun(run: {
    routerTotalExpected: number;
    routerTotalSeen: number | null;
    diff: Record<string, unknown>;
    status: 'OK' | 'MISMATCH';
  }): Promise<string>;
  /** IMP-20 — lève une alerte (règle, sévérité, payload). */
  raiseAlert(alert: { rule: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; payload: Record<string, unknown> }): Promise<string>;
  /** IMP-25.3 — santé du schéma : tables attendues présentes/manquantes. */
  getSchemaHealth(): Promise<{ present: number; missing: string[] }>;
  /** IMP-24 — historique des runs de réconciliation (vue admin). */
  listReconciliationRuns(limit?: number): Promise<Array<{
    id: string;
    startedAt: string;
    finishedAt: string | null;
    routerTotalExpected: number | null;
    routerTotalSeen: number | null;
    status: 'RUNNING' | 'OK' | 'MISMATCH';
    diff: Record<string, unknown> | null;
  }>>;
  /** IMP-24 — alertes de réconciliation non acquittées (vue admin). */
  listOpenReconciliationAlerts(limit?: number): Promise<Array<{
    id: string;
    rule: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    createdAt: string;
    payload: Record<string, unknown>;
  }>>;

  /** IMP-19 — expire les tickets SOLD dont l'échéance d'activation est dépassée
   * (double garde-fou, contrat §3.6). Transition légale SOLD→EXPIRED (0011),
   * auditée par la garde 0009. Retourne les ids expirés. */
  expireOverdueTickets(now: Date): Promise<string[]>;

  /** IMP-21 — réclamation atomique (SKIP LOCKED) de la prochaine opération
   * traitable : PENDING, ou RETRY dont l'échéance `next_retry_at` est passée.
   * Passe l'opération en PROCESSING, verrouille (`locked_by`) et incrémente
   * `attempts`. Retourne null si la file est vide. */
  claimSyncOp(workerId: string, now: Date): Promise<SyncOpRecord | null>;
  /** IMP-21 — lecture d'une opération de la file. */
  getSyncOpById(id: string): Promise<SyncOpRecord | null>;
  /** IMP-21 — résolution d'une opération PROCESSING : succès => SUCCESS ;
   * échec => RETRY (avec `nextRetryAt`) ou BLOCKED (`nextRetryAt` null).
   * Politique (max tentatives / backoff) décidée par l'appelant (D12). */
  resolveSyncOp(
    id: string,
    outcome:
      | { kind: 'success'; result?: Record<string, unknown> }
      | { kind: 'failure'; error: { code: string; message: string }; nextRetryAt: Date | null },
    now: Date,
  ): Promise<SyncResolveOutcome>;
  /** IMP-21 — opérations PROCESSING bloquées (verrou perdu, Connector mort) =>
   * FAILED -> RETRY réessayable immédiatement (transition PROCESSING->PENDING
   * n'existe pas en 0009 ; `attempts` n'est PAS incrémenté). */
  requeueStuckSyncOps(stuckSince: Date, now: Date): Promise<string[]>;
  /** IMP-21 — purge le code clair (`password`) du payload après succès de la
   * synchro (INC-04 ; engagement IMP-18 : le clair ne survit pas au succès). */
  purgeSyncPayloadSecret(id: string): Promise<void>;

  /** IMP-22 — attendu plateforme pour la réconciliation read-only (contrat §4) :
   * vouchers digitaux synchronisés (file SUCCESS, code clair purgé mais
   * name/comment/profile conservés) + empreintes legacy (association par
   * username = code, note 0010). Jamais de code clair ici. */
  getConnectorExpectedInventory(): Promise<{
    digitalVouchers: Array<{ name: string; profile: string; comment: string }>;
    legacyCodeHashes: string[];
  }>;

  /** IMP-18 — génération d'un lot de tickets digitaux (contrat Mikmon §3) :
   * batch + tickets hashés + ordres `create_ticket` en file `mikrotik_sync`,
   * le tout en UNE transaction. Retourne les codes clairs UNE seule fois. */
  createBackendBatch(input: {
    offerId: string;
    quantity: number;
    /** IMP-26 UX6 : clé du coffre ; absente => aucun sceau, codes non révélables. */
    vaultKey?: Buffer;
  }): Promise<CreatedBackendBatch>;

  /** IMP-26 UX6 — ticket + sceau pour révélation auditée (null si inexistant). */
  getTicketForReveal(ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    orderId: string | null;
  } | null>;

  /** IMP-17/30 — agrégats persistés du dashboard, jour courant = depuis `since`. */
  getAdminDashboardStats(since: Date): Promise<AdminDashboardDbStats>;
  /** IMP-30 — heartbeat Connector explicite ; état ONLINE/OFFLINE sinon UNKNOWN. */
  recordConnectorHeartbeat(input: {
    connectorId: string;
    version?: string;
    routerModel?: string;
    routerosVersion?: string;
  }): Promise<void>;
  getConnectorHeartbeat(): Promise<ConnectorHeartbeat | null>;
  /** IMP-17 — inventaire par offre active (doc 09 §12.1). */
  getTicketsStatsByOffer(): Promise<Array<{ offerId: string; priceFcfa: number; states: Record<string, number> }>>;
  /** IMP-27 — listes opérationnelles protégées et paginées. */
  listAdminOrders(options: AdminListOptions): Promise<AdminPage<AdminOrderSummary>>;
  getAdminOrderById(id: string): Promise<AdminOrderDetail | null>;
  getAdminOrderTimeline(id: string): Promise<AdminOrderTimelineEvent[]>;
  createAdminCorrectionRequest(input: {
    orderId: string;
    requestedAction: AdminCorrectionRequest['requestedAction'];
    reason: string;
    requestedBy: string;
    idempotencyKey: string;
  }): Promise<{ request: AdminCorrectionRequest; created: boolean } | null>;
  listAdminPayments(options: AdminListOptions): Promise<AdminPage<AdminPaymentSummary>>;
  listAdminTickets(options: AdminListOptions): Promise<AdminPage<AdminTicketSummary>>;
  listAdminBatches(options: AdminListOptions): Promise<AdminPage<AdminBatchSummary>>;
  /** IMP-32 — inventaire par offre × destination (états + réservations au-delà du TTL). */
  getTicketInventoryBreakdown(): Promise<Array<{
    offerId: string;
    destination: string;
    states: Record<string, number>;
    reservedStale: number;
  }>>;
  /** IMP-32 — prévisualisation d'import (lecture seule, doc 09 §33). */
  previewTicketImport(input: TicketImportInput): Promise<TicketImportPreview>;
  /** IMP-32 — import transactionnel tout-ou-rien, idempotent (doc 09 §33-34). */
  executeTicketImport(input: TicketImportInput, opts: {
    vaultKey: Buffer;
    idempotencyKey: string;
  }): Promise<TicketImportResult>;
  /** IMP-32 — ticket + destination du lot, pour la révélation admin contrôlée. */
  getAdminTicketForReveal(ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    batchDestination: string;
  } | null>;
  /** IMP-32 — réconciliation du stock mikmon-manual avec le manifeste IMP-06. */
  getTicketReconciliation(): Promise<TicketReconciliation>;
  listAdminAuditLogs(options: AdminListOptions): Promise<AdminPage<AdminAuditSummary>>;
  listAdminIncidents(options: AdminListOptions): Promise<AdminPage<AdminIncidentSummary>>;
  /** IMP-17 — reconnaissance d'alerte, atomique et idempotente (doc 09 §4.E). */
  acknowledgeAlert(id: string): Promise<AlertAckRecord | null>;

  close(): Promise<void>;
}

interface PlanRow {
  id: string;
  offer_id: string;
  price_fcfa: number;
  access_hours: number;
  validity_hours: number;
  mikrotik_profile: string;
  limit_uptime: string;
  version: number;
}

interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_fcfa: number;
  state: string;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export type SyncOperation = 'read_status' | 'create_ticket' | 'disable_ticket' | 'refresh_inventory';
export type SyncState = 'PENDING' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'RETRY' | 'BLOCKED' | 'MANUAL_REVIEW';

/** IMP-21 — opération de la file `mikrotik_sync` (doc 06 §33-34). */
export interface SyncOpRecord {
  id: string;
  operation: SyncOperation;
  payload: Record<string, unknown>;
  state: SyncState;
  attempts: number;
  nextRetryAt: Date | null;
  lockedBy: string | null;
  result: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Résultat de `resolveSyncOp` : état final après résolution (ou `illegal`). */
export interface SyncResolveOutcome {
  state: 'SUCCESS' | 'RETRY' | 'BLOCKED' | 'illegal';
  attempts: number;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: string;
  providerRef: string | null;
  amountFcfa: number;
  state: string;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TicketRow {
  id: string;
  batch_id: string;
  plan_id: string;
  db_state: string;
  router_state: string;
  order_id: string | null;
  code_prefix_hint: string | null;
  sold_at: Date | null;
  mikrotik_comment: string | null;
  activation_deadline: Date | null;
}

export interface TicketRecord {
  id: string;
  batchId: string;
  planId: string;
  dbState: string;
  routerState: string;
  orderId: string | null;
  codePrefixHint: string | null;
  soldAt: Date | null;
  mikrotikComment: string | null;
  /** IMP-19 (contrat §3.6) : échéance du premier login ; null = stock vierge. */
  activationDeadline: Date | null;
  /** IMP-32 — empreinte sha256 du code (parité seed 0010 / import) ; null = fixture. */
  codeHash?: string | null;
  /** IMP-26/32 — sceau AES-256-GCM ; null = code non révélable en ligne. */
  codeCipher?: string | null;
  /** IMP-32 — date de réservation (doc 09 §26) ; null = jamais réservé. */
  reservedAt?: Date | null;
  /** IMP-32 — date de création du ticket en inventaire. */
  createdAt?: Date | null;
}

export type AllocateResult =
  | { status: 'allocated'; ticketId: string; codePrefixHint: string | null }
  | { status: 'no-stock' }
  | { status: 'illegal' };

interface OrderRow {
  id: string;
  customer_id: string;
  plan_id: string;
  state: string;
  currency: string;
  plan_snapshot: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function mapPlan(row: PlanRow): ActivePlan {
  return {
    planId: row.id,
    offerId: row.offer_id,
    priceFcfa: row.price_fcfa,
    accessHours: row.access_hours,
    validityHours: row.validity_hours,
    mikrotikProfile: row.mikrotik_profile,
    limitUptime: row.limit_uptime,
    version: row.version,
  };
}

function mapSyncOp(row: Record<string, unknown>): SyncOpRecord {
  return {
    id: String(row.id),
    operation: row.operation as SyncOperation,
    payload: (row.payload ?? {}) as Record<string, unknown>,
    state: row.state as SyncState,
    attempts: Number(row.attempts),
    nextRetryAt: row.next_retry_at == null ? null : new Date(row.next_retry_at as string),
    lockedBy: row.locked_by == null ? null : String(row.locked_by),
    result: row.result == null ? null : (row.result as Record<string, unknown>),
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    amountFcfa: row.amount_fcfa,
    state: row.state,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTicket(row: TicketRow): TicketRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    planId: row.plan_id,
    dbState: row.db_state,
    routerState: row.router_state,
    orderId: row.order_id,
    codePrefixHint: row.code_prefix_hint,
    soldAt: row.sold_at,
    mikrotikComment: row.mikrotik_comment,
    activationDeadline: row.activation_deadline,
  };
}

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    planId: row.plan_id,
    state: row.state,
    currency: row.currency,
    planSnapshot: row.plan_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class TxAbort extends Error {
  constructor(readonly result: 'illegal') {
    super('transaction annulée (garde métier)');
  }
}

const SELECT_ACTIVE_PLAN = `
  SELECT id, offer_id, price_fcfa, access_hours, validity_hours,
         mikrotik_profile, limit_uptime, version
  FROM public.plans
  WHERE offer_id = $1 AND active_to IS NULL
  ORDER BY version DESC
  LIMIT 1`;

const SELECT_ACTIVE_PLANS = `
  SELECT DISTINCT ON (offer_id)
         id, offer_id, price_fcfa, access_hours, validity_hours,
         mikrotik_profile, limit_uptime, version
  FROM public.plans
  WHERE active_to IS NULL
  ORDER BY offer_id, version DESC`;

export class PgRepo implements BackendRepo {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async listActivePlans(): Promise<ActivePlan[]> {
    const res = await this.pool.query<PlanRow>(SELECT_ACTIVE_PLANS);
    return res.rows.map(mapPlan);
  }

  async getActivePlanByOffer(offerId: string): Promise<ActivePlan | null> {
    const res = await this.pool.query<PlanRow>(SELECT_ACTIVE_PLAN, [offerId]);
    const row = res.rows[0];
    return row ? mapPlan(row) : null;
  }

  async findOrCreateCustomer(phone: string): Promise<string> {
    // ON CONFLICT ... DO UPDATE garantit le RETURNING même en course concurrente.
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO public.customers (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id`,
      [phone],
    );
    const row = res.rows[0];
    if (!row) throw new Error('findOrCreateCustomer: aucun id retourné');
    return row.id;
  }

  async createOrder(
    input: CreateOrderInputDb,
  ): Promise<{ order: OrderRecord; created: boolean }> {
    const inserted = await this.pool.query<OrderRow>(
      `INSERT INTO public.orders (customer_id, plan_id, plan_snapshot, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, customer_id, plan_id, state, currency, plan_snapshot, created_at, updated_at`,
      [input.customerId, input.planId, JSON.stringify(input.planSnapshot), input.idempotencyKey],
    );
    const fresh = inserted.rows[0];
    if (fresh) return { order: mapOrder(fresh), created: true };
    // Replay : la clé existe déjà => on retourne la commande initiale (idempotence §21).
    const existing = await this.pool.query<OrderRow>(
      `SELECT id, customer_id, plan_id, state, currency, plan_snapshot, created_at, updated_at
       FROM public.orders WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error('createOrder: replay introuvable (incohérence)');
    return { order: mapOrder(row), created: false };
  }

  async getOrderById(id: string): Promise<OrderRecord | null> {
    const res = await this.pool.query<OrderRow>(
      `SELECT id, customer_id, plan_id, state, currency, plan_snapshot, created_at, updated_at
       FROM public.orders WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? mapOrder(row) : null;
  }

  /**
   * Sentinel d'annulation : levé dans withTx pour FORCER le ROLLBACK et retourner
   * un résultat métier (ex. commande introuvable après payment déjà transitionné :
   * on annule TOUT, jamais d'état incohérent — doc 06 §24 atomicité).
   */
  private async withTx<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, params) => {
        const res = await client.query(sql, params);
        return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount };
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async allocateTicketForOrder(orderId: string): Promise<AllocateResult> {
    return this.withTx(async (q) => {
      const o = await q(
        `SELECT state, plan_id FROM public.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      const order = o.rows[0];
      if (!order) return { status: 'illegal' } as const;
      if (String(order['state']) === 'TICKET_ALLOCATED' || String(order['state']) === 'DELIVERED') {
        // Déjà allouée : on ne ré-alloue JAMAIS (invariants 2 et 7).
        const existing = await q(
          `SELECT id, code_prefix_hint FROM public.tickets WHERE order_id = $1 AND db_state IN ('SOLD','USED') LIMIT 1`,
          [orderId],
        );
        const t = existing.rows[0];
        return t
          ? ({ status: 'allocated', ticketId: String(t['id']), codePrefixHint: (t['code_prefix_hint'] as string | null) ?? null } as const)
          : ({ status: 'illegal' } as const);
      }
      if (String(order['state']) !== 'PAID') return { status: 'illegal' } as const;
      // Un seul ticket AVAILABLE du plan, verrouillé ; SKIP LOCKED = les allocations
      // concurrentes passent au ticket suivant sans se bloquer (blueprint §3.3).
      // IMP-32 (doc 09 §28) : jamais un ticket d'un lot PHYSICAL pour une vente
      // numérique — la destination est vérifiée sur le lot, pas seulement l'état.
      // FOR UPDATE OF t : verrouiller UNIQUEMENT la ligne ticket. Verrouiller aussi
      // la ligne lot (via le JOIN) ferait SKIP LOCKED les allocations concurrentes
      // sur le même lot (régression CONCURRENCE IMP-15, leçon 26/09).
      const t = await q(
        `SELECT t.id FROM public.tickets t
         JOIN public.ticket_batches b ON b.id = t.batch_id
         WHERE t.plan_id = $1 AND t.db_state = 'AVAILABLE' AND b.destination = 'DIGITAL'
         ORDER BY t.created_at
         LIMIT 1
         FOR UPDATE OF t SKIP LOCKED`,
        [String(order['plan_id'])],
      );
      const candidate = t.rows[0];
      if (!candidate) return { status: 'no-stock' } as const;
      const reserved = await q(
        `UPDATE public.tickets
         SET db_state = 'RESERVED', order_id = $2, reserved_at = now()
         WHERE id = $1 AND db_state = 'AVAILABLE'
         RETURNING id, code_prefix_hint`,
        [String(candidate['id']), orderId],
      );
      const res = reserved.rows[0];
      if (!res) return { status: 'no-stock' } as const; // re-vérification post-verrou (doc 06 §30)
      // IMP-19 (contrat §3.6) : échéance d'activation figée à la vente =
      // sold_at + validité de l'offre (snapshot §09 de la commande).
      await q(
        `UPDATE public.tickets t
         SET db_state = 'SOLD',
             sold_at = now(),
             activation_deadline = now() + make_interval(
               hours => coalesce((o.plan_snapshot->>'validity_duration_snapshot')::int, 0))
         FROM public.orders o
         WHERE o.id = $2 AND t.id = $1 AND t.db_state = 'RESERVED'`,
        [String(candidate['id']), orderId],
      );
      const upd = await q(
        `UPDATE public.orders SET state = 'TICKET_ALLOCATED' WHERE id = $1 AND state = 'PAID' RETURNING id`,
        [orderId],
      );
      if (!upd.rows[0]) throw new TxAbort('illegal'); // ROLLBACK complet : ticket jamais orphelin
      return {
        status: 'allocated',
        ticketId: String(candidate['id']),
        codePrefixHint: (res['code_prefix_hint'] as string | null) ?? null,
      } as const;
    }).catch((err: unknown) => {
      if (err instanceof TxAbort) return { status: 'illegal' } as const;
      throw err;
    });
  }

  async deliverOrder(orderId: string): Promise<'delivered' | 'already-delivered' | 'illegal'> {
    const res = await this.pool.query(
      `UPDATE public.orders SET state = 'DELIVERED' WHERE id = $1 AND state = 'TICKET_ALLOCATED' RETURNING id`,
      [orderId],
    );
    if (res.rowCount === 1) return 'delivered';
    const cur = await this.pool.query(`SELECT state FROM public.orders WHERE id = $1`, [orderId]);
    const row = cur.rows[0];
    if (!row) return 'illegal';
    return String(row['state']) === 'DELIVERED' ? 'already-delivered' : 'illegal';
  }

  async getSoldTicketsForCustomer(
    customerId: string,
  ): Promise<Array<TicketRecord & { offerId: string | null }>> {
    const res = await this.pool.query<TicketRow & { offer_id: string | null }>(
      `SELECT t.id, t.batch_id, t.plan_id, t.db_state, t.router_state, t.order_id,
              t.code_prefix_hint, t.sold_at, t.mikrotik_comment, t.activation_deadline,
              o.plan_snapshot->>'offer_id' AS offer_id
       FROM public.tickets t
       JOIN public.orders o ON o.id = t.order_id
       WHERE o.customer_id = $1 AND t.db_state IN ('SOLD','USED')
       ORDER BY t.sold_at DESC`,
      [customerId],
    );
    return res.rows.map((row) => ({ ...mapTicket(row), offerId: row.offer_id ?? null }));
  }

  async getCustomerById(customerId: string): Promise<{ id: string; phone: string } | null> {
    const res = await this.pool.query<{ id: string; phone: string }>(
      `SELECT id, phone FROM public.customers WHERE id = $1`,
      [customerId],
    );
    return res.rows[0] ?? null;
  }

  async createPayment(orderId: string, amountFcfa: number): Promise<PaymentRecord> {
    const res = await this.pool.query<PaymentRow>(
      `INSERT INTO public.payments (order_id, amount_fcfa)
       VALUES ($1, $2)
       RETURNING id, order_id, provider, provider_ref, amount_fcfa, state,
                 confirmed_at, created_at, updated_at`,
      [orderId, amountFcfa],
    );
    const row = res.rows[0];
    if (!row) throw new Error('createPayment: aucune ligne retournée');
    return mapPayment(row);
  }

  async markPaymentAwaitingResult(
    paymentId: string,
    providerRef: string,
  ): Promise<'initiated' | 'illegal'> {
    return this.withTx(async (q) => {
      const p = await q(
        `UPDATE public.payments SET state = 'INITIATED', provider_ref = $2
         WHERE id = $1 AND state = 'CREATED' RETURNING order_id`,
        [paymentId, providerRef],
      );
      const orderRow = p.rows[0];
      if (!orderRow) return 'illegal';
      await q(`UPDATE public.payments SET state = 'PENDING' WHERE id = $1 AND state = 'INITIATED'`, [
        paymentId,
      ]);
      // Ordre déjà PAYMENT_PENDING = replay : la garde WHERE rend l'étape no-op.
      await q(
        `UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = $1 AND state = 'CREATED'`,
        [String(orderRow['order_id'])],
      );
      return 'initiated';
    });
  }

  async getPaymentById(id: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async getLatestPaymentForOrder(orderId: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments
       WHERE order_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async getOpenPaymentForOrder(orderId: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments
       WHERE order_id = $1 AND state IN ('CREATED', 'INITIATED', 'PENDING')
       ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async getPaymentByProviderRef(providerRef: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments WHERE provider_ref = $1`,
      [providerRef],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async insertPaymentEvent(entry: {
    paymentId: string | null;
    providerEventId: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<boolean> {
    // La table (migration 0003) n'a pas de colonne provider : le préfixe
    // « fedapay: » de provider_event_id porte cette information (doc 06 §21).
    const res = await this.pool.query(
      `INSERT INTO public.payment_events (payment_id, provider_event_id, payload, signature_ok)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (provider_event_id) DO NOTHING
       RETURNING id`,
      [entry.paymentId, entry.providerEventId, JSON.stringify(entry.payload), entry.signatureOk],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async confirmPayment(paymentId: string): Promise<'confirmed' | 'illegal'> {
    return this.withTx(async (q) => {
      const p = await q(
        `UPDATE public.payments SET state = 'CONFIRMED', confirmed_at = now()
         WHERE id = $1 AND state = 'PENDING' RETURNING order_id`,
        [paymentId],
      );
      const orderRow = p.rows[0];
      if (!orderRow) return 'illegal';
      const o = await q(
        `UPDATE public.orders SET state = 'PAID'
         WHERE id = $1 AND state = 'PAYMENT_PENDING' RETURNING id`,
        [String(orderRow['order_id'])],
      );
      if (!o.rows[0]) throw new TxAbort('illegal'); // ROLLBACK : jamais payment CONFIRMED sans order PAID
      return 'confirmed';
    }).catch((err: unknown) => {
      if (err instanceof TxAbort) return 'illegal' as const;
      throw err;
    });
  }

  async failPayment(
    paymentId: string,
    to: { payment: 'FAILED' | 'CANCELLED'; order: 'FAILED' | 'CANCELLED' },
  ): Promise<'failed' | 'illegal'> {
    return this.withTx(async (q) => {
      const p = await q(
        `UPDATE public.payments SET state = $2
         WHERE id = $1 AND state = 'PENDING' RETURNING order_id`,
        [paymentId, to.payment],
      );
      const orderRow = p.rows[0];
      if (!orderRow) return 'illegal';
      const o = await q(
        `UPDATE public.orders SET state = $2
         WHERE id = $1 AND state = 'PAYMENT_PENDING' RETURNING id`,
        [String(orderRow['order_id']), to.order],
      );
      if (!o.rows[0]) throw new TxAbort('illegal'); // ROLLBACK complet
      return 'failed';
    }).catch((err: unknown) => {
      if (err instanceof TxAbort) return 'illegal' as const;
      throw err;
    });
  }

  async logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
    after?: Record<string, unknown>;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.audit_logs (actor, action, entity, entity_id, after)
       VALUES ($1, $2, $3, $4, $5)`,
      [entry.actor, entry.action, entry.entity, entry.entityId ?? null, entry.after ? JSON.stringify(entry.after) : null],
    );
  }

  async linkCustomerAuth(customerId: string, authUserId: string): Promise<void> {
    // Idempotent : ne fait rien si déjà lié au même compte ; jamais d'écrasement.
    await this.pool.query(
      `UPDATE public.customers
       SET auth_user_id = $2
       WHERE id = $1 AND (auth_user_id IS NULL OR auth_user_id = $2)`,
      [customerId, authUserId],
    );
  }

  // IMP-21 — file mikrotik_sync : claim / résolution / requeue (contrat Connector).
  async claimSyncOp(workerId: string, now: Date): Promise<SyncOpRecord | null> {
    const res = await this.pool.query(
      `UPDATE public.mikrotik_sync
       SET state = 'PROCESSING', locked_by = $1, attempts = attempts + 1
       WHERE id = (
         SELECT id FROM public.mikrotik_sync
         WHERE state = 'PENDING' OR (state = 'RETRY' AND next_retry_at <= $2)
         ORDER BY created_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING *`,
      [workerId, now],
    );
    const row = res.rows[0];
    return row ? mapSyncOp(row) : null;
  }

  async getSyncOpById(id: string): Promise<SyncOpRecord | null> {
    const res = await this.pool.query(`SELECT * FROM public.mikrotik_sync WHERE id = $1`, [id]);
    const row = res.rows[0];
    return row ? mapSyncOp(row) : null;
  }

  async resolveSyncOp(
    id: string,
    outcome:
      | { kind: 'success'; result?: Record<string, unknown> }
      | { kind: 'failure'; error: { code: string; message: string }; nextRetryAt: Date | null },
    _now: Date,
  ): Promise<SyncResolveOutcome> {
    if (outcome.kind === 'success') {
      const res = await this.pool.query(
        `UPDATE public.mikrotik_sync
         SET state = 'SUCCESS', result = $2::jsonb, locked_by = NULL
         WHERE id = $1 AND state = 'PROCESSING'
         RETURNING state, attempts`,
        [id, JSON.stringify(outcome.result ?? {})],
      );
      const row = res.rows[0];
      return row ? { state: 'SUCCESS', attempts: Number(row['attempts']) } : { state: 'illegal', attempts: 0 };
    }
    return this.withTx(async (q) => {
      const failed = await q(
        `UPDATE public.mikrotik_sync
         SET state = 'FAILED', result = jsonb_build_object('error', $2::jsonb), locked_by = NULL
         WHERE id = $1 AND state = 'PROCESSING'
         RETURNING attempts`,
        [id, JSON.stringify(outcome.error)],
      );
      const frow = failed.rows[0];
      if (!frow) return { state: 'illegal' as const, attempts: 0 };
      const moved = await q(
        `UPDATE public.mikrotik_sync
         SET state = CASE WHEN $2::timestamptz IS NULL THEN 'BLOCKED' ELSE 'RETRY' END,
             next_retry_at = $2
         WHERE id = $1 AND state = 'FAILED'
         RETURNING state, attempts`,
        [id, outcome.nextRetryAt],
      );
      const mrow = moved.rows[0];
      if (!mrow) return { state: 'illegal' as const, attempts: Number(frow['attempts']) };
      return { state: mrow['state'] as 'RETRY' | 'BLOCKED', attempts: Number(mrow['attempts']) };
    });
  }

  async getConnectorExpectedInventory(): Promise<{
    digitalVouchers: Array<{ name: string; profile: string; comment: string }>;
    legacyCodeHashes: string[];
  }> {
    const digital = await this.pool.query(
      `SELECT DISTINCT payload->>'name' AS name, payload->>'profile' AS profile, payload->>'comment' AS comment
       FROM public.mikrotik_sync
       WHERE operation = 'create_ticket' AND state = 'SUCCESS'
         AND payload ? 'name'`,
    );
    const legacy = await this.pool.query(
      `SELECT t.code_hash FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE b.source = 'mikmon-manual'`,
    );
    return {
      digitalVouchers: digital.rows.map((r) => ({
        name: String(r['name']),
        profile: String(r['profile']),
        comment: String(r['comment']),
      })),
      legacyCodeHashes: legacy.rows.map((r) => String(r['code_hash'])),
    };
  }

  async purgeSyncPayloadSecret(id: string): Promise<void> {
    await this.pool.query(
      `UPDATE public.mikrotik_sync SET payload = payload - 'password' WHERE id = $1`,
      [id],
    );
  }

  async requeueStuckSyncOps(stuckSince: Date, now: Date): Promise<string[]> {
    const stuck = await this.pool.query(
      `SELECT id FROM public.mikrotik_sync
       WHERE state = 'PROCESSING' AND updated_at <= $1
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED`,
      [stuckSince],
    );
    const ids: string[] = [];
    for (const row of stuck.rows) {
      const opId = String(row['id']);
      await this.withTx(async (q) => {
        await q(
          `UPDATE public.mikrotik_sync
           SET state = 'FAILED',
               result = jsonb_build_object('error', jsonb_build_object('code', 'stuck_lock', 'message', 'verrou perdu, requeue automatique'))
           WHERE id = $1 AND state = 'PROCESSING'`,
          [opId],
        );
        await q(
          `UPDATE public.mikrotik_sync SET state = 'RETRY', next_retry_at = $2
           WHERE id = $1 AND state = 'FAILED'`,
          [opId, now],
        );
      });
      ids.push(opId);
    }
    return ids;
  }

  async createBackendBatch(input: {
    offerId: string;
    quantity: number;
    vaultKey?: Buffer;
  }): Promise<CreatedBackendBatch> {
    const plan = await this.getActivePlanByOffer(input.offerId);
    if (!plan) throw new Error(`offre sans plan actif : ${input.offerId}`);
    return this.withTx(async (q) => {
      // Séquence digitale atomique (settings) : 100, 101, ... (contrat §3.3).
      await q(
        `INSERT INTO public.settings (key, value)
         VALUES ('backend_batch_seq', jsonb_build_object('next', $1::int))
         ON CONFLICT (key) DO NOTHING`,
        [FIRST_BACKEND_BATCH_SEQ + 1],
      );
      const seqRes = await q(
        `UPDATE public.settings
         SET value = jsonb_build_object('next', (value->>'next')::int + 1)
         WHERE key = 'backend_batch_seq'
         RETURNING (value->>'next')::int - 1 AS seq`,
      );
      const seq = Number(seqRes.rows[0]?.['seq']);
      const specs = generateTicketSpecs({ seq, quantity: input.quantity });

      const batchRes = await q(
        `INSERT INTO public.ticket_batches (source, quantity, notes)
         VALUES ('backend', $1, $2) RETURNING id, generated_at`,
        [input.quantity, `backend-gen seq ${seq} (${input.offerId}, IMP-18)`],
      );
      const batchId = String(batchRes.rows[0]?.['id']);
      const generatedAt = batchRes.rows[0]?.['generated_at'] as Date;

      // Tickets : JAMAIS de code en clair en base (0004, INC-01/INC-04) —
      // uniquement sha256(code) + préfixe indicatif 2 caractères.
      const ticketValues: string[] = [];
      const ticketParams: unknown[] = [];
      specs.forEach((spec, i) => {
        const codeHash = createHash('sha256').update(spec.clientCode).digest('hex');
        // IMP-26 UX6 : sceau chiffré si clé fournie ; sinon NULL (stock non révélable).
        const sealed = input.vaultKey ? sealCode(input.vaultKey, spec.clientCode) : null;
        const t = i * 6;
        ticketValues.push(`($${t + 1}, $${t + 2}, $${t + 3}, $${t + 4}, $${t + 5}, $${t + 6})`);
        ticketParams.push(batchId, codeHash, spec.clientCode.slice(0, 2), plan.planId, spec.mikrotikComment, sealed);
      });
      const ticketRes = await q(
        `INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id, mikrotik_comment, code_cipher)
         VALUES ${ticketValues.join(', ')}
         RETURNING id, code_hash`,
        ticketParams,
      );
      const idByHash = new Map(ticketRes.rows.map((r) => [String(r['code_hash']), String(r['id'])]));

      // File mikrotik_sync : le code clair ne vit QUE dans le payload, le temps
      // de la synchronisation routeur (purge au succès — IMP-21/24).
      const syncValues: string[] = [];
      const syncParams: unknown[] = [];
      specs.forEach((spec, i) => {
        const codeHash = createHash('sha256').update(spec.clientCode).digest('hex');
        syncValues.push(`('create_ticket', $${i + 1}::jsonb)`);
        syncParams.push(JSON.stringify({
          ticket_id: idByHash.get(codeHash),
          batch_seq: seq,
          name: spec.routerName,
          password: spec.clientCode,
          profile: plan.mikrotikProfile,
          limit_uptime: plan.limitUptime,
          comment: spec.mikrotikComment,
        }));
      });
      await q(
        `INSERT INTO public.mikrotik_sync (operation, payload) VALUES ${syncValues.join(', ')}`,
        syncParams,
      );

      return { batchId, seq, offerId: input.offerId, quantity: input.quantity, generatedAt, specs };
    });
  }

  async getTicketForReveal(ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    orderId: string | null;
  } | null> {
    const res = await this.pool.query(
      `SELECT id, db_state, code_cipher, order_id
       FROM public.tickets WHERE id = $1`,
      [ticketId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row['id']),
      dbState: String(row['db_state']),
      codeCipher: row['code_cipher'] === null || row['code_cipher'] === undefined ? null : String(row['code_cipher']),
      orderId: row['order_id'] === null || row['order_id'] === undefined ? null : String(row['order_id']),
    };
  }

  /** IMP-32 — ticket + destination du lot pour la révélation admin contrôlée (doc 09 §20). */
  async getAdminTicketForReveal(ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    batchDestination: string;
  } | null> {
    const res = await this.pool.query(
      `SELECT t.id, t.db_state, t.code_cipher, b.destination AS batch_destination
       FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE t.id = $1`,
      [ticketId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      id: String(row['id']),
      dbState: String(row['db_state']),
      codeCipher: row['code_cipher'] == null ? null : String(row['code_cipher']),
      batchDestination: String(row['batch_destination']),
    };
  }

  /**
   * IMP-32 — prévisualisation d'import (doc 09 §33) : lecture seule.
   * Vérifications : plan actif, format du code, doublons dans le lot, doublons
   * contre l'inventaire (empreintes). Aucun code n'est renvoyé : indice 2 caractères.
   */
  async previewTicketImport(input: TicketImportInput): Promise<TicketImportPreview> {
    const plan = await this.getActivePlanByOffer(input.offerId);
    const seen = new Set<string>();
    let rows: TicketImportRowResult[] = input.codes.map((code, i) => {
      const hint = `${code.slice(0, 2)}••••`;
      if (!TICKET_CODE_FORMAT.test(code)) {
        return { line: i + 1, codeHint: hint, valid: false, reason: 'format attendu : 8 caractères [0-9a-z]' };
      }
      if (seen.has(code)) {
        return { line: i + 1, codeHint: hint, valid: false, reason: 'doublon dans le lot importé' };
      }
      seen.add(code);
      return { line: i + 1, codeHint: hint, valid: true, reason: null };
    });
    const uniqueCodes = [...seen];
    if (uniqueCodes.length > 0) {
      const hashes = uniqueCodes.map((c) => createHash('sha256').update(c).digest('hex'));
      const existing = await this.pool.query(
        `SELECT code_hash FROM public.tickets WHERE code_hash = ANY($1)`,
        [hashes],
      );
      const existingSet = new Set(existing.rows.map((r) => String(r['code_hash'])));
      if (existingSet.size > 0) {
        rows = rows.map((row) => {
          if (!row.valid) return row;
          const code = input.codes[row.line - 1];
          if (!code) return row;
          const hash = createHash('sha256').update(code).digest('hex');
          return existingSet.has(hash)
            ? { ...row, valid: false, reason: 'déjà présent dans l’inventaire' }
            : row;
        });
      }
    }
    if (!plan) {
      rows = rows.map((row) => row.valid
        ? { ...row, valid: false, reason: 'offre sans plan actif' }
        : row);
    }
    const invalid = rows.filter((r) => !r.valid).length;
    return {
      offerId: input.offerId,
      destination: input.destination,
      analyzed: rows.length,
      valid: rows.length - invalid,
      invalid,
      rows,
      canImport: invalid === 0 && rows.length > 0 && Boolean(plan),
    };
  }

  /**
   * IMP-32 — import transactionnel (doc 09 §33-34) : preview → validation →
   * transaction → résultat. Jamais d'import partiel silencieux : la moindre
   * ligne invalide => rien n'est écrit et le résultat est explicite.
   * Idempotent sur `idempotency_key` (rejeu = même lot, aucune écriture).
   * Les codes clairs ne vivent que dans la requête : sha256 + sceau AES-256-GCM en base.
   */
  async executeTicketImport(input: TicketImportInput, opts: {
    vaultKey: Buffer;
    idempotencyKey: string;
  }): Promise<TicketImportResult> {
    const existing = await this.pool.query(
      `SELECT id, quantity FROM public.ticket_batches WHERE idempotency_key = $1`,
      [opts.idempotencyKey],
    );
    if (existing.rows[0]) {
      return {
        created: false,
        batchId: String(existing.rows[0]['id']),
        offerId: input.offerId,
        destination: input.destination,
        imported: Number(existing.rows[0]['quantity']),
        rejected: 0,
        importPerformed: true,
        message: 'Rejeu idempotent : ce lot a déjà été importé, rien n’a été réécrit.',
      };
    }
    // Revalidation côté serveur : le preview n'est jamais une autorisation.
    const preview = await this.previewTicketImport(input);
    if (preview.invalid > 0 || !preview.canImport) {
      return {
        created: false,
        batchId: '',
        offerId: input.offerId,
        destination: input.destination,
        imported: 0,
        rejected: preview.invalid,
        importPerformed: false,
        message: `Import non effectué : ${preview.analyzed} lignes analysées, ${preview.valid} valides, ${preview.invalid} invalides (aucun import partiel silencieux, doc 09 §34).`,
      };
    }
    const plan = await this.getActivePlanByOffer(input.offerId);
    if (!plan) throw new Error(`offre sans plan actif : ${input.offerId}`);
    return this.withTx(async (q) => {
      const batchRes = await q(
        `INSERT INTO public.ticket_batches (source, quantity, destination, manifest_sha256, notes, idempotency_key)
         VALUES ('mikmon-manual', $1, $2, $3, $4, $5)
         RETURNING id`,
        [input.codes.length, input.destination, input.manifestSha256 ?? null, input.notes ?? null, opts.idempotencyKey],
      );
      const batchId = String(batchRes.rows[0]?.['id']);
      const ticketValues: string[] = [];
      const ticketParams: unknown[] = [];
      input.codes.forEach((code, i) => {
        const t = i * 5;
        ticketValues.push(`($${t + 1}, $${t + 2}, $${t + 3}, $${t + 4}, $${t + 5})`);
        ticketParams.push(
          batchId,
          createHash('sha256').update(code).digest('hex'),
          code.slice(0, 2),
          plan.planId,
          sealCode(opts.vaultKey, code),
        );
      });
      await q(
        `INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id, code_cipher)
         VALUES ${ticketValues.join(', ')}`,
        ticketParams,
      );
      return {
        created: true,
        batchId,
        offerId: input.offerId,
        destination: input.destination,
        imported: input.codes.length,
        rejected: 0,
        importPerformed: true,
        message: `Import transactionnel effectué : ${input.codes.length} tickets (${input.destination}, ${input.offerId}).`,
      } satisfies TicketImportResult;
    });
  }

  /** IMP-32 — inventaire par offre × destination (stock par plan, doc 09 §12.1/25). */
  async getTicketInventoryBreakdown(): Promise<Array<{
    offerId: string;
    destination: string;
    states: Record<string, number>;
    reservedStale: number;
  }>> {
    const staleMinutes = Math.round(DEFAULT_RESERVED_TTL_MS / 60000); // TTL D11 (workers)
    const res = await this.pool.query(
      `SELECT p.offer_id, b.destination, t.db_state,
              count(*)::int AS n,
              count(*) FILTER (WHERE t.db_state = 'RESERVED'
                                AND t.reserved_at <= now() - make_interval(mins => $1))::int AS stale
       FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       JOIN public.plans p ON p.id = t.plan_id
       GROUP BY p.offer_id, b.destination, t.db_state`,
      [staleMinutes],
    );
    const entries = new Map<string, {
      offerId: string;
      destination: string;
      states: Record<string, number>;
      reservedStale: number;
    }>();
    for (const row of res.rows) {
      const key = `${row['offer_id']}:${row['destination']}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = { offerId: String(row['offer_id']), destination: String(row['destination']), states: {}, reservedStale: 0 };
        entries.set(key, entry);
      }
      entry.states[String(row['db_state'])] = Number(row['n']);
      if (row['db_state'] === 'RESERVED') entry.reservedStale = Number(row['stale']);
    }
    return [...entries.values()];
  }

  /** IMP-32 — réconciliation du stock `mikmon-manual` avec le manifeste IMP-06 (lecture seule). */
  async getTicketReconciliation(): Promise<TicketReconciliation> {
    const [byOffer, totalRes] = await Promise.all([
      this.pool.query(
        `SELECT p.offer_id, count(*)::int AS n
         FROM public.tickets t
         JOIN public.ticket_batches b ON b.id = t.batch_id
         JOIN public.plans p ON p.id = t.plan_id
         WHERE b.source = 'mikmon-manual'
         GROUP BY p.offer_id`,
      ),
      this.pool.query(
        `SELECT count(*)::int AS n FROM public.tickets t
         JOIN public.ticket_batches b ON b.id = t.batch_id
         WHERE b.source = 'mikmon-manual'`,
      ),
    ]);
    const actual = new Map(byOffer.rows.map((r) => [String(r['offer_id']), Number(r['n'])]));
    const rows: TicketReconciliationRow[] = STOCK_MANIFEST_IMP06.batches.map((batch) => {
      const n = actual.get(batch.offerId) ?? 0;
      return {
        batchNote: batch.note,
        offerId: batch.offerId,
        expected: batch.quantity,
        actual: n,
        status: n === 0 ? 'MISSING' : n === batch.quantity ? 'OK' : 'DIVERGENT',
      };
    });
    const actualTotal = Number(totalRes.rows[0]?.['n'] ?? 0);
    return {
      manifestId: STOCK_MANIFEST_IMP06.id,
      generatedAt: STOCK_MANIFEST_IMP06.generatedAt,
      expectedTotal: STOCK_MANIFEST_IMP06.totalQuantity,
      actualTotal,
      ok: rows.every((r) => r.status === 'OK'),
      rows,
    };
  }

  async expireStaleOrders(olderThan: Date): Promise<{ orderIds: string[]; paymentsExpired: number }> {
    const expired = await this.pool.query(
      `UPDATE public.orders SET state = 'EXPIRED'
       WHERE state = 'PAYMENT_PENDING' AND created_at <= $1
       RETURNING id`,
      [olderThan],
    );
    const orderIds = expired.rows.map((r) => String(r['id']));
    if (orderIds.length === 0) return { orderIds, paymentsExpired: 0 };
    const pays = await this.pool.query(
      `UPDATE public.payments SET state = 'EXPIRED'
       WHERE state = 'PENDING' AND order_id = ANY($1::uuid[])`,
      [orderIds],
    );
    return { orderIds, paymentsExpired: pays.rowCount ?? 0 };
  }

  async releaseStaleReservedTickets(olderThan: Date): Promise<string[]> {
    const rel = await this.pool.query(
      `UPDATE public.tickets SET db_state = 'RELEASED'
       WHERE db_state = 'RESERVED' AND reserved_at <= $1
       RETURNING id`,
      [olderThan],
    );
    const ids = rel.rows.map((r) => String(r['id']));
    if (ids.length > 0) {
      await this.pool.query(
        `UPDATE public.tickets SET db_state = 'AVAILABLE', reserved_at = NULL
         WHERE id = ANY($1::uuid[])`,
        [ids],
      );
    }
    return ids;
  }

  async getOpenPaymentsWithRefOlderThan(olderThan: Date): Promise<PaymentRecord[]> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT * FROM public.payments
       WHERE state IN ('INITIATED', 'PENDING')
         AND provider_ref IS NOT NULL
         AND created_at <= $1
       ORDER BY created_at`,
      [olderThan],
    );
    return res.rows.map(mapPayment);
  }

  async getReconciliationSnapshot(): Promise<{
    soldWithoutOrder: number;
    deliveredWithoutTicket: number;
    totalTickets: number;
    byState: Record<string, number>;
  }> {
    const res = await this.pool.query(
      `SELECT
         (SELECT count(*)::int FROM public.tickets
          WHERE db_state IN ('SOLD', 'USED') AND order_id IS NULL) AS sold_without_order,
         (SELECT count(*)::int FROM public.orders o
          WHERE o.state = 'DELIVERED' AND NOT EXISTS (
            SELECT 1 FROM public.tickets t
            WHERE t.order_id = o.id AND t.db_state IN ('SOLD', 'USED'))) AS delivered_without_ticket,
         (SELECT count(*)::int FROM public.tickets) AS total_tickets`,
    );
    const states = await this.pool.query(
      `SELECT db_state, count(*)::int AS n FROM public.tickets GROUP BY db_state`,
    );
    const byState: Record<string, number> = {};
    for (const row of states.rows) byState[String(row['db_state'])] = Number(row['n']);
    return {
      soldWithoutOrder: Number(res.rows[0]?.['sold_without_order'] ?? 0),
      deliveredWithoutTicket: Number(res.rows[0]?.['delivered_without_ticket'] ?? 0),
      totalTickets: Number(res.rows[0]?.['total_tickets'] ?? 0),
      byState,
    };
  }

  async insertReconciliationRun(run: {
    routerTotalExpected: number;
    routerTotalSeen: number | null;
    diff: Record<string, unknown>;
    status: 'OK' | 'MISMATCH';
  }): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO public.reconciliation_runs
         (router_total_expected, router_total_seen, diff, status, finished_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id`,
      [run.routerTotalExpected, run.routerTotalSeen, JSON.stringify(run.diff), run.status],
    );
    return String(res.rows[0]?.['id']);
  }

  /** IMP-25.3 — vérifie la présence des tables attendues (diagnostic base non migrée). */
  async getSchemaHealth(): Promise<{ present: number; missing: string[] }> {
    const expected = [
      'customers', 'plans', 'orders', 'payments', 'payment_events',
      'ticket_batches', 'tickets', 'mikrotik_sync', 'access_sessions',
      'reconciliation_runs', 'audit_logs', 'incidents', 'alerts', 'settings',
      'state_transitions', 'connector_heartbeats', 'admin_correction_requests',
    ];
    const res = await this.pool.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = ANY($1)`,
      [expected],
    );
    const presentSet = new Set(res.rows.map((r) => String(r['table_name'])));
    return {
      present: presentSet.size,
      missing: expected.filter((t) => !presentSet.has(t)),
    };
  }

  /** IMP-24 — Historique des runs de réconciliation (vue admin, plus récents d'abord). */
  async listReconciliationRuns(limit = 20): Promise<Array<{
    id: string;
    startedAt: string;
    finishedAt: string | null;
    routerTotalExpected: number | null;
    routerTotalSeen: number | null;
    status: 'RUNNING' | 'OK' | 'MISMATCH';
    diff: Record<string, unknown> | null;
  }>> {
    const res = await this.pool.query(
      `SELECT id, started_at, finished_at, router_total_expected, router_total_seen, status, diff
       FROM public.reconciliation_runs
       ORDER BY started_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 100))],
    );
    return res.rows.map((r) => ({
      id: String(r['id']),
      startedAt: String(r['started_at']),
      finishedAt: r['finished_at'] != null ? String(r['finished_at']) : null,
      routerTotalExpected: r['router_total_expected'] != null ? Number(r['router_total_expected']) : null,
      routerTotalSeen: r['router_total_seen'] != null ? Number(r['router_total_seen']) : null,
      status: String(r['status']) as 'RUNNING' | 'OK' | 'MISMATCH',
      diff: (r['diff'] ?? null) as Record<string, unknown> | null,
    }));
  }

  /** IMP-24 — Alertes de réconciliation non acquittées (vue admin). */
  async listOpenReconciliationAlerts(limit = 50): Promise<Array<{
    id: string;
    rule: string;
    severity: 'INFO' | 'WARNING' | 'CRITICAL';
    createdAt: string;
    payload: Record<string, unknown>;
  }>> {
    const res = await this.pool.query(
      `SELECT id, rule, severity, created_at, payload
       FROM public.alerts
       WHERE acknowledged_at IS NULL
         AND rule IN ('router_readonly_mismatch', 'sync_blocked')
       ORDER BY created_at DESC
       LIMIT $1`,
      [Math.max(1, Math.min(limit, 200))],
    );
    return res.rows.map((r) => ({
      id: String(r['id']),
      rule: String(r['rule']),
      severity: String(r['severity']) as 'INFO' | 'WARNING' | 'CRITICAL',
      createdAt: String(r['created_at']),
      payload: (r['payload'] ?? {}) as Record<string, unknown>,
    }));
  }

  async raiseAlert(alert: { rule: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; payload: Record<string, unknown> }): Promise<string> {
    const res = await this.pool.query(
      `INSERT INTO public.alerts (rule, severity, payload) VALUES ($1, $2, $3) RETURNING id`,
      [alert.rule, alert.severity, JSON.stringify(alert.payload)],
    );
    return String(res.rows[0]?.['id']);
  }

  async expireOverdueTickets(now: Date): Promise<string[]> {
    const res = await this.pool.query(
      `UPDATE public.tickets SET db_state = 'EXPIRED'
       WHERE db_state = 'SOLD'
         AND activation_deadline IS NOT NULL
         AND activation_deadline <= $1
       RETURNING id`,
      [now],
    );
    return res.rows.map((r) => String(r['id']));
  }

  /** IMP-27 — listes admin : projections minimales, sans code ticket ni payload webhook. */
  async listAdminOrders(options: AdminListOptions): Promise<AdminPage<AdminOrderSummary>> {
    const search = options.search?.trim() ?? '';
    const state = options.state?.trim() ?? '';
    const res = await this.pool.query(
      `SELECT o.id, c.phone, o.state,
              COALESCE(p.offer_id, o.plan_snapshot->>'offer_id', '') AS offer_id,
              COALESCE((o.plan_snapshot->>'price_snapshot')::int, 0) AS price_fcfa,
              pay.state AS payment_state, tk.db_state AS ticket_state,
              o.created_at, o.updated_at,
              count(*) OVER()::int AS total
       FROM public.orders o
       JOIN public.customers c ON c.id = o.customer_id
       LEFT JOIN public.plans p ON p.id = o.plan_id
       LEFT JOIN LATERAL (
         SELECT state FROM public.payments WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1
       ) pay ON true
       LEFT JOIN LATERAL (
         SELECT db_state FROM public.tickets WHERE order_id = o.id ORDER BY sold_at DESC NULLS LAST LIMIT 1
       ) tk ON true
       WHERE ($1 = '' OR o.id::text ILIKE '%' || $1 || '%' OR c.phone ILIKE '%' || $1 || '%'
              OR COALESCE(p.offer_id, o.plan_snapshot->>'offer_id', '') ILIKE '%' || $1 || '%')
         AND ($2 = '' OR o.state = $2)
         AND ($3 = '' OR COALESCE(p.offer_id, o.plan_snapshot->>'offer_id', '') = $3)
         AND ($4 = '' OR COALESCE(pay.state, '') = $4)
         AND ($5 = '' OR COALESCE(tk.db_state, '') = $5)
         AND ($6::timestamptz IS NULL OR o.created_at >= $6)
         AND ($7::timestamptz IS NULL OR o.created_at < $7)
       ORDER BY o.created_at DESC
       LIMIT $8 OFFSET $9`,
      [search, state, options.offerId?.trim() ?? '', options.paymentState?.trim() ?? '', options.ticketState?.trim() ?? '',
        options.from ?? null, options.to ?? null, options.limit, options.offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: String(r['id']), phone: String(r['phone']), state: String(r['state']),
        offerId: String(r['offer_id']), priceFcfa: Number(r['price_fcfa']),
        paymentState: r['payment_state'] == null ? null : String(r['payment_state']),
        ticketState: r['ticket_state'] == null ? null : String(r['ticket_state']),
        createdAt: new Date(r['created_at'] as string).toISOString(),
        updatedAt: new Date(r['updated_at'] as string).toISOString(),
      })),
      total: res.rows[0]?.['total'] == null ? 0 : Number(res.rows[0]['total']),
      limit: options.limit, offset: options.offset,
    };
  }

  async getAdminOrderById(id: string): Promise<AdminOrderDetail | null> {
    const res = await this.pool.query(
      `SELECT o.id, c.phone, o.state,
              COALESCE(pl.offer_id, o.plan_snapshot->>'offer_id', '') AS offer_id,
              COALESCE((o.plan_snapshot->>'price_snapshot')::int, 0) AS price_fcfa,
              o.created_at, o.updated_at,
              pay.id AS payment_id, pay.provider AS payment_provider, pay.provider_ref,
              pay.amount_fcfa AS payment_amount, pay.state AS payment_state,
              pay.confirmed_at AS payment_confirmed_at, pay.created_at AS payment_created_at,
              tk.id AS ticket_id, tk.batch_id, tk.offer_id AS ticket_offer_id, tk.source AS ticket_source,
              tk.db_state, tk.router_state, tk.order_id AS ticket_order_id, tk.code_prefix_hint,
              tk.sold_at, tk.activation_deadline, tk.batch_destination, tk.code_revealable,
              tk.reserved_at AS ticket_reserved_at, tk.created_at AS ticket_created_at,
              tk.mikrotik_comment AS ticket_mikrotik_comment
       FROM public.orders o
       JOIN public.customers c ON c.id = o.customer_id
       LEFT JOIN public.plans pl ON pl.id = o.plan_id
       LEFT JOIN LATERAL (
         SELECT p.id, p.provider, p.provider_ref, p.amount_fcfa, p.state, p.confirmed_at, p.created_at
         FROM public.payments p WHERE p.order_id = o.id ORDER BY p.created_at DESC LIMIT 1
       ) pay ON true
       LEFT JOIN LATERAL (
         SELECT t.id, t.batch_id, p2.offer_id, b.source, t.db_state, t.router_state, t.order_id,
                t.code_prefix_hint, t.sold_at, t.activation_deadline,
                b.destination AS batch_destination, (t.code_cipher IS NOT NULL) AS code_revealable,
                t.reserved_at, t.created_at, t.mikrotik_comment
         FROM public.tickets t
         JOIN public.ticket_batches b ON b.id = t.batch_id
         JOIN public.plans p2 ON p2.id = t.plan_id
         WHERE t.order_id = o.id ORDER BY t.sold_at DESC NULLS LAST LIMIT 1
       ) tk ON true
       WHERE o.id = $1`,
      [id],
    );
    const r = res.rows[0];
    if (!r) return null;
    const payment = r['payment_id'] == null ? null : {
      id: String(r['payment_id']), orderId: id, phone: String(r['phone']), provider: String(r['payment_provider']),
      providerRef: r['provider_ref'] == null ? null : String(r['provider_ref']), amountFcfa: Number(r['payment_amount']),
      state: String(r['payment_state']), confirmedAt: r['payment_confirmed_at'] == null ? null : new Date(r['payment_confirmed_at'] as string).toISOString(),
      createdAt: new Date(r['payment_created_at'] as string).toISOString(),
    } satisfies AdminPaymentSummary;
    const ticket = r['ticket_id'] == null ? null : {
      id: String(r['ticket_id']), batchId: String(r['batch_id']), offerId: String(r['ticket_offer_id']), source: String(r['ticket_source']),
      destination: r['batch_destination'] == null ? 'DIGITAL' : String(r['batch_destination']),
      revealable: Boolean(r['code_revealable']),
      dbState: String(r['db_state']), routerState: String(r['router_state']), orderId: r['ticket_order_id'] == null ? null : String(r['ticket_order_id']),
      codePrefixHint: r['code_prefix_hint'] == null ? null : String(r['code_prefix_hint']), soldAt: r['sold_at'] == null ? null : new Date(r['sold_at'] as string).toISOString(),
      reservedAt: r['ticket_reserved_at'] == null ? null : new Date(r['ticket_reserved_at'] as string).toISOString(),
      createdAt: r['ticket_created_at'] == null ? null : new Date(r['ticket_created_at'] as string).toISOString(),
      mikrotikComment: r['ticket_mikrotik_comment'] == null ? null : String(r['ticket_mikrotik_comment']),
      activationDeadline: r['activation_deadline'] == null ? null : new Date(r['activation_deadline'] as string).toISOString(),
    } satisfies AdminTicketSummary;
    return {
      id: String(r['id']), phone: String(r['phone']), state: String(r['state']), offerId: String(r['offer_id']), priceFcfa: Number(r['price_fcfa']),
      paymentState: payment?.state ?? null, ticketState: ticket?.dbState ?? null,
      createdAt: new Date(r['created_at'] as string).toISOString(), updatedAt: new Date(r['updated_at'] as string).toISOString(), payment, ticket,
      timeline: await this.getAdminOrderTimeline(id),
    };
  }

  /** IMP-31 — timeline reconstruite à partir des horodatages métier et des audits d'état.
   * La projection ne sélectionne jamais les payloads, codes, tokens ou credentials. */
  async getAdminOrderTimeline(id: string): Promise<AdminOrderTimelineEvent[]> {
    const res = await this.pool.query(
      `WITH timeline AS (
         SELECT 'order:' || o.id::text || ':created' AS id, 'orders' AS entity, o.id::text AS entity_id,
                'order_created' AS action, NULL::text AS from_state, 'CREATED'::text AS to_state,
                'system' AS actor, o.created_at AS at
         FROM public.orders o WHERE o.id = $1
         UNION ALL
         SELECT 'payment:' || p.id::text || ':initiated', 'payments', p.id::text,
                'payment_initiated', NULL::text, 'INITIATED'::text, 'system', p.created_at
         FROM public.payments p
         WHERE p.order_id = $1 AND p.state <> 'CREATED'
         UNION ALL
         SELECT 'ticket:' || t.id::text || ':assigned', 'tickets', t.id::text,
                'ticket_assigned', NULL::text, 'SOLD'::text, 'system', t.sold_at
         FROM public.tickets t
         WHERE t.order_id = $1 AND t.sold_at IS NOT NULL
         UNION ALL
         SELECT 'session:' || s.id::text || ':started', 'access_sessions', s.id::text,
                'ticket_used', NULL::text, s.state, 'connector', s.started_at
         FROM public.access_sessions s
         WHERE s.started_at IS NOT NULL
           AND s.ticket_id IN (SELECT t.id FROM public.tickets t WHERE t.order_id = $1)
         UNION ALL
         SELECT a.id::text, a.entity, a.entity_id, CASE
                  WHEN a.entity = 'payments' AND a.after->>'state' = 'CONFIRMED' THEN 'payment_confirmed'
                  WHEN a.entity = 'payments' AND a.after->>'state' = 'FAILED' THEN 'payment_failed'
                  WHEN a.entity = 'orders' AND a.after->>'state' = 'DELIVERED' THEN 'ticket_delivered'
                  WHEN a.entity = 'mikrotik_sync' AND a.after->>'state' = 'SUCCESS' THEN 'sync_succeeded'
                  WHEN a.entity = 'mikrotik_sync' AND a.after->>'state' IN ('FAILED','BLOCKED','MANUAL_REVIEW') THEN 'sync_failed'
                  ELSE a.action
                END,
                CASE
                  WHEN a.entity = 'orders' THEN a.before->>'state'
                  WHEN a.entity = 'payments' THEN a.before->>'state'
                  WHEN a.entity = 'tickets' THEN a.before->>'db_state'
                  WHEN a.entity = 'mikrotik_sync' THEN a.before->>'state'
                  WHEN a.entity = 'access_sessions' THEN a.before->>'state'
                  ELSE NULL
                END,
                CASE
                  WHEN a.entity = 'orders' THEN a.after->>'state'
                  WHEN a.entity = 'payments' THEN a.after->>'state'
                  WHEN a.entity = 'tickets' THEN a.after->>'db_state'
                  WHEN a.entity = 'mikrotik_sync' THEN a.after->>'state'
                  WHEN a.entity = 'access_sessions' THEN a.after->>'state'
                  ELSE NULL
                END,
                a.actor, a.at
         FROM public.audit_logs a
         WHERE (a.entity = 'orders' AND a.entity_id = $1::text)
            OR (a.entity = 'payments' AND a.entity_id IN (
                 SELECT p.id::text FROM public.payments p WHERE p.order_id = $1
               ))
            OR (a.entity = 'tickets' AND a.entity_id IN (
                 SELECT t.id::text FROM public.tickets t WHERE t.order_id = $1
               ))
            OR (a.entity = 'access_sessions' AND a.entity_id IN (
                 SELECT s.id::text FROM public.access_sessions s
                 WHERE s.ticket_id IN (SELECT t.id FROM public.tickets t WHERE t.order_id = $1)
               ))
            OR (a.entity = 'mikrotik_sync' AND a.entity_id IN (
                 SELECT m.id::text FROM public.mikrotik_sync m
                 WHERE m.payload->>'order_id' = $1::text
                    OR m.payload->>'ticket_id' IN (SELECT t.id::text FROM public.tickets t WHERE t.order_id = $1)
               ))
       )
       SELECT id, entity, entity_id, action, from_state, to_state, actor, at
       FROM timeline
       ORDER BY at ASC, id ASC`,
      [id],
    );
    return res.rows.map((r) => ({
      id: String(r['id']), entity: String(r['entity']), entityId: String(r['entity_id']), action: String(r['action']),
      fromState: r['from_state'] == null ? null : String(r['from_state']), toState: r['to_state'] == null ? null : String(r['to_state']),
      actor: String(r['actor']), at: new Date(r['at'] as string).toISOString(),
    }));
  }

  async createAdminCorrectionRequest(input: {
    orderId: string;
    requestedAction: AdminCorrectionRequest['requestedAction'];
    reason: string;
    requestedBy: string;
    idempotencyKey: string;
  }): Promise<{ request: AdminCorrectionRequest; created: boolean } | null> {
    const exists = await this.pool.query(`SELECT id FROM public.orders WHERE id = $1`, [input.orderId]);
    if (!exists.rows[0]) return null;
    const inserted = await this.pool.query(
      `INSERT INTO public.admin_correction_requests
         (order_id, requested_action, reason, requested_by, idempotency_key)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (order_id, idempotency_key) DO NOTHING
       RETURNING id, order_id, requested_action, reason, requested_by, state, idempotency_key, created_at`,
      [input.orderId, input.requestedAction, input.reason, input.requestedBy, input.idempotencyKey],
    );
    const row = inserted.rows[0] ?? (await this.pool.query(
      `SELECT id, order_id, requested_action, reason, requested_by, state, idempotency_key, created_at
       FROM public.admin_correction_requests WHERE order_id = $1 AND idempotency_key = $2`,
      [input.orderId, input.idempotencyKey],
    )).rows[0];
    if (!row) throw new Error('correction_request_not_persisted');
    return {
      created: inserted.rows.length > 0,
      request: {
        id: String(row['id']), orderId: String(row['order_id']), requestedAction: String(row['requested_action']) as AdminCorrectionRequest['requestedAction'],
        reason: String(row['reason']), requestedBy: String(row['requested_by']), state: String(row['state']) as AdminCorrectionRequest['state'],
        idempotencyKey: String(row['idempotency_key']), createdAt: new Date(row['created_at'] as string).toISOString(),
      },
    };
  }

  async listAdminPayments(options: AdminListOptions): Promise<AdminPage<AdminPaymentSummary>> {
    const search = options.search?.trim() ?? '';
    const state = options.state?.trim() ?? '';
    const res = await this.pool.query(
      `SELECT p.id, p.order_id, c.phone, p.provider, p.provider_ref, p.amount_fcfa,
              p.state, p.confirmed_at, p.created_at, count(*) OVER()::int AS total
       FROM public.payments p
       JOIN public.orders o ON o.id = p.order_id
       JOIN public.customers c ON c.id = o.customer_id
       LEFT JOIN public.plans pl ON pl.id = o.plan_id
       WHERE ($1 = '' OR p.id::text ILIKE '%' || $1 || '%' OR p.order_id::text ILIKE '%' || $1 || '%'
              OR c.phone ILIKE '%' || $1 || '%' OR COALESCE(p.provider_ref, '') ILIKE '%' || $1 || '%')
         AND ($2 = '' OR p.state = $2)
         AND ($3 = '' OR COALESCE(pl.offer_id, o.plan_snapshot->>'offer_id', '') = $3)
         AND ($4::timestamptz IS NULL OR p.created_at >= $4)
         AND ($5::timestamptz IS NULL OR p.created_at < $5)
       ORDER BY p.created_at DESC
       LIMIT $6 OFFSET $7`,
      [search, state, options.offerId?.trim() ?? '', options.from ?? null, options.to ?? null, options.limit, options.offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: String(r['id']), orderId: String(r['order_id']), phone: String(r['phone']),
        provider: String(r['provider']), providerRef: r['provider_ref'] == null ? null : String(r['provider_ref']),
        amountFcfa: Number(r['amount_fcfa']), state: String(r['state']),
        confirmedAt: r['confirmed_at'] == null ? null : new Date(r['confirmed_at'] as string).toISOString(),
        createdAt: new Date(r['created_at'] as string).toISOString(),
      })),
      total: res.rows[0]?.['total'] == null ? 0 : Number(res.rows[0]['total']),
      limit: options.limit, offset: options.offset,
    };
  }

  async listAdminTickets(options: AdminListOptions): Promise<AdminPage<AdminTicketSummary>> {
    const search = options.search?.trim() ?? '';
    const state = options.state?.trim() ?? '';
    // IMP-32 — projection sans secret : ni code_hash, ni code_cipher, ni payload ;
    // `revealable` indique si la révélation contrôlée est possible (doc 09 §20/27).
    const destination = options.destination?.trim() ?? '';
    const res = await this.pool.query(
      `SELECT t.id, t.batch_id, p.offer_id, b.source, b.destination, t.db_state, t.router_state, t.order_id,
              t.code_prefix_hint, (t.code_cipher IS NOT NULL) AS revealable,
              t.sold_at, t.reserved_at, t.created_at, t.mikrotik_comment, t.activation_deadline,
              count(*) OVER()::int AS total
       FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       JOIN public.plans p ON p.id = t.plan_id
       WHERE ($1 = '' OR t.id::text ILIKE '%' || $1 || '%' OR t.batch_id::text ILIKE '%' || $1 || '%'
              OR p.offer_id ILIKE '%' || $1 || '%')
         AND ($2 = '' OR t.db_state = $2)
         AND ($3 = '' OR p.offer_id = $3)
         AND ($4 = '' OR b.destination = $4)
         AND ($5::timestamptz IS NULL OR t.created_at >= $5)
         AND ($6::timestamptz IS NULL OR t.created_at < $6)
       ORDER BY t.created_at DESC
       LIMIT $7 OFFSET $8`,
      [search, state, options.offerId?.trim() ?? '', destination, options.from ?? null, options.to ?? null, options.limit, options.offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: String(r['id']), batchId: String(r['batch_id']), offerId: String(r['offer_id']),
        source: String(r['source']), destination: String(r['destination']),
        dbState: String(r['db_state']), routerState: String(r['router_state']),
        orderId: r['order_id'] == null ? null : String(r['order_id']),
        codePrefixHint: r['code_prefix_hint'] == null ? null : String(r['code_prefix_hint']),
        revealable: Boolean(r['revealable']),
        soldAt: r['sold_at'] == null ? null : new Date(r['sold_at'] as string).toISOString(),
        reservedAt: r['reserved_at'] == null ? null : new Date(r['reserved_at'] as string).toISOString(),
        createdAt: new Date(r['created_at'] as string).toISOString(),
        mikrotikComment: r['mikrotik_comment'] == null ? null : String(r['mikrotik_comment']),
        activationDeadline: r['activation_deadline'] == null ? null : new Date(r['activation_deadline'] as string).toISOString(),
      })),
      total: res.rows[0]?.['total'] == null ? 0 : Number(res.rows[0]['total']),
      limit: options.limit, offset: options.offset,
    };
  }

  async listAdminBatches(options: AdminListOptions): Promise<AdminPage<AdminBatchSummary>> {
    const search = options.search?.trim() ?? '';
    const source = options.state?.trim() ?? '';
    const destination = options.destination?.trim() ?? '';
    // IMP-32 — compteurs doc 09 §30, calculés en base (jamais de décompte frontend).
    const staleMinutes = Math.round(DEFAULT_RESERVED_TTL_MS / 60000); // TTL D11 (workers)
    const res = await this.pool.query(
      `SELECT b.id, b.source, b.quantity, b.destination, b.generated_at, b.created_at, b.notes,
              b.manifest_sha256,
              count(t.id) FILTER (WHERE t.db_state IN ('AVAILABLE','RELEASED'))::int AS available_count,
              count(t.id) FILTER (WHERE t.db_state = 'RESERVED')::int AS reserved_count,
              count(t.id) FILTER (WHERE t.db_state = 'RESERVED'
                                   AND t.reserved_at <= now() - make_interval(mins => $3))::int AS reserved_stale_count,
              count(t.id) FILTER (WHERE t.db_state = 'SOLD')::int AS sold_count,
              count(t.id) FILTER (WHERE t.db_state = 'USED')::int AS used_count,
              count(t.id) FILTER (WHERE t.db_state = 'EXPIRED')::int AS expired_count,
              count(t.id) FILTER (WHERE t.db_state = 'RELEASED')::int AS released_count,
              count(t.id)::int AS tickets_count,
              (SELECT p.offer_id FROM public.plans p
               JOIN public.tickets t2 ON t2.plan_id = p.id
               WHERE t2.batch_id = b.id LIMIT 1) AS offer_id,
              count(*) OVER()::int AS total
       FROM public.ticket_batches b
       LEFT JOIN public.tickets t ON t.batch_id = b.id
       WHERE ($1 = '' OR b.id::text ILIKE '%' || $1 || '%' OR COALESCE(b.notes, '') ILIKE '%' || $1 || '%')
         AND ($2 = '' OR b.source = $2)
         AND ($4 = '' OR b.destination = $4)
         AND ($5::timestamptz IS NULL OR b.created_at >= $5)
         AND ($6::timestamptz IS NULL OR b.created_at < $6)
       GROUP BY b.id
       ORDER BY b.generated_at DESC
       LIMIT $7 OFFSET $8`,
      [search, source, staleMinutes, destination, options.from ?? null, options.to ?? null, options.limit, options.offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: String(r['id']), source: String(r['source']), quantity: Number(r['quantity']),
        destination: String(r['destination']),
        offerId: r['offer_id'] == null ? null : String(r['offer_id']),
        generatedAt: new Date(r['generated_at'] as string).toISOString(),
        createdAt: new Date(r['created_at'] as string).toISOString(),
        notes: r['notes'] == null ? null : String(r['notes']),
        manifestSha256: r['manifest_sha256'] == null ? null : String(r['manifest_sha256']),
        availableCount: Number(r['available_count']),
        reservedCount: Number(r['reserved_count']),
        reservedStaleCount: Number(r['reserved_stale_count']),
        soldCount: Number(r['sold_count']),
        usedCount: Number(r['used_count']),
        expiredCount: Number(r['expired_count']),
        releasedCount: Number(r['released_count']),
        ticketsCount: Number(r['tickets_count']),
      })),
      total: res.rows[0]?.['total'] == null ? 0 : Number(res.rows[0]['total']),
      limit: options.limit, offset: options.offset,
    };
  }

  async listAdminAuditLogs(options: AdminListOptions): Promise<AdminPage<AdminAuditSummary>> {
    const search = options.search?.trim() ?? '';
    const res = await this.pool.query(
      `SELECT id, actor, action, entity, entity_id, at, count(*) OVER()::int AS total
       FROM public.audit_logs
       WHERE ($1 = '' OR actor ILIKE '%' || $1 || '%' OR action ILIKE '%' || $1 || '%'
              OR entity ILIKE '%' || $1 || '%' OR COALESCE(entity_id, '') ILIKE '%' || $1 || '%')
         AND ($2::timestamptz IS NULL OR at >= $2)
         AND ($3::timestamptz IS NULL OR at < $3)
       ORDER BY at DESC
       LIMIT $4 OFFSET $5`,
      [search, options.from ?? null, options.to ?? null, options.limit, options.offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: String(r['id']), actor: String(r['actor']), action: String(r['action']),
        entity: String(r['entity']), entityId: r['entity_id'] == null ? null : String(r['entity_id']),
        at: new Date(r['at'] as string).toISOString(),
      })),
      total: res.rows[0]?.['total'] == null ? 0 : Number(res.rows[0]['total']),
      limit: options.limit, offset: options.offset,
    };
  }

  async listAdminIncidents(options: AdminListOptions): Promise<AdminPage<AdminIncidentSummary>> {
    const search = options.search?.trim() ?? '';
    const state = options.state?.trim() ?? '';
    const res = await this.pool.query(
      `SELECT id, type, severity, state,
              jsonb_build_object(
                'code', COALESCE(details->>'code', ''),
                'message', COALESCE(details->>'message', ''),
                'source', COALESCE(details->>'source', '')
              ) AS details,
              opened_at, closed_at, created_at,
              count(*) OVER()::int AS total
       FROM public.incidents
       WHERE ($1 = '' OR id::text ILIKE '%' || $1 || '%' OR type ILIKE '%' || $1 || '%'
              OR severity ILIKE '%' || $1 || '%')
         AND ($2 = '' OR state = $2)
         AND ($3::timestamptz IS NULL OR opened_at >= $3)
         AND ($4::timestamptz IS NULL OR opened_at < $4)
       ORDER BY opened_at DESC
       LIMIT $5 OFFSET $6`,
      [search, state, options.from ?? null, options.to ?? null, options.limit, options.offset],
    );
    return {
      items: res.rows.map((r) => ({
        id: String(r['id']), type: String(r['type']), severity: String(r['severity']), state: String(r['state']),
        details: (r['details'] ?? {}) as Record<string, unknown>,
        openedAt: new Date(r['opened_at'] as string).toISOString(),
        closedAt: r['closed_at'] == null ? null : new Date(r['closed_at'] as string).toISOString(),
        createdAt: new Date(r['created_at'] as string).toISOString(),
      })),
      total: res.rows[0]?.['total'] == null ? 0 : Number(res.rows[0]['total']),
      limit: options.limit, offset: options.offset,
    };
  }

  async getAdminDashboardStats(since: Date): Promise<AdminDashboardDbStats> {
    const [orders, payments, salesByOffer, delivered, byState, byOffer, incidents, sync, syncLast, activity, heartbeat] = await Promise.all([
      this.pool.query(
        `SELECT count(*)::int AS n
         FROM public.orders WHERE created_at >= $1`,
        [since],
      ),
      this.pool.query(
        `SELECT count(*)::int AS n,
                count(DISTINCT order_id)::int AS sales,
                coalesce(sum(amount_fcfa), 0)::bigint AS total
         FROM public.payments WHERE state = 'CONFIRMED' AND confirmed_at >= $1`,
        [since],
      ),
      this.pool.query(
        `SELECT p.offer_id, count(DISTINCT o.id)::int AS sales_count,
                coalesce(sum(pay.amount_fcfa), 0)::bigint AS revenue
         FROM public.orders o
         JOIN public.plans p ON p.id = o.plan_id
         JOIN public.payments pay ON pay.order_id = o.id
         WHERE pay.state = 'CONFIRMED' AND pay.confirmed_at >= $1
         GROUP BY p.offer_id ORDER BY sales_count DESC, p.offer_id`,
        [since],
      ),
      this.pool.query(
        `SELECT count(*)::int AS n FROM public.orders
         WHERE state = 'DELIVERED' AND updated_at >= $1`,
        [since],
      ),
      this.pool.query(
        `SELECT db_state, count(*)::int AS n FROM public.tickets GROUP BY db_state`,
      ),
      this.pool.query(
        `SELECT p.offer_id, count(*)::int AS n
         FROM public.tickets t JOIN public.plans p ON p.id = t.plan_id
         WHERE t.db_state IN ('AVAILABLE', 'RELEASED')
         GROUP BY p.offer_id`,
      ),
      this.pool.query(
        `SELECT count(*)::int AS n FROM public.incidents WHERE state IN ('OPEN', 'INVESTIGATING')`,
      ),
      this.pool.query(
        `SELECT count(*) FILTER (WHERE state IN ('PENDING', 'PROCESSING', 'RETRY'))::int AS pending,
                count(*) FILTER (WHERE state IN ('FAILED', 'BLOCKED', 'MANUAL_REVIEW'))::int AS failed,
                count(*) FILTER (WHERE state = 'SUCCESS')::int AS success
         FROM public.mikrotik_sync`,
      ),
      this.pool.query(
        `SELECT updated_at, state,
                COALESCE(result->'error'->>'message', result->>'error') AS error
         FROM public.mikrotik_sync ORDER BY updated_at DESC LIMIT 1`,
      ),
      this.pool.query(
        `SELECT id::text, action, actor, entity, entity_id, at,
                after->>'state' AS state
         FROM public.audit_logs
         UNION ALL
         SELECT id::text, 'incident_created', 'system', 'incidents', id::text, created_at, state
         FROM public.incidents
         ORDER BY at DESC LIMIT 20`,
      ),
      this.pool.query(
        `SELECT connector_id, version, router_model, routeros_version, last_seen_at
         FROM public.connector_heartbeats ORDER BY last_seen_at DESC LIMIT 1`,
      ),
    ]);
    const ticketsByState: Record<string, number> = {};
    for (const row of byState.rows) ticketsByState[String(row['db_state'])] = Number(row['n']);
    const availableByOffer: Record<string, number> = {};
    for (const row of byOffer.rows) availableByOffer[String(row['offer_id'])] = Number(row['n']);
    const activityKind = (entity: string, action: string, state: string | null): AdminActivityEvent['kind'] => {
      if (entity === 'incidents') return 'INCIDENT';
      if (entity === 'mikrotik_sync') return 'SYNC';
      if (entity === 'payments') return 'PAYMENT';
      if (entity === 'tickets') return 'TICKET';
      if (entity === 'orders' && ['PAID', 'TICKET_ALLOCATED', 'DELIVERED', 'REFUNDED'].includes(state ?? '')) return 'SALE';
      return 'ADMIN';
    };
    const recentActivity: AdminActivityEvent[] = activity.rows.map((row) => {
      const entity = String(row['entity']);
      const action = String(row['action']);
      const state = row['state'] == null ? null : String(row['state']);
      return {
        id: String(row['id']),
        kind: activityKind(entity, action, state),
        action,
        actor: String(row['actor']),
        entity,
        entityId: row['entity_id'] == null ? null : String(row['entity_id']),
        state,
        occurredAt: new Date(row['at'] as string).toISOString(),
      };
    });
    const syncRow = syncLast.rows[0];
    const heartbeatRow = heartbeat.rows[0];
    return {
      ordersCountToday: Number(orders.rows[0]?.['n'] ?? 0),
      salesCountToday: Number(payments.rows[0]?.['sales'] ?? 0),
      paymentsConfirmedToday: Number(payments.rows[0]?.['n'] ?? 0),
      revenueTodayFcfa: Number(payments.rows[0]?.['total'] ?? 0),
      ticketsDeliveredToday: Number(delivered.rows[0]?.['n'] ?? 0),
      salesByOffer: salesByOffer.rows.map((row) => ({
        offerId: String(row['offer_id']),
        salesCount: Number(row['sales_count']),
        revenueFcfa: Number(row['revenue'] ?? 0),
      })),
      ticketsByState,
      availableByOffer,
      incidentsOpen: Number(incidents.rows[0]?.['n'] ?? 0),
      syncPending: Number(sync.rows[0]?.['pending'] ?? 0),
      syncFailed: Number(sync.rows[0]?.['failed'] ?? 0),
      syncSuccess: Number(sync.rows[0]?.['success'] ?? 0),
      syncLastAt: syncRow == null ? null : new Date(syncRow['updated_at'] as string).toISOString(),
      syncLastState: syncRow == null ? null : String(syncRow['state']),
      syncLastError: syncRow?.['error'] == null ? null : String(syncRow['error']),
      recentActivity,
      connector: heartbeatRow == null ? null : {
        connectorId: String(heartbeatRow['connector_id']),
        version: heartbeatRow['version'] == null ? null : String(heartbeatRow['version']),
        routerModel: heartbeatRow['router_model'] == null ? null : String(heartbeatRow['router_model']),
        routerosVersion: heartbeatRow['routeros_version'] == null ? null : String(heartbeatRow['routeros_version']),
        lastSeenAt: new Date(heartbeatRow['last_seen_at'] as string).toISOString(),
      },
    };
  }

  async recordConnectorHeartbeat(input: {
    connectorId: string;
    version?: string;
    routerModel?: string;
    routerosVersion?: string;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.connector_heartbeats
         (connector_id, version, router_model, routeros_version, last_seen_at)
       VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (connector_id) DO UPDATE SET
         version = EXCLUDED.version,
         router_model = EXCLUDED.router_model,
         routeros_version = EXCLUDED.routeros_version,
         last_seen_at = EXCLUDED.last_seen_at`,
      [input.connectorId, input.version ?? null, input.routerModel ?? null, input.routerosVersion ?? null],
    );
  }

  async getConnectorHeartbeat(): Promise<ConnectorHeartbeat | null> {
    const result = await this.pool.query(
      `SELECT connector_id, version, router_model, routeros_version, last_seen_at
       FROM public.connector_heartbeats ORDER BY last_seen_at DESC LIMIT 1`,
    );
    const row = result.rows[0];
    return row == null ? null : {
      connectorId: String(row['connector_id']),
      version: row['version'] == null ? null : String(row['version']),
      routerModel: row['router_model'] == null ? null : String(row['router_model']),
      routerosVersion: row['routeros_version'] == null ? null : String(row['routeros_version']),
      lastSeenAt: new Date(row['last_seen_at'] as string).toISOString(),
    };
  }

  async getTicketsStatsByOffer(): Promise<Array<{ offerId: string; priceFcfa: number; states: Record<string, number> }>> {
    const result = await this.pool.query(
      `SELECT ap.offer_id, ap.price_fcfa, t.db_state, count(t.id)::int AS n
       FROM (SELECT DISTINCT ON (offer_id) offer_id, price_fcfa
             FROM public.plans WHERE active_to IS NULL
             ORDER BY offer_id, version DESC) ap
       LEFT JOIN public.plans p ON p.offer_id = ap.offer_id
       LEFT JOIN public.tickets t ON t.plan_id = p.id
       GROUP BY ap.offer_id, ap.price_fcfa, t.db_state
       ORDER BY ap.price_fcfa`,
    );
    const byOffer = new Map<string, { offerId: string; priceFcfa: number; states: Record<string, number> }>();
    for (const row of result.rows) {
      const offerId = String(row['offer_id']);
      let entry = byOffer.get(offerId);
      if (!entry) {
        entry = { offerId, priceFcfa: Number(row['price_fcfa']), states: {} };
        byOffer.set(offerId, entry);
      }
      if (row['db_state'] != null) entry.states[String(row['db_state'])] = Number(row['n']);
    }
    return Array.from(byOffer.values());
  }

  async acknowledgeAlert(id: string): Promise<AlertAckRecord | null> {
    // Atomique : le WHERE acknowledged_at IS NULL rend le ack concurrent-safe.
    const updated = await this.pool.query(
      `UPDATE public.alerts SET acknowledged_at = now()
       WHERE id = $1 AND acknowledged_at IS NULL
       RETURNING id, rule, severity, acknowledged_at`,
      [id],
    );
    if (updated.rows[0]) {
      const row = updated.rows[0];
      return {
        id: String(row['id']),
        rule: String(row['rule']),
        severity: String(row['severity']),
        acknowledgedAt: row['acknowledged_at'] as Date,
        alreadyAcknowledged: false,
      };
    }
    const existing = await this.pool.query(
      `SELECT id, rule, severity, acknowledged_at FROM public.alerts WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) return null;
    const row = existing.rows[0];
    return {
      id: String(row['id']),
      rule: String(row['rule']),
      severity: String(row['severity']),
      acknowledgedAt: row['acknowledged_at'] as Date,
      alreadyAcknowledged: true,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Snapshot commercial figé à la commande (doc 06 §09) : clés nommées d'après la doc,
 * complétées des champs techniques nécessaires à la livraison (profil, limit_uptime).
 */
export function buildPlanSnapshot(plan: ActivePlan): Record<string, unknown> {
  return {
    plan_id: plan.planId,
    offer_id: plan.offerId,
    plan_name_snapshot: plan.offerId,
    price_snapshot: plan.priceFcfa,
    currency_snapshot: 'XOF',
    access_duration_snapshot: plan.accessHours,
    validity_duration_snapshot: plan.validityHours,
    mikrotik_profile: plan.mikrotikProfile,
    limit_uptime: plan.limitUptime,
    plan_version: plan.version,
  };
}
