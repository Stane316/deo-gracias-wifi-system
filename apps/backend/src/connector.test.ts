/**
 * IMP-21 — Routes Connector (blueprint §5) : claim/result sur la file
 * mikrotik_sync, auth par token long-lived dédié, retry/backoff D12.
 * Tests unitaires sur FakeRepo ; l'intégration réelle est dans repo.pg.test.ts.
 */
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import { FakeRepo } from './fake-repo.js';
import type { SyncOpRecord } from './repo.js';

const TOKEN = 'itest-imp21-connector-token';

function makeOp(overrides: Partial<SyncOpRecord> = {}): SyncOpRecord {
  return {
    id: randomUUID(),
    operation: 'create_ticket',
    payload: {
      batch_seq: 100,
      name: 'dg1a2b3c',
      password: 'abcd1234',
      profile: '24-HEURES',
      limit_uptime: '1d00:00:00',
      comment: 'vc-100-09.24.26-',
    },
    state: 'PENDING',
    attempts: 0,
    nextRetryAt: null,
    lockedBy: null,
    result: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

async function setup(connectorToken: string | null = TOKEN) {
  const repo = new FakeRepo();
  const app = await buildApp({
    repo,
    ...(connectorToken ? { connector: { token: connectorToken } } : {}),
  });
  return { repo, app };
}

const auth = { authorization: `Bearer ${TOKEN}` };

describe('IMP-21 — auth Connector', () => {
  it('sans CONNECTOR_TOKEN : 503 honnête (non configuré)', async () => {
    const { app } = await setup(null);
    const res = await app.inject({ method: 'POST', url: '/connector/sync/claim', payload: { worker_id: 'w1' } });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ title: 'Connector non configuré' });
  });

  it('token manquant ou faux : 401 + audit connector_auth_denied', async () => {
    const { repo, app } = await setup();
    const missing = await app.inject({ method: 'POST', url: '/connector/sync/claim', payload: { worker_id: 'w1' } });
    expect(missing.statusCode).toBe(401);
    const wrong = await app.inject({
      method: 'POST',
      url: '/connector/sync/claim',
      headers: { authorization: 'Bearer mauvais-token' },
      payload: { worker_id: 'w1' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(repo.audits.filter((e) => e.action === 'connector_auth_denied')).toHaveLength(2);
  });
});

describe('IMP-21 — POST /connector/sync/claim', () => {
  it('body invalide : 400 (worker_id manquant / clé inconnue)', async () => {
    const { app } = await setup();
    const missing = await app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: {} });
    expect(missing.statusCode).toBe(400);
    const extra = await app.inject({
      method: 'POST',
      url: '/connector/sync/claim',
      headers: auth,
      payload: { worker_id: 'w1', surprise: true },
    });
    expect(extra.statusCode).toBe(400);
  });

  it('file vide : 204', async () => {
    const { app } = await setup();
    const res = await app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: { worker_id: 'w1' } });
    expect(res.statusCode).toBe(204);
  });

  it('file non vide : 200 avec lop (payload create_ticket inclus, état PROCESSING)', async () => {
    const { repo, app } = await setup();
    const op = makeOp();
    repo.syncOps.push(op);
    const res = await app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: { worker_id: 'w1' } });
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    expect(body).toMatchObject({ id: op.id, operation: 'create_ticket', state: 'PROCESSING', attempts: 1 });
    expect(body['payload']).toMatchObject({ name: 'dg1a2b3c', profile: '24-HEURES' });
    expect(op.lockedBy).toBe('w1');
  });

  it('RETRY futur non réclamable ; RETRY échu réclamable', async () => {
    const { repo, app } = await setup();
    repo.syncOps.push(makeOp({ state: 'RETRY', attempts: 1, nextRetryAt: new Date(Date.now() + 3_600_000) }));
    const futur = await app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: { worker_id: 'w1' } });
    expect(futur.statusCode).toBe(204);

    repo.syncOps.push(makeOp({ state: 'RETRY', attempts: 1, nextRetryAt: new Date(Date.now() - 1_000) }));
    const echeu = await app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: { worker_id: 'w1' } });
    expect(echeu.statusCode).toBe(200);
    expect(echeu.json()).toMatchObject({ attempts: 2 }); // tentative incrémentée au claim
  });
});

describe('IMP-21 — POST /connector/sync/:id/result', () => {
  async function claimedSetup() {
    const ctx = await setup();
    const op = makeOp();
    ctx.repo.syncOps.push(op);
    const claim = await ctx.app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: { worker_id: 'w1' } });
    expect(claim.statusCode).toBe(200);
    return { ...ctx, op };
  }

  it('succès : SUCCESS + audit connector_sync_success', async () => {
    const { repo, app, op } = await claimedSetup();
    const res = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: true, result: { applied: 'create_ticket', router: 'dry-run' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ state: 'SUCCESS', attempts: 1 });
    expect(op.state).toBe('SUCCESS');
    expect(op.result).toMatchObject({ applied: 'create_ticket' });
    expect(repo.audits.some((e) => e.action === 'connector_sync_success')).toBe(true);
  });

  it('échec 1 et 2 : RETRY avec backoff croissant (D12 : 1 min puis 5 min)', async () => {
    const { app, op } = await claimedSetup();
    const before = Date.now();
    const r1 = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: false, error: { code: 'router_timeout', message: 'timeout' } },
    });
    expect(r1.statusCode).toBe(200);
    expect(r1.json()).toMatchObject({ state: 'RETRY', attempts: 1 });
    const retry1 = new Date((r1.json() as Record<string, unknown>)['next_retry_at'] as string).getTime();
    expect(retry1 - before).toBeGreaterThanOrEqual(59_000);
    expect(retry1 - before).toBeLessThan(62_000);

    // Seconde tentative : on simule l'échéance passée.
    op.nextRetryAt = new Date(0);
    op.state = 'RETRY';
    const claim2 = await app.inject({ method: 'POST', url: '/connector/sync/claim', headers: auth, payload: { worker_id: 'w1' } });
    expect(claim2.statusCode).toBe(200);
    const before2 = Date.now();
    const r2 = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: false, error: { code: 'router_timeout', message: 'timeout 2' } },
    });
    expect(r2.json()).toMatchObject({ state: 'RETRY', attempts: 2 });
    const retry2 = new Date((r2.json() as Record<string, unknown>)['next_retry_at'] as string).getTime();
    expect(retry2 - before2).toBeGreaterThanOrEqual(299_000);
    expect(retry2 - before2).toBeLessThan(302_000);
  });

  it('échec à la 3e tentative : BLOCKED + alerte WARNING sync_blocked', async () => {
    const { repo, app, op } = await claimedSetup();
    op.attempts = 3; // claim courant = 3e tentative (D12 : max 3)
    const res = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: false, error: { code: 'router_dead', message: 'routeur injoignable' } },
    });
    expect(res.json()).toMatchObject({ state: 'BLOCKED', attempts: 3 });
    expect(op.state).toBe('BLOCKED');
    expect(repo.alertsRaised).toHaveLength(1);
    expect(repo.alertsRaised[0]).toMatchObject({ rule: 'sync_blocked', severity: 'WARNING' });
    expect(repo.audits.some((e) => e.action === 'connector_sync_blocked')).toBe(true);
  });

  it('body échec sans error / succès avec error : 400', async () => {
    const { app, op } = await claimedSetup();
    const noError = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: false },
    });
    expect(noError.statusCode).toBe(400);
    const successWithError = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: true, error: { code: 'x', message: 'y' } },
    });
    expect(successWithError.statusCode).toBe(400);
  });

  it('404 id inconnu ; 409 état non PROCESSING ; 400 id non UUID', async () => {
    const { app, op } = await claimedSetup();
    const notFound = await app.inject({
      method: 'POST',
      url: `/connector/sync/${randomUUID()}/result`,
      headers: auth,
      payload: { success: true },
    });
    expect(notFound.statusCode).toBe(404);
    op.state = 'SUCCESS'; // plus résoluble
    const conflict = await app.inject({
      method: 'POST',
      url: `/connector/sync/${op.id}/result`,
      headers: auth,
      payload: { success: true },
    });
    expect(conflict.statusCode).toBe(409);
    const badId = await app.inject({
      method: 'POST',
      url: `/connector/sync/pas-un-uuid/result`,
      headers: auth,
      payload: { success: true },
    });
    expect(badId.statusCode).toBe(400);
  });
});
