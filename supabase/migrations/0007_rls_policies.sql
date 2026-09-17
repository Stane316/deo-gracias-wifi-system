-- IMP-10 | 0007_rls_policies
-- Matrice RLS du blueprint §3.3 :
--   anon          : SELECT uniquement sur plans + settings (catalogue public) ; deny ailleurs
--   authenticated : SELECT « own rows » (customers via auth_user_id = auth.uid() ;
--                   orders/payments/tickets/access_sessions par chaînage customer) ; aucune écriture
--   service_role  : full (BYPASSRLS, comportement Supabase standard — backend Fastify)
--   tables ops (mikrotik_sync, reconciliation_runs, alerts, incidents, ticket_batches,
--   payment_events, audit_logs) : deny total pour anon/authenticated (aucune politique).
-- Compat CI (Postgres nu) : rôles Supabase et auth.uid() créés SEULEMENT s'ils n'existent
-- pas ; sur un vrai projet Supabase, ce bloc ne crée rien (garde IF NOT EXISTS).

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $do$;

DO $do$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth') THEN
    CREATE SCHEMA auth;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'auth' AND p.proname = 'uid')
  THEN
    CREATE FUNCTION auth.uid() RETURNS uuid
    LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  END IF;
END $do$;

-- RLS activée sur les 14 tables (deny par défaut tant qu'aucune politique n'existe)
ALTER TABLE public.customers          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_batches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mikrotik_sync      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings           ENABLE ROW LEVEL SECURITY;

-- Parité Supabase : USAGE sur le schéma + privilèges objet existent par défaut
-- sur un projet Supabase ; on les pose explicitement pour que la matrice soit
-- identique sur tout Postgres (CI comprise), sans dépendre des ACL par défaut.
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;
-- service_role (backend Fastify) : CRUD complet ; BYPASSRLS couvre le filtre lignes.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;

-- ── Catalogue public ────────────────────────────────────────────────────────
CREATE POLICY plans_public_select ON public.plans
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY settings_public_select ON public.settings
  FOR SELECT TO anon, authenticated USING (true);

-- ── Own rows (authenticated) ────────────────────────────────────────────────
CREATE POLICY customers_own_select ON public.customers
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

CREATE POLICY orders_own_select ON public.orders
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = orders.customer_id AND c.auth_user_id = auth.uid()));

CREATE POLICY payments_own_select ON public.payments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.id = payments.order_id AND c.auth_user_id = auth.uid()));

CREATE POLICY tickets_own_select ON public.tickets
  FOR SELECT TO authenticated
  USING (order_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.orders o
    JOIN public.customers c ON c.id = o.customer_id
    WHERE o.id = tickets.order_id AND c.auth_user_id = auth.uid()));

CREATE POLICY sessions_own_select ON public.access_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tickets t
    JOIN public.orders o ON o.id = t.order_id
    JOIN public.customers c ON c.id = o.customer_id
    WHERE t.id = access_sessions.ticket_id AND c.auth_user_id = auth.uid()));

-- Aucune politique d'INSERT/UPDATE/DELETE pour anon/authenticated :
-- toute écriture passe par le backend (service_role, BYPASSRLS).
-- Tests de la matrice : tools/db-rls-tests.sql (CI + local), exécutés par
-- `tools/db-migrate.sh rls`.
