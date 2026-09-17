-- IMP-09 | 0003_orders_payments
-- orders (docs 06 §10-13), payments (§14-17), payment_events (§18-24).
-- Machines d'états conformes à docs 06 §11 et §15 ; payment_events insert-only
-- (idempotence par provider_event_id unique, docs 06 §20-21).

CREATE TABLE public.orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id     uuid NOT NULL REFERENCES public.customers (id),
  plan_id         uuid NOT NULL REFERENCES public.plans (id),
  plan_snapshot   jsonb NOT NULL,              -- prix + durées figés à la commande (docs 06 §09)
  state           text NOT NULL DEFAULT 'CREATED' CHECK (state IN
                    ('CREATED','PAYMENT_PENDING','PAID','TICKET_ALLOCATED','DELIVERED',
                     'FAILED','EXPIRED','CANCELLED','REFUNDED')),
  idempotency_key text NOT NULL UNIQUE,
  currency        text NOT NULL DEFAULT 'XOF' CHECK (currency = 'XOF'),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX orders_customer_idx ON public.orders (customer_id);
CREATE INDEX orders_state_idx    ON public.orders (state);

CREATE TRIGGER orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid NOT NULL REFERENCES public.orders (id),
  provider     text NOT NULL DEFAULT 'fedapay',
  provider_ref text UNIQUE,
  amount_fcfa  integer NOT NULL CHECK (amount_fcfa >= 0),
  state        text NOT NULL DEFAULT 'CREATED' CHECK (state IN
               ('CREATED','INITIATED','PENDING','CONFIRMED','FAILED','CANCELLED','EXPIRED','REFUNDED')),
  confirmed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_confirmed_at_set CHECK (state <> 'CONFIRMED' OR confirmed_at IS NOT NULL)
);

CREATE INDEX payments_order_idx ON public.payments (order_id);
CREATE INDEX payments_state_idx ON public.payments (state);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.payment_events (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id        uuid REFERENCES public.payments (id),
  provider_event_id text NOT NULL UNIQUE,      -- idempotence webhook (docs 06 §20-21)
  payload           jsonb NOT NULL,
  signature_ok      boolean NOT NULL,
  received_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX payment_events_payment_idx ON public.payment_events (payment_id);

COMMENT ON TABLE public.payment_events IS
  'Journal brut des webhooks : insert-only, jamais UPDATE/DELETE (docs 06 §18-21). RLS IMP-10.';
