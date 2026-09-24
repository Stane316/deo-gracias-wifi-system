/**
 * IMP-25 — Modes DÉMO LOCALE (jamais en production) :
 * - DevStaticAuthVerifier : jeton statique => rôle ADMIN (auth admin sans Supabase) ;
 * - DevPaymentProvider + POST /webhooks/dev-approve : chaîne complète
 *   commande => paiement DEV => approbation => ticket livré, en mémoire.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { DevStaticAuthVerifier } from './auth.js';
import { DevPaymentProvider } from './dev-payment.js';
import { FakeRepo } from './fake-repo.js';

const ADMIN_TOKEN = 'itest-imp25-admin-token';

const makeApp = async () => {
  const repo = new FakeRepo();
  const app = await buildApp({
    repo,
    auth: { verifier: new DevStaticAuthVerifier(ADMIN_TOKEN), devMode: true },
    payment: { provider: new DevPaymentProvider(), devMode: true },
  });
  return { repo, app };
};

describe('IMP-25 — DevStaticAuthVerifier', () => {
  it('jeton exact => identité ADMIN ; autre jeton => null', async () => {
    const verifier = new DevStaticAuthVerifier(ADMIN_TOKEN);
    expect(await verifier.verify(ADMIN_TOKEN)).toMatchObject({ role: 'ADMIN', sub: 'dev-admin' });
    expect(await verifier.verify('mauvais-jeton')).toBeNull();
  });

  it('GET /admin/me répond 200 avec le jeton DEV, 401 sinon', async () => {
    const { app } = await makeApp();
    try {
      const ok = await app.inject({ method: 'GET', url: '/admin/me', headers: { authorization: `Bearer ${ADMIN_TOKEN}` } });
      expect(ok.statusCode).toBe(200);
      expect(ok.json()).toMatchObject({ role: 'ADMIN' });
      const ko = await app.inject({ method: 'GET', url: '/admin/me', headers: { authorization: 'Bearer nope' } });
      expect(ko.statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });
});

describe('IMP-25 — chaîne démo : commande => paiement DEV => approbation => ticket livré', () => {
  it('E2E mémoire : /orders -> /pay -> /webhooks/dev-approve -> DELIVERED', async () => {
    const { app, repo } = await makeApp();
    repo.seedTicket('5-HEURES');
    try {
      const orderRes = await app.inject({
        method: 'POST', url: '/orders',
        headers: { 'idempotency-key': `itest-imp25-${randomUUID()}` },
        payload: { offer_id: '5-HEURES', customer_phone: '0197250001' },
      });
      expect(orderRes.statusCode).toBe(201);
      const orderId = (orderRes.json() as Record<string, unknown>)['id'] as string;

      const payRes = await app.inject({ method: 'POST', url: `/orders/${orderId}/pay` });
      expect(payRes.statusCode).toBe(202);
      const pay = payRes.json() as Record<string, unknown>;
      expect(String(pay['provider_ref'])).toMatch(/^DEV-/);
      const paymentId = pay['payment_id'] as string;

      const approveRes = await app.inject({
        method: 'POST', url: '/webhooks/dev-approve',
        payload: { payment_id: paymentId },
      });
      expect(approveRes.statusCode).toBe(200);
      expect(approveRes.json()).toMatchObject({ processed: 'confirmed', delivery: 'delivered' });

      const orderAfter = await app.inject({ method: 'GET', url: `/orders/${orderId}` });
      expect(orderAfter.statusCode).toBe(200);
      expect(orderAfter.json()).toMatchObject({ state: 'DELIVERED' });

      // Rejeu : la seconde approbation ne refait rien (transition illégale).
      const replay = await app.inject({
        method: 'POST', url: '/webhooks/dev-approve',
        payload: { payment_id: paymentId },
      });
      expect(replay.statusCode).toBe(200);
      expect(replay.json()).toMatchObject({ ignored: 'transition_illegale' });
    } finally {
      await app.close();
    }
  });

  it("garde-fous : paiement non-DEV refusé, body invalide 400, id inconnu 404", async () => {
    const { app, repo } = await makeApp();
    try {
      // Paiement « réel » simulé (réf sans préfixe DEV) => refus 409.
      const orderRes = await app.inject({
        method: 'POST', url: '/orders',
        headers: { 'idempotency-key': `itest-imp25-${randomUUID()}` },
        payload: { offer_id: '5-HEURES', customer_phone: '0197250002' },
      });
      const orderId = (orderRes.json() as Record<string, unknown>)['id'] as string;
      const payment = await repo.createPayment(orderId, 500);
      await repo.markPaymentAwaitingResult(payment.id, 'REF-REEL-001');
      const refused = await app.inject({
        method: 'POST', url: '/webhooks/dev-approve',
        payload: { payment_id: payment.id },
      });
      expect(refused.statusCode).toBe(409);

      const bad = await app.inject({ method: 'POST', url: '/webhooks/dev-approve', payload: {} });
      expect(bad.statusCode).toBe(400);
      const missing = await app.inject({
        method: 'POST', url: '/webhooks/dev-approve',
        payload: { payment_id: randomUUID() },
      });
      expect(missing.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('sans devMode la route dev-approve ne répond pas 404 de route (404 fastify)', async () => {
    const repo = new FakeRepo();
    const app = await buildApp({ repo, payment: { provider: new DevPaymentProvider() } });
    try {
      const res = await app.inject({
        method: 'POST', url: '/webhooks/dev-approve',
        payload: { payment_id: randomUUID() },
      });
      expect(res.statusCode).toBe(404); // route non montée
    } finally {
      await app.close();
    }
  });
});
