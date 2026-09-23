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
