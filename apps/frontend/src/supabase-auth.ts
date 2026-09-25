/**
 * W2/P6 — petit client navigateur Supabase Auth.
 *
 * Seules SUPABASE_URL et SUPABASE_ANON_KEY (publiques par conception) arrivent
 * dans le bundle Vite. La clé secrète/service_role n'est jamais acceptée ici.
 * Le backend reste l'autorité : il vérifie ensuite le Bearer token et le rôle.
 */

export interface SupabaseAuthConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseSession {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  expires_at?: number;
}

interface SupabaseErrorBody {
  error_description?: string;
  msg?: string;
  error?: string;
}

const ADMIN_SESSION_KEY = 'dg.admin.supabase.session';

export function browserSupabaseConfig(): SupabaseAuthConfig | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url || !anonKey || !url.startsWith('https://')) return null;
  return { url: url.replace(/\/$/, ''), anonKey };
}

export function readAdminSession(): SupabaseSession | null {
  try {
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Partial<SupabaseSession>;
    if (
      typeof session.access_token !== 'string' ||
      typeof session.refresh_token !== 'string' ||
      typeof session.expires_in !== 'number'
    ) return null;
    return session as SupabaseSession;
  } catch {
    return null;
  }
}

export function writeAdminSession(session: SupabaseSession | null): void {
  try {
    if (session) sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
    else sessionStorage.removeItem(ADMIN_SESSION_KEY);
  } catch {
    // Session indisponible : l'utilisateur devra se reconnecter dans cet onglet.
  }
}

export class SupabaseAuthError extends Error {
  constructor(message = 'Supabase Auth a refusé la demande.') {
    super(message);
    this.name = 'SupabaseAuthError';
  }
}

export class SupabaseAuthClient {
  constructor(
    private readonly config: SupabaseAuthConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async signInWithPassword(email: string, password: string): Promise<SupabaseSession> {
    return this.postSession('/auth/v1/token?grant_type=password', { email, password });
  }

  async refreshSession(refreshToken: string): Promise<SupabaseSession> {
    return this.postSession('/auth/v1/token?grant_type=refresh_token', { refresh_token: refreshToken });
  }

  async signOut(accessToken: string): Promise<void> {
    try {
      await this.fetchImpl(`${this.config.url}/auth/v1/logout`, {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          Authorization: `Bearer ${accessToken}`,
        },
      });
    } catch {
      // La révocation distante est best-effort ; la session locale est toujours supprimée.
    }
  }

  private async postSession(path: string, body: Record<string, string>): Promise<SupabaseSession> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.config.url}${path}`, {
        method: 'POST',
        headers: {
          apikey: this.config.anonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new SupabaseAuthError('Service de connexion momentanément indisponible.');
    }

    const payload = (await response.json().catch(() => null)) as (Partial<SupabaseSession> & SupabaseErrorBody) | null;
    if (!response.ok || !payload || typeof payload.access_token !== 'string' || typeof payload.refresh_token !== 'string') {
      throw new SupabaseAuthError('Adresse e-mail ou mot de passe invalide.');
    }
    return {
      access_token: payload.access_token,
      refresh_token: payload.refresh_token,
      expires_in: typeof payload.expires_in === 'number' ? payload.expires_in : 3600,
      ...(typeof payload.expires_at === 'number' ? { expires_at: payload.expires_at } : {}),
    };
  }
}
