import { describe, expect, it } from 'vitest';
import seedSql from '../../../supabase/migrations/0010_seed_stock_mikmon.sql?raw';
import downSql from '../../../supabase/down/0010_seed_stock_mikmon.sql?raw';

/**
 * IMP-16 — Test normatif du seed stock Mikmon (migration 0010).
 * Le stock digital (manifeste IMP-06 : 660 tickets du 17/09/2026) entre en base
 * UNIQUEMENT sous forme d'empreintes sha256 — ce test garantit la structure du
 * fichier généré (tools/gen-seed-stock-0010.py) : 6 lots, quantités manifeste §1,
 * 660 empreintes uniques de 64 caractères hex, empreintes des PDFs du manifeste §2.
 * Lecture via import Vite `?raw` (aucun import node:*, compatibilité IDE — leçon IMP-10).
 */
const MANIFESTE = [
  { tag: 'B1', offer: '5-HEURES', qty: 300, pdf_sha: '2c62a8285ae8491541406e2b6d0c6d27781f8333587b7e3b96e437bb0e22f9c1' },
  { tag: 'B2', offer: '12-HEURES', qty: 60, pdf_sha: '01a2c12ebc6acd2bc5d41f93c0bac453a8afb6fabe6c8328dc4ae599fe3c1e89' },
  { tag: 'B3', offer: '24-HEURES', qty: 100, pdf_sha: '157bfc82e05fe56a34aea6a3ca9cead2dce72bcde524ff9ec573fae9a8589fde' },
  { tag: 'B4', offer: '72-HEURES', qty: 120, pdf_sha: '18fb11a7c2e6a81bf05f42e6aae6a6b302198afca3ef0c38047a18447a8f6b45' },
  { tag: 'B5', offer: '1-SEMAINE', qty: 40, pdf_sha: 'e6f6727cb80b7b3c09f7c2236b656cf698d416c4a6d3f2734b5d609eb66c3e5d' },
  { tag: 'B6', offer: '1-MOIS', qty: 40, pdf_sha: '637c13cff788e65f348035e70e78d972b68bb448480b13361879ef573cf61e3d' },
] as const;

describe('seed 0010 ↔ manifeste stock IMP-06', () => {
  it('contient exactement 6 INSERT de tickets (un par lot Mikmon)', () => {
    const inserts = seedSql.match(/INSERT INTO public\.tickets/g) ?? [];
    expect(inserts).toHaveLength(6);
  });

  for (const lot of MANIFESTE) {
    it(`lot ${lot.tag} : ${lot.offer} x${lot.qty}, empreinte PDF du manifeste §2, référence plan Grille A`, () => {
      expect(seedSql).toContain(`-- Lot ${lot.tag} : ${lot.offer} x${lot.qty}`);
      expect(seedSql).toContain(`'mikmon-2026-09-17-${lot.tag} (${lot.offer}, manifeste IMP-06)'`);
      expect(seedSql).toContain(`'${lot.pdf_sha}'`); // manifest_sha256 = empreinte du PDF coffre
      expect(seedSql).toContain(`WHERE offer_id = '${lot.offer}' AND active_to IS NULL LIMIT 1`);
    });
  }

  it('porte exactement 660 empreintes sha256 (64 hex), toutes uniques', () => {
    // Une empreinte = 64 caractères hex entre quotes simples, suivie d'une virgule
    // et du préfixe-indice à 2 caractères (structure VALUES du générateur).
    const hashes = seedSql.match(/'([0-9a-f]{64})', '[a-z0-9]{2}'/g) ?? [];
    expect(hashes).toHaveLength(660);
    expect(new Set(hashes).size).toBe(660); // unicité (aussi garantie UNIQUE en base)
  });

  it("quantité par lot conforme au manifeste §1 (comptage des VALUES de chaque bloc)", () => {
    for (const lot of MANIFESTE) {
      const bloc = seedSql.split(`-- Lot ${lot.tag} : `)[1]?.split('-- Lot ')[0] ?? '';
      const rows = bloc.match(/'([0-9a-f]{64})', '[a-z0-9]{2}'/g) ?? [];
      expect(rows).toHaveLength(lot.qty);
    }
  });

  it('est idempotent : UUID de batch fixes + ON CONFLICT DO NOTHING', () => {
    const onConflict = seedSql.match(/ON CONFLICT \(code_hash\) DO NOTHING/g) ?? [];
    expect(onConflict).toHaveLength(6);
    expect(seedSql).toContain('ON CONFLICT (id) DO NOTHING');
    // Un UUID de batch = 36 caractères ; les 6 lignes de batches en portent un fixe.
    const batchIds = seedSql.match(/VALUES \('[0-9a-f-]{36}', 'mikmon-manual'/g) ?? [];
    expect(batchIds).toHaveLength(6);
  });

  it('vérifie le résultat en fin de migration (6 batches / 660 tickets)', () => {
    expect(seedSql).toContain("n_batches <> 6 OR n_tickets <> 660");
  });

  it('rollback ciblé : supprime les tickets du stock puis les batches (notes tag)', () => {
    expect(downSql).toContain("DELETE FROM public.tickets");
    expect(downSql).toContain("WHERE notes LIKE 'mikmon-2026-09-17-B%'");
    // Ordre : tickets AVANT batches (contrainte FK batch_id).
    expect(downSql.indexOf('DELETE FROM public.tickets')).toBeLessThan(
      downSql.indexOf('DELETE FROM public.ticket_batches'),
    );
  });
});
