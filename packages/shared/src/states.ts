/**
 * IMP-11 — Machines d'états normatives (docs 06 §11, §15, §27, §34, §38).
 * Source unique de vérité TS ; la base de données applique exactement les mêmes
 * ensembles et arêtes via la migration 0009 (table state_transitions + CHECK),
 * et le test de parité packages/shared/src/db-parity.test.ts garantit l'alignement.
 *
 * Principe docs 06 §13 : order state ≠ payment state ≠ access state — trois machines
 * distinctes, jamais confondues.
 */

// ── ORDERS (docs 06 §11-12) ─────────────────────────────────────────────────
export const ORDER_STATES = [
  'CREATED',
  'PAYMENT_PENDING',
  'PAID',
  'TICKET_ALLOCATED',
  'DELIVERED',
  'FAILED',
  'EXPIRED',
  'CANCELLED',
  'REFUNDED',
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

export const ORDER_TRANSITIONS: Record<OrderState, readonly OrderState[]> = {
  CREATED: ['PAYMENT_PENDING'],
  PAYMENT_PENDING: ['PAID', 'FAILED', 'EXPIRED', 'CANCELLED'],
  PAID: ['TICKET_ALLOCATED', 'REFUNDED'],
  TICKET_ALLOCATED: ['DELIVERED'],
  DELIVERED: [],
  FAILED: [],
  EXPIRED: [],
  CANCELLED: [],
  REFUNDED: [],
};

// ── PAYMENTS (docs 06 §15-17) ───────────────────────────────────────────────
export const PAYMENT_STATES = [
  'CREATED',
  'INITIATED',
  'PENDING',
  'CONFIRMED',
  'FAILED',
  'CANCELLED',
  'EXPIRED',
  'REFUNDED',
] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

export const PAYMENT_TRANSITIONS: Record<PaymentState, readonly PaymentState[]> = {
  CREATED: ['INITIATED'],
  INITIATED: ['PENDING'],
  PENDING: ['CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['REFUNDED'],
  FAILED: [],
  CANCELLED: [],
  EXPIRED: [],
  REFUNDED: [],
};

// ── TICKETS côté PLATEFORME (docs 06 §27-28) ────────────────────────────────
export const TICKET_DB_STATES = [
  'AVAILABLE',
  'RESERVED',
  'SOLD',
  'USED',
  'EXPIRED',
  'RELEASED',
  'REFUNDED',
] as const;
export type TicketDbState = (typeof TICKET_DB_STATES)[number];

export const TICKET_DB_TRANSITIONS: Record<TicketDbState, readonly TicketDbState[]> = {
  AVAILABLE: ['RESERVED', 'EXPIRED'],
  RESERVED: ['SOLD', 'RELEASED'],
  // INTERPRÉTATION signalée (IMP-11) : RELEASED = remise en stock opérationnelle
  // (doc 06 §27 liste la branche RESERVED → RELEASED sans préciser la suite).
  RELEASED: ['AVAILABLE'],
  SOLD: ['USED', 'REFUNDED', 'EXPIRED'], // IMP-19 : double garde-fou validité (contrat §3.6)
  USED: [],
  EXPIRED: [],
  REFUNDED: [],
};

// ── MIKROTIK SYNC (docs 06 §34-36) ──────────────────────────────────────────
export const SYNC_STATES = [
  'PENDING',
  'PROCESSING',
  'SUCCESS',
  'FAILED',
  'RETRY',
  'BLOCKED',
  'MANUAL_REVIEW',
] as const;
export type SyncState = (typeof SYNC_STATES)[number];

export const SYNC_TRANSITIONS: Record<SyncState, readonly SyncState[]> = {
  PENDING: ['PROCESSING'],
  PROCESSING: ['SUCCESS', 'FAILED'],
  FAILED: ['RETRY', 'BLOCKED', 'MANUAL_REVIEW'],
  RETRY: ['PROCESSING'],
  MANUAL_REVIEW: ['PROCESSING'],
  SUCCESS: [],
  BLOCKED: [],
};

// ── ACCESS SESSIONS (docs 06 §37-38) ────────────────────────────────────────
export const SESSION_STATES = [
  'NOT_STARTED',
  'ACTIVE',
  'ENDED',
  'EXPIRED',
  'DISCONNECTED',
  'ERROR',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_TRANSITIONS: Record<SessionState, readonly SessionState[]> = {
  NOT_STARTED: ['ACTIVE'],
  ACTIVE: ['ENDED', 'EXPIRED', 'DISCONNECTED', 'ERROR'],
  ENDED: [],
  EXPIRED: [],
  DISCONNECTED: [],
  ERROR: [],
};

// ── Helpers de transition (purs, testables) ─────────────────────────────────
export function canOrderTransition(from: OrderState, to: OrderState): boolean {
  return ORDER_TRANSITIONS[from].includes(to);
}
export function canPaymentTransition(from: PaymentState, to: PaymentState): boolean {
  return PAYMENT_TRANSITIONS[from].includes(to);
}
export function canTicketDbTransition(from: TicketDbState, to: TicketDbState): boolean {
  return TICKET_DB_TRANSITIONS[from].includes(to);
}
export function canSyncTransition(from: SyncState, to: SyncState): boolean {
  return SYNC_TRANSITIONS[from].includes(to);
}
export function canSessionTransition(from: SessionState, to: SessionState): boolean {
  return SESSION_TRANSITIONS[from].includes(to);
}

/** Arêtes plates (entity, from, to) — miroir exact des INSERT de la migration 0009. */
export const ALL_TRANSITION_EDGES: readonly (readonly [
  'orders' | 'payments' | 'tickets' | 'mikrotik_sync' | 'access_sessions',
  string,
  string,
])[] = [
  ...(Object.entries(ORDER_TRANSITIONS) as [OrderState, readonly OrderState[]][]).flatMap(
    ([f, tos]) => tos.map((t) => ['orders', f, t] as const),
  ),
  ...(Object.entries(PAYMENT_TRANSITIONS) as [PaymentState, readonly PaymentState[]][]).flatMap(
    ([f, tos]) => tos.map((t) => ['payments', f, t] as const),
  ),
  ...(Object.entries(TICKET_DB_TRANSITIONS) as [TicketDbState, readonly TicketDbState[]][]).flatMap(
    ([f, tos]) => tos.map((t) => ['tickets', f, t] as const),
  ),
  ...(Object.entries(SYNC_TRANSITIONS) as [SyncState, readonly SyncState[]][]).flatMap(
    ([f, tos]) => tos.map((t) => ['mikrotik_sync', f, t] as const),
  ),
  ...(Object.entries(SESSION_TRANSITIONS) as [SessionState, readonly SessionState[]][]).flatMap(
    ([f, tos]) => tos.map((t) => ['access_sessions', f, t] as const),
  ),
];
