# IMP-32 — Tickets, lots et import

## PROBLÈME

L’inventaire admin ne distinguait pas DIGITAL/PHYSICAL, les codes importés n’avaient pas de
parcours sûr (aucun import transactionnel, aucune idempotence), la révélation d’un code n’était
pas contrôlée pour l’admin (seule la révélation client existait, IMP-26 UX6), les lots n’exposaient
aucun compteur opérationnel, et le stock seedé IMP-06 n’était jamais réconcilié avec son manifeste.

## CAUSE

- `ticket_batches` n’avait ni `destination` ni clé d’idempotence d’import (migration 0015) ;
- `allocateTicketForOrder` sélectionnait les tickets par état seul — un ticket PHYSICAL aurait
  pu être alloué à une vente digitale (invariant doc 09 §28) ;
- aucune route d’import : pas de prévisualisation, pas de transaction tout-ou-rien, pas de rejeu
  idempotent (doc 09 §33-34) ;
- les listes admin ne projetaient ni destination ni dates de réservation ; le détail d’un lot ne
  comptait rien ;
- le manifeste `docs/infrastructure/stock-manifest-2026-09-17.md` n’était pas codé côté backend.

## IMPACT

Sans correction : risque d’attribution de voucher papier à un achat en ligne, impossibilité
d’importer un stock codes de façon traçable et sans doublon, aucun moyen d’auditer la révélation
d’un code par l’admin, et aucune détection d’écart entre le stock déclaré (660 tickets) et le
stock réellement présent en base.

## SOLUTION

### Migration `0015_ticket_batch_destination_import` (+ down)

- `ticket_batches.destination` : `DIGITAL` (défaut = tout le stock existant) ou `PHYSICAL`,
  contrainte CHECK ; `ticket_batches.idempotency_key` : unique partiel (les lots générés restent NULL).
- Pas de nouvelle table : 17 tables, gardes et RLS inchangées (le lot hérite des policies 0007).

### Repo (`repo.ts` + parité `fake-repo.ts`)

- **Garde de destination** — `allocateTicketForOrder` ne sélectionne que
  `db_state = 'AVAILABLE' AND b.destination = 'DIGITAL'` (doc 09 §28). Leçon 26/09 : la clause
  `FOR UPDATE OF t SKIP LOCKED` verrouille UNIQUEMENT la ligne ticket ; verrouiller aussi la ligne
  lot (JOIN) faisait `SKIP LOCKED` les allocations concurrentes sur le même lot (régression du
  test CONCURRENCE IMP-15).
- **`reserved_at`** remis à jour à la réservation (vente) ; les listes admin exposent
  `reserved_at`, `created_at`, `mikrotik_comment`, `destination`, `revealable`.
- **5 nouvelles méthodes** (contrat `BackendRepo`, parité PG/Fake) :
  - `previewTicketImport` — lecture seule : format `^[0-9a-z]{8}$`, doublons dans le payload,
    doublons en base (sha256), plan actif ; le résultat ne porte que des hints `xx••••` ;
  - `executeTicketImport` — transaction tout-ou-rien : batch `mikmon-manual` + tickets
    (`code_hash` sha256, `code_cipher` scellé AES-256-GCM via `TICKET_VAULT_KEY`), aucune
    opération MikroTik ; **aucun import partiel silencieux** (1 invalide → 0 écriture, message
    explicite « N analysées / V valides / I invalides ») ; rejeu avec la même clé → même lot,
    aucune réécriture ;
  - `getAdminTicketForReveal` — ticket + destination du lot + présence du sceau ;
  - `getTicketInventoryBreakdown` — inventaire par offre × destination (états + `reserved_stale`,
    TTL 15 min D11) ;
  - `getTicketReconciliation` — compte les lots `mikmon-manual` par offre vs manifeste
    `STOCK_MANIFEST_IMP06` (B1-B6, 660) → OK / DIVERGENT / MISSING.
- **`getTicketForReveal`** (client) et **`getAdminOrderById`** complétés (destination, sceau,
  dates) sans jamais projeter de secret.

### Routes (`app.ts`)

- `GET /admin/tickets` — projection sans secret + filtres `destination` (DIGITAL/PHYSICAL),
  états, dates, recherche (doc 09 §20) ;
- `GET /admin/tickets/batches` (route canonique doc 09 §29 ; `/admin/batches` reste alias) —
  7 compteurs par lot calculés côté serveur (doc 09 §30) + destination/offre/empreinte manifeste ;
- `GET /admin/tickets/reconciliation` — lecture seule, manifeste IMP-06 (doc 09 §35) ;
- `GET /admin/tickets/stats` — enrichi : `reserved_stale` par offre/totaux + `by_destination` ;
- `POST /admin/tickets/import/preview` — lecture seule, sans audit (pas d’effet) ;
- `POST /admin/tickets/import` — `Idempotency-Key` obligatoire (8-200 car.), **503 si
  `TICKET_VAULT_KEY` absente** (les codes importés doivent être scellés, jamais en clair),
  422 `problem+json` avec le compte exact si rejet (audit `admin_ticket_import_rejected`),
  201 création / 200 rejeu (audit `admin_ticket_batch_imported`) ;
- `POST /admin/tickets/:id/reveal` — révélation admin contrôlée (doc 09 §20) : raison 20-1000
  caractères obligatoire, 503 sans coffre, 404 inconnu, **409 lot sans sceau** (voucher papier),
  500 sceau illisible, 200 code — audit systématique `admin_ticket_code_revealed` /
  `admin_ticket_reveal_denied` **sans jamais journaliser le code**.

### Frontend (`Admin.tsx`, `api.ts`, `styles.css`)

- Filtre Destination sur les listes tickets/lots ; badges DIGITAL/PHYSICAL ;
- Tableau « Stock par plan × destination » + colonne `reserved_stale` (surlignée si > 0) ;
- Bouton **Révéler** (uniquement si `revealable`) : raison obligatoire, code affiché une seule
  fois dans un encadré, message « audité » ;
- Onglet Lots : compteurs par lot + panneau **Importer un lot de codes** :
  preview → affichage verbatim du compte (valides/invalides + motifs) → confirmation avec
  `Idempotency-Key` fraîche par tentative (anti-double-clic) ; le résultat serveur (201/200/422)
  est affiché tel quel ;
- Onglet Réconciliation : carte « Stock vs manifeste IMP-06 » (attendu/constaté par lot, statut).

## FICHIERS

- `supabase/migrations/0015_ticket_batch_destination_import.sql` + `supabase/down/0015_….sql`
  — destination + idempotence d’import (réversibles).
- `apps/backend/src/stock-manifest.ts` — `STOCK_MANIFEST_IMP06` codé (source unique :
  `docs/infrastructure/stock-manifest-2026-09-17.md` §1).
- `apps/backend/src/repo.ts` — contrat, garde d’allocation, 5 méthodes PG, listes réécrites,
  détails enrichis sans secret.
- `apps/backend/src/fake-repo.ts` — parité mémoire complète (import, révélation, breakdown,
  réconciliation, compteurs, garde).
- `apps/backend/src/schemas.ts` — `destination` dans la query admin ; `ticketImportBodySchema`
  (1-200 codes stricts) ; `ticketRevealBodySchema` (raison 20-1000).
- `apps/backend/src/app.ts` — routes ci-dessus + stats enrichis.
- `apps/backend/src/admin.test.ts` — attentes stats alignées sur le contrat enrichi.
- `apps/backend/src/admin-tickets.test.ts` — **nouveau** : 14 tests FakeRepo (garde PHYSICAL,
  liste sans secret, compteurs, import preview/idempotence/rejet, révélation 200/409/404/503,
  réconciliation 0/660→OK→DIVERGENT, stats enrichis).
- `apps/backend/src/repo.pg.test.ts` — describe **IMP-32** (4 tests PostgreSQL réel) : garde
  PHYSICAL, réconciliation 660/660 + stats + liste filtrée, révélation 409/200/audit,
  import 201/200/422.
- `apps/frontend/src/api.ts`, `apps/frontend/src/pages/Admin.tsx`, `apps/frontend/src/styles.css`
  — contrat UI IMP-32.
- `apps/backend/src/server.ts`, `docs/field-guides/GUIDE-08/09/10`,
  `docs/IMPLEMENTATION_MASTER_PLAN.md` — compteurs 15 migrations.

## TEST

- `npm run typecheck` : OK (4 workspaces).
- `bash tools/db-migrate.sh down / up / smoke` : **OK** (15 migrations, 6 batches seedés, 660 tickets hashés).
- `npm test -w @dg/backend` sur base neuve : **230/230** (dont 54 tests PostgreSQL réel,
  dont les 4 tests IMP-32).
- `npm test` (4 workspaces) : backend 230, connector 46, frontend 43, shared 45 — OK.

## LEÇONS

1. `FOR UPDATE SKIP LOCKED` sur un JOIN verrouille **toutes** les lignes des tables jointes :
   utiliser `FOR UPDATE OF <table>` quand seul le ticket doit être exclu des concurrents.
2. Un import de codes est un flux **preview → validation → transaction** : la preview ne porte
   que des hints, la validation est refaite dans la transaction (jamais la preview), et le rejet
   doit être explicite et chiffré (compte exact dans le `detail` du problème).
3. La révélation est une opération : raison minimale, audit systématique, et le code n’existe que
   dans la réponse unique — jamais dans `audit_logs`, jamais dans les listes, jamais dans le
   navigateur après affichage.
4. Les tests d’inventaire sur PostgreSQL réel doivent **parquer** le stock mikmon seedé
   (`parkMikmonStock`) pour que l’allocation reste déterministe, et les tests d’import/
   réconciliation s’ordonner avant toute création de lot `mikmon-manual` de test.
