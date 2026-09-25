-- IMP-26 / UX 6 — rollback du coffre chiffré des codes clients.
-- Les codes restent absents de la base ; cette opération retire uniquement la colonne.
ALTER TABLE public.tickets DROP COLUMN IF EXISTS code_cipher;
