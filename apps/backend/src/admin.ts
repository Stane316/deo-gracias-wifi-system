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

/** Agrégats bruts remontés par le repo (source : données persistées). */
export interface AdminDashboardDbStats {
  ordersCountToday: number;
  paymentsConfirmedToday: number;
  revenueTodayFcfa: number;
  ticketsDeliveredToday: number;
  /** Compte des tickets par état brut de `tickets.db_state`. */
  ticketsByState: Record<string, number>;
  /** Tickets réallouables (AVAILABLE + RELEASED) par `plans.offer_id`. */
  availableByOffer: Record<string, number>;
  incidentsOpen: number;
  syncPending: number;
  syncFailed: number;
  syncSuccess: number;
}

export interface DashboardPayload {
  generated_at: string;
  business_day_start: string;
  timezone: string;
  today: {
    revenue_fcfa: number;
    orders_count: number;
    payments_confirmed: number;
    tickets_delivered: number;
  };
  inventory: {
    available: number;
    reserved: number;
    sold: number;
    expired: number;
    low_stock: Array<{ offer_id: string; available: number }>;
  };
  system: {
    connector_state: 'ONLINE' | 'OFFLINE' | 'UNKNOWN';
    sync_state: 'HEALTHY' | 'WARNING' | 'ERROR' | 'UNKNOWN';
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
}): 'HEALTHY' | 'WARNING' | 'ERROR' | 'UNKNOWN' {
  if (counts.failed > 0) return 'ERROR';
  if (counts.pending > 0) return 'WARNING';
  if (counts.success > 0) return 'HEALTHY';
  return 'UNKNOWN';
}

export function buildDashboardPayload(
  stats: AdminDashboardDbStats,
  allOfferIds: readonly string[],
  now: Date = new Date(),
): DashboardPayload {
  const totals = inventoryTotals(stats.ticketsByState);
  return {
    generated_at: now.toISOString(),
    business_day_start: startOfBusinessDay(now).toISOString(),
    timezone: BUSINESS_TIMEZONE,
    today: {
      revenue_fcfa: stats.revenueTodayFcfa,
      orders_count: stats.ordersCountToday,
      payments_confirmed: stats.paymentsConfirmedToday,
      tickets_delivered: stats.ticketsDeliveredToday,
    },
    inventory: {
      ...totals,
      low_stock: lowStockOffers(stats.availableByOffer, allOfferIds),
    },
    system: {
      // Phase 1 : le Connector (IMP-21) n'existe pas encore — état honnête.
      connector_state: 'UNKNOWN',
      sync_state: computeSyncState({
        pending: stats.syncPending,
        failed: stats.syncFailed,
        success: stats.syncSuccess,
      }),
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
