/**
 * IMP-17 — Tests unitaires admin : dashboard, stats tickets, ack d'alertes.
 * Normatifs : chiffres issus des données persistées (doc 09 §13 — jamais
 * reconstruits côté frontend), auth admin Supabase + rôle (doc 09 §7-8),
 * audit des actions admin (doc 09 §F), idempotence du ack.
 */
import { describe, expect, it } from 'vitest';
import {
  BUSINESS_TIMEZONE,
  buildDashboardPayload,
  computeSyncState,
  inventoryTotals,
  lowStockOffers,
  startOfBusinessDay,
  type AdminDashboardDbStats,
} from './admin.js';
import { buildApp } from './app.js';
import type { AuthIdentity, AuthVerifier } from './auth.js';
import { FakeRepo } from './fake-repo.js';

class FakeVerifier implements AuthVerifier {
  identities = new Map<string, AuthIdentity>();
  async verify(token: string): Promise<AuthIdentity | null> {
    return this.identities.get(token) ?? null;
  }
}

const looseLimits = { requestMax: 1000, verifyMax: 1000 };

async function adminApp() {
  const repo = new FakeRepo();
  const verifier = new FakeVerifier();
  verifier.identities.set('tok-admin', { sub: 'sub-admin', phone: null, email: 'admin@dg.bj', role: 'ADMIN' });
  verifier.identities.set('tok-user', { sub: 'sub-user', phone: null, email: null, role: null });
  const app = await buildApp({ repo, rateLimit: { max: 100000 }, auth: { verifier, rateLimits: looseLimits } });
  return { repo, app };
}

const zeroStats: AdminDashboardDbStats = {
  ordersCountToday: 0,
  paymentsConfirmedToday: 0,
  revenueTodayFcfa: 0,
  ticketsDeliveredToday: 0,
  ticketsByState: {},
  availableByOffer: {},
  incidentsOpen: 0,
  syncPending: 0,
  syncFailed: 0,
  syncSuccess: 0,
};

// ---------------------------------------------------------------------------
// Logique pure (admin.ts)
// ---------------------------------------------------------------------------
describe('IMP-17 — logique pure admin', () => {
  it('startOfBusinessDay : jour calendaire à Africa/Porto-Novo (UTC+1, déterministe)', () => {
    // 23/09 22h30 UTC = 23/09 23h30 local => début du jour local = 22/09 23h00 UTC.
    expect(startOfBusinessDay(new Date('2026-09-23T22:30:00Z')).toISOString())
      .toBe('2026-09-22T23:00:00.000Z');
    // 23/09 23h30 UTC = 24/09 00h30 local => on bascule sur le jour suivant.
    expect(startOfBusinessDay(new Date('2026-09-23T23:30:00Z')).toISOString())
      .toBe('2026-09-23T23:00:00.000Z');
  });

  it('inventoryTotals : AVAILABLE+RELEASED / RESERVED / SOLD+USED / reste', () => {
    expect(inventoryTotals({
      AVAILABLE: 650, RELEASED: 2, RESERVED: 3, SOLD: 4, USED: 1, EXPIRED: 7,
    })).toEqual({ available: 652, reserved: 3, sold: 5, expired: 7 });
  });

  it('lowStockOffers : seuil, offre absente = 0, tri croissant', () => {
    const offers = lowStockOffers({ 'A': 3, 'B': 100 }, ['A', 'B', 'C'], 10);
    expect(offers).toEqual([
      { offer_id: 'C', available: 0 },
      { offer_id: 'A', available: 3 },
    ]);
    // Une offre exactement au seuil est signalée (<= seuil).
    expect(lowStockOffers({ 'X': 10 }, ['X'], 10)).toEqual([{ offer_id: 'X', available: 10 }]);
  });

  it('computeSyncState : ERROR > WARNING > HEALTHY > UNKNOWN', () => {
    expect(computeSyncState({ pending: 2, failed: 1, success: 9 })).toBe('ERROR');
    expect(computeSyncState({ pending: 2, failed: 0, success: 9 })).toBe('WARNING');
    expect(computeSyncState({ pending: 0, failed: 0, success: 9 })).toBe('HEALTHY');
    expect(computeSyncState({ pending: 0, failed: 0, success: 0 })).toBe('UNKNOWN');
  });

  it('buildDashboardPayload : structure doc 09 §12.1 + fuseau métier + connector UNKNOWN', () => {
    const now = new Date('2026-09-23T12:00:00Z');
    const payload = buildDashboardPayload({
      ...zeroStats,
      ordersCountToday: 5,
      paymentsConfirmedToday: 4,
      revenueTodayFcfa: 1100,
      ticketsDeliveredToday: 4,
      ticketsByState: { AVAILABLE: 659, SOLD: 1 },
      availableByOffer: { '5-HEURES': 300 },
      incidentsOpen: 2,
      syncFailed: 1,
    }, ['5-HEURES', '1-MOIS'], now);
    expect(payload.timezone).toBe(BUSINESS_TIMEZONE);
    // toISOString() normalise en UTC : minuit local (UTC+1) = 23h00 UTC la veille.
    expect(payload.business_day_start).toBe('2026-09-22T23:00:00.000Z');
    expect(payload.today).toEqual({
      revenue_fcfa: 1100, orders_count: 5, payments_confirmed: 4, tickets_delivered: 4,
    });
    expect(payload.inventory.available).toBe(659);
    expect(payload.inventory.sold).toBe(1);
    // 5-HEURES a 300 disponibles (> seuil) : seule 1-MOIS (0) est signalée.
    expect(payload.inventory.low_stock).toEqual([
      { offer_id: '1-MOIS', available: 0 },
    ]);
    expect(payload.system).toEqual({ connector_state: 'UNKNOWN', sync_state: 'ERROR', incidents_open: 2 });
  });
});

// ---------------------------------------------------------------------------
// GET /admin/dashboard
// ---------------------------------------------------------------------------
describe('IMP-17 — GET /admin/dashboard', () => {
  it('503 si l\u0027auth admin n\u0027est pas configurée', async () => {
    const app = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 100000 }, auth: { rateLimits: looseLimits } });
    const res = await app.inject({ method: 'GET', url: '/admin/dashboard' });
    expect(res.statusCode).toBe(503);
    expect(res.headers['content-type']).toContain('application/problem+json');
    await app.close();
  });

  it('401 sans jeton (message générique), 403 sans rôle admin — audités', async () => {
    const { repo, app } = await adminApp();
    const r1 = await app.inject({ method: 'GET', url: '/admin/dashboard' });
    expect(r1.statusCode).toBe(401);
    const r2 = await app.inject({ method: 'GET', url: '/admin/dashboard', headers: { authorization: 'Bearer tok-user' } });
    expect(r2.statusCode).toBe(403);
    const denied = repo.audits.filter((a) => a.action === 'admin_auth_denied');
    expect(denied).toHaveLength(2);
    await app.close();
  });

  it('200 : chiffres transmis depuis les données persistées (doc 09 §13), aucun calcul frontend', async () => {
    const { repo, app } = await adminApp();
    repo.dashboardStats = {
      ...zeroStats,
      ordersCountToday: 3,
      paymentsConfirmedToday: 2,
      revenueTodayFcfa: 600,
      ticketsDeliveredToday: 2,
      ticketsByState: { AVAILABLE: 660 },
      availableByOffer: { '5-HEURES': 300, '12-HEURES': 60, '24-HEURES': 100, '72-HEURES': 120, '1-SEMAINE': 40, '1-MOIS': 40 },
    };
    const res = await app.inject({ method: 'GET', url: '/admin/dashboard', headers: { authorization: 'Bearer tok-admin' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as Record<string, unknown>;
    expect(body['timezone']).toBe('Africa/Porto-Novo');
    expect(body['today']).toEqual({
      revenue_fcfa: 600, orders_count: 3, payments_confirmed: 2, tickets_delivered: 2,
    });
    expect(body['inventory']).toMatchObject({ available: 660, reserved: 0, sold: 0 });
    // Stock complet => aucun low_stock.
    expect((body['inventory'] as { low_stock: unknown[] }).low_stock).toEqual([]);
    expect(body['system']).toMatchObject({ connector_state: 'UNKNOWN', sync_state: 'UNKNOWN' });
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /admin/tickets/stats
// ---------------------------------------------------------------------------
describe('IMP-17 — GET /admin/tickets/stats', () => {
  it('401 sans jeton', async () => {
    const { app } = await adminApp();
    const res = await app.inject({ method: 'GET', url: '/admin/tickets/stats' });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('200 : par offre + totaux, mapping des états (RELEASED dispo, USED vendu, reste expiré)', async () => {
    const { repo, app } = await adminApp();
    repo.ticketsStatsByOffer = [
      { offerId: '5-HEURES', priceFcfa: 100, states: { AVAILABLE: 298, RELEASED: 2, SOLD: 5, USED: 1, EXPIRED: 3 } },
      { offerId: '1-MOIS', priceFcfa: 4000, states: { AVAILABLE: 40 } },
    ];
    const res = await app.inject({ method: 'GET', url: '/admin/tickets/stats', headers: { authorization: 'Bearer tok-admin' } });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as {
      offers: Array<Record<string, unknown>>;
      totals: Record<string, number>;
    };
    expect(body.offers).toEqual([
      { offer_id: '5-HEURES', price_fcfa: 100, available: 300, reserved: 0, sold: 6, expired: 3, total: 309 },
      { offer_id: '1-MOIS', price_fcfa: 4000, available: 40, reserved: 0, sold: 0, expired: 0, total: 40 },
    ]);
    expect(body.totals).toEqual({ available: 340, reserved: 0, sold: 6, expired: 3, total: 349 });
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// POST /admin/alerts/:id/ack
// ---------------------------------------------------------------------------
describe('IMP-17 — POST /admin/alerts/:id/ack', () => {
  const ALERT_ID = '3f2b1a09-8c7d-4e6f-9a5b-1c2d3e4f5a6b';

  it('400 si id non UUID, 404 si alerte inconnue (auditée)', async () => {
    const { repo, app } = await adminApp();
    const r1 = await app.inject({ method: 'POST', url: '/admin/alerts/pas-un-uuid/ack', headers: { authorization: 'Bearer tok-admin' } });
    expect(r1.statusCode).toBe(400);
    const r2 = await app.inject({ method: 'POST', url: `/admin/alerts/${ALERT_ID}/ack`, headers: { authorization: 'Bearer tok-admin' } });
    expect(r2.statusCode).toBe(404);
    expect(repo.audits.some((a) => a.action === 'admin_alert_ack_notfound')).toBe(true);
    await app.close();
  });

  it('ack : 200 avec acknowledged_at, idempotent au rejeu (already_acknowledged), audité', async () => {
    const { repo, app } = await adminApp();
    repo.alerts.set(ALERT_ID, { id: ALERT_ID, rule: 'stock_low', severity: 'WARNING', acknowledgedAt: null });
    const r1 = await app.inject({ method: 'POST', url: `/admin/alerts/${ALERT_ID}/ack`, headers: { authorization: 'Bearer tok-admin' } });
    expect(r1.statusCode).toBe(200);
    const b1 = JSON.parse(r1.body) as Record<string, unknown>;
    expect(b1).toMatchObject({ id: ALERT_ID, rule: 'stock_low', severity: 'WARNING', already_acknowledged: false });
    expect(typeof b1['acknowledged_at']).toBe('string');

    const r2 = await app.inject({ method: 'POST', url: `/admin/alerts/${ALERT_ID}/ack`, headers: { authorization: 'Bearer tok-admin' } });
    expect(r2.statusCode).toBe(200);
    const b2 = JSON.parse(r2.body) as Record<string, unknown>;
    expect(b2['already_acknowledged']).toBe(true);
    expect(b2['acknowledged_at']).toBe(b1['acknowledged_at']); // même horodatage : pas de re-ack

    const actions = repo.audits.map((a) => a.action);
    expect(actions).toContain('admin_alert_ack');
    expect(actions).toContain('admin_alert_ack_noop');
    await app.close();
  });

  it('401/403 selon jeton/rôle', async () => {
    const { app } = await adminApp();
    const r1 = await app.inject({ method: 'POST', url: `/admin/alerts/${ALERT_ID}/ack` });
    expect(r1.statusCode).toBe(401);
    const r2 = await app.inject({ method: 'POST', url: `/admin/alerts/${ALERT_ID}/ack`, headers: { authorization: 'Bearer tok-user' } });
    expect(r2.statusCode).toBe(403);
    await app.close();
  });
});
