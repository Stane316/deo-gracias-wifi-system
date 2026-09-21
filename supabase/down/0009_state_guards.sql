-- IMP-11 | down 0009
DROP TRIGGER IF EXISTS orders_state_guard          ON public.orders;
DROP TRIGGER IF EXISTS orders_state_audit          ON public.orders;
DROP TRIGGER IF EXISTS payments_state_guard        ON public.payments;
DROP TRIGGER IF EXISTS payments_state_audit        ON public.payments;
DROP TRIGGER IF EXISTS tickets_state_guard         ON public.tickets;
DROP TRIGGER IF EXISTS tickets_state_audit         ON public.tickets;
DROP TRIGGER IF EXISTS mikrotik_sync_state_guard   ON public.mikrotik_sync;
DROP TRIGGER IF EXISTS mikrotik_sync_state_audit   ON public.mikrotik_sync;
DROP TRIGGER IF EXISTS access_sessions_state_guard ON public.access_sessions;
DROP TRIGGER IF EXISTS access_sessions_state_audit ON public.access_sessions;

DROP FUNCTION IF EXISTS public.guard_state_transition();
DROP FUNCTION IF EXISTS public.audit_state_change();

DROP TABLE IF EXISTS public.state_transitions CASCADE;
