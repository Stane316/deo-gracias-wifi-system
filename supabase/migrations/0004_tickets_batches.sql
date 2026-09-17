-- IMP-09 | 0004_tickets_batches
-- ticket_batches (lots : Mikmon manuel 17/09 puis génération backend IMP-18/19)
-- et tickets (docs 06 §26-32). Double état : db_state (plateforme) vs router_state
-- (routeur, contrat Mikmon §2) — docs 06 §13 : ne jamais confondre les états.
-- SÉCURITÉ : seul code_hash est stocké (leçons INC-01/INC-04) ; jamais de code en clair.

CREATE TABLE public.ticket_batches (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source         text NOT NULL CHECK (source IN ('mikmon-manual','backend')),
  quantity       integer NOT NULL CHECK (quantity >= 0),
  generated_at   timestamptz NOT NULL DEFAULT now(),
  manifest_sha256 text,
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id        uuid NOT NULL REFERENCES public.ticket_batches (id),
  code_hash       text NOT NULL UNIQUE,        -- empreinte du code ; le code clair ne vit qu'au coffre/voucher
  code_prefix_hint text,
  plan_id         uuid NOT NULL REFERENCES public.plans (id),
  router_state    text NOT NULL DEFAULT 'UNUSED' CHECK (router_state IN
                  ('UNUSED','ACTIVE','EXPIRED_REMOVED','ADMIN_FREE_LEGACY')),
  db_state        text NOT NULL DEFAULT 'AVAILABLE' CHECK (db_state IN
                  ('AVAILABLE','RESERVED','SOLD','USED','EXPIRED','RELEASED','REFUNDED')),
  order_id        uuid REFERENCES public.orders (id),
  reserved_at     timestamptz,
  sold_at         timestamptz,
  mikrotik_comment text,                       -- format vc-<seq>-<mm.dd.yy>- (contrat Mikmon)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT tickets_sold_requires_order CHECK (db_state <> 'SOLD' OR order_id IS NOT NULL),
  CONSTRAINT tickets_reserved_at_set CHECK (db_state <> 'RESERVED' OR reserved_at IS NOT NULL),
  CONSTRAINT tickets_sold_at_set CHECK (db_state NOT IN ('SOLD','USED') OR sold_at IS NOT NULL)
);

CREATE INDEX tickets_db_state_idx ON public.tickets (db_state);
CREATE INDEX tickets_order_idx    ON public.tickets (order_id);
CREATE INDEX tickets_batch_idx    ON public.tickets (batch_id);

CREATE TRIGGER tickets_updated_at
  BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER ticket_batches_updated_at
  BEFORE UPDATE ON public.ticket_batches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.tickets IS
  'Stock digital : allocation atomique RESERVED->SOLD via fonction SECURITY DEFINER (IMP-15), RLS IMP-10.';
