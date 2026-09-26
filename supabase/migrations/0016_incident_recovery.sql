-- IMP-33 | Cycle de vie complet des incidents + récupération (doc 09 §41-46, §101, §117).
--
-- La table `incidents` (0006) est étendue — aucun modèle parallèle (doc 09 §102) :
--  - cycle de vie : OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED (+REOPENED/CLOSED) ;
--  - références métier de la fiche (commande, paiement, ticket, Connector) ;
--  - erreur technique sûre (JAMAIS de secret), action recommandée ;
--  - tentatives (last_attempt_at, attempts) pour les actions de récupération ;
--  - détection idempotente : un même événement (detection_key) ne crée qu'UN incident.
--
-- Historique : chaque transition est auditée dans audit_logs (insert-only),
-- reconstruit côté API (même pattern que la timeline IMP-31).

ALTER TABLE public.incidents
  ADD COLUMN detection_key text,
  ADD COLUMN order_id uuid,
  ADD COLUMN payment_id uuid,
  ADD COLUMN ticket_id uuid,
  ADD COLUMN connector_id text,
  ADD COLUMN error text,
  ADD COLUMN recommended_action text,
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN acknowledged_by text,
  ADD COLUMN last_attempt_at timestamptz,
  ADD COLUMN attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN close_reason text,
  ADD COLUMN last_retry_key text;

-- Cycle de vie étendu (0006 : OPEN/INVESTIGATING/RESOLVED/CLOSED).
ALTER TABLE public.incidents DROP CONSTRAINT incidents_state_check;
ALTER TABLE public.incidents
  ADD CONSTRAINT incidents_state_check
  CHECK (state IN ('OPEN','ACKNOWLEDGED','INVESTIGATING','RESOLVED','REOPENED','CLOSED'));

-- Détection idempotente : une clé de détection = un unique incident.
-- Index unique SIMPLE (pas partiel) : indispensable pour `ON CONFLICT (detection_key)`.
-- Les incidents sans clé de détection (création manuelle) portent NULL —
-- Postgres autorise plusieurs NULL dans un index unique : pas de contrainte entre eux.
CREATE UNIQUE INDEX incidents_detection_key_idx
  ON public.incidents (detection_key);
CREATE INDEX incidents_order_idx ON public.incidents (order_id);
CREATE INDEX incidents_open_state_idx
  ON public.incidents (state) WHERE state IN ('OPEN','ACKNOWLEDGED','INVESTIGATING','REOPENED');

COMMENT ON COLUMN public.incidents.detection_key IS
  'IMP-33 : clé de détection idempotente UNIQUE (ex. allocation-failed:<orderId>, sync-blocked:<opId>, connector-offline) — un événement = un incident. NULL = création manuelle.';
COMMENT ON COLUMN public.incidents.error IS
  'IMP-33 : message technique sûr (code + libellé) ; JAMAIS de secret ni de payload routeur complet.';
COMMENT ON COLUMN public.incidents.last_retry_key IS
  'IMP-33 : Idempotency-Key du dernier retry admin — le rejeu ne ré-incrémente pas les tentatives.';

-- IMP-33 — resync admin (doc 09 §45) : les opérations de synchro FAILED/BLOCKED
-- repassent en PENDING via l'action « Retry / Resync » (base uniquement — le
-- worker de sync les traite ensuite ; ZÉRO écriture routeur dans l'action).
INSERT INTO public.state_transitions (entity, from_state, to_state) VALUES
  ('mikrotik_sync', 'FAILED', 'PENDING'),
  ('mikrotik_sync', 'BLOCKED', 'PENDING');

-- Garde de transitions (pattern 0009) : le cycle de vie est imposé en base,
-- indépendamment de l'application (doc 09 §43).
CREATE OR REPLACE FUNCTION public.incident_state_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;
  IF (OLD.state, NEW.state) IN (
    ('OPEN','ACKNOWLEDGED'),
    ('OPEN','INVESTIGATING'),
    ('OPEN','RESOLVED'),
    ('OPEN','CLOSED'),
    ('ACKNOWLEDGED','INVESTIGATING'),
    ('ACKNOWLEDGED','RESOLVED'),
    ('ACKNOWLEDGED','CLOSED'),
    ('INVESTIGATING','RESOLVED'),
    ('INVESTIGATING','CLOSED'),
    ('RESOLVED','REOPENED'),
    ('CLOSED','REOPENED'),
    ('REOPENED','OPEN'),
    ('REOPENED','ACKNOWLEDGED'),
    ('REOPENED','INVESTIGATING'),
    ('REOPENED','RESOLVED'),
    ('REOPENED','CLOSED')
  ) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'transition d''incident interdite : % -> % (doc 09 §43)', OLD.state, NEW.state;
END;
$$;

CREATE TRIGGER incidents_state_guard
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.incident_state_guard();
