/**
 * IMP-13 — Fake repo en mémoire partagé par les tests unitaires (app, auth).
 * Les tests d'intégration réels utilisent PgRepo (repo.pg.test.ts).
 */
import { OFFERS } from '@dg/shared';
import { createHash, randomUUID } from 'node:crypto';
import { computeConnectorState } from './admin.js';
import type { AdminDashboardDbStats, AlertAckRecord, ConnectorHeartbeat } from './admin.js';
import { FIRST_BACKEND_BATCH_SEQ, generateTicketSpecs } from './ticketgen.js';
import { sealCode } from './ticketvault.js';
import { STOCK_MANIFEST_IMP06 } from './stock-manifest.js';
import { allocateAndDeliver } from './tickets.js';
import { DEFAULT_RESERVED_TTL_MS } from './workers.js';
import type { CreatedBackendBatch } from './repo.js';
import {
  TICKET_CODE_FORMAT,
  type TicketImportInput,
  type TicketImportPreview,
  type TicketImportResult,
  type TicketReconciliation,
} from './repo.js';
import type {
  ActivePlan,
  AdminAuditSummary,
  AdminBatchSummary,
  AdminCorrectionRequest,
  AdminIncidentDetail,
  AdminIncidentSummary,
  CreateIncidentInput,
  IncidentRetryOutcome,
  AdminOrderDetail,
  AdminOrderTimelineEvent,
  AdminListOptions,
  AdminOrderSummary,
  AdminPage,
  AdminPaymentSummary,
  AdminTicketSummary,
  AllocateResult,
  BackendRepo,
  CreateOrderInputDb,
  OrderRecord,
  PaymentRecord,
  SyncOpRecord,
  SyncResolveOutcome,
  TicketRecord,
} from './repo.js';

/** IMP-33 — incident en mémoire : summary + champs internes du cycle de vie. */
type FakeIncident = AdminIncidentSummary & {
  detectionKey: string | null;
  acknowledgedBy: string | null;
  lastRetryKey: string | null;
  reopenedCount: number;
  closeReason: string | null;
  history: Array<{ id: string; action: string; actor: string; at: string; after: Record<string, unknown> | null }>;
};

export class FakeRepo implements BackendRepo {
  pingFails = false;
  plans: ActivePlan[] = OFFERS.map((o, i) => ({
    planId: `plan-${i}`,
    offerId: o.id,
    priceFcfa: o.priceFcfa,
    accessHours: o.accessHours,
    validityHours: o.validityHours,
    mikrotikProfile: o.mikrotikProfile,
    limitUptime: o.limitUptime,
    version: 1,
  }));
  customers = new Map<string, string>();
  orders = new Map<string, OrderRecord>();
  ordersByIdempotencyKey = new Map<string, string>();

  async ping(): Promise<void> {
    if (this.pingFails) throw new Error('db down');
  }
  async listActivePlans(): Promise<ActivePlan[]> {
    return this.plans;
  }
  async getActivePlanByOffer(offerId: string): Promise<ActivePlan | null> {
    return this.plans.find((p) => p.offerId === offerId) ?? null;
  }
  async findOrCreateCustomer(phone: string): Promise<string> {
    let id = this.customers.get(phone);
    if (!id) {
      id = randomUUID();
      this.customers.set(phone, id);
    }
    return id;
  }
  async createOrder(
    input: CreateOrderInputDb,
  ): Promise<{ order: OrderRecord; created: boolean }> {
    const existingId = this.ordersByIdempotencyKey.get(input.idempotencyKey);
    if (existingId) {
      const existing = this.orders.get(existingId);
      if (existing) return { order: existing, created: false };
    }
    const now = new Date();
    const order: OrderRecord = {
      id: randomUUID(),
      customerId: input.customerId,
      planId: this.getOrCreatePlanId(String(input.planSnapshot['offer_id'] ?? 'INCONNU')),
      state: 'CREATED',
      currency: 'XOF',
      planSnapshot: input.planSnapshot,
      createdAt: now,
      updatedAt: now,
    };
    this.orders.set(order.id, order);
    this.ordersByIdempotencyKey.set(input.idempotencyKey, order.id);
    return { order, created: true };
  }
  async getOrderById(id: string): Promise<OrderRecord | null> {
    return this.orders.get(id) ?? null;
  }
  // --- IMP-15 : plans + tickets + allocation (mêmes sémantiques que PgRepo) ---
  private planIds = new Map<string, string>();

  getOrCreatePlanId(offerId: string): string {
    let id = this.planIds.get(offerId);
    if (!id) {
      id = randomUUID();
      this.planIds.set(offerId, id);
    }
    return id;
  }

  /** IMP-32 — offre d'un ticket : plan OFFERS, sinon lot (import), sinon planId dynamique. */
  private ticketOfferId(ticket: TicketRecord): string {
    const plan = this.plans.find((p) => p.planId === ticket.planId);
    if (plan) return plan.offerId;
    const batch = this.adminBatches.get(ticket.batchId);
    if (batch?.offerId) return batch.offerId;
    for (const [offerId, planId] of this.planIds) {
      if (planId === ticket.planId) return offerId;
    }
    return 'INCONNU';
  }

  tickets = new Map<string, TicketRecord>();

  /** IMP-32 — lots de l'inventaire (destination, source, idempotence d'import). */
  adminBatches = new Map<string, {
    id: string;
    source: 'backend' | 'mikmon-manual';
    destination: 'DIGITAL' | 'PHYSICAL';
    offerId: string | null;
    quantity: number;
    generatedAt: Date;
    notes: string | null;
    manifestSha256: string | null;
    idempotencyKey: string | null;
  }>();
  /** IMP-32 — clé d'idempotence d'import → batchId (rejeu sans réécriture). */
  importIdempotency = new Map<string, string>();

  private registerBatch(batch: {
    id: string;
    source: 'backend' | 'mikmon-manual';
    destination: 'DIGITAL' | 'PHYSICAL';
    offerId: string | null;
    quantity: number;
    generatedAt: Date;
    notes: string | null;
    manifestSha256: string | null;
    idempotencyKey: string | null;
  }): void {
    this.adminBatches.set(batch.id, batch);
    if (batch.idempotencyKey) this.importIdempotency.set(batch.idempotencyKey, batch.id);
  }

  /** Fixture de test : ajoute un ticket AVAILABLE pour une offre (lot DIGITAL). */
  seedTicket(offerId: string, prefix = 'TEST'): TicketRecord {
    const batchId = randomUUID();
    this.registerBatch({
      id: batchId, source: 'backend', destination: 'DIGITAL', offerId,
      quantity: 1, generatedAt: new Date(), notes: `fixture ${offerId}`, manifestSha256: null, idempotencyKey: null,
    });
    const ticket: TicketRecord = {
      id: randomUUID(),
      batchId,
      planId: this.getOrCreatePlanId(offerId),
      dbState: 'AVAILABLE',
      routerState: 'UNUSED',
      orderId: null,
      codePrefixHint: prefix,
      soldAt: null,
      mikrotikComment: null,
      activationDeadline: null,
      codeHash: null,
      codeCipher: null,
      reservedAt: null,
      createdAt: new Date(),
    };
    this.tickets.set(ticket.id, ticket);
    return ticket;
  }

  async allocateTicketForOrder(orderId: string): Promise<AllocateResult> {
    const order = this.orders.get(orderId);
    if (!order) return { status: 'illegal' };
    if (order.state === 'TICKET_ALLOCATED' || order.state === 'DELIVERED') {
      const existing = [...this.tickets.values()].find(
        (t) => t.orderId === orderId && (t.dbState === 'SOLD' || t.dbState === 'USED'),
      );
      return existing
        ? { status: 'allocated', ticketId: existing.id, codePrefixHint: existing.codePrefixHint }
        : { status: 'illegal' };
    }
    if (order.state !== 'PAID') return { status: 'illegal' };
    // IMP-32 (doc 09 §28) : jamais un ticket d'un lot PHYSICAL pour une vente
    // numérique (même garde que PgRepo.allocateTicketForOrder).
    const candidate = [...this.tickets.values()].find(
      (t) => t.planId === order.planId && t.dbState === 'AVAILABLE'
        && (this.adminBatches.get(t.batchId)?.destination ?? 'DIGITAL') === 'DIGITAL',
    );
    if (!candidate) return { status: 'no-stock' };
    candidate.dbState = 'SOLD';
    candidate.orderId = orderId;
    candidate.soldAt = new Date();
    candidate.reservedAt = candidate.soldAt;
    // IMP-19 : échéance = sold_at + validité de l'offre (snapshot §09).
    const validityHours = Number(order.planSnapshot['validity_duration_snapshot'] ?? 0);
    candidate.activationDeadline = new Date(candidate.soldAt.getTime() + validityHours * 3600_000);
    order.state = 'TICKET_ALLOCATED';
    return { status: 'allocated', ticketId: candidate.id, codePrefixHint: candidate.codePrefixHint };
  }

  async deliverOrder(orderId: string): Promise<'delivered' | 'already-delivered' | 'illegal'> {
    const order = this.orders.get(orderId);
    if (!order) return 'illegal';
    if (order.state === 'DELIVERED') return 'already-delivered';
    if (order.state !== 'TICKET_ALLOCATED') return 'illegal';
    order.state = 'DELIVERED';
    return 'delivered';
  }

  async getSoldTicketsForCustomer(
    customerId: string,
  ): Promise<Array<TicketRecord & { offerId: string | null }>> {
    const out: Array<TicketRecord & { offerId: string | null }> = [];
    for (const t of this.tickets.values()) {
      if (t.dbState !== 'SOLD' && t.dbState !== 'USED') continue;
      if (!t.orderId) continue;
      const order = this.orders.get(t.orderId);
      if (!order || order.customerId !== customerId) continue;
      out.push({ ...t, offerId: String(order.planSnapshot['offer_id'] ?? '') || null });
    }
    return out;
  }

  // --- IMP-14 : paiements + webhooks (mêmes sémantiques que PgRepo) ---
  payments = new Map<string, PaymentRecord>();
  paymentEvents = new Set<string>();

  async getCustomerById(customerId: string): Promise<{ id: string; phone: string } | null> {
    for (const [phone, id] of this.customers) {
      if (id === customerId) return { id, phone };
    }
    return null;
  }

  async createPayment(orderId: string, amountFcfa: number): Promise<PaymentRecord> {
    const now = new Date();
    const payment: PaymentRecord = {
      id: randomUUID(),
      orderId,
      provider: 'fedapay',
      providerRef: null,
      amountFcfa,
      state: 'CREATED',
      confirmedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.payments.set(payment.id, payment);
    return payment;
  }

  async markPaymentAwaitingResult(paymentId: string, providerRef: string): Promise<'initiated' | 'illegal'> {
    const p = this.payments.get(paymentId);
    if (!p || p.state !== 'CREATED') return 'illegal';
    p.state = 'PENDING';
    p.providerRef = providerRef;
    const order = this.orders.get(p.orderId);
    if (order && order.state === 'CREATED') order.state = 'PAYMENT_PENDING';
    return 'initiated';
  }

  async getPaymentById(id: string): Promise<PaymentRecord | null> {
    return this.payments.get(id) ?? null;
  }

  async getLatestPaymentForOrder(orderId: string): Promise<PaymentRecord | null> {
    const payments = [...this.payments.values()]
      .filter((p) => p.orderId === orderId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return payments[0] ?? null;
  }

  async getOpenPaymentForOrder(orderId: string): Promise<PaymentRecord | null> {
    const open = [...this.payments.values()].filter(
      (p) => p.orderId === orderId && ['CREATED', 'INITIATED', 'PENDING'].includes(p.state),
    );
    return open[open.length - 1] ?? null;
  }

  async getPaymentByProviderRef(providerRef: string): Promise<PaymentRecord | null> {
    return [...this.payments.values()].find((p) => p.providerRef === providerRef) ?? null;
  }
  async getLatestPaymentByOrderId(orderId: string): Promise<{ id: string; state: string } | null> {
    const found = [...this.payments.values()]
      .filter((p) => p.orderId === orderId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))[0];
    return found ? { id: found.id, state: found.state } : null;
  }

  async insertPaymentEvent(entry: {
    paymentId: string | null;
    providerEventId: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<boolean> {
    if (this.paymentEvents.has(entry.providerEventId)) return false;
    this.paymentEvents.add(entry.providerEventId);
    return true;
  }

  async confirmPayment(paymentId: string): Promise<'confirmed' | 'illegal'> {
    const p = this.payments.get(paymentId);
    if (!p || p.state !== 'PENDING') return 'illegal';
    const order = this.orders.get(p.orderId);
    if (!order || order.state !== 'PAYMENT_PENDING') return 'illegal'; // tout ou rien
    p.state = 'CONFIRMED';
    p.confirmedAt = new Date();
    order.state = 'PAID';
    return 'confirmed';
  }

  async failPayment(
    paymentId: string,
    to: { payment: 'FAILED' | 'CANCELLED'; order: 'FAILED' | 'CANCELLED' },
  ): Promise<'failed' | 'illegal'> {
    const p = this.payments.get(paymentId);
    if (!p || p.state !== 'PENDING') return 'illegal';
    const order = this.orders.get(p.orderId);
    if (!order || order.state !== 'PAYMENT_PENDING') return 'illegal';
    p.state = to.payment;
    order.state = to.order;
    return 'failed';
  }

  audits: Array<{ actor: string; action: string; entity: string; entityId?: string | null; after?: Record<string, unknown>; at?: string }> = [];
  correctionRequests = new Map<string, AdminCorrectionRequest>();
  async logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
    after?: Record<string, unknown>;
  }): Promise<void> {
    this.audits.push(entry);
  }
  linked: Array<[string, string]> = [];
  async linkCustomerAuth(customerId: string, authUserId: string): Promise<void> {
    this.linked.push([customerId, authUserId]);
  }

  // IMP-20 — workers.
  async expireStaleOrders(olderThan: Date): Promise<{ orderIds: string[]; paymentsExpired: number }> {
    const orderIds: string[] = [];
    for (const o of this.orders.values()) {
      if (o.state === 'PAYMENT_PENDING' && o.createdAt.getTime() <= olderThan.getTime()) {
        o.state = 'EXPIRED';
        orderIds.push(o.id);
      }
    }
    let paymentsExpired = 0;
    for (const p of this.payments.values()) {
      if (p.state === 'PENDING' && orderIds.includes(p.orderId)) {
        p.state = 'EXPIRED';
        paymentsExpired += 1;
      }
    }
    return { orderIds, paymentsExpired };
  }
  async releaseStaleReservedTickets(olderThan: Date): Promise<string[]> {
    const ids: string[] = [];
    for (const [id, at] of this.reservedAt) {
      const t = this.tickets.get(id);
      if (t && t.dbState === 'RESERVED' && at.getTime() <= olderThan.getTime()) {
        t.dbState = 'AVAILABLE';
        ids.push(id);
        this.reservedAt.delete(id);
      }
    }
    return ids;
  }
  reservedAt = new Map<string, Date>();
  async getOpenPaymentsWithRefOlderThan(olderThan: Date): Promise<PaymentRecord[]> {
    return [...this.payments.values()].filter(
      (p) => (p.state === 'INITIATED' || p.state === 'PENDING') && p.providerRef != null && p.createdAt.getTime() <= olderThan.getTime(),
    );
  }
  reconciliationRuns: Array<Record<string, unknown>> = [];
  alertsRaised: Array<{ rule: string; severity: string; payload: Record<string, unknown> }> = [];
  violationFixtures = { soldWithoutOrder: 0, deliveredWithoutTicket: 0 };
  async getReconciliationSnapshot(): Promise<{ soldWithoutOrder: number; deliveredWithoutTicket: number; totalTickets: number; byState: Record<string, number> }> {
    const byState: Record<string, number> = {};
    for (const t of this.tickets.values()) byState[t.dbState] = (byState[t.dbState] ?? 0) + 1;
    return {
      soldWithoutOrder: this.violationFixtures.soldWithoutOrder,
      deliveredWithoutTicket: this.violationFixtures.deliveredWithoutTicket,
      totalTickets: this.tickets.size,
      byState,
    };
  }
  async insertReconciliationRun(run: { routerTotalExpected: number; routerTotalSeen: number | null; diff: Record<string, unknown>; status: 'OK' | 'MISMATCH' }): Promise<string> {
    const id = randomUUID();
    this.reconciliationRuns.push({ id, ...run });
    return id;
  }
  async raiseAlert(alert: { rule: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; payload: Record<string, unknown> }): Promise<string> {
    this.alertsRaised.push(alert);
    return randomUUID();
  }
  async getSchemaHealth(): Promise<{ present: number; missing: string[] }> {
    return { present: 15, missing: [] };
  }
  async listReconciliationRuns(limit = 20): Promise<Array<{
    id: string; startedAt: string; finishedAt: string | null; routerTotalExpected: number | null;
    routerTotalSeen: number | null; status: 'RUNNING' | 'OK' | 'MISMATCH'; diff: Record<string, unknown> | null;
  }>> {
    return [...this.reconciliationRuns].slice(-Math.max(1, limit)).reverse().map((r) => ({
      id: String(r['id'] ?? ''),
      startedAt: String(r['startedAt'] ?? new Date().toISOString()),
      finishedAt: r['finishedAt'] != null ? String(r['finishedAt']) : null,
      routerTotalExpected: r['routerTotalExpected'] != null ? Number(r['routerTotalExpected']) : null,
      routerTotalSeen: r['routerTotalSeen'] != null ? Number(r['routerTotalSeen']) : null,
      status: (r['status'] ?? 'RUNNING') as 'RUNNING' | 'OK' | 'MISMATCH',
      diff: (r['diff'] ?? null) as Record<string, unknown> | null,
    }));
  }
  async listOpenReconciliationAlerts(limit = 50): Promise<Array<{
    id: string; rule: string; severity: 'INFO' | 'WARNING' | 'CRITICAL'; createdAt: string; payload: Record<string, unknown>;
  }>> {
    return this.alertsRaised
      .filter((a) => a.rule === 'router_readonly_mismatch' || a.rule === 'sync_blocked')
      .slice(-Math.max(1, limit)).reverse()
      .map((a) => ({
        id: randomUUID(),
        rule: a.rule,
        severity: a.severity as 'INFO' | 'WARNING' | 'CRITICAL',
        createdAt: new Date().toISOString(),
        payload: a.payload,
      }));
  }

  async expireOverdueTickets(now: Date): Promise<string[]> {
    const out: string[] = [];
    for (const t of this.tickets.values()) {
      if (t.dbState === 'SOLD' && t.activationDeadline != null && t.activationDeadline.getTime() <= now.getTime()) {
        t.dbState = 'EXPIRED';
        out.push(t.id);
      }
    }
    return out;
  }

  // IMP-18 — génération de lots digitaux en mémoire.
  backendBatchSeq = FIRST_BACKEND_BATCH_SEQ;
  createdBatches: CreatedBackendBatch[] = [];
  /** IMP-21 — file mikrotik_sync en mémoire (état complet, comme en base). */
  syncOps: SyncOpRecord[] = [];
  async createBackendBatch(input: {
    offerId: string;
    quantity: number;
    vaultKey?: Buffer;
  }): Promise<CreatedBackendBatch> {
    const plan = await this.getActivePlanByOffer(input.offerId);
    if (!plan) throw new Error(`offre sans plan actif : ${input.offerId}`);
    const seq = this.backendBatchSeq;
    this.backendBatchSeq += 1;
    const specs = generateTicketSpecs({ seq, quantity: input.quantity });
    const batch: CreatedBackendBatch = {
      batchId: randomUUID(), seq, offerId: input.offerId, quantity: input.quantity, generatedAt: new Date(), specs,
    };
    this.createdBatches.push(batch);
    this.registerBatch({
      id: batch.batchId, source: 'backend', destination: 'DIGITAL', offerId: batch.offerId,
      quantity: batch.quantity, generatedAt: batch.generatedAt,
      notes: `backend-gen seq ${batch.seq} (${batch.offerId}, IMP-18)`, manifestSha256: null, idempotencyKey: null,
    });
    // IMP-32 — parité inventaire : les tickets générés existent en mémoire
    // (empreinte + sceau si clé fournie), comme en base (createBackendBatch PG).
    for (const spec of specs) {
      this.tickets.set(spec.routerName, {
        id: spec.routerName,
        batchId: batch.batchId,
        // Parité createOrder : l'allocation joint tickets.plan_id = orders.plan_id,
        // qui est le plan getOrCreatePlanId(offer) (pas l'UUID « plan-N » des plans actifs).
        planId: this.getOrCreatePlanId(input.offerId),
        dbState: 'AVAILABLE',
        routerState: 'UNUSED',
        orderId: null,
        codePrefixHint: spec.clientCode.slice(0, 2),
        soldAt: null,
        mikrotikComment: spec.mikrotikComment,
        activationDeadline: null,
        codeHash: createHash('sha256').update(spec.clientCode).digest('hex'),
        codeCipher: input.vaultKey ? sealCode(input.vaultKey, spec.clientCode) : null,
        reservedAt: null,
        createdAt: batch.generatedAt,
      });
    }
    for (const spec of specs) {
      this.syncOps.push({
        id: randomUUID(),
        operation: 'create_ticket',
        payload: {
          batch_seq: seq, name: spec.routerName, password: spec.clientCode,
          profile: plan.mikrotikProfile, limit_uptime: plan.limitUptime, comment: spec.mikrotikComment,
        },
        state: 'PENDING',
        attempts: 0,
        nextRetryAt: null,
        lockedBy: null,
        result: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
    return batch;
  }

  /** IMP-26 UX6 — révélation client (parité PgRepo) ; les codes importés/portés par
   * les fixtures ont un sceau => révélables, les fixtures seedTicket non. */
  async getTicketForReveal(ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    orderId: string | null;
  } | null> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;
    return {
      id: ticket.id,
      dbState: ticket.dbState,
      codeCipher: ticket.codeCipher ?? null,
      orderId: ticket.orderId,
    };
  }

  // IMP-21 — claim / résolution / requeue de la file (miroir mémoire du PgRepo).
  async claimSyncOp(workerId: string, now: Date): Promise<SyncOpRecord | null> {
    const candidates = this.syncOps.filter(
      (op) => op.state === 'PENDING' || (op.state === 'RETRY' && op.nextRetryAt != null && op.nextRetryAt.getTime() <= now.getTime()),
    );
    candidates.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const op = candidates[0];
    if (!op) return null;
    op.state = 'PROCESSING';
    op.lockedBy = workerId;
    op.attempts += 1;
    op.updatedAt = new Date();
    return op;
  }
  async getSyncOpById(id: string): Promise<SyncOpRecord | null> {
    return this.syncOps.find((op) => op.id === id) ?? null;
  }
  async resolveSyncOp(
    id: string,
    outcome:
      | { kind: 'success'; result?: Record<string, unknown> }
      | { kind: 'failure'; error: { code: string; message: string }; nextRetryAt: Date | null },
    _now: Date,
  ): Promise<SyncResolveOutcome> {
    const op = this.syncOps.find((o) => o.id === id);
    if (!op || op.state !== 'PROCESSING') return { state: 'illegal', attempts: op?.attempts ?? 0 };
    if (outcome.kind === 'success') {
      op.state = 'SUCCESS';
      op.result = outcome.result ?? {};
      op.lockedBy = null;
      op.updatedAt = new Date();
      return { state: 'SUCCESS', attempts: op.attempts };
    }
    op.state = outcome.nextRetryAt == null ? 'BLOCKED' : 'RETRY';
    op.result = { error: outcome.error };
    op.nextRetryAt = outcome.nextRetryAt;
    op.lockedBy = null;
    op.updatedAt = new Date();
    if (op.state === 'BLOCKED') {
      // IMP-33 — sync bloquée → incident MIKROTIK_SYNC_ERROR (parité PgRepo, doc 09 §117-D).
      await this.createIncident({
        type: 'MIKROTIK_SYNC_ERROR',
        severity: 'HIGH',
        detectionKey: `sync-blocked:${op.id}`,
        error: `Opération de synchronisation bloquée : ${outcome.error.code} — ${outcome.error.message}`,
        recommendedAction: 'Vérifier le Connector (réseau, credentials routeur) puis action « Retry / Resync » (requeue uniquement).',
      });
    }
    return { state: op.state, attempts: op.attempts };
  }
  /** IMP-22 — empreintes legacy injectables par les tests (le fake n'a pas de lots Mikmon). */
  legacyCodeHashes: string[] = [];
  async getConnectorExpectedInventory(): Promise<{
    digitalVouchers: Array<{ name: string; profile: string; comment: string }>;
    legacyCodeHashes: string[];
  }> {
    return {
      digitalVouchers: this.syncOps
        .filter((op) => op.operation === 'create_ticket' && op.state === 'SUCCESS')
        .map((op) => ({
          name: String(op.payload['name'] ?? ''),
          profile: String(op.payload['profile'] ?? ''),
          comment: String(op.payload['comment'] ?? ''),
        })),
      legacyCodeHashes: [...this.legacyCodeHashes],
    };
  }
  async purgeSyncPayloadSecret(id: string): Promise<void> {
    const op = this.syncOps.find((o) => o.id === id);
    if (op) delete op.payload['password'];
  }
  async requeueStuckSyncOps(stuckSince: Date, now: Date): Promise<string[]> {
    const ids: string[] = [];
    for (const op of this.syncOps) {
      if (op.state === 'PROCESSING' && op.updatedAt.getTime() <= stuckSince.getTime()) {
        op.state = 'RETRY';
        op.result = { error: { code: 'stuck_lock', message: 'verrou perdu, requeue automatique' } };
        op.nextRetryAt = now;
        op.lockedBy = null;
        op.updatedAt = new Date();
        ids.push(op.id);
      }
    }
    return ids;
  }

  // IMP-17 — stats admin pilotables par les tests unitaires (doc 09 §12-13).
  dashboardStats: AdminDashboardDbStats = {
    ordersCountToday: 0,
    salesCountToday: 0,
    paymentsConfirmedToday: 0,
    revenueTodayFcfa: 0,
    ticketsDeliveredToday: 0,
    salesByOffer: [],
    ticketsByState: {},
    availableByOffer: {},
    incidentsOpen: 0,
    syncPending: 0,
    syncFailed: 0,
    syncSuccess: 0,
    syncLastAt: null,
    syncLastState: null,
    syncLastError: null,
    recentActivity: [],
    connector: null,
  };
  async getAdminDashboardStats(_since: Date): Promise<AdminDashboardDbStats> {
    return this.dashboardStats;
  }
  connectorHeartbeat: ConnectorHeartbeat | null = null;
  async recordConnectorHeartbeat(input: {
    connectorId: string;
    version?: string;
    routerModel?: string;
    routerosVersion?: string;
  }): Promise<void> {
    this.connectorHeartbeat = {
      connectorId: input.connectorId,
      version: input.version ?? null,
      routerModel: input.routerModel ?? null,
      routerosVersion: input.routerosVersion ?? null,
      lastSeenAt: new Date().toISOString(),
    };
    this.dashboardStats.connector = this.connectorHeartbeat;
  }
  async getConnectorHeartbeat(): Promise<ConnectorHeartbeat | null> {
    return this.connectorHeartbeat;
  }
  ticketsStatsByOffer: Array<{ offerId: string; priceFcfa: number; states: Record<string, number> }> = [];
  async getTicketsStatsByOffer(): Promise<Array<{ offerId: string; priceFcfa: number; states: Record<string, number> }>> {
    return this.ticketsStatsByOffer;
  }
  alerts = new Map<string, { id: string; rule: string; severity: string; acknowledgedAt: Date | null }>();
  async acknowledgeAlert(id: string): Promise<AlertAckRecord | null> {
    const a = this.alerts.get(id);
    if (!a) return null;
    if (a.acknowledgedAt != null) {
      return { id: a.id, rule: a.rule, severity: a.severity, acknowledgedAt: a.acknowledgedAt, alreadyAcknowledged: true };
    }
    a.acknowledgedAt = new Date();
    return { id: a.id, rule: a.rule, severity: a.severity, acknowledgedAt: a.acknowledgedAt, alreadyAcknowledged: false };
  }

  private pageAdmin<T>(items: T[], options: AdminListOptions): AdminPage<T> {
    return {
      items: items.slice(options.offset, options.offset + options.limit),
      total: items.length,
      limit: options.limit,
      offset: options.offset,
    };
  }

  private adminMatches(search: string, values: Array<string | null>): boolean {
    const q = search.trim().toLowerCase();
    return q === '' || values.some((value) => value?.toLowerCase().includes(q) === true);
  }

  async listAdminOrders(options: AdminListOptions): Promise<AdminPage<AdminOrderSummary>> {
    const rows: AdminOrderSummary[] = [];
    for (const order of this.orders.values()) {
      const customer = await this.getCustomerById(order.customerId);
      const payment = [...this.payments.values()].filter((p) => p.orderId === order.id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
      const ticket = [...this.tickets.values()].find((t) => t.orderId === order.id);
      const row: AdminOrderSummary = {
        id: order.id,
        phone: customer?.phone ?? '',
        state: order.state,
        offerId: String(order.planSnapshot['offer_id'] ?? ''),
        priceFcfa: Number(order.planSnapshot['price_snapshot'] ?? 0),
        paymentState: payment?.state ?? null,
        ticketState: ticket?.dbState ?? null,
        createdAt: order.createdAt.toISOString(),
        updatedAt: order.updatedAt.toISOString(),
      };
      if ((options.state ?? '') !== '' && row.state !== options.state) continue;
      if ((options.offerId ?? '') !== '' && row.offerId !== options.offerId) continue;
      if ((options.paymentState ?? '') !== '' && row.paymentState !== options.paymentState) continue;
      if ((options.ticketState ?? '') !== '' && row.ticketState !== options.ticketState) continue;
      if (options.from && new Date(row.createdAt) < options.from) continue;
      if (options.to && new Date(row.createdAt) >= options.to) continue;
      if (!this.adminMatches(options.search ?? '', [row.id, row.phone, row.offerId])) continue;
      rows.push(row);
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.pageAdmin(rows, options);
  }

  async getAdminOrderById(id: string): Promise<AdminOrderDetail | null> {
    const page = await this.listAdminOrders({ limit: 100, offset: 0, search: id });
    const summary = page.items.find((item) => item.id === id);
    if (!summary) return null;
    const paymentRecord = [...this.payments.values()].filter((payment) => payment.orderId === id).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const ticketRecord = [...this.tickets.values()].find((ticket) => ticket.orderId === id);
    const order = this.orders.get(id);
    const plan = order ? this.plans.find((candidate) => candidate.planId === order.planId) : undefined;
    const payment = paymentRecord ? {
      id: paymentRecord.id, orderId: id, phone: summary.phone, provider: paymentRecord.provider,
      providerRef: paymentRecord.providerRef, amountFcfa: paymentRecord.amountFcfa, state: paymentRecord.state,
      confirmedAt: paymentRecord.confirmedAt?.toISOString() ?? null, createdAt: paymentRecord.createdAt.toISOString(),
    } satisfies AdminPaymentSummary : null;
    const detailBatch = ticketRecord ? this.adminBatches.get(ticketRecord.batchId) : undefined;
    const ticket = ticketRecord ? {
      id: ticketRecord.id, batchId: ticketRecord.batchId, offerId: plan?.offerId ?? '',
      source: detailBatch?.source ?? 'backend', destination: detailBatch?.destination ?? 'DIGITAL',
      dbState: ticketRecord.dbState, routerState: ticketRecord.routerState, orderId: ticketRecord.orderId,
      codePrefixHint: ticketRecord.codePrefixHint,
      revealable: ticketRecord.codeCipher != null,
      soldAt: ticketRecord.soldAt?.toISOString() ?? null,
      reservedAt: ticketRecord.reservedAt?.toISOString() ?? null,
      createdAt: (ticketRecord.createdAt ?? new Date()).toISOString(),
      mikrotikComment: ticketRecord.mikrotikComment,
      activationDeadline: ticketRecord.activationDeadline?.toISOString() ?? null,
    } satisfies AdminTicketSummary : null;
    return { ...summary, payment, ticket, timeline: await this.getAdminOrderTimeline(id) };
  }

  async getAdminOrderTimeline(id: string): Promise<AdminOrderTimelineEvent[]> {
    const order = this.orders.get(id);
    if (!order) return [];
    const events: AdminOrderTimelineEvent[] = [{
      id: `order:${id}:created`, entity: 'orders', entityId: id, action: 'order_created',
      fromState: null, toState: 'CREATED', actor: 'system', at: order.createdAt.toISOString(),
    }];
    const payment = [...this.payments.values()].filter((candidate) => candidate.orderId === id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
    if (payment && payment.state !== 'CREATED') {
      events.push({ id: `payment:${payment.id}:initiated`, entity: 'payments', entityId: payment.id,
        action: 'payment_initiated', fromState: null, toState: 'INITIATED', actor: 'system', at: payment.createdAt.toISOString() });
      if (payment.state === 'CONFIRMED' || payment.state === 'FAILED') {
        events.push({ id: `payment:${payment.id}:${payment.state.toLowerCase()}`, entity: 'payments', entityId: payment.id,
          action: payment.state === 'CONFIRMED' ? 'payment_confirmed' : 'payment_failed', fromState: null, toState: payment.state,
          actor: 'system', at: (payment.confirmedAt ?? payment.updatedAt).toISOString() });
      }
    }
    const ticket = [...this.tickets.values()].find((candidate) => candidate.orderId === id);
    if (ticket?.soldAt) {
      events.push({ id: `ticket:${ticket.id}:assigned`, entity: 'tickets', entityId: ticket.id,
        action: 'ticket_assigned', fromState: null, toState: 'SOLD', actor: 'system', at: ticket.soldAt.toISOString() });
      if (order.state === 'DELIVERED') {
        events.push({ id: `order:${id}:delivered`, entity: 'orders', entityId: id,
          action: 'ticket_delivered', fromState: 'TICKET_ALLOCATED', toState: 'DELIVERED', actor: 'system', at: order.updatedAt.toISOString() });
      }
      if (ticket.dbState === 'USED') {
        events.push({ id: `ticket:${ticket.id}:used`, entity: 'tickets', entityId: ticket.id,
          action: 'ticket_used', fromState: 'SOLD', toState: 'USED', actor: 'connector', at: ticket.soldAt.toISOString() });
      }
    }
    const relatedAudits = this.audits.filter((audit) =>
      audit.entityId === id || audit.entity === 'payments' && payment?.id === audit.entityId || audit.entity === 'tickets' && ticket?.id === audit.entityId,
    );
    relatedAudits.forEach((audit, index) => events.push({
      id: `audit:${index + 1}`, entity: audit.entity, entityId: audit.entityId ?? '', action: audit.action,
      fromState: null, toState: null, actor: audit.actor, at: new Date(Date.now() - index).toISOString(),
    }));
    return events.sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  }

  async createAdminCorrectionRequest(input: {
    orderId: string;
    requestedAction: AdminCorrectionRequest['requestedAction'];
    reason: string;
    requestedBy: string;
    idempotencyKey: string;
  }): Promise<{ request: AdminCorrectionRequest; created: boolean } | null> {
    if (!this.orders.has(input.orderId)) return null;
    const key = `${input.orderId}:${input.idempotencyKey}`;
    const existing = this.correctionRequests.get(key);
    if (existing) return { request: existing, created: false };
    const request: AdminCorrectionRequest = {
      id: randomUUID(), orderId: input.orderId, requestedAction: input.requestedAction, reason: input.reason,
      requestedBy: input.requestedBy, state: 'OPEN', idempotencyKey: input.idempotencyKey, createdAt: new Date().toISOString(),
    };
    this.correctionRequests.set(key, request);
    return { request, created: true };
  }

  async listAdminPayments(options: AdminListOptions): Promise<AdminPage<AdminPaymentSummary>> {
    const rows: AdminPaymentSummary[] = [];
    for (const payment of this.payments.values()) {
      const order = this.orders.get(payment.orderId);
      const customer = order ? await this.getCustomerById(order.customerId) : null;
      const row: AdminPaymentSummary = {
        id: payment.id, orderId: payment.orderId, phone: customer?.phone ?? '', provider: payment.provider,
        providerRef: payment.providerRef, amountFcfa: payment.amountFcfa, state: payment.state,
        confirmedAt: payment.confirmedAt?.toISOString() ?? null, createdAt: payment.createdAt.toISOString(),
      };
      if ((options.state ?? '') !== '' && row.state !== options.state) continue;
      if ((options.offerId ?? '') !== '') {
        const orderForFilter = this.orders.get(row.orderId);
        const offerIdForFilter = orderForFilter ? String(orderForFilter.planSnapshot['offer_id'] ?? '') : '';
        if (offerIdForFilter !== options.offerId) continue;
      }
      if (options.from && new Date(row.createdAt) < options.from) continue;
      if (options.to && new Date(row.createdAt) >= options.to) continue;
      if (!this.adminMatches(options.search ?? '', [row.id, row.orderId, row.phone, row.providerRef])) continue;
      rows.push(row);
    }
    rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return this.pageAdmin(rows, options);
  }

  async listAdminTickets(options: AdminListOptions): Promise<AdminPage<AdminTicketSummary>> {
    const rows: AdminTicketSummary[] = [];
    for (const ticket of this.tickets.values()) {
      const batch = this.adminBatches.get(ticket.batchId);
      const row: AdminTicketSummary = {
        id: ticket.id, batchId: ticket.batchId, offerId: this.ticketOfferId(ticket),
        source: batch?.source ?? 'backend', destination: batch?.destination ?? 'DIGITAL',
        dbState: ticket.dbState, routerState: ticket.routerState, orderId: ticket.orderId,
        codePrefixHint: ticket.codePrefixHint,
        revealable: ticket.codeCipher != null,
        soldAt: ticket.soldAt?.toISOString() ?? null,
        reservedAt: ticket.reservedAt?.toISOString() ?? null,
        createdAt: (ticket.createdAt ?? new Date()).toISOString(),
        mikrotikComment: ticket.mikrotikComment,
        activationDeadline: ticket.activationDeadline?.toISOString() ?? null,
      };
      if ((options.state ?? '') !== '' && row.dbState !== options.state) continue;
      if ((options.offerId ?? '') !== '' && row.offerId !== options.offerId) continue;
      if ((options.destination ?? '') !== '' && row.destination !== options.destination) continue;
      const createdAt = new Date(row.createdAt ?? new Date(0).toISOString());
      if (options.from && createdAt < options.from) continue;
      if (options.to && createdAt >= options.to) continue;
      if (!this.adminMatches(options.search ?? '', [row.id, row.batchId, row.offerId])) continue;
      rows.push(row);
    }
    rows.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    return this.pageAdmin(rows, options);
  }

  async listAdminBatches(options: AdminListOptions): Promise<AdminPage<AdminBatchSummary>> {
    const staleBefore = Date.now() - DEFAULT_RESERVED_TTL_MS; // TTL D11 (workers)
    const rows: AdminBatchSummary[] = [...this.adminBatches.values()].map((batch) => {
      const tickets = [...this.tickets.values()].filter((t) => t.batchId === batch.id);
      const countBy = (predicate: (t: TicketRecord) => boolean) => tickets.filter(predicate).length;
      const reserved = tickets.filter((t) => t.dbState === 'RESERVED');
      return {
        id: batch.id, source: batch.source, quantity: batch.quantity, destination: batch.destination,
        offerId: batch.offerId,
        generatedAt: batch.generatedAt.toISOString(), createdAt: batch.generatedAt.toISOString(),
        notes: batch.notes, manifestSha256: batch.manifestSha256,
        availableCount: countBy((t) => t.dbState === 'AVAILABLE' || t.dbState === 'RELEASED'),
        reservedCount: reserved.length,
        reservedStaleCount: reserved.filter((t) => t.reservedAt != null && t.reservedAt.getTime() <= staleBefore).length,
        soldCount: countBy((t) => t.dbState === 'SOLD'),
        usedCount: countBy((t) => t.dbState === 'USED'),
        expiredCount: countBy((t) => t.dbState === 'EXPIRED'),
        releasedCount: countBy((t) => t.dbState === 'RELEASED'),
        ticketsCount: tickets.length,
      } satisfies AdminBatchSummary;
    });
    const filtered = rows.filter((row) =>
      ((options.state ?? '') === '' || row.source === options.state) &&
      ((options.destination ?? '') === '' || row.destination === options.destination) &&
      (!options.from || new Date(row.createdAt) >= options.from) &&
      (!options.to || new Date(row.createdAt) < options.to) &&
      this.adminMatches(options.search ?? '', [row.id, row.notes ?? '']),
    );
    filtered.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return this.pageAdmin(filtered, options);
  }

  /** IMP-32 — prévisualisation d'import (parité PgRepo, lecture seule). */
  async previewTicketImport(input: TicketImportInput): Promise<TicketImportPreview> {
    const plan = await this.getActivePlanByOffer(input.offerId);
    const seen = new Set<string>();
    let rows: Array<{ line: number; codeHint: string; valid: boolean; reason: string | null }> =
      input.codes.map((code, i) => {
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
    const existingHashes = new Set(
      [...this.tickets.values()].map((t) => t.codeHash).filter((h): h is string => h != null),
    );
    if (existingHashes.size > 0) {
      rows = rows.map((row) => {
        if (!row.valid) return row;
        const code = input.codes[row.line - 1];
        if (!code) return row;
        const hash = createHash('sha256').update(code).digest('hex');
        return existingHashes.has(hash)
          ? { ...row, valid: false, reason: 'déjà présent dans l’inventaire' }
          : row;
      });
    }
    if (!plan) {
      rows = rows.map((row) => (row.valid ? { ...row, valid: false, reason: 'offre sans plan actif' } : row));
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

  /** IMP-32 — import transactionnel mémoire (parité PgRepo : tout-ou-rien + idempotence). */
  async executeTicketImport(input: TicketImportInput, opts: {
    vaultKey: Buffer;
    idempotencyKey: string;
  }): Promise<TicketImportResult> {
    const existingId = this.importIdempotency.get(opts.idempotencyKey);
    const existing = existingId ? this.adminBatches.get(existingId) : undefined;
    if (existing) {
      return {
        created: false,
        batchId: existing.id,
        offerId: input.offerId,
        destination: input.destination,
        imported: existing.quantity,
        rejected: 0,
        importPerformed: true,
        message: 'Rejeu idempotent : ce lot a déjà été importé, rien n’a été réécrit.',
      };
    }
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
    const batchId = randomUUID();
    this.registerBatch({
      id: batchId, source: 'mikmon-manual', destination: input.destination, offerId: input.offerId,
      quantity: input.codes.length, generatedAt: new Date(), notes: input.notes ?? null,
      manifestSha256: input.manifestSha256 ?? null, idempotencyKey: opts.idempotencyKey,
    });
    for (const code of input.codes) {
      const ticket: TicketRecord = {
        id: randomUUID(),
        batchId,
        planId: plan.planId,
        dbState: 'AVAILABLE',
        routerState: 'UNUSED',
        orderId: null,
        codePrefixHint: code.slice(0, 2),
        soldAt: null,
        mikrotikComment: null,
        activationDeadline: null,
        codeHash: createHash('sha256').update(code).digest('hex'),
        codeCipher: sealCode(opts.vaultKey, code),
        reservedAt: null,
        createdAt: new Date(),
      };
      this.tickets.set(ticket.id, ticket);
    }
    return {
      created: true,
      batchId,
      offerId: input.offerId,
      destination: input.destination,
      imported: input.codes.length,
      rejected: 0,
      importPerformed: true,
      message: `Import transactionnel effectué : ${input.codes.length} tickets (${input.destination}, ${input.offerId}).`,
    };
  }

  /** IMP-32 — ticket + destination du lot pour la révélation admin contrôlée. */
  async getAdminTicketForReveal(ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    batchDestination: string;
  } | null> {
    const ticket = this.tickets.get(ticketId);
    if (!ticket) return null;
    return {
      id: ticket.id,
      dbState: ticket.dbState,
      codeCipher: ticket.codeCipher ?? null,
      batchDestination: this.adminBatches.get(ticket.batchId)?.destination ?? 'DIGITAL',
    };
  }

  /** IMP-32 — inventaire par offre × destination (parité PgRepo). */
  async getTicketInventoryBreakdown(): Promise<Array<{
    offerId: string;
    destination: string;
    states: Record<string, number>;
    reservedStale: number;
  }>> {
    const staleBefore = Date.now() - DEFAULT_RESERVED_TTL_MS; // TTL D11 (workers)
    const entries = new Map<string, {
      offerId: string;
      destination: string;
      states: Record<string, number>;
      reservedStale: number;
    }>();
    for (const ticket of this.tickets.values()) {
      const destination = this.adminBatches.get(ticket.batchId)?.destination ?? 'DIGITAL';
      const offerId = this.ticketOfferId(ticket);
      const key = `${offerId}:${destination}`;
      let entry = entries.get(key);
      if (!entry) {
        entry = { offerId, destination, states: {}, reservedStale: 0 };
        entries.set(key, entry);
      }
      entry.states[ticket.dbState] = (entry.states[ticket.dbState] ?? 0) + 1;
      if (ticket.dbState === 'RESERVED' && ticket.reservedAt != null && ticket.reservedAt.getTime() <= staleBefore) {
        entry.reservedStale += 1;
      }
    }
    return [...entries.values()];
  }

  /** IMP-32 — réconciliation avec le manifeste IMP-06 (parité PgRepo). */
  async getTicketReconciliation(): Promise<TicketReconciliation> {
    const byOffer = new Map<string, number>();
    let actualTotal = 0;
    for (const ticket of this.tickets.values()) {
      const batch = this.adminBatches.get(ticket.batchId);
      if (batch?.source !== 'mikmon-manual') continue;
      if (batch.offerId == null) continue;
      byOffer.set(batch.offerId, (byOffer.get(batch.offerId) ?? 0) + 1);
      actualTotal += 1;
    }
    const rows = STOCK_MANIFEST_IMP06.batches.map((batch) => {
      const n = byOffer.get(batch.offerId) ?? 0;
      return {
        batchNote: batch.note,
        offerId: batch.offerId,
        expected: batch.quantity,
        actual: n,
        status: n === 0 ? 'MISSING' : n === batch.quantity ? 'OK' : 'DIVERGENT',
      } as const;
    });
    return {
      manifestId: STOCK_MANIFEST_IMP06.id,
      generatedAt: STOCK_MANIFEST_IMP06.generatedAt,
      expectedTotal: STOCK_MANIFEST_IMP06.totalQuantity,
      actualTotal,
      ok: rows.every((r) => r.status === 'OK'),
      rows,
    };
  }

  async listAdminAuditLogs(options: AdminListOptions): Promise<AdminPage<AdminAuditSummary>> {
    const rows: AdminAuditSummary[] = this.audits.map((audit, index) => ({
      id: `fake-audit-${index + 1}`, actor: audit.actor, action: audit.action, entity: audit.entity,
      entityId: audit.entityId ?? null, at: new Date(Date.now() - index).toISOString(),
    }));
    const filtered = rows.filter((row) =>
      (!options.from || new Date(row.at) >= options.from) &&
      (!options.to || new Date(row.at) < options.to) &&
      this.adminMatches(options.search ?? '', [row.actor, row.action, row.entity, row.entityId]),
    );
    return this.pageAdmin(filtered, options);
  }

  // ─── IMP-33 — incidents & récupération (parité avec le PgRepo) ───

  adminIncidents: FakeIncident[] = [];

  private incidentFromRow(r: FakeIncident): AdminIncidentSummary {
    return {
      id: r.id, type: r.type, severity: r.severity, state: r.state, details: r.details,
      orderId: r.orderId, paymentId: r.paymentId, ticketId: r.ticketId, connectorId: r.connectorId,
      error: r.error, recommendedAction: r.recommendedAction, attempts: r.attempts,
      lastAttemptAt: r.lastAttemptAt, acknowledgedAt: r.acknowledgedAt,
      openedAt: r.openedAt, closedAt: r.closedAt, createdAt: r.createdAt,
    };
  }
  private incidentAudit(entityId: string, action: string, actor: string, after: Record<string, unknown>): void {
    this.audits.push({ actor, action, entity: 'incidents', entityId, after, at: new Date().toISOString() });
  }
  private async transitionIncident(
    inc: FakeIncident,
    actor: string,
    reason: string,
    toState: FakeIncident['state'],
    fromStates: FakeIncident['state'][],
    opts: { setAck?: boolean; setClose?: boolean; bumpReopen?: boolean } = {},
  ): Promise<void> {
    const now = new Date().toISOString();
    inc.state = toState;
    if (opts.setAck && inc.acknowledgedAt == null) inc.acknowledgedAt = now;
    if (opts.setAck) inc.acknowledgedBy = actor;
    if (opts.setClose) {
      inc.closedAt = now;
      inc.closeReason = reason;
    }
    if (opts.bumpReopen) inc.reopenedCount += 1;
    this.incidentAudit(inc.id, 'incident_transition', actor, { to: toState, reason });
  }

  async createIncident(input: CreateIncidentInput): Promise<AdminIncidentSummary> {
    if (input.detectionKey) {
      const existing = this.adminIncidents.find((r) => r.detectionKey === input.detectionKey);
      if (existing) return this.incidentFromRow(existing);
    }
    const now = new Date().toISOString();
    const inc: FakeIncident = {
      id: randomUUID(),
      type: input.type,
      severity: input.severity,
      state: 'OPEN',
      details: {
        code: input.detectionKey ? 'auto' : 'manual',
        message: input.error ?? '',
        source: input.detectionKey ? 'detection' : 'admin',
      },
      detectionKey: input.detectionKey ?? null,
      orderId: input.orderId ?? null,
      paymentId: input.paymentId ?? null,
      ticketId: input.ticketId ?? null,
      connectorId: input.connectorId ?? null,
      error: input.error ?? null,
      recommendedAction: input.recommendedAction ?? null,
      acknowledgedAt: null,
      acknowledgedBy: null,
      lastAttemptAt: null,
      attempts: 0,
      reopenedCount: 0,
      closeReason: null,
      lastRetryKey: null,
      openedAt: now,
      closedAt: null,
      createdAt: now,
      history: [],
    };
    this.adminIncidents.unshift(inc);
    const actor = input.actor ?? 'system';
    this.incidentAudit(inc.id, 'incident_created', actor, {
      type: input.type, severity: input.severity, orderId: input.orderId ?? null,
    });
    return this.incidentFromRow(inc);
  }

  async getAdminIncident(id: string): Promise<AdminIncidentDetail | null> {
    const inc = this.adminIncidents.find((r) => r.id === id);
    if (!inc) return null;
    const order = inc.orderId ? this.orders.get(inc.orderId) : undefined;
    const payment = inc.paymentId ? this.payments.get(inc.paymentId) : undefined;
    const ticket = inc.ticketId ? this.tickets.get(inc.ticketId) : undefined;
    const customer = order ? this.getCustomerById(order.customerId) : null;
    // planIds : Map<offerId, planId> (getOrCreatePlanId) — résolution inverse.
    const offerId = order ? [...this.planIds.entries()].find(([, pid]) => pid === order.planId)?.[0] : undefined;
    // Historique = audits de l'incident (parité PG : audit_logs est la source).
    const history = this.audits
      .filter((a) => a.entity === 'incidents' && a.entityId === inc.id)
      .map((a, index) => ({
        id: `fake-incident-audit-${index + 1}`,
        action: a.action,
        actor: a.actor,
        at: a.at ?? new Date().toISOString(),
        after: a.after ?? null,
      }));
    return {
      ...this.incidentFromRow(inc),
      orderPhone: (await customer)?.phone ?? null,
      orderOfferId: offerId ?? null,
      orderState: order?.state ?? null,
      paymentState: payment?.state ?? null,
      ticketState: ticket?.dbState ?? null,
      acknowledgedBy: inc.acknowledgedBy,
      closeReason: inc.closeReason,
      reopenedCount: inc.reopenedCount,
      history,
    };
  }

  private async runFakeIncidentTransition(
    id: string,
    actor: string,
    reason: string,
    toState: FakeIncident['state'],
    fromStates: FakeIncident['state'][],
    opts: { setAck?: boolean; setClose?: boolean; bumpReopen?: boolean } = {},
  ): Promise<AdminIncidentSummary | null> {
    const inc = this.adminIncidents.find((r) => r.id === id);
    if (!inc) return null;
    if (inc.state === toState) return this.incidentFromRow(inc);
    if (!fromStates.includes(inc.state)) return null;
    await this.transitionIncident(inc, actor, reason, toState, fromStates, opts);
    return this.incidentFromRow(inc);
  }

  async acknowledgeIncident(id: string, actor: string, reason: string): Promise<AdminIncidentSummary | null> {
    return this.runFakeIncidentTransition(id, actor, reason, 'ACKNOWLEDGED', ['OPEN', 'REOPENED'], { setAck: true });
  }

  async investigateIncident(id: string, actor: string, reason: string): Promise<AdminIncidentSummary | null> {
    return this.runFakeIncidentTransition(id, actor, reason, 'INVESTIGATING', ['OPEN', 'ACKNOWLEDGED', 'REOPENED']);
  }

  async resolveIncident(id: string, actor: string, reason: string): Promise<AdminIncidentSummary | null> {
    return this.runFakeIncidentTransition(
      id, actor, reason, 'RESOLVED',
      ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'REOPENED'],
      { setClose: true },
    );
  }

  async reopenIncident(id: string, actor: string, reason: string): Promise<AdminIncidentSummary | null> {
    return this.runFakeIncidentTransition(id, actor, reason, 'REOPENED', ['RESOLVED', 'CLOSED'], { bumpReopen: true });
  }

  async retryIncident(
    id: string,
    actor: string,
    reason: string,
    idempotencyKey: string,
  ): Promise<{ summary: AdminIncidentSummary; retry: IncidentRetryOutcome }> {
    const inc = this.adminIncidents.find((r) => r.id === id);
    if (!inc) throw new Error('incident introuvable pour retry');
    const summary = () => this.incidentFromRow(inc);
    if (inc.lastRetryKey != null && inc.lastRetryKey === idempotencyKey) {
      return { summary: summary(), retry: { outcome: 'replayed', state: inc.state } };
    }
    if (inc.state === 'RESOLVED' || inc.state === 'CLOSED') {
      return { summary: summary(), retry: { outcome: 'not-retryable-state' } };
    }
    if (inc.type !== 'TICKET_ALLOCATION_ERROR' && inc.type !== 'MIKROTIK_SYNC_ERROR') {
      return { summary: summary(), retry: { outcome: 'not-applicable' } };
    }
    inc.lastRetryKey = idempotencyKey;
    inc.lastAttemptAt = new Date().toISOString();
    inc.attempts += 1;

    if (inc.type === 'MIKROTIK_SYNC_ERROR') {
      // Resync : requeue DB uniquement — aucune écriture routeur ici (invariant IMP-28).
      let requeued = 0;
      for (const op of this.syncOps) {
        if (op.state === 'FAILED' || op.state === 'BLOCKED') {
          op.state = 'PENDING';
          op.attempts = 0;
          op.nextRetryAt = null;
          op.lockedBy = null;
          op.updatedAt = new Date();
          requeued += 1;
        }
      }
      inc.state = 'RESOLVED';
      inc.closedAt = new Date().toISOString();
      inc.closeReason = reason;
      this.incidentAudit(inc.id, 'incident_retry', actor, { result: 'requeued', reason, requeuedOps: requeued, to: 'RESOLVED', idempotencyKey });
      return { summary: summary(), retry: { outcome: 'requeued', state: inc.state } };
    }

    // TICKET_ALLOCATION_ERROR : re-joue la machine d'allocation complète (idempotente).
    if (!inc.orderId) {
      this.incidentAudit(inc.id, 'incident_retry', actor, { result: 'illegal-order', reason, idempotencyKey });
      return { summary: summary(), retry: { outcome: 'illegal-order', state: inc.state } };
    }
    const outcome = await allocateAndDeliver(this, inc.orderId, {
      warn: (obj, msg) => console.warn('[incident-retry-fake]', msg, obj),
    });
    if (outcome.status === 'delivered' || outcome.status === 'already-delivered') {
      inc.state = 'RESOLVED';
      inc.closedAt = new Date().toISOString();
      inc.closeReason = reason;
      if (outcome.ticketId) inc.ticketId = outcome.ticketId;
      this.incidentAudit(inc.id, 'incident_retry', actor, { result: 'delivered', reason, ticketId: outcome.ticketId, to: 'RESOLVED', idempotencyKey });
      return { summary: summary(), retry: { outcome: 'delivered', state: inc.state } };
    }
    if (outcome.status === 'no-stock') {
      this.incidentAudit(inc.id, 'incident_retry', actor, { result: 'still-no-stock', reason, idempotencyKey });
      return { summary: summary(), retry: { outcome: 'still-no-stock', state: inc.state } };
    }
    this.incidentAudit(inc.id, 'incident_retry', actor, { result: 'illegal-order', reason, idempotencyKey });
    return { summary: summary(), retry: { outcome: 'illegal-order', state: inc.state } };
  }

  async runConnectorOfflineDetection(actor: string, now: Date): Promise<{ opened: number; resolved: number }> {
    const state = computeConnectorState(this.connectorHeartbeat, now);
    if (state === 'OFFLINE') {
      const exists = this.adminIncidents.some((r) => r.detectionKey === 'connector-offline');
      await this.createIncident({
        type: 'CONNECTOR_OFFLINE',
        severity: 'MEDIUM',
        detectionKey: 'connector-offline',
        connectorId: this.connectorHeartbeat?.connectorId ?? null,
        error: 'Absence de heartbeat du Connector (seuil 5 min)',
        recommendedAction: 'Vérifier le routeur et le service Connector (heartbeat toutes les 30 s)',
        actor,
      });
      return { opened: exists ? 0 : 1, resolved: 0 };
    }
    if (state === 'ONLINE' || state === 'UNKNOWN') {
      let resolved = 0;
      for (const inc of this.adminIncidents) {
        if (inc.type === 'CONNECTOR_OFFLINE' && inc.detectionKey === 'connector-offline'
          && (inc.state === 'OPEN' || inc.state === 'ACKNOWLEDGED' || inc.state === 'REOPENED')) {
          await this.transitionIncident(
            inc, actor, 'Connector de nouveau en ligne (détection)', 'RESOLVED',
            ['OPEN', 'ACKNOWLEDGED', 'REOPENED'], { setClose: true },
          );
          resolved += 1;
        }
      }
      return { opened: 0, resolved };
    }
    return { opened: 0, resolved: 0 };
  }

  async listAdminIncidents(options: AdminListOptions): Promise<AdminPage<AdminIncidentSummary>> {
    const filtered = this.adminIncidents
      .filter((row) =>
        ((options.state ?? '') === '' || row.state === options.state) &&
        (!options.from || new Date(row.openedAt) >= options.from) &&
        (!options.to || new Date(row.openedAt) < options.to) &&
        this.adminMatches(options.search ?? '', [row.id, row.type, row.severity, row.error]),
      )
      .map((row) => ({
        ...this.incidentFromRow(row),
        details: {
          code: typeof row.details['code'] === 'string' ? row.details['code'] : '',
          message: typeof row.details['message'] === 'string' ? row.details['message'] : '',
          source: typeof row.details['source'] === 'string' ? row.details['source'] : '',
        },
      }));
    return this.pageAdmin(filtered, options);
  }

  async close(): Promise<void> {}
}

