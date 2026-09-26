-- IMP-31 | admin correction requests
-- Une correction exceptionnelle est une demande explicitement autorisée et auditée.
-- Elle ne modifie aucun état métier et ne fournit jamais d'action « marquer comme payé ».

CREATE TABLE public.admin_correction_requests (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id         uuid NOT NULL REFERENCES public.orders (id),
  requested_action text NOT NULL CHECK (requested_action IN
                     ('REVIEW_PAYMENT','REVIEW_ALLOCATION','REVIEW_DELIVERY')),
  reason           text NOT NULL CHECK (char_length(reason) BETWEEN 20 AND 1000),
  requested_by     text NOT NULL,
  state            text NOT NULL DEFAULT 'OPEN' CHECK (state IN
                     ('OPEN','REVIEWED','REJECTED','APPLIED')),
  idempotency_key  text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 200),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id, idempotency_key)
);

CREATE INDEX admin_correction_requests_order_idx
  ON public.admin_correction_requests (order_id, created_at DESC);
CREATE INDEX admin_correction_requests_state_idx
  ON public.admin_correction_requests (state, created_at DESC);

CREATE TRIGGER admin_correction_requests_updated_at
  BEFORE UPDATE ON public.admin_correction_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.admin_correction_requests ENABLE ROW LEVEL SECURITY;
-- Les demandes sont créées exclusivement par le backend (service_role).
-- Aucune policy anon/authenticated n'est volontairement définie : le SELECT est
-- accordé mais retourne 0 ligne (matrice RLS vérifiée par tools/db-rls-tests.sql).
-- GRANT explicites : 0007 ne couvre que les tables existantes à ce moment-là
-- (même pattern que 0013 pour connector_heartbeats).
GRANT SELECT ON public.admin_correction_requests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_correction_requests TO service_role;

COMMENT ON TABLE public.admin_correction_requests IS
  'IMP-31 : demande exceptionnelle, reason obligatoire, idempotente et auditée ; aucune mutation de paiement.';
COMMENT ON COLUMN public.admin_correction_requests.reason IS
  'Justification opérateur obligatoire ; ne jamais y placer un secret, token ou credential.';
