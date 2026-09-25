/**
 * UX 5 — classification PURE des états de commande backend (§18-23) :
 * jamais « échoué » sans preuve explicite du backend.
 */
export type OrderFlowClass =
  | 'PENDING'    // paiement lancé, pas encore de preuve finale
  | 'PREPARING'  // §23 : paiement confirmé, ticket en préparation
  | 'DELIVERED'  // succès complet
  | 'FAILED'     // refus explicite du provider
  | 'CANCELLED'  // annulation explicite
  | 'EXPIRED'    // expiration explicite
  | 'UNKNOWN';

export function classifyOrderState(state: string): OrderFlowClass {
  switch (state) {
    case 'CREATED':
    case 'PAYMENT_PENDING':
      return 'PENDING';
    case 'PAID':
    case 'TICKET_ALLOCATED':
      return 'PREPARING';
    case 'DELIVERED':
      return 'DELIVERED';
    case 'FAILED':
      return 'FAILED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'EXPIRED':
      return 'EXPIRED';
    default:
      return 'UNKNOWN';
  }
}
