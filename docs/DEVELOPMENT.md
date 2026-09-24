# DEVELOPMENT — Déo Gracias Wi-Fi System

> Monorepo npm workspaces (TypeScript strict, Node 20). Voir ADR : `docs/adr/0001-monorepo-stack.md`, `docs/adr/0002-hebergement-donnees.md`.

## Prérequis

- Node 20 (`nvm use` lit `.nvmrc`) ; npm ≥ 10.
- Rien d'autre : pas de base locale requise pour typecheck/tests (Supabase = IMP-10).

## Commandes

```bash
npm install          # installe tous les workspaces
npm run typecheck    # tsc --noEmit sur chaque workspace
npm test             # vitest run sur chaque workspace
npm run build        # build là où défini (vide au squelette)
```

## Arborescence

```
apps/backend    → API + workers (Fastify à partir d'IMP-12)
apps/frontend   → SPA publique + admin (React/Vite à partir d'IMP-25)
apps/connector  → pont LAN↔cloud (client RouterOS interne à partir d'IMP-21)
packages/shared → VÉRITÉ MÉTIER UNIQUE : Grille A, états ticket, schémas Zod
tools/          → outillage (probe RouterOS zero-dep = IMP-21/22), hors workspaces
docs/           → specs validées, guides terrain, evidence, ADR, décisions
```

## Règles impératives (rappel du protocole propriétaire)

1. **Aucun secret dans le dépôt** : ni codes tickets, ni mots de passe, ni clés API, ni dumps (`dg-*`). La CI gitleaks bloque les fuites ; les revues bloquent le reste.
2. **Règle métier unique** : toute constante commerciale (prix, durées, validités, noms de profils MikroTik) vit dans `packages/shared` et nulle part ailleurs ; les tests de shared encodent la Grille A officielle.
3. **CI verte obligatoire** avant toute merge/push fonctionnel : typecheck + tests + gitleaks.
4. **Une implémentation = une unité finie** avec rapport fichier-par-fichier ; pas d'enchaînement sans feu vert explicite du propriétaire.
5. Le routeur MikroTik existant est un composant produit : aucune écriture hors guides terrain validés (contrat Mikmon : `docs/infrastructure/mikhmon-contract.md`).

## Base de données locale (IMP-09)

Les migrations vivent dans `supabase/migrations/` (up) et `supabase/down/` (rollback).
Deux façons de les appliquer :

1. **Sans Docker** (CI et minimal) : un Postgres 16/17 quelconque +
   `DATABASE_URL=postgres://… tools/db-migrate.sh up|down|reset|smoke`.
2. **Supabase CLI** (optionnel, Docker requis) : `supabase start` puis `supabase db reset`.

Aucun secret de projet cloud dans le repo : le lien vers le projet Supabase réel se fait
sur la machine du propriétaire via `supabase link` (voir `docs/field-guides/GUIDE-07-SUPABASE-PROJET.md`).

## API backend locale (IMP-12)

L'API catalogue/commandes vit dans `apps/backend` (Fastify 5, zod strict, `pg` natif — ADR 0001).

```bash
npm ci                                  # le lockfile a change (fastify, pg, zod, tsx, @fastify/rate-limit)
export DATABASE_URL="postgres://…"      # base migree : tools/db-migrate.sh up
npm run dev -w @dg/backend              # serveur local en watch (tsx) — ou npm run start
curl http://127.0.0.1:3000/healthz
curl http://127.0.0.1:3000/offers
curl -X POST http://127.0.0.1:3000/orders -H 'content-type: application/json' \
  -H 'Idempotency-Key: demo-00000001' -d '{"offer_id":"24-HEURES","customer_phone":"01XXXXXXXX"}'
```

Routes livrees : `GET /healthz`, `GET /readyz`, `GET /offers`, `POST /orders`
(Idempotency-Key obligatoire, doc 06 §21), `GET /orders/:id` (IMP-12) ;
`POST /auth/phone/request`, `POST /auth/phone/verify`, `POST /auth/logout`,
`GET /auth/me`, `GET /admin/me` (IMP-13) ; `POST /orders/:id/pay`,
`POST /webhooks/fedapay` (IMP-14) ; `GET /tickets/mine`,
`POST /admin/orders/:id/allocate` (IMP-15). Erreurs RFC 7807
(`application/problem+json`) ; rate-limit 100 req/min/IP (durci sur /auth :
5 req/30 min et 10/min) ; prix toujours calcule cote serveur (doc 10 §10.3 —
le body est strict, toute cle inconnue est rejetee).

## Authentification (IMP-13)

- **Clients (phone)** : OTP 6 chiffres, TTL 5 min, 5 essais, 3 demandes/30 min,
  code a usage unique, stocke haché **en mémoire** (Phase 1 mono-processus, cout
  nul, aucune migration). `AUTH_DEV_MODE=1` renvoie le code dans la reponse
  (`dev_code`) pour le local/CI — **jamais en production**. Sans devMode :
  503 « Canal SMS non configuré » (aucun fournisseur SMS décidé, budget nul).
- **Admin** : JWT Supabase Auth verifié via `GET {SUPABASE_URL}/auth/v1/user`
  (necessite `SUPABASE_URL` + `SUPABASE_ANON_KEY` — publiques par conception) ;
  role lu dans `app_metadata.role` (`ADMIN` | `SUPER_ADMIN`, doc 09 §6.2) ;
  echec = message generique ; chaque tentative (ok/denied) est journalisee dans
  `audit_logs` (doc 09 §8). Role a poser sur votre compte : Dashboard Supabase →
  Authentication → Users → votre user → **App metadata** → `{ "role": "SUPER_ADMIN" }`.
- Un JWT Supabase avec `phone` reconnu sur `GET /auth/me` lie automatiquement
  `customers.auth_user_id` (active les politiques RLS « own rows » de 0007).

## Paiements FedaPay (IMP-14)

- `POST /orders/:id/pay` : cree la transaction FedaPay (sandbox par defaut),
  stocke `payments` (CREATED→INITIATED→PENDING), passe la commande
  PAYMENT_PENDING et retourne `provider_ref` + `redirect_url`. Rejeu = 200
  `replay:true` sans rappeler le prestataire. Sans `FEDAPAY_SECRET_KEY` :
  503 honnete. Prix envoye = snapshot serveur (doc 10 §10.3).
- `POST /webhooks/fedapay` : **seule preuve de paiement** (doc 06 §17 — le
  frontend n'en est jamais une). Signature `X-FEDAPAY-SIGNATURE` = `t=…,s=…`
  (HMAC-SHA256 hex de `${t}.${corps brut}`, tolerance 300 s) — algorithme
  verifie sur le SDK officiel fedapay-node 1.2.5 (`WebhookSignature`). Pipeline
  doc 06 §22 : corps brut stocke meme en cas de rejet (`signature_ok=false`),
  dedoublonnage par `UNIQUE(provider_event_id)`, verification montant/devise,
  transition atomique payment+order (doc 06 §24), evenement marque traite.
  `transaction.approved`→CONFIRMED/PAID ; `declined`→FAILED ; `canceled`→CANCELLED.
- Aucune dependance npm ajoutee (fetch natif + node:crypto) ; aucun appel
  reseau dans les tests (fetch stubbe + signatures generees localement).

## Tickets : allocation atomique + livraison (IMP-15)

- Apres un webhook `transaction.approved` valide, le backend : confirme le
  paiement, **alloue atomiquement** un ticket `AVAILABLE` du plan de la commande
  (`SELECT ... FOR UPDATE SKIP LOCKED` puis `RESERVED→SOLD`, commande
  `PAID→TICKET_ALLOCATED`, le tout en UNE transaction — doc 06 §29-30, jamais
  deux commandes sur le meme ticket), puis livre (`DELIVERED`, doc 06 §90).
- Stock epuise : le paiement CONFIRME est preserve, la commande reste `PAID`,
  audit `ticket_allocation_failed` ; retry admin via
  `POST /admin/orders/:id/allocate` (matrice de recuperation doc 06 §88).
- Idempotence : rejeu = jamais de seconde allocation ni double livraison
  (invariants 2, 5, 7 — doc 06 §89).
- `GET /tickets/mine` : tickets vendus du client (session phone ou JWT) ;
  **jamais de code en clair** — la base ne stocke que `code_hash` (0004,
  INC-01/INC-04) ; la reponse expose l'etat + le prefixe indicatif seulement.
- L'empaquetage SECURITY DEFINER (blueprint §3.3) interviendra au deploiement
  Supabase heberge, ou la RLS s'applique aux appelants (decision signalee).

Tests : unitaires (fake repo, sans base) + **integration reelle** `repo.pg.test.ts`
executes si `DATABASE_URL` est definie (skip propre sinon ; en CI : service
`postgres:17` + migrations dans le job `Typecheck + tests`), dont un test de
**concurrence reelle** : 6 allocations simultanees sur 3 tickets => exactement
3 livrees, 0 double attribution. Attendu : 117/117 avec base (backend 82 dont
16 d'integration), 101 + 16 skips sans.

## Stock digital seedé en base (IMP-16)

- La migration `supabase/migrations/0010_seed_stock_mikmon.sql` charge
  l'inventaire RÉEL Mikmon (manifeste IMP-06 du 17/09/2026) : 6 batches
  `source='mikmon-manual'` (notes `mikmon-2026-09-17-B1..B6`) et 660 tickets
  (B1 5-HEURES ×300, B2 12-HEURES ×60, B3 24-HEURES ×100, B4 72-HEURES ×120,
  B5 1-SEMAINE ×40, B6 1-MOIS ×40). Les PDF du coffre sont la SEULE source
  des codes : la migration ne contient que `sha256(code)` (jamais de code en
  clair, doc 06 §88-90) + un préfixe indicatif de 2 caractères.
- Régénération : `python3 tools/gen-seed-stock-0010.py` (déterministe — lit
  le coffre, vérifie sha256 des PDF ↔ manifeste, comptes/séquences/format,
  profils Grille A, puis réémet la migration). La sortie est idempotente :
  UUID fixes + `ON CONFLICT DO NOTHING`, compatible avec `db-migrate.sh up`
  qui réapplique tous les fichiers sans tracking.
- Conséquence CI : le job `Typecheck + tests` migre la base AVANT
  `npm test` — les tests d'intégration partagent donc la base seedée.
  Convention (helpers `parkMikmonStock`/`unParkMikmonStock` de
  `repo.pg.test.ts`) : les suites IMP-14/15 mettent le stock seedé hors
  `AVAILABLE` via des transitions légales (AVAILABLE→RESERVED, puis
  RESERVED→RELEASED→AVAILABLE) avant/après leurs tests — l'allocation étant
  FIFO par `created_at`, les tickets seedés seraient sinon consommés les
  premiers. Le stock réel n'est JAMAIS consommé par les tests ; le bloc
  IMP-16 consomme un ticket puis le restaure (bypass superuser de la garde,
  immédiatement réactivé).
- Test normatif : `packages/shared/src/stock-sync.test.ts` (structure du
  manifeste, distribution, unicité, idempotence, ordre du rollback).
- Attendu : 279/279 avec base (backend 182 dont 45 d'intégration + 5 modes démo
  + 4 validation env + 7 diagnostic pg, shared 45, connector 46, frontend 6).
  Sans base : les intégrations pg skippent proprement.

## API admin : dashboard, stats tickets, ack alertes (IMP-17)

- `GET /admin/dashboard` (doc 09 §12.1) : indicateurs du jour (CA = somme des
  paiements CONFIRMÉS du jour, commandes, paiements confirmés, tickets délivrés),
  inventaire (disponibles/réservés/vendus/expirés + offres proches de
  l'épuisement, seuil 10), système (état de la file `mikrotik_sync`, incidents
  ouverts, Connector = UNKNOWN en Phase 1).
- **Règle doc 09 §13** : tous les chiffres proviennent des données persistées
  (requêtes réelles) — jamais reconstruits côté frontend.
- Jour courant métier = jour calendaire à `Africa/Porto-Novo` (UTC+1 fixe,
  site de Calavi) ; logique pure testable dans `apps/backend/src/admin.ts`.
- `GET /admin/tickets/stats` : inventaire par offre Grille A (prix, états, totaux).
- `POST /admin/alerts/:id/ack` : reconnaissance atomique (`WHERE acknowledged_at
  IS NULL`) et idempotente (rejeu => `already_acknowledged: true`, même
  horodatage) ; 404 si inconnue ; chaque action est auditée (`audit_logs`).
- Auth : identique à IMP-13 (JWT Supabase + rôle ADMIN/SUPER_ADMIN, messages
  génériques, 503 sans configuration). Aucune migration ajoutée.

## Génération de tickets digitaux par le backend (IMP-18)

- `POST /admin/batches` (body `{offer_id, quantity}` — 1..200, contrat Mikmon
  §3.5) : crée un lot `source='backend'` + ses tickets + les ordres
  `create_ticket` en file `mikrotik_sync`, en UNE transaction (repo
  `createBackendBatch`).
- Formats contrat Mikmon §3 : nom routeur `dg` + 6 caractères [a-z0-9] ;
  code client 8 caractères SANS ambigus (0/o/1/l/i exclus) ; comment
  `vc-<seq>-<mm.dd.yy>-` au fuseau du site ; profile + limit-uptime pris dans
  `plans` (jamais déduits du nom, doc 09 §36).
- Séquence digitale : `settings.backend_batch_seq`, atomique, démarre à 100
  (les batches Mikmon manuels occupent 1..6).
- **Codes clairs** : affichés UNE seule fois dans la réponse (`code_export`, à
  archiver au coffre) ; la base ne stocke que `sha256(code)` (0004). Le clair
  ne vit ensuite que dans `mikrotik_sync.payload`, le temps de la synchro
  routeur (purge au succès — IMP-21/24).
- Logique pure : `apps/backend/src/ticketgen.ts` (RNG injectable, seedable).
- Aucune migration : schéma 0001→0010 suffisant ; le test RLS utilise une
  baseline dynamique pour `settings` (catalogue public, 0007).

## Échéance d'activation des tickets vendus (IMP-19)

- Migration `0011` : colonne `tickets.activation_deadline` + transition légale
  `SOLD→EXPIRED` (double garde-fou, contrat Mikmon §3.6).
- À la vente (`allocateTicketForOrder`) : `activation_deadline = sold_at +
  validité de l'offre` (issue du snapshot §09 de la commande, jamais déduite
  du nom de profil). `make_interval` SQL, figé dans la même transaction.
- `repo.expireOverdueTickets(now)` : expire les SOLD dont la fenêtre est
  close (gardes 0009 : transition légale + audit `state_change` automatique).
  Sera appelé par le worker expiry (IMP-20).
- Le stock VIERGE ne porte aucune échéance : vendable jusqu'à la bascule
  IMP-38 (décision D10).
- `/tickets/mine` : n'expose que les vouchers utilisables (SOLD/USED) +
  `activation_deadline` pour transparence.

## Workers in-process : order-expiry, webhook-sweeper, reconciler simulé (IMP-20)

- Trois jobs `setInterval` (ordonnanceur zéro dépendance — le blueprint citait
  `@fastify/cron` à titre indicatif ; mêmes sémantiques, surface réduite),
  démarrés par `buildApp({ workers: { enabled: true } })` depuis `server.ts`,
  arrêtés par le hook Fastify `onClose`. Désactivables : `WORKERS=off`.
- **order-expiry (1 min)** : commandes `PAYMENT_PENDING` au-delà de 30 min =>
  `EXPIRED`, avec leurs paiements `PENDING` => `EXPIRED` (transitions 0009,
  audit automatique) ; tickets `RESERVED` bloqués au-delà de 15 min =>
  `RELEASED` puis `AVAILABLE` (libère le stock). Les paiements `INITIATED`
  orphelins ne sont PAS expirés (transition interdite 0009) : ils seront
  refusés naturellement par `confirmPayment` (commande déjà EXPIRED).
  Le même tick appelle `expireOverdueTickets` (IMP-19) : tickets SOLD à
  échéance dépassée => EXPIRED (contrat Mikmon §3.6).
- **webhook-sweeper (5 min, doc 06 §22)** : pour tout paiement ouvert
  (`INITIATED`/`PENDING` avec `provider_ref`, âge >= 5 min), interroge
  `GET /v1/transactions/{ref}` FedaPay ; `approved` => `confirmPayment`,
  `declined` => `failPayment(FAILED)`, `canceled` => `failPayment(CANCELLED)` ;
  `pending`/`unknown`/erreur réseau => on attend le passage suivant.
  Sans clés FedaPay configurées : honnêtement inactif (retourne 0).
- **reconciler (1 h, simulation Phase 1)** : cohérence interne plateforme
  (tickets SOLD sans commande, commandes DELIVERED sans ticket) => insère un
  run dans `reconciliation_runs` (`router_total_seen` NULL : le volet routeur
  réel arrive en IMP-24) ; en cas de MISMATCH, alerte `reconciliation_mismatch`
  CRITICAL (garde-fou INC-03).
- Décision D11 : TTL commandes 30 min, RESERVED 15 min, sweep min-age 5 min.
- Tests : `workers.test.ts` (10 unitaires, FakeRepo + fake provider) + bloc
  IMP-20 de `repo.pg.test.ts` (4 intégrations réelles : expiry, libération
  RESERVED, candidats sweeper, run reconciliation sur base réelle).

## Contrat Connector : file mikrotik_sync + dry-run sur fixtures (IMP-21)

- **Routes** (blueprint §5) : `POST /connector/sync/claim` (réclamation
  atomique `SKIP LOCKED` de la prochaine opération PENDING ou RETRY échue =>
  PROCESSING + `locked_by` + `attempts+1` ; 204 si file vide) et
  `POST /connector/sync/:id/result` (succès => SUCCESS ; échec => RETRY avec
  backoff, ou BLOCKED). Auth : token long-lived dédié `CONNECTOR_TOKEN`
  (blueprint §7) ; absent => 503 honnête ; comparaison sha256 + timing-safe.
- **Politique retry (D12, doc 06 §36)** : 3 tentatives au total ; backoff
  1 min / 5 min / 15 min ; au-delà => `BLOCKED` + alerte WARNING
  `sync_blocked` + audit. Constantes exportées : `SYNC_MAX_ATTEMPTS`,
  `SYNC_BACKOFF_MS`.
- **Purge INC-04** : après succès d'un `create_ticket`, le champ `password`
  (code clair) est retiré du payload (`payload - 'password'`) — engagement
  IMP-18 tenu : le clair ne survit pas à la synchro.
- **Verrous perdus** : job `sync-requeue` (60 s, workers.ts) — les PROCESSING
  de plus de 10 min (`DEFAULT_SYNC_STUCK_MS`) repassent en RETRY immédiatement
  via FAILED->RETRY (la transition PROCESSING->PENDING n'existe pas en 0009 ;
  `attempts` n'est PAS incrémenté : l'échec n'est pas au Connector).
- **`@dg/connector`** (paquet) : `parseHotspotUsers` (sorties `/ip hotspot
  user` RouterOS 6.49, formats tabulaire et detail, contrat Mikmon §4),
  `DryRunConnector` (routeur simulé en mémoire : validations contrat §3 —
  name `dg`+6 [a-z0-9], comment `vc-…`, profils Grille A + legacy §5),
  `consumeOnce`/`drainQueue` + `HttpSyncTransport` (client de la file).
  Fixtures SYNTHÉTIQUES documentées (les captures réelles sont masquées,
  EVIDENCE-IMP01). Aucune écriture routeur réelle avant W2 (contrat §4.5).
- E2E réel : un lot digital IMP-18 est consommé de bout en bout par le
  DryRunConnector via les vraies routes (bloc intégration IMP-21).

## Connector v0 strictement read-only : lectures routeur + réconciliation (IMP-22)

- Contrat Mikmon §4.5 : aucune écriture routeur avant IMP-24 ; le Connector v0
  est **strictement read-only** — le type `ReadOnlyConnectorV0` n'expose QUE
  `collect()` (vérifié par test).
- **Parsers read-only** (`@dg/connector`) : `/ip hotspot active print detail`
  (sessions live : uptime/session-time-left en secondes, comment `;;;` = `vc-…`
  ou échéance après login) ; journal Mikhmon `/system script` comment=mikhmon
  (séparateur `-|-`, deux formats de date `mon/DD/YYYY` et `YYYY-MM-DD`, §4.3) ;
  helpers `parseRouterOsDuration`, `parseLimitUptime`, `normalizeRouterOsDate`.
- **`reconcileReadOnly`** (§4.4) : 5 familles d'anomalies — `comment_vide`,
  `session_vc_active` (conversion On-Login ratée), `ticket_paye_absent`
  (voucher digital attendu absent/désactivé), `ticket_inconnu` (comment `vc-…`
  inconnu : ni digital attendu ni `sha256(name)` legacy — association par
  username = code, note 0010), `uptime_incoherent` (uptime+left vs
  limit-uptime, tolérance 60 s, §4.2).
- **Routes** (blueprint §5) : `GET /connector/inventory/expected` (vouchers
  digitaux synchronisés + 660 empreintes legacy — JAMAIS de code clair, D13)
  et `POST /connector/inventory/report` (trace `reconciliation_runs` avec
  `router_total_seen` rempli, `diff.mode='readonly_v0'` ; MISMATCH => alerte
  WARNING `router_readonly_mismatch`, garde-fou INC-03).
- Admin-free : compté à part (`admin_free_seen`), pas une anomalie en v0
  (inventaire à figer en IMP-35, décision D13).
- E2E réel : expected sur base réelle + lectures fixtures => rapport MISMATCH
  tracé + alerte ; rapport cohérent => run OK sans alerte.

## Client RouterOS API classique + premières écritures (IMP-23)

- Doc 07 §37 : l'API **classique binaire** RouterOS (jamais le REST, non garanti
  en 6.49). `routeros-protocol.ts` : longueurs variables (1-5 octets, vecteurs
  wiki), phrases mots+mot vide, réponses `!re/!done/!trap/!fatal`.
- `RouterOsApiClient` (zero-dep : node:net/tls/crypto) : TCP `api` ou TLS
  `api-ssl`, login clair (mode primaire LAN) + bascule challenge md5 (schéma
  hex simplifié, ajustement binaire au W2 — P6), `talk()`, opérations hotspot
  (`add`/`print`/`set disabled`/`remove`/find par `?name=`).
- `applyQueueOp` : passerelle file `mikrotik_sync` -> routeur avec le même
  contrat de résultat que le DryRunConnector (create_ticket => add,
  disable_ticket => find+set, read/refresh => print).
- `probePermissions()` (P6) : sonde lecture + écriture avec un user jetable
  `dgprobe0` créé puis supprimé ; rapport `{read, write, detail}` à exécuter
  sur site en W2 avec le compte `dg-connector` (permissions réelles à valider).
- Tests : stub TCP protocolaire en mémoire (`testing/stub-routeros.ts`) —
  login clair/challenge, traps (doublon, panne temporaire), E2E add/print/set/
  remove, gateway, probe. AUCUN test ne touche un routeur réel (prompt 02).
- Imports du backend vers le connector en **chemins relatifs** (leçon IMP-22 :
  résolution indépendante de node_modules/symlinks/paths).

## Réconciliation v0 de bout en bout (IMP-24)

- `reconcile-runner.ts` (connector) : le cycle complet read-only —
  attendu plateforme (`GET /connector/inventory/expected`) + observé routeur
  => `reconcileReadOnly` (IMP-22) => rapport (`POST /connector/inventory/report`)
  qui persiste `reconciliation_runs` + alerte WARNING `router_readonly_mismatch`
  en cas de MISMATCH (garde-fou INC-03).
- Observé : v0 = `observedFromDryRun` (DryRunConnector en mémoire) ; W2 =
  `observedFromRouterOs` (printHotspotUsers via l'API classique, IMP-23).
  Transport injectable : `HttpInventoryTransport` (fetch, CONNECTOR_TOKEN) ou
  adaptateur `app.inject` en tests. AUCUNE écriture routeur (contrat §4.5).
- Backend : `listReconciliationRuns` / `listOpenReconciliationAlerts` (repo) +
  `GET /admin/reconciliation` (rôle ADMIN requis) : runs récents (mode,
  violations, nb anomalies) + alertes de réconciliation non acquittées.
- Tests : 4 unitaires runner (transport fake) + 2 E2E pg réels (lot digital
  drainé vers le DryRunConnector => run OK sans alerte ; voucher désactivé côté
  routeur => MISMATCH ticket_paye_absent + alerte WARNING + vue admin).
- Les alertes restent ouvertes jusqu'à acquittement (`POST /admin/alerts/:id/ack`).

## Démo visuelle locale (IMP-25)

- SPA React/Vite (`apps/frontend`) : espace client (connexion OTP dev, offres
  Grille A, commande, paiement, ticket) + console admin (tableau de bord
  IMP-17, stats tickets, réconciliation IMP-24 avec acquittement). Le
  navigateur n'appelle que des chemins relatifs `/api/…` (proxy Vite vers le
  backend ; jamais de localhost côté navigateur). GUIDE-09 = mode d'emploi.
- Modes DEV (jamais en production, garde-fous codés en dur) :
  `DevStaticAuthVerifier` (jeton admin statique actif seulement sans Supabase
  et avec AUTH_DEV_MODE=1), `DevPaymentProvider` + `POST /webhooks/dev-approve`
  (actif seulement sans clé FedaPay et avec PAYMENT_DEV_MODE=1 ; n'approuve
  que les paiements `DEV-…` ; réutilise le chemin réel
  confirmPayment → allocateAndDeliver).
- Le backend lit désormais `.env` (dotenv, racine du monorepo ou dossier
  backend ; les variables d'environnement réelles gardent priorité).
- Production = mêmes routes, variables Supabase/FedaPay réelles : aucun
  changement de code nécessaire. DATABASE_URL peut pointer vers le Postgres
  hébergé Supabase (Settings → Database → URI directe) : GUIDE-09 §2-B.
- Tests : 5 backend (verifieur, E2E mémoire commande→livraison, garde-fous)
  + 4 frontend (formatage). Démo validée de bout en bout sur Postgres réel
  (OTP→commande→paiement DEV→approbation→DELIVERED→ticket ; runs OK/MISMATCH
  + alerte dans la vue admin).
- IMP-25.2 : continuité de direction artistique avec le portail public legacy
  (fond clair #f3f4f5, cartes blanches, bleu #20a8d8, jaune #ffc107, vert
  #4dbd74, cyan #63c2de, typo système, logo « WIFI ZONE » régénéré proprement
  dans `apps/frontend/public/logo.png`, pied « Merci pour votre confiance »).
  Port par défaut aligné : backend 3000, proxy Vite 3000 (`BACKEND_PORT`).
  Guide d'intégration environnement complet : GUIDE-10.
- IMP-25.3 — diagnostic schéma : `getSchemaHealth()` (repo), `/readyz` et
  `/offers` répondent 503 « Base non migrée » actionnable, log de démarrage
  avec DATABASE_URL masquée. Testé sur base vide dédiée (2 tests pg).

## Après récupération de fichiers (règle anti-désync, ajout 17/09/2026)

Dès que des fichiers modifiant `package.json` / `package-lock.json` sont récupérés depuis le
workspace de l'agent (ou après un `git pull` qui les touche) :

1. exécuter `npm ci` **à la racine du monorepo** avant toute évaluation dans l'IDE ;
2. dans VSCode : « TypeScript: Restart TS Server » (palette) si des erreurs `ts(2591)`
   (« nom 'node:fs' introuvable ») ou `ts(2339)` (`import.meta.url`) apparaissent —
   elles signifient uniquement que `node_modules` est désynchronisé du lockfile ;
3. vérifier : `npm run typecheck` doit passer avant de juger le code.

Cas vécu (IMP-10) : 4 erreurs VSCode locales alors que la CI GitHub était verte — cause :
`@types/node` ajouté au lock mais `npm ci` non relancé localement.
