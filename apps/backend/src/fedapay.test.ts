/**
 * IMP-14 — Tests unitaires du module FedaPay.
 * La vérification de signature réplique le SDK officiel fedapay-node 1.2.5
 * (Webhook.ts) : ces tests valident notre implémentation contre le même contrat
 * (format t=…,s=…, HMAC-SHA256 hex sur `${t}.${rawBody}`, tolérance 300 s).
 */
import { describe, expect, it } from 'vitest';
import {
  computeWebhookSignature,
  FedaPayClient,
  generateTestHeaderString,
  parseWebhookEvent,
  verifyWebhookSignature,
} from './fedapay.js';

const SECRET = 'wh_sandbox_test_secret';
const BODY = JSON.stringify({ id: 42, name: 'transaction.approved', entity: { reference: 'REF1' } });

describe('verifyWebhookSignature (contrat SDK officiel)', () => {
  it('valide une signature correcte (aller-retour compute/generate/verify)', () => {
    const now = 1_800_000_000;
    const header = generateTestHeaderString({ payload: BODY, secret: SECRET, timestamp: now });
    expect(header).toMatch(/^t=1800000000,s=[0-9a-f]{64}$/);
    const res = verifyWebhookSignature(BODY, header, SECRET, { nowS: now });
    expect(res).toMatchObject({ valid: true, timestamp: now });
  });

  it('rejette un corps altéré (1 octet de différence)', () => {
    const now = 1_800_000_000;
    const header = generateTestHeaderString({ payload: BODY, secret: SECRET, timestamp: now });
    const tampered = BODY.replace('approved', 'approveX');
    expect(verifyWebhookSignature(tampered, header, SECRET, { nowS: now })).toMatchObject({
      valid: false,
      reason: 'signature invalide',
    });
  });

  it('rejette un mauvais secret', () => {
    const now = 1_800_000_000;
    const header = generateTestHeaderString({ payload: BODY, secret: SECRET, timestamp: now });
    expect(verifyWebhookSignature(BODY, header, 'wh_autre_secret', { nowS: now })).toMatchObject({
      valid: false,
    });
  });

  it('rejette un horodatage hors tolérance (anti-replay, défaut 300 s)', () => {
    const old = 1_800_000_000;
    const header = generateTestHeaderString({ payload: BODY, secret: SECRET, timestamp: old });
    const res = verifyWebhookSignature(BODY, header, SECRET, { nowS: old + 301 });
    expect(res.valid).toBe(false);
    if (!res.valid) expect(res.reason).toContain('tolérance');
    // Dans la tolérance => accepté
    expect(verifyWebhookSignature(BODY, header, SECRET, { nowS: old + 299 }).valid).toBe(true);
  });

  it('rejette un en-tête absent/malformé/sans schéma s=', () => {
    expect(verifyWebhookSignature(BODY, undefined, SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(BODY, '', SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(BODY, 'garbage', SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(BODY, 't=abc,s=ff', SECRET).valid).toBe(false);
    expect(verifyWebhookSignature(BODY, 't=1800000000,v1=ff', SECRET).valid).toBe(false);
  });

  it('computeWebhookSignature = HMAC-SHA256 hex de `${t}.${body}` (source SDK)', () => {
    const sig = computeWebhookSignature('payload', 'secret', 123);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
    expect(sig).toBe(computeWebhookSignature('payload', 'secret', 123)); // déterministe
    expect(sig).not.toBe(computeWebhookSignature('payload2', 'secret', 123));
  });
});

describe('parseWebhookEvent', () => {
  it('accepte name OU type, id OU object_id ; extrait entity + custom_metadata', () => {
    const ev = parseWebhookEvent({
      id: 7,
      name: 'transaction.approved',
      entity: {
        id: 99,
        reference: 'REF-99',
        amount: 300,
        status: 'approved',
        currency: { iso: 'XOF' },
        custom_metadata: { payment_id: 'pay-uuid', order_id: 'ord-uuid' },
      },
    });
    expect(ev).not.toBeNull();
    expect(ev?.eventId).toBe('7');
    expect(ev?.eventName).toBe('transaction.approved');
    expect(ev?.reference).toBe('REF-99');
    expect(ev?.amount).toBe(300);
    expect(ev?.currencyIso).toBe('XOF');
    expect(ev?.metadataPaymentId).toBe('pay-uuid');

    const ev2 = parseWebhookEvent({ object_id: 8, type: 'transaction.declined', entity: { currency: 'XOF' } });
    expect(ev2?.eventId).toBe('8');
    expect(ev2?.eventName).toBe('transaction.declined');
    expect(ev2?.currencyIso).toBe('XOF');
  });

  it('rejette un payload sans id ou sans name/type', () => {
    expect(parseWebhookEvent({ name: 'transaction.approved' })).toBeNull();
    expect(parseWebhookEvent({ id: 1 })).toBeNull();
    expect(parseWebhookEvent(null)).toBeNull();
    expect(parseWebhookEvent('chaine')).toBeNull();
  });
});

describe('FedaPayClient (fetch stubbé — aucun appel réseau réel)', () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const stubFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const u = String(url);
    calls.push({ url: u, init: init ?? {} });
    if (u.endsWith('/transactions') && init?.method === 'POST') {
      return new Response(
        JSON.stringify({ id: 555, reference: 'REF-555', amount: 300, status: 'pending' }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      );
    }
    if (u.endsWith('/transactions/555/token')) {
      return new Response(JSON.stringify({ token: 'tok', url: 'https://pay.fedapay.com/x' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };

  it('POST /v1/transactions : Bearer secret, montant entier, XOF, phone +229, metadata ; puis /token', async () => {
    calls.length = 0;
    const client = new FedaPayClient({ secretKey: 'sk_test', fetchImpl: stubFetch });
    const res = await client.createCheckout({
      orderId: 'ord-1',
      paymentId: 'pay-1',
      amountFcfa: 300,
      phone: '0197000001',
      description: 'Test',
    });
    expect(res.providerRef).toBe('REF-555');
    expect(res.redirectUrl).toBe('https://pay.fedapay.com/x');

    expect(calls[0]?.url).toBe('https://sandbox-api.fedapay.com/v1/transactions');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer sk_test');
    const body = JSON.parse(String(calls[0]?.init.body)) as Record<string, unknown>;
    expect(body['amount']).toBe(300);
    expect(body['currency']).toEqual({ iso: 'XOF' });
    expect(body['customer']).toEqual({ phone_number: { number: '+2290197000001', country: 'bj' } });
    expect(body['custom_metadata']).toEqual({ order_id: 'ord-1', payment_id: 'pay-1' });
    expect(calls[1]?.url).toBe('https://sandbox-api.fedapay.com/v1/transactions/555/token');
  });

  it('environment live => api.fedapay.com ; erreur HTTP => throw (502 côté route)', async () => {
    calls.length = 0;
    const notFound: typeof fetch = async (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      return new Response('not found', { status: 404 });
    };
    const live = new FedaPayClient({ secretKey: 'sk_live', environment: 'live', fetchImpl: notFound });
    await expect(
      live.createCheckout({ orderId: 'o', paymentId: 'p', amountFcfa: 100, phone: '0197000001', description: 'd' }),
    ).rejects.toThrow(/HTTP 404/);
    expect(calls[0]?.url).toBe('https://api.fedapay.com/v1/transactions');
  });
});
