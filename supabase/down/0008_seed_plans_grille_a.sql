-- IMP-10 | down 0008
-- Rollback déterministe du seed Grille A (timestamp active_from constant).
DELETE FROM public.plans
WHERE version = 1
  AND active_from = '2026-09-17 00:00:00+00'::timestamptz;
