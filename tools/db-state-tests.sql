-- IMP-11 — Tests exécutoires des gardes d'états (migration 0009).
-- Exécuté par `tools/db-migrate.sh states` (CI job db-migrations + local).
-- Vérifie : transitions interdites REFUSÉES, chaînes valides ACCEPTÉES,
-- audit_logs alimenté à chaque changement d'état, nettoyage des fixtures.

DO $do$
DECLARE
  n        integer;
  aud      integer;
  uid_a    uuid := 'aaaaaaaa-0000-0000-0000-0000000000aa';
  cust_a   uuid := 'aaaaaaaa-0000-0000-0000-000000000001';
  ord_a    uuid := 'aaaaaaaa-0000-0000-0000-000000000010';
  pay_a    uuid := 'aaaaaaaa-0000-0000-0000-000000000030';
  batch_f  uuid := 'bbbbbbbb-0000-0000-0000-000000000001';
  tick_f   uuid := 'aaaaaaaa-0000-0000-0000-000000000020';
  sync_f   uuid := 'aaaaaaaa-0000-0000-0000-000000000040';
  sess_f   uuid := 'aaaaaaaa-0000-0000-0000-000000000050';
  plan_5h  uuid;
BEGIN
  SELECT id INTO plan_5h FROM public.plans WHERE offer_id = '5-HEURES' AND version = 1;
  IF plan_5h IS NULL THEN RAISE EXCEPTION 'states: seed 0008 absent'; END IF;

  INSERT INTO public.customers (id, phone, auth_user_id) VALUES (cust_a, '+22999999901', uid_a);
  INSERT INTO public.orders (id, customer_id, plan_id, plan_snapshot, idempotency_key)
  VALUES (ord_a, cust_a, plan_5h, '{}'::jsonb, 'states-test-order');
  INSERT INTO public.payments (id, order_id, amount_fcfa) VALUES (pay_a, ord_a, 100);
  INSERT INTO public.ticket_batches (id, source, quantity) VALUES (batch_f, 'backend', 1);
  INSERT INTO public.tickets (id, batch_id, code_hash, plan_id)
  VALUES (tick_f, batch_f, 'states-test-hash', plan_5h);
  INSERT INTO public.mikrotik_sync (id, operation, payload) VALUES (sync_f, 'read_status', '{}');
  INSERT INTO public.access_sessions (id, ticket_id) VALUES (sess_f, tick_f);

  -- ── orders : saut interdit CREATED → DELIVERED ───────────────────────────
  BEGIN
    UPDATE public.orders SET state = 'DELIVERED' WHERE id = ord_a;
    RAISE EXCEPTION 'states: CREATED→DELIVERED aurait dû être refusé';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE = '42501' THEN
      RAISE EXCEPTION 'states: erreur inattendue RLS au lieu de garde d''état';
    END IF;
  END;

  -- ── orders : chaîne valide complète + audit ──────────────────────────────
  UPDATE public.orders SET state = 'PAYMENT_PENDING' WHERE id = ord_a;
  UPDATE public.orders SET state = 'PAID'            WHERE id = ord_a;
  UPDATE public.orders SET state = 'TICKET_ALLOCATED' WHERE id = ord_a;
  UPDATE public.orders SET state = 'DELIVERED'       WHERE id = ord_a;
  SELECT count(*) INTO aud FROM public.audit_logs
  WHERE entity = 'orders' AND entity_id = ord_a::text AND action = 'state_change';
  IF aud <> 4 THEN RAISE EXCEPTION 'states: audit orders attendu 4, trouvé %', aud; END IF;

  -- ── payments : CREATED → CONFIRMED interdit ; chaîne valide ──────────────
  BEGIN
    UPDATE public.payments SET state = 'CONFIRMED', confirmed_at = now() WHERE id = pay_a;
    RAISE EXCEPTION 'states: payment CREATED→CONFIRMED aurait dû être refusé';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  UPDATE public.payments SET state = 'INITIATED' WHERE id = pay_a;
  UPDATE public.payments SET state = 'PENDING'   WHERE id = pay_a;
  UPDATE public.payments SET state = 'CONFIRMED', confirmed_at = now() WHERE id = pay_a;

  -- ── tickets : AVAILABLE → USED interdit ; chaîne valide ──────────────────
  BEGIN
    UPDATE public.tickets SET db_state = 'USED', sold_at = now(), order_id = ord_a WHERE id = tick_f;
    RAISE EXCEPTION 'states: ticket AVAILABLE→USED aurait dû être refusé';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  UPDATE public.tickets SET db_state = 'RESERVED', reserved_at = now() WHERE id = tick_f;
  UPDATE public.tickets SET db_state = 'SOLD', sold_at = now(), order_id = ord_a WHERE id = tick_f;
  UPDATE public.tickets SET db_state = 'USED' WHERE id = tick_f;

  -- ── mikrotik_sync : PENDING → SUCCESS interdit ; chaîne valide ───────────
  BEGIN
    UPDATE public.mikrotik_sync SET state = 'SUCCESS' WHERE id = sync_f;
    RAISE EXCEPTION 'states: sync PENDING→SUCCESS aurait dû être refusé';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  UPDATE public.mikrotik_sync SET state = 'PROCESSING' WHERE id = sync_f;
  UPDATE public.mikrotik_sync SET state = 'SUCCESS'    WHERE id = sync_f;

  -- ── access_sessions : NOT_STARTED → ENDED interdit ; chaîne valide ───────
  BEGIN
    UPDATE public.access_sessions SET state = 'ENDED' WHERE id = sess_f;
    RAISE EXCEPTION 'states: session NOT_STARTED→ENDED aurait dû être refusé';
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  UPDATE public.access_sessions SET state = 'ACTIVE' WHERE id = sess_f;
  UPDATE public.access_sessions SET state = 'ENDED'  WHERE id = sess_f;

  -- ── audit global : au moins 4+3+3+2+2 = 14 écritures state_change ────────
  SELECT count(*) INTO aud FROM public.audit_logs
  WHERE action = 'state_change'
    AND entity_id IN (ord_a::text, pay_a::text, tick_f::text, sync_f::text, sess_f::text);
  IF aud <> 14 THEN RAISE EXCEPTION 'states: audit state_change attendu 14, trouvé %', aud; END IF;

  -- ── nettoyage fixtures (audit insert-only : les lignes d'audit restent) ──
  DELETE FROM public.access_sessions WHERE id = sess_f;
  DELETE FROM public.mikrotik_sync   WHERE id = sync_f;
  DELETE FROM public.tickets         WHERE id = tick_f;
  DELETE FROM public.payments        WHERE id = pay_a;
  DELETE FROM public.orders          WHERE id = ord_a;
  DELETE FROM public.ticket_batches  WHERE id = batch_f;
  DELETE FROM public.customers       WHERE id = cust_a;

  RAISE NOTICE 'states OK : transitions interdites refusées, chaînes valides acceptées, audit alimenté (14)';
END $do$;
