/**
 * IMP-18 — Tests unitaires de la route POST /admin/batches.
 * Normatif : auth admin (doc 09 §7-8), limites contrat Mikmon §3.5 (1..200/lot),
 * export des codes clairs UNE seule fois (la base ne garde que sha256 — 0004),
 * enfilement des ordres create_ticket dans mikrotik_sync, audit (doc 09 §F).
 */
import { describe, expect, it } from 'vitest';
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

const post = (app: Awaited<ReturnType<typeof buildApp>>, token: string | null, body: unknown) =>
  app.inject({
    method: 'POST',
    url: '/admin/batches',
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload: body as Record<string, unknown>,
  });

describe('IMP-18 — POST /admin/batches : auth', () => {
  it('503 sans configuration, 401 sans jeton, 403 sans rôle — refus audités', async () => {
    const bare = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 100000 }, auth: { rateLimits: looseLimits } });
    const r503 = await bare.inject({ method: 'POST', url: '/admin/batches', payload: { offer_id: '24-HEURES', quantity: 5 } });
    expect(r503.statusCode).toBe(503);
    await bare.close();

    const { repo, app } = await adminApp();
    expect((await post(app, null, { offer_id: '24-HEURES', quantity: 5 })).statusCode).toBe(401);
    expect((await post(app, 'tok-user', { offer_id: '24-HEURES', quantity: 5 })).statusCode).toBe(403);
    expect(repo.audits.filter((a) => a.action === 'admin_auth_denied')).toHaveLength(2);
    await app.close();
  });
});

describe('IMP-18 — POST /admin/batches : validation', () => {
  const invalides: Array<[Record<string, unknown>, string]> = [
    [{ offer_id: '9-HEURES', quantity: 5 }, 'offre hors Grille A'],
    [{ offer_id: '24-HEURES', quantity: 0 }, 'quantité 0'],
    [{ offer_id: '24-HEURES', quantity: 201 }, 'quantité > 200 (contrat §3.5)'],
    [{ offer_id: '24-HEURES', quantity: 2.5 }, 'quantité non entière'],
    [{ offer_id: '24-HEURES' }, 'quantity manquante'],
    [{ offer_id: '24-HEURES', quantity: 5, price_fcfa: 300 }, 'clé inconnue (body strict)'],
  ];
  for (const [body, label] of invalides) {
    it(`400 : ${label}`, async () => {
      const { app } = await adminApp();
      const res = await post(app, 'tok-admin', body);
      expect(res.statusCode).toBe(400);
      expect(res.headers['content-type']).toContain('application/problem+json');
      await app.close();
    });
  }
});

describe('IMP-18 — POST /admin/batches : génération', () => {
  it('201 : lot créé, codes exportés UNE fois, ordres create_ticket enfilés, audit', async () => {
    const { repo, app } = await adminApp();
    const res = await post(app, 'tok-admin', { offer_id: '24-HEURES', quantity: 10 });
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body) as {
      batch: { id: string; seq: number; offer_id: string; quantity: number; generated_at: string };
      code_export: Array<{ router_name: string; code: string; comment: string }>;
      export_warning: string;
    };
    expect(body.batch.offer_id).toBe('24-HEURES');
    expect(body.batch.quantity).toBe(10);
    expect(body.batch.seq).toBeGreaterThanOrEqual(100); // séquence digitale (contrat §3.3)
    expect(body.code_export).toHaveLength(10);
    for (const line of body.code_export) {
      expect(line.router_name).toMatch(/^dg[a-z0-9]{6}$/);
      expect(line.code).toMatch(/^[2-9a-hjkmnp-z]{8}$/);
      expect(line.comment).toMatch(/^vc-\d{3,}-\d{2}\.\d{2}\.\d{2}-$/);
    }
    expect(body.export_warning).toContain('affichage UNIQUE');

    // Une seule écriture de batch + 10 ordres de synchronisation routeur.
    expect(repo.createdBatches).toHaveLength(1);
    expect(repo.syncOps).toHaveLength(10);
    expect(repo.syncOps[0]?.operation).toBe('create_ticket');
    expect(repo.syncOps[0]?.payload).toMatchObject({ profile: '24-HEURES', limit_uptime: '1d00:00:00' });

    // Audit de création (doc 09 §F).
    const audit = repo.audits.find((a) => a.action === 'admin_batch_created');
    expect(audit?.entity).toBe('ticket_batches');
    expect(audit?.entityId).toBe(body.batch.id);
    await app.close();
  });

  it('les codes exportés correspondent aux ordres sync (même lot, mêmes valeurs)', async () => {
    const { repo, app } = await adminApp();
    const res = await post(app, 'tok-admin', { offer_id: '5-HEURES', quantity: 3 });
    const body = JSON.parse(res.body) as { code_export: Array<{ router_name: string; code: string }> };
    const exported = body.code_export.map((l) => `${l.router_name}:${l.code}`).sort();
    const synced = repo.syncOps.map((op) => `${op.payload['name']}:${op.payload['password']}`).sort();
    expect(synced).toEqual(exported);
    await app.close();
  });
});
