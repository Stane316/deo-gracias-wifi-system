import { describe, expect, it } from 'vitest';
import { validateCustomerPhone } from './phone.js';

describe('UX 4 — validation humaine du numéro (alignée backend)', () => {
  it('numéro béninois valide => normalisé 01XXXXXXXX', () => {
    expect(validateCustomerPhone('0197123456')).toEqual({ ok: true, normalized: '0197123456' });
  });
  it('préfixe +229 accepté et normalisé comme le backend', () => {
    expect(validateCustomerPhone('+2290197123456')).toEqual({ ok: true, normalized: '0197123456' });
  });
  it('espaces et séparateurs tolérés à la saisie', () => {
    expect(validateCustomerPhone('01 97 12 34 56')).toEqual({ ok: true, normalized: '0197123456' });
  });
  it('vide => message humain invitant à saisir', () => {
    const r = validateCustomerPhone('');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Entrez votre numéro');
  });
  it('ancien format 8 chiffres => message humain, jamais technique (§14)', () => {
    const r = validateCustomerPhone('97123456');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.message).toContain('Numéro incorrect');
      expect(r.message).not.toMatch(/INVALID|regex|schema/i);
    }
  });
  it('mauvais préfixe => rejeté comme par le backend', () => {
    expect(validateCustomerPhone('0297123456').ok).toBe(false);
    expect(validateCustomerPhone('019712345').ok).toBe(false);
    expect(validateCustomerPhone('01971234567').ok).toBe(false);
  });
});
