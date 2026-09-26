/**
 * IMP-33 — Tests incidents & récupération (FakeRepo, routes admin réelles).
 * Normatifs : doc 09 §41-46 (types, gravités, cycle, fiche, actions), §101
 * (détection idempotente), §117 (scénarios A→E) ; invariants 2/6/7
 * (jamais de double attribution, jamais de nouveau paiement, jamais de
 * double livraison) ; Idempotency-Key sur la récupération ; raison 20..1000.
 */
import { describe, expect, it } from 'vitest';
import {
  buildApp,
} from './app.js';
import type { AuthIdentity, AuthVerifier } from './auth.js';
import { FakeRepo } from './fake-repo.js';
import { allocateAndDeliver } from './tickets.js';
import type { PaymentProvider, CheckoutInput, CheckoutResult } from './fedapay.js';
import type { SyncOpRecord } from './repo.js';

class FakeVerifier implements AuthVerifier {
  identities = new Map<string, AuthIdentity>();
  async verify(token: string): Promise<AuthIdentity | null> {
    return this.identities.get(token) ?? null;
  }
}

class FakeProvider implements PaymentProvider {
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return { providerRef: `REF-I-${Math.random().toString(36).slice(2)}`, redirectUrl: null };
  }
}

const WH_SECRET = 'wh_sandbox_incidents_unit';
const NOW = 1_800_000_000;
const ADMIN = 'Bearer tok-imp33-admin';
const USER = 'Bearer tok-imp33-user';
const REASON = 'Raison détaillée pour l\'action admin (20 caractères minimum).';

interface Ctx {
  repo: FakeRepo;
  app: Awaited<ReturnType<typeof buildApp>>;
}

async function makeApp(): Promise<Ctx> {
  const repo = new FakeRepo();
  const verifier = new FakeVerifier();
  verifier.identities.set('tok-imp33-admin', { sub: 'sub-imp33-admin', phone: null, email: 'imp33@dg.bj', role: 'ADMIN' });
  verifier.identities.set('tok-imp33-user', { sub: 'sub-imp33-user', phone: null, email: null, role: null });
  const app = await buildApp({
    repo,
    payment: { provider: new FakeProvider(), webhookSecret: WH_SECRET, toleranceS: 300, nowS: () => NOW },
    auth: { verifier, rateLimits: { requestMax: 1000, verifyMax: 1000 } },
  });
  return { repo, app };
}

/** Commande + paiement CONFIRMÉ (PAID), sans aucun ticket en stock. */
async function createPaidOrderNoStock(ctx: Ctx, key: string): Promise<{ orderId: string; paymentId: string }> {
  const { repo, app } = ctx;
  const res = await app.inject({
    method: 'POST', url: '/orders', headers: { 'idempotency-key': key },
    payload: { offer_id: '24-HEURES', customer_phone: '0197330001' },
  });
  expect(res.statusCode).toBe(201);
  const orderId = (res.json() as { id: string }).id;
  const order = await repo.getOrderById(orderId);
  const amount = Number(order?.planSnapshot['price_snapshot'] ?? 0);
  const paymentRes = await app.inject({ method: 'POST', url: `/orders/${orderId}/pay` });
  expect(paymentRes.statusCode).toBe(202);
  const paymentId = (paymentRes.json() as Record<string, unknown>)['payment_id'] as string;
  expect(await repo.confirmPayment(paymentId)).toBe('confirmed');
  return { orderId, paymentId };
}

/** Déclenche le scénario C : allocation sans stock → incident TICKET_ALLOCATION_ERROR. */
async function triggerNoStockIncident(ctx: Ctx): Promise<string> {
  const paid = await createPaidOrderNoStock(ctx, `imp33-c-${Math.random().toString(36).slice(2)}`);
  const outcome = await allocateAndDeliver(ctx.repo, paid.orderId, { warn: () => {} });
  expect(outcome.status).toBe('no-stock');
  const page = await ctx.repo.listAdminIncidents({ limit: 10, offset: 0 });
  const inc = page.items.find((i) => i.orderId === paid.orderId);
  expect(inc, 'incident TICKET_ALLOCATION_ERROR attendu pour la commande').toBeDefined();
  return (inc as { id: string }).id;
}

describe('IMP-33 — détection (scénario C, doc 09 §117)', () => {
  it('C : paiement CONFIRMÉ + stock épuisé => incident TICKET_ALLOCATION_ERROR HIGH OPEN, idempotent', async () => {
    const ctx = await makeApp();
    const incidentId = await triggerNoStockIncident(ctx);
    const detail = await ctx.repo.getAdminIncident(incidentId);
    expect(detail).not.toBeNull();
    expect(detail?.type).toBe('TICKET_ALLOCATION_ERROR');
    expect(detail?.severity).toBe('HIGH');
    expect(detail?.state).toBe('OPEN');
    expect(detail?.orderId).not.toBeNull();
    expect(detail?.paymentId).not.toBeNull();
    expect(detail?.paymentState).toBe('CONFIRMED');
    expect(detail?.error).toContain('Stock de tickets épuisé');
    expect(detail?.recommendedAction).toContain('jamais de nouveau paiement');
    expect(detail?.history.some((h) => h.action === 'incident_created')).toBe(true);

    // Rejeu de l'allocation (ex. retry webhook) : PAS de second incident.
    const again = await allocateAndDeliver(ctx.repo, detail?.orderId as string, { warn: () => {} });
    expect(again.status).toBe('no-stock');
    const page = await ctx.repo.listAdminIncidents({ limit: 10, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]?.id).toBe(incidentId);

    await ctx.app.close();
  });

  it('A : flux nominal (stock présent) => aucun incident', async () => {
    const ctx = await makeApp();
    const paid = await createPaidOrderNoStock(ctx, 'imp33-a-flux-ok');
    // Stock présent : le lot est créé APRÈS la commande (l'ordre du scénario A
    // n'exige pas d'incident sur un flux qui réussit).
    await ctx.repo.createBackendBatch({ offerId: '24-HEURES', quantity: 2 });
    const outcome = await allocateAndDeliver(ctx.repo, paid.orderId, { warn: () => {} });
    expect(outcome.status).toBe('delivered');
    const page = await ctx.repo.listAdminIncidents({ limit: 10, offset: 0 });
    expect(page.items).toHaveLength(0);
    await ctx.app.close();
  });

  it('D : worker — Connector OFFLINE => incident MEDIUM ; revenu => auto-résolution (system)', async () => {
    const ctx = await makeApp();
    const { repo } = ctx;
    const now = new Date();

    // Hors ligne depuis 6 min (seuil 5 min).
    repo.connectorHeartbeat = {
      connectorId: 'dg-connector-1', version: '0.1.0', routerModel: 'hEX', routerosVersion: '7.15',
      lastSeenAt: new Date(now.getTime() - 6 * 60_000).toISOString(),
    };
    const opened = await repo.runConnectorOfflineDetection('system', now);
    expect(opened).toEqual({ opened: 1, resolved: 0 });
    let page = await repo.listAdminIncidents({ limit: 10, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.items[0]).toMatchObject({ type: 'CONNECTOR_OFFLINE', severity: 'MEDIUM', state: 'OPEN', connectorId: 'dg-connector-1' });

    // Idempotence : le second passage ne crée pas de second incident.
    expect(await repo.runConnectorOfflineDetection('system', now)).toEqual({ opened: 0, resolved: 0 });
    page = await repo.listAdminIncidents({ limit: 10, offset: 0 });
    expect(page.items).toHaveLength(1);

    // Revenu en ligne (heartbeat < 2 min) => auto-résolution, acteur system.
    await repo.recordConnectorHeartbeat({ connectorId: 'dg-connector-1' });
    expect(await repo.runConnectorOfflineDetection('system', new Date())).toEqual({ opened: 0, resolved: 1 });
    const firstItem = page.items[0];
    expect(firstItem).toBeDefined();
    const detail = await repo.getAdminIncident(firstItem!.id);
    expect(detail?.state).toBe('RESOLVED');
    expect(detail?.closedAt).not.toBeNull();
    expect(detail?.closeReason).toContain('de nouveau en ligne');
    expect(detail?.history.some((h) => h.action === 'incident_transition' && h.actor === 'system')).toBe(true);

    // Pas de heartbeat du tout (inconnu) => aucune action.
    repo.connectorHeartbeat = null;
    expect(await repo.runConnectorOfflineDetection('system', new Date())).toEqual({ opened: 0, resolved: 0 });
    await ctx.app.close();
  });
});

describe('IMP-33 — cycle de vie via les routes (doc 09 §43)', () => {
  it('auth : 401 sans token ; 403 pour un client sans rôle admin', async () => {
    const ctx = await makeApp();
    expect((await ctx.app.inject({ method: 'GET', url: '/admin/incidents' })).statusCode).toBe(401);
    expect((await ctx.app.inject({ method: 'GET', url: '/admin/incidents', headers: { authorization: USER } })).statusCode).toBe(403);
    await ctx.app.close();
  });

  it('OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED : audité, fiche enrichie, historique', async () => {
    const ctx = await makeApp();
    const incidentId = await triggerNoStockIncident(ctx);
    const post = (url: string, body: unknown) =>
      ctx.app.inject({ method: 'POST', url, headers: { authorization: ADMIN, 'content-type': 'application/json' }, payload: body as Record<string, unknown> });

    const ack = await post(`/admin/incidents/${incidentId}/acknowledge`, { reason: REASON });
    expect(ack.statusCode).toBe(200);
    expect((ack.json() as { state: string }).state).toBe('ACKNOWLEDGED');

    const inv = await post(`/admin/incidents/${incidentId}/investigate`, { reason: REASON });
    expect(inv.statusCode).toBe(200);
    expect((inv.json() as { state: string }).state).toBe('INVESTIGATING');

    const res = await post(`/admin/incidents/${incidentId}/resolve`, { reason: REASON });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { state: string }).state).toBe('RESOLVED');

    // Fiche : contexte commande/paiement + historique complet.
    const get = await ctx.app.inject({ method: 'GET', url: `/admin/incidents/${incidentId}`, headers: { authorization: ADMIN } });
    expect(get.statusCode).toBe(200);
    const body = get.json() as {
      state: string; order: { phone: string; offer_id: string; state: string } | null;
      payment: { state: string } | null; recommended_action: string | null;
      history: Array<{ action: string; actor: string; after: Record<string, unknown> | null }>;
    };
    expect(body.state).toBe('RESOLVED');
    expect(body.order?.phone).toBe('0197330001');
    expect(body.order?.offer_id).toBe('24-HEURES');
    expect(body.order?.state).toBe('PAID');
    expect(body.payment?.state).toBe('CONFIRMED');
    expect(body.recommended_action).toContain('Retry allocation');
    const actions = body.history.map((h) => h.action);
    expect(actions).toEqual(['incident_created', 'incident_transition', 'incident_transition', 'incident_transition']);
    expect(body.history[1]?.actor).toBe('admin:sub-imp33-admin');
    expect((body.history[1]?.after ?? {})['to']).toBe('ACKNOWLEDGED');
  });

  it('garde : transition illégale → 409 ; UUID inconnu → 404 ; raison trop courte → 400 ; param invalide → 400', async () => {
    const ctx = await makeApp();
    const incidentId = await triggerNoStockIncident(ctx);
    const post = (url: string, body: unknown) =>
      ctx.app.inject({ method: 'POST', url, headers: { authorization: ADMIN, 'content-type': 'application/json' }, payload: body as Record<string, unknown> });

    // OPEN → RESOLVED est légal ; mais resolve d'un incident déjà RESOLVED est idempotent (200).
    expect((await post(`/admin/incidents/${incidentId}/resolve`, { reason: REASON })).statusCode).toBe(200);
    // ACKNOWLEDGED depuis RESOLVED : illégal → 409.
    expect((await post(`/admin/incidents/${incidentId}/acknowledge`, { reason: REASON })).statusCode).toBe(409);
    // UUID inconnu → 404.
    expect((await post('/admin/incidents/00000000-0000-4000-8000-000000000000/resolve', { reason: REASON })).statusCode).toBe(404);
    // Raison < 20 caractères → 400.
    expect((await post(`/admin/incidents/${incidentId}/reopen`, { reason: 'trop court' })).statusCode).toBe(400);
    // Paramètre non UUID → 400.
    expect((await post('/admin/incidents/pas-un-uuid/reopen', { reason: REASON })).statusCode).toBe(400);

    const get = await ctx.app.inject({ method: 'GET', url: '/admin/incidents/00000000-0000-4000-8000-000000000000', headers: { authorization: ADMIN } });
    expect(get.statusCode).toBe(404);
    await ctx.app.close();
  });

  it('reopen : RESOLVED → REOPENED (compteur +1), idempotent, puis résolution possible', async () => {
    const ctx = await makeApp();
    const incidentId = await triggerNoStockIncident(ctx);
    const post = (url: string, body: unknown) =>
      ctx.app.inject({ method: 'POST', url, headers: { authorization: ADMIN, 'content-type': 'application/json' }, payload: body as Record<string, unknown> });

    await post(`/admin/incidents/${incidentId}/resolve`, { reason: REASON });
    const r1 = await post(`/admin/incidents/${incidentId}/reopen`, { reason: REASON });
    expect(r1.statusCode).toBe(200);
    expect((r1.json() as { state: string }).state).toBe('REOPENED');
    // Rejeu : déjà REOPENED → idempotent, compteur inchangé.
    const r2 = await post(`/admin/incidents/${incidentId}/reopen`, { reason: REASON });
    expect(r2.statusCode).toBe(200);
    expect((r2.json() as { state: string }).state).toBe('REOPENED');

    const detail = await ctx.repo.getAdminIncident(incidentId);
    expect(detail?.reopenedCount).toBe(1);
    // REOPENED → ACKNOWLEDGED → RESOLVED : le cycle repart.
    expect((await post(`/admin/incidents/${incidentId}/acknowledge`, { reason: REASON })).statusCode).toBe(200);
    expect((await post(`/admin/incidents/${incidentId}/resolve`, { reason: REASON })).statusCode).toBe(200);
    await ctx.app.close();
  });
});

describe('IMP-33 — récupération : retry allocation (doc 09 §45-46)', () => {
  it('stock restauré => rejeu allocation DELIVERED + incident RESOLVED ; rejeu même clé => replayed sans effet', async () => {
    const ctx = await makeApp();
    const incidentId = await triggerNoStockIncident(ctx);
    const key = 'imp33-retry-alloc-0001';

    const before = await ctx.repo.getAdminIncident(incidentId);
    expect(before?.state).toBe('OPEN');

    // Stock toujours épuisé : la tentative échoue SANS perdre le paiement.
    const noStock = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: 'imp33-retry-nostock-1' },
    });
    expect(noStock.statusCode).toBe(200);
    const noStockBody = noStock.json() as { state: string; retry: { outcome: string } };
    expect(noStockBody.state).toBe('OPEN');
    expect(noStockBody.retry.outcome).toBe('still-no-stock');
    const order = await ctx.repo.getOrderById(before?.orderId as string);
    expect(order?.state).toBe('PAID');
    const payment = await ctx.repo.getLatestPaymentByOrderId(before?.orderId as string);
    expect(payment?.state).toBe('CONFIRMED');

    // Stock restauré => allocation réussie, incident résolu.
    await ctx.repo.createBackendBatch({ offerId: '24-HEURES', quantity: 1 });
    const ok = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: key },
    });
    expect(ok.statusCode).toBe(200);
    const okBody = ok.json() as { state: string; attempts: number; retry: { outcome: string } };
    expect(okBody.state).toBe('RESOLVED');
    expect(okBody.retry.outcome).toBe('delivered');
    expect(okBody.attempts).toBe(2);
    const orderAfter = await ctx.repo.getOrderById(before?.orderId as string);
    expect(orderAfter?.state).toBe('DELIVERED');
    const detail = await ctx.repo.getAdminIncident(incidentId);
    expect(detail?.ticketId).not.toBeNull();
    expect(detail?.ticketState).toBe('SOLD');
    expect(detail?.closedAt).not.toBeNull();

    // Idempotence : rouvrir puis rejouer la MÊME clé => aucun second effet.
    await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/reopen`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON },
    });
    const replay = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: key },
    });
    expect(replay.statusCode).toBe(200);
    const replayBody = replay.json() as { retry: { outcome: string } };
    expect(replayBody.retry.outcome).toBe('replayed');
    const after = await ctx.repo.getAdminIncident(incidentId);
    expect(after?.attempts).toBe(2);
    expect(after?.state).toBe('REOPENED');
    // Une nouvelle clé ré-incrémente et re-livre idempotemment (déjà DELIVERED).
    const redeliver = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: 'imp33-retry-alloc-0002' },
    });
    expect((redeliver.json() as { retry: { outcome: string } }).retry.outcome).toBe('delivered');
    const final = await ctx.repo.getAdminIncident(incidentId);
    expect(final?.state).toBe('RESOLVED');
    expect(final?.attempts).toBe(3);
    // Invariant 7 : une seule commande livrée, un seul ticket.
    const sold = await ctx.repo.getSoldTicketsForCustomer((await ctx.repo.getOrderById(before?.orderId as string))?.customerId ?? '');
    expect(sold).toHaveLength(1);
    await ctx.app.close();
  });

  it('type non retryable => 400 ; incident résolu => 409', async () => {
    const ctx = await makeApp();
    // Incident CONNECTOR_OFFLINE (non retryable par action).
    const now = new Date();
    ctx.repo.connectorHeartbeat = {
      connectorId: 'c-x', version: null, routerModel: null, routerosVersion: null,
      lastSeenAt: new Date(now.getTime() - 6 * 60_000).toISOString(),
    };
    await ctx.repo.runConnectorOfflineDetection('system', now);
    const page = await ctx.repo.listAdminIncidents({ limit: 10, offset: 0 });
    const offlineId = page.items[0]!.id;
    const res = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${offlineId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: 'imp33-retry-offline-1' },
    });
    expect(res.statusCode).toBe(400);

    // Incident résolu => 409 (à rouvrir d'abord).
    const incidentId = await triggerNoStockIncident(ctx);
    await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/resolve`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON },
    });
    const resolved = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: 'imp33-retry-resolved-1' },
    });
    expect(resolved.statusCode).toBe(409);
    await ctx.app.close();
  });

  it('resync (MIKROTIK_SYNC_ERROR) : opérations FAILED/BLOCKED => PENDING (base uniquement) + incident RESOLVED', async () => {
    const ctx = await makeApp();
    const { repo } = ctx;
    // Détection réelle : op BLOCKED via resolveSyncOp (accrochage IMP-33).
    const op: SyncOpRecord = {
      id: 'op-imp33-1', operation: 'create_ticket', payload: { name: 'dg-test' },
      state: 'PROCESSING', attempts: 1, nextRetryAt: null, lockedBy: 'w1',
      result: null, createdAt: new Date(), updatedAt: new Date(),
    };
    repo.syncOps.push(op);
    const outcome = await repo.resolveSyncOp('op-imp33-1', {
      kind: 'failure', error: { code: 'router_timeout', message: 'routeur injoignable' }, nextRetryAt: null,
    }, new Date());
    expect(outcome.state).toBe('BLOCKED');
    // L'incident MIKROTIK_SYNC_ERROR HIGH a été créé par la détection.
    const page = await repo.listAdminIncidents({ limit: 10, offset: 0 });
    expect(page.items).toHaveLength(1);
    const incidentId = page.items[0]!.id;
    expect(page.items[0]).toMatchObject({ type: 'MIKROTIK_SYNC_ERROR', severity: 'HIGH', state: 'OPEN' });

    // Retry = resync : requeue DB uniquement, incident résolu.
    const res = await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/retry`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON, idempotency_key: 'imp33-retry-resync-1' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { state: string; retry: { outcome: string } };
    expect(body.state).toBe('RESOLVED');
    expect(body.retry.outcome).toBe('requeued');
    expect(op.state).toBe('PENDING');
    expect(op.attempts).toBe(0);
    expect(op.nextRetryAt).toBeNull();
    expect(op.lockedBy).toBeNull();
    await ctx.app.close();
  });
});

describe('IMP-33 — liste et filtres (fiche, doc 09 §44)', () => {
  it('liste enrichie : filtres état et recherche sur l\'erreur technique', async () => {
    const ctx = await makeApp();
    const incidentId = await triggerNoStockIncident(ctx);
    await ctx.app.inject({
      method: 'POST', url: `/admin/incidents/${incidentId}/acknowledge`,
      headers: { authorization: ADMIN, 'content-type': 'application/json' },
      payload: { reason: REASON },
    });
    const get = (url: string) => ctx.app.inject({ method: 'GET', url, headers: { authorization: ADMIN } });

    const all = (await get('/admin/incidents?limit=10')).json() as {
      items: Array<{ state: string; order_id: string | null; error: string | null; attempts: number }>;
      total: number;
    };
    expect(all.total).toBe(1);
    expect(all.items[0]?.state).toBe('ACKNOWLEDGED');
    expect(all.items[0]?.order_id).not.toBeNull();
    expect(all.items[0]?.error).toContain('Stock de tickets épuisé');

    // Filtre état (nouveau cycle de vie).
    const ack = (await get('/admin/incidents?state=ACKNOWLEDGED')).json() as { total: number };
    expect(ack.total).toBe(1);
    const open = (await get('/admin/incidents?state=OPEN')).json() as { total: number };
    expect(open.total).toBe(0);
    const closed = (await get('/admin/incidents?state=REOPENED')).json() as { total: number };
    expect(closed.total).toBe(0);

    // Recherche sur l'erreur technique.
    const found = (await get('/admin/incidents?search=Stock')).json() as { total: number };
    expect(found.total).toBe(1);
    const notFound = (await get('/admin/incidents?search=zzzzz')).json() as { total: number };
    expect(notFound.total).toBe(0);
    await ctx.app.close();
  });
});
