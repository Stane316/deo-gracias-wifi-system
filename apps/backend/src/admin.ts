/**
 * IMP-17 — Logique métier admin (pure, sans base ni HTTP).
 *
 * Doc 09 §12.1 : indicateurs du dashboard (Aujourd'hui / Inventaire / Système).
 * Doc 09 §13 (règle impérative) : les chiffres proviennent des données métier
 * persistées (commandes/paiements/tickets réels) — JAMAIS reconstruits côté
 * frontend (pas de « revenu = tickets × prix »).
 *
 * Conventions documentées :
 * - Le jour courant métier est le jour calendaire à Africa/Porto-Novo
 *   (UTC+1 fixe, sans heure d'été) : c'est le fuseau du site de Calavi.
 * - Inventaire : `available` = AVAILABLE + RELEASED (libéré = réallouable
 *   immédiatement), `reserved` = RESERVED, `sold` = SOLD + USED,
 *   `expired` = tout le reste (EXPIRED…).
 * - Synchronisation MikroTik : FAILED/BLOCKED/MANUAL_REVIEW => ERROR ;
 *   PENDING/PROCESSING/RETRY => WARNING ; SUCCESS seul => HEALTHY ;
 *   aucune ligne => UNKNOWN (Phase 1 : le Connector arrive en IMP-21).
 */

export const BUSINESS_TIMEZONE = 'Africa/Porto-Novo';
export const BUSINESS_UTC_OFFSET_MINUTES = 60;
/** Doc 09 §12.1 « tickets proches de l'épuisement » — seuil à confirmer. */
export const LOW_STOCK_THRESHOLD = 10;
export const CONNECTOR_ONLINE_WINDOW_MS = 2 * 60_000;
export const CONNECTOR_OFFLINE_AFTER_MS = 5 * 60_000;

export type ConnectorState = 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
export type SyncHealthState = 'HEALTHY' | 'WARNING' | 'ERROR' | 'UNKNOWN';

export interface AdminActivityEvent {
  id: string;
  kind: 'SALE' | 'PAYMENT' | 'TICKET' | 'INCIDENT' | 'SYNC' | 'ADMIN';
  action: string;
  actor: string;
  entity: string;
  entityId: string | null;
  state: string | null;
  occurredAt: string;
}

export interface ConnectorHeartbeat {
  connectorId: string;
  version: string | null;
  routerModel: string | null;
  routerosVersion: string | null;
  lastSeenAt: string;
}

/** Agrégats bruts remontés par le repo (source : données persistées). */
export interface AdminDashboardDbStats {
  ordersCountToday: number;
  salesCountToday: number;
  paymentsConfirmedToday: number;
  revenueTodayFcfa: number;
  ticketsDeliveredToday: number;
  salesByOffer: Array<{ offerId: string; salesCount: number; revenueFcfa: number }>;
  /** Compte des tickets par état brut de `tickets.db_state`. */
  ticketsByState: Record<string, number>;
  /** Tickets réallouables (AVAILABLE + RELEASED) par `plans.offer_id`. */
  availableByOffer: Record<string, number>;
  incidentsOpen: number;
  syncPending: number;
  syncFailed: number;
  syncSuccess: number;
  syncLastAt: string | null;
  syncLastState: string | null;
  syncLastError: string | null;
  recentActivity: AdminActivityEvent[];
  connector: ConnectorHeartbeat | null;
}

export interface DashboardPayload {
  generated_at: string;
  business_day_start: string;
  timezone: string;
  today: {
    revenue_fcfa: number;
    orders_count: number;
    sales_count: number;
    payments_confirmed: number;
    tickets_delivered: number;
  };
  sales_by_offer: Array<{ offer_id: string; sales_count: number; revenue_fcfa: number }>;
  inventory: {
    available: number;
    reserved: number;
    sold: number;
    expired: number;
    low_stock: Array<{ offer_id: string; available: number }>;
  };
  recent_activity: Array<{
    id: string;
    kind: AdminActivityEvent['kind'];
    action: string;
    actor: string;
    entity: string;
    entity_id: string | null;
    state: string | null;
    occurred_at: string;
  }>;
  system: {
    connector_state: ConnectorState;
    connector_id: string | null;
    connector_last_contact_at: string | null;
    connector_version: string | null;
    router_model: string | null;
    routeros_version: string | null;
    sync_state: SyncHealthState;
    last_sync_at: string | null;
    last_sync_state: string | null;
    last_sync_error: string | null;
    sync_pending: number;
    sync_failed: number;
    sync_success: number;
    incidents_open: number;
  };
}

/**
 * Début du jour calendaire métier (Africa/Porto-Novo, UTC+1 fixe).
 * Déterministe et testable : dérivé de la date locale via Intl (en-CA = AAAA-MM-JJ).
 */
export function startOfBusinessDay(now: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '01';
  const localMidnight = `${get('year')}-${get('month')}-${get('day')}T00:00:00+01:00`;
  return new Date(localMidnight);
}

const AVAILABLE_STATES = new Set(['AVAILABLE', 'RELEASED']);
const RESERVED_STATES = new Set(['RESERVED']);
const SOLD_STATES = new Set(['SOLD', 'USED']);

export interface InventoryTotals {
  available: number;
  reserved: number;
  sold: number;
  expired: number;
}

export function inventoryTotals(ticketsByState: Record<string, number>): InventoryTotals {
  const totals: InventoryTotals = { available: 0, reserved: 0, sold: 0, expired: 0 };
  for (const [state, count] of Object.entries(ticketsByState)) {
    if (AVAILABLE_STATES.has(state)) totals.available += count;
    else if (RESERVED_STATES.has(state)) totals.reserved += count;
    else if (SOLD_STATES.has(state)) totals.sold += count;
    else totals.expired += count;
  }
  return totals;
}

/** Offres dont le stock réallouable est sous le seuil (doc 09 §12.1). */
export function lowStockOffers(
  availableByOffer: Record<string, number>,
  allOfferIds: readonly string[],
  threshold: number = LOW_STOCK_THRESHOLD,
): Array<{ offer_id: string; available: number }> {
  return allOfferIds
    .map((offerId) => ({ offer_id: offerId, available: availableByOffer[offerId] ?? 0 }))
    .filter((entry) => entry.available <= threshold)
    .sort((a, b) => a.available - b.available || a.offer_id.localeCompare(b.offer_id));
}

export function computeSyncState(counts: {
  pending: number;
  failed: number;
  success: number;
}): SyncHealthState {
  if (counts.failed > 0) return 'ERROR';
  if (counts.pending > 0) return 'WARNING';
  if (counts.success > 0) return 'HEALTHY';
  return 'UNKNOWN';
}

/**
 * ONLINE/OFFLINE repose uniquement sur un heartbeat explicite.
 * Une opération de file ne prouve pas que le Connector est encore joignable.
 */
export function computeConnectorState(
  heartbeat: ConnectorHeartbeat | null,
  now: Date = new Date(),
): ConnectorState {
  if (!heartbeat) return 'UNKNOWN';
  const age = now.getTime() - new Date(heartbeat.lastSeenAt).getTime();
  if (age <= CONNECTOR_ONLINE_WINDOW_MS) return 'ONLINE';
  if (age > CONNECTOR_OFFLINE_AFTER_MS) return 'OFFLINE';
  return 'UNKNOWN';
}

export function buildDashboardPayload(
  stats: AdminDashboardDbStats,
  allOfferIds: readonly string[],
  now: Date = new Date(),
): DashboardPayload {
  const totals = inventoryTotals(stats.ticketsByState);
  const connectorState = computeConnectorState(stats.connector, now);
  const syncState = computeSyncState({
    pending: stats.syncPending,
    failed: stats.syncFailed,
    success: stats.syncSuccess,
  });
  return {
    generated_at: now.toISOString(),
    business_day_start: startOfBusinessDay(now).toISOString(),
    timezone: BUSINESS_TIMEZONE,
    today: {
      revenue_fcfa: stats.revenueTodayFcfa,
      orders_count: stats.ordersCountToday,
      sales_count: stats.salesCountToday,
      payments_confirmed: stats.paymentsConfirmedToday,
      tickets_delivered: stats.ticketsDeliveredToday,
    },
    sales_by_offer: stats.salesByOffer.map((sale) => ({
      offer_id: sale.offerId,
      sales_count: sale.salesCount,
      revenue_fcfa: sale.revenueFcfa,
    })),
    inventory: {
      ...totals,
      low_stock: lowStockOffers(stats.availableByOffer, allOfferIds),
    },
    recent_activity: stats.recentActivity.map((event) => ({
      id: event.id,
      kind: event.kind,
      action: event.action,
      actor: event.actor,
      entity: event.entity,
      entity_id: event.entityId,
      state: event.state,
      occurred_at: event.occurredAt,
    })),
    system: {
      connector_state: connectorState,
      connector_id: stats.connector?.connectorId ?? null,
      connector_last_contact_at: stats.connector?.lastSeenAt ?? null,
      connector_version: stats.connector?.version ?? null,
      router_model: stats.connector?.routerModel ?? null,
      routeros_version: stats.connector?.routerosVersion ?? null,
      sync_state: syncState,
      last_sync_at: stats.syncLastAt,
      last_sync_state: stats.syncLastState,
      last_sync_error: stats.syncLastError,
      sync_pending: stats.syncPending,
      sync_failed: stats.syncFailed,
      sync_success: stats.syncSuccess,
      incidents_open: stats.incidentsOpen,
    },
  };
}

/** Résultat d'un ack d'alerte (idempotent : re-ack = déjà reconnue). */
export interface AlertAckRecord {
  id: string;
  rule: string;
  severity: string;
  acknowledgedAt: Date;
  alreadyAcknowledged: boolean;
}
