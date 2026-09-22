/**
 * IMP-13 — Tests unitaires auth : OTP clients (phone) + admin (Supabase Auth + rôle).
 * Normatifs : messages génériques d'échec (doc 09 §7), usage unique du code,
 * 5 essais max, expiration, rate-limit, audit des connexions admin (doc 09 §8),
 * refus par défaut (doc 10 OWASP), liaison auth_user_id (RLS 0007).
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

const PHONE = '0197440001';
const looseLimits = { requestMax: 1000, verifyMax: 1000 };

async function devApp(otpCfg?: { ttlMs?: number; maxAttempts?: number; maxRequestsPerWindow?: number; requestWindowMs?: number; now?: () => number }) {
  const repo = new FakeRepo();
  const app = await buildApp({
    repo,
    rateLimit: { max: 100000 },
    auth: { devMode: true, rateLimits: looseLimits, ...(otpCfg ? { otp: otpCfg } : {}) },
  });
  return { repo, app };
}

const request = (app: Awaited<ReturnType<typeof buildApp>>, phone: string) =>
  app.inject({ method: 'POST', url: '/auth/phone/request', payload: { phone } });

const verify = (app: Awaited<ReturnType<typeof buildApp>>, phone: string, code: string) =>
  app.inject({ method: 'POST', url: '/auth/phone/verify', payload: { phone, code } });

describe('OTP client — mode dev (AUTH_DEV_MODE)', () => {
  it('request => 202 + code à 6 chiffres (dev_code)', async () => {
    const { app } = await devApp();
    const res = await request(app, PHONE);
    expect(res.statusCode).toBe(202);
    expect((res.json() as Record<string, unknown>)['dev_code']).toMatch(/^[0-9]{6}$/);
  });

  it('mauvais code => 401 message GÉNÉRIQUE (doc 09 §7)', async () => {
    const { app } = await devApp();
    await request(app, PHONE);
    const res = await verify(app, PHONE, '000000');
    expect(res.statusCode).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.json()).toMatchObject({ title: 'Authentification échouée' });
  });

  it('bon code => 200 token + client créé ; /auth/me ; logout ; token révoqué', async () => {
    const { repo, app } = await devApp();
    const req = await request(app, PHONE);
    const code = (req.json() as Record<string, unknown>)['dev_code'] as string;
    const res = await verify(app, PHONE, code);
    expect(res.statusCode).toBe(200);
    const body = res.json() as Record<string, unknown>;
    const token = body['token'] as string;
    expect(body['phone']).toBe(PHONE);
    expect(repo.customers.has(PHONE)).toBe(true);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ auth: 'phone-session', phone: PHONE, customer_id: body['customer_id'] });

    const out = await app.inject({ method: 'POST', url: '/auth/logout', headers: { authorization: `Bearer ${token}` } });
    expect(out.statusCode).toBe(204);
    const me2 = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${token}` } });
    expect(me2.statusCode).toBe(401);
  });

  it('code à usage unique : re-vérification => 401', async () => {
    const { app } = await devApp();
    const code = ((await request(app, PHONE)).json() as Record<string, unknown>)['dev_code'] as string;
    expect((await verify(app, PHONE, code)).statusCode).toBe(200);
    expect((await verify(app, PHONE, code)).statusCode).toBe(401);
  });

  it('5 essais erronés => code détruit (le bon code échoue ensuite)', async () => {
    const { app } = await devApp();
    const code = ((await request(app, PHONE)).json() as Record<string, unknown>)['dev_code'] as string;
    for (let i = 0; i < 5; i++) {
      expect((await verify(app, PHONE, '999999')).statusCode).toBe(401);
    }
    expect((await verify(app, PHONE, code)).statusCode).toBe(401);
  });

  it('code expiré => 401 (horloge injectée)', async () => {
    let clock = 1_000_000;
    const { app } = await devApp({ ttlMs: 60_000, now: () => clock });
    const code = ((await request(app, PHONE)).json() as Record<string, unknown>)['dev_code'] as string;
    clock += 61_000;
    expect((await verify(app, PHONE, code)).statusCode).toBe(401);
  });

  it('3 demandes par 30 min max => 429 problem+json', async () => {
    let clock = 2_000_000;
    const { app } = await devApp({ maxRequestsPerWindow: 3, requestWindowMs: 1_800_000, now: () => clock });
    expect((await request(app, PHONE)).statusCode).toBe(202);
    expect((await request(app, PHONE)).statusCode).toBe(202);
    expect((await request(app, PHONE)).statusCode).toBe(202);
    const blocked = await request(app, PHONE);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ status: 429, title: 'Trop de demandes' });
    clock += 1_800_001; // fenêtre écoulée
    expect((await request(app, PHONE)).statusCode).toBe(202);
  });

  it('payload invalide (phone non Bénin, code non numérique) => 400', async () => {
    const { app } = await devApp();
    expect((await request(app, '12345')).statusCode).toBe(400);
    expect((await verify(app, PHONE, 'abcdef')).statusCode).toBe(400);
  });
});

describe('OTP client — hors mode dev (production honnête)', () => {
  it('request/verify => 503 « Canal SMS non configuré » (jamais de faux envoyé)', async () => {
    const app = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 100000 }, auth: { rateLimits: looseLimits } });
    const r1 = await app.inject({ method: 'POST', url: '/auth/phone/request', payload: { phone: PHONE } });
    const r2 = await app.inject({ method: 'POST', url: '/auth/phone/verify', payload: { phone: PHONE, code: '123456' } });
    expect(r1.statusCode).toBe(503);
    expect(r2.statusCode).toBe(503);
    expect(r1.json()).toMatchObject({ title: 'Canal SMS non configuré' });
  });
});

describe('Admin — GET /admin/me (Supabase Auth + rôle)', () => {
  async function adminApp() {
    const repo = new FakeRepo();
    const verifier = new FakeVerifier();
    verifier.identities.set('tok-admin', { sub: 'sub-admin', phone: null, email: 'admin@dg.bj', role: 'ADMIN' });
    verifier.identities.set('tok-super', { sub: 'sub-super', phone: null, email: null, role: 'SUPER_ADMIN' });
    verifier.identities.set('tok-user', { sub: 'sub-user', phone: null, email: 'client@dg.bj', role: null });
    const app = await buildApp({ repo, rateLimit: { max: 100000 }, auth: { verifier, rateLimits: looseLimits } });
    return { repo, app };
  }
  const get = (app: Awaited<ReturnType<typeof buildApp>>, token?: string) =>
    app.inject({ method: 'GET', url: '/admin/me', headers: token ? { authorization: `Bearer ${token}` } : {} });

  it('sans vérificateur configuré => 503 (SUPABASE_URL/ANON_KEY manquantes)', async () => {
    const app = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 100000 } });
    const res = await get(app, 'nimporte');
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ title: 'Auth admin non configurée' });
  });

  it('rôle ADMIN => 200 { sub, role } + audit admin_auth_ok (doc 09 §8)', async () => {
    const { repo, app } = await adminApp();
    const res = await get(app, 'tok-admin');
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ sub: 'sub-admin', role: 'ADMIN', email: 'admin@dg.bj' });
    expect(repo.audits).toContainEqual({ actor: 'admin:sub-admin', action: 'admin_auth_ok', entity: 'auth', entityId: 'sub-admin' });
  });

  it('rôle SUPER_ADMIN => 200 (doc 09 §6.2)', async () => {
    const { app } = await adminApp();
    expect((await get(app, 'tok-super')).statusCode).toBe(200);
  });

  it('compte authentifié SANS rôle admin => 403 générique + audit denied', async () => {
    const { repo, app } = await adminApp();
    const res = await get(app, 'tok-user');
    expect(res.statusCode).toBe(403);
    expect(res.json()).toMatchObject({ title: 'Accès refusé' });
    expect(repo.audits).toContainEqual({ actor: 'admin:sub-user', action: 'admin_auth_denied', entity: 'auth', entityId: 'sub-user' });
  });

  it('jeton invalide => 401 générique + audit denied (actor anonymous)', async () => {
    const { repo, app } = await adminApp();
    const res = await get(app, 'tok-inconnu');
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ title: 'Authentification échouée' });
    expect(repo.audits.some((a) => a.action === 'admin_auth_denied' && a.actor === 'anonymous')).toBe(true);
  });

  it('sans header Authorization => 401', async () => {
    const { app } = await adminApp();
    expect((await get(app)).statusCode).toBe(401);
  });
});

describe('Client via JWT Supabase — GET /auth/me', () => {
  it('identité avec phone => client trouvé/créé + liaison auth_user_id (RLS 0007)', async () => {
    const repo = new FakeRepo();
    const verifier = new FakeVerifier();
    verifier.identities.set('tok-cli', { sub: 'sub-cli', phone: '+2290197440009', email: null, role: null });
    const app = await buildApp({ repo, rateLimit: { max: 100000 }, auth: { verifier, rateLimits: looseLimits } });
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer tok-cli' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ auth: 'supabase', auth_user_id: 'sub-cli', phone: '0197440009' });
    expect(repo.customers.has('0197440009')).toBe(true);
    expect(repo.linked).toEqual([[repo.customers.get('0197440009') as string, 'sub-cli']]);
  });

  it('identité sans phone (email seul) => 200 sans client', async () => {
    const verifier = new FakeVerifier();
    verifier.identities.set('tok-mail', { sub: 'sub-mail', phone: null, email: 'x@dg.bj', role: null });
    const app = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 100000 }, auth: { verifier, rateLimits: looseLimits } });
    const res = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer tok-mail' } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ auth: 'supabase', auth_user_id: 'sub-mail', email: 'x@dg.bj' });
  });

  it('jeton inconnu => 401 ; /auth/me sans header => 401', async () => {
    const verifier = new FakeVerifier();
    const app = await buildApp({ repo: new FakeRepo(), rateLimit: { max: 100000 }, auth: { verifier, rateLimits: looseLimits } });
    expect((await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: 'Bearer nope' } })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/auth/me' })).statusCode).toBe(401);
  });

});
