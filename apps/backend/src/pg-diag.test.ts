import { describe, expect, it } from 'vitest';
import { explainPgConnectionError } from './pg-diag.js';

describe('IMP-25.5 — traduction des erreurs de connexion Postgres', () => {
  it('ENOTFOUND sur hôte supabase.co => piste pooler Supavisor', () => {
    const err = {
      code: 'ENOTFOUND',
      hostname: 'db.otyogdttfxtaiixbthbb.supabase.co',
      message: 'getaddrinfo ENOTFOUND db.otyogdttfxtaiixbthbb.supabase.co',
    };
    const msg = explainPgConnectionError(err);
    expect(msg).toContain('pooler');
    expect(msg).toContain('GUIDE-10');
  });
  it('ENOTFOUND hôte quelconque => vérifier le nom d’hôte', () => {
    expect(explainPgConnectionError({ code: 'ENOTFOUND', hostname: 'hote.inconnu' }))
      .toContain('Vérifiez le nom d’hôte');
  });
  it('ENETUNREACH (IPv6 sans route) => même branche actionnable', () => {
    expect(explainPgConnectionError({ code: 'ENETUNREACH', message: 'connect ENETUNREACH 2a05::5432' }))
      .toContain('injoignable');
  });
  it('ECONNREFUSED => port / Postgres local', () => {
    expect(explainPgConnectionError({ code: 'ECONNREFUSED', hostname: '127.0.0.1', port: 5432 }))
      .toContain('Connexion refusée');
  });
  it('ETIMEDOUT => rappel https:// vs postgres://', () => {
    expect(explainPgConnectionError({ code: 'ETIMEDOUT', hostname: 'x' })).toContain('https://');
  });
  it('28P01 => mot de passe', () => {
    expect(explainPgConnectionError({ code: '28P01' })).toContain('Mot de passe');
  });
  it('erreur inconnue ou non-objet => null', () => {
    expect(explainPgConnectionError(new Error('relation "public.plans" does not exist'))).toBeNull();
    expect(explainPgConnectionError('chaîne')).toBeNull();
    expect(explainPgConnectionError(null)).toBeNull();
  });
});
