/**
 * IMP-13 — Authentification : clients (phone, OTP) + admin (Supabase Auth + rôle).
 *
 * Doc 09 §7-§8 : échec = message générique, sessions à expiration, limitation des
 * tentatives, déconnexion explicite, journalisation des connexions admin, contrôle
 * d'autorisation CÔTÉ SERVEUR. Doc 06 §06 : identification minimale client = phone.
 *
 * Décisions IMP-13 signalées au propriétaire :
 * - OTP client en mémoire (TTL 5 min, 5 essais, 3 demandes/30 min/phone) : Phase 1
 *   mono-processus, coût nul, AUCUNE migration (0010 reste réservé au seed stock) ;
 *   extraction en table possible plus tard sans changement d'API.
 * - Aucun canal SMS réel (budget nul) : la livraison du code est en mode DEV
 *   (AUTH_DEV_MODE) — le code est retourné dans la réponse pour tests locaux.
 *   La production attendra une décision fournisseur SMS OU l'OTP Supabase côté
 *   frontend (IMP-25). Sans devMode, /auth/phone/* répond 503 (honnête, jamais de
 *   faux « envoyé »).
 * - Rôle admin lu dans `app_metadata.role` du compte Supabase (ADMIN | SUPER_ADMIN,
 *   doc 09 §6.2) ; les autres rôles (OPERATOR…) viendront avec le dashboard IMP-17.
 */
import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

export interface AuthIdentity {
  sub: string;
  phone: string | null;
  email: string | null;
  role: string | null;
}

/** Vérifie un access token et retourne l'identité (null = invalide). */
export interface AuthVerifier {
  verify(accessToken: string): Promise<AuthIdentity | null>;
}

export const ADMIN_ROLES: readonly string[] = ['ADMIN', 'SUPER_ADMIN'];

/**
 * IMP-25 — Vérificateur DEV pour la démo visuelle locale : un unique jeton
 * statique (env DEV_ADMIN_TOKEN) donne le rôle ADMIN. Utilisé SEULEMENT si
 * Supabase n'est PAS configuré ET AUTH_DEV_MODE=1 (server.ts) ; la production
 * utilise exclusivement SupabaseAuthVerifier. Comparaison en temps constant.
 */
export class DevStaticAuthVerifier implements AuthVerifier {
  private readonly expected: Buffer;

  constructor(
    token: string,
    private readonly sub = 'dev-admin',
  ) {
    this.expected = createHash('sha256').update(token).digest();
  }

  async verify(accessToken: string): Promise<AuthIdentity | null> {
    const provided = createHash('sha256').update(accessToken).digest();
    if (provided.length !== this.expected.length || !timingSafeEqual(provided, this.expected)) return null;
    return { sub: this.sub, phone: null, email: null, role: 'ADMIN' };
  }
}

/**
 * Vérification Supabase Auth standard : GET {url}/auth/v1/user avec le Bearer token
 * du client. Nécessite SUPABASE_URL + SUPABASE_ANON_KEY (clé publique par conception,
 * blueprint §7 — jamais de service_role dans ce code).
 */
export class SupabaseAuthVerifier implements AuthVerifier {
  constructor(
    private readonly supabaseUrl: string,
    private readonly anonKey: string,
  ) {}

  async verify(accessToken: string): Promise<AuthIdentity | null> {
    try {
      const res = await fetch(`${this.supabaseUrl}/auth/v1/user`, {
        headers: { apikey: this.anonKey, Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) return null;
      const user = (await res.json()) as {
        id?: string;
        phone?: string;
        email?: string;
        app_metadata?: { role?: string };
      };
      if (!user.id) return null;
      return {
        sub: user.id,
        phone: user.phone ?? null,
        email: user.email ?? null,
        role: user.app_metadata?.role ?? null,
      };
    } catch {
      return null; // réseau KO = identité invalide (refus par défaut, doc 10 OWASP)
    }
  }
}

export interface OtpConfig {
  ttlMs: number;
  maxAttempts: number;
  maxRequestsPerWindow: number;
  requestWindowMs: number;
  now: () => number;
}

const OTP_DEFAULTS: OtpConfig = {
  ttlMs: 5 * 60 * 1000,
  maxAttempts: 5,
  maxRequestsPerWindow: 3,
  requestWindowMs: 30 * 60 * 1000,
  now: () => Date.now(),
};

interface OtpEntry {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  requests: number[];
}

export type OtpRequestOutcome = 'sent' | 'rate_limited';
export type OtpVerifyOutcome = 'ok' | 'invalid';

/** OTP clients en mémoire : hash sha256 du code, jamais le code en clair stocké. */
export class OtpStore {
  private readonly entries = new Map<string, OtpEntry>();
  private readonly cfg: OtpConfig;

  constructor(cfg?: Partial<OtpConfig>) {
    this.cfg = { ...OTP_DEFAULTS, ...cfg };
  }

  request(phone: string): { outcome: OtpRequestOutcome; code?: string } {
    const now = this.cfg.now();
    let entry = this.entries.get(phone);
    if (!entry) {
      entry = { codeHash: '', expiresAt: 0, attempts: 0, requests: [] };
      this.entries.set(phone, entry);
    }
    entry.requests = entry.requests.filter((t) => now - t < this.cfg.requestWindowMs);
    if (entry.requests.length >= this.cfg.maxRequestsPerWindow) {
      return { outcome: 'rate_limited' };
    }
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    entry.codeHash = sha256(code);
    entry.expiresAt = now + this.cfg.ttlMs;
    entry.attempts = 0;
    entry.requests.push(now);
    return { outcome: 'sent', code };
  }

  verify(phone: string, code: string): OtpVerifyOutcome {
    const now = this.cfg.now();
    const entry = this.entries.get(phone);
    // Message unique « invalide » quel que soit le cas (doc 09 §7 : échec générique).
    if (!entry || !entry.codeHash || now > entry.expiresAt) return 'invalid';
    if (entry.attempts >= this.cfg.maxAttempts) {
      entry.codeHash = ''; // tentative épuisée => code détruit
      return 'invalid';
    }
    if (sha256(code) !== entry.codeHash) {
      entry.attempts += 1;
      if (entry.attempts >= this.cfg.maxAttempts) entry.codeHash = '';
      return 'invalid';
    }
    this.entries.delete(phone); // usage unique
    return 'ok';
  }
}

export interface CustomerSession {
  token: string;
  customerId: string;
  phone: string;
  expiresAt: number;
}

/** Sessions clients (tokens opaques en mémoire, TTL, révocation explicite). */
export class SessionStore {
  private readonly sessions = new Map<string, CustomerSession>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(opts?: { ttlMs?: number; now?: () => number }) {
    this.ttlMs = opts?.ttlMs ?? 24 * 60 * 60 * 1000;
    this.now = opts?.now ?? (() => Date.now());
  }

  create(customerId: string, phone: string): CustomerSession {
    const token = randomBytes(32).toString('hex');
    const session: CustomerSession = {
      token,
      customerId,
      phone,
      expiresAt: this.now() + this.ttlMs,
    };
    this.sessions.set(token, session);
    return session;
  }

  get(token: string): CustomerSession | null {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (this.now() > s.expiresAt) {
      this.sessions.delete(token);
      return null;
    }
    return s;
  }

  revoke(token: string): void {
    this.sessions.delete(token);
  }
}

export function bearerToken(req: { headers: Record<string, unknown> }): string | null {
  const h = req.headers['authorization'];
  if (typeof h !== 'string') return null;
  const m = /^Bearer (.+)$/i.exec(h.trim());
  return m?.[1] ? (m[1] as string) : null;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
