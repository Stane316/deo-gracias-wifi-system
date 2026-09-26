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
    // IMP-33 — scénario C (doc 09 §117) : incident TICKET_ALLOCATION_ERROR (HIGH),
    // idempotent par commande (detection_key). La récupération passera par le
    // retry d'allocation admin — JAMAIS par un nouveau paiement (invariant 6).
    try {
      const payment = await repo.getLatestPaymentByOrderId(orderId);
      await repo.createIncident({
        type: 'TICKET_ALLOCATION_ERROR',
        severity: 'HIGH',
        detectionKey: `allocation-failed:${orderId}`,
        orderId,
        paymentId: payment?.id ?? null,
        error: 'Stock de tickets épuisé pour le plan de la commande (aucun ticket AVAILABLE)',
        recommendedAction:
          'Importer du stock (IMP-32) puis action « Retry allocation » — le paiement reste CONFIRMÉ, jamais de nouveau paiement.',
      });
    } catch (err) {
      // La détection ne doit jamais casser le flux d'allocation.
      log?.warn({ orderId, err: String(err) }, 'incident allocation : création impossible');
    }
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
