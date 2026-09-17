-- IMP-09 | 0006_audit_incidents_alerts
-- audit_logs (docs 06 §39-41, insert-only), incidents (§42-43), alerts (INC-03/IMP-24),
-- settings (clés opératoires : seuils d'alerte, flags).

CREATE TABLE public.audit_logs (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor     text NOT NULL,                 -- 'system' | 'admin:<id>' | 'connector'
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text,
  before    jsonb,
  after     jsonb,
  at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_entity_idx ON public.audit_logs (entity, entity_id);
CREATE INDEX audit_logs_at_idx     ON public.audit_logs (at);

-- Garde insert-only côté base (indépendant de RLS) : bloque UPDATE/DELETE.
CREATE OR REPLACE FUNCTION public.deny_audit_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs est insert-only (docs 06 §41)';
END;
$$;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE OR DELETE ON public.audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_audit_mutation();

CREATE TABLE public.incidents (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type       text NOT NULL,
  severity   text NOT NULL CHECK (severity IN ('LOW','MEDIUM','HIGH','CRITICAL')),
  state      text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN','INVESTIGATING','RESOLVED','CLOSED')),
  opened_at  timestamptz NOT NULL DEFAULT now(),
  closed_at  timestamptz,
  details    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_closed_at_set CHECK (state NOT IN ('RESOLVED','CLOSED') OR closed_at IS NOT NULL)
);

CREATE TABLE public.alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule            text NOT NULL,
  payload         jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity        text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  acknowledged_at timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX alerts_open_idx ON public.alerts (rule) WHERE acknowledged_at IS NULL;

CREATE TRIGGER incidents_updated_at
  BEFORE UPDATE ON public.incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER alerts_updated_at
  BEFORE UPDATE ON public.alerts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.audit_logs IS
  'Audit immutable : insert-only garanti par trigger deny_audit_mutation + RLS IMP-10.';
