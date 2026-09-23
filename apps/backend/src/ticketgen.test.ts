/**
 * IMP-18 — Tests unitaires : génération de tickets digitaux (contrat Mikmon §3).
 * Normatif : name `dg`+6 [a-z0-9], code client sans caractères ambigus,
 * comment `vc-<seq 3+chiffres>-<mm.dd.yy>-`, ≤ 200/lot (§3.5), unicité intra-lot.
 */
import { describe, expect, it } from 'vitest';
import {
  CLIENT_CODE_ALPHABET,
  CLIENT_CODE_LENGTH,
  FIRST_BACKEND_BATCH_SEQ,
  MAX_BATCH_QUANTITY,
  ROUTER_NAME_ALPHABET,
  buildMikrotikComment,
  generateClientCode,
  generateRouterName,
  generateTicketSpecs,
  type RandomSource,
} from './ticketgen.js';

/** LCG seedable : déterminisme des tests sans dépendre du CSPRNG. */
function lcg(seed: number): RandomSource {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('IMP-18 — formats contrat Mikmon §3', () => {
  it('name routeur : préfixe `dg` + 6 caractères [a-z0-9]', () => {
    const random = lcg(42);
    for (let i = 0; i < 50; i += 1) {
      const name = generateRouterName(random);
      expect(name).toMatch(/^dg[a-z0-9]{6}$/);
    }
  });

  it('code client : 8 caractères, AUCUN caractère ambigu (0/o, 1/l/i)', () => {
    const random = lcg(7);
    for (let i = 0; i < 50; i += 1) {
      const code = generateClientCode(random);
      expect(code).toHaveLength(CLIENT_CODE_LENGTH);
      for (const ch of code) {
        expect(CLIENT_CODE_ALPHABET).toContain(ch);
      }
      expect(code).not.toMatch(/[01oil]/);
    }
    // L'alphabet lui-même est sans ambigus.
    expect(CLIENT_CODE_ALPHABET).not.toMatch(/[01oilIL]/);
  });

  it('alphabets : le nom routeur utilise bien [a-z0-9] complet', () => {
    expect(ROUTER_NAME_ALPHABET).toBe('abcdefghijklmnopqrstuvwxyz0123456789');
  });

  it('comment : vc-<seq>-<mm.dd.yy>- au fuseau du site (UTC+1)', () => {
    // 24/09/2026 12:00 UTC = 24/09 13:00 local.
    expect(buildMikrotikComment(100, new Date('2026-09-24T12:00:00Z'))).toBe('vc-100-09.24.26-');
    // Bascule de jour local : 24/09 23:30 UTC = 25/09 00:30 local.
    expect(buildMikrotikComment(107, new Date('2026-09-24T23:30:00Z'))).toBe('vc-107-09.25.26-');
    // Séquence 3+ chiffres obligatoire.
    expect(() => buildMikrotikComment(99, new Date())).toThrow();
    expect(() => buildMikrotikComment(100.5, new Date())).toThrow();
  });
});

describe('IMP-18 — generateTicketSpecs', () => {
  it('quantité respectée + unicité intra-lot (codes ET noms routeur)', () => {
    const specs = generateTicketSpecs({ seq: 100, quantity: MAX_BATCH_QUANTITY, random: lcg(1) });
    expect(specs).toHaveLength(MAX_BATCH_QUANTITY);
    const codes = new Set(specs.map((s) => s.clientCode));
    const names = new Set(specs.map((s) => s.routerName));
    expect(codes.size).toBe(MAX_BATCH_QUANTITY);
    expect(names.size).toBe(MAX_BATCH_QUANTITY);
    // Tout le lot partage le même comment (même batch, contrat §3.3).
    expect(new Set(specs.map((s) => s.mikrotikComment)).size).toBe(1);
    expect(specs[0]?.mikrotikComment).toMatch(/^vc-100-\d{2}\.\d{2}\.\d{2}-$/);
  });

  it('limites de quantité : 1..200 (contrat §3.5), entiers seulement', () => {
    expect(() => generateTicketSpecs({ seq: 100, quantity: 0 })).toThrow();
    expect(() => generateTicketSpecs({ seq: 100, quantity: 201 })).toThrow();
    expect(() => generateTicketSpecs({ seq: 100, quantity: 1.5 })).toThrow();
    expect(generateTicketSpecs({ seq: 100, quantity: 1, random: lcg(3) })).toHaveLength(1);
    expect(generateTicketSpecs({ seq: 100, quantity: 200, random: lcg(3) })).toHaveLength(200);
  });

  it('séquence digitale : démarre à 100 (batches Mikmon = 1..6)', () => {
    expect(FIRST_BACKEND_BATCH_SEQ).toBe(100);
  });

  it('déterminisme : même seed => même lot (reproductibilité du générateur)', () => {
    const a = generateTicketSpecs({ seq: 123, quantity: 20, random: lcg(999) });
    const b = generateTicketSpecs({ seq: 123, quantity: 20, random: lcg(999) });
    expect(b).toEqual(a);
  });
});
