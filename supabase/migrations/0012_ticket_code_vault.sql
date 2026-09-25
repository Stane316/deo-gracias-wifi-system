-- IMP-26 / UX 6 (D-UX6a) : coffre chiffré du code client.
-- JAMAIS de code clair : uniquement un sceau AES-256-GCM (iv||tag||ct, base64)
-- écrit à la création des lots backend ; lu par GET /tickets/:id/code
-- (session client du téléphone payeur + ticket SOLD + audit_logs).
-- Lots Mikmon manuels : sceau NULL => code non révélable en ligne.
ALTER TABLE public.tickets ADD COLUMN IF NOT EXISTS code_cipher text;
