/**
 * IMP-15 — Service d'allocation/livraison des tickets.
 * Normatif : doc 06 §29-31 (jamais deux commandes sur le même ticket — invariant 2),
 * §90 étapes 11-12 et 15 (réservation/attribution puis ORDER = DELIVERED),
 * invariant 7 (une commande livrée n'est jamais livrée deux fois par un retry),
 * blueprint §3.3 (allocation en SQL transactionnel FOR UPDATE SKIP LOCKED, jamais
 * en logique API ; l'empaquetage SECURITY DEFINER interviendra au déploiement
 * Supabase hébergé où la RLS s'applique aux appelants).
 * Sécurité : le code clair d'un ticket ne transite JAMAIS par ce service —
 * seule l'empreinte (code_hash) vit en base (0004, INC-01/INC-04).
 */
import type { BackendRepo } from './repo.js';

export type DeliveryOutcome =
  | { status: 'delivered'; ticketId: string | null; codePrefixHint: string | null; orderState: 'DELIVERED' }
  | { status: 'already-delivered'; ticketId: string | null; codePrefixHint?: string | null; orderState: 'DELIVERED' }
  | { status: 'no-stock'; orderState: string }
  | { status: 'illegal'; orderState: string };

export interface DeliveryLog {
  warn: (obj: Record<string, unknown>, msg: string) => void;
}

/**
 * Alloue un ticket AVAILABLE du plan de la commande puis livre (DELIVERED).
 * Idempotent : rejouer sur une commande déjà allouée/livrée ne produit aucun
 * second effet (invariants 2 et 7).
 */
export async function allocateAndDeliver(
  repo: BackendRepo,
  orderId: string,
  log?: DeliveryLog,
): Promise<DeliveryOutcome> {
  const order = await repo.getOrderById(orderId);
  if (!order) return { status: 'illegal', orderState: 'ABSENT' };
  const state = order.state;
  if (state === 'DELIVERED') {
    const tickets = await repo.getSoldTicketsForCustomer(order.customerId);
    const own = tickets.find((t) => t.orderId === orderId) ?? null;
    return { status: 'already-delivered', ticketId: own?.id ?? null, orderState: 'DELIVERED' };
  }
  if (state === 'TICKET_ALLOCATED') {
    // Allocation déjà faite, livraison interrompue : on COMPLÈTE sans ré-allouer.
    const delivery = await repo.deliverOrder(orderId);
    if (delivery === 'illegal') return { status: 'illegal', orderState: state };
    const tickets = await repo.getSoldTicketsForCustomer(order.customerId);
    const own = tickets.find((t) => t.orderId === orderId) ?? null;
    return {
      status: delivery === 'already-delivered' ? 'already-delivered' : 'delivered',
      ticketId: own?.id ?? null,
      codePrefixHint: own?.codePrefixHint ?? null,
      orderState: 'DELIVERED',
    };
  }
  if (state !== 'PAID') {
    return { status: 'illegal', orderState: state };
  }
  const allocation = await repo.allocateTicketForOrder(orderId);
  if (allocation.status === 'no-stock') {
    // Recovery matrix (doc 06 §88) : paiement confirmé, ticket indisponible →
    // retry/incident. Le paiement CONFIRMÉ est préservé (invariant 6).
    await repo.logAudit({
      actor: 'system',
      action: 'ticket_allocation_failed',
      entity: 'orders',
      entityId: orderId,
    });
    log?.warn({ orderId }, 'allocation ticket : stock épuisé pour ce plan');
    return { status: 'no-stock', orderState: 'PAID' };
  }
  if (allocation.status === 'illegal') {
    return { status: 'illegal', orderState: state };
  }
  const delivery = await repo.deliverOrder(orderId);
  if (delivery === 'illegal') {
    return { status: 'illegal', orderState: state };
  }
  return {
    status: delivery === 'already-delivered' ? 'already-delivered' : 'delivered',
    ticketId: allocation.ticketId,
    codePrefixHint: allocation.codePrefixHint,
    orderState: 'DELIVERED',
  };
}
