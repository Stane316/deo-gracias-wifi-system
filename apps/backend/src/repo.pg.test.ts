/**
 * IMP-12 — Tests d'intégration RÉELS (PgRepo sur Postgres migré 0001→0010).
 * Exécutés seulement si DATABASE_URL est définie (CI : service postgres:17 ;
 * local : tools/db-migrate.sh up). Hygiène : fixtures nettoyées avant/après
 * (leçon IMP-09 : des fixtures orphelines font échouer les runs suivants).
 */
import { OFFERS } from '@dg/shared';
import { createHash, randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { AuthIdentity, AuthVerifier } from './auth.js';
import { generateTestHeaderString, type CheckoutInput, type CheckoutResult, type PaymentProvider } from './fedapay.js';
import { PgRepo } from './repo.js';
import { computeSyncState, startOfBusinessDay } from './admin.js';
import { allocateAndDeliver } from './tickets.js';
import { runOrderExpiry, runReconciliationSim } from './workers.js';
// Imports RELATIFS vers les sources du paquet connector (leçon IMP-22 : aucune
// dépendance à l'état de node_modules/symlinks/paths — résolution directe).
import { DryRunConnector } from '../../connector/src/dry-run.js';
import { seedLegacyInventory, HOTSPOT_USERS_TABULAR_FIXTURE } from '../../connector/src/fixtures/hotspot-users.fixture.js';
import { HOTSPOT_ACTIVE_FIXTURE, MIKHMON_JOURNAL_FIXTURE } from '../../connector/src/fixtures/readonly.fixture.js';
import { ReadOnlyConnectorV0 } from '../../connector/src/read-only.js';
import { reconcileReadOnly, type PlatformExpected } from '../../connector/src/reconcile.js';
import { drainQueue, type ClaimedOp, type ResultBody, type SyncTransport } from '../../connector/src/sync-client.js';

class FakeVerifier implements AuthVerifier {
  identities = new Map<string, AuthIdentity>();
  async verify(token: string): Promise<AuthIdentity | null> {
    return this.identities.get(token) ?? null;
  }
}

const DATABASE_URL = process.env['DATABASE_URL'];
const describeDb = DATABASE_URL ? describe : describe.skip;

// IMP-16 : le stock Mikmon seedé (0010) est l'inventaire RÉEL — les tests
// d'intégration ne doivent jamais le consommer ni le voir (l'allocation est FIFO
// par created_at et les tickets seedés sont les plus anciens). On le « parque »
// hors AVAILABLE via des transitions LÉGALES réversibles
// (AVAILABLE→RESERVED, puis RESERVED→RELEASED→AVAILABLE au déparkage).
async function parkMikmonStock(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE public.tickets SET db_state = 'RESERVED', reserved_at = now()
     WHERE db_state = 'AVAILABLE'
       AND batch_id IN (SELECT id FROM public.ticket_batches WHERE source = 'mikmon-manual')`,
  );
}
async function unParkMikmonStock(pool: Pool): Promise<void> {
  await pool.query(
    `UPDATE public.tickets SET db_state = 'RELEASED'
     WHERE db_state = 'RESERVED'
       AND batch_id IN (SELECT id FROM public.ticket_batches WHERE source = 'mikmon-manual')`,
  );
  await pool.query(
    `UPDATE public.tickets SET db_state = 'AVAILABLE', reserved_at = NULL
     WHERE db_state = 'RELEASED'
       AND batch_id IN (SELECT id FROM public.ticket_batches WHERE source = 'mikmon-manual')`,
  );
}

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
      `DELETE FROM public.tickets WHERE order_id IN (
         SELECT id FROM public.orders
          WHERE idempotency_key LIKE 'itest-imp14-pg-%'
             OR customer_id IN (SELECT id FROM public.customers WHERE phone LIKE '019714%'))`,
    );
    await pool2.query(
      `DELETE FROM public.orders
       WHERE idempotency_key LIKE 'itest-imp14-pg-%'
          OR customer_id IN (SELECT id FROM public.customers WHERE phone LIKE '019714%')`,
    );
    await pool2.query(`DELETE FROM public.customers WHERE phone LIKE '019714%'`);
  };

  beforeAll(async () => {
    await parkMikmonStock(pool2);
    await cleanup14();
    payApp = await buildApp({ repo: repo2, payment: { provider: new FakeProviderPg(), webhookSecret: WH_SECRET } });
  });
  afterAll(async () => {
    await cleanup14();
    await unParkMikmonStock(pool2);
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


// ---------------------------------------------------------------------------
// IMP-15 — Allocation atomique + livraison sur Postgres réel.
// Le test critique (doc 06 §29, blueprint §8) : N allocations CONCURRENTES sur
// M < N tickets => exactement M succès, jamais deux commandes sur le même ticket.
// Fixtures : clés itest-imp15-pg-%, téléphones 019715%, batch notes itest-imp15-pg.
// ---------------------------------------------------------------------------
describeDb('IMP-15 — allocation atomique tickets sur Postgres réel', () => {
  const pool15 = new Pool({ connectionString: DATABASE_URL });
  const repo15 = new PgRepo(pool15);

  const sha = (x: string) => createHash('sha256').update(x).digest('hex');

  const cleanup15 = async (): Promise<void> => {
    await pool15.query(`DELETE FROM public.tickets WHERE batch_id IN (SELECT id FROM public.ticket_batches WHERE notes = 'itest-imp15-pg')`);
    await pool15.query(`DELETE FROM public.ticket_batches WHERE notes = 'itest-imp15-pg'`);
    await pool15.query(
      `DELETE FROM public.payment_events WHERE provider_event_id LIKE 'fedapay:itest-imp15-pg:%'`,
    );
    await pool15.query(
      `DELETE FROM public.payments WHERE order_id IN
         (SELECT id FROM public.orders WHERE idempotency_key LIKE 'itest-imp15-pg-%')`,
    );
    await pool15.query(
      `DELETE FROM public.tickets WHERE order_id IN (
         SELECT id FROM public.orders WHERE idempotency_key LIKE 'itest-imp15-pg-%')`,
    );
    await pool15.query(`DELETE FROM public.orders WHERE idempotency_key LIKE 'itest-imp15-pg-%'`);
    await pool15.query(`DELETE FROM public.customers WHERE phone LIKE '019715%'`);
  };

  let plan24: string;

  const seedBatch = async (n: number): Promise<string> => {
    const batch = await pool15.query(
      `INSERT INTO public.ticket_batches (source, quantity, notes) VALUES ('backend', $1, 'itest-imp15-pg') RETURNING id`,
      [n],
    );
    const batchId = String(batch.rows[0]?.['id']);
    for (let i = 0; i < n; i++) {
      await pool15.query(
        `INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id)
         VALUES ($1, $2, 'IT15', $3)`,
        [batchId, sha(randomUUID()), plan24],
      );
    }
    return batchId;
  };

  /** Crée une commande via l'API puis la passe PAID par transitions autorisées (0009). */
  const paidOrder = async (app15: Awaited<ReturnType<typeof buildApp>>, key: string, phone: string): Promise<string> => {
    const res = await app15.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': key },
      payload: { offer_id: '24-HEURES', customer_phone: phone },
    });
    const id = (res.json() as Record<string, unknown>)['id'] as string;
    await pool15.query(`UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = $1`, [id]);
    await pool15.query(`UPDATE public.orders SET state = 'PAID' WHERE id = $1`, [id]);
    return id;
  };

  let app15: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    await parkMikmonStock(pool15);
    await cleanup15();
    const plans = await pool15.query(
      `SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`,
    );
    plan24 = String(plans.rows[0]?.['id']);
    app15 = await buildApp({
      repo: repo15,
      auth: { devMode: true, rateLimits: { requestMax: 1000, verifyMax: 1000 } },
    });
  });
  afterAll(async () => {
    await cleanup15();
    await unParkMikmonStock(pool15);
    await app15.close();
    await pool15.end();
  });

  it('CONCURRENCE : 6 allocations simultanées sur 3 tickets => 3 livrées, 0 double attribution (doc 06 §29)', async () => {
    await seedBatch(3);
    const orderIds = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((i) => paidOrder(app15, `itest-imp15-pg-c${i}`, `019715000${i}`)),
    );
    const outcomes = await Promise.all(orderIds.map((id) => allocateAndDeliver(repo15, id)));
    const delivered = outcomes.filter((o) => o.status === 'delivered');
    const noStock = outcomes.filter((o) => o.status === 'no-stock');
    expect(delivered).toHaveLength(3);
    expect(noStock).toHaveLength(3);

    const sold = await pool15.query(
      `SELECT t.id, t.order_id FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE b.notes = 'itest-imp15-pg' AND t.db_state = 'SOLD'`,
    );
    expect(sold.rows).toHaveLength(3);
    const distinctOrders = new Set(sold.rows.map((r) => String(r['order_id'])));
    expect(distinctOrders.size).toBe(3); // invariant 2 : jamais deux commandes sur un même ticket
    const deliveredOrders = await pool15.query(
      `SELECT count(*)::int AS n FROM public.orders WHERE id = ANY($1::uuid[]) AND state = 'DELIVERED'`,
      [orderIds],
    );
    expect(deliveredOrders.rows[0]?.['n']).toBe(3);
    // Les commandes sans stock restent PAID (paiement préservé, invariant 6).
    const stillPaid = await pool15.query(
      `SELECT count(*)::int AS n FROM public.orders WHERE id = ANY($1::uuid[]) AND state = 'PAID'`,
      [orderIds],
    );
    expect(stillPaid.rows[0]?.['n']).toBe(3);
  });

  it('webhook approuvé signé => DELIVERED réel en base + ticket SOLD (flux nominal §90)', async () => {
    await seedBatch(1);
    // Flux nominal complet : commande → /pay (FedaPay stubbé) → webhook signé.
    const whApp = await buildApp({
      repo: repo15,
      payment: { provider: new FakeProviderPg(), webhookSecret: 'wh_imp15' },
    });
    const ord = await whApp.inject({
      method: 'POST',
      url: '/orders',
      headers: { 'idempotency-key': 'itest-imp15-pg-wh1' },
      payload: { offer_id: '24-HEURES', customer_phone: '0197150101' },
    });
    const orderId = (ord.json() as Record<string, unknown>)['id'] as string;
    const payRes = await whApp.inject({ method: 'POST', url: `/orders/${orderId}/pay` });
    expect(payRes.statusCode).toBe(202);
    const pay = payRes.json() as Record<string, unknown>;

    const eventId = `itest-imp15-pg:${randomUUID()}`;
    const body = JSON.stringify({
      id: eventId,
      name: 'transaction.approved',
      entity: {
        reference: pay['provider_ref'],
        amount: 300,
        status: 'approved',
        currency: { iso: 'XOF' },
        custom_metadata: { payment_id: pay['payment_id'] },
      },
    });
    const header = generateTestHeaderString({ payload: body, secret: 'wh_imp15' });
    const res = await whApp.inject({
      method: 'POST',
      url: '/webhooks/fedapay',
      headers: { 'content-type': 'application/json', 'x-fedapay-signature': header },
      payload: body,
    });
    await whApp.close();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ processed: 'confirmed', order_state: 'DELIVERED', delivery: 'delivered' });
    const dbOrd = await pool15.query(`SELECT state FROM public.orders WHERE id = $1`, [orderId]);
    expect(dbOrd.rows[0]).toMatchObject({ state: 'DELIVERED' });
    const dbTick = await pool15.query(
      `SELECT db_state, order_id FROM public.tickets WHERE order_id = $1`,
      [orderId],
    );
    expect(dbTick.rows).toHaveLength(1);
    expect(dbTick.rows[0]).toMatchObject({ db_state: 'SOLD' });
  });

  it('GET /tickets/mine sur vraie base : session phone => tickets vendus, jamais de code', async () => {
    await seedBatch(1);
    const orderId = await paidOrder(app15, 'itest-imp15-pg-mine1', '0197150202');
    const r = await allocateAndDeliver(repo15, orderId);
    expect(r.status).toBe('delivered');

    const req = await app15.inject({ method: 'POST', url: '/auth/phone/request', payload: { phone: '0197150202' } });
    const code = (req.json() as Record<string, unknown>)['dev_code'] as string;
    const ver = await app15.inject({ method: 'POST', url: '/auth/phone/verify', payload: { phone: '0197150202', code } });
    const token = (ver.json() as Record<string, unknown>)['token'] as string;
    const res = await app15.inject({ method: 'GET', url: '/tickets/mine', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    const tickets = body['tickets'] as Array<Record<string, unknown>>;
    expect(tickets).toHaveLength(1);
    expect(tickets[0]).toMatchObject({ offer_id: '24-HEURES', db_state: 'SOLD' });
    expect(JSON.stringify(body)).not.toContain('password');
  });
});


// ---------------------------------------------------------------------------
// IMP-16 — Stock digital Mikmon seedé (migration 0010) sur Postgres réel.
// Vérifie la structure EXACTE du manifeste IMP-06 : 6 batches, 660 tickets
// hashés, distribution Grille A, unicité des empreintes — puis une allocation
// réelle depuis le stock seedé (preuve du mapping plan_id), ticket restauré après.
// Fixtures : clés itest-imp16-pg-%, téléphones 019716%.
// ---------------------------------------------------------------------------
describeDb('IMP-16 — stock Mikmon seedé (0010) sur Postgres réel', () => {
  const pool16 = new Pool({ connectionString: DATABASE_URL });
  const repo16 = new PgRepo(pool16);

  const MANIFESTE = [
    { tag: 'B1', offer: '5-HEURES', qty: 300, sha: '2c62a8285ae8491541406e2b6d0c6d27781f8333587b7e3b96e437bb0e22f9c1' },
    { tag: 'B2', offer: '12-HEURES', qty: 60, sha: '01a2c12ebc6acd2bc5d41f93c0bac453a8afb6fabe6c8328dc4ae599fe3c1e89' },
    { tag: 'B3', offer: '24-HEURES', qty: 100, sha: '157bfc82e05fe56a34aea6a3ca9cead2dce72bcde524ff9ec573fae9a8589fde' },
    { tag: 'B4', offer: '72-HEURES', qty: 120, sha: '18fb11a7c2e6a81bf05f42e6aae6a6b302198afca3ef0c38047a18447a8f6b45' },
    { tag: 'B5', offer: '1-SEMAINE', qty: 40, sha: 'e6f6727cb80b7b3c09f7c2236b656cf698d416c4a6d3f2734b5d609eb66c3e5d' },
    { tag: 'B6', offer: '1-MOIS', qty: 40, sha: '637c13cff788e65f348035e70e78d972b68bb448480b13361879ef573cf61e3d' },
  ];
  const SEED_FILTER = `notes LIKE 'mikmon-2026-09-17-B%'`;

  const cleanup16 = async (): Promise<void> => {
    await pool16.query(
      `DELETE FROM public.tickets WHERE order_id IN (
         SELECT id FROM public.orders WHERE idempotency_key LIKE 'itest-imp16-pg-%')`,
    );
    await pool16.query(`DELETE FROM public.orders WHERE idempotency_key LIKE 'itest-imp16-pg-%'`);
    await pool16.query(`DELETE FROM public.customers WHERE phone LIKE '019716%'`);
  };

  beforeAll(async () => {
    await cleanup16();
  });
  afterAll(async () => {
    await cleanup16();
    await pool16.end();
  });

  it('6 batches mikmon-manual : quantités, empreintes PDF et tags du manifeste IMP-06', async () => {
    const batches = await pool16.query(
      `SELECT source, quantity, manifest_sha256, notes, generated_at
       FROM public.ticket_batches WHERE ${SEED_FILTER} ORDER BY notes`,
    );
    expect(batches.rows).toHaveLength(6);
    batches.rows.forEach((row, i) => {
      const lot = MANIFESTE[i];
      expect(row).toMatchObject({
        source: 'mikmon-manual',
        quantity: lot?.qty,
        manifest_sha256: lot?.sha,
        notes: `mikmon-2026-09-17-${lot?.tag} (${lot?.offer}, manifeste IMP-06)`,
      });
      expect(new Date(row['generated_at'] as string).toISOString()).toContain('2026-09-17');
    });
    const total = batches.rows.reduce((acc, r) => acc + Number(r['quantity']), 0);
    expect(total).toBe(660);
  });

  it('660 tickets AVAILABLE : empreintes sha256 uniques, préfixes 2 car., distribution Grille A', async () => {
    const tickets = await pool16.query(
      `SELECT t.code_hash, t.code_prefix_hint, t.db_state, p.offer_id
       FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       JOIN public.plans p ON p.id = t.plan_id
       WHERE b.${SEED_FILTER}`,
    );
    expect(tickets.rows).toHaveLength(660);
    const hashes = new Set<string>();
    const dist: Record<string, number> = {};
    for (const row of tickets.rows) {
      expect(String(row['code_hash'])).toMatch(/^[0-9a-f]{64}$/);
      expect(String(row['code_prefix_hint'])).toMatch(/^[a-z0-9]{2}$/);
      expect(row['db_state']).toBe('AVAILABLE'); // stock neuf jamais vendu
      hashes.add(String(row['code_hash']));
      const offer = String(row['offer_id']);
      dist[offer] = (dist[offer] ?? 0) + 1;
    }
    expect(hashes.size).toBe(660); // unicité (aussi contrainte UNIQUE en base)
    for (const lot of MANIFESTE) {
      expect(dist[lot.offer]).toBe(lot.qty);
    }
  });

  it('allocation réelle depuis le stock seedé (B3 24-HEURES), puis restauration du ticket', async () => {
    // Commande 24-HEURES passée PAID par transitions autorisées (gardes 0009).
    const cust = await pool16.query(`INSERT INTO public.customers (phone) VALUES ('0197160001') RETURNING id`);
    const plan = await pool16.query(`SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`);
    const ord = await pool16.query(
      `INSERT INTO public.orders (customer_id, plan_id, plan_snapshot, idempotency_key)
       VALUES ($1, $2, '{"offer_id":"24-HEURES","price_snapshot":300}'::jsonb, 'itest-imp16-pg-alloc1') RETURNING id`,
      [String(cust.rows[0]?.['id']), String(plan.rows[0]?.['id'])],
    );
    const orderId = String(ord.rows[0]?.['id']);
    await pool16.query(`UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = $1`, [orderId]);
    await pool16.query(`UPDATE public.orders SET state = 'PAID' WHERE id = $1`, [orderId]);

    const before = await pool16.query(
      `SELECT count(*)::int AS n FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE b.notes = 'mikmon-2026-09-17-B3' AND t.db_state = 'AVAILABLE'`,
    );
    const outcome = await allocateAndDeliver(repo16, orderId);
    expect(outcome.status).toBe('delivered');

    // Le ticket alloué provient BIEN du lot seedé B3 (mapping plan_id correct).
    const sold = await pool16.query(
      `SELECT t.db_state, b.notes FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE t.order_id = $1`,
      [orderId],
    );
    expect(sold.rows).toHaveLength(1);
    expect(sold.rows[0]).toMatchObject({ db_state: 'SOLD', notes: 'mikmon-2026-09-17-B3 (24-HEURES, manifeste IMP-06)' });
    expect((await repo16.getOrderById(orderId))?.state).toBe('DELIVERED');

    // Restauration : le stock seedé est l'inventaire réel — le ticket consommé
    // est remis AVAILABLE (bypass superuser de la garde, immédiatement réactivée ;
    // SOLD→AVAILABLE n'existe pas dans la machine — c'est un nettoyage de test).
    await pool16.query(`ALTER TABLE public.tickets DISABLE TRIGGER tickets_state_guard`);
    try {
      await pool16.query(
        `UPDATE public.tickets SET db_state = 'AVAILABLE', order_id = NULL, sold_at = NULL,
                reserved_at = NULL, activation_deadline = NULL
         WHERE order_id = $1`,
        [orderId],
      );
    } finally {
      await pool16.query(`ALTER TABLE public.tickets ENABLE TRIGGER tickets_state_guard`);
    }
    await pool16.query(`DELETE FROM public.orders WHERE id = $1`, [orderId]);
    await pool16.query(`DELETE FROM public.customers WHERE id = $1`, [String(cust.rows[0]?.['id'])]);

    const after = await pool16.query(
      `SELECT count(*)::int AS n FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE b.notes = 'mikmon-2026-09-17-B3' AND t.db_state = 'AVAILABLE'`,
    );
    expect(after.rows[0]?.['n']).toBe(Number(before.rows[0]?.['n'])); // stock intact
  });
});


// ---------------------------------------------------------------------------
// IMP-17 — Statistiques admin (dashboard, tickets/stats, ack alertes) sur
// Postgres réel. Fixtures : règles d'alerte/types d'incident préfixés
// 'itest-imp17-', verrous sync 'itest-imp17-'. Lecture seule sur le stock
// seedé (aucune consommation — pas de parking nécessaire).
// ---------------------------------------------------------------------------
describeDb('IMP-17 — statistiques admin sur Postgres réel', () => {
  const pool17 = new Pool({ connectionString: DATABASE_URL });
  const repo17 = new PgRepo(pool17);

  const cleanup17 = async (): Promise<void> => {
    await pool17.query(`DELETE FROM public.alerts WHERE rule LIKE 'itest-imp17-%'`);
    await pool17.query(`DELETE FROM public.incidents WHERE type LIKE 'itest-imp17-%'`);
    await pool17.query(`DELETE FROM public.mikrotik_sync WHERE locked_by LIKE 'itest-imp17-%'`);
  };

  beforeAll(async () => { await cleanup17(); });
  afterAll(async () => { await cleanup17(); await pool17.end(); });

  it("dashboard réel : le stock seedé 0010 apparaît dans l\u0027inventaire (doc 09 §12.1)", async () => {
    const stats = await repo17.getAdminDashboardStats(startOfBusinessDay(new Date()));
    // Les 660 tickets du manifeste sont disponibles (IMP-14/15 restaurent, IMP-16 restaure).
    const totals = Object.entries(stats.ticketsByState);
    const available = totals
      .filter(([st]) => st === 'AVAILABLE' || st === 'RELEASED')
      .reduce((acc, [, n]) => acc + n, 0);
    expect(available).toBeGreaterThanOrEqual(660);
    // Chaque offre de la Grille A a son stock seedé minimum du manifeste.
    const minParOffre: Record<string, number> = {
      '5-HEURES': 300, '12-HEURES': 60, '24-HEURES': 100,
      '72-HEURES': 120, '1-SEMAINE': 40, '1-MOIS': 40,
    };
    for (const [offre, min] of Object.entries(minParOffre)) {
      expect(stats.availableByOffer[offre] ?? 0, `stock ${offre}`).toBeGreaterThanOrEqual(min);
    }
    expect(stats.incidentsOpen).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(stats.ordersCountToday)).toBe(true);
    expect(Number.isInteger(stats.revenueTodayFcfa)).toBe(true);
  });

  it('tickets/stats réel : 6 offres Grille A avec prix officiels et distribution du manifeste', async () => {
    const rows = await repo17.getTicketsStatsByOffer();
    expect(rows).toHaveLength(6);
    const parOffre = new Map(rows.map((r) => [r.offerId, r]));
    const prixAttendus: Record<string, number> = {
      '5-HEURES': 100, '12-HEURES': 200, '24-HEURES': 300,
      '72-HEURES': 500, '1-SEMAINE': 1000, '1-MOIS': 4000,
    };
    const dispoAttendu: Record<string, number> = {
      '5-HEURES': 300, '12-HEURES': 60, '24-HEURES': 100,
      '72-HEURES': 120, '1-SEMAINE': 40, '1-MOIS': 40,
    };
    for (const [offre, prix] of Object.entries(prixAttendus)) {
      const row = parOffre.get(offre);
      expect(row, offre).toBeDefined();
      expect(row?.priceFcfa).toBe(prix);
      expect((row?.states['AVAILABLE'] ?? 0) >= (dispoAttendu[offre] ?? 0), `${offre} dispo`).toBe(true);
    }
  });

  it("ack d\u0027alerte réel : premier ack horodaté, rejeu idempotent, inconnu = null, audit persisté", async () => {
    const inserted = await pool17.query(
      `INSERT INTO public.alerts (rule, payload, severity)
       VALUES ('itest-imp17-stock-faible', '{"offre":"1-MOIS"}'::jsonb, 'WARNING') RETURNING id`,
    );
    const alertId = String(inserted.rows[0]?.['id']);

    const first = await repo17.acknowledgeAlert(alertId);
    expect(first).toMatchObject({ id: alertId, rule: 'itest-imp17-stock-faible', severity: 'WARNING', alreadyAcknowledged: false });
    expect(first?.acknowledgedAt).toBeInstanceOf(Date);

    const row = await pool17.query(`SELECT acknowledged_at FROM public.alerts WHERE id = $1`, [alertId]);
    expect(row.rows[0]?.['acknowledged_at']).not.toBeNull();

    const second = await repo17.acknowledgeAlert(alertId);
    expect(second).toMatchObject({ id: alertId, alreadyAcknowledged: true });
    expect(second?.acknowledgedAt.toISOString()).toBe(first?.acknowledgedAt.toISOString());

    expect(await repo17.acknowledgeAlert(randomUUID())).toBeNull();

    // Audit réel persisté (doc 09 §F).
    await repo17.logAudit({ actor: 'admin:test', action: 'admin_alert_ack', entity: 'alerts', entityId: alertId });
    const audit = await pool17.query(
      `SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'admin_alert_ack' AND entity_id = $1`,
      [alertId],
    );
    expect(Number(audit.rows[0]?.['n'])).toBeGreaterThanOrEqual(1);
  });

  it('sync_state réel : FAILED => ERROR, PENDING => WARNING, SUCCESS seul => HEALTHY', async () => {
    const since = startOfBusinessDay(new Date());
    // Échec de synchro => ERROR (doc 09 §4.E « synchronisation échouée »).
    await pool17.query(
      `INSERT INTO public.mikrotik_sync (operation, payload, state, locked_by)
       VALUES ('read_status', '{}'::jsonb, 'FAILED', 'itest-imp17-worker')`,
    );
    let stats = await repo17.getAdminDashboardStats(since);
    expect(computeSyncState({ pending: stats.syncPending, failed: stats.syncFailed, success: stats.syncSuccess })).toBe('ERROR');

    // Plus d'échec mais file en attente => WARNING.
    await pool17.query(`DELETE FROM public.mikrotik_sync WHERE locked_by = 'itest-imp17-worker'`);
    await pool17.query(
      `INSERT INTO public.mikrotik_sync (operation, payload, state, locked_by)
       VALUES ('create_ticket', '{}'::jsonb, 'PENDING', 'itest-imp17-worker')`,
    );
    stats = await repo17.getAdminDashboardStats(since);
    expect(computeSyncState({ pending: stats.syncPending, failed: stats.syncFailed, success: stats.syncSuccess })).toBe('WARNING');

    // Succès seul => HEALTHY (chaîne légale 0009 : PENDING→PROCESSING→SUCCESS).
    await pool17.query(`UPDATE public.mikrotik_sync SET state = 'PROCESSING' WHERE locked_by = 'itest-imp17-worker'`);
    await pool17.query(`UPDATE public.mikrotik_sync SET state = 'SUCCESS' WHERE locked_by = 'itest-imp17-worker'`);
    stats = await repo17.getAdminDashboardStats(since);
    expect(computeSyncState({ pending: stats.syncPending, failed: stats.syncFailed, success: stats.syncSuccess })).toBe('HEALTHY');
  });
});


// ---------------------------------------------------------------------------
// IMP-18 — Génération de lots digitaux par le backend sur Postgres réel
// (contrat Mikmon §3) : batch source='backend', tickets sha256-only (0004),
// file mikrotik_sync create_ticket avec payload complet, séquence atomique.
// Cleanup : supprime les lots source='backend' (sync -> tickets -> batches).
// ---------------------------------------------------------------------------
describeDb('IMP-18 — génération de lots digitaux sur Postgres réel', () => {
  const pool18 = new Pool({ connectionString: DATABASE_URL });
  const repo18 = new PgRepo(pool18);

  const cleanup18 = async (): Promise<void> => {
    const batches = await pool18.query(`SELECT id FROM public.ticket_batches WHERE source = 'backend'`);
    const ids = batches.rows.map((r) => String(r['id']));
    if (ids.length > 0) {
      await pool18.query(
        `DELETE FROM public.mikrotik_sync WHERE operation = 'create_ticket'
         AND payload->>'ticket_id' IN (SELECT id::text FROM public.tickets WHERE batch_id = ANY($1::uuid[]))`,
        [ids],
      );
      await pool18.query(`DELETE FROM public.tickets WHERE batch_id = ANY($1::uuid[])`, [ids]);
      await pool18.query(`DELETE FROM public.ticket_batches WHERE id = ANY($1::uuid[])`, [ids]);
    }
  };

  beforeAll(async () => { await cleanup18(); });
  afterAll(async () => { await cleanup18(); await pool18.end(); });

  it('lot 24-HEURES : tickets sha256-only + file create_ticket avec payload contrat', async () => {
    const created = await repo18.createBackendBatch({ offerId: '24-HEURES', quantity: 5 });
    expect(created.seq).toBeGreaterThanOrEqual(100); // séquence digitale (contrat §3.3)
    expect(created.specs).toHaveLength(5);

    const batch = await pool18.query(
      `SELECT source, quantity, notes FROM public.ticket_batches WHERE id = $1`,
      [created.batchId],
    );
    expect(batch.rows[0]).toMatchObject({ source: 'backend', quantity: 5 });
    expect(String(batch.rows[0]?.['notes'])).toContain(`backend-gen seq ${created.seq}`);

    // Tickets : empreintes exactes des codes exportés, JAMAIS le clair (0004).
    const expectedHashes = new Set(
      created.specs.map((sp) => createHash('sha256').update(sp.clientCode).digest('hex')),
    );
    const tickets = await pool18.query(
      `SELECT t.code_hash, t.code_prefix_hint, t.mikrotik_comment, t.db_state, p.offer_id
       FROM public.tickets t JOIN public.plans p ON p.id = t.plan_id
       WHERE t.batch_id = $1`,
      [created.batchId],
    );
    expect(tickets.rows).toHaveLength(5);
    for (const row of tickets.rows) {
      expect(expectedHashes.has(String(row['code_hash']))).toBe(true);
      expect(String(row['code_prefix_hint'])).toMatch(/^[2-9a-hjkmnp-z]{2}$/);
      expect(String(row['mikrotik_comment'])).toMatch(/^vc-\d{3,}-\d{2}\.\d{2}\.\d{2}-$/);
      expect(row['db_state']).toBe('AVAILABLE');
      expect(row['offer_id']).toBe('24-HEURES');
    }

    // File mikrotik_sync : 5 ordres PENDING au payload complet (contrat §3).
    const sync = await pool18.query(
      `SELECT payload FROM public.mikrotik_sync
       WHERE operation = 'create_ticket' AND state = 'PENDING'
         AND payload->>'batch_seq' = $1`,
      [String(created.seq)],
    );
    expect(sync.rows).toHaveLength(5);
    for (const row of sync.rows) {
      const pl = row['payload'] as Record<string, unknown>;
      expect(pl['profile']).toBe('24-HEURES');
      expect(pl['limit_uptime']).toBe('1d00:00:00'); // plan, jamais déduit du nom (doc 09 §36)
      expect(String(pl['name'])).toMatch(/^dg[a-z0-9]{6}$/);
      expect(String(pl['password'])).toMatch(/^[2-9a-hjkmnp-z]{8}$/);
      expect(pl['comment']).toBe(created.specs[0]?.mikrotikComment);
      // Corrélation exacte : sha256(password du payload) = code_hash du ticket pointé.
      const ticket = await pool18.query(
        `SELECT code_hash FROM public.tickets WHERE id = $1 AND batch_id = $2`,
        [String(pl['ticket_id']), created.batchId],
      );
      expect(ticket.rows).toHaveLength(1);
      expect(String(ticket.rows[0]?.['code_hash']))
        .toBe(createHash('sha256').update(String(pl['password'])).digest('hex'));
    }
  });

  it('séquence atomique : le lot suivant reçoit seq+1, le comment la porte', async () => {
    const b1 = await repo18.createBackendBatch({ offerId: '5-HEURES', quantity: 2 });
    const b2 = await repo18.createBackendBatch({ offerId: '5-HEURES', quantity: 2 });
    expect(b2.seq).toBe(b1.seq + 1);
    expect(b2.specs[0]?.mikrotikComment).toContain(`vc-${b2.seq}-`);
  });

  it('offre inconnue : rejet sans écriture partielle', async () => {
    await expect(repo18.createBackendBatch({ offerId: '9-HEURES', quantity: 2 })).rejects.toThrow();
    const rest = await pool18.query(`SELECT count(*)::int AS n FROM public.ticket_batches WHERE source = 'backend'`);
    // Seuls les lots des tests précédents existent (5-HEURES ×2 ici + lot 24-HEURES).
    expect(Number(rest.rows[0]?.['n'])).toBeLessThanOrEqual(3);
  });
});


// ---------------------------------------------------------------------------
// IMP-19 — Double garde-fou de validité (contrat Mikmon §3.6) : à la vente,
// activation_deadline = sold_at + validité offre ; au-delà, SOLD→EXPIRED (0011)
// via expireOverdueTickets, audité par la garde 0009. Stock vierge = sans
// échéance (vendable jusqu'à la bascule IMP-38, décision D10).
// Fixtures : clés itest-imp19-pg-%, téléphones 019719%.
// ---------------------------------------------------------------------------
describeDb("IMP-19 — échéance d\u0027activation sur Postgres réel", () => {
  const pool19 = new Pool({ connectionString: DATABASE_URL });
  const repo19 = new PgRepo(pool19);
  let fixtureTicketId = '';
  let fixtureOrderId = '';
  let fixtureCustomerId = '';

  const cleanup19 = async (): Promise<void> => {
    await pool19.query(
      `DELETE FROM public.tickets WHERE order_id IN (
         SELECT id FROM public.orders WHERE idempotency_key LIKE 'itest-imp19-pg-%')`,
    );
    await pool19.query(
      `DELETE FROM public.tickets WHERE batch_id IN (
         SELECT id FROM public.ticket_batches WHERE notes = 'itest-imp19-pg')`,
    );
    await pool19.query(`DELETE FROM public.ticket_batches WHERE notes = 'itest-imp19-pg'`);
    await pool19.query(`DELETE FROM public.orders WHERE idempotency_key LIKE 'itest-imp19-pg-%'`);
    await pool19.query(`DELETE FROM public.customers WHERE phone LIKE '019719%'`);
  };

  beforeAll(async () => {
    await cleanup19();
    await parkMikmonStock(pool19); // le stock réel n'est pas consommé par ce test
  });
  afterAll(async () => {
    await unParkMikmonStock(pool19);
    await cleanup19();
    await pool19.end();
  });

  it("vente : activation_deadline = sold_at + validité de l\u0027offre (24-HEURES = 48 h)", async () => {
    // Fixture : petit lot backend frais (FIFO l'aurait sinon pris dans le stock seedé).
    const batch = await pool19.query(
      `INSERT INTO public.ticket_batches (source, quantity, notes)
       VALUES ('backend', 2, 'itest-imp19-pg') RETURNING id`,
    );
    const plan = await pool19.query(`SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`);
    await pool19.query(
      `INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id)
       VALUES ($1, $2, 'zz', $3), ($1, $4, 'zz', $3)`,
      [String(batch.rows[0]?.['id']),
       createHash('sha256').update('itest-imp19-a').digest('hex'),
       String(plan.rows[0]?.['id']),
       createHash('sha256').update('itest-imp19-b').digest('hex')],
    );
    const cust = await pool19.query(`INSERT INTO public.customers (phone) VALUES ('0197190001') RETURNING id`);
    fixtureCustomerId = String(cust.rows[0]?.['id']);
    const ord = await pool19.query(
      `INSERT INTO public.orders (customer_id, plan_id, plan_snapshot, idempotency_key)
       VALUES ($1, $2, '{"offer_id":"24-HEURES","price_snapshot":300,"validity_duration_snapshot":48}'::jsonb,
               'itest-imp19-pg-alloc1') RETURNING id`,
      [fixtureCustomerId, String(plan.rows[0]?.['id'])],
    );
    fixtureOrderId = String(ord.rows[0]?.['id']);
    await pool19.query(`UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = $1`, [fixtureOrderId]);
    await pool19.query(`UPDATE public.orders SET state = 'PAID' WHERE id = $1`, [fixtureOrderId]);

    const outcome = await allocateAndDeliver(repo19, fixtureOrderId);
    expect(outcome.status).toBe('delivered');

    const sold = await pool19.query(
      `SELECT sold_at, activation_deadline FROM public.tickets WHERE order_id = $1`,
      [fixtureOrderId],
    );
    expect(sold.rows).toHaveLength(1);
    const soldAt = new Date(sold.rows[0]?.['sold_at'] as string);
    const deadline = new Date(sold.rows[0]?.['activation_deadline'] as string);
    const hours = (deadline.getTime() - soldAt.getTime()) / 3600_000;
    expect(hours).toBeGreaterThan(47.9);
    expect(hours).toBeLessThan(48.1); // validité 48 h de la Grille A (24-HEURES)
  });

  it('expireOverdueTickets : fenêtre ouverte = rien ; fenêtre close = EXPIRED + audit 0009', async () => {
    const tid = await pool19.query(`SELECT id FROM public.tickets WHERE order_id = $1`, [fixtureOrderId]);
    fixtureTicketId = String(tid.rows[0]?.['id']);

    // Fenêtre ouverte : aucun ticket expiré par la méthode.
    expect(await repo19.expireOverdueTickets(new Date())).toEqual([]);

    // Simule un ticket vendu dont la fenêtre est close (écriture de la colonne seule :
    // la garde 0009 ne surveille que db_state).
    await pool19.query(
      `UPDATE public.tickets SET activation_deadline = now() - interval '1 hour' WHERE id = $1`,
      [fixtureTicketId],
    );
    const expired = await repo19.expireOverdueTickets(new Date());
    expect(expired).toEqual([fixtureTicketId]);

    const row = await pool19.query(`SELECT db_state FROM public.tickets WHERE id = $1`, [fixtureTicketId]);
    expect(row.rows[0]?.['db_state']).toBe('EXPIRED');

    // Audit automatique de la garde 0009 (actor system, before/after jsonb).
    const audit = await pool19.query(
      `SELECT actor, action, entity, before, after FROM public.audit_logs
       WHERE entity = 'tickets' AND entity_id = $1 AND action = 'state_change'
       ORDER BY at DESC LIMIT 1`,
      [fixtureTicketId],
    );
    expect(audit.rows[0]).toMatchObject({
      actor: 'system',
      action: 'state_change',
      entity: 'tickets',
      before: { db_state: 'SOLD' },
      after: { db_state: 'EXPIRED' },
    });

    // /tickets/mine ne liste que les vouchers utilisables (SOLD/USED) : le ticket
    // expiré disparaît de la vue client, mais son échéance reste en base (admin).
    const mine = await repo19.getSoldTicketsForCustomer(fixtureCustomerId);
    expect(mine.find((x) => x.id === fixtureTicketId)).toBeUndefined();
  });

  it("stock vierge : 660 tickets Mikmon SANS échéance (vendables jusqu\u0027à IMP-38)", async () => {
    const res = await pool19.query(
      `SELECT count(*)::int AS n FROM public.tickets t
       JOIN public.ticket_batches b ON b.id = t.batch_id
       WHERE b.source = 'mikmon-manual' AND t.activation_deadline IS NULL`,
    );
    expect(Number(res.rows[0]?.['n'])).toBe(660);
  });
});

// ---------------------------------------------------------------------------
// IMP-20 — Workers (blueprint §6, D11) : order-expiry (TTL 30 min) + paiement
// PENDING associé ; libération des tickets RESERVED bloqués (15 min) ;
// candidate-query du webhook-sweeper ; reconciler simulé sur base réelle
// (reconciliation_runs, garde-fou INC-03). Fixtures : itest-imp20-pg, tél 019720%.
// ---------------------------------------------------------------------------
describeDb('IMP-20 — workers (expiry, RESERVED, sweeper, reconciliation) sur Postgres réel', () => {
  const pool20 = new Pool({ connectionString: DATABASE_URL });
  const repo20 = new PgRepo(pool20);
  let fixtureOrderId = '';
  let fixtureTicketId = '';

  const cleanup20 = async (): Promise<void> => {
    await pool20.query(
      `DELETE FROM public.payments WHERE order_id IN (
         SELECT id FROM public.orders WHERE idempotency_key LIKE 'itest-imp20-pg-%')`,
    );
    // Tickets AVANT orders (FK tickets.order_id -> orders).
    await pool20.query(
      `DELETE FROM public.tickets WHERE batch_id IN (
         SELECT id FROM public.ticket_batches WHERE notes = 'itest-imp20-pg')`,
    );
    await pool20.query(`DELETE FROM public.orders WHERE idempotency_key LIKE 'itest-imp20-pg-%'`);
    await pool20.query(`DELETE FROM public.ticket_batches WHERE notes = 'itest-imp20-pg'`);
    await pool20.query(`DELETE FROM public.customers WHERE phone LIKE '019720%'`);
  };

  beforeAll(async () => { await cleanup20(); });
  afterAll(async () => { await cleanup20(); await pool20.end(); });

  it('expireStaleOrders : commande PAYMENT_PENDING + paiement PENDING => EXPIRED (TTL 30 min)', async () => {
    const cust = await pool20.query(`INSERT INTO public.customers (phone) VALUES ('0197201111') RETURNING id`);
    const plan = await pool20.query(`SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`);
    const ord = await pool20.query(
      `INSERT INTO public.orders (customer_id, plan_id, plan_snapshot, idempotency_key)
       VALUES ($1, $2, '{"offer_id":"24-HEURES","price_snapshot":300,"validity_duration_snapshot":48}'::jsonb,
               'itest-imp20-pg-expire1') RETURNING id`,
      [String(cust.rows[0]?.['id']), String(plan.rows[0]?.['id'])],
    );
    fixtureOrderId = String(ord.rows[0]?.['id']);
    await pool20.query(`UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = $1`, [fixtureOrderId]);
    const payment = await repo20.createPayment(fixtureOrderId, 300);
    await repo20.markPaymentAwaitingResult(payment.id, 'fedapay:itest-imp20-pg-expire1');
    // INITIATED -> PENDING (transition légale 0009) puis vieillissement 40 min.
    await pool20.query(`UPDATE public.payments SET state = 'PENDING' WHERE id = $1`, [payment.id]);
    await pool20.query(`UPDATE public.orders SET created_at = now() - interval '40 minutes' WHERE id = $1`, [fixtureOrderId]);
    await pool20.query(`UPDATE public.payments SET created_at = now() - interval '40 minutes' WHERE id = $1`, [payment.id]);

    const cutoff = new Date(Date.now() - 30 * 60_000);
    const result = await repo20.expireStaleOrders(cutoff);
    expect(result.orderIds).toEqual([fixtureOrderId]);
    expect(result.paymentsExpired).toBe(1);
    const o2 = await pool20.query('SELECT state FROM public.orders WHERE id = $1', [fixtureOrderId]);
    const p2 = await pool20.query('SELECT state FROM public.payments WHERE id = $1', [payment.id]);
    expect(o2.rows[0]?.['state']).toBe('EXPIRED');
    expect(p2.rows[0]?.['state']).toBe('EXPIRED');
    // Second passage : rien d'autre à expirer (idempotence de fait).
    expect(await repo20.expireStaleOrders(cutoff)).toEqual({ orderIds: [], paymentsExpired: 0 });
  });

  it('releaseStaleReservedTickets : RESERVED bloqué 20 min => libéré vers AVAILABLE', async () => {
    const batch = await pool20.query(
      `INSERT INTO public.ticket_batches (source, quantity, notes)
       VALUES ('backend', 1, 'itest-imp20-pg') RETURNING id`,
    );
    const plan = await pool20.query(`SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`);
    const tick = await pool20.query(
      `INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id)
       VALUES ($1, $2, 'zz', $3) RETURNING id`,
      [String(batch.rows[0]?.['id']), createHash('sha256').update('itest-imp20-rsv').digest('hex'), String(plan.rows[0]?.['id'])],
    );
    fixtureTicketId = String(tick.rows[0]?.['id']);
    await pool20.query(
      `UPDATE public.tickets SET db_state = 'RESERVED', reserved_at = now() - interval '20 minutes' WHERE id = $1`,
      [fixtureTicketId],
    );

    const released = await repo20.releaseStaleReservedTickets(new Date(Date.now() - 15 * 60_000));
    expect(released).toEqual([fixtureTicketId]);
    const t = await pool20.query('SELECT db_state, reserved_at FROM public.tickets WHERE id = $1', [fixtureTicketId]);
    expect(t.rows[0]?.['db_state']).toBe('AVAILABLE');
    expect(t.rows[0]?.['reserved_at']).toBeNull();
    // (pas de restauration d'état : cleanup20 supprime le ticket avec son lot itest-imp20-pg)
  });

  it('getOpenPaymentsWithRefOlderThan : candidats du webhook-sweeper (INITIATED + ref, min-age)', async () => {
    const cust = await pool20.query(`INSERT INTO public.customers (phone) VALUES ('0197202222') RETURNING id`);
    const plan = await pool20.query(`SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`);
    const ord = await pool20.query(
      `INSERT INTO public.orders (customer_id, plan_id, plan_snapshot, idempotency_key)
       VALUES ($1, $2, '{"offer_id":"24-HEURES","price_snapshot":300,"validity_duration_snapshot":48}'::jsonb,
               'itest-imp20-pg-sweep1') RETURNING id`,
      [String(cust.rows[0]?.['id']), String(plan.rows[0]?.['id'])],
    );
    const orderId = String(ord.rows[0]?.['id']);
    const payment = await repo20.createPayment(orderId, 300);
    await repo20.markPaymentAwaitingResult(payment.id, 'fedapay:itest-imp20-pg-sweep1');
    await pool20.query(`UPDATE public.payments SET created_at = now() - interval '10 minutes' WHERE id = $1`, [payment.id]);

    const candidates = await repo20.getOpenPaymentsWithRefOlderThan(new Date(Date.now() - 5 * 60_000));
    expect(candidates.map((c) => c.providerRef)).toContain('fedapay:itest-imp20-pg-sweep1');
    // min-age respecté : seuil de 30 min => ce paiement de 10 min n'est PAS candidat.
    const tooSoon = await repo20.getOpenPaymentsWithRefOlderThan(new Date(Date.now() - 30 * 60_000));
    expect(tooSoon.map((c) => c.providerRef)).not.toContain('fedapay:itest-imp20-pg-sweep1');
  });

  it('runOrderExpiry sur base réelle : ticket SOLD à échéance dépassée => EXPIRED', async () => {
    const batch = await pool20.query(
      `INSERT INTO public.ticket_batches (source, quantity, notes)
       VALUES ('backend', 1, 'itest-imp20-pg') RETURNING id`,
    );
    const plan = await pool20.query(`SELECT id FROM public.plans WHERE offer_id = '24-HEURES' AND active_to IS NULL LIMIT 1`);
    const tick = await pool20.query(
      `INSERT INTO public.tickets (batch_id, code_hash, code_prefix_hint, plan_id, sold_at, activation_deadline)
       VALUES ($1, $2, 'zz', $3, now() - interval '3 days', now() - interval '1 hour') RETURNING id`,
      [String(batch.rows[0]?.['id']), createHash('sha256').update('itest-imp20-dl').digest('hex'), String(plan.rows[0]?.['id'])],
    );
    const ticketId = String(tick.rows[0]?.['id']);
    // Chaîne légale 0009 : AVAILABLE -> RESERVED -> SOLD.
    await pool20.query(`UPDATE public.tickets SET db_state = 'RESERVED', reserved_at = now() WHERE id = $1`, [ticketId]);
    await pool20.query(
      `UPDATE public.tickets SET db_state = 'SOLD', sold_at = now() - interval '3 days', order_id = $2 WHERE id = $1`,
      [ticketId, fixtureOrderId],
    );

    const report = await runOrderExpiry(repo20, new Date());
    expect(report.ticketsExpired).toContain(ticketId);
    const t = await pool20.query('SELECT db_state FROM public.tickets WHERE id = $1', [ticketId]);
    expect(t.rows[0]?.['db_state']).toBe('EXPIRED');
  });

  it('reconciler simulé sur base réelle : run OK + reconciliation_runs (routeur null, IMP-24)', async () => {
    const report = await runReconciliationSim(repo20);
    expect(report.violations).toEqual([]);
    expect(report.status).toBe('OK');
    const { rows } = await pool20.query(
      'SELECT status, router_total_seen, diff FROM public.reconciliation_runs WHERE id = $1',
      [report.runId],
    );
    expect(rows[0]?.['status']).toBe('OK');
    expect(rows[0]?.['router_total_seen']).toBeNull();
    expect(rows[0]?.['diff']).toMatchObject({ mode: 'simulation_phase1' });
    await pool20.query('DELETE FROM public.reconciliation_runs WHERE id = $1', [report.runId]);
  });
});

// ---------------------------------------------------------------------------
// IMP-21 — Contrat Connector (blueprint §5, D12) : claim atomique SKIP LOCKED,
// retry/backoff (RETRY -> BLOCKED), requeue des verrous perdus, purge du code
// clair après succès (INC-04), et E2E dry-run : un lot digital IMP-18 consommé
// de bout en bout par le DryRunConnector via les vraies routes HTTP (inject).
// ---------------------------------------------------------------------------
describeDb('IMP-21 — contrat Connector sur Postgres réel', () => {
  const pool21 = new Pool({ connectionString: DATABASE_URL });
  const repo21 = new PgRepo(pool21);
  const TOKEN21 = 'itest-imp21-pg-token';
  let blockStart: Date = new Date();

  const cleanup21 = async (): Promise<void> => {
    await pool21.query(`DELETE FROM public.mikrotik_sync WHERE created_at >= $1`, [blockStart]);
    await pool21.query(
      `DELETE FROM public.tickets WHERE batch_id IN (
         SELECT id FROM public.ticket_batches WHERE source = 'backend' AND created_at >= $1)`,
      [blockStart],
    );
    await pool21.query(`DELETE FROM public.ticket_batches WHERE source = 'backend' AND created_at >= $1`, [blockStart]);
  };

  beforeAll(async () => {
    const res = await pool21.query(`SELECT now() AS t`);
    blockStart = new Date(res.rows[0]?.['t'] as string);
    await cleanup21();
  });
  afterAll(async () => { await cleanup21(); await pool21.end(); });

  it('claim atomique : deux claims concurrents (SKIP LOCKED) obtiennent deux opérations distinctes', async () => {
    await pool21.query(`INSERT INTO public.mikrotik_sync (operation, payload) VALUES ('read_status', '{}'), ('read_status', '{}')`);
    const now = new Date();
    const [a, b] = await Promise.all([repo21.claimSyncOp('w1', now), repo21.claimSyncOp('w2', now)]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a?.id).not.toBe(b?.id);
    expect([a?.lockedBy, b?.lockedBy].sort()).toEqual(['w1', 'w2']);
    expect(a?.attempts).toBe(1);
  });

  it('RETRY futur non réclamable ; RETRY échu réclamable avec attempts incrémenté', async () => {
    const ins = await pool21.query(
      `INSERT INTO public.mikrotik_sync (operation, payload, state, attempts, next_retry_at)
       VALUES ('read_status', '{}', 'RETRY', 1, now() + interval '1 hour') RETURNING id`,
    );
    const opId = String(ins.rows[0]?.['id']);
    expect(await repo21.claimSyncOp('w1', new Date())).toBeNull(); // seul op : futur => rien
    await pool21.query(`UPDATE public.mikrotik_sync SET next_retry_at = now() - interval '1 minute' WHERE id = $1`, [opId]);
    const claimed = await repo21.claimSyncOp('w1', new Date());
    expect(claimed?.id).toBe(opId);
    expect(claimed?.attempts).toBe(2);
  });

  it('résolution : échec => RETRY avec échéance ; échec suivant sans échéance => BLOCKED', async () => {
    const ins = await pool21.query(`INSERT INTO public.mikrotik_sync (operation, payload) VALUES ('create_ticket', '{"name":"dg0a1b2c"}') RETURNING id`);
    const opId = String(ins.rows[0]?.['id']);
    const claimed = await repo21.claimSyncOp('w1', new Date());
    expect(claimed?.id).toBe(opId);

    const retry = await repo21.resolveSyncOp(opId, { kind: 'failure', error: { code: 'router_timeout', message: 'timeout' }, nextRetryAt: new Date(Date.now() + 60_000) }, new Date());
    expect(retry).toMatchObject({ state: 'RETRY', attempts: 1 });
    const row1 = await pool21.query(`SELECT state, next_retry_at, result FROM public.mikrotik_sync WHERE id = $1`, [opId]);
    expect(row1.rows[0]?.['state']).toBe('RETRY');
    expect(row1.rows[0]?.['next_retry_at']).not.toBeNull();
    expect(row1.rows[0]?.['result']).toMatchObject({ error: { code: 'router_timeout' } });

    await pool21.query(`UPDATE public.mikrotik_sync SET next_retry_at = now() - interval '1 minute' WHERE id = $1`, [opId]);
    await repo21.claimSyncOp('w1', new Date());
    const blocked = await repo21.resolveSyncOp(opId, { kind: 'failure', error: { code: 'router_dead', message: 'ko' }, nextRetryAt: null }, new Date());
    expect(blocked).toMatchObject({ state: 'BLOCKED', attempts: 2 });
    const row2 = await pool21.query(`SELECT state FROM public.mikrotik_sync WHERE id = $1`, [opId]);
    expect(row2.rows[0]?.['state']).toBe('BLOCKED');
  });

  it('requeueStuckSyncOps : PROCESSING au verrou perdu => RETRY immédiat, attempts intact', async () => {
    const ins = await pool21.query(`INSERT INTO public.mikrotik_sync (operation, payload) VALUES ('read_status', '{}') RETURNING id`);
    const opId = String(ins.rows[0]?.['id']);
    await repo21.claimSyncOp('w1', new Date());
    // updated_at est géré par trigger (set_updated_at) : bypass superuser local
    // pour simuler un verrou posé il y a 30 min (précédent : IMP-16).
    await pool21.query(`ALTER TABLE public.mikrotik_sync DISABLE TRIGGER mikrotik_sync_updated_at`);
    await pool21.query(`UPDATE public.mikrotik_sync SET updated_at = now() - interval '30 minutes' WHERE id = $1`, [opId]);
    await pool21.query(`ALTER TABLE public.mikrotik_sync ENABLE TRIGGER mikrotik_sync_updated_at`);

    const requeued = await repo21.requeueStuckSyncOps(new Date(Date.now() - 10 * 60_000), new Date());
    expect(requeued).toEqual([opId]);
    const row = await pool21.query(`SELECT state, attempts, next_retry_at, result FROM public.mikrotik_sync WHERE id = $1`, [opId]);
    expect(row.rows[0]?.['state']).toBe('RETRY');
    expect(Number(row.rows[0]?.['attempts'])).toBe(1); // NON incrémenté : l'échec n'est pas au Connector
    expect(new Date(row.rows[0]?.['next_retry_at'] as string).getTime()).toBeLessThan(Date.now() + 1_000);
    expect(row.rows[0]?.['result']).toMatchObject({ error: { code: 'stuck_lock' } });
    // La fixture part en RETRY : la retirer pour ne pas polluer l'E2E suivant.
    await pool21.query(`DELETE FROM public.mikrotik_sync WHERE id = $1`, [opId]);
  });

  it('E2E dry-run : lot digital IMP-18 consommé par le DryRunConnector via les routes réelles', async () => {
    const batch = await repo21.createBackendBatch({ offerId: '5-HEURES', quantity: 2 });
    expect(batch.specs).toHaveLength(2);

    const app21 = await buildApp({ repo: repo21, connector: { token: TOKEN21 } });
    try {
      class InjectTransport implements SyncTransport {
        async claim(workerId: string): Promise<ClaimedOp | null> {
          const res = await app21.inject({
            method: 'POST', url: '/connector/sync/claim',
            headers: { authorization: `Bearer ${TOKEN21}` },
            payload: { worker_id: workerId },
          });
          if (res.statusCode === 204) return null;
          if (res.statusCode !== 200) throw new Error(`claim HTTP ${res.statusCode}`);
          const body = res.json() as Record<string, unknown>;
          return {
            id: String(body['id']),
            operation: String(body['operation']),
            payload: (body['payload'] ?? {}) as Record<string, unknown>,
            state: String(body['state']),
            attempts: Number(body['attempts'] ?? 0),
          };
        }
        async reportResult(opId: string, body: ResultBody): Promise<void> {
          const res = await app21.inject({
            method: 'POST', url: `/connector/sync/${opId}/result`,
            headers: { authorization: `Bearer ${TOKEN21}` },
            payload: body,
          });
          if (res.statusCode !== 200) throw new Error(`result HTTP ${res.statusCode}: ${res.body}`);
        }
      }

      const router = new DryRunConnector(seedLegacyInventory());
      const summary = await drainQueue(new InjectTransport(), router, 'dry-run-pg');
      expect(summary).toEqual({ processed: 2, success: 2, retry: 0 });

      const rows = await pool21.query(
        `SELECT state, attempts, payload, result FROM public.mikrotik_sync
         WHERE operation = 'create_ticket' AND (payload->>'batch_seq')::int = $1`,
        [batch.seq],
      );
      expect(rows.rows).toHaveLength(2);
      for (const row of rows.rows) {
        expect(row['state']).toBe('SUCCESS');
        expect(Number(row['attempts'])).toBe(1);
        expect(row['payload']).not.toHaveProperty('password'); // purge INC-04 après succès
        expect(row['payload']).toHaveProperty('name');
        expect(row['result']).toMatchObject({ applied: 'create_ticket', router: 'dry-run' });
        const appliedName = (row['result'] as Record<string, unknown>)['name'];
        expect(router.inventory().some((u) => u.name === appliedName)).toBe(true); // bien sur le "routeur"
      }
      const audit = await pool21.query(
        `SELECT count(*)::int AS n FROM public.audit_logs WHERE action = 'connector_sync_success' AND entity = 'mikrotik_sync'`,
      );
      expect(Number(audit.rows[0]?.['n'])).toBeGreaterThanOrEqual(2);
    } finally {
      await app21.close();
    }
  });
});

// ---------------------------------------------------------------------------
// IMP-22 — Connector v0 STRICTEMENT READ-ONLY (contrat §4) : inventaire attendu
// (660 empreintes legacy + vouchers digitaux, jamais de clair) et rapport de
// lecture => reconciliation_runs (router_total_seen) + alerte si MISMATCH.
// E2E : expected réel + lectures fixtures => reconcileReadOnly => report.
// ---------------------------------------------------------------------------
describeDb('IMP-22 — inventaire read-only sur Postgres réel', () => {
  const pool22 = new Pool({ connectionString: DATABASE_URL });
  const repo22 = new PgRepo(pool22);
  const TOKEN22 = 'itest-imp22-pg-token';
  let blockStart: Date = new Date();

  const cleanup22 = async (): Promise<void> => {
    await pool22.query(`DELETE FROM public.mikrotik_sync WHERE created_at >= $1`, [blockStart]);
    await pool22.query(
      `DELETE FROM public.tickets WHERE batch_id IN (
         SELECT id FROM public.ticket_batches WHERE source = 'backend' AND created_at >= $1)`,
      [blockStart],
    );
    await pool22.query(`DELETE FROM public.ticket_batches WHERE source = 'backend' AND created_at >= $1`, [blockStart]);
    await pool22.query(`DELETE FROM public.reconciliation_runs WHERE diff->>'mode' IN ('readonly_v0') AND started_at >= $1`, [blockStart]);
  };

  beforeAll(async () => {
    const res = await pool22.query(`SELECT now() AS t`);
    blockStart = new Date(res.rows[0]?.['t'] as string);
    await cleanup22();
  });
  afterAll(async () => { await cleanup22(); await pool22.end(); });

  it('GET expected réel : 660 empreintes legacy + vouchers digitaux SUCCESS, zéro clair', async () => {
    const app22 = await buildApp({ repo: repo22, connector: { token: TOKEN22 } });
    try {
      // Un lot digital synchronisé en succès pour alimenter le volet digital.
      const batch = await repo22.createBackendBatch({ offerId: '12-HEURES', quantity: 1 });
      const claimed = await repo22.claimSyncOp('w-imp22', new Date());
      expect(claimed).not.toBeNull();
      await repo22.resolveSyncOp(claimed?.id ?? '', { kind: 'success', result: { applied: 'create_ticket' } }, new Date());

      const res = await app22.inject({ method: 'GET', url: '/connector/inventory/expected', headers: { authorization: `Bearer ${TOKEN22}` } });
      expect(res.statusCode).toBe(200);
      const body = res.json() as Record<string, unknown>;
      const hashes = body['legacy_code_hashes'] as string[];
      expect(hashes).toHaveLength(660); // stock Mikmon 0010, empreintes seulement
      const vouchers = body['digital_vouchers'] as Array<Record<string, unknown>>;
      expect(vouchers.some((v) => v['name'] === batch.specs[0]?.routerName)).toBe(true);
      expect(JSON.stringify(body)).not.toContain(batch.specs[0]?.clientCode ?? '____'); // clair absent
      void batch;
    } finally {
      await app22.close();
    }
  });

  it('E2E read-only : lectures fixtures vs attendu réel => MISMATCH tracé + alerte WARNING', async () => {
    const app22 = await buildApp({ repo: repo22, connector: { token: TOKEN22 } });
    try {
      const expectedRes = await app22.inject({ method: 'GET', url: '/connector/inventory/expected', headers: { authorization: `Bearer ${TOKEN22}` } });
      const rawExpected = expectedRes.json() as Record<string, unknown>;
      const expected: PlatformExpected = {
        digitalVouchers: (rawExpected['digital_vouchers'] as Array<Record<string, unknown>>).map((v) => ({
          name: String(v['name']), profile: String(v['profile']), comment: String(v['comment']),
        })),
        legacyCodeHashes: (rawExpected['legacy_code_hashes'] as string[]).slice(0, 0), // E2E : seul le volet digital compte ici
      };
      const observed = new ReadOnlyConnectorV0({
        usersText: HOTSPOT_USERS_TABULAR_FIXTURE,
        activeText: HOTSPOT_ACTIVE_FIXTURE,
        journalText: MIKHMON_JOURNAL_FIXTURE,
      }).collect();
      const report = reconcileReadOnly(expected, observed);
      // Users fixtures synthétiques inconnus de la vraie base => ticket_inconnu.
      expect(report.status).toBe('MISMATCH');
      expect(report.violations.join(',')).toContain('ticket_inconnu');

      const post = await app22.inject({
        method: 'POST', url: '/connector/inventory/report',
        headers: { authorization: `Bearer ${TOKEN22}` },
        payload: {
          router_total_seen: report.routerTotalSeen,
          status: report.status,
          violations: report.violations,
          anomalies: report.anomalies,
          by_profile: report.byProfile,
          admin_free_seen: report.adminFreeSeen,
          journal_sales: report.journalSales,
        },
      });
      expect(post.statusCode).toBe(201);
      const runId = (post.json() as Record<string, unknown>)['run_id'] as string;
      const run = await pool22.query(`SELECT status, router_total_seen, diff FROM public.reconciliation_runs WHERE id = $1`, [runId]);
      expect(run.rows[0]?.['status']).toBe('MISMATCH');
      expect(Number(run.rows[0]?.['router_total_seen'])).toBe(5);
      expect(run.rows[0]?.['diff']).toMatchObject({ mode: 'readonly_v0' });
      const alerts = await pool22.query(`SELECT rule, severity FROM public.alerts WHERE payload->>'run_id' = $1`, [runId]);
      expect(alerts.rows[0]).toMatchObject({ rule: 'router_readonly_mismatch', severity: 'WARNING' });

      // Volet cohérent : attendu digital vide + observé sans legacy => rapport OK sans alerte.
      const okReport = reconcileReadOnly({ digitalVouchers: [], legacyCodeHashes: [] }, {
        users: [{ name: 'admin-free-1', profile: 'Admin-free', comment: null, limitUptime: null, disabled: false }],
        active: [],
        journal: [],
      });
      expect(okReport.status).toBe('OK');
      const okPost = await app22.inject({
        method: 'POST', url: '/connector/inventory/report',
        headers: { authorization: `Bearer ${TOKEN22}` },
        payload: {
          router_total_seen: okReport.routerTotalSeen,
          status: okReport.status,
          violations: okReport.violations,
          anomalies: okReport.anomalies,
          by_profile: okReport.byProfile,
          admin_free_seen: okReport.adminFreeSeen,
          journal_sales: okReport.journalSales,
        },
      });
      expect(okPost.statusCode).toBe(201);
      const okAlerts = await pool22.query(`SELECT count(*)::int AS n FROM public.alerts WHERE payload->>'run_id' = $1`, [(okPost.json() as Record<string, unknown>)['run_id']]);
      expect(Number(okAlerts.rows[0]?.['n'])).toBe(0);
    } finally {
      await app22.close();
    }
  });
});
