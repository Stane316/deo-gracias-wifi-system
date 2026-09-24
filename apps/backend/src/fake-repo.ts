/**
 * IMP-13 — Fake repo en mémoire partagé par les tests unitaires (app, auth).
 * Les tests d'intégration réels utilisent PgRepo (repo.pg.test.ts).
 */
import { OFFERS } from '@dg/shared';
import { randomUUID } from 'node:crypto';
import type { AdminDashboardDbStats, AlertAckRecord } from './admin.js';
import { FIRST_BACKEND_BATCH_SEQ, generateTicketSpecs } from './ticketgen.js';
import type { CreatedBackendBatch } from './repo.js';
import type {
  ActivePlan,
  AllocateResult,
  BackendRepo,
  CreateOrderInputDb,
  OrderRecord,
  PaymentRecord,
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

  audits: Array<{ actor: string; action: string; entity: string; entityId?: string | null }> = [];
  async logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
  }): Promise<void> {
    this.audits.push(entry);
  }
  linked: Array<[string, string]> = [];
  async linkCustomerAuth(customerId: string, authUserId: string): Promise<void> {
    this.linked.push([customerId, authUserId]);
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
  syncOps: Array<{ operation: string; payload: Record<string, unknown> }> = [];
  async createBackendBatch(input: { offerId: string; quantity: number }): Promise<CreatedBackendBatch> {
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
        operation: 'create_ticket',
        payload: {
          batch_seq: seq, name: spec.routerName, password: spec.clientCode,
          profile: plan.mikrotikProfile, limit_uptime: plan.limitUptime, comment: spec.mikrotikComment,
        },
      });
    }
    return batch;
  }

  // IMP-17 — stats admin pilotables par les tests unitaires (doc 09 §12-13).
  dashboardStats: AdminDashboardDbStats = {
    ordersCountToday: 0,
    paymentsConfirmedToday: 0,
    revenueTodayFcfa: 0,
    ticketsDeliveredToday: 0,
    ticketsByState: {},
    availableByOffer: {},
    incidentsOpen: 0,
    syncPending: 0,
    syncFailed: 0,
    syncSuccess: 0,
  };
  async getAdminDashboardStats(_since: Date): Promise<AdminDashboardDbStats> {
    return this.dashboardStats;
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

  async close(): Promise<void> {}
}

