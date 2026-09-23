/**
 * IMP-12 — Couche d'accès données du backend (ADR 0001 : `pg` natif dans Fastify).
 * L'interface BackendRepo permet des tests unitaires sans base (fake en mémoire)
 * et des tests d'intégration réels (PgRepo sur Postgres éphémère CI / sandbox).
 */
import type { Pool } from 'pg';
import type { AdminDashboardDbStats, AlertAckRecord } from './admin.js';


export interface ActivePlan {
  planId: string;
  offerId: string;
  priceFcfa: number;
  accessHours: number;
  validityHours: number;
  mikrotikProfile: string;
  limitUptime: string;
  version: number;
}

export interface OrderRecord {
  id: string;
  customerId: string;
  /** IMP-15 : plan de la commande (mapping tickets.plan_id lors de l'allocation). */
  planId: string;
  state: string;
  currency: string;
  planSnapshot: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateOrderInputDb {
  customerId: string;
  planId: string;
  planSnapshot: Record<string, unknown>;
  idempotencyKey: string;
}

export interface BackendRepo {
  /** Sonde de disponibilité (readyz). */
  ping(): Promise<void>;
  /** Catalogue actif : dernière version de chaque offre sans active_to (doc 06 §08). */
  listActivePlans(): Promise<ActivePlan[]>;
  getActivePlanByOffer(offerId: string): Promise<ActivePlan | null>;
  /** Identification minimale (doc 06 §06) : find-or-create atomique par phone. */
  findOrCreateCustomer(phone: string): Promise<string>;
  /**
   * Création idempotente (doc 06 §21) : UNIQUE(idempotency_key) en base.
   * created=false => replay d'une clé déjà utilisée (même commande retournée).
   */
  createOrder(input: CreateOrderInputDb): Promise<{ order: OrderRecord; created: boolean }>;
  getOrderById(id: string): Promise<OrderRecord | null>;
  // --- IMP-14 : paiements + webhooks (doc 06 §14-24) ---
  getCustomerById(customerId: string): Promise<{ id: string; phone: string } | null>;
  createPayment(orderId: string, amountFcfa: number): Promise<PaymentRecord>;
  /** CREATED→INITIATED→PENDING + order CREATED→PAYMENT_PENDING (une transaction). */
  markPaymentAwaitingResult(paymentId: string, providerRef: string): Promise<'initiated' | 'illegal'>;
  getPaymentById(id: string): Promise<PaymentRecord | null>;
  getOpenPaymentForOrder(orderId: string): Promise<PaymentRecord | null>;
  getPaymentByProviderRef(providerRef: string): Promise<PaymentRecord | null>;
  /** Insert-only ; false = déjà présent (idempotence doc 06 §20-21). */
  insertPaymentEvent(entry: {
    paymentId: string | null;
    providerEventId: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<boolean>;
  /** PENDING→CONFIRMED + order PAYMENT_PENDING→PAID (une transaction, doc 06 §24). */
  confirmPayment(paymentId: string): Promise<'confirmed' | 'illegal'>;
  /** PENDING→FAILED|CANCELLED + order aligné (une transaction). */
  failPayment(
    paymentId: string,
    to: { payment: 'FAILED' | 'CANCELLED'; order: 'FAILED' | 'CANCELLED' },
  ): Promise<'failed' | 'illegal'>;
  // --- IMP-15 : allocation atomique + livraison (doc 06 §29-31, blueprint §3.3) ---
  /**
   * Allocation atomique : un ticket AVAILABLE du plan de la commande passe
   * RESERVED→SOLD et la commande PAID→TICKET_ALLOCATED, en UNE transaction
   * (FOR UPDATE SKIP LOCKED — doc 06 §30, invariant 2). Jamais deux commandes
   * sur le même ticket, même sous concurrence.
   */
  allocateTicketForOrder(orderId: string): Promise<AllocateResult>;
  /** TICKET_ALLOCATED→DELIVERED ; idempotent (invariant 7 : jamais double livraison). */
  deliverOrder(orderId: string): Promise<'delivered' | 'already-delivered' | 'illegal'>;
  /** Tickets vendus d'un client (own rows, blueprint §6) — JAMAIS de code en clair. */
  getSoldTicketsForCustomer(customerId: string): Promise<Array<TicketRecord & { offerId: string | null }>>;
  /** Journalisation des connexions admin (doc 09 §8) — audit_logs insert-only. */
  logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
  }): Promise<void>;
  /** Lie un compte Supabase Auth au client (RLS « own rows » via auth_user_id, 0007). */
  linkCustomerAuth(customerId: string, authUserId: string): Promise<void>;

  /** IMP-17 — agrégats du dashboard admin (doc 09 §12-13), jour courant = depuis `since`. */
  getAdminDashboardStats(since: Date): Promise<AdminDashboardDbStats>;
  /** IMP-17 — inventaire par offre active (doc 09 §12.1). */
  getTicketsStatsByOffer(): Promise<Array<{ offerId: string; priceFcfa: number; states: Record<string, number> }>>;
  /** IMP-17 — reconnaissance d'alerte, atomique et idempotente (doc 09 §4.E). */
  acknowledgeAlert(id: string): Promise<AlertAckRecord | null>;

  close(): Promise<void>;
}

interface PlanRow {
  id: string;
  offer_id: string;
  price_fcfa: number;
  access_hours: number;
  validity_hours: number;
  mikrotik_profile: string;
  limit_uptime: string;
  version: number;
}

interface PaymentRow {
  id: string;
  order_id: string;
  provider: string;
  provider_ref: string | null;
  amount_fcfa: number;
  state: string;
  confirmed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PaymentRecord {
  id: string;
  orderId: string;
  provider: string;
  providerRef: string | null;
  amountFcfa: number;
  state: string;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface TicketRow {
  id: string;
  batch_id: string;
  plan_id: string;
  db_state: string;
  router_state: string;
  order_id: string | null;
  code_prefix_hint: string | null;
  sold_at: Date | null;
  mikrotik_comment: string | null;
}

export interface TicketRecord {
  id: string;
  batchId: string;
  planId: string;
  dbState: string;
  routerState: string;
  orderId: string | null;
  codePrefixHint: string | null;
  soldAt: Date | null;
  mikrotikComment: string | null;
}

export type AllocateResult =
  | { status: 'allocated'; ticketId: string; codePrefixHint: string | null }
  | { status: 'no-stock' }
  | { status: 'illegal' };

interface OrderRow {
  id: string;
  customer_id: string;
  plan_id: string;
  state: string;
  currency: string;
  plan_snapshot: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
}

function mapPlan(row: PlanRow): ActivePlan {
  return {
    planId: row.id,
    offerId: row.offer_id,
    priceFcfa: row.price_fcfa,
    accessHours: row.access_hours,
    validityHours: row.validity_hours,
    mikrotikProfile: row.mikrotik_profile,
    limitUptime: row.limit_uptime,
    version: row.version,
  };
}

function mapPayment(row: PaymentRow): PaymentRecord {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    providerRef: row.provider_ref,
    amountFcfa: row.amount_fcfa,
    state: row.state,
    confirmedAt: row.confirmed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapTicket(row: TicketRow): TicketRecord {
  return {
    id: row.id,
    batchId: row.batch_id,
    planId: row.plan_id,
    dbState: row.db_state,
    routerState: row.router_state,
    orderId: row.order_id,
    codePrefixHint: row.code_prefix_hint,
    soldAt: row.sold_at,
    mikrotikComment: row.mikrotik_comment,
  };
}

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    planId: row.plan_id,
    state: row.state,
    currency: row.currency,
    planSnapshot: row.plan_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

class TxAbort extends Error {
  constructor(readonly result: 'illegal') {
    super('transaction annulée (garde métier)');
  }
}

const SELECT_ACTIVE_PLAN = `
  SELECT id, offer_id, price_fcfa, access_hours, validity_hours,
         mikrotik_profile, limit_uptime, version
  FROM public.plans
  WHERE offer_id = $1 AND active_to IS NULL
  ORDER BY version DESC
  LIMIT 1`;

const SELECT_ACTIVE_PLANS = `
  SELECT DISTINCT ON (offer_id)
         id, offer_id, price_fcfa, access_hours, validity_hours,
         mikrotik_profile, limit_uptime, version
  FROM public.plans
  WHERE active_to IS NULL
  ORDER BY offer_id, version DESC`;

export class PgRepo implements BackendRepo {
  constructor(private readonly pool: Pool) {}

  async ping(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async listActivePlans(): Promise<ActivePlan[]> {
    const res = await this.pool.query<PlanRow>(SELECT_ACTIVE_PLANS);
    return res.rows.map(mapPlan);
  }

  async getActivePlanByOffer(offerId: string): Promise<ActivePlan | null> {
    const res = await this.pool.query<PlanRow>(SELECT_ACTIVE_PLAN, [offerId]);
    const row = res.rows[0];
    return row ? mapPlan(row) : null;
  }

  async findOrCreateCustomer(phone: string): Promise<string> {
    // ON CONFLICT ... DO UPDATE garantit le RETURNING même en course concurrente.
    const res = await this.pool.query<{ id: string }>(
      `INSERT INTO public.customers (phone) VALUES ($1)
       ON CONFLICT (phone) DO UPDATE SET phone = EXCLUDED.phone
       RETURNING id`,
      [phone],
    );
    const row = res.rows[0];
    if (!row) throw new Error('findOrCreateCustomer: aucun id retourné');
    return row.id;
  }

  async createOrder(
    input: CreateOrderInputDb,
  ): Promise<{ order: OrderRecord; created: boolean }> {
    const inserted = await this.pool.query<OrderRow>(
      `INSERT INTO public.orders (customer_id, plan_id, plan_snapshot, idempotency_key)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (idempotency_key) DO NOTHING
       RETURNING id, customer_id, plan_id, state, currency, plan_snapshot, created_at, updated_at`,
      [input.customerId, input.planId, JSON.stringify(input.planSnapshot), input.idempotencyKey],
    );
    const fresh = inserted.rows[0];
    if (fresh) return { order: mapOrder(fresh), created: true };
    // Replay : la clé existe déjà => on retourne la commande initiale (idempotence §21).
    const existing = await this.pool.query<OrderRow>(
      `SELECT id, customer_id, plan_id, state, currency, plan_snapshot, created_at, updated_at
       FROM public.orders WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error('createOrder: replay introuvable (incohérence)');
    return { order: mapOrder(row), created: false };
  }

  async getOrderById(id: string): Promise<OrderRecord | null> {
    const res = await this.pool.query<OrderRow>(
      `SELECT id, customer_id, plan_id, state, currency, plan_snapshot, created_at, updated_at
       FROM public.orders WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? mapOrder(row) : null;
  }

  /**
   * Sentinel d'annulation : levé dans withTx pour FORCER le ROLLBACK et retourner
   * un résultat métier (ex. commande introuvable après payment déjà transitionné :
   * on annule TOUT, jamais d'état incohérent — doc 06 §24 atomicité).
   */
  private async withTx<T>(fn: (q: (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(async (sql, params) => {
        const res = await client.query(sql, params);
        return { rows: res.rows as Record<string, unknown>[], rowCount: res.rowCount };
      });
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async allocateTicketForOrder(orderId: string): Promise<AllocateResult> {
    return this.withTx(async (q) => {
      const o = await q(
        `SELECT state, plan_id FROM public.orders WHERE id = $1 FOR UPDATE`,
        [orderId],
      );
      const order = o.rows[0];
      if (!order) return { status: 'illegal' } as const;
      if (String(order['state']) === 'TICKET_ALLOCATED' || String(order['state']) === 'DELIVERED') {
        // Déjà allouée : on ne ré-alloue JAMAIS (invariants 2 et 7).
        const existing = await q(
          `SELECT id, code_prefix_hint FROM public.tickets WHERE order_id = $1 AND db_state IN ('SOLD','USED') LIMIT 1`,
          [orderId],
        );
        const t = existing.rows[0];
        return t
          ? ({ status: 'allocated', ticketId: String(t['id']), codePrefixHint: (t['code_prefix_hint'] as string | null) ?? null } as const)
          : ({ status: 'illegal' } as const);
      }
      if (String(order['state']) !== 'PAID') return { status: 'illegal' } as const;
      // Un seul ticket AVAILABLE du plan, verrouillé ; SKIP LOCKED = les allocations
      // concurrentes passent au ticket suivant sans se bloquer (blueprint §3.3).
      const t = await q(
        `SELECT id FROM public.tickets
         WHERE plan_id = $1 AND db_state = 'AVAILABLE'
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED`,
        [String(order['plan_id'])],
      );
      const candidate = t.rows[0];
      if (!candidate) return { status: 'no-stock' } as const;
      const reserved = await q(
        `UPDATE public.tickets
         SET db_state = 'RESERVED', order_id = $2, reserved_at = now()
         WHERE id = $1 AND db_state = 'AVAILABLE'
         RETURNING id, code_prefix_hint`,
        [String(candidate['id']), orderId],
      );
      const res = reserved.rows[0];
      if (!res) return { status: 'no-stock' } as const; // re-vérification post-verrou (doc 06 §30)
      await q(`UPDATE public.tickets SET db_state = 'SOLD', sold_at = now() WHERE id = $1 AND db_state = 'RESERVED'`, [
        String(candidate['id']),
      ]);
      const upd = await q(
        `UPDATE public.orders SET state = 'TICKET_ALLOCATED' WHERE id = $1 AND state = 'PAID' RETURNING id`,
        [orderId],
      );
      if (!upd.rows[0]) throw new TxAbort('illegal'); // ROLLBACK complet : ticket jamais orphelin
      return {
        status: 'allocated',
        ticketId: String(candidate['id']),
        codePrefixHint: (res['code_prefix_hint'] as string | null) ?? null,
      } as const;
    }).catch((err: unknown) => {
      if (err instanceof TxAbort) return { status: 'illegal' } as const;
      throw err;
    });
  }

  async deliverOrder(orderId: string): Promise<'delivered' | 'already-delivered' | 'illegal'> {
    const res = await this.pool.query(
      `UPDATE public.orders SET state = 'DELIVERED' WHERE id = $1 AND state = 'TICKET_ALLOCATED' RETURNING id`,
      [orderId],
    );
    if (res.rowCount === 1) return 'delivered';
    const cur = await this.pool.query(`SELECT state FROM public.orders WHERE id = $1`, [orderId]);
    const row = cur.rows[0];
    if (!row) return 'illegal';
    return String(row['state']) === 'DELIVERED' ? 'already-delivered' : 'illegal';
  }

  async getSoldTicketsForCustomer(
    customerId: string,
  ): Promise<Array<TicketRecord & { offerId: string | null }>> {
    const res = await this.pool.query<TicketRow & { offer_id: string | null }>(
      `SELECT t.id, t.batch_id, t.plan_id, t.db_state, t.router_state, t.order_id,
              t.code_prefix_hint, t.sold_at, t.mikrotik_comment,
              o.plan_snapshot->>'offer_id' AS offer_id
       FROM public.tickets t
       JOIN public.orders o ON o.id = t.order_id
       WHERE o.customer_id = $1 AND t.db_state IN ('SOLD','USED')
       ORDER BY t.sold_at DESC`,
      [customerId],
    );
    return res.rows.map((row) => ({ ...mapTicket(row), offerId: row.offer_id ?? null }));
  }

  async getCustomerById(customerId: string): Promise<{ id: string; phone: string } | null> {
    const res = await this.pool.query<{ id: string; phone: string }>(
      `SELECT id, phone FROM public.customers WHERE id = $1`,
      [customerId],
    );
    return res.rows[0] ?? null;
  }

  async createPayment(orderId: string, amountFcfa: number): Promise<PaymentRecord> {
    const res = await this.pool.query<PaymentRow>(
      `INSERT INTO public.payments (order_id, amount_fcfa)
       VALUES ($1, $2)
       RETURNING id, order_id, provider, provider_ref, amount_fcfa, state,
                 confirmed_at, created_at, updated_at`,
      [orderId, amountFcfa],
    );
    const row = res.rows[0];
    if (!row) throw new Error('createPayment: aucune ligne retournée');
    return mapPayment(row);
  }

  async markPaymentAwaitingResult(
    paymentId: string,
    providerRef: string,
  ): Promise<'initiated' | 'illegal'> {
    return this.withTx(async (q) => {
      const p = await q(
        `UPDATE public.payments SET state = 'INITIATED', provider_ref = $2
         WHERE id = $1 AND state = 'CREATED' RETURNING order_id`,
        [paymentId, providerRef],
      );
      const orderRow = p.rows[0];
      if (!orderRow) return 'illegal';
      await q(`UPDATE public.payments SET state = 'PENDING' WHERE id = $1 AND state = 'INITIATED'`, [
        paymentId,
      ]);
      // Ordre déjà PAYMENT_PENDING = replay : la garde WHERE rend l'étape no-op.
      await q(
        `UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = $1 AND state = 'CREATED'`,
        [String(orderRow['order_id'])],
      );
      return 'initiated';
    });
  }

  async getPaymentById(id: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async getOpenPaymentForOrder(orderId: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments
       WHERE order_id = $1 AND state IN ('CREATED', 'INITIATED', 'PENDING')
       ORDER BY created_at DESC LIMIT 1`,
      [orderId],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async getPaymentByProviderRef(providerRef: string): Promise<PaymentRecord | null> {
    const res = await this.pool.query<PaymentRow>(
      `SELECT id, order_id, provider, provider_ref, amount_fcfa, state,
              confirmed_at, created_at, updated_at
       FROM public.payments WHERE provider_ref = $1`,
      [providerRef],
    );
    const row = res.rows[0];
    return row ? mapPayment(row) : null;
  }

  async insertPaymentEvent(entry: {
    paymentId: string | null;
    providerEventId: string;
    payload: unknown;
    signatureOk: boolean;
  }): Promise<boolean> {
    // La table (migration 0003) n'a pas de colonne provider : le préfixe
    // « fedapay: » de provider_event_id porte cette information (doc 06 §21).
    const res = await this.pool.query(
      `INSERT INTO public.payment_events (payment_id, provider_event_id, payload, signature_ok)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (provider_event_id) DO NOTHING
       RETURNING id`,
      [entry.paymentId, entry.providerEventId, JSON.stringify(entry.payload), entry.signatureOk],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async confirmPayment(paymentId: string): Promise<'confirmed' | 'illegal'> {
    return this.withTx(async (q) => {
      const p = await q(
        `UPDATE public.payments SET state = 'CONFIRMED', confirmed_at = now()
         WHERE id = $1 AND state = 'PENDING' RETURNING order_id`,
        [paymentId],
      );
      const orderRow = p.rows[0];
      if (!orderRow) return 'illegal';
      const o = await q(
        `UPDATE public.orders SET state = 'PAID'
         WHERE id = $1 AND state = 'PAYMENT_PENDING' RETURNING id`,
        [String(orderRow['order_id'])],
      );
      if (!o.rows[0]) throw new TxAbort('illegal'); // ROLLBACK : jamais payment CONFIRMED sans order PAID
      return 'confirmed';
    }).catch((err: unknown) => {
      if (err instanceof TxAbort) return 'illegal' as const;
      throw err;
    });
  }

  async failPayment(
    paymentId: string,
    to: { payment: 'FAILED' | 'CANCELLED'; order: 'FAILED' | 'CANCELLED' },
  ): Promise<'failed' | 'illegal'> {
    return this.withTx(async (q) => {
      const p = await q(
        `UPDATE public.payments SET state = $2
         WHERE id = $1 AND state = 'PENDING' RETURNING order_id`,
        [paymentId, to.payment],
      );
      const orderRow = p.rows[0];
      if (!orderRow) return 'illegal';
      const o = await q(
        `UPDATE public.orders SET state = $2
         WHERE id = $1 AND state = 'PAYMENT_PENDING' RETURNING id`,
        [String(orderRow['order_id']), to.order],
      );
      if (!o.rows[0]) throw new TxAbort('illegal'); // ROLLBACK complet
      return 'failed';
    }).catch((err: unknown) => {
      if (err instanceof TxAbort) return 'illegal' as const;
      throw err;
    });
  }

  async logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO public.audit_logs (actor, action, entity, entity_id)
       VALUES ($1, $2, $3, $4)`,
      [entry.actor, entry.action, entry.entity, entry.entityId ?? null],
    );
  }

  async linkCustomerAuth(customerId: string, authUserId: string): Promise<void> {
    // Idempotent : ne fait rien si déjà lié au même compte ; jamais d'écrasement.
    await this.pool.query(
      `UPDATE public.customers
       SET auth_user_id = $2
       WHERE id = $1 AND (auth_user_id IS NULL OR auth_user_id = $2)`,
      [customerId, authUserId],
    );
  }

  async getAdminDashboardStats(since: Date): Promise<AdminDashboardDbStats> {
    const [orders, payments, delivered, byState, byOffer, incidents, sync] = await Promise.all([
      this.pool.query(
        `SELECT count(*)::int AS n FROM public.orders WHERE created_at >= $1`,
        [since],
      ),
      this.pool.query(
        `SELECT count(*)::int AS n,
                coalesce(sum(amount_fcfa), 0)::bigint AS total
         FROM public.payments WHERE state = 'CONFIRMED' AND confirmed_at >= $1`,
        [since],
      ),
      this.pool.query(
        `SELECT count(*)::int AS n FROM public.tickets WHERE sold_at >= $1`,
        [since],
      ),
      this.pool.query(
        `SELECT db_state, count(*)::int AS n FROM public.tickets GROUP BY db_state`,
      ),
      this.pool.query(
        `SELECT p.offer_id, count(*)::int AS n
         FROM public.tickets t JOIN public.plans p ON p.id = t.plan_id
         WHERE t.db_state IN ('AVAILABLE', 'RELEASED')
         GROUP BY p.offer_id`,
      ),
      this.pool.query(
        `SELECT count(*)::int AS n FROM public.incidents WHERE state IN ('OPEN', 'INVESTIGATING')`,
      ),
      this.pool.query(
        `SELECT count(*) FILTER (WHERE state IN ('PENDING', 'PROCESSING', 'RETRY'))::int AS pending,
                count(*) FILTER (WHERE state IN ('FAILED', 'BLOCKED', 'MANUAL_REVIEW'))::int AS failed,
                count(*) FILTER (WHERE state = 'SUCCESS')::int AS success
         FROM public.mikrotik_sync`,
      ),
    ]);
    const ticketsByState: Record<string, number> = {};
    for (const row of byState.rows) ticketsByState[String(row['db_state'])] = Number(row['n']);
    const availableByOffer: Record<string, number> = {};
    for (const row of byOffer.rows) availableByOffer[String(row['offer_id'])] = Number(row['n']);
    return {
      ordersCountToday: Number(orders.rows[0]?.['n'] ?? 0),
      paymentsConfirmedToday: Number(payments.rows[0]?.['n'] ?? 0),
      revenueTodayFcfa: Number(payments.rows[0]?.['total'] ?? 0),
      ticketsDeliveredToday: Number(delivered.rows[0]?.['n'] ?? 0),
      ticketsByState,
      availableByOffer,
      incidentsOpen: Number(incidents.rows[0]?.['n'] ?? 0),
      syncPending: Number(sync.rows[0]?.['pending'] ?? 0),
      syncFailed: Number(sync.rows[0]?.['failed'] ?? 0),
      syncSuccess: Number(sync.rows[0]?.['success'] ?? 0),
    };
  }

  async getTicketsStatsByOffer(): Promise<Array<{ offerId: string; priceFcfa: number; states: Record<string, number> }>> {
    const result = await this.pool.query(
      `SELECT ap.offer_id, ap.price_fcfa, t.db_state, count(t.id)::int AS n
       FROM (SELECT DISTINCT ON (offer_id) offer_id, price_fcfa
             FROM public.plans WHERE active_to IS NULL
             ORDER BY offer_id, version DESC) ap
       LEFT JOIN public.plans p ON p.offer_id = ap.offer_id
       LEFT JOIN public.tickets t ON t.plan_id = p.id
       GROUP BY ap.offer_id, ap.price_fcfa, t.db_state
       ORDER BY ap.price_fcfa`,
    );
    const byOffer = new Map<string, { offerId: string; priceFcfa: number; states: Record<string, number> }>();
    for (const row of result.rows) {
      const offerId = String(row['offer_id']);
      let entry = byOffer.get(offerId);
      if (!entry) {
        entry = { offerId, priceFcfa: Number(row['price_fcfa']), states: {} };
        byOffer.set(offerId, entry);
      }
      if (row['db_state'] != null) entry.states[String(row['db_state'])] = Number(row['n']);
    }
    return Array.from(byOffer.values());
  }

  async acknowledgeAlert(id: string): Promise<AlertAckRecord | null> {
    // Atomique : le WHERE acknowledged_at IS NULL rend le ack concurrent-safe.
    const updated = await this.pool.query(
      `UPDATE public.alerts SET acknowledged_at = now()
       WHERE id = $1 AND acknowledged_at IS NULL
       RETURNING id, rule, severity, acknowledged_at`,
      [id],
    );
    if (updated.rows[0]) {
      const row = updated.rows[0];
      return {
        id: String(row['id']),
        rule: String(row['rule']),
        severity: String(row['severity']),
        acknowledgedAt: row['acknowledged_at'] as Date,
        alreadyAcknowledged: false,
      };
    }
    const existing = await this.pool.query(
      `SELECT id, rule, severity, acknowledged_at FROM public.alerts WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) return null;
    const row = existing.rows[0];
    return {
      id: String(row['id']),
      rule: String(row['rule']),
      severity: String(row['severity']),
      acknowledgedAt: row['acknowledged_at'] as Date,
      alreadyAcknowledged: true,
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Snapshot commercial figé à la commande (doc 06 §09) : clés nommées d'après la doc,
 * complétées des champs techniques nécessaires à la livraison (profil, limit_uptime).
 */
export function buildPlanSnapshot(plan: ActivePlan): Record<string, unknown> {
  return {
    plan_id: plan.planId,
    offer_id: plan.offerId,
    plan_name_snapshot: plan.offerId,
    price_snapshot: plan.priceFcfa,
    currency_snapshot: 'XOF',
    access_duration_snapshot: plan.accessHours,
    validity_duration_snapshot: plan.validityHours,
    mikrotik_profile: plan.mikrotikProfile,
    limit_uptime: plan.limitUptime,
    plan_version: plan.version,
  };
}
