/**
 * IMP-12 — Tests unitaires de l'API (Fastify.inject + fake repo en mémoire).
 * Normatifs : prix côté serveur (doc 10 §10.3), idempotence (doc 06 §21),
 * snapshot §09, RFC 7807, catalogue Grille A.
 */
import { OFFERS } from '@dg/shared';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { ActivePlan, BackendRepo, CreateOrderInputDb, OrderRecord } from './repo.js';
import { buildPlanSnapshot } from './repo.js';

class FakeRepo implements BackendRepo {
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
  async close(): Promise<void> {}
}

const repo = new FakeRepo();
const app = await buildApp({ repo });

const VALID_BODY = { offer_id: '24-HEURES', customer_phone: '0197000001' };
const KEY = 'itest-imp12-unit-key-0001';

afterEach(() => {
  repo.pingFails = false;
});

describe('GET /healthz', () => {
  it("répond 200 sans dépendre de la base", async () => {
    repo.pingFails = true; // healthz doit rester vert même base KO
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ok', app: 'dg-backend' });
  });
});

describe('GET /readyz', () => {
  it('répond 200 quand la base répond', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: 'ready' });
  });
  it('répond 503 au format RFC 7807 quand la base est KO', async () => {
    repo.pingFails = true;
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ type: 'about:blank', status: 503 });
  });
});

describe('GET /offers', () => {
  it('sert la Grille A depuis le dépôt (6 offres, champs exacts)', async () => {
    const res = await app.inject({ method: 'GET', url: '/offers' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Array<Record<string, unknown>>;
    expect(body).toHaveLength(OFFERS.length);
    for (const offer of OFFERS) {
      expect(body).toContainEqual(
        expect.objectContaining({
          id: offer.id,
          priceFcfa: offer.priceFcfa,
          accessHours: offer.accessHours,
          validityHours: offer.validityHours,
          mikrotikProfile: offer.mikrotikProfile,
          limitUptime: offer.limitUptime,
        }),
      );
    }
  });
});

describe('POST /orders', () => {
  it('crée une commande CREATED avec snapshot prix SERVEUR (doc 10 §10.3)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': KEY },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    expect(body['state']).toBe('CREATED');
    expect(body['currency']).toBe('XOF');
    expect(body['offer_id']).toBe('24-HEURES');
    const snapshot = body['plan_snapshot'] as Record<string, unknown>;
    // Clés doc 06 §09
    expect(snapshot['price_snapshot']).toBe(300); // prix Grille A, jamais fourni par le client
    expect(snapshot['currency_snapshot']).toBe('XOF');
    expect(snapshot['plan_name_snapshot']).toBe('24-HEURES');
    expect(snapshot['access_duration_snapshot']).toBe(24);
    expect(snapshot['validity_duration_snapshot']).toBe(48);
    expect(snapshot['mikrotik_profile']).toBe('24-HEURES');
    expect(snapshot['limit_uptime']).toBe('1d00:00:00');
  });

  it('rejoue la même Idempotency-Key => 200 et même commande (doc 06 §21)', async () => {
    const first = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0002' },
      payload: VALID_BODY,
    });
    const replay = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0002' },
      payload: VALID_BODY,
    });
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as Record<string, unknown>)['id']).toBe(
      (first.json() as Record<string, unknown>)['id'],
    );
  });

  it("refuse une création sans Idempotency-Key (400 problem+json)", async () => {
    const res = await app.inject({ method: 'POST', url: '/orders', payload: VALID_BODY });
    expect(res.statusCode).toBe(400);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 400, title: 'En-tête Idempotency-Key invalide' });
  });

  it('refuse une clé trop courte (< 8 caractères)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'abc' },
      payload: VALID_BODY,
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuse un prix fourni par le client (body strict, doc 10 §10.3)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0003' },
      payload: { ...VALID_BODY, price_fcfa: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ title: 'Payload invalide' });
  });

  it("refuse un offer_id hors Grille A (ex. 5000F inexistant)", async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0004' },
      payload: { offer_id: '5000-FCFA', customer_phone: '0197000002' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('refuse un téléphone non Bénin et normalise +229 (même client)', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0005' },
      payload: { offer_id: '5-HEURES', customer_phone: '12345' },
    });
    expect(bad.statusCode).toBe(400);

    const before = repo.customers.size;
    const intl = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0006' },
      payload: { offer_id: '5-HEURES', customer_phone: '+2290197000003' },
    });
    expect(intl.statusCode).toBe(201);
    expect(repo.customers.has('0197000003')).toBe(true); // +229 normalisé
    const national = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0007' },
      payload: { offer_id: '5-HEURES', customer_phone: '0197000003' },
    });
    expect(national.statusCode).toBe(201);
    expect(repo.customers.size).toBe(before + 1); // un seul client pour les deux formats
  });

  it("répond 404 problem+json si aucun plan actif pour l'offre", async () => {
    const saved = repo.plans;
    repo.plans = [];
    const res = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0008' },
      payload: VALID_BODY,
    });
    repo.plans = saved;
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ status: 404, title: 'Offre introuvable' });
  });
});

describe('GET /orders/:id', () => {
  it('retourne la commande créée', async () => {
    const created = await app.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp12-unit-key-0009' },
      payload: VALID_BODY,
    });
    const id = (created.json() as Record<string, unknown>)['id'] as string;
    const res = await app.inject({ method: 'GET', url: `/orders/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, state: 'CREATED', offer_id: '24-HEURES' });
  });

  it('répond 404 problem+json pour un UUID inconnu', async () => {
    const res = await app.inject({ method: 'GET', url: `/orders/${randomUUID()}` });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ status: 404, title: 'Commande introuvable' });
  });

  it('répond 400 pour un id non-UUID', async () => {
    const res = await app.inject({ method: 'GET', url: '/orders/pas-un-uuid' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ title: 'Paramètre invalide' });
  });
});

describe('erreurs transverses', () => {
  it('route inconnue => 404 RFC 7807', async () => {
    const res = await app.inject({ method: 'GET', url: '/nope' });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ type: 'about:blank', status: 404 });
  });
});

describe('rate-limit (règle transverse blueprint §5)', () => {
  it('dépassement par IP => 429 problem+json', async () => {
    const limited = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 3 } });
    for (let i = 0; i < 3; i++) {
      const ok = await limited.inject({ method: 'GET', url: '/healthz' });
      expect(ok.statusCode).toBe(200);
    }
    const blocked = await limited.inject({ method: 'GET', url: '/healthz' });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['content-type']).toContain('application/problem+json');
    await limited.close();
  });
});

describe('buildPlanSnapshot', () => {
  it('fige les paramètres commerciaux (doc 06 §09)', () => {
    const plan = repo.plans[0];
    expect(plan).toBeDefined();
    const snap = buildPlanSnapshot(plan!);
    expect(snap['price_snapshot']).toBe(plan!.priceFcfa);
    expect(snap['plan_version']).toBe(1);
  });
});
