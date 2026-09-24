-- IMP-19 | 0011_activation_deadline
-- Double garde-fou de validité (contrat Mikmon §3.6) : à la vente, la plateforme
-- fige l'échéance d'activation du ticket (sold_at + validité de l'offre, issue du
-- snapshot §09 de la commande) ; au-delà, l'expiration SOLD->EXPIRED devient
-- possible (worker IMP-20, méthode repo expireOverdueTickets). Le stock vierge
-- ne porte PAS d'échéance : vendable jusqu'à la bascule IMP-38 (décision D10).

ALTER TABLE public.tickets ADD COLUMN activation_deadline timestamptz;

COMMENT ON COLUMN public.tickets.activation_deadline IS
  'IMP-19 (contrat §3.6) : échéance du premier login (sold_at + validité offre) ; dépassée => EXPIRED.';

-- Nouvelle transition légale du double garde-fou (auditée par la garde 0009).
INSERT INTO public.state_transitions (entity, from_state, to_state) VALUES
  ('tickets', 'SOLD', 'EXPIRED');
