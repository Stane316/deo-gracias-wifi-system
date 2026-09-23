/**
 * IMP-12 — Tests d'intégration RÉELS (PgRepo sur Postgres migré 0001→0009).
 * Exécutés seulement si DATABASE_URL est définie (CI : service postgres:17 ;
 * local : tools/db-migrate.sh up). Hygiène : fixtures nettoyées avant/après
 * (leçon IMP-09 : des fixtures orphelines font échouer les runs suivants).
 */
import { OFFERS } from '@dg/shared';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { AuthIdentity, AuthVerifier } from './auth.js';
import { generateTestHeaderString, type CheckoutInput, type CheckoutResult, type PaymentProvider } from './fedapay.js';
import { PgRepo } from './repo.js';

class FakeVerifier implements AuthVerifier {
  identities = new Map<string, AuthIdentity>();
  async verify(token: string): Promise<AuthIdentity | null> {
    return this.identities.get(token) ?? null;
  }
}

const DATABASE_URL = process.env['DATABASE_URL'];
const describeDb = DATABASE_URL ? describe : describe.skip;

describeDb('PgRepo + API sur Postgres réel (DATABASE_URL)', () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const repo = new PgRepo(pool);
  let app: Awaited<ReturnType<typeof buildApp>>;

  const cleanup = async (): Promise<void> => {
    await pool.query(`DELETE FROM public.orders WHERE idempotency_key LIKE 'itest-imp12-pg-%'`);
    // audit_logs est insert-only (trigger deny_audit_mutation) : les lignes de test
    // portent un sub aléatoire itest-imp13-… et ne sont jamais nettoyées (par conception).
    await pool.query(`DELETE FROM public.customers WHERE phone LIKE '019711%' OR phone LIKE '019712%'`);
  };

  const verifier = new FakeVerifier();

  beforeAll(async () => {
    await cleanup();
    app = await buildApp({
      repo,
      auth: {
        verifier,
        devMode: true,
        rateLimits: { requestMax: 1000, verifyMax: 1000 },
      },
    });
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

  it('OTP dev complet : request → verify → client persisté → /auth/me → logout', async () => {
    const req = await app.inject({
      method: 'POST',
      url: '/auth/phone/request',
      payload: { phone: '0197120001' },
    });
    expect(req.statusCode).toBe(202);
    const code = (req.json() as Record<string, unknown>)['dev_code'] as string;
    const ver = await app.inject({
      method: 'POST',
      url: '/auth/phone/verify',
      payload: { phone: '0197120001', code },
    });
    expect(ver.statusCode).toBe(200);
    const token = (ver.json() as Record<string, unknown>)['token'] as string;
    const db = await pool.query(`SELECT id FROM public.customers WHERE phone = '0197120001'`);
    expect(db.rows).toHaveLength(1);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ auth: 'phone-session', phone: '0197120001' });

    const out = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(out.statusCode).toBe(204);
    const me2 = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me2.statusCode).toBe(401);
  });

  it('JWT Supabase avec phone : liaison auth_user_id persistée (RLS own-rows)', async () => {
    // auth_user_id est un uuid en base : sub = uuid pur (le préfixe itest- cassait le cast).
    const sub = randomUUID();
    verifier.identities.set('tok-pg-cli', { sub, phone: '+2290197120002', email: null, role: null });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: 'Bearer tok-pg-cli' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ auth: 'supabase', phone: '0197120002' });
    const db = await pool.query(
      `SELECT auth_user_id::text FROM public.customers WHERE phone = '0197120002'`,
    );
    expect(db.rows[0]?.['auth_user_id']).toBe(sub);
  });

  it('admin : connexion auditée dans audit_logs (ok + denied, doc 09 §8)', async () => {
    const subAdmin = randomUUID();
    verifier.identities.set('tok-pg-admin', { sub: subAdmin, phone: null, email: null, role: 'ADMIN' });
    verifier.identities.set('tok-pg-user', { sub: subAdmin, phone: null, email: null, role: null });

    const ok = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { authorization: 'Bearer tok-pg-admin' },
    });
    expect(ok.statusCode).toBe(200);
    const denied = await app.inject({
      method: 'GET',
      url: '/admin/me',
      headers: { authorization: 'Bearer tok-pg-user' },
    });
    expect(denied.statusCode).toBe(403);

    const audit = await pool.query(
      `SELECT action FROM public.audit_logs WHERE entity = 'auth' AND entity_id = $1 ORDER BY at`,
      [subAdmin],
    );
    expect(audit.rows.map((r) => r['action'])).toEqual(['admin_auth_ok', 'admin_auth_denied']);
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

// ---------------------------------------------------------------------------
// IMP-14 — Paiements FedaPay sur Postgres réel : init + webhook signé idempotent.
// Fixtures : clés itest-imp14-pg-%, téléphones 019714%, event ids itest-imp14-pg:<uuid>.
// payment_events est nettoyable ici (pas de trigger deny, contrairement à audit_logs).
// ---------------------------------------------------------------------------
class FakeProviderPg implements PaymentProvider {
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return { providerRef: `REF-PG-${randomUUID().slice(0, 8)}`, redirectUrl: 'https://pay.fedapay.com/x' };
  }
}

describeDb('IMP-14 — paiements + webhooks sur Postgres réel', () => {
  const pool2 = new Pool({ connectionString: DATABASE_URL });
  const repo2 = new PgRepo(pool2);
  const WH_SECRET = 'wh_sandbox_pg_integration';
  let payApp: Awaited<ReturnType<typeof buildApp>>;

  const cleanup14 = async (): Promise<void> => {
    // Portée large : clés itest-imp14-pg-% ET téléphones 019714% (un test interrompu
    // ou un script de debug ne doit jamais bloquer les runs suivants — leçon IMP-09).
    await pool2.query(
      `DELETE FROM public.payment_events
       WHERE provider_event_id LIKE 'fedapay:itest-imp14-pg:%'
          OR payment_id IN (
            SELECT p.id FROM public.payments p
            JOIN public.orders o ON o.id = p.order_id
            JOIN public.customers c ON c.id = o.customer_id
            WHERE c.phone LIKE '019714%')`,
    );
    await pool2.query(
      `DELETE FROM public.payments WHERE order_id IN (
         SELECT o.id FROM public.orders o
         JOIN public.customers c ON c.id = o.customer_id
         WHERE c.phone LIKE '019714%' OR o.idempotency_key LIKE 'itest-imp14-pg-%')`,
    );
    await pool2.query(
      `DELETE FROM public.orders
       WHERE idempotency_key LIKE 'itest-imp14-pg-%'
          OR customer_id IN (SELECT id FROM public.customers WHERE phone LIKE '019714%')`,
    );
    await pool2.query(`DELETE FROM public.customers WHERE phone LIKE '019714%'`);
  };

  beforeAll(async () => {
    await cleanup14();
    payApp = await buildApp({ repo: repo2, payment: { provider: new FakeProviderPg(), webhookSecret: WH_SECRET } });
  });
  afterAll(async () => {
    await cleanup14();
    await payApp.close();
    await pool2.end();
  });

  const createOrder14 = async (key: string, phone: string) => {
    const res = await payApp.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': key },
      payload: { offer_id: '24-HEURES', customer_phone: phone },
    });
    expect(res.statusCode).toBe(201);
    const { id } = res.json() as { id: string };
    const order = await repo2.getOrderById(id);
    return { id, amount_fcfa: order?.planSnapshot['price_snapshot'] as number };
  };

  const pay = async (orderId: string) => {
    const res = await payApp.inject({ method: 'POST', url: `/orders/${orderId}/pay` });
    expect(res.statusCode).toBe(202);
    return res.json() as Record<string, unknown>;
  };

  const sendEvent = (eventId: string, name: string, ref: string, amount: number, paymentId?: string) => {
    const body = JSON.stringify({
      id: eventId,
      name,
      entity: {
        reference: ref,
        amount,
        status: name === 'transaction.approved' ? 'approved' : 'declined',
        currency: { iso: 'XOF' },
        ...(paymentId ? { custom_metadata: { payment_id: paymentId } } : {}),
      },
    });
    const header = generateTestHeaderString({ payload: body, secret: WH_SECRET });
    return payApp.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': header },
      payload: body,
    });
  };

  it('flux complet : init 202 → webhook approved signé → payment CONFIRMED + order PAID en base', async () => {
    const order = await createOrder14('itest-imp14-pg-0001', '0197140001');
    const p = await pay(order.id);
    const paymentId = p['payment_id'] as string;
    const providerRef = p['provider_ref'] as string;

    // Etat persisté après init (doc 06 §15 : INITIATED puis PENDING).
    const dbPay = await pool2.query(`SELECT state, provider_ref, amount_fcfa FROM public.payments WHERE id = $1`, [paymentId]);
    expect(dbPay.rows[0]).toMatchObject({ state: 'PENDING', provider_ref: providerRef, amount_fcfa: order.amount_fcfa });
    const dbOrd = await pool2.query(`SELECT state FROM public.orders WHERE id = $1`, [order.id]);
    expect(dbOrd.rows[0]).toMatchObject({ state: 'PAYMENT_PENDING' });

    const eventId = `itest-imp14-pg:${randomUUID()}`;
    const first = await sendEvent(eventId, 'transaction.approved', providerRef, order.amount_fcfa, paymentId);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ processed: 'confirmed', order_state: 'PAID' });

    const dbPay2 = await pool2.query(`SELECT state, confirmed_at FROM public.payments WHERE id = $1`, [paymentId]);
    expect(dbPay2.rows[0]).toMatchObject({ state: 'CONFIRMED' });
    expect(dbPay2.rows[0]?.['confirmed_at']).not.toBeNull();
    expect((await pool2.query(`SELECT state FROM public.orders WHERE id = $1`, [order.id])).rows[0]).toMatchObject({ state: 'PAID' });

    // Replay x2 du même événement : idempotence stricte (doc 06 §20).
    const r2 = await sendEvent(eventId, 'transaction.approved', providerRef, order.amount_fcfa, paymentId);
    const r3 = await sendEvent(eventId, 'transaction.approved', providerRef, order.amount_fcfa, paymentId);
    expect(r2.json()).toMatchObject({ duplicate: true });
    expect(r3.json()).toMatchObject({ duplicate: true });
    const evCount = await pool2.query(`SELECT count(*)::int AS n FROM public.payment_events WHERE provider_event_id = $1`, [`fedapay:${eventId}`]);
    expect(evCount.rows[0]?.['n']).toBe(1);
  });

  it('signature invalide : 400, paiement jamais confirmé, événement journalisé signature_ok=false', async () => {
    const order = await createOrder14('itest-imp14-pg-0002', '0197140002');
    const p = await pay(order.id);
    const paymentId = p['payment_id'] as string;
    const eventId = `itest-imp14-pg:${randomUUID()}`;
    const body = JSON.stringify({
      id: eventId, name: 'transaction.approved',
      entity: { reference: p['provider_ref'], amount: order.amount_fcfa, status: 'approved', custom_metadata: { payment_id: paymentId } },
    });
    const header = generateTestHeaderString({ payload: body, secret: 'wh_secret_fraude' });
    const res = await payApp.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': header },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    const dbPay = await pool2.query(`SELECT state FROM public.payments WHERE id = $1`, [paymentId]);
    expect(dbPay.rows[0]).toMatchObject({ state: 'PENDING' }); // jamais confirmé sans signature
    const dbEv = await pool2.query(`SELECT signature_ok FROM public.payment_events WHERE provider_event_id = $1`, [`fedapay:${eventId}:unsigned`]);
    expect(dbEv.rows[0]).toMatchObject({ signature_ok: false });
  });

  it('montant divergent : ignoré (jamais confirmé) + audit payment_amount_mismatch', async () => {
    const order = await createOrder14('itest-imp14-pg-0003', '0197140003');
    const p = await pay(order.id);
    const paymentId = p['payment_id'] as string;
    const res = await sendEvent(`itest-imp14-pg:${randomUUID()}`, 'transaction.approved', p['provider_ref'] as string, order.amount_fcfa + 1, paymentId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ignored: 'montant_divergent' });
    expect((await pool2.query(`SELECT state FROM public.payments WHERE id = $1`, [paymentId])).rows[0]).toMatchObject({ state: 'PENDING' });
    const audit = await pool2.query(`SELECT action FROM public.audit_logs WHERE entity = 'payments' AND entity_id = $1`, [paymentId]);
    expect(audit.rows.map((r) => r['action'])).toContain('payment_amount_mismatch');
  });

  it('declined : payment FAILED + order FAILED en base', async () => {
    const order = await createOrder14('itest-imp14-pg-0004', '0197140004');
    const p = await pay(order.id);
    const paymentId = p['payment_id'] as string;
    const res = await sendEvent(`itest-imp14-pg:${randomUUID()}`, 'transaction.declined', p['provider_ref'] as string, order.amount_fcfa, paymentId);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ processed: 'failed' });
    expect((await pool2.query(`SELECT state FROM public.payments WHERE id = $1`, [paymentId])).rows[0]).toMatchObject({ state: 'FAILED' });
    expect((await pool2.query(`SELECT state FROM public.orders WHERE id = $1`, [order.id])).rows[0]).toMatchObject({ state: 'FAILED' });
  });
});
