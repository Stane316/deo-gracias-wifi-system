-- IMP-09 | 0002_customers_plans
-- Entités customers (docs 06 §05-06) et plans = catalogue versionné (docs 06 §07-09).
-- Règle critique (docs 06 §08, doc 09 §36) : jamais de durée déduite du nom de profil
-- MikroTik ; le plan porte ses propres valeurs + snapshot à la commande.

CREATE TABLE public.customers (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         text NOT NULL UNIQUE,
  auth_user_id  uuid UNIQUE,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX customers_auth_user_idx ON public.customers (auth_user_id);

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_id        text NOT NULL,               -- référence packages/shared OFFERS (ex. '72-HEURES')
  price_fcfa      integer NOT NULL CHECK (price_fcfa >= 0),
  access_hours    integer NOT NULL CHECK (access_hours > 0),
  validity_hours  integer NOT NULL CHECK (validity_hours > 0),
  mikrotik_profile text NOT NULL,
  limit_uptime    text NOT NULL,               -- format RouterOS observé (contrat Mikmon §5)
  version         integer NOT NULL DEFAULT 1,
  active_from     timestamptz NOT NULL DEFAULT now(),
  active_to       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plans_offer_version_unique UNIQUE (offer_id, version),
  CONSTRAINT plans_validity_window CHECK (active_to IS NULL OR active_to > active_from)
);

CREATE INDEX plans_active_idx ON public.plans (offer_id) WHERE active_to IS NULL;

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.plans IS
  'Catalogue versionné : une modification de prix/durée = nouvelle version, jamais d''UPDATE destructif (docs 06 §08).';
