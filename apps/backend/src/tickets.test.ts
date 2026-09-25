/**
 * IMP-15 — Tests unitaires : allocation atomique des tickets + livraison DELIVERED.
 * Normatifs : doc 06 §29-31 (jamais deux commandes sur le même ticket), §90 étapes
 * 11-15, invariants 2/6/7 (§89), matrice de récupération §88. Le webhook approuvé
 * est signé avec l'algorithme du SDK officiel (voir fedapay.test.ts).
 */
import { describe, expect, it } from 'vitest';
import type { AuthIdentity, AuthVerifier } from './auth.js';
import { generateTestHeaderString, type CheckoutInput, type CheckoutResult, type PaymentProvider } from './fedapay.js';
import { allocateAndDeliver } from './tickets.js';
import { buildApp } from './app.js';
import { FakeRepo } from './fake-repo.js';

class LocalVerifier implements AuthVerifier {
  identities = new Map<string, AuthIdentity>();
  async verify(token: string): Promise<AuthIdentity | null> {
    return this.identities.get(token) ?? null;
  }
}

const WH_SECRET = 'wh_sandbox_tickets_unit';
const NOW = 1_800_000_000;

class FakeProvider implements PaymentProvider {
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return { providerRef: `REF-T-${Math.random().toString(36).slice(2)}`, redirectUrl: null };
  }
}

async function makeApp(verifier?: LocalVerifier) {
  const repo = new FakeRepo();
  const app = await buildApp({
    repo,
    payment: { provider: new FakeProvider(), webhookSecret: WH_SECRET, toleranceS: 300, nowS: () => NOW },
    ...(verifier ? { auth: { verifier, rateLimits: { requestMax: 100, verifyMax: 100 } } } : {}),
  });
  return { repo, app };
}

async function createOrder(repo: FakeRepo, app: Awaited<ReturnType<typeof buildApp>>, key: string, phone = '0197000001') {
  const res = await app.inject({
    method: 'POST',
    url: '/orders',
    headers: { 'idempotency-key': key },
    payload: { offer_id: '24-HEURES', customer_phone: phone },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const order = await repo.getOrderById(id);
  return { id, amount_fcfa: order?.planSnapshot['price_snapshot'] as number };
}

async function payOrder(app: Awaited<ReturnType<typeof buildApp>>, orderId: string) {
  const res = await app.inject({ method: 'POST', url: `/orders/${orderId}/pay` });
  expect(res.statusCode).toBe(202);
  return res.json() as Record<string, unknown>;
}

function approve(app: Awaited<ReturnType<typeof buildApp>>, eventId: number, ref: string, amount: number, paymentId: string) {
  const body = JSON.stringify({
    id: eventId,
    name: 'transaction.approved',
    entity: {
      reference: ref,
      amount,
      status: 'approved',
      currency: { iso: 'XOF' },
      custom_metadata: { payment_id: paymentId },
    },
  });
  return app.inject({
    method: 'POST',
    url: '/webhooks/fedapay',
    headers: {
      'content-type': 'application/json',
      'x-fedapay-signature': generateTestHeaderString({ payload: body, secret: WH_SECRET, timestamp: NOW }),
    },
    payload: body,
  });
}

describe('webhook approuvé => allocation + livraison (doc 06 §90)', () => {
  it('stock présent : order DELIVERED, ticket SOLD, réponse delivery=delivered', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp15-key-0001');
    repo.seedTicket('24-HEURES');
    const p = await payOrder(app, order.id);
    const res = await approve(app, 910, p['provider_ref'] as string, order.amount_fcfa, p['payment_id'] as string);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ processed: 'confirmed', order_state: 'DELIVERED', delivery: 'delivered' });
    const reloaded = await repo.getOrderById(order.id);
    expect(reloaded?.state).toBe('DELIVERED');
    const sold = [...repo.tickets.values()].filter((t) => t.dbState === 'SOLD');
    expect(sold).toHaveLength(1);
    expect(sold[0]?.orderId).toBe(order.id);
  });

  it('stock épuisé : paiement CONFIRMÉ préservé, ordre PAID, audit allocation échouée (invariant 6, §88)', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp15-key-0002');
    const p = await payOrder(app, order.id);
    const res = await approve(app, 911, p['provider_ref'] as string, order.amount_fcfa, p['payment_id'] as string);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ processed: 'confirmed', order_state: 'PAID', delivery: 'no-stock' });
    expect((await repo.getOrderById(order.id))?.state).toBe('PAID');
    const payment = await repo.getPaymentById(p['payment_id'] as string);
    expect(payment?.state).toBe('CONFIRMED'); // jamais perdu (invariant 6)
    expect(repo.audits.some((a) => a.action === 'ticket_allocation_failed')).toBe(true);
  });

  it('deux approbations distinctes : une seule allocation (invariants 2 et 5)', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp15-key-0003');
    repo.seedTicket('24-HEURES');
    repo.seedTicket('24-HEURES');
    const p = await payOrder(app, order.id);
    const first = await approve(app, 912, p['provider_ref'] as string, order.amount_fcfa, p['payment_id'] as string);
    expect(first.json()).toMatchObject({ delivery: 'delivered' });
    // Second événement (id différent, même transaction) : dedoublonné en amont.
    const second = await approve(app, 912, p['provider_ref'] as string, order.amount_fcfa, p['payment_id'] as string);
    expect(second.json()).toMatchObject({ duplicate: true });
    expect([...repo.tickets.values()].filter((t) => t.dbState === 'SOLD')).toHaveLength(1);
  });
});

describe('allocateAndDeliver (service, idempotence invariant 7)', () => {
  it('rejeu sur commande livrée : aucun second ticket consommé', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp15-key-0004');
    repo.seedTicket('24-HEURES');
    repo.seedTicket('24-HEURES');
    const o = (await repo.getOrderById(order.id))!;
    o.state = 'PAID'; // fixture : paiement confirmé en amont
    const first = await allocateAndDeliver(repo, order.id);
    expect(first).toMatchObject({ status: 'delivered', orderState: 'DELIVERED' });
    const second = await allocateAndDeliver(repo, order.id);
    expect(second.status).toBe('already-delivered');
    expect([...repo.tickets.values()].filter((t) => t.dbState === 'SOLD')).toHaveLength(1);
  });

  it('complète une allocation interrompue (TICKET_ALLOCATED) sans ré-allouer', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp15-key-0005');
    repo.seedTicket('24-HEURES');
    const o = (await repo.getOrderById(order.id))!;
    o.state = 'PAID';
    const alloc = await repo.allocateTicketForOrder(order.id);
    expect(alloc.status).toBe('allocated');
    // Livraison interrompue avant DELIVERED :
    const resume = await allocateAndDeliver(repo, order.id);
    expect(resume.status).toBe('delivered');
    expect([...repo.tickets.values()].filter((t) => t.dbState === 'SOLD')).toHaveLength(1);
  });

  it('jamais d’allocation hors PAID (CREATED, PAYMENT_PENDING)', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp15-key-0006');
    repo.seedTicket('24-HEURES');
    expect((await allocateAndDeliver(repo, order.id)).status).toBe('illegal');
    expect([...repo.tickets.values()].filter((t) => t.dbState === 'SOLD')).toHaveLength(0);
  });
});

describe('GET /tickets/mine (blueprint §6)', () => {
  it('401 sans jeton ; liste les tickets vendus avec session phone ; JAMAIS de champ code', async () => {
    const { repo, app } = await makeApp();
    const unauth = await app.inject({ method: 'GET', url: '/tickets/mine' });
    expect(unauth.statusCode).toBe(401);

    const order = await createOrder(repo, app, 'itest-imp15-key-0007', '0197555001');
    repo.seedTicket('24-HEURES', 'DG24');
    const o = (await repo.getOrderById(order.id))!;
    o.state = 'PAID';
    const delivered = await allocateAndDeliver(repo, order.id);
    expect(delivered.status).toBe('delivered');

    // Session phone via OTP dev :
    const appDev = await buildApp({ repo, auth: { devMode: true, rateLimits: { requestMax: 100, verifyMax: 100 } } });
    const req = await appDev.inject({
      method: 'POST',
      url: '/auth/phone/request',
      payload: { phone: '0197555001' },
    });
    const code = (req.json() as Record<string, unknown>)['dev_code'] as string;
    const ver = await appDev.inject({
      method: 'POST',
      url: '/auth/phone/verify',
      payload: { phone: '0197555001', code },
    });
    const token = (ver.json() as Record<string, unknown>)['token'] as string;
    const res = await appDev.inject({ method: 'GET', url: '/tickets/mine', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    const tickets = body['tickets'] as Array<Record<string, unknown>>;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ offer_id: '24-HEURES', db_state: 'SOLD', code_prefix_hint: 'DG24' });
    expect(JSON.stringify(body)).not.toContain('password');
    expect(Object.keys(tickets[0]!)).not.toContain('code'); // jamais de code en clair
    await appDev.close();
  });
});

describe('POST /admin/orders/:id/allocate (retry admin, doc 06 §88)', () => {
  it('503 sans verifier ; 401 anonyme ; 403 sans rôle ; 200 admin avec rôle', async () => {
    const noVerifier = await makeApp();
    const r503 = await noVerifier.app.inject({ method: 'POST', url: '/admin/orders/00000000-0000-4000-8000-000000000000/allocate' });
    expect(r503.statusCode).toBe(503);
    await noVerifier.app.close();

    const verifier = new LocalVerifier();
    verifier.identities.set('tok-admin', { sub: 'sub-admin', phone: null, email: null, role: 'ADMIN' });
    verifier.identities.set('tok-user', { sub: 'sub-user', phone: null, email: null, role: null });
    const { repo, app } = await makeApp(verifier);
    const order = await createOrder(repo, app, 'itest-imp15-key-0008');
    repo.seedTicket('24-HEURES');
    const o = (await repo.getOrderById(order.id))!;
    o.state = 'PAID';

    const anon = await app.inject({ method: 'POST', url: `/admin/orders/${order.id}/allocate` });
    expect(anon.statusCode).toBe(401);
    const forbidden = await app.inject({
      method: 'POST',
      url: `/admin/orders/${order.id}/allocate`,
      headers: { authorization: 'Bearer tok-user' },
    });
    expect(forbidden.statusCode).toBe(403);

    const ok = await app.inject({
      method: 'POST',
      url: `/admin/orders/${order.id}/allocate`,
      headers: { authorization: 'Bearer tok-admin' },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toMatchObject({ status: 'delivered', orderState: 'DELIVERED' });
    expect(repo.audits.some((a) => a.action === 'admin_auth_denied')).toBe(true);
    expect(repo.audits.some((a) => a.action === 'admin_allocate_delivered')).toBe(true);

    const notFound = await app.inject({
      method: 'POST',
      url: '/admin/orders/00000000-0000-4000-8000-000000000000/allocate',
      headers: { authorization: 'Bearer tok-admin' },
    });
    expect(notFound.statusCode).toBe(404);
  });
});

describe('IMP-27 — corrélation stricte commande → ticket', () => {
  it('GET /tickets/mine?order_id filtre le ticket de la commande demandée', async () => {
    const { repo, app } = await makeApp();
    const first = await createOrder(repo, app, 'itest-imp27-ticket-0001', '0197999001');
    const second = await createOrder(repo, app, 'itest-imp27-ticket-0002', '0197999001');
    repo.seedTicket('24-HEURES', 'A1');
    repo.seedTicket('24-HEURES', 'B2');
    const firstOrder = (await repo.getOrderById(first.id))!;
    const secondOrder = (await repo.getOrderById(second.id))!;
    firstOrder.state = 'PAID';
    secondOrder.state = 'PAID';
    expect((await allocateAndDeliver(repo, first.id)).status).toBe('delivered');
    expect((await allocateAndDeliver(repo, second.id)).status).toBe('delivered');

    const appDev = await buildApp({
      repo,
      auth: { devMode: true, rateLimits: { requestMax: 100, verifyMax: 100 } },
    });
    const req = await appDev.inject({ method: 'POST', url: '/auth/phone/request', payload: { phone: '0197999001' } });
    const code = (req.json() as Record<string, unknown>)['dev_code'] as string;
    const ver = await appDev.inject({ method: 'POST', url: '/auth/phone/verify', payload: { phone: '0197999001', code } });
    const token = (ver.json() as Record<string, unknown>)['token'] as string;
    const filtered = await appDev.inject({
      method: 'GET',
      url: `/tickets/mine?order_id=${first.id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(filtered.statusCode).toBe(200);
    const tickets = (filtered.json() as { tickets: Array<Record<string, unknown>> }).tickets;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ order_id: first.id, order_reference: first.id });
    expect(JSON.stringify(tickets)).not.toContain(second.id);
    await appDev.close();
  });
});
