/**
 * IMP-32 — Manifeste du stock digital Mikmon du 17/09/2026 (IMP-06), codé pour
 * la réconciliation admin (GET /admin/tickets/reconciliation).
 *
 * Source unique : `docs/infrastructure/stock-manifest-2026-09-17.md` §1
 * (batches B1→B6, 660 tickets, répartition Grille A). Le seed 0010 reprend
 * exactement cette répartition ; la réconciliation compare le comptage par
 * offre des lots `mikmon-manual` en base aux quantités du manifeste.
 *
 * Le manifeste ne contient AUCUN code ni secret : uniquement offres et
 * quantités (les empreintes SHA256 des PDF restent hors dépôt, manifeste §2).
 */
export interface StockManifestBatch {
  note: string;
  offerId: string;
  quantity: number;
}

export interface StockManifest {
  id: string;
  generatedAt: string;
  source: 'mikmon-manual';
  totalQuantity: number;
  batches: StockManifestBatch[];
}

export const STOCK_MANIFEST_IMP06: StockManifest = {
  id: 'stock-manifest-2026-09-17',
  generatedAt: '2026-09-17',
  source: 'mikmon-manual',
  totalQuantity: 660,
  batches: [
    { note: 'B1', offerId: '5-HEURES', quantity: 300 },
    { note: 'B2', offerId: '12-HEURES', quantity: 60 },
    { note: 'B3', offerId: '24-HEURES', quantity: 100 },
    { note: 'B4', offerId: '72-HEURES', quantity: 120 },
    { note: 'B5', offerId: '1-SEMAINE', quantity: 40 },
    { note: 'B6', offerId: '1-MOIS', quantity: 40 },
  ],
};
