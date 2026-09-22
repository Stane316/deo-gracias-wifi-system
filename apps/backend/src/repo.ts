/**
 * IMP-12 — Couche d'accès données du backend (ADR 0001 : `pg` natif dans Fastify).
 * L'interface BackendRepo permet des tests unitaires sans base (fake en mémoire)
 * et des tests d'intégration réels (PgRepo sur Postgres éphémère CI / sandbox).
 */
import type { Pool } from 'pg';

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
  /** Journalisation des connexions admin (doc 09 §8) — audit_logs insert-only. */
  logAudit(entry: {
    actor: string;
    action: string;
    entity: string;
    entityId?: string | null;
  }): Promise<void>;
  /** Lie un compte Supabase Auth au client (RLS « own rows » via auth_user_id, 0007). */
  linkCustomerAuth(customerId: string, authUserId: string): Promise<void>;
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

interface OrderRow {
  id: string;
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

function mapOrder(row: OrderRow): OrderRecord {
  return {
    id: row.id,
    state: row.state,
    currency: row.currency,
    planSnapshot: row.plan_snapshot,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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
       RETURNING id, state, currency, plan_snapshot, created_at, updated_at`,
      [input.customerId, input.planId, JSON.stringify(input.planSnapshot), input.idempotencyKey],
    );
    const fresh = inserted.rows[0];
    if (fresh) return { order: mapOrder(fresh), created: true };
    // Replay : la clé existe déjà => on retourne la commande initiale (idempotence §21).
    const existing = await this.pool.query<OrderRow>(
      `SELECT id, state, currency, plan_snapshot, created_at, updated_at
       FROM public.orders WHERE idempotency_key = $1`,
      [input.idempotencyKey],
    );
    const row = existing.rows[0];
    if (!row) throw new Error('createOrder: replay introuvable (incohérence)');
    return { order: mapOrder(row), created: false };
  }

  async getOrderById(id: string): Promise<OrderRecord | null> {
    const res = await this.pool.query<OrderRow>(
      `SELECT id, state, currency, plan_snapshot, created_at, updated_at
       FROM public.orders WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? mapOrder(row) : null;
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
