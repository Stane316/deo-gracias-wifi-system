-- IMP-09 | down 0006
DROP TABLE IF EXISTS public.settings CASCADE;
DROP TABLE IF EXISTS public.alerts CASCADE;
DROP TABLE IF EXISTS public.incidents CASCADE;
DROP TRIGGER IF EXISTS audit_logs_no_update ON public.audit_logs;
DROP FUNCTION IF EXISTS public.deny_audit_mutation();
DROP TABLE IF EXISTS public.audit_logs CASCADE;
