-- IMP-32 | Destination DIGITAL/PHYSICAL des lots (doc 09 §28) + idempotence de l'import (doc 09 §33).
--
-- destination : DIGITAL = vendable en ligne ; PHYSICAL = vouchers papier.
-- Invariant métier (doc 09 §28) : le backend ne doit JAMAIS attribuer
-- automatiquement un ticket d'un lot PHYSICAL à une vente numérique —
-- la garde correspondante est dans allocateTicketForOrder (repo.ts).
-- Valeur par défaut DIGITAL : tout le stock existant (Mikmon 17/09, seed 0010,
-- génération backend IMP-18) est un stock digital.
ALTER TABLE public.ticket_batches
  ADD COLUMN destination text NOT NULL DEFAULT 'DIGITAL';
ALTER TABLE public.ticket_batches
  ADD CONSTRAINT ticket_batches_destination_check
  CHECK (destination IN ('DIGITAL','PHYSICAL'));

-- Idempotence de l'import de lot : clé unique optionnelle (les lots générés
-- par le backend IMP-18 et le seed 0010 restent sans clé).
ALTER TABLE public.ticket_batches
  ADD COLUMN idempotency_key text;
CREATE UNIQUE INDEX ticket_batches_idempotency_key_idx
  ON public.ticket_batches (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON COLUMN public.ticket_batches.destination IS
  'IMP-32 : DIGITAL = inventaire vendable en ligne ; PHYSICAL = vouchers (jamais auto-attribués à une vente numérique, doc 09 §28).';
COMMENT ON COLUMN public.ticket_batches.idempotency_key IS
  'IMP-32 : clé d''idempotence de l''import (POST /admin/tickets/import) ; NULL pour les lots non importés.';
