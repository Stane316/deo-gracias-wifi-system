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

  IF n_tables <> 16 THEN
    RAISE EXCEPTION 'smoke: attendu 16 tables public, trouvé %', n_tables;
  END IF;

  -- Les 16 tables du contrat (blueprint §3.1 + state_transitions IMP-11)
  PERFORM 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name IN (
      'customers','plans','orders','payments','payment_events',
      'ticket_batches','tickets','mikrotik_sync','access_sessions',
      'reconciliation_runs','audit_logs','incidents','alerts','settings','state_transitions','connector_heartbeats');
  IF NOT FOUND THEN
    RAISE EXCEPTION 'smoke: table(s) du contrat manquante(s)';
  END IF;

  -- Vérification explicite : chaque table du contrat existe (count = 16)
  SELECT count(*) INTO n_tables
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    AND table_name IN (
      'customers','plans','orders','payments','payment_events',
      'ticket_batches','tickets','mikrotik_sync','access_sessions',
      'reconciliation_runs','audit_logs','incidents','alerts','settings','state_transitions','connector_heartbeats');
  IF n_tables <> 16 THEN
    RAISE EXCEPTION 'smoke: contrat de tables incomplet (%/16)', n_tables;
  END IF;

  -- Triggers updated_at : exactement 12 tables mutables en portent une.
  -- payment_events / audit_logs (insert-only) et reconciliation_runs (pas de colonne)
  -- n'en ont PAS : c'est le contrat, pas un oubli.
  SELECT count(*) INTO n_triggers
  FROM information_schema.triggers
  WHERE trigger_schema = 'public' AND trigger_name LIKE '%_updated_at';
  IF n_triggers <> 12 THEN
    RAISE EXCEPTION 'smoke: triggers updated_at attendus = 12, trouvé %', n_triggers;
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

  RAISE NOTICE 'smoke OK : 16 tables, % triggers updated_at, gardes présentes', n_triggers;
END;
$$;

-- IMP-16 — Assertions du stock digital Mikmon (migration 0010).
-- 6 batches + 660 tickets hashés, distribution Grille A, unicité des empreintes.
DO $$
DECLARE
  n_batches  integer;
  n_tickets  integer;
  n_distinct integer;
BEGIN
  SELECT count(*) INTO n_batches
  FROM public.ticket_batches WHERE notes LIKE 'mikmon-2026-09-17-B%';
  IF n_batches <> 6 THEN
    RAISE EXCEPTION 'smoke stock: attendu 6 batches Mikmon, trouvé %', n_batches;
  END IF;

  SELECT count(*) INTO n_tickets
  FROM public.tickets t
  JOIN public.ticket_batches b ON b.id = t.batch_id
  WHERE b.notes LIKE 'mikmon-2026-09-17-B%';
  IF n_tickets <> 660 THEN
    RAISE EXCEPTION 'smoke stock: attendu 660 tickets, trouvé %', n_tickets;
  END IF;

  SELECT count(DISTINCT t.code_hash) INTO n_distinct
  FROM public.tickets t
  JOIN public.ticket_batches b ON b.id = t.batch_id
  WHERE b.notes LIKE 'mikmon-2026-09-17-B%';
  IF n_distinct <> 660 THEN
    RAISE EXCEPTION 'smoke stock: empreintes code_hash non uniques (%/660)', n_distinct;
  END IF;

  -- Distribution conforme au manifeste IMP-06 §1 (Grille A).
  IF EXISTS (
    SELECT 1 FROM (
      SELECT p.offer_id, count(*) AS n
      FROM public.tickets t
      JOIN public.ticket_batches b ON b.id = t.batch_id
      JOIN public.plans p ON p.id = t.plan_id
      WHERE b.notes LIKE 'mikmon-2026-09-17-B%'
      GROUP BY p.offer_id
    ) d
    WHERE NOT (
         (d.offer_id = '5-HEURES'  AND d.n = 300)
      OR (d.offer_id = '12-HEURES' AND d.n = 60)
      OR (d.offer_id = '24-HEURES' AND d.n = 100)
      OR (d.offer_id = '72-HEURES' AND d.n = 120)
      OR (d.offer_id = '1-SEMAINE' AND d.n = 40)
      OR (d.offer_id = '1-MOIS'    AND d.n = 40))
  ) THEN
    RAISE EXCEPTION 'smoke stock: distribution par offre non conforme au manifeste';
  END IF;

  -- Tout ticket du stock est AVAILABLE (aucun vendu au moment du seed).
  IF EXISTS (
    SELECT 1 FROM public.tickets t
    JOIN public.ticket_batches b ON b.id = t.batch_id
    WHERE b.notes LIKE 'mikmon-2026-09-17-B%' AND t.db_state <> 'AVAILABLE'
  ) THEN
    RAISE EXCEPTION 'smoke stock: tickets du seed doivent être AVAILABLE';
  END IF;

  RAISE NOTICE 'smoke stock OK : 6 batches, 660 tickets hashés, distribution Grille A';
END;
$$;

-- ── IMP-19 (0011) : échéance d'activation + transition SOLD→EXPIRED ─────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'tickets' AND column_name = 'activation_deadline'
  ) THEN RAISE EXCEPTION 'smoke: tickets.activation_deadline absent (0011)'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.state_transitions
    WHERE entity = 'tickets' AND from_state = 'SOLD' AND to_state = 'EXPIRED'
  ) THEN RAISE EXCEPTION 'smoke: transition tickets SOLD->EXPIRED absente (0011)'; END IF;
END $$;
