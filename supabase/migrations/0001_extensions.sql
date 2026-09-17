-- IMP-09 | 0001_extensions
-- Extensions et utilitaires de base. Aucune donnée, aucun secret.
-- pgcrypto : digest()/sha256 côté base si nécessaire (code_hash des tickets).
-- gen_random_uuid() est natif depuis PG13 (Supabase = PG15+), pgcrypto reste utile
-- pour les empreintes.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Trigger utilitaire : maintient updated_at à jour sur chaque UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.set_updated_at() IS
  'IMP-09 : trigger utilitaire updated_at, appliqué par migration créant la colonne.';
