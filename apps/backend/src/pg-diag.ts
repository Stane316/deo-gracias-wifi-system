/**
 * IMP-25.5 — Traduction des erreurs de connexion Postgres en messages actionnables.
 *
 * Erreurs observées en réel :
 *  - `connect ETIMEDOUT …:5432`  : URL du projet https:// copiée dans DATABASE_URL (IMP-25.4 la bloque au démarrage).
 *  - `getaddrinfo ENOTFOUND db.<ref>.supabase.co` : hôte « Direct connection »
 *    inexistant en DNS pour les projets Supabase récents → il faut l'URI du
 *    pooler Supavisor (Settings → Database → Connection string).
 * Objectif : plus jamais d'erreur brute (500) exposée au portail ; chaque panne
 * de connexion devient un 503 dont le `detail` dit QUOI faire.
 */

interface PgLikeError {
  code?: string;
  message?: string;
  hostname?: string;
  port?: number | string;
  errno?: number | string;
}

function asPgLike(err: unknown): PgLikeError | null {
  if (err && typeof err === 'object') return err as PgLikeError;
  return null;
}

/** Extrait l'hôte d'une URL postgres (sans identifiants). */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname || null;
  } catch {
    return null;
  }
}

/** Retourne un message actionnable, ou null si l'erreur n'est pas une panne de connexion reconnue.
 *  `databaseUrl` (optionnel) permet de nommer l'hôte visé même quand node ne
 *  peuple pas `hostname` (ex. ENETUNREACH après résolution IPv6). */
export function explainPgConnectionError(err: unknown, databaseUrl?: string): string | null {
  const e = asPgLike(err);
  if (!e) return null;
  const code = typeof e.code === 'string' ? e.code : '';
  const msg = typeof e.message === 'string' ? e.message : '';
  const host = (typeof e.hostname === 'string' && e.hostname.length > 0 ? e.hostname : null) ?? hostOf(databaseUrl);
  const hostLabel = host ?? 'de la base';

  // 1) DNS / réseau : hôte introuvable (cas db.<ref>.supabase.co sur projets
  //    récents) ou route injoignable (ENETUNREACH/EHOSTUNREACH).
  if (
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    msg.includes('getaddrinfo')
  ) {
    const supabaseHint =
      host !== null && host.endsWith('.supabase.co')
        ? ' Pour Supabase : cet hôte « Direct connection » est déployé IPv6-SEUL sur les projets ' +
          'récents (vérifié en DNS public : aucun enregistrement IPv4) ; sans IPv6 sur votre ' +
          'réseau, la résolution/connexion échoue. Solution : l’URI du pooler Supavisor, qui a ' +
          'de l’IPv4 — Supabase → Settings → Database → section « Connection pooling » (PAS ' +
          'l’onglet URI) → copiez l’URI Session (5432) ou Transaction (6543), forme ' +
          'postgresql://postgres.<ref>:MOT_DE_PASSE@aws-0-<region>.pooler.supabase.com:…/postgres, ' +
          'et collez-la dans DATABASE_URL (GUIDE-10 §3).'
        : ' Vérifiez le nom d’hôte de DATABASE_URL (GUIDE-10 §3).';
    const cause = code === 'ENOTFOUND' || code === 'EAI_AGAIN' || msg.includes('getaddrinfo') ? 'DNS' : 'réseau';
    return `Hôte Postgres injoignable (${cause}) : ${hostLabel}.${supabaseHint}`;
  }

  // 2) Refus de connexion : hôte joint mais port fermé / mauvais port.
  if (code === 'ECONNREFUSED') {
    return (
      `Connexion refusée par ${hostLabel} (port ${e.port ?? '?'}). ` +
      'Vérifiez le port de l’URI Supabase (5432 = Session, 6543 = Transaction) ou, ' +
      'en local, que Postgres tourne bien (GUIDE-10 §3 / GUIDE-08).'
    );
  }

  // 3) Timeout TCP : URL https:// copiée, ou firewall.
  if (code === 'ETIMEDOUT' || code === 'ETIMEDOUT'.toLowerCase()) {
    return (
      `Délai dépassé en joignant ${hostLabel}. ` +
      'Si DATABASE_URL commençait par https://, c’est l’URL du projet (SUPABASE_URL) : ' +
      'DATABASE_URL doit commencer par postgres:// (GUIDE-10 §3).'
    );
  }

  // 4) Authentification : mot de passe erroné pour cet hôte.
  if (code === '28P01' || msg.includes('password authentication failed')) {
    return (
      'Mot de passe Postgres rejeté par cet hôte. Supabase : Settings → Database → ' +
      'Reset database password, puis mettez à jour DATABASE_URL dans .env (GUIDE-10 §3).'
    );
  }

  // 5) TLS requis.
  if (code === '28000' || msg.includes('pg_hba.conf') || msg.includes('SSL')) {
    return 'La base exige TLS : ajoutez « ?sslmode=require » à DATABASE_URL (GUIDE-10 §3).';
  }

  return null;
}
