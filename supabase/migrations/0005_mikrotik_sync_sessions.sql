-- IMP-09 | 0005_mikrotik_sync_sessions
-- mikrotik_sync : file d'ordres vers le routeur via Connector (docs 06 §33-36).
-- access_sessions : sessions relevées par le Connector (docs 06 §37-38 ; vide en Phase 1).
-- reconciliation_runs : garde-fou INC-03 / IMP-24 (tickets <-> routeur).

CREATE TABLE public.mikrotik_sync (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation     text NOT NULL CHECK (operation IN
                ('read_status','create_ticket','disable_ticket','refresh_inventory')),
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb,
  state         text NOT NULL DEFAULT 'PENDING' CHECK (state IN
                ('PENDING','PROCESSING','SUCCESS','FAILED','RETRY','BLOCKED','MANUAL_REVIEW')),
  attempts      integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_retry_at timestamptz,
  locked_by     text,
  result        jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX mikrotik_sync_state_idx ON public.mikrotik_sync (state, next_retry_at);

CREATE TRIGGER mikrotik_sync_updated_at
  BEFORE UPDATE ON public.mikrotik_sync
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.access_sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES public.tickets (id),
  mac        text,
  ip         text,
  bytes_in   bigint NOT NULL DEFAULT 0 CHECK (bytes_in >= 0),
  bytes_out  bigint NOT NULL DEFAULT 0 CHECK (bytes_out >= 0),
  uptime_s   bigint NOT NULL DEFAULT 0 CHECK (uptime_s >= 0),
  state      text NOT NULL DEFAULT 'NOT_STARTED' CHECK (state IN
             ('NOT_STARTED','ACTIVE','ENDED','EXPIRED','DISCONNECTED','ERROR')),
  started_at timestamptz,
  ended_at   timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX access_sessions_ticket_idx ON public.access_sessions (ticket_id);
CREATE INDEX access_sessions_state_idx  ON public.access_sessions (state);

CREATE TRIGGER access_sessions_updated_at
  BEFORE UPDATE ON public.access_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.reconciliation_runs (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at              timestamptz NOT NULL DEFAULT now(),
  finished_at             timestamptz,
  router_total_expected   integer,
  router_total_seen       integer,
  diff                    jsonb,
  status                  text NOT NULL DEFAULT 'RUNNING' CHECK (status IN ('RUNNING','OK','MISMATCH'))
);

COMMENT ON TABLE public.reconciliation_runs IS
  'Réconciliation stock digital <-> routeur (garde-fou INC-03, IMP-24). Total attendu 17/09 : ~4815.';
