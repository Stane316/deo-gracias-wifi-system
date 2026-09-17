import { describe, expect, it } from 'vitest';
import { OFFERS, offerSchema, TICKET_STATES } from './index.js';

/**
 * Tests normatifs : ils encodent la GRILLE A officielle validée par le propriétaire.
 * Toute modification de ces valeurs exige une décision propriétaire documentée
 * (jamais de remplacement silencieux d'une décision documentée).
 */
describe('Grille A officielle', () => {
  it('comporte exactement 6 offres (aucune offre 5000 F)', () => {
    expect(OFFERS).toHaveLength(6);
    expect(OFFERS.map((o) => o.priceFcfa)).toEqual([100, 200, 300, 500, 1000, 4000]);
  });

  it('mappe prix → accès → validité conformément à la Grille A', () => {
    const expected: Array<[number, number, number]> = [
      [100, 5, 24],
      [200, 12, 24],
      [300, 24, 48],
      [500, 72, 120],
      [1000, 168, 240],
      [4000, 720, 960],
    ];
    for (const [price, access, validity] of expected) {
      const offer = OFFERS.find((o) => o.priceFcfa === price);
      expect(offer, `offre ${price} F absente`).toBeDefined();
      expect(offer?.accessHours).toBe(access);
      expect(offer?.validityHours).toBe(validity);
    }
  });

  it('porte les limit-uptime exacts du contrat Mikmon', () => {
    const expected: Record<string, string> = {
      '5-HEURES': '05:00:00',
      '12-HEURES': '12:00:00',
      '24-HEURES': '1d00:00:00',
      '72-HEURES': '3d00:00:00',
      '1-SEMAINE': '7d00:00:00',
      '1-MOIS': '40d00:00:00',
    };
    for (const offer of OFFERS) {
      expect(offer.limitUptime).toBe(expected[offer.id]);
      expect(offer.mikrotikProfile).toBe(offer.id);
    }
  });

  it('valide chaque offre par le schéma Zod partagé', () => {
    for (const offer of OFFERS) {
      expect(offerSchema.safeParse(offer).success).toBe(true);
    }
  });
});

describe('États de ticket', () => {
  it('couvre le cycle de vie du contrat Mikmon', () => {
    expect(TICKET_STATES).toEqual([
      'UNUSED',
      'ACTIVE',
      'EXPIRED_REMOVED',
      'ADMIN_FREE_LEGACY',
    ]);
  });
});
