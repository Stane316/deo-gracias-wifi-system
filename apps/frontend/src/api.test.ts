import { afterEach, describe, expect, it, vi } from 'vitest';
import { api } from './api.js';

describe('IMP-28 — disponibilité réseau et origine API', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('utilise uniquement une URL relative /api et restitue une réponse backend structurée', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe('/api/offers');
      expect(init?.method).toBe('GET');
      return new Response(JSON.stringify({ title: 'Service indisponible', detail: 'Backend arrêté.' }), {
        status: 503,
        headers: { 'content-type': 'application/problem+json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await api('/offers');

    expect(result).toMatchObject({ status: 503, ok: false });
    expect(result.body).toEqual({ title: 'Service indisponible', detail: 'Backend arrêté.' });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('convertit une panne réseau/offline en status 0 sans exception UI', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));

    await expect(api('/offers')).resolves.toEqual({ status: 0, ok: false, body: null });
  });
});
