# BLUEPRINT BACKEND — PHASE 1 (IMP-09 → IMP-21)

> **Statut** : PROPOSITION opérationnelle (IMP-08, 17/09/2026) — à valider par le propriétaire.
> **Portée** : séquence distante backend/plateforme, du provisioning Supabase jusqu'au
> Connector read-only. Les opérations physiques (IMP-23/24/38/39/40) sont hors périmètre (lot W2).
> **Hiérarchie des normes** (en cas de conflit) :
> 1. Décisions propriétaires (`docs/decisions/DECISIONS-*.md`, Grille A docs 03/05)
> 2. Documents validés `docs/06_DATA_BACKEND.md` (entités, machines d'états) et `docs/08_WEB_APPLICATION.md`
> 3. Contrat routeur `docs/infrastructure/mikhmon-contract.md` + audit (`evidence/EVIDENCE-IMP01-*`)
> 4. Le présent blueprint (détail d'exécution ; chaque IMP garde son pre-topo avant code)

---

## 1. Prérequis déjà validés (rappels, non renégociables ici)

| Élément | Valeur validée | Source |
|---|---|---|
| Base de données | **Supabase** (Postgres + Auth + Storage) | décision propriétaire |
| Stack | npm workspaces, TypeScript strict, Fastify, React | ADR 0001 |
| Hébergement/données | voir ADR 0002 | ADR 0002 |
| Paiement | FedaPay (1,8 %), confirmation **webhook uniquement** | docs 03/06/08 |
| Grille tarifaire | **Grille A** encodée dans `packages/shared` (6 offres, tests verts) | IMP-07 |
| Pont routeur | Connector sortant (tunnel), unique voie d'écriture MikroTik ; API LAN-only depuis IMP-03 | docs 07/08, OD-1 |
| Stock digital existant | 660 tickets Mikmon (secours/transition ; recalibré après IMP-18/19) | manifeste IMP-06, D5/N4 |
| Budget | dépenses maximales limitées, si possible nulles → **free tiers en priorité** | owner 17/09 |

## 2. Architecture cible Phase 1

```text
Client (Wi-Fi du site)                Cloud                          LAN Déo Gracias
─────────────────────                ─────                          ───────────────
Navigateur ──HTTPS──▶ Frontend (React, hébergé statique — ADR 0001/0002)
                          │
                          ▼
                     API Backend (Fastify)
                          │  ┌──────────────────────────┐
                          ├──▶ Supabase : Postgres + RLS │
                          │  │ Auth, Storage (reçus)    │
                          │  └──────────────────────────┘
                          │
        FedaPay ──webhook signé──▶ /webhooks/fedapay (idempotent)
                          │
                          ▼
                     File mikrotik_sync (PENDING)
                          │
                          ▼   (sortant, tunnel — jamais d'entrée LAN)
                     Connector (hôte W2) ──API RouterOS──▶ RB951 (lecture Phase 1 ;
                                                            écriture après IMP-21/23)
```

**Phase 1 = le backend tourne entièrement sans le Connector** : les tables, l'API, les
webhooks et les workers sont livrables et testables depuis Calavi ; le Connector n'entre
en jeu qu'en IMP-21 (contrat + dry-run) puis IMP-23 (install physique, W2).

## 3. Modèle de données Supabase

Entités conformes à `docs/06_DATA_BACKEND.md` §04–§45. Conventions : `uuid` PK par défaut,
`created_at/updated_at timestamptz`, montants en **entiers FCFA** (doc 06 §48), soft-delete
interdit sur `audit_logs`/`payment_events` (immutabilité, doc 06 §41).

### 3.1 Tables

| Table | Rôle | Colonnes clés (au-delà des conventions) |
|---|---|---|
| `customers` | Clients (doc 06 §05–06) | `id`, `phone` (unique, identifiant principal), `auth_user_id` nullable, `first_seen_at` |
| `plans` | Catalogue versionné (doc 06 §07–08) | `id`, `offer_id` (référence `packages/shared` OFFERS), `price_fcfa`, `access_hours`, `validity_hours`, `mikrotik_profile`, `limit_uptime`, `version`, `active_from`, `active_to` nullable — **jamais de durée déduite du nom de profil** (doc 09 §36) |
| `orders` | Commandes (doc 06 §10–13) | `id`, `customer_id`, `plan_id`, `plan_snapshot jsonb` (prix+durées figés, §09), `state`, `idempotency_key` unique, `currency='XOF'` |
| `payments` | Tentatives FedaPay (doc 06 §14–17) | `id`, `order_id`, `provider='fedapay'`, `provider_ref`, `amount_fcfa`, `state`, `confirmed_at` |
| `payment_events` | Journal webhook brut (doc 06 §18–21) | `id`, `payment_id`, `provider_event_id` **unique** (idempotence), `payload jsonb`, `signature_ok bool`, `received_at` — insert-only |
| `tickets` | Stock digital (doc 06 §26–31) | `id`, `batch_id`, `code_hash` (jamais le code en clair — INC-01/INC-04), `code_prefix_hint`, `plan_id`, `router_state` (voir §4), `db_state` (voir §4), `order_id` nullable, `reserved_at`, `sold_at`, `mikrotik_comment` (format `vc-<seq>-<mm.dd.yy>-`) |
| `ticket_batches` | Lots (Mikmon 17/09, futur backend IMP-18/19) | `id`, `source` (`mikmon-manual` \| `backend`), `quantity`, `generated_at`, `manifest_sha256` nullable, `notes` |
| `mikrotik_sync` | File d'ordres vers le routeur (doc 06 §33–36) | `id`, `operation` (`read_status` \| `create_ticket` \| `disable_ticket` …), `payload jsonb`, `state`, `attempts`, `next_retry_at`, `locked_by`, `result jsonb` |
| `access_sessions` | Sessions (doc 06 §37–38) | `id`, `ticket_id`, `mac`, `ip`, `bytes_in/out`, `uptime_s`, `state`, `started_at`, `ended_at` — alimentée par le Connector (W2), vide en Phase 1 |
| `audit_logs` | Audit immutable (doc 06 §39–41) | `id`, `actor` (`system` \| `admin:<id>` \| `connector`), `action`, `entity`, `entity_id`, `before/after jsonb`, `at` — insert-only, RLS deny-all en update/delete |
| `incidents` | Incidents (doc 06 §42–43) | `id`, `type`, `severity`, `state`, `opened_at`, `closed_at`, `details jsonb` |
| `alerts` | Alertes réconciliation/seuils (INC-03, IMP-24) | `id`, `rule`, `payload jsonb`, `severity`, `acknowledged_at`, `created_at` |
| `reconciliation_runs` | Runs de réconciliation tickets ↔ routeur | `id`, `started_at`, `finished_at`, `router_total_expected` (≈ 4 815 au 17/09 — manifeste), `router_total_seen`, `diff jsonb`, `status` (`OK` \| `MISMATCH`) |
| `settings` | Clé/valeur opératoire (seuils d'alerte, feature flags) | `key` PK, `value jsonb`, `updated_by`, `updated_at` |

### 3.2 Migrations

- Outil : **Supabase CLI** (`supabase/migrations/*.sql`, versionnées dans le repo, appliquées
  via `supabase db push` sur le projet cloud) — migrations SQL pures, aucune ORM en Phase 1
  (PostgREST + `pg` natif dans Fastify ; ADR 0001).
- Ordre : `0001_extensions` (uuid-ossp/pgcrypto) → `0002_customers_plans` → `0003_orders_payments`
  → `0004_tickets_batches` → `0005_mikrotik_sync_sessions` → `0006_audit_incidents_alerts`
  → `0007_seed_plans_grille_a` (seed généré **depuis `packages/shared` OFFERS**, pas recopié à
  la main) → `0008_seed_batch_mikmon_20260917` (660 tickets, codes hashés ; import via script
  `tools/` lisant le dump au coffre — jamais via le chat/git, cf. INC-01/INC-04).
- Chaque migration est réversible (`down` documenté) et testée en CI sur un Postgres éphémère.

> **AMENDEMENT IMP-09 (17/09/2026)** : numérotation finale arrêtée à l'implémentation :
> `0001`–`0006` = schéma (IMP-09, livré) ; `0007_rls_policies` + `0008_seed_plans_grille_a`
> (IMP-10) ; `0009_seed_stock_mikmon` (IMP-16). Raison : les politiques RLS doivent protéger
> le schéma AVANT qu'un seed n'existe ; les seeds sont donc décalés de +1/+2 par rapport à
> la numérotation initiale de ce §3.2. Amendement visible, non silencieux.
**AMENDEMENT n°2 (IMP-11, 17/09/2026)** : `0009_state_guards` livré par IMP-11 (gardes de
> transitions + audit automatique) ; le seed stock Mikmon est renuméroté `0010` (IMP-16).
> Raison : l'ordre des IMP place les gardes d'états avant l'import du stock.
> **LIVRAISON IMP-10 (17/09/2026)** : `0007_rls_policies` + `0008_seed_plans_grille_a` livrés et
> testés (matrice RLS par rôles via `tools/db-migrate.sh rls` en CI ; test normatif seed-sync
> dans `packages/shared`). Prochaine migration : `0009_seed_stock_mikmon` (IMP-16).

### 3.3 RLS (Row Level Security)

Principe : **le backend est le seul écrivain métier** (role `service_role`, clé côté serveur).
RLS activée sur toutes les tables.

| Table | `anon` | `authenticated` (client) | `service_role` |
|---|---|---|---|
| `customers`, `orders`, `payments`, `tickets`, `access_sessions` | deny | select **own rows only** (via `auth.uid()` → `customers.auth_user_id`) | full |
| `plans`, `settings` | select (catalogue public) | select | full |
| `payment_events`, `audit_logs` | deny | deny | insert + select (jamais update/delete) |
| `mikrotik_sync`, `reconciliation_runs`, `alerts`, `incidents`, `ticket_batches` | deny | deny | full |

- Fonctions sensibles (allocation atomique de ticket, doc 06 §30) implémentées en
  **fonctions SQL `SECURITY DEFINER`** avec `FOR UPDATE SKIP LOCKED` — jamais en logique API.
- Les codes de tickets ne quittent la base qu'en `code_hash` ; l'affichage client d'un code
  acheté se fait via une fonction dédiée (select one-shot sur la ligne possédée).

## 4. Machines d'états (alignement `packages/shared`)

À ajouter dans `packages/shared/src/index.ts` (mêmes constantes, mêmes tests normatifs) :

```text
ORDER_STATE    : CREATED → PAYMENT_PENDING → PAID → TICKET_ALLOCATED → DELIVERED
                 branches : PAYMENT_PENDING → {FAILED, EXPIRED, CANCELLED} ; PAID → REFUNDED
PAYMENT_STATE  : CREATED → INITIATED → PENDING → CONFIRMED
                 branches : PENDING → {FAILED, CANCELLED, EXPIRED} ; CONFIRMED → REFUNDED
TICKET_DB_STATE: AVAILABLE → RESERVED → SOLD → USED
                 branches : AVAILABLE → EXPIRED ; RESERVED → RELEASED ; SOLD → REFUNDED
SYNC_STATE     : PENDING → PROCESSING → SUCCESS ; PROCESSING → FAILED → RETRY → PROCESSING ;
                 terminal technique : BLOCKED / MANUAL_REVIEW
SESSION_STATE  : NOT_STARTED → ACTIVE → ENDED ; branches : EXPIRED / DISCONNECTED / ERROR
```

(source : doc 06 §11, §15, §27, §34, §38)

`TICKET_STATES` existant (`UNUSED`, `ACTIVE`, `EXPIRED_REMOVED`, `ADMIN_FREE_LEGACY`) devient
**`TICKET_ROUTER_STATE`** : c'est l'état vu côté routeur (contrat Mikmon §2), distinct de
`TICKET_DB_STATE` côté plateforme — conformément à doc 06 §13 (order state ≠ payment state ≠
access state). Renommage rétrocompatible (export alias) pour ne pas casser les tests IMP-07.

Transitions gardées par triggers/contraints CHECK en base (ex. : `SOLD` exige `order_id` non
nul ; `DELIVERED` exige un ticket `SOLD`). Toute transition écrit dans `audit_logs`.

## 5. API Backend (Fastify, `apps/backend`)

| Groupe | Routes (v1) | Notes |
|---|---|---|
| Catalogue | `GET /offers` | sert la Grille A (accès + validité) depuis `plans` actifs |
| Commandes | `POST /orders` (idempotency-key), `GET /orders/:id` | prix = snapshot plan, **jamais fourni par le client** (doc 10 §10.3) |
| Paiements | `POST /orders/:id/pay` → initie FedaPay ; `POST /webhooks/fedapay` | webhook : vérif signature, insert `payment_events` idempotent, transition atomique, puis file `mikrotik_sync` |
| Tickets | `GET /tickets/mine` (codes achetés) | allocation atomique §30 ; livraison = état `DELIVERED` |
| Admin | `GET /admin/dashboard`, `GET /admin/tickets/stats`, `POST /admin/alerts/:id/ack` | auth admin (Supabase Auth + rôle) |
| Connector | `POST /connector/sync/claim`, `POST /connector/sync/:id/result` | **auth par token long-lived dédié + IP allowlist future** ; Phase 1 = dry-run/mocks |
| Santé | `GET /healthz`, `GET /readyz` | sondes hébergeur |

Règles transverses : zod sur tous les payloads (schémas dans `packages/shared` ou
`apps/backend/src/schemas`), erreurs RFC 7807, rate-limit par IP, logs structurés pino,
aucun secret dans les logs (gitleaks déjà en CI).
> **LIVRAISON IMP-12 (21/09/2026)** : `GET /healthz`, `GET /readyz`, `GET /offers`,
> `POST /orders` (Idempotency-Key, doc 06 §21 ; body zod strict — prix jamais fourni
> par le client, doc 10 §10.3 ; snapshot plan §09) et `GET /orders/:id` livrés dans
> `apps/backend` (Fastify 5, `pg` natif ADR 0001, erreurs RFC 7807, rate-limit/IP,
> logs pino via Fastify). Tests unitaires (fake repo) + intégration réelle sur
> Postgres éphémère CI (job build-test doté d’un service postgres:17 + migrations).
> Décision signalée : téléphone Bénin `^01[0-9]{8}$` (+229 toléré/normalisé) — doc 06 §06
> ne fixe pas de format. Restantes : auth (IMP-13), paiements (IMP-14), tickets (IMP-15),
> admin (IMP-17), connector (IMP-21).
> **LIVRAISON IMP-13 (21/09/2026)** : auth clients (phone OTP : `POST /auth/phone/request`,
> `POST /auth/phone/verify`, `POST /auth/logout`, `GET /auth/me`) + admin
> (`GET /admin/me`, JWT Supabase Auth vérifié côté serveur, rôle `app_metadata.role`
> ADMIN/SUPER_ADMIN, audit `audit_logs` ok/denied, messages d’échec génériques — doc 09 §7-8).
> OTP en mémoire (TTL 5 min, 5 essais, 3 demandes/30 min, hash sha256, usage unique) : aucune
> migration (0010 reste le seed stock). `AUTH_DEV_MODE=1` = code retourné pour local/CI ;
> hors devMode : 503 honnête « Canal SMS non configuré » — **décision propriétaire attendue** :
> fournisseur SMS (payant) ou OTP Supabase (nécessite aussi un provider SMS). Un JWT Supabase
> avec phone lie `customers.auth_user_id` (RLS own-rows 0007).
> **LIVRAISON IMP-14 (23/09/2026)** : intégration FedaPay sandbox — `POST /orders/:id/pay`
> (transaction + token lien de paiement, `custom_metadata.payment_id` pour corrélation webhook)
> et `POST /webhooks/fedapay` idempotent : signature `X-FEDAPAY-SIGNATURE` `t=…,s=…` (HMAC-SHA256
> hex, tolérance 300 s) vérifiée contre l’algorithme du SDK officiel fedapay-node 1.2.5 ;
> corps brut journalisé même rejeté (`payment_events.signature_ok`) ; dédoublonnage
> `UNIQUE(provider_event_id)` (doc 06 §20-21) ; vérification montant/devise (doc 06 §23) ;
> transitions atomiques payment+order (doc 06 §24). Le frontend n’est jamais une preuve de
> paiement (doc 06 §17). Sans clés : 503 honnêtes. Aucune dépendance npm ajoutée.
> **LIVRAISON IMP-15 (23/09/2026)** : allocation atomique des tickets + livraison —
> après webhook approuvé : `RESERVED→SOLD` (commande `PAID→TICKET_ALLOCATED→DELIVERED`)
> en une transaction SQL `FOR UPDATE SKIP LOCKED` (doc 06 §29-30, jamais deux commandes sur
> le même ticket — prouvé par test de concurrence réelle 6 allocations/3 tickets) ;
> stock épuisé = paiement CONFIRMÉ préservé, ordre `PAID`, audit `ticket_allocation_failed`,
> retry admin `POST /admin/orders/:id/allocate` (§88) ; `GET /tickets/mine` (jamais de code
> en clair, `code_hash` seulement — 0004) ; idempotence rejeu (invariants 2/5/7).
> Note : l’empaquetage `SECURITY DEFINER` (§3.3) sera posé au déploiement Supabase hébergé
> (RLS applicable aux appelants) ; aucune migration ajoutée — 0010 reste le seed stock (IMP-16).

> **LIVRAISON IMP-16 (23/09/2026)** : `0010_seed_stock_mikmon` livré — les 660 tickets du
> manifeste IMP-06 (17/09/2026) sont seedés en base : 6 batches `source='mikmon-manual'`
> (notes `mikmon-2026-09-17-B1..B6`, UUID fixes, quantités 300/60/100/120/40/40) et 660
> tickets `AVAILABLE` dont la base ne stocke que `sha256(code)` (jamais de code en clair,
> doc 06 §88-90, 0004) + préfixe indicatif 2 caractères. Générateur déterministe
> `tools/gen-seed-stock-0010.py` (lit le coffre, vérifie sha256 PDF ↔ manifeste, comptes,
> séquences, profils Grille A) ; migration idempotente (ON CONFLICT DO NOTHING) compatible
> avec `db-migrate.sh up` ; rollback `down/0010` (tickets puis batches). Tests : smoke étendu,
> `packages/shared/src/stock-sync.test.ts` (12 tests), bloc intégration IMP-16 dans
> `repo.pg.test.ts`, et convention de parking du stock seedé pendant les suites IMP-14/15.
> Décisions consignées dans `docs/decisions/DECISIONS-2026-09-17.md` (D6/D7). `SECURITY DEFINER`
> (§3.3) : **arbitré le 23/09/2026 — Option A (statu quo Phase 1)** : `service_role` côté
> serveur + logique en TypeScript ; bascule DEFINER à revisiter au déploiement Supabase hébergé.

> **LIVRAISON IMP-17 (23/09/2026)** : API admin du dashboard (doc 09 §12-13) —
> `GET /admin/dashboard` (chiffres du jour : CA = paiements CONFIRMÉS réels, commandes,
> tickets délivrés ; inventaire disponibles/réservés/vendus/expirés + offres proches de
> l'épuisement ; système : file `mikrotik_sync` HEALTHY/WARNING/ERROR/UNKNOWN, incidents
> ouverts, Connector UNKNOWN en Phase 1), `GET /admin/tickets/stats` (inventaire par offre
> Grille A) et `POST /admin/alerts/:id/ack` (atomique + idempotent + audité). Jour courant
> métier = Africa/Porto-Novo. **Règle §13 respectée** : chiffres issus de requêtes sur les
> données persistées, jamais reconstruits côté frontend. Auth admin identique à IMP-13.
> Logique pure `apps/backend/src/admin.ts` ; aucune migration (schéma 0001→0010 suffisant).
> Tests : `admin.test.ts` (13 tests) + bloc intégration IMP-17 (4 tests) dans `repo.pg.test.ts`
> sur base seedée réelle.

## 6. Workers / jobs

| Job | Déclencheur | Rôle |
|---|---|---|
| `sync-dispatcher` | file `mikrotik_sync` (polling + Supabase Realtime) | remet les ordres au Connector, gère retry/backoff (doc 06 §36), `BLOCKED` après N échecs |
| `order-expiry` | cron 1 min | `PAYMENT_PENDING`/`PENDING` → `EXPIRED` après TTL ; libère les tickets `RESERVED` |
| `reconciler` | cron (W2 : réel ; Phase 1 : simulation) | compare `tickets` ↔ état routeur rapporté, alimente `reconciliation_runs` + `alerts` (garde-fou INC-03 : total attendu ≈ 4 815) |
| `webhook-sweeper` | cron 5 min | rattrape les webhooks FedaPay perdus (query API FedaPay par `provider_ref`) |

Phase 1 : jobs in-process (Fastify `@fastify/cron`) pour rester à coût nul ; extraction en
worker dédié seulement si l'hébergement l'impose (ADR 0002).

## 7. Environnement & secrets

| Variable | Contenu | Où |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | accès backend | hébergeur (jamais frontend) |
| `SUPABASE_ANON_KEY` | accès public frontend | frontend (RLS protège) |
| `FEDAPAY_PUBLIC_KEY`, `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET` | paiement | backend |
| `CONNECTOR_TOKEN` | auth Connector | backend + hôte W2 |
| `ROUTER_API_*` | identifiants `dg-connector` | **hôte W2 uniquement** (jamais cloud) |

Règles : `.env.example` sans valeurs au repo ; gitleaks en CI (déjà actif) ; rotation documentée
(INC-01). Les codes de tickets et le dump 660 restent au coffre physique — seul leur hash
entre en base.

## 8. Stratégie de tests

| Niveau | Outil | Exemples |
|---|---|---|
| Unitaires normatifs | vitest (déjà en place) | Grille A, transitions d'états, idempotency-key, formats RouterOS |
| Intégration base | vitest + Postgres éphémère CI (services GitHub Actions) | migrations up/down, RLS (anon/authenticated/service), allocation atomique concurrente (`SKIP LOCKED`) |
| Webhooks | mocks signés FedaPay | double livraison, signature invalide, événement inconnu, montant divergent |
| Contrat Connector | fixtures JSON (captures read-only IMP-01) | parsing `/ip hotspot user`, commentaires `vc-…`, diff réconciliation |
| E2E sandbox | FedaPay sandbox + frontend local | achat 100 F complet jusqu'à `DELIVERED` (ticket de test, sans routeur) |

Aucun test ne touche le routeur réel avant IMP-21/23 (principe captive-local vs Internet,
prompt 02). « Techniquement terminé ≠ tests passés ≠ validé utilisateur ».

## 9. Mapping indicatif IMP-09 → IMP-21

> Chaque IMP conserve son **pre-topo** obligatoire (protocole prompt 02) ; ce mapping est une
> proposition de découpage, à confirmer au feu vert de chaque étape.

| IMP | Contenu proposé | Dépend de |
|---|---|---|
| 09 | Projet Supabase + CLI + migrations 0001–0006 en CI | 08 |
| 10 | Seed Grille A (0007) + RLS complète + tests RLS | 09 |
| 11 | Machines d'états dans `packages/shared` (+ alias `TICKET_ROUTER_STATE`) + triggers/checks | 09 |
| 12 | API catalogue/commandes (Fastify, zod, healthz) | 10, 11 |
| 13 | Auth clients (phone) + admin (Supabase Auth) | 12 |
| 14 | Intégration FedaPay sandbox (init + webhook idempotent) | 12 |
| 15 | Allocation atomique tickets + livraison `DELIVERED` | 14 |
| 16 | Import du stock Mikmon 660 (hash, batch, tools/) | 15 |
| 17 | Admin dashboard API (stats, alertes, ack) | 15 |
| 18/19 | Génération de tickets par le backend (remplace Mikmon, cf. D5/N4) + file `mikrotik_sync` | 16 |
| 20 | Workers (expiry, sweeper, reconciler simulé) | 18/19 |
| 21 | Contrat Connector (dry-run sur fixtures ; permissions réelles testées en W2) | 20 |

## 10. Budget & risques

- **Coût Phase 1 visé : 0 FCFA** — Supabase free tier, hébergement frontend statique free tier,
  FedaPay sans frais fixes (1,8 % à la transaction uniquement), CI GitHub Actions gratuite.
- Risques : (1) free tier Supabase = 1 projet actif/pause auto après inactivité → prévoir
  keep-alive dans `webhook-sweeper` ; (2) pas de Connector physique avant W2 → tout ce qui
  touche le routeur est simulé sur fixtures (assumé, cf. architecture §2) ; (3) INC-04 : codes
  660 potentiellement exposés → le hash en base + la rotation possible en W2 limitent l'impact ;
  (4) P6 ouvert : permissions exactes `dg-connector` à tester en IMP-21/23.

---

**Fin du blueprint.** Prochaine étape après feu vert propriétaire : pre-topo IMP-09.
