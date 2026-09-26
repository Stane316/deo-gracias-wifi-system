import { describe, expect, it } from 'vitest';
import {
  checkoutReducer,
  initialCheckoutState,
  type CheckoutState,
} from './machine.js';

const OFFER = {
  id: 'B3-24-HEURES',
  priceFcfa: 100,
  accessHours: 5,
  validityHours: 48,
  mikrotikProfile: 'p',
  limitUptime: 'u',
};

function run(events: Parameters<typeof checkoutReducer>[1][], from: CheckoutState = initialCheckoutState): CheckoutState {
  return events.reduce((s, e) => checkoutReducer(s, e), from);
}

describe('UX 1 — machine à états du parcours d’achat', () => {
  it('parcours nominal complet jusqu’au ticket', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k-1' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'MTN MoMo' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
      { type: 'PAYMENT_CONFIRMED', orderId: 'o1', paymentId: 'p1', providerRef: 'r1' },
      { type: 'TICKET_READY' },
    ]);
    expect(s.step).toBe('TICKET_SUCCESS');
    expect(s.offer?.priceFcfa).toBe(100);
    expect(s.orderId).toBe('o1');
  });

  it('ENTRY : HAS_CODE pose le message portail captif sans quitter l’entrée', () => {
    const s = run([{ type: 'HAS_CODE' }]);
    expect(s.step).toBe('ENTRY');
    expect(s.message).toBe('code-portal');
  });

  it('confirmation : MODIFIER revient à la sélection et efface l’offre', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'MODIFY_PLAN' },
    ]);
    expect(s.step).toBe('PLAN_SELECTION');
    expect(s.offer).toBeNull();
  });

  it('guards : événements hors étape ignorés (pas de saut d’étape)', () => {
    expect(run([{ type: 'CONFIRM_PLAN' }]).step).toBe('ENTRY');
    expect(run([{ type: 'START_PURCHASE' }, { type: 'LAUNCH_PAYMENT' }]).step).toBe('PLAN_SELECTION');
    expect(run([{ type: 'START_PURCHASE' }, { type: 'CHOOSE_METHOD', method: 'x' }]).step).toBe('PLAN_SELECTION');
  });

  it('double clic : LAUNCH_PAYMENT verrouillé pendant PROCESSING', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'MTN' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
    ]);
    expect(s.step).toBe('PAYMENT_PROCESSING');
    const after = checkoutReducer(s, { type: 'LAUNCH_PAYMENT' });
    expect(after).toBe(s); // strictement inchangé
  });

  it('attente réelle : PENDING puis CONFIRMED (§18, jamais « échoué » sans preuve)', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'MTN' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
      { type: 'PAYMENT_PENDING_SEEN' },
    ]);
    expect(s.step).toBe('PAYMENT_PENDING');
    const ok = checkoutReducer(s, { type: 'PAYMENT_CONFIRMED', orderId: 'o', paymentId: 'p', providerRef: null });
    expect(ok.step).toBe('PAYMENT_SUCCESS');
  });

  it('refus + réessai : RETRY revient au récapitulatif en conservant offre et numéro', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'Moov' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
      { type: 'PAYMENT_REFUSED', message: 'Paiement refusé par l’opérateur.' },
    ]);
    expect(s.step).toBe('PAYMENT_FAILED');
    const r = checkoutReducer(s, { type: 'RETRY_PAYMENT' });
    expect(r.step).toBe('PAYMENT_CONFIRMATION');
    expect(r.offer?.id).toBe(OFFER.id);
    expect(r.phone).toBe('0197123456');
  });

  it('§23 : paiement confirmé mais ticket en préparation => jamais « échoué »', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'MTN' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
      { type: 'PAYMENT_CONFIRMED', orderId: 'o', paymentId: 'p', providerRef: null },
      { type: 'TICKET_PREPARING' },
    ]);
    expect(s.step).toBe('TICKET_DELIVERY');
    expect(checkoutReducer(s, { type: 'TICKET_READY' }).step).toBe('TICKET_SUCCESS');
  });

  it('BACK : retour d’une étape sans perte de données (§26)', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'MTN' },
    ]);
    expect(s.step).toBe('PHONE_INPUT');
    const b1 = checkoutReducer(s, { type: 'BACK' });
    expect(b1.step).toBe('PAYMENT_METHOD');
    expect(b1.offer?.id).toBe(OFFER.id);
    const b2 = checkoutReducer(b1, { type: 'BACK' });
    expect(b2.step).toBe('PLAN_CONFIRMATION');
    // BACK ignoré aux bornes du parcours
    expect(checkoutReducer(initialCheckoutState, { type: 'BACK' }).step).toBe('ENTRY');
  });

  it('erreur technique => ERROR + message humain ; RESTART conserve le numéro', () => {
    const s = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'k' },
      { type: 'TECHNICAL_ERROR', message: 'Backend injoignable.' },
    ]);
    expect(s.step).toBe('ERROR');
    const r = checkoutReducer(s, { type: 'RESTART' });
    expect(r.step).toBe('ENTRY');
    expect(r.phone).toBe('');
  });
});

describe('IMP-27 — reprise et états backend', () => {
  it('409/rejeu rattache commande et conserve payment_id/provider_ref', () => {
    const processing = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'imp27-409' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'Mobile Money' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
    ]);
    const recovered = checkoutReducer(processing, {
      type: 'ATTACH_PAYMENT',
      orderId: 'order-409',
      paymentId: 'payment-409',
      providerRef: 'provider-409',
    });
    expect(recovered).toMatchObject({
      orderId: 'order-409',
      paymentId: 'payment-409',
      providerRef: 'provider-409',
      step: 'PAYMENT_PROCESSING',
    });
  });

  it('rafraîchissement reprend les identifiants persistés', () => {
    const resumed = checkoutReducer(initialCheckoutState, {
      type: 'RESUME',
      orderId: 'order-refresh',
      offer: OFFER,
      phone: '0197123456',
      paymentId: 'payment-refresh',
      providerRef: 'provider-refresh',
    });
    expect(resumed).toMatchObject({
      step: 'PAYMENT_PENDING',
      orderId: 'order-refresh',
      paymentId: 'payment-refresh',
      providerRef: 'provider-refresh',
    });
  });

  it('état inconnu reste récupérable et ne devient pas un succès local', () => {
    const pending = run([
      { type: 'START_PURCHASE' },
      { type: 'SELECT_PLAN', offer: OFFER, idempotencyKey: 'imp27-unknown' },
      { type: 'CONFIRM_PLAN' },
      { type: 'CHOOSE_METHOD', method: 'Mobile Money' },
      { type: 'SUBMIT_PHONE', phone: '0197123456' },
      { type: 'LAUNCH_PAYMENT' },
      { type: 'PAYMENT_PENDING_SEEN' },
    ]);
    const unknown = checkoutReducer(pending, { type: 'ORDER_STATE_UNKNOWN' });
    expect(unknown.step).toBe('PAYMENT_PENDING');
    expect(unknown.step).not.toBe('PAYMENT_SUCCESS');
    expect(unknown.message).toContain('état inhabituel');
  });
});
