/**
 * IMP-25.4 — Validation explicite de DATABASE_URL au démarrage.
 *
 * Erreur observée en réel (24/09) : l'URL du PROJET Supabase
 * (`https://<ref>.supabase.co`, valeur de SUPABASE_URL) copiée dans
 * DATABASE_URL → pg tente une connexion TCP vers https:// → ETIMEDOUT,
 * diagnostic illisible. Ici : message actionnable, sortie immédiate.
 */

/** Retourne un message d'erreur actionnable, ou null si la valeur est valide. */
export function explainDatabaseUrlProblem(value: string | undefined): string | null {
  if (!value || value.trim().length === 0) {
    return 'DATABASE_URL manquante. Renseignez-la dans .env (GUIDE-10 §3).';
  }
  const url = value.trim();
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return null; // forme attendue
  }
  if (url.startsWith('https://') && url.includes('.supabase.co')) {
    return (
      'DATABASE_URL contient l’URL du PROJET Supabase (https://…supabase.co). ' +
      'Cette valeur va dans SUPABASE_URL. DATABASE_URL doit être la chaîne de connexion ' +
      'Postgres : Supabase Dashboard → Project Settings → Database → Connection string → ' +
      'onglet URI (Direct connection), forme postgres://postgres.[ref]:MOT_DE_PASSE@db.[ref].supabase.co:5432/postgres (GUIDE-10 §3).'
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
