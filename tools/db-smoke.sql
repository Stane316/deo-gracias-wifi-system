-- IMP-09 — Assertions de schéma post-migrations (CI + local).
-- Échoue (RAISE EXCEPTION) si le schéma ne correspond pas au contrat IMP-09.
DO $$
DECLARE
  n_tables integer;
  n_triggers integer;
BEGIN
  SELECT count(*) INTO n_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

  IF n_tables <> 14 THEN
    RAISE EXCEPTION 'smoke: attendu 14 tables public, trouvé %', n_tables;
  END IF;

  -- Les 14 tables du contrat (blueprint §3.1)
  PERFORM 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name IN (
      'customers','plans','orders','payments','payment_events',
      'ticket_batches','tickets','mikrotik_sync','access_sessions',
      'reconciliation_runs','audit_logs','incidents','alerts','settings');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: table(s) du contrat manquante(s)';
  END IF;

  -- Vérification explicite : chaque table du contrat existe (count = 14)
  SELECT count(*) INTO n_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name IN (
      'customers','plans','orders','payments','payment_events',
      'ticket_batches','tickets','mikrotik_sync','access_sessions',
      'reconciliation_runs','audit_logs','incidents','alerts','settings');
  IF n_tables <> 14 THEN
    RAISE EXCEPTION 'smoke: contrat de tables incomplet (%/14)', n_tables;
  END IF;

  -- Triggers updated_at : exactement 11 tables mutables en portent une.
  -- payment_events / audit_logs (insert-only) et reconciliation_runs (pas de colonne)
  -- n'en ont PAS : c'est le contrat, pas un oubli.
  SELECT count(*) INTO n_triggers
  FROM information_schema.triggers
  WHERE trigger_schema = 'public' AND trigger_name LIKE '%_updated_at';
  IF n_triggers <> 11 THEN
    RAISE EXCEPTION 'smoke: triggers updated_at attendus = 11, trouvé %', n_triggers;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.triggers t
    JOIN information_schema.tables tb
      ON tb.table_schema = t.event_object_schema AND tb.table_name = t.event_object_table
    WHERE t.trigger_schema = 'public' AND t.trigger_name LIKE '%_updated_at'
      AND tb.table_name IN ('payment_events','audit_logs','reconciliation_runs'))
  THEN
    RAISE EXCEPTION 'smoke: trigger updated_at interdit sur table insert-only';
  END IF;

  -- audit_logs insert-only : le trigger garde existe
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.triggers
    WHERE trigger_schema = 'public' AND trigger_name = 'audit_logs_no_update')
  THEN
    RAISE EXCEPTION 'smoke: trigger audit_logs_no_update absent';
  END IF;

  -- Contrainte métier : ticket SOLD exige une commande
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'tickets'
      AND constraint_name = 'tickets_sold_requires_order')
  THEN
    RAISE EXCEPTION 'smoke: contrainte tickets_sold_requires_order absente';
  END IF;

  RAISE NOTICE 'smoke OK : 14 tables, % triggers updated_at, gardes présentes', n_triggers;
END;
$$;
