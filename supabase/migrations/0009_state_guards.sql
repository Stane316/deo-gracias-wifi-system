-- IMP-11 | 0009_state_guards
-- Les machines d'états de packages/shared (docs 06 §11/15/27/34/38) deviennent
-- exécutoires en base : toute transition non déclarée est REFUSÉE par trigger,
-- et tout changement d'état est audité automatiquement (docs 06 §39-41).
-- Source de vérité DB = table state_transitions (miroir exact de ALL_TRANSITION_EDGES,
-- parité garantie par packages/shared/src/db-parity.test.ts).

CREATE TABLE public.state_transitions (
  entity     text NOT NULL,
  from_state text NOT NULL,
  to_state   text NOT NULL,
  PRIMARY KEY (entity, from_state, to_state),
  CHECK (entity IN ('orders', 'payments', 'tickets', 'mikrotik_sync', 'access_sessions'))
);

-- RLS : table de référence interne — deny pour anon/authenticated, backend via service_role.
ALTER TABLE public.state_transitions ENABLE ROW LEVEL SECURITY;

INSERT INTO public.state_transitions (entity, from_state, to_state) VALUES
  ('orders', 'CREATED', 'PAYMENT_PENDING'),
  ('orders', 'PAYMENT_PENDING', 'PAID'),
  ('orders', 'PAYMENT_PENDING', 'FAILED'),
  ('orders', 'PAYMENT_PENDING', 'EXPIRED'),
  ('orders', 'PAYMENT_PENDING', 'CANCELLED'),
  ('orders', 'PAID', 'TICKET_ALLOCATED'),
  ('orders', 'PAID', 'REFUNDED'),
  ('orders', 'TICKET_ALLOCATED', 'DELIVERED'),
  ('payments', 'CREATED', 'INITIATED'),
  ('payments', 'INITIATED', 'PENDING'),
  ('payments', 'PENDING', 'CONFIRMED'),
  ('payments', 'PENDING', 'FAILED'),
  ('payments', 'PENDING', 'CANCELLED'),
  ('payments', 'PENDING', 'EXPIRED'),
  ('payments', 'CONFIRMED', 'REFUNDED'),
  ('tickets', 'AVAILABLE', 'RESERVED'),
  ('tickets', 'AVAILABLE', 'EXPIRED'),
  ('tickets', 'RESERVED', 'SOLD'),
  ('tickets', 'RESERVED', 'RELEASED'),
  ('tickets', 'RELEASED', 'AVAILABLE'),
  ('tickets', 'SOLD', 'USED'),
  ('tickets', 'SOLD', 'REFUNDED'),
  ('mikrotik_sync', 'PENDING', 'PROCESSING'),
  ('mikrotik_sync', 'PROCESSING', 'SUCCESS'),
  ('mikrotik_sync', 'PROCESSING', 'FAILED'),
  ('mikrotik_sync', 'FAILED', 'RETRY'),
  ('mikrotik_sync', 'FAILED', 'BLOCKED'),
  ('mikrotik_sync', 'FAILED', 'MANUAL_REVIEW'),
  ('mikrotik_sync', 'RETRY', 'PROCESSING'),
  ('mikrotik_sync', 'MANUAL_REVIEW', 'PROCESSING'),
  ('access_sessions', 'NOT_STARTED', 'ACTIVE'),
  ('access_sessions', 'ACTIVE', 'ENDED'),
  ('access_sessions', 'ACTIVE', 'EXPIRED'),
  ('access_sessions', 'ACTIVE', 'DISCONNECTED'),
  ('access_sessions', 'ACTIVE', 'ERROR');

-- Garde de transition (BEFORE UPDATE) : TG_ARGV[0] = entité, TG_ARGV[1] = colonne d'état.
CREATE OR REPLACE FUNCTION public.guard_state_transition()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  e  text := TG_ARGV[0];
  c  text := TG_ARGV[1];
  f  text;
  t  text;
BEGIN
  EXECUTE format('SELECT ($1.%I)::text', c) INTO f USING OLD;
  EXECUTE format('SELECT ($1.%I)::text', c) INTO t USING NEW;
  IF f IS DISTINCT FROM t THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.state_transitions st
      WHERE st.entity = e AND st.from_state = f AND st.to_state = t)
    THEN
      RAISE EXCEPTION 'transition interdite % : % -> %', e, f, t;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Audit automatique de tout changement d'état (AFTER UPDATE, insert-only audit_logs).
-- SECURITY DEFINER : l'écriture d'audit ne dépend pas des grants de l'acteur.
CREATE OR REPLACE FUNCTION public.audit_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  e  text := TG_ARGV[0];
  c  text := TG_ARGV[1];
  f  text;
  t  text;
BEGIN
  EXECUTE format('SELECT ($1.%I)::text', c) INTO f USING OLD;
  EXECUTE format('SELECT ($1.%I)::text', c) INTO t USING NEW;
  IF f IS DISTINCT FROM t THEN
    INSERT INTO public.audit_logs (actor, action, entity, entity_id, before, after)
    VALUES ('system', 'state_change', e, NEW.id::text,
            jsonb_build_object(c, f), jsonb_build_object(c, t));
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER orders_state_guard
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_state_transition('orders', 'state');
CREATE TRIGGER orders_state_audit
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_state_change('orders', 'state');

CREATE TRIGGER payments_state_guard
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_state_transition('payments', 'state');
CREATE TRIGGER payments_state_audit
  AFTER UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.audit_state_change('payments', 'state');

CREATE TRIGGER tickets_state_guard
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.guard_state_transition('tickets', 'db_state');
CREATE TRIGGER tickets_state_audit
  AFTER UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.audit_state_change('tickets', 'db_state');

CREATE TRIGGER mikrotik_sync_state_guard
  BEFORE UPDATE ON public.mikrotik_sync
  FOR EACH ROW EXECUTE FUNCTION public.guard_state_transition('mikrotik_sync', 'state');
CREATE TRIGGER mikrotik_sync_state_audit
  AFTER UPDATE ON public.mikrotik_sync
  FOR EACH ROW EXECUTE FUNCTION public.audit_state_change('mikrotik_sync', 'state');

CREATE TRIGGER access_sessions_state_guard
  BEFORE UPDATE ON public.access_sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_state_transition('access_sessions', 'state');
CREATE TRIGGER access_sessions_state_audit
  AFTER UPDATE ON public.access_sessions
  FOR EACH ROW EXECUTE FUNCTION public.audit_state_change('access_sessions', 'state');

COMMENT ON TABLE public.state_transitions IS
  'IMP-11 : miroir DB des machines d''états packages/shared ; parité testée en CI (db-parity.test.ts).';
