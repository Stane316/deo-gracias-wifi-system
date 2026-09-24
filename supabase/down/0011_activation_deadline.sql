-- IMP-19 | down 0011_activation_deadline
-- Rollback : retire la transition puis la colonne. Les tickets éventuellement
-- expirés via SOLD->EXPIRED restent EXPIRED (état terminal cohérent, doc 06 §28).
DELETE FROM public.state_transitions
 WHERE entity = 'tickets' AND from_state = 'SOLD' AND to_state = 'EXPIRED';

ALTER TABLE public.tickets DROP COLUMN IF EXISTS activation_deadline;
