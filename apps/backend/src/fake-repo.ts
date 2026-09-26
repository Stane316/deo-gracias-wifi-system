/**
 * IMP-13 — Fake repo en mémoire partagé par les tests unitaires (app, auth).
 * Les tests d'intégration réels utilisent PgRepo (repo.pg.test.ts).
 */
import { OFFERS } from '@dg/shared';
import { randomUUID } from 'node:crypto';
import type { AdminDashboardDbStats, AlertAckRecord, ConnectorHeartbeat } from './admin.js';
import { FIRST_BACKEND_BATCH_SEQ, generateTicketSpecs } from './ticketgen.js';
import type { CreatedBackendBatch } from './repo.js';
import type {
  ActivePlan,
  AdminAuditSummary,
  AdminBatchSummary,
  AdminCorrectionRequest,
  AdminIncidentSummary,
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

  tickets = new Map<string, TicketRecord>();

  /** Fixture de test : ajoute un ticket AVAILABLE pour une offre. */
  seedTicket(offerId: string, prefix = 'TEST'): TicketRecord {
    const ticket: TicketRecord = {
      id: randomUUID(),
      batchId: randomUUID(),
      planId: this.getOrCreatePlanId(offerId),
      dbState: 'AVAILABLE',
      routerState: 'UNUSED',
      orderId: null,
      codePrefixHint: prefix,
      soldAt: null,
      mikrotikComment: null,
      activationDeadline: null,
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
    const candidate = [...this.tickets.values()].find(
      (t) => t.planId === order.planId && t.dbState === 'AVAILABLE',
    );
    if (!candidate) return { status: 'no-stock' };
    candidate.dbState = 'SOLD';
    candidate.orderId = orderId;
    candidate.soldAt = new Date();
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

  audits: Array<{ actor: string; action: string; entity: string; entityId?: string | null; after?: Record<string, unknown> }> = [];
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

  /** IMP-26 UX6 — pas de tickets individuels en mémoire : révélation testée sur base réelle (pg). */
  async getTicketForReveal(_ticketId: string): Promise<{
    id: string;
    dbState: string;
    codeCipher: string | null;
    orderId: string | null;
  } | null> {
    return null;
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
    return { state: outcome.nextRetryAt == null ? 'BLOCKED' : 'RETRY', attempts: op.attempts };
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
    const ticket = ticketRecord ? {
      id: ticketRecord.id, batchId: ticketRecord.batchId, offerId: plan?.offerId ?? '', source: 'backend',
      dbState: ticketRecord.dbState, routerState: ticketRecord.routerState, orderId: ticketRecord.orderId,
      codePrefixHint: ticketRecord.codePrefixHint, soldAt: ticketRecord.soldAt?.toISOString() ?? null,
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
      const plan = this.plans.find((p) => p.planId === ticket.planId);
      const row: AdminTicketSummary = {
        id: ticket.id, batchId: ticket.batchId, offerId: plan?.offerId ?? '', source: 'backend',
        dbState: ticket.dbState, routerState: ticket.routerState, orderId: ticket.orderId,
        codePrefixHint: ticket.codePrefixHint, soldAt: ticket.soldAt?.toISOString() ?? null,
        activationDeadline: ticket.activationDeadline?.toISOString() ?? null,
      };
      if ((options.state ?? '') !== '' && row.dbState !== options.state) continue;
      if ((options.offerId ?? '') !== '' && row.offerId !== options.offerId) continue;
      if (options.from && row.soldAt && new Date(row.soldAt) < options.from) continue;
      if (options.to && row.soldAt && new Date(row.soldAt) >= options.to) continue;
      if (!this.adminMatches(options.search ?? '', [row.id, row.batchId, row.offerId])) continue;
      rows.push(row);
    }
    return this.pageAdmin(rows, options);
  }

  async listAdminBatches(options: AdminListOptions): Promise<AdminPage<AdminBatchSummary>> {
    const rows = this.createdBatches.map((batch) => ({
      id: batch.batchId, source: 'backend', quantity: batch.quantity,
      generatedAt: batch.generatedAt.toISOString(), createdAt: batch.generatedAt.toISOString(),
      notes: `backend-gen seq ${batch.seq} (${batch.offerId}, IMP-18)`,
    } satisfies AdminBatchSummary));
    const filtered = rows.filter((row) =>
      ((options.state ?? '') === '' || row.source === options.state) &&
      (!options.from || new Date(row.createdAt) >= options.from) &&
      (!options.to || new Date(row.createdAt) < options.to) &&
      this.adminMatches(options.search ?? '', [row.id, row.notes]),
    );
    filtered.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return this.pageAdmin(filtered, options);
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

  adminIncidents: AdminIncidentSummary[] = [];
  async listAdminIncidents(options: AdminListOptions): Promise<AdminPage<AdminIncidentSummary>> {
    const filtered = this.adminIncidents.filter((row) =>
      ((options.state ?? '') === '' || row.state === options.state) &&
      (!options.from || new Date(row.openedAt) >= options.from) &&
      (!options.to || new Date(row.openedAt) < options.to) &&
      this.adminMatches(options.search ?? '', [row.id, row.type, row.severity]),
    ).map((row) => ({
      ...row,
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

