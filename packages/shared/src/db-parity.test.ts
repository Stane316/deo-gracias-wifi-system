import { describe, expect, it } from 'vitest';
import m0003 from '../../../supabase/migrations/0003_orders_payments.sql?raw';
import m0004 from '../../../supabase/migrations/0004_tickets_batches.sql?raw';
import m0005 from '../../../supabase/migrations/0005_mikrotik_sync_sessions.sql?raw';
import m0009 from '../../../supabase/migrations/0009_state_guards.sql?raw';
import {
  ALL_TRANSITION_EDGES,
  ORDER_STATES,
  PAYMENT_STATES,
  SESSION_STATES,
  SYNC_STATES,
  TICKET_DB_STATES,
} from './states.js';
import { TICKET_ROUTER_STATES } from './index.js';

/**
 * IMP-11 — Parité normative TS ↔ SQL : les ensembles d'états des CHECK en base
 * et les arêtes de la table state_transitions (migration 0009) doivent être
 * EXACTEMENT ceux de packages/shared. Toute dérive = échec CI.
 */
const parseCheck = (sql: string, column: string): string[] => {
  const re = new RegExp(`CHECK \\(${column} IN\\s*\\(([^)]*)\\)`);
  const m = sql.match(re);
  expect(m, `CHECK(${column} IN ...) introuvable`).not.toBeNull();
  const body = (m as RegExpMatchArray)[1] as string;
  return [...body.matchAll(/'([A-Z_]+)'/g)].map((x) => x[1] as string);
};

const sorted = (xs: readonly string[]) => [...xs].sort();

describe('IMP-11 — parité états TS ↔ CHECK SQL', () => {
  it('orders.state (0003) = ORDER_STATES', () => {
    expect(sorted(parseCheck(m0003, 'state'))).toEqual(sorted(ORDER_STATES));
  });
  it('payments.state (0003) = PAYMENT_STATES', () => {
    // 0003 contient deux CHECK(state IN ...) : orders puis payments → second occurence
    const occ = [...m0003.matchAll(/CHECK \(state IN\s*\(([^)]*)\)/g)].map((x) => x[1]);
    expect(occ).toHaveLength(2);
    const payments = [...(occ[1] as string).matchAll(/'([A-Z_]+)'/g)].map((x) => x[1] as string);
    expect(sorted(payments)).toEqual(sorted(PAYMENT_STATES));
  });
  it('tickets.router_state (0004) = TICKET_ROUTER_STATES', () => {
    expect(sorted(parseCheck(m0004, 'router_state'))).toEqual(sorted(TICKET_ROUTER_STATES));
  });
  it('tickets.db_state (0004) = TICKET_DB_STATES', () => {
    expect(sorted(parseCheck(m0004, 'db_state'))).toEqual(sorted(TICKET_DB_STATES));
  });
  it('mikrotik_sync.state (0005) = SYNC_STATES', () => {
    expect(sorted(parseCheck(m0005, 'state'))).toEqual(sorted(SYNC_STATES));
  });
  it('access_sessions.state (0005) = SESSION_STATES', () => {
    const occ = [...m0005.matchAll(/CHECK \(state IN\s*\(([^)]*)\)/g)].map((x) => x[1]);
    expect(occ).toHaveLength(2);
    const sessions = [...(occ[1] as string).matchAll(/'([A-Z_]+)'/g)].map((x) => x[1] as string);
    expect(sorted(sessions)).toEqual(sorted(SESSION_STATES));
  });
});

describe('IMP-11 — parité arêtes TS ↔ state_transitions (0009)', () => {
  const sqlEdges: [string, string, string][] = [...m0009.matchAll(/\('([a-z_]+)', '([A-Z_]+)', '([A-Z_]+)'\)/g)].map(
    (x) => [x[1] as string, x[2] as string, x[3] as string],
  );

  it('35 arêtes insérées en base', () => {
    expect(sqlEdges).toHaveLength(35);
  });

  it('chaque arête TS existe en base et réciproquement', () => {
    const key = (e: readonly [string, string, string]) => e.join('>');
    const ts = new Set(ALL_TRANSITION_EDGES.map((e) => key(e as readonly [string, string, string])));
    const db = new Set(sqlEdges.map(key));
    expect([...ts].sort()).toEqual([...db].sort());
  });

  it('la table state_transitions est protégée (RLS + entity CHECK)', () => {
    expect(m0009).toContain('ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY');
    expect(m0009).toMatch(/CHECK \(entity IN \('orders', 'payments', 'tickets', 'mikrotik_sync', 'access_sessions'\)\)/);
  });
});
