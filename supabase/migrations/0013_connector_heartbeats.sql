-- IMP-30 — heartbeat explicite du Connector.
-- Aucun ONLINE/OFFLINE ne doit être déduit d'une simple opération de file.
CREATE TABLE public.connector_heartbeats (
  connector_id    text PRIMARY KEY,
  version         text,
  router_model    text,
  routeros_version text,
  last_seen_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX connector_heartbeats_last_seen_idx
  ON public.connector_heartbeats (last_seen_at DESC);

CREATE TRIGGER connector_heartbeats_updated_at
  BEFORE UPDATE ON public.connector_heartbeats
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Table d'exploitation : aucune lecture client directe ; le backend utilise service_role.
ALTER TABLE public.connector_heartbeats ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connector_heartbeats TO service_role;

COMMENT ON TABLE public.connector_heartbeats IS
  'IMP-30 : dernier signal authentifié du Connector ; sans ligne, état UNKNOWN.';
