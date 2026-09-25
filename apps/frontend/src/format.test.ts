import { describe, expect, it } from 'vitest';
import {
  backendUnreachableMessage,
  chooseOfferLabel,
  formatDateTime,
  formatFcfa,
  formatHours,
  maskPhone,
  problemDetail,
} from './format.js';

describe('IMP-25 — formatage', () => {
  it('formatFcfa : séparateurs de milliers + F', () => {
    expect(formatFcfa(500)).toBe('500\u202fF');
    expect(formatFcfa(1500)).toBe('1\u202f500\u202fF');
    expect(formatFcfa(1234567)).toBe('1\u202f234\u202f567\u202fF');
    expect(formatFcfa(0)).toBe('0\u202fF');
  });

  it('formatHours : heures entières', () => {
    expect(formatHours(5)).toBe('5\u202fh');
    expect(formatHours(24)).toBe('24\u202fh');
  });

  it('formatDateTime : null/iso invalide => tiret ; iso valide => structure jj/mm/aaaa hh:mm', () => {
    expect(formatDateTime(null)).toBe('—');
    expect(formatDateTime('pas-une-date')).toBe('—');
    expect(formatDateTime('2026-09-24T13:05:00Z')).toMatch(/^\d{2}\/\d{2}\/2026 \d{2}:\d{2}$/);
  });

  it('chooseOfferLabel : le CTA dit le prix (§31)', () => {
    expect(chooseOfferLabel(100)).toBe('Choisir 100 FCFA');
    expect(chooseOfferLabel(500)).toBe('Choisir 500 FCFA');
  });

  it('maskPhone : seuls les 4 derniers chiffres visibles', () => {
    expect(maskPhone('0197123456')).toBe('•• •• •• 3456');
    expect(maskPhone('97')).toBe('97');
  });

  it('backendUnreachableMessage : 5xx sans corps => message actionnable', () => {
    expect(backendUnreachableMessage(500, null)).toContain('npm run start');
    expect(backendUnreachableMessage(0, null)).toContain('npm run start');
    expect(backendUnreachableMessage(503, { detail: 'x' })).toBeNull();
    expect(backendUnreachableMessage(404, null)).toBeNull();
  });

  it('problemDetail : detail > title > défaut', () => {
    expect(problemDetail({ detail: 'Token invalide', title: 'Auth' })).toBe('Token invalide');
    expect(problemDetail({ title: 'Auth' })).toBe('Auth');
    expect(problemDetail(null)).toBe('Erreur inattendue');
    expect(problemDetail('x')).toBe('Erreur inattendue');
  });
});
