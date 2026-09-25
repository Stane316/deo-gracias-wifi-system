import { describe, expect, it } from 'vitest';
import { deriveVaultKey, openCode, sealCode } from './ticketvault.js';

describe('IMP-26 UX6 — coffre chiffré du code client', () => {
  const key = deriveVaultKey('secret-de-demo');
  it('roundtrip sceller/ouvrir', () => {
    const sealed = sealCode(key, 'ab7k92xz');
    expect(sealed).not.toContain('ab7k92xz');
    expect(openCode(key, sealed)).toBe('ab7k92xz');
  });
  it('mauvaise clé => null (jamais de code faux)', () => {
    const sealed = sealCode(key, 'ab7k92xz');
    expect(openCode(deriveVaultKey('autre'), sealed)).toBeNull();
  });
  it('sceau altéré => null (auth-tag GCM)', () => {
    const sealed = sealCode(key, 'ab7k92xz');
    const buf = Buffer.from(sealed, 'base64');
    const last = buf.length - 1;
    buf[last] = (buf[last] ?? 0) ^ 0xff;
    expect(openCode(key, buf.toString('base64'))).toBeNull();
  });
  it('format invalide => null', () => {
    expect(openCode(key, 'AAAA')).toBeNull();
    expect(openCode(key, '')).toBeNull();
  });
});
