import { describe, expect, it, vi } from 'vitest';
import { SupabaseAuthClient, SupabaseAuthError } from './supabase-auth.js';

const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
};

describe('W2/P6 — client Supabase Auth admin', () => {
  it('se connecte sans exposer le mot de passe dans une URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      expect(String(input)).toBe('https://project.supabase.co/auth/v1/token?grant_type=password');
      expect(init?.method).toBe('POST');
      expect(String(init?.body)).toBe(JSON.stringify({ email: 'admin@dg.bj', password: 'secret' }));
      return new Response(JSON.stringify(session), { status: 200 });
    });
    const client = new SupabaseAuthClient({ url: 'https://project.supabase.co', anonKey: 'anon' }, fetchImpl);
    await expect(client.signInWithPassword('admin@dg.bj', 'secret')).resolves.toEqual(session);
  });

  it('rafraîchit une session avec le refresh token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain('grant_type=refresh_token');
      return new Response(JSON.stringify({ ...session, access_token: 'access-2' }), { status: 200 });
    });
    const client = new SupabaseAuthClient({ url: 'https://project.supabase.co', anonKey: 'anon' }, fetchImpl);
    await expect(client.refreshSession('refresh')).resolves.toMatchObject({ access_token: 'access-2' });
  });

  it('transforme les refus Supabase en erreur générique pour l’interface', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'bad credentials' }), { status: 400 }),
    );
    const client = new SupabaseAuthClient({ url: 'https://project.supabase.co', anonKey: 'anon' }, fetchImpl);
    await expect(client.signInWithPassword('bad@dg.bj', 'bad')).rejects.toEqual(
      new SupabaseAuthError('Adresse e-mail ou mot de passe invalide.'),
    );
  });
});
