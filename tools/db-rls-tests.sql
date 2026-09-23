-- IMP-10 — Tests de la matrice RLS (anon / authenticated / service_role).
-- Exécuté par `tools/db-migrate.sh rls` (CI job db-migrations + local).
-- Prérequis : migrations 0001→0010 appliquées (0008 = 6 plans Grille A ; 0010 = stock
-- Mikmon 660 tickets — le test RLS vérifie que ce stock n'est visible QUE de service_role).
-- Méthode : fixtures posées en superuser, puis SET ROLE + claim JWT simulé
-- (request.jwt.claim.sub = auth.uid(), même mécanique que Supabase).
-- Toute violation de la matrice = RAISE EXCEPTION (échec CI).

DO $do$
DECLARE
  n        integer;
  n_stock  integer;   -- IMP-16 : tickets du stock seedé (0010), invisibles aux clients
  uid_a    uuid := 'aaaaaaaa-0000-0000-0000-0000000000aa';
  uid_b    uuid := 'bbbbbbbb-0000-0000-0000-0000000000bb';
  cust_a   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  cust_b   uuid := 'bbbbbbbb-0000-0000-0000-000000000002';
  ord_a    uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  batch_f  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  tick_f   uuid := 'aaaaaaaa-0000-0000-0000-000000000020';
  plan_5h  uuid;
BEGIN
  -- ── Fixtures (superuser) ──────────────────────────────────────────────────
  SELECT count(*) INTO n_stock FROM public.tickets;  -- baseline : stock Mikmon seedé

  SELECT id INTO plan_5h FROM public.plans WHERE offer_id = '5-HEURES' AND version = 1;
  IF plan_5h IS NULL THEN
    RAISE EXCEPTION 'rls: seed 0008 absent (plan 5-HEURES introuvable)';
  END IF;

  INSERT INTO public.customers (id, phone, auth_user_id) VALUES (cust_a, '+22999999901', uid_a);
  INSERT INTO public.customers (id, phone, auth_user_id) VALUES (cust_b, '+22999999902', uid_b);
  INSERT INTO public.orders (id, customer_id, plan_id, plan_snapshot, idempotency_key)
  VALUES (ord_a, cust_a, plan_5h, '{}'::jsonb, 'rls-test-order-a');
  INSERT INTO public.ticket_batches (id, source, quantity) VALUES (batch_f, 'backend', 1);
  INSERT INTO public.tickets (id, batch_id, code_hash, plan_id, db_state, order_id, sold_at)
  VALUES (tick_f, batch_f, 'rls-test-hash', plan_5h, 'SOLD', ord_a, now());

  -- ── anon : catalogue seulement ────────────────────────────────────────────
  SET ROLE anon;
    SELECT count(*) INTO n FROM public.customers;
    IF n <> 0 THEN RAISE EXCEPTION 'rls: anon voit % customers (attendu 0)', n; END IF;
    SELECT count(*) INTO n FROM public.orders;
    IF n <> 0 THEN RAISE EXCEPTION 'rls: anon voit % orders (attendu 0)', n; END IF;
    SELECT count(*) INTO n FROM public.audit_logs;
    IF n <> 0 THEN RAISE EXCEPTION 'rls: anon voit % audit_logs (attendu 0)', n; END IF;
    SELECT count(*) INTO n FROM public.plans;
    IF n <> 6 THEN RAISE EXCEPTION 'rls: anon voit % plans (attendu 6)', n; END IF;
    SELECT count(*) INTO n FROM public.settings;
    IF n <> 0 THEN RAISE EXCEPTION 'rls: anon voit % lignes settings (attendu 0, table vide)', n; END IF;
  RESET ROLE;

  -- ── authenticated A : own rows uniquement ────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', uid_a::text, false);
  SET ROLE authenticated;
    SELECT count(*) INTO n FROM public.customers;
    IF n <> 1 THEN RAISE EXCEPTION 'rls: authenticated A voit % customers (attendu 1)', n; END IF;
    SELECT count(*) INTO n FROM public.orders;
    IF n <> 1 THEN RAISE EXCEPTION 'rls: authenticated A voit % orders (attendu 1)', n; END IF;
    SELECT count(*) INTO n FROM public.tickets;
    IF n <> 1 THEN RAISE EXCEPTION 'rls: authenticated A voit % tickets (attendu 1)', n; END IF;
    SELECT count(*) INTO n FROM public.plans;
    IF n <> 6 THEN RAISE EXCEPTION 'rls: authenticated A voit % plans (attendu 6)', n; END IF;
    -- écriture interdite (42501)
    BEGIN
      INSERT INTO public.customers (phone) VALUES ('+22900000099');
      RAISE EXCEPTION 'rls: INSERT authenticated aurait dû être refusé';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
    BEGIN
      UPDATE public.customers SET phone = '+22900000098';
      RAISE EXCEPTION 'rls: UPDATE authenticated aurait dû être refusé';
    EXCEPTION WHEN SQLSTATE '42501' THEN NULL;
    END;
  RESET ROLE;

  -- ── authenticated B : isolation stricte ──────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', uid_b::text, false);
  SET ROLE authenticated;
    SELECT count(*) INTO n FROM public.customers;
    IF n <> 1 THEN RAISE EXCEPTION 'rls: authenticated B voit % customers (attendu 1 = le sien)', n; END IF;
    SELECT count(*) INTO n FROM public.orders;
    IF n <> 0 THEN RAISE EXCEPTION 'rls: authenticated B voit % orders de A (attendu 0)', n; END IF;
    SELECT count(*) INTO n FROM public.tickets;
    IF n <> 0 THEN RAISE EXCEPTION 'rls: authenticated B voit % tickets de A (attendu 0)', n; END IF;
  RESET ROLE;

  -- ── service_role : full (BYPASSRLS) ───────────────────────────────────────
  PERFORM set_config('request.jwt.claim.sub', '', false);
  SET ROLE service_role;
    SELECT count(*) INTO n FROM public.customers;
    IF n <> 2 THEN RAISE EXCEPTION 'rls: service_role voit % customers (attendu 2)', n; END IF;
    SELECT count(*) INTO n FROM public.tickets;
    IF n <> n_stock + 1 THEN RAISE EXCEPTION 'rls: service_role voit % tickets (attendu % = stock + fixture)', n, n_stock + 1; END IF;
    SELECT count(*) INTO n FROM public.mikrotik_sync;   -- table ops : accessible backend
    IF n <> 0 THEN RAISE EXCEPTION 'rls: service_role mikrotik_sync inattendu (% )', n; END IF;
  RESET ROLE;

  -- ── Nettoyage des fixtures (superuser, ordre FK) : le test ne doit rien
  -- laisser derrière lui (sinon down/0008 échoue sur la FK orders→plans).
  DELETE FROM public.access_sessions WHERE ticket_id = tick_f;
  DELETE FROM public.tickets         WHERE id = tick_f;
  DELETE FROM public.orders          WHERE id = ord_a;
  DELETE FROM public.ticket_batches  WHERE id = batch_f;
  DELETE FROM public.customers       WHERE id IN (cust_a, cust_b);

  RAISE NOTICE 'rls OK : matrice anon / authenticated (own rows + isolation + écriture refusée) / service_role vérifiée';
END $do$;
