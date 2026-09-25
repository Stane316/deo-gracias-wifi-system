import { describe, expect, it } from 'vitest';
import { classifyOrderState } from './orderstate.js';

describe('UX 5 — classification des états de commande', () => {
  it('PAYMENT_PENDING/CREATED => attente, jamais échec (§18)', () => {
    expect(classifyOrderState('PAYMENT_PENDING')).toBe('PENDING');
    expect(classifyOrderState('CREATED')).toBe('PENDING');
  });
  it('PAID/TICKET_ALLOCATED => confirmé, préparation (§23)', () => {
    expect(classifyOrderState('PAID')).toBe('PREPARING');
    expect(classifyOrderState('TICKET_ALLOCATED')).toBe('PREPARING');
  });
  it('DELIVERED => succès', () => {
    expect(classifyOrderState('DELIVERED')).toBe('DELIVERED');
  });
  it('refus / annulation / expiration explicites distincts (§22)', () => {
    expect(classifyOrderState('FAILED')).toBe('FAILED');
    expect(classifyOrderState('CANCELLED')).toBe('CANCELLED');
    expect(classifyOrderState('EXPIRED')).toBe('EXPIRED');
  });
  it('état inconnu => UNKNOWN, traité comme technique et non comme échec de paiement', () => {
    expect(classifyOrderState('NOUVEAU_ETAT')).toBe('UNKNOWN');
  });
});
