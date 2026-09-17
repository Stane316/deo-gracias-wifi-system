-- IMP-10 | down 0007
-- Retire les politiques RLS et désactive la RLS (les rôles/auth shim sont
-- laissés : inoffensifs, et supprimez-les seulement si aucun autre usage).
DROP POLICY IF EXISTS plans_public_select    ON public.plans;
DROP POLICY IF EXISTS settings_public_select ON public.settings;
DROP POLICY IF EXISTS customers_own_select   ON public.customers;
DROP POLICY IF EXISTS orders_own_select      ON public.orders;
DROP POLICY IF EXISTS payments_own_select    ON public.payments;
DROP POLICY IF EXISTS tickets_own_select     ON public.tickets;
DROP POLICY IF EXISTS sessions_own_select    ON public.access_sessions;

REVOKE SELECT ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM service_role;
REVOKE USAGE ON SCHEMA public FROM anon, authenticated, service_role;

ALTER TABLE public.customers          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans              DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments           DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_batches     DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.mikrotik_sync      DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_sessions    DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs         DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents          DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts             DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings           DISABLE ROW LEVEL SECURITY;
