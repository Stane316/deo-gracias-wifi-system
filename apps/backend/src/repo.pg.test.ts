/**
 * IMP-12 — Tests d'intégration RÉELS (PgRepo sur Postgres migré 0001→0009).
 * Exécutés seulement si DATABASE_URL est définie (CI : service postgres:17 ;
 * local : tools/db-migrate.sh up). Hygiène : fixtures nettoyées avant/après
 * (leçon IMP-09 : des fixtures orphelines font échouer les runs suivants).
 */
import { OFFERS } from '@dg/shared';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { PgRepo } from './repo.js';

const DATABASE_URL = process.env['DATABASE_URL'];
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('PgRepo + API sur Postgres réel (DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repo = new PgRepo(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;

  const cleanup = async (): Promise<void> => {
    await pool.query(`DELETE FROM public.orders WHERE idempotency_key LIKE 'itest-imp12-pg-%'`);
    await pool.query(`DELETE FROM public.customers WHERE phone LIKE '019711%'`);
  };

  beforeAll(async () => {
    await cleanup();
    app = await buildApp({ repo });
  });
  afterAll(async () => {
    await cleanup();
    await app.close();
    await pool.end();
  });

  const post = async (key: string, payload: object) =>
    app.inject({ method: 'POST', url: '/orders', headers: { 'idempotency-key': key }, payload });

  it('ping + readyz verts sur base migrée', async () => {
    const res = await app.inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /offers == Grille A officielle (parité plans 0008 ↔ shared OFFERS)', async () => {
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

  it('POST /orders persiste une ligne CREATED avec snapshot §09 (prix serveur)', async () => {
    const res = await post('itest-imp12-pg-0001', {
      offer_id: '12-HEURES',
      customer_phone: '0197110001',
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as Record<string, unknown>;
    const snapshot = body['plan_snapshot'] as Record<string, unknown>;
    expect(snapshot['price_snapshot']).toBe(200);
    expect(snapshot['currency_snapshot']).toBe('XOF');

    const db = await pool.query(
      `SELECT state, currency, plan_snapshot FROM public.orders WHERE id = $1`,
      [body['id'] as string],
    );
    expect(db.rows[0]?.['state']).toBe('CREATED');
    expect(db.rows[0]?.['currency']).toBe('XOF');
  });

  it("idempotence réelle : UNIQUE(idempotency_key) => replay 200 même id", async () => {
    const payload = { offer_id: '5-HEURES', customer_phone: '0197110002' };
    const first = await post('itest-imp12-pg-0002', payload);
    const replay = await post('itest-imp12-pg-0002', payload);
    expect(first.statusCode).toBe(201);
    expect(replay.statusCode).toBe(200);
    expect((replay.json() as Record<string, unknown>)['id']).toBe(
      (first.json() as Record<string, unknown>)['id'],
    );
    const count = await pool.query(
      `SELECT count(*)::int AS n FROM public.orders WHERE idempotency_key = 'itest-imp12-pg-0002'`,
    );
    expect(count.rows[0]?.['n']).toBe(1);
  });

  it('+229 et format national => même client (find-or-create atomique)', async () => {
    const a = await post('itest-imp12-pg-0003', {
      offer_id: '5-HEURES',
      customer_phone: '+2290197110003',
    });
    const b = await post('itest-imp12-pg-0004', {
      offer_id: '5-HEURES',
      customer_phone: '0197110003',
    });
    expect(a.statusCode).toBe(201);
    expect(b.statusCode).toBe(201);
    const customers = await pool.query(
      `SELECT count(*)::int AS n FROM public.customers WHERE phone = '0197110003'`,
    );
    expect(customers.rows[0]?.['n']).toBe(1);
  });

  it('GET /orders/:id relit la commande persistée', async () => {
    const created = await post('itest-imp12-pg-0005', {
      offer_id: '24-HEURES',
      customer_phone: '0197110004',
    });
    const id = (created.json() as Record<string, unknown>)['id'] as string;
    const res = await app.inject({ method: 'GET', url: `/orders/${id}` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id, state: 'CREATED', offer_id: '24-HEURES' });
  });
});
