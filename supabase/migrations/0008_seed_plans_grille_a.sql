-- IMP-10 | 0008_seed_plans_grille_a
-- Seed du catalogue = GRILLE A OFFICIELLE, miroir exact de packages/shared OFFERS
-- (source unique de vérité). Toute dérive entre ce fichier et le code est un
-- échec de CI : test normatif packages/shared/src/seed-sync.test.ts.
-- active_from fixé (timestamp constant) => rollback déterministe (down/0008).
-- version = 1 : première génération du catalogue ; toute évolution future =
-- nouvelle version (docs 06 §08), jamais d'UPDATE destructif.

INSERT INTO public.plans (id, offer_id, price_fcfa, access_hours, validity_hours, mikrotik_profile, limit_uptime, version, active_from)
VALUES (gen_random_uuid(), '5-HEURES', 100, 5, 24, '5-HEURES', '05:00:00', 1, '2026-09-17 00:00:00+00');

INSERT INTO public.plans (id, offer_id, price_fcfa, access_hours, validity_hours, mikrotik_profile, limit_uptime, version, active_from)
VALUES (gen_random_uuid(), '12-HEURES', 200, 12, 24, '12-HEURES', '12:00:00', 1, '2026-09-17 00:00:00+00');

INSERT INTO public.plans (id, offer_id, price_fcfa, access_hours, validity_hours, mikrotik_profile, limit_uptime, version, active_from)
VALUES (gen_random_uuid(), '24-HEURES', 300, 24, 48, '24-HEURES', '1d00:00:00', 1, '2026-09-17 00:00:00+00');

INSERT INTO public.plans (id, offer_id, price_fcfa, access_hours, validity_hours, mikrotik_profile, limit_uptime, version, active_from)
VALUES (gen_random_uuid(), '72-HEURES', 500, 72, 120, '72-HEURES', '3d00:00:00', 1, '2026-09-17 00:00:00+00');

INSERT INTO public.plans (id, offer_id, price_fcfa, access_hours, validity_hours, mikrotik_profile, limit_uptime, version, active_from)
VALUES (gen_random_uuid(), '1-SEMAINE', 1000, 168, 240, '1-SEMAINE', '7d00:00:00', 1, '2026-09-17 00:00:00+00');

INSERT INTO public.plans (id, offer_id, price_fcfa, access_hours, validity_hours, mikrotik_profile, limit_uptime, version, active_from)
VALUES (gen_random_uuid(), '1-MOIS', 4000, 720, 960, '1-MOIS', '40d00:00:00', 1, '2026-09-17 00:00:00+00');

-- Garde-fou Grille A : aucune offre à 5 000 FCFA ne doit jamais exister en v1.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.plans WHERE version = 1 AND price_fcfa = 5000) THEN
    RAISE EXCEPTION 'seed: offre 5000 FCFA interdite (Grille A, docs 03/05)';
  END IF;
END $$;
