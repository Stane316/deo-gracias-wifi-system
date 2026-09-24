/**
 * IMP-20 — Tests unitaires des workers (blueprint §6) : order-expiry (TTL),
 * libération des RESERVED bloqués, webhook-sweeper (rattrapage FedaPay),
 * reconciler simulé (reconciliation_runs + alerts, garde-fou INC-03).
 */
import { describe, expect, it } from 'vitest';
import type { CheckoutInput, CheckoutResult, ProviderTransactionStatus } from './fedapay.js';
import { FakeRepo } from './fake-repo.js';
import {
  DEFAULT_ORDER_TTL_MS,
  DEFAULT_RESERVED_TTL_MS,
  runOrderExpiry,
  runReconciliationSim,
  runWebhookSweeper,
  startWorkers,
} from './workers.js';

class FakeProvider {
  statuses = new Map<string, ProviderTransactionStatus>();
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return { providerRef: 'ref-x', redirectUrl: null };
  }
  async getTransactionStatus(ref: string): Promise<ProviderTransactionStatus> {
    return this.statuses.get(ref) ?? 'unknown';
  }
}

const OLD = 3_600_000; // 1 h

async function stalePaidSetup() {
  const repo = new FakeRepo();
  const customerId = await repo.findOrCreateCustomer('0197200001');
  const { order } = await repo.createOrder({
    customerId,
    planId: 'plan-2',
    planSnapshot: { offer_id: '24-HEURES', price_snapshot: 300, validity_duration_snapshot: 48 },
    idempotencyKey: 'itest-imp20-u1',
  });
  return { repo, order };
}

describe('IMP-20 — order-expiry', () => {
  it('commande PAYMENT_PENDING au-delà du TTL => EXPIRED + paiement PENDING expiré', async () => {
    const { repo, order } = await stalePaidSetup();
    order.state = 'PAYMENT_PENDING';
    order.createdAt = new Date(Date.now() - OLD);
    const payment = await repo.createPayment(order.id, 300);
    await repo.markPaymentAwaitingResult(payment.id, 'fedapay:itest-imp20-u1');
    payment.state = 'PENDING';
    payment.createdAt = new Date(Date.now() - OLD);

    const report = await runOrderExpiry(repo, new Date());
    expect(report.ordersExpired).toEqual([order.id]);
    expect(report.paymentsExpired).toBe(1);
    expect(order.state).toBe('EXPIRED');
    expect(payment.state).toBe('EXPIRED');
  });

  it('commande récente NON expirée ; paiement INITIATED laissé tel quel (transitions 0009)', async () => {
    const { repo, order } = await stalePaidSetup();
    order.state = 'PAYMENT_PENDING'; // récente : createdAt = maintenant
    const payment = await repo.createPayment(order.id, 300);
    await repo.markPaymentAwaitingResult(payment.id, 'fedapay:itest-imp20-u2');
    payment.state = 'INITIATED'; // le fake court-circuite vers PENDING ; état réel INITIATED

    const report = await runOrderExpiry(repo, new Date());
    expect(report.ordersExpired).toEqual([]);
    expect(report.paymentsExpired).toBe(0);
    expect(order.state).toBe('PAYMENT_PENDING');
    expect(payment.state).toBe('INITIATED');
  });

  it('TTL configurable : une commande de 20 min expire avec un TTL de 15 min', async () => {
    const { repo, order } = await stalePaidSetup();
    order.state = 'PAYMENT_PENDING';
    order.createdAt = new Date(Date.now() - 20 * 60_000);
    const report = await runOrderExpiry(repo, new Date(), { orderTtlMs: 15 * 60_000 });
    expect(report.ordersExpired).toEqual([order.id]);
  });

  it('defaults conformes au blueprint §6 (30 min / 15 min)', () => {
    expect(DEFAULT_ORDER_TTL_MS).toBe(30 * 60_000);
    expect(DEFAULT_RESERVED_TTL_MS).toBe(15 * 60_000);
  });
});

describe('IMP-20 — libération des RESERVED bloqués', () => {
  it('ticket RESERVED au-delà du TTL => de nouveau AVAILABLE ; récent laissé', async () => {
    const repo = new FakeRepo();
    const stuck = repo.seedTicket('24-HEURES');
    stuck.dbState = 'RESERVED';
    repo.reservedAt.set(stuck.id, new Date(Date.now() - OLD));
    const fresh = repo.seedTicket('24-HEURES');
    fresh.dbState = 'RESERVED';
    repo.reservedAt.set(fresh.id, new Date());

    const report = await runOrderExpiry(repo, new Date());
    expect(report.ticketsReleased).toContain(stuck.id);
    expect(report.ticketsReleased).not.toContain(fresh.id);
    expect(stuck.dbState).toBe('AVAILABLE');
    expect(fresh.dbState).toBe('RESERVED');
  });
});

describe('IMP-20 — expiration des tickets SOLD à échéance dépassée (IMP-19)', () => {
  it('ticket SOLD avec activationDeadline passée => EXPIRED via runOrderExpiry', async () => {
    const repo = new FakeRepo();
    const overdue = repo.seedTicket('24-HEURES');
    overdue.dbState = 'SOLD';
    overdue.soldAt = new Date(Date.now() - 3 * 24 * 3600_000);
    overdue.activationDeadline = new Date(Date.now() - 3600_000); // close depuis 1 h
    const ok = repo.seedTicket('24-HEURES');
    ok.dbState = 'SOLD';
    ok.soldAt = new Date();
    ok.activationDeadline = new Date(Date.now() + 48 * 3600_000);

    const report = await runOrderExpiry(repo, new Date());
    expect(report.ticketsExpired).toEqual([overdue.id]);
    expect(overdue.dbState).toBe('EXPIRED');
    expect(ok.dbState).toBe('SOLD');
  });
});

describe('IMP-20 — webhook-sweeper', () => {
  it('approved côté provider => payment CONFIRMED + order PAID (rattrapage)', async () => {
    const { repo, order } = await stalePaidSetup();
    order.state = 'PAYMENT_PENDING';
    const payment = await repo.createPayment(order.id, 300);
    await repo.markPaymentAwaitingResult(payment.id, 'ref-approved');
    payment.createdAt = new Date(Date.now() - OLD);
    const provider = new FakeProvider();
    provider.statuses.set('ref-approved', 'approved');

    const swept = await runWebhookSweeper(repo, provider, new Date());
    expect(swept).toBe(1);
    expect(payment.state).toBe('CONFIRMED');
    expect(order.state).toBe('PAID');
  });

  it('declined => payment FAILED + order FAILED ; récent ignoré ; sans provider = 0', async () => {
    const { repo, order } = await stalePaidSetup();
    order.state = 'PAYMENT_PENDING';
    const payment = await repo.createPayment(order.id, 300);
    await repo.markPaymentAwaitingResult(payment.id, 'ref-declined');
    payment.createdAt = new Date(Date.now() - OLD);

    const provider = new FakeProvider();
    provider.statuses.set('ref-declined', 'declined');
    expect(await runWebhookSweeper(repo, provider, new Date())).toBe(1);
    expect(payment.state).toBe('FAILED');
    expect(order.state).toBe('FAILED');

    // Paiement récent : pas encore interrogé.
    const { repo: r2, order: o2 } = await stalePaidSetup();
    o2.state = 'PAYMENT_PENDING';
    const p2 = await r2.createPayment(o2.id, 300);
    await r2.markPaymentAwaitingResult(p2.id, 'ref-young');
    p2.state = 'INITIATED';
    provider.statuses.set('ref-young', 'approved');
    expect(await runWebhookSweeper(r2, provider, new Date())).toBe(0);
    expect(p2.state).toBe('INITIATED');

    // Sans clés FedaPay : inactif honnêtement.
    expect(await runWebhookSweeper(r2, undefined, new Date())).toBe(0);
  });
});

describe('IMP-20 — reconciler simulé', () => {
  it('cohérent => run OK, routeur null (Phase 1), pas d\u0027alerte', async () => {
    const repo = new FakeRepo();
    repo.seedTicket('24-HEURES');
    const report = await runReconciliationSim(repo);
    expect(report.status).toBe('OK');
    expect(report.violations).toEqual([]);
    const run = repo.reconciliationRuns[0] as Record<string, unknown>;
    expect(run?.['status']).toBe('OK');
    expect(run?.['routerTotalSeen']).toBeNull();
    expect(repo.alertsRaised).toHaveLength(0);
  });

  it('violation => MISMATCH + alerte CRITICAL reconciliation_mismatch', async () => {
    const repo = new FakeRepo();
    repo.violationFixtures.deliveredWithoutTicket = 2;
    const report = await runReconciliationSim(repo);
    expect(report.status).toBe('MISMATCH');
    expect(report.violations).toEqual(['delivered_without_ticket:2']);
    expect(repo.alertsRaised).toHaveLength(1);
    expect(repo.alertsRaised[0]).toMatchObject({ rule: 'reconciliation_mismatch', severity: 'CRITICAL' });
  });
});

describe('IMP-20 — startWorkers', () => {
  it('tickAll exécute les trois jobs ; stop() idempotent', async () => {
    const repo = new FakeRepo();
    const handle = startWorkers(repo, { intervals: { orderExpiryMs: 100_000_000, sweepMs: 100_000_000, reconcileMs: 100_000_000 } });
    const report = await handle.tickAll();
    expect(report.reconciliation?.status).toBe('OK');
    expect(report.swept).toBe(0);
    handle.stop();
    handle.stop(); // idempotent
  });
});
