import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OFFERS } from './index.js';

/**
 * IMP-10 — Test normatif de synchronisation : la migration 0008 (seed du catalogue
 * Supabase) doit être le miroir EXACT de OFFERS (Grille A, source unique de vérité).
 * Toute dérive (prix, durées, profil, limit_uptime, offre ajoutée/retirée) échoue en CI.
 */
const here = dirname(fileURLToPath(import.meta.url));
const seedPath = resolve(here, '../../../supabase/migrations/0008_seed_plans_grille_a.sql');
const seedSql = readFileSync(seedPath, 'utf8');

describe('seed 0008 ↔ packages/shared OFFERS', () => {
  it('contient exactement 6 INSERT de plans (un par offre Grille A)', () => {
    const inserts = seedSql.match(/INSERT INTO public\.plans/g) ?? [];
    expect(inserts).toHaveLength(OFFERS.length);
    expect(inserts).toHaveLength(6);
  });

  for (const offer of OFFERS) {
    it(`reflète l'offre ${offer.id} (prix, accès, validité, profil, limit_uptime)`, () => {
      const fragment = `'${offer.id}', ${offer.priceFcfa}, ${offer.accessHours}, ${offer.validityHours}, '${offer.mikrotikProfile}', '${offer.limitUptime}'`;
      expect(seedSql).toContain(fragment);
    });
  }

  it("n'introduit aucune offre 5 000 FCFA", () => {
    expect(seedSql).not.toMatch(/,\s*5000\s*,/);
  });

  it('utilise un active_from constant (rollback déterministe down/0008)', () => {
    const stamps = new Set(seedSql.match(/'2026-09-17 00:00:00\+00'/g) ?? []);
    expect(stamps.size).toBe(1);
    expect(seedSql.match(/'2026-09-17 00:00:00\+00'/g)).toHaveLength(6);
  });
});
