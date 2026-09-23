/**
 * IMP-13 — Fake repo en mémoire partagé par les tests unitaires (app, auth).
 * Les tests d'intégration réels utilisent PgRepo (repo.pg.test.ts).
 */
import { OFFERS } from '@dg/shared';
import { randomUUID } from 'node:crypto';
import type { ActivePlan, BackendRepo, CreateOrderInputDb, OrderRecord, PaymentRecord } from './repo.js';

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
  async close(): Promise<void> {}
}

