import type { Offer } from '../api.js';
import { formatHours } from '../format.js';

/**
 * UX 3 — Récapitulatif prix + durée TOUJOURS associés (§33), réutilisé en
 * confirmation, récapitulatif de paiement et écran de succès.
 */
export function PlanRecap({ offer }: { offer: Offer }) {
  return (
    <div className="recap" role="group" aria-label="Forfait sélectionné">
      <span className="offer-price">{`${offer.priceFcfa} FCFA`}</span>
      <span className="offer-hours">{formatHours(offer.accessHours)}</span>
    </div>
  );
}
