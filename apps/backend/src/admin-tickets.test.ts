/**
 * IMP-32 — Tests admin tickets/lots (FakeRepo) : inventaire DIGITAL/PHYSICAL
 * filtrable, compteurs de lots, import transactionnel avec prévisualisation,
 * idempotence, révélation admin auditée, réconciliation manifeste IMP-06.
 *
 * Normatifs (doc 09 §20/§28-34) :
 *  - jamais de ticket PHYSICAL alloué à une vente digitale ;
 *  - secret du code : liste admin sans aucun secret, révélation = opération
 *    contrôlée (raison 20-1000 car., audit systématique, code jamais journalisé) ;
 *  - import : preview → validation → transaction ; AUCUN import partiel
 *    silencieux (17 invalides => rien n'est écrit, résultat explicite).
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildApp } from './app.js';
import type { AuthIdentity, AuthVerifier } from './auth.js';
import { FakeRepo } from './fake-repo.js';
import { STOCK_MANIFEST_IMP06 } from './stock-manifest.js';
import { deriveVaultKey, sealCode } from './ticketvault.js';

class FakeVerifier implements AuthVerifier {
  identities = new Map<string, AuthIdentity>();
  async verify(token: string): Promise<AuthIdentity | null> {
    return this.identities.get(token) ?? null;
  }
}

const looseLimits = { requestMax: 10000, verifyMax: 10000 };
const ADMIN = { authorization: 'Bearer tok-admin' };

async function adminApp(vaultKey?: Buffer) {
  const repo = new FakeRepo();
  const verifier = new FakeVerifier();
  verifier.identities.set('tok-admin', { sub: 'sub-admin', phone: null, email: 'admin@dg.bj', role: 'ADMIN' });
  verifier.identities.set('tok-user', { sub: 'sub-user', phone: null, email: null, role: null });
  const app = await buildApp({
    repo,
    rateLimit: { max: 100000 },
    auth: { verifier, rateLimits: looseLimits },
    ...(vaultKey ? { ticketVaultKey: vaultKey } : {}),
  });
  return { repo, app };
}

/** Commande PAID de l'offre donnée (allouable) via le repo fake. */
async function paidOrder(repo: FakeRepo, offerId: string, key: string) {
  const { order } = await repo.createOrder({
    customerId: `cust-${key}`,
    planId: 'plan-x', // remplacé par createOrder (getOrCreatePlanId)
    planSnapshot: { offer_id: offerId },
    idempotencyKey: key,
  });
  order.state = 'PAID';
  return order;
}

// ---------------------------------------------------------------------------
// Garde de destination (doc 09 §28) : jamais de PHYSICAL pour une vente digitale
// ---------------------------------------------------------------------------
describe('IMP-32 — garde de destination à l’allocation', () => {
  it('un ticket d’un lot PHYSICAL n’est jamais alloué ; un DIGITAL l’est', async () => {
    const { repo } = await adminApp();
    const order = await paidOrder(repo, '24-HEURES', 'itest-imp32-guard-1');

    const physical = repo.seedTicket('24-HEURES');
    repo.adminBatches.get(physical.batchId)!.destination = 'PHYSICAL';
    const r1 = await repo.allocateTicketForOrder(order.id);
    expect(r1.status).toBe('no-stock');
    expect(physical.dbState).toBe('AVAILABLE'); // le ticket PHYSICAL n’a pas bougé

    const digital = repo.seedTicket('24-HEURES');
    const r2 = await repo.allocateTicketForOrder(order.id);
    expect(r2.status).toBe('allocated');
    if (r2.status !== 'allocated') throw new Error(`attendu allocated, obtenu ${r2.status}`);
    expect(r2.ticketId).toBe(digital.id);
    expect(digital.dbState).toBe('SOLD');
    expect(digital.reservedAt).not.toBeNull();
    await repo.getAdminOrderById(order.id); // (parité) pas d'erreur
  });
});

// ---------------------------------------------------------------------------
// GET /admin/tickets — liste filtrable, sans secret
// ---------------------------------------------------------------------------
describe('IMP-32 — GET /admin/tickets', () => {
  it('projette destination/révélation/dates, filtre par destination, sans aucun secret', async () => {
    const vaultKey = sealKey();
    const { repo, app } = await adminApp(vaultKey);
    const digital = repo.seedTicket('5-HEURES');
    const physical = repo.seedTicket('5-HEURES');
    repo.adminBatches.get(physical.batchId)!.destination = 'PHYSICAL';
    physical.codeCipher = sealCode(vaultKey, 'phys0001');
    digital.dbState = 'RESERVED';
    digital.reservedAt = new Date();

    const res = await app.inject({ method: 'GET', url: '/admin/tickets', headers: ADMIN });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<Record<string, unknown>>; total: number };
    expect(body.total).toBe(2);
    const d = body.items.find((i) => i.id === digital.id)!;
    expect(d).toMatchObject({
      destination: 'DIGITAL', db_state: 'RESERVED', revealable: false,
      reserved_at: expect.any(String), created_at: expect.any(String), mikrotik_comment: null,
    });
    const p = body.items.find((i) => i.id === physical.id)!;
    expect(p).toMatchObject({ destination: 'PHYSICAL', revealable: true });
    // Invariant secret (doc 09 §20) : aucun champ code/hash/cipher dans la liste.
    for (const item of body.items) {
      expect(Object.keys(item)).not.toEqual(expect.arrayContaining(['code', 'code_hash', 'code_cipher', 'password']));
    }

    const filtered = await app.inject({ method: 'GET', url: '/admin/tickets?destination=PHYSICAL', headers: ADMIN });
    const fbody = filtered.json() as { items: Array<Record<string, unknown>>; total: number };
    expect(fbody.total).toBe(1);
    expect(fbody.items[0]?.id).toBe(physical.id);

    const bad = await app.inject({ method: 'GET', url: '/admin/tickets?destination=VOITURE', headers: ADMIN });
    expect(bad.statusCode).toBe(400);
    await app.close();
  });

  it('reste protégé par l’auth admin (401/403)', async () => {
    const { app } = await adminApp();
    expect((await app.inject({ method: 'GET', url: '/admin/tickets' })).statusCode).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/admin/tickets', headers: { authorization: 'Bearer tok-user' } })).statusCode).toBe(403);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// GET /admin/tickets/batches (+ alias /admin/batches) — compteurs serveur
// ---------------------------------------------------------------------------
describe('IMP-32 — GET /admin/tickets/batches', () => {
  it('expose les 7 compteurs doc 09 §30 ; /admin/batches reste un alias', async () => {
    const { repo, app } = await adminApp();
    const stale = repo.seedTicket('1-MOIS');
    stale.dbState = 'RESERVED';
    stale.reservedAt = new Date(Date.now() - 16 * 60 * 1000); // > TTL 15 min (D11)
    const sold = repo.seedTicket('1-MOIS');
    sold.dbState = 'SOLD';
    sold.soldAt = new Date();

    const res = await app.inject({ method: 'GET', url: '/admin/tickets/batches', headers: ADMIN });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { items: Array<Record<string, unknown>> };
    const bs = body.items.find((b) => b.id === stale.batchId)!;
    expect(bs).toMatchObject({
      destination: 'DIGITAL', source: 'backend',
      available_count: 0, reserved_count: 1, reserved_stale_count: 1,
      sold_count: 0, used_count: 0, expired_count: 0, released_count: 0,
      tickets_count: 1,
    });
    const bs2 = body.items.find((b) => b.id === sold.batchId)!;
    expect(bs2).toMatchObject({ sold_count: 1, reserved_count: 0, tickets_count: 1 });

    const alias = await app.inject({ method: 'GET', url: '/admin/batches', headers: ADMIN });
    expect(alias.statusCode).toBe(200);
    expect((alias.json() as { total: number }).total).toBe(body.items.length);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Import : preview → validation → transaction → idempotence (doc 09 §33-34)
// ---------------------------------------------------------------------------
describe('IMP-32 — import de codes (preview → import → rejeu)', () => {
  it('preview : lecture seule, détecte format/doublons sans rien écrire', async () => {
    const { repo, app } = await adminApp();
    const before = [...repo.tickets.values()].length;
    const res = await app.inject({
      method: 'POST', url: '/admin/tickets/import/preview', headers: ADMIN,
      payload: {
        offer_id: '24-HEURES', destination: 'DIGITAL',
        codes: ['aaaa1111', 'AAAA2222', 'bbbb3333', 'bbbb3333', 'ccccc', 'dddd4444'],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      analyzed: number; valid: number; invalid: number; can_import: boolean;
      rows: Array<{ line: number; valid: boolean; reason: string | null }>;
    };
    expect({ analyzed: body.analyzed, valid: body.valid, invalid: body.invalid, can_import: body.can_import })
      .toEqual({ analyzed: 6, valid: 3, invalid: 3, can_import: false });
    const reasons = body.rows.filter((r) => !r.valid).map((r) => r.reason);
    expect(reasons).toEqual(expect.arrayContaining([
      'format attendu : 8 caractères [0-9a-z]', // majuscules
      'doublon dans le lot importé', // bbbb3333
      'format attendu : 8 caractères [0-9a-z]', // 5 car.
    ]));
    // APERÇU = ZÉRO écriture (doc 09 §33).
    expect([...repo.tickets.values()].length).toBe(before);
    await app.close();
  });

  it('import valide : 201, tickets scellés (hash + cipher), lot mikmon-manual, puis rejeu idempotent 200', async () => {
    const vaultKey = sealKey();
    const { repo, app } = await adminApp(vaultKey);
    const codes = ['aaaa1111', 'bbbb2222', 'cccc3333'];
    const res = await app.inject({
      method: 'POST', url: '/admin/tickets/import', headers: { ...ADMIN, 'idempotency-key': 'itest-imp32-import-ok' },
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as { created: boolean; imported: number; rejected: number; import_performed: boolean; batch_id: string };
    expect({ created: body.created, imported: body.imported, rejected: body.rejected }).toEqual({ created: true, imported: 3, rejected: 0 });
    expect(body.batch_id).toBeTruthy();

    const batch = repo.adminBatches.get(body.batch_id)!;
    expect({ source: batch.source, destination: batch.destination, quantity: batch.quantity, key: batch.idempotencyKey })
      .toEqual({ source: 'mikmon-manual', destination: 'DIGITAL', quantity: 3, key: 'itest-imp32-import-ok' });
    const imported = [...repo.tickets.values()].filter((t) => t.batchId === body.batch_id);
    expect(imported).toHaveLength(3);
    for (const t of imported) {
      expect(t.dbState).toBe('AVAILABLE');
      expect(t.codeHash).toMatch(/^[a-f0-9]{64}$/);
      expect(t.codeCipher).toBeTruthy(); // scellé : jamais de clair en mémoire de base
      expect(t.codeHash).not.toMatch(/aaaa|bbbb|cccc/); // le clair n'est nulle part
    }
    // L'import ne génère AUCUNE opération MikroTik (doc 09 §33 : le stock n'est pas routé).
    expect(repo.syncOps.filter((o) => o.operation === 'create_ticket')).toHaveLength(0);
    // Audit de la création du lot.
    expect(repo.audits.some((a) => a.action === 'admin_ticket_batch_imported' && a.entityId === body.batch_id)).toBe(true);

    // Rejeu idempotent : même clé => même lot, aucune réécriture.
    const replay = await app.inject({
      method: 'POST', url: '/admin/tickets/import', headers: { ...ADMIN, 'idempotency-key': 'itest-imp32-import-ok' },
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes },
    });
    expect(replay.statusCode).toBe(200);
    const rbody = replay.json() as { created: boolean; import_performed: boolean; batch_id: string };
    expect({ created: rbody.created, import_performed: rbody.import_performed, batch_id: rbody.batch_id })
      .toEqual({ created: false, import_performed: true, batch_id: body.batch_id });
    expect([...repo.tickets.values()].filter((t) => t.batchId === body.batch_id)).toHaveLength(3);
    await app.close();
  });

  it('import avec ligne invalide : 422 « non effectué », ZÉRO écriture (aucun import partiel silencieux)', async () => {
    const vaultKey = sealKey();
    const { repo, app } = await adminApp(vaultKey);
    const before = [...repo.tickets.values()].length;
    const res = await app.inject({
      method: 'POST', url: '/admin/tickets/import', headers: { ...ADMIN, 'idempotency-key': 'itest-imp32-import-bad' },
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes: ['eeee5555', 'mauvais!'] },
    });
    expect(res.statusCode).toBe(422);
    // Résultat explicite (doc 09 §34) : le détail du problème porte le compte exact.
    const body = res.json() as { status: number; title: string; detail: string };
    expect({ status: body.status, title: body.title }).toEqual({ status: 422, title: 'Import non effectué' });
    expect(body.detail).toContain('2 lignes analysées');
    expect(body.detail).toContain('1 valides');
    expect(body.detail).toContain('1 invalides');
    expect(body.detail).toContain('aucun import partiel silencieux');
    expect([...repo.tickets.values()].length).toBe(before); // pas de ticket 'eeee5555' non plus
    expect(repo.audits.some((a) => a.action === 'admin_ticket_import_rejected')).toBe(true);
    await app.close();
  });

  it('doublon en base : détecté au preview puis rejeté à l’import', async () => {
    const vaultKey = sealKey();
    const { repo, app } = await adminApp(vaultKey);
    const first = await app.inject({
      method: 'POST', url: '/admin/tickets/import', headers: { ...ADMIN, 'idempotency-key': 'itest-imp32-import-dup1' },
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes: ['ffff6666'] },
    });
    expect(first.statusCode).toBe(201);

    const preview = await app.inject({
      method: 'POST', url: '/admin/tickets/import/preview', headers: ADMIN,
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes: ['ffff6666'] },
    });
    const pbody = preview.json() as { invalid: number; rows: Array<{ reason: string | null }> };
    expect(pbody.invalid).toBe(1);
    expect(pbody.rows[0]?.reason).toBe('déjà présent dans l’inventaire');

    const second = await app.inject({
      method: 'POST', url: '/admin/tickets/import', headers: { ...ADMIN, 'idempotency-key': 'itest-imp32-import-dup2' },
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes: ['ffff6666'] },
    });
    expect(second.statusCode).toBe(422);
    await app.close();
  });

  it('garde-fous : sans Idempotency-Key => 400 ; sans TICKET_VAULT_KEY => 503', async () => {
    const { repo, app } = await adminApp();
    const noKey = await app.inject({
      method: 'POST', url: '/admin/tickets/import', headers: ADMIN,
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes: ['aaaa1111'] },
    });
    expect(noKey.statusCode).toBe(400);
    // 503 : les codes importés doivent pouvoir être scellés (jamais en clair).
    const noVault = await app.inject({
      // Clé d'idempotence de test (aucun secret réel).
      method: 'POST', url: '/admin/tickets/import', headers: { ...ADMIN, 'idempotency-key': 'itest-imp32-no-vault' }, // gitleaks:allow
      payload: { offer_id: '24-HEURES', destination: 'DIGITAL', codes: ['aaaa1111'] },
    });
    expect(noVault.statusCode).toBe(503);
    expect([...repo.tickets.values()].length).toBe(0);
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Révélation admin d’un code (doc 09 §20) : opération contrôlée + audit
// ---------------------------------------------------------------------------
describe('IMP-32 — POST /admin/tickets/:id/reveal', () => {
  it('200 : code restitué si sceau présent, raison obligatoire, audité SANS le code', async () => {
    const vaultKey = sealKey();
    const { repo, app } = await adminApp(vaultKey);
    const ticket = repo.seedTicket('24-HEURES');
    ticket.codeCipher = sealCode(vaultKey, 'code-phys-2026');

    // Raison trop courte => 400 (contrôle de la nécessité, doc 09 §20).
    const short = await app.inject({
      method: 'POST', url: `/admin/tickets/${ticket.id}/reveal`, headers: ADMIN, payload: { reason: 'trop court' },
    });
    expect(short.statusCode).toBe(400);

    const res = await app.inject({
      method: 'POST', url: `/admin/tickets/${ticket.id}/reveal`, headers: ADMIN,
      payload: { reason: 'Demande support : client a perdu son voucher papier.' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { ticket_id: string; code: string; destination: string };
    expect({ ticket_id: body.ticket_id, code: body.code, destination: body.destination })
      .toEqual({ ticket_id: ticket.id, code: 'code-phys-2026', destination: 'DIGITAL' });

    const audit = repo.audits.find((a) => a.action === 'admin_ticket_code_revealed' && a.entityId === ticket.id);
    expect(audit).toBeDefined();
    expect(audit?.after).toMatchObject({ batch_destination: 'DIGITAL', db_state: 'AVAILABLE' });
    expect(JSON.stringify(audit)).not.toContain('code-phys-2026'); // le code n'est JAMAIS journalisé
    await app.close();
  });

  it('404 inconnu (audité) ; 409 lot sans sceau = voucher papier ; 503 sans coffre', async () => {
    const vaultKey = sealKey();
    const { repo, app } = await adminApp(vaultKey);
    const missing = randomUUID();
    const nf = await app.inject({
      method: 'POST', url: `/admin/tickets/${missing}/reveal`, headers: ADMIN,
      payload: { reason: 'Recherche exhaustive du ticket déclaré perdu.' },
    });
    expect(nf.statusCode).toBe(404);
    expect(repo.audits.some((a) => a.action === 'admin_ticket_reveal_notfound' && a.entityId === missing)).toBe(true);

    const unsealed = repo.seedTicket('24-HEURES'); // pas de sceau (voucher papier)
    const conflict = await app.inject({
      method: 'POST', url: `/admin/tickets/${unsealed.id}/reveal`, headers: ADMIN,
      payload: { reason: 'Vérification d’un code imprimé sur voucher papier.' },
    });
    expect(conflict.statusCode).toBe(409);
    const denied = repo.audits.find((a) => a.action === 'admin_ticket_reveal_denied' && a.entityId === unsealed.id);
    expect(denied?.after).toMatchObject({ cause: 'no-seal' });

    // 503 : le refus du coffre précède toute lecture (même ticket inconnu).
    const { app: appNoVault } = await adminApp();
    const off = await appNoVault.inject({
      method: 'POST', url: `/admin/tickets/${randomUUID()}/reveal`, headers: ADMIN,
      payload: { reason: 'Tentative sans coffre configuré, qui doit échouer.' },
    });
    expect(off.statusCode).toBe(503);
    await app.close();
    await appNoVault.close();
  });
});

// ---------------------------------------------------------------------------
// Réconciliation manifeste IMP-06 (doc 09 §35)
// ---------------------------------------------------------------------------
describe('IMP-32 — GET /admin/tickets/reconciliation', () => {
  it('vide : 0/660, MISSING par lot, ok=false', async () => {
    const { app } = await adminApp();
    const res = await app.inject({ method: 'GET', url: '/admin/tickets/reconciliation', headers: ADMIN });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      manifest_id: string; expected_total: number; actual_total: number; ok: boolean;
      items: Array<{ batch_note: string; expected: number; actual: number; status: string }>;
    };
    expect({ manifest_id: body.manifest_id, expected_total: body.expected_total, actual_total: body.actual_total, ok: body.ok })
      .toEqual({ manifest_id: STOCK_MANIFEST_IMP06.id, expected_total: 660, actual_total: 0, ok: false });
    expect(body.items).toHaveLength(6);
    expect(body.items.every((i) => i.status === 'MISSING')).toBe(true);
    await app.close();
  });

  it('stock conforme au manifeste : ok=true, puis une suppression => DIVERGENT', async () => {
    const { repo, app } = await adminApp();
    // On reconstruit en mémoire le stock mikmon conforme au manifeste IMP-06.
    for (const batch of STOCK_MANIFEST_IMP06.batches) {
      const batchId = randomUUID();
      repo.adminBatches.set(batchId, {
        id: batchId, source: 'mikmon-manual', destination: 'DIGITAL', offerId: batch.offerId,
        quantity: batch.quantity, generatedAt: new Date('2026-09-17T00:00:00Z'),
        notes: batch.note, manifestSha256: null, idempotencyKey: null,
      });
      const plan = repo.plans.find((p) => p.offerId === batch.offerId)!;
      for (let i = 0; i < batch.quantity; i++) {
        const ticketId = randomUUID();
        repo.tickets.set(ticketId, {
          id: ticketId, batchId, planId: plan.planId, dbState: 'AVAILABLE', routerState: 'UNUSED',
          orderId: null, codePrefixHint: 'XX', soldAt: null, mikrotikComment: null,
          activationDeadline: null, codeHash: null, codeCipher: null, reservedAt: null, createdAt: new Date(),
        });
      }
    }
    const ok = await app.inject({ method: 'GET', url: '/admin/tickets/reconciliation', headers: ADMIN });
    const okBody = ok.json() as { ok: boolean; actual_total: number; items: Array<{ status: string }> };
    expect({ ok: okBody.ok, actual_total: okBody.actual_total }).toEqual({ ok: true, actual_total: 660 });
    expect(okBody.items.every((i) => i.status === 'OK')).toBe(true);

    // Divergence : un ticket disparaît (vol/erreur de saisie) => détecté.
    const someBatch = STOCK_MANIFEST_IMP06.batches[0]!;
    const victim = [...repo.tickets.values()].find((t) => repo.adminBatches.get(t.batchId)?.offerId === someBatch.offerId)!;
    repo.tickets.delete(victim.id);
    const diverged = await app.inject({ method: 'GET', url: '/admin/tickets/reconciliation', headers: ADMIN });
    const dBody = diverged.json() as { ok: boolean; items: Array<{ batch_note: string; status: string }> };
    expect(dBody.ok).toBe(false);
    expect(dBody.items.find((i) => i.batch_note === someBatch.note)?.status).toBe('DIVERGENT');
    await app.close();
  });
});

// ---------------------------------------------------------------------------
// Stats : by_destination + reserved_stale (doc 09 §12.1/§28)
// ---------------------------------------------------------------------------
describe('IMP-32 — GET /admin/tickets/stats enrichi', () => {
  it('ajoute reserved_stale par offre/totaux et by_destination', async () => {
    const { repo, app } = await adminApp();
    // FakeRepo : les « stats par offre » proviennent du champ de données (comme les
    // fixtures des autres tests) ; le breakdown est réellement calculé sur les tickets.
    repo.ticketsStatsByOffer = [
      { offerId: '5-HEURES', priceFcfa: 100, states: { AVAILABLE: 1, RESERVED: 1 } },
    ];
    const t = repo.seedTicket('5-HEURES');
    t.dbState = 'RESERVED';
    t.reservedAt = new Date(Date.now() - 16 * 60 * 1000);
    const phys = repo.seedTicket('5-HEURES');
    repo.adminBatches.get(phys.batchId)!.destination = 'PHYSICAL';

    const res = await app.inject({ method: 'GET', url: '/admin/tickets/stats', headers: ADMIN });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      offers: Array<Record<string, unknown>>;
      totals: Record<string, number>;
      by_destination: Array<Record<string, unknown>>;
    };
    const offer = body.offers.find((o) => o.offer_id === '5-HEURES')!;
    expect(offer).toMatchObject({ available: 1, reserved: 1, reserved_stale: 1 });
    expect(body.totals).toMatchObject({ reserved_stale: 1 });
    const dests = body.by_destination.filter((d) => d.offer_id === '5-HEURES');
    expect(dests).toHaveLength(2);
    expect(dests.find((d) => d.destination === 'DIGITAL')).toMatchObject({ available: 0, reserved: 1, reserved_stale: 1 });
    expect(dests.find((d) => d.destination === 'PHYSICAL')).toMatchObject({ available: 1, reserved: 0 });
    await app.close();
  });
});

function sealKey(): Buffer {
  return deriveVaultKey('itest-imp32-vault');
}
