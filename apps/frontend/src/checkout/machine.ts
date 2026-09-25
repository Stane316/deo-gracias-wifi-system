/**
 * IMP-26 / Refonte UX — Machine à états du parcours d'achat Wi-Fi (UX 1).
 *
 * Parcours transactionnel séquentiel (§05 du prompt de refonte) :
 *   ENTRY → PLAN_SELECTION → PLAN_CONFIRMATION → PAYMENT_METHOD →
 *   PHONE_INPUT → PAYMENT_CONFIRMATION → PAYMENT_PROCESSING →
 *   (PAYMENT_PENDING | PAYMENT_FAILED | PAYMENT_SUCCESS) →
 *   TICKET_DELIVERY → TICKET_SUCCESS, + ERROR technique.
 *
 * Principe : module PUR (zéro réseau, zéro DOM) — chaque étape a un objectif
 * unique ; les données (offre, commande, paiement) voyagent dans l'état ;
 * les guards interdisent les doubles clics / retours incohérents.
 * Le branchement au backend et à l'UI arrive aux étapes UX 2→UX 6.
 */

import type { Offer } from '../api.js';

/** Étapes du parcours — une seule active à la fois. */
export type CheckoutStep =
  | 'ENTRY'
  | 'PLAN_SELECTION'
  | 'PLAN_CONFIRMATION'
  | 'PAYMENT_METHOD'
  | 'PHONE_INPUT'
  | 'PAYMENT_CONFIRMATION'
  | 'PAYMENT_PROCESSING'
  | 'PAYMENT_PENDING'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_SUCCESS'
  | 'TICKET_DELIVERY'
  | 'TICKET_SUCCESS'
  | 'ERROR';

export interface CheckoutState {
  step: CheckoutStep;
  /** Offre sélectionnée (prix + durée jamais séparés, §33). */
  offer: Offer | null;
  /** Numéro saisi (conservé entre étapes, §13). */
  phone: string;
  /** Moyen de paiement choisi (informationnel : opérateur confirmé côté provider). */
  method: string | null;
  /** Identifiants backend (créés tard, jamais décidés par l'UI). */
  orderId: string | null;
  paymentId: string | null;
  providerRef: string | null;
  /** Clé d'idempotence STABLE par intention d'achat (§25 : anti double paiement). */
  idempotencyKey: string | null;
  /** Message humain de l'état d'erreur / attente (§14, §21, §22). */
  message: string | null;
}

export const initialCheckoutState: CheckoutState = {
  step: 'ENTRY',
  offer: null,
  phone: '',
  method: null,
  orderId: null,
  paymentId: null,
  providerRef: null,
  idempotencyKey: null,
  message: null,
};

export type CheckoutEvent =
  | { type: 'START_PURCHASE' }
  /** §06 option A : l'utilisateur a déjà un code (validation au portail captif). */
  | { type: 'HAS_CODE' }
  | { type: 'SELECT_PLAN'; offer: Offer; idempotencyKey: string }
  | { type: 'MODIFY_PLAN' }
  | { type: 'CONFIRM_PLAN' }
  | { type: 'CHOOSE_METHOD'; method: string }
  | { type: 'SUBMIT_PHONE'; phone: string }
  | { type: 'LAUNCH_PAYMENT' }
  /** Résultat vu côté backend (jamais décidé par l'UI, §16). */
  | { type: 'PAYMENT_PENDING_SEEN'; message?: string }
  /** Etat backend non reconnu : reprise conservatrice, jamais succès/échec local. */
  | { type: 'ORDER_STATE_UNKNOWN'; message?: string }
  /** Identifiants persistés dès que le backend les connaît, y compris après un 409. */
  | { type: 'ATTACH_PAYMENT'; orderId: string; paymentId: string | null; providerRef: string | null }
  | { type: 'PAYMENT_CONFIRMED'; orderId: string; paymentId: string; providerRef: string | null }
  | { type: 'PAYMENT_REFUSED'; message: string }
  | { type: 'TECHNICAL_ERROR'; message: string }
  /** §23 : paiement confirmé mais ticket pas encore prêt. */
  | { type: 'TICKET_PREPARING' }
  | { type: 'TICKET_READY' }
  | { type: 'RETRY_PAYMENT' }
  /** §24 — reprise après actualisation/fermeture : transaction déjà créée. */
  | { type: 'RESUME'; orderId: string; offer: import('../api.js').Offer; phone: string; paymentId?: string | null; providerRef?: string | null }
  /** Rattache l'identifiant de commande créé par le backend, sans changer d'étape. */
  | { type: 'ATTACH_ORDER'; orderId: string }
  /** Relance manuelle après timeout réseau/backend ; remet le message d'attente à zéro. */
  | { type: 'RECONCILIATION_RETRY' }
  /** §26 — retours arrière d'une étape, sans perte de données. */
  | { type: 'BACK' }
  | { type: 'RESTART' };

/** Garde-fou central : pendant le traitement, aucun événement déclencheur n'est accepté (§24/25). */
const LOCKED_DURING_PROCESSING: ReadonlySet<string> = new Set([
  'SELECT_PLAN',
  'CONFIRM_PLAN',
  'CHOOSE_METHOD',
  'SUBMIT_PHONE',
  'LAUNCH_PAYMENT',
]);

export function checkoutReducer(state: CheckoutState, event: CheckoutEvent): CheckoutState {
  if (state.step === 'PAYMENT_PROCESSING' && LOCKED_DURING_PROCESSING.has(event.type)) {
    return state; // double clic / re-soumission : ignoré
  }

  switch (event.type) {
    case 'START_PURCHASE':
      return state.step === 'ENTRY' ? { ...state, step: 'PLAN_SELECTION', message: null } : state;

    case 'HAS_CODE':
      // Pas de validation de code dans ce système : le code s'utilise au portail
      // captif Wi-Fi. L'UI affichera cette explication (décision documentée).
      return state.step === 'ENTRY'
        ? { ...state, message: 'code-portal' }
        : state;

    case 'SELECT_PLAN':
      if (state.step !== 'PLAN_SELECTION' && state.step !== 'PLAN_CONFIRMATION') return state;
      return {
        ...state,
        step: 'PLAN_CONFIRMATION',
        offer: event.offer,
        idempotencyKey: event.idempotencyKey,
        orderId: null,
        paymentId: null,
        message: null,
      };

    case 'MODIFY_PLAN':
      if (state.step !== 'PLAN_CONFIRMATION') return state;
      return { ...state, step: 'PLAN_SELECTION', offer: null };

    case 'CONFIRM_PLAN':
      if (state.step !== 'PLAN_CONFIRMATION' || !state.offer) return state;
      return { ...state, step: 'PAYMENT_METHOD' };

    case 'CHOOSE_METHOD':
      if (state.step !== 'PAYMENT_METHOD') return state;
      return { ...state, step: 'PHONE_INPUT', method: event.method };

    case 'SUBMIT_PHONE':
      if (state.step !== 'PHONE_INPUT') return state;
      return { ...state, step: 'PAYMENT_CONFIRMATION', phone: event.phone };

    case 'LAUNCH_PAYMENT':
      if (state.step !== 'PAYMENT_CONFIRMATION' || !state.offer || !state.phone || !state.idempotencyKey) {
        return state;
      }
      return { ...state, step: 'PAYMENT_PROCESSING', message: null };

    case 'PAYMENT_PENDING_SEEN':
      if (state.step !== 'PAYMENT_PROCESSING' && state.step !== 'PAYMENT_PENDING') return state;
      return { ...state, step: 'PAYMENT_PENDING', message: event.message ?? null };

    case 'ORDER_STATE_UNKNOWN':
      if (state.step !== 'PAYMENT_PROCESSING' && state.step !== 'PAYMENT_PENDING' && state.step !== 'TICKET_DELIVERY') return state;
      return { ...state, step: state.step === 'TICKET_DELIVERY' ? 'TICKET_DELIVERY' : 'PAYMENT_PENDING', message: event.message ?? 'Nous avons reçu un état inhabituel. Nous vérifions encore avec le serveur.' };

    case 'ATTACH_PAYMENT':
      if (state.step !== 'PAYMENT_PROCESSING' && state.step !== 'PAYMENT_PENDING' && state.step !== 'TICKET_DELIVERY') return state;
      return { ...state, orderId: event.orderId, paymentId: event.paymentId, providerRef: event.providerRef };

    case 'PAYMENT_CONFIRMED':
      if (state.step !== 'PAYMENT_PROCESSING' && state.step !== 'PAYMENT_PENDING') return state;
      return {
        ...state,
        step: 'PAYMENT_SUCCESS',
        orderId: event.orderId,
        paymentId: event.paymentId,
        providerRef: event.providerRef,
      };

    case 'PAYMENT_REFUSED':
      if (state.step !== 'PAYMENT_PROCESSING' && state.step !== 'PAYMENT_PENDING') return state;
      return { ...state, step: 'PAYMENT_FAILED', message: event.message };

    case 'TECHNICAL_ERROR':
      // Une erreur technique peut survenir à tout moment du flux transactionnel.
      if (state.step === 'ENTRY' || state.step === 'TICKET_SUCCESS') return state;
      return { ...state, step: 'ERROR', message: event.message };

    case 'TICKET_PREPARING':
      if (state.step !== 'PAYMENT_SUCCESS') return state;
      return { ...state, step: 'TICKET_DELIVERY', message: null };

    case 'TICKET_READY':
      if (state.step !== 'PAYMENT_SUCCESS' && state.step !== 'TICKET_DELIVERY') return state;
      return { ...state, step: 'TICKET_SUCCESS' };

    case 'RETRY_PAYMENT':
      if (state.step !== 'PAYMENT_FAILED' && state.step !== 'ERROR') return state;
      return { ...state, step: 'PAYMENT_CONFIRMATION', message: null };

    case 'ATTACH_ORDER':
      if (state.step === 'PAYMENT_PROCESSING' || state.step === 'PAYMENT_PENDING' || state.step === 'TICKET_DELIVERY') {
        return { ...state, orderId: event.orderId };
      }
      return state;

    case 'RECONCILIATION_RETRY':
      if (state.step !== 'PAYMENT_PROCESSING' && state.step !== 'PAYMENT_PENDING' && state.step !== 'TICKET_DELIVERY') return state;
      return { ...state, message: null };

    case 'RESUME':
      if (state.step !== 'ENTRY') return state;
      return {
        ...state,
        step: 'PAYMENT_PENDING',
        offer: event.offer,
        phone: event.phone,
        orderId: event.orderId,
        paymentId: event.paymentId ?? null,
        providerRef: event.providerRef ?? null,
        message: null,
      };

    case 'BACK': {
      if (state.step === 'PAYMENT_METHOD') return { ...state, step: 'PLAN_CONFIRMATION' };
      if (state.step === 'PHONE_INPUT') return { ...state, step: 'PAYMENT_METHOD' };
      if (state.step === 'PAYMENT_CONFIRMATION') return { ...state, step: 'PHONE_INPUT' };
      return state;
    }

    case 'RESTART':
      return { ...initialCheckoutState, phone: state.phone };

    default:
      return state;
  }
}
