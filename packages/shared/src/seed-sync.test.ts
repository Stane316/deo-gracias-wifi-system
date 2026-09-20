import { describe, expect, it } from 'vitest';
import seedSql from '../../../supabase/migrations/0008_seed_plans_grille_a.sql?raw';
import { OFFERS } from './index.js';

/**
 * IMP-10 — Test normatif de synchronisation : la migration 0008 (seed du catalogue
 * Supabase) doit être le miroir EXACT de OFFERS (Grille A, source unique de vérité).
 * Toute dérive (prix, durées, profil, limit_uptime, offre ajoutée/retirée) échoue en CI.
 *
 * Lecture du fichier SQL via import Vite `?raw` (typé par src/raw.d.ts) :
 * aucun import node:* ni import.meta.url => aucune dépendance à @types/node
 * pour ce fichier (compatibilité IDE quelle que soit la state de node_modules).
 */
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
    const stamps = seedSql.match(/'2026-09-17 00:00:00\+00'/g) ?? [];
    expect(new Set(stamps).size).toBe(1);
    expect(stamps).toHaveLength(6);
  });
});
