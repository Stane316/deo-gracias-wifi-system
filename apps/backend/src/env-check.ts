/**
 * IMP-25.4/25.6 — validation sans secret de DATABASE_URL.
 *
 * Le backend refuse l'URL HTTP du projet Supabase lorsqu'elle est copiée par
 * erreur dans DATABASE_URL. Les diagnostics ne renvoient jamais la valeur,
 * l'utilisateur, le mot de passe, le chemin de base ou les paramètres URI.
 */

function isPostgresProtocol(value: string): boolean {
  return value.startsWith('postgres://') || value.startsWith('postgresql://');
}

/** Retourne un message d'erreur actionnable, ou null si la valeur est valide. */
export function explainDatabaseUrlProblem(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return 'DATABASE_URL manquante. Renseignez-la dans .env (GUIDE-10 §3).';
  }
  const url = value.trim();
  if (isPostgresProtocol(url)) {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.length > 0) return null;
    } catch {
      // Le message générique ci-dessous reste volontairement sans valeur.
    }
    return 'DATABASE_URL est une URI PostgreSQL invalide. Vérifiez sa forme dans GUIDE-10 §3.';
  }
  if (url.startsWith('https://') && url.includes('.supabase.co')) {
    return (
      'DATABASE_URL contient l’URL du PROJET Supabase (https://…supabase.co). ' +
      'Cette valeur va dans SUPABASE_URL. DATABASE_URL doit être la chaîne de connexion ' +
      'Postgres (GUIDE-10 §3).'
    );
  }
  if (url.startsWith('https://') || url.startsWith('http://')) {
    return (
      'DATABASE_URL commence par http(s):// : ce n’est pas une chaîne de connexion Postgres. ' +
      'Forme attendue : postgres://utilisateur:mot_de_passe@hote:port/base (GUIDE-10 §3).'
    );
  }
  return (
    'DATABASE_URL ne commence ni par postgres:// ni par postgresql://. ' +
    'Forme attendue : postgres://utilisateur:mot_de_passe@hote:port/base (GUIDE-10 §3).'
  );
}

/**
 * Représente uniquement la cible réseau. Aucun identifiant, mot de passe,
 * chemin de base ou query string ne peut apparaître dans cette valeur.
 */
export function describeDatabaseTarget(value: string | undefined): string {
  if (!value || value.trim().length === 0) return 'postgres://[missing]';
  try {
    const parsed = new URL(value.trim());
    if (!isPostgresProtocol(value.trim()) || parsed.hostname.length === 0) {
      return 'postgres://[invalid]';
    }
    return `postgres://${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
  } catch {
    return 'postgres://[invalid]';
  }
}
