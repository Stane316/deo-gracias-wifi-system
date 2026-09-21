import { describe, expect, it } from 'vitest';
import {
  ALL_TRANSITION_EDGES,
  ORDER_STATES,
  ORDER_TRANSITIONS,
  PAYMENT_STATES,
  PAYMENT_TRANSITIONS,
  SESSION_STATES,
  SYNC_STATES,
  SYNC_TRANSITIONS,
  TICKET_DB_STATES,
  TICKET_DB_TRANSITIONS,
  canOrderTransition,
  canPaymentTransition,
  canSessionTransition,
  canSyncTransition,
  canTicketDbTransition,
} from './states.js';
import { TICKET_ROUTER_STATES, TICKET_STATES } from './index.js';

describe("IMP-11 — machines d'états (docs 06)", () => {
  it('alias rétrocompatible : TICKET_STATES === TICKET_ROUTER_STATES', () => {
    expect(TICKET_STATES).toBe(TICKET_ROUTER_STATES);
    expect(TICKET_ROUTER_STATES).toEqual([
      'UNUSED',
      'ACTIVE',
      'EXPIRED_REMOVED',
      'ADMIN_FREE_LEGACY',
    ]);
  });

  it('ordre : machine principale complète (docs 06 §11)', () => {
    expect(canOrderTransition('CREATED', 'PAYMENT_PENDING')).toBe(true);
    expect(canOrderTransition('PAYMENT_PENDING', 'PAID')).toBe(true);
    expect(canOrderTransition('PAID', 'TICKET_ALLOCATED')).toBe(true);
    expect(canOrderTransition('TICKET_ALLOCATED', 'DELIVERED')).toBe(true);
  });

  it('ordre : sauts interdits et états terminaux', () => {
    expect(canOrderTransition('CREATED', 'PAID')).toBe(false);
    expect(canOrderTransition('CREATED', 'DELIVERED')).toBe(false);
    expect(canOrderTransition('PAYMENT_PENDING', 'DELIVERED')).toBe(false);
    for (const terminal of ['DELIVERED', 'FAILED', 'EXPIRED', 'CANCELLED', 'REFUNDED'] as const) {
      expect(ORDER_TRANSITIONS[terminal]).toEqual([]);
    }
  });

  it('ordre : branches documentées (§11)', () => {
    expect(canOrderTransition('PAYMENT_PENDING', 'FAILED')).toBe(true);
    expect(canOrderTransition('PAYMENT_PENDING', 'EXPIRED')).toBe(true);
    expect(canOrderTransition('PAYMENT_PENDING', 'CANCELLED')).toBe(true);
    expect(canOrderTransition('PAID', 'REFUNDED')).toBe(true);
  });

  it('paiement : confirmation uniquement webhook-ready (§15-17)', () => {
    expect(canPaymentTransition('PENDING', 'CONFIRMED')).toBe(true);
    expect(canPaymentTransition('CREATED', 'CONFIRMED')).toBe(false);
    expect(canPaymentTransition('INITIATED', 'CONFIRMED')).toBe(false);
    expect(canPaymentTransition('CONFIRMED', 'REFUNDED')).toBe(true);
    for (const t of ['FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] as const) {
      expect(PAYMENT_TRANSITIONS[t]).toEqual([]);
    }
  });

  it('ticket plateforme : allocation atomique et branches (§27)', () => {
    expect(canTicketDbTransition('AVAILABLE', 'RESERVED')).toBe(true);
    expect(canTicketDbTransition('RESERVED', 'SOLD')).toBe(true);
    expect(canTicketDbTransition('SOLD', 'USED')).toBe(true);
    expect(canTicketDbTransition('AVAILABLE', 'EXPIRED')).toBe(true);
    expect(canTicketDbTransition('RESERVED', 'RELEASED')).toBe(true);
    expect(canTicketDbTransition('SOLD', 'REFUNDED')).toBe(true);
    expect(canTicketDbTransition('AVAILABLE', 'USED')).toBe(false);
    expect(canTicketDbTransition('AVAILABLE', 'SOLD')).toBe(false);
  });

  it('sync : retry/backoff et terminaux (§34-36)', () => {
    expect(canSyncTransition('PENDING', 'PROCESSING')).toBe(true);
    expect(canSyncTransition('PROCESSING', 'FAILED')).toBe(true);
    expect(canSyncTransition('FAILED', 'RETRY')).toBe(true);
    expect(canSyncTransition('RETRY', 'PROCESSING')).toBe(true);
    expect(canSyncTransition('FAILED', 'BLOCKED')).toBe(true);
    expect(canSyncTransition('FAILED', 'MANUAL_REVIEW')).toBe(true);
    expect(canSyncTransition('PENDING', 'SUCCESS')).toBe(false);
    expect(SYNC_TRANSITIONS.SUCCESS).toEqual([]);
    expect(SYNC_TRANSITIONS.BLOCKED).toEqual([]);
  });

  it('sessions : cycle et branches (§37-38)', () => {
    expect(canSessionTransition('NOT_STARTED', 'ACTIVE')).toBe(true);
    expect(canSessionTransition('ACTIVE', 'ENDED')).toBe(true);
    expect(canSessionTransition('ACTIVE', 'EXPIRED')).toBe(true);
    expect(canSessionTransition('ACTIVE', 'DISCONNECTED')).toBe(true);
    expect(canSessionTransition('ACTIVE', 'ERROR')).toBe(true);
    expect(canSessionTransition('NOT_STARTED', 'ENDED')).toBe(false);
  });

  it('cohérence interne : toute arête pointe vers des états déclarés', () => {
    const sets: Record<string, readonly string[]> = {
      orders: ORDER_STATES,
      payments: PAYMENT_STATES,
      tickets: TICKET_DB_STATES,
      mikrotik_sync: SYNC_STATES,
      access_sessions: SESSION_STATES,
    };
    for (const [entity, from, to] of ALL_TRANSITION_EDGES) {
      expect(sets[entity]).toContain(from);
      expect(sets[entity]).toContain(to);
    }
  });

  it('comptage des arêtes (miroir migration 0009)', () => {
    expect(ALL_TRANSITION_EDGES).toHaveLength(35);
  });
});
