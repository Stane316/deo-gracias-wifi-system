# GUIDE-08 — Exécution locale complète du projet (Windows + bash)

> **Qui exécute** : vous, sur votre PC unique (Calavi). **Coût** : 0 FCFA.
> **Objectif** : installer, configurer, lancer et tester le monorepo en local, de façon
> reproductible, sans jamais toucher au routeur MikroTik ni au projet Supabase cloud
> (cloud = GUIDE-07). **Durée première installation** : 30–45 min ; ensuite 2 commandes
> par session (tableau §7).
>
> État du produit à ce jour : **backend API uniquement** (JSON). L'interface visuelle
> (SPA React/Vite, `apps/frontend`) arrive à l'**IMP-25** — ce guide sera alors complété
> d'une section « frontend ». En attendant, la « démo » se fait via curl/navigateur sur
> les routes JSON (`/healthz`, `/offers`, …).

## 0. Architecture du repo (ce qui tourne où)

```text
deo-gracias-wifi-system/
├── apps/backend     → API Fastify (catalogue, commandes, santé)   ← IMP-12/13, SEUL processus à lancer aujourd'hui
├── apps/frontend    → SPA React/Vite                              ← squelette ; réel à partir d'IMP-25
├── apps/connector   → pont LAN↔cloud (hôte W2, PAS votre PC)      ← réel à partir d'IMP-21, jamais lancé en local
├── packages/shared  → vérité métier (Grille A, états, schémas)    ← bibliothèque, ne se lance pas
├── supabase/        → migrations SQL (0001→0009) + rollbacks (down/)
├── tools/           → db-migrate.sh (up/down/reset/smoke/rls/states), scripts
└── docs/            → specs, guides terrain, blueprint
```

Deux processus locaux maximum en Phase 1 : **Postgres** (service) + **API backend** (tsx).

## 1. Prérequis à installer (une seule fois)

| Élément | Méthode A — graphique | Méthode B — CLI (PowerShell) | Vérification |
|---|---|---|---|
| Node 20 | https://nodejs.org → installer LTS « Windows Installer » | `winget install OpenJS.NodeJS.LTS` | `node -v` ≥ v20 ; `npm -v` ≥ 10 |
| Git | https://git-scm.com/download/win (cocher « Git Bash Here ») | `winget install Git.Git` | `git --version` |
| PostgreSQL 16/17 | https://www.enterprisedb.com/downloads/postgres-postgresql-downloads → installer (mot de passe `postgres` noté ; port 5432 ; cocher pgAdmin optionnel) | `winget install PostgreSQL.PostgreSQL.17` | `psql --version` (si absent du PATH : `C:\Program Files\PostgreSQL\17\bin`) |
| VSCode | https://code.visualstudio.com | `winget install Microsoft.VisualStudioCode` | ouverture du dossier repo sans erreur |

Docker Desktop **n'est pas requis** (Postgres natif suffit ; Docker n'est utile que pour
`supabase start`, optionnel §5). Ne l'installez pas maintenant (PC unique, ressources).

## 2. Installation du projet (une seule fois)

Ouvrir **Git Bash** (menu Démarrer → « Git Bash »), puis :

```bash
cd /c/chemin/vers/vos/projets          # ex. /c/Users/Vous/dev
git clone https://github.com/Stane316/deo-gracias-wifi-system.git
cd deo-gracias-wifi-system
npm ci                                 # installe tous les workspaces depuis le lockfile
```

Créer la base locale (mot de passe = celui choisi à l'installation Postgres) :

```bash
export PATH="$PATH:/c/Program Files/PostgreSQL/17/bin"   # si psql introuvable
psql -U postgres -h 127.0.0.1 -c "CREATE DATABASE deo_gracias;"
```

Fichier d'environnement local (JAMAIS commité — `.gitignore` couvre `.env`) :

```bash
cp .env.example .env
```

Éditer `.env` (VSCode) et renseigner **uniquement** :

```dotenv
DATABASE_URL=postgres://postgres:VOTRE_MDP_LOCAL@127.0.0.1:5432/deo_gracias
AUTH_DEV_MODE=1
```

(`AUTH_DEV_MODE=1` active le mode développement de l'OTP client : le code à 6 chiffres
est renvoyé dans la réponse — pratique pour tester sans SMS. Ne jamais l'activer sur un
déploiement réel. `SUPABASE_URL`/`SUPABASE_ANON_KEY` ne sont nécessaires que pour
l'auth admin/jetons Supabase ; laissez-les vides en local pour l'instant.)

Les autres variables (FedaPay, Supabase cloud, connector) restent **vides** en local :
inutiles avant IMP-14+ et interdites de saisie ici (règle INC-01).

## 3. Migrations + vérifications de la base (après chaque pull qui ajoute des migrations)

Toujours dans Git Bash, à la racine du repo :

```bash
export DATABASE_URL="postgres://postgres:VOTRE_MDP_LOCAL@127.0.0.1:5432/deo_gracias"
bash tools/db-migrate.sh up       # applique 0001→0010 (idempotent : déjà jouées = no-op)
bash tools/db-migrate.sh smoke    # contrat de schéma (15 tables…)
bash tools/db-migrate.sh rls      # matrice RLS anon/authenticated/service_role
bash tools/db-migrate.sh states   # gardes de transitions + audit (IMP-11)
```

Attendu : `OK: up (10 migrations appliquées)`, `OK: smoke`, `OK: rls`,
`OK: states` (NOTICE « transitions interdites refusées, chaînes valides acceptées,
audit alimenté (14) »). En cas d'échec : `bash tools/db-migrate.sh reset` (down+up
complets) puis relancer smoke/rls/states.

> La migration `0010` (IMP-16) seede le stock réel Mikmon : 6 batches et
> 660 tickets hashés (aucun code en clair dans le repo — les PDF du coffre
> sont l'unique source). `smoke` vérifie désormais cette structure (6 batches,
> 660 tickets, unicité des empreintes, distribution Grille A). Les tests
> d'intégration partagent cette base seedée mais ne la consomment JAMAIS
> (parking hors allocation pendant les suites IMP-14/15).

> La base locale est un bac à sable : `reset` ne détruit QUE la base locale, jamais le
> cloud (le cloud se gère exclusivement via GUIDE-07).

## 4. Lancer l'API backend (session de travail normale)

```bash
# Git Bash, à la racine :
export DATABASE_URL="postgres://postgres:VOTRE_MDP_LOCAL@127.0.0.1:5432/deo_gracias"
npm run dev -w @dg/backend        # mode watch (recharge à chaque sauvegarde)
# ou, sans watch :
npm run start -w @dg/backend
```

Attendu dans la console : log pino `Server listening at http://127.0.0.1:3000`.
Arrêt : `Ctrl+C`.

Tester (nouveau terminal, ou navigateur pour les GET) :

```bash
curl http://127.0.0.1:3000/healthz        # {"status":"ok","app":"dg-backend"}
curl http://127.0.0.1:3000/readyz         # {"status":"ready"}
curl http://127.0.0.1:3000/offers         # les 6 offres Grille A (JSON)
curl -X POST http://127.0.0.1:3000/orders \
  -H "content-type: application/json" \
  -H "Idempotency-Key: test-local-0001" \
  -d '{"offer_id":"24-HEURES","customer_phone":"0197000001"}'

# Auth client (OTP dev, IMP-13) :
curl -X POST http://127.0.0.1:3000/auth/phone/request \
  -H "content-type: application/json" -d '{"phone":"0197000001"}'   # → dev_code
curl -X POST http://127.0.0.1:3000/auth/phone/verify \
  -H "content-type: application/json" \
  -d '{"phone":"0197000001","code":"LE_DEV_CODE"}'                  # → token
curl http://127.0.0.1:3000/auth/me -H "Authorization: Bearer LE_TOKEN"
```

Équivalents **PowerShell** (si vous préférez) :

```powershell
$env:DATABASE_URL="postgres://postgres:VOTRE_MDP_LOCAL@127.0.0.1:5432/deo_gracias"
npm run dev -w "@dg/backend"
Invoke-RestMethod http://127.0.0.1:3000/healthz
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3000/orders `
  -ContentType "application/json" -Headers @{ "Idempotency-Key" = "test-local-0001" } `
  -Body '{"offer_id":"24-HEURES","customer_phone":"0197000001"}'
```

> `db-migrate.sh` est un script bash : sous Windows il s'exécute **uniquement via Git
> Bash** (pas PowerShell). L'API, elle, se lance des deux.

## 5. Optionnel — stack Supabase locale (Docker)

Utile seulement pour tester Auth/Storage en conditions « Supabase » sans cloud.
**Non requis pour IMP-12/13** (l'API tourne sur Postgres nu). Si installé un jour :

| Action | Méthode A — graphique | Méthode B — CLI | Vérification |
|---|---|---|---|
| Démarrer la stack | Docker Desktop → Containers → démarrer `supabase_*` | `supabase start` | http://127.0.0.1:54323 (Studio local) |
| Base locale Supabase | Studio local → SQL Editor | `supabase db reset` (rejoue migrations/ + seed) | tables présentes dans le Studio |
| Arrêter | Docker Desktop → Stop | `supabase stop` | containers arrêtés |

## 6. Tests et qualité (avant/après chaque modification)

```bash
npm ci                    # UNIQUEMENT si package-lock.json a changé (pull agent)
npm run typecheck         # tsc --noEmit sur les 4 workspaces
npm test                  # vitest partout ; sans DATABASE_URL : tests d'intégration backend skippés proprement
DATABASE_URL="postgres://postgres:VOTRE_MDP_LOCAL@127.0.0.1:5432/deo_gracias" npm test   # tout, intégration incluse
```

Attendu actuellement : typecheck 4/4 ; tests **149/149** avec DATABASE_URL
(backend 102 dont 23 d'intégration réelle — y compris concurrence d'allocation
de tickets, vérification du stock seedé 0010 et statistiques admin sur base
réelle, shared 45, frontend 1, connector 1), 126 + 23 skippés sans.
C'est exactement ce que joue la CI GitHub à chaque push.

## 7. Commandes régulières — mémo

| Situation | Commandes (Git Bash, racine du repo) |
|---|---|
| Récupérer le travail de l'agent | `git pull` puis `npm ci` (si lockfile touché) puis §3 si nouvelles migrations |
| Démarrer une session | `export DATABASE_URL=...` (ou `.env`) → `npm run dev -w @dg/backend` |
| Vérifier avant de pousser | `npm run typecheck && npm test` (+ §3 si SQL touché) |
| Base locale corrompue | `bash tools/db-migrate.sh reset` puis `smoke`, `rls`, `states` |
| Tout réinstaller (node_modules) | supprimer `node_modules/` puis `npm ci` |

## 8. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `DATABASE_URL requise` | variable non exportée dans CE terminal | `export DATABASE_URL=...` (Git Bash) ou `$env:DATABASE_URL=...` (PowerShell) ; chaque nouveau terminal repart à zéro |
| `psql: command not found` | binaires Postgres hors PATH | `export PATH="$PATH:/c/Program Files/PostgreSQL/17/bin"` ou réinstaller en cochant « Command Line Tools » |
| `ECONNREFUSED 127.0.0.1:5432` | service Postgres arrêté | services Windows → démarrer `postgresql-x64-17` ; ou `pg_ctl` |
| `port 3000 already in use` | ancien serveur encore lancé | fermer l'ancien terminal ; ou `PORT=3001 npm run dev -w @dg/backend` |
| Erreurs VSCode `ts(2591)`/`ts(2339)` | node_modules désynchronisé du lockfile | `npm ci` + palette « TypeScript: Restart TS Server » (cf. DEVELOPMENT.md) |
| Tests d'intégration « skipped » | `DATABASE_URL` absente au moment de `npm test` | normal sans base ; les exécuter : préfixer la commande (§6) |
| `npm run dev` s'arrête immédiatement | `.env` vide et variable non exportée | vérifier §2/§4 ; le serveur exige DATABASE_URL |
| Échec après `git pull` | dépendances/migrations pas rejouées | `npm ci` (lockfile) + `bash tools/db-migrate.sh up` |

## 9. Rappels de sécurité (non négociables)

1. `.env` reste local : jamais commité, jamais copié dans le chat, jamais dans un ticket.
2. Aucun secret cloud (Supabase, FedaPay) n'est nécessaire pour le local — les routes
   concernées arrivent avec leurs IMP respectifs et leurs propres guides.
3. La base locale ne contient que des données de test ; les vrais tickets/dumps restent
   au coffre (règle permanente).
4. Rien dans ce guide n'écrit sur le routeur MikroTik (interdit avant IMP-21/23, guides validés).
