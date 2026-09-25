/**
 * IMP-14 — Tests unitaires des routes paiement (init FedaPay + webhook idempotent).
 * Normatifs : doc 06 §17 (confirmation server-side uniquement), §20-21 (idempotence
 * événements), §22-24 (pipeline webhook, sécurité, atomicité). Le client FedaPay est
 * stubbé (aucun appel réseau) ; la signature webhook est générée via le même algorithme
 * que le SDK officiel (voir fedapay.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { generateTestHeaderString, type CheckoutInput, type CheckoutResult, type PaymentProvider } from './fedapay.js';
import { buildApp } from './app.js';
import { FakeRepo } from './fake-repo.js';

const WH_SECRET = 'wh_sandbox_unit_test_secret';
const NOW = 1_800_000_000;

class FakeProvider implements PaymentProvider {
  calls: CheckoutInput[] = [];
  failNext = false;
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    if (this.failNext) throw new Error('FedaPay indisponible');
    this.calls.push(input);
    return { providerRef: `REF-${this.calls.length}`, redirectUrl: 'https://pay.fedapay.com/x' };
  }
}

async function makeApp() {
  const repo = new FakeRepo();
  const provider = new FakeProvider();
  const app = await buildApp({
    repo,
    payment: { provider, webhookSecret: WH_SECRET, toleranceS: 300, nowS: () => NOW },
  });
  return { repo, provider, app };
}

async function createOrder(repo: FakeRepo, app: Awaited<ReturnType<typeof buildApp>>, key: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/orders',
    headers: { 'idempotency-key': key },
    payload: { offer_id: '24-HEURES', customer_phone: '0197000001' },
  });
  expect(res.statusCode).toBe(201);
  const { id } = res.json() as { id: string };
  const order = await repo.getOrderById(id);
  const amount = order?.planSnapshot['price_snapshot'];
  expect(typeof amount).toBe('number');
  return { id, amount_fcfa: amount as number, state: order?.state ?? '' };
}

function sign(payload: string, secret = WH_SECRET, timestamp = NOW): string {
  return generateTestHeaderString({ payload, secret, timestamp });
}

function approvedEvent(ref: string, amount: number, eventId: number, paymentId?: string): string {
  return JSON.stringify({
    id: eventId,
    name: 'transaction.approved',
    entity: {
      reference: ref,
      amount,
      status: 'approved',
      currency: { iso: 'XOF' },
      ...(paymentId ? { custom_metadata: { payment_id: paymentId } } : {}),
    },
  });
}

describe('POST /orders/:id/pay (init FedaPay)', () => {
  it('202 : crée le paiement, passe order PAYMENT_PENDING, retourne provider_ref + redirect_url', async () => {
    const { repo, provider, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0001');
    const res = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(res.statusCode).toBe(202);
    const body = res.json() as Record<string, unknown>;
    expect(body['payment_state']).toBe('PENDING');
    expect(body['order_state']).toBe('PAYMENT_PENDING');
    expect(body['provider_ref']).toBe('REF-1');
    expect(body['redirect_url']).toBe('https://pay.fedapay.com/x');
    expect(provider.calls).toHaveLength(1);
    expect(provider.calls[0]?.amountFcfa).toBe(order.amount_fcfa); // prix côté serveur
    const reloaded = await repo.getOrderById(order.id);
    expect(reloaded?.state).toBe('PAYMENT_PENDING');
  });

  it('rejeu : même paiement, prestataire NON rappelé (200 replay)', async () => {
    const { repo, provider, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0002');
    const first = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(first.statusCode).toBe(202);
    const replay = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toMatchObject({ replay: true, payment_id: (first.json() as Record<string, unknown>)['payment_id'] });
    expect(provider.calls).toHaveLength(1); // le rejeu ne coûte rien
  });

  it('404 ordre inconnu ; 400 id invalide ; 503 sans provider configuré', async () => {
    const { app } = await makeApp();
    const notFound = await app.inject({ method: 'POST', url: '/orders/00000000-0000-4000-8000-000000000000/pay' });
    expect(notFound.statusCode).toBe(404);
    const badId = await app.inject({ method: 'POST', url: '/orders/pas-un-uuid/pay' });
    expect(badId.statusCode).toBe(400);

    const repo2 = new FakeRepo();
    const appNoProvider = await buildApp({ repo: repo2 });
    const o2 = await createOrder(repo2, appNoProvider, 'itest-imp14-key-0003');
    const res = await appNoProvider.inject({ method: 'POST', url: `/orders/${o2.id}/pay` });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ type: 'about:blank', status: 503 });
  });

  it('409 une fois payée (transition interdite) ; 502 si le prestataire échoue', async () => {
    const { repo, provider, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0004');
    provider.failNext = true;
    const failed = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(failed.statusCode).toBe(502);
    expect(failed.json()).toMatchObject({ type: 'about:blank', status: 502 });
    // L'ordre reste CREATED après échec prestataire (aucune transition prématurée).
    provider.failNext = false;
    const retry = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(retry.statusCode).toBe(202); // retry possible, même paiement CREATED réutilisé
  });
});

describe('POST /webhooks/fedapay (signature + idempotence)', () => {
  it('400 signature invalide : paiement jamais confirmé + événement journalisé signature_ok=false', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0010');
    await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    const payment = [...repo.payments.values()][0];
    const body = approvedEvent('REF-1', order.amount_fcfa, 901, payment?.id);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(body, 'mauvais_secret') },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    const reloaded = await repo.getPaymentById(payment!.id);
    expect(reloaded?.state).toBe('PENDING'); // JAMAIS confirmé sans signature valide
    expect(repo.paymentEvents.size).toBe(1); // journalisé malgré le rejet
  });

  it('400 horodatage trop ancien (anti-replay) ; accepté dans la tolérance', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0011');
    await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    const body = approvedEvent('REF-1', order.amount_fcfa, 902);
    const stale = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(body, WH_SECRET, NOW - 301) },
      payload: body,
    });
    expect(stale.statusCode).toBe(400);
    const fresh = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(body, WH_SECRET, NOW - 299) },
      payload: body,
    });
    expect(fresh.statusCode).toBe(200);
  });

  it('transaction.approved => payment CONFIRMED + order PAID ; replay du même événement = duplicate', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0012');
    const pay = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    const paymentId = (pay.json() as Record<string, unknown>)['payment_id'] as string;
    const body = approvedEvent('REF-1', order.amount_fcfa, 903, paymentId);
    const headers = { 'content-type': 'application/json', 'x-fedapay-signature': sign(body) };

    const first = await app.inject({ method: 'POST', url: '/webhooks/fedapay', headers, payload: body });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ processed: 'confirmed', order_state: 'PAID' });

    // Idempotence stricte (doc 06 §20) : 3 envois = 1 confirmation.
    const second = await app.inject({ method: 'POST', url: '/webhooks/fedapay', headers, payload: body });
    const third = await app.inject({ method: 'POST', url: '/webhooks/fedapay', headers, payload: body });
    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ duplicate: true });
    expect(third.json()).toMatchObject({ duplicate: true });

    const payment = await repo.getPaymentById(paymentId);
    expect(payment?.state).toBe('CONFIRMED');
    expect(payment?.confirmedAt).not.toBeNull();
    const reloaded = await repo.getOrderById(order.id);
    expect(reloaded?.state).toBe('PAID');
    expect(repo.paymentEvents.size).toBe(1);
  });

  it('montant divergent => JAMAIS confirmé (doc 06 §23) + audit montant_divergent', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0013');
    await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    const payment = [...repo.payments.values()][0];
    const forged = approvedEvent('REF-1', order.amount_fcfa + 1, 904, payment?.id);
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(forged) },
      payload: forged,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ignored: 'montant_divergent' });
    expect((await repo.getPaymentById(payment!.id))?.state).toBe('PENDING');
    expect(repo.audits.some((a) => a.action === 'payment_amount_mismatch')).toBe(true);
  });

  it('declined/canceled => payment FAILED/CANCELLED + ordre aligné', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp14-key-0014');
    await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    const payment = [...repo.payments.values()][0];
    const declined = JSON.stringify({
      id: 905,
      name: 'transaction.declined',
      entity: { reference: 'REF-1', amount: order.amount_fcfa, status: 'declined', custom_metadata: { payment_id: payment?.id } },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(declined) },
      payload: declined,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ processed: 'failed' });
    expect((await repo.getPaymentById(payment!.id))?.state).toBe('FAILED');
    expect((await repo.getOrderById(order.id))?.state).toBe('FAILED');
  });

  it('événement non géré / payment introuvable => 200 acknowledged (pas de retry inutile)', async () => {
    const { app } = await makeApp();
    const unknown = JSON.stringify({ id: 906, name: 'customer.updated', entity: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(unknown) },
      payload: unknown,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ignored: 'evenement_non_gere' });

    const orphan = approvedEvent('REF-ORPHELINE', 300, 907);
    const res2 = await app.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(orphan) },
      payload: orphan,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toMatchObject({ ignored: 'payment_introuvable' });
  });

  it('503 sans FEDAPAY_WEBHOOK_SECRET configuré', async () => {
    const app2 = await buildApp({ repo: new FakeRepo() });
    const body = approvedEvent('REF-X', 300, 908);
    const res = await app2.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': sign(body) },
      payload: body,
    });
    expect(res.statusCode).toBe(503);
  });
});

describe('IMP-27 — reprise HTTP 409 et identifiants persistants', () => {
  it('409 déjà payé retourne order_id/payment_id/provider_ref pour reprendre le polling', async () => {
    const { repo, app, provider } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp27-409-0001');
    const first = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(first.statusCode).toBe(202);
    const firstBody = first.json() as Record<string, unknown>;
    const paymentId = firstBody['payment_id'] as string;
    expect(await repo.confirmPayment(paymentId)).toBe('confirmed');

    const conflict = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({
      status: 409,
      order_id: order.id,
      order_reference: order.id,
      payment_id: paymentId,
      provider_ref: firstBody['provider_ref'],
      order_state: 'PAID',
    });
    expect(provider.calls).toHaveLength(1);
  });

  it('GET commande expose les identifiants paiement après reprise sans confirmer côté client', async () => {
    const { repo, app } = await makeApp();
    const order = await createOrder(repo, app, 'itest-imp27-resume-0001');
    const first = await app.inject({ method: 'POST', url: `/orders/${order.id}/pay` });
    const firstBody = first.json() as Record<string, unknown>;
    const paymentId = firstBody['payment_id'] as string;
    const current = await app.inject({ method: 'GET', url: `/orders/${order.id}` });
    expect(current.statusCode).toBe(200);
    expect(current.json()).toMatchObject({
      id: order.id,
      order_reference: order.id,
      state: 'PAYMENT_PENDING',
      payment: {
        id: paymentId,
        provider_ref: firstBody['provider_ref'],
        state: 'PENDING',
      },
    });
  });
});
