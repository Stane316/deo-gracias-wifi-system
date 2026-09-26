# IMP-31 — Dashboard opérationnel : commandes, timeline et correction

## PROBLÈME

Le Dashboard admin pouvait déjà paginer quelques listes et afficher un détail minimal, mais il ne permettait pas de reconstruire le parcours commande → paiement → ticket → synchronisation. La procédure de correction exceptionnelle n’était pas explicitement modélisée et les filtres temporels/offre n’étaient pas transmis au serveur.

## CAUSE

- le détail ne projetait que le dernier paiement et le dernier ticket ;
- aucune projection de timeline ne combinait les horodatages métier et `audit_logs` ;
- `AdminListOptions` ne portait que `search` et `state` ;
- aucune demande de correction idempotente et persistée n’existait.

## IMPACT

L’opérateur ne disposait pas d’une chronologie vérifiable pour distinguer paiement confirmé/échoué, ticket attribué/délivré/utilisé et synchronisation réussie/échouée. Une correction pouvait être interprétée comme une mutation directe d’un paiement, ce qui est interdit.

## SOLUTION

- `AdminOrderDetail.timeline` est reconstruite côté serveur à partir des timestamps commande/paiement/ticket/session et des changements d’état append-only de `audit_logs`.
- La projection timeline ne sélectionne aucun payload, code clair, token, mot de passe, signature webhook ou credential MikroTik.
- Les listes acceptent désormais `offer_id`, `payment_state`, `ticket_state`, `from`, `to`, en plus de la recherche, de l’état et de la pagination.
- `POST /admin/orders/:id/correction-requests` crée seulement une demande `OPEN`, avec `reason` de 20 à 1000 caractères, `Idempotency-Key` obligatoire et actions limitées à `REVIEW_PAYMENT`, `REVIEW_ALLOCATION` ou `REVIEW_DELIVERY`.
- La route exige `SUPER_ADMIN`, vérifie l’UUID et l’existence de la commande, enregistre une entrée `admin_correction_requested` dans `audit_logs` et ne modifie ni paiement ni commande. Le rejeu idempotent renvoie la demande existante sans nouvel audit.
- Aucun endpoint ni bouton « marquer comme payé » n’a été ajouté.

## FICHIERS

- `apps/backend/src/repo.ts` — contrats, projections SQL PostgreSQL, timeline et demande idempotente.
- `apps/backend/src/fake-repo.ts` — parité FakeRepo pour tests unitaires.
- `apps/backend/src/schemas.ts` — filtres stricts et payload de correction.
- `apps/backend/src/app.ts` — routes détail, filtres et correction protégée.
- `apps/backend/src/admin.test.ts` — tests timeline, filtres, permission SUPER_ADMIN, IDOR, audit et idempotence.
- `apps/frontend/src/api.ts`, `apps/frontend/src/pages/Admin.tsx`, `apps/frontend/src/styles.css` — contrat UI, filtres dates/offre, détail et timeline masquée par défaut.
- `supabase/migrations/0014_admin_correction_requests.sql` et `supabase/down/0014_admin_correction_requests.sql` — persistance idempotente/RLS de la demande exceptionnelle.
- `tools/db-smoke.sql`, `apps/backend/src/repo.pg.test.ts`, guides d’exécution — compteurs de schéma mis à jour pour 17 tables et 13 triggers `updated_at`.

## TEST

- `npm test -- --run` : OK dans le workspace ; 162 tests backend, 50 tests PostgreSQL ignorés faute de base, tests Connector/frontend/shared passés.
- `npm run typecheck && npm run build` : OK.
- PostgreSQL réel, smoke SQL, RLS et migration `0014` : non exécutés dans cette session ; ils restent à exécuter sur une base fournie et ne sont pas présentés comme validés.
