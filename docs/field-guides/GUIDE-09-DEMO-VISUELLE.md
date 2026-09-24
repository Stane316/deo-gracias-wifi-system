# GUIDE-09 — Démo visuelle locale (IMP-25)

> **Objectif** : voir et manipuler la plateforme complète sur votre PC —
> interface client (commande → paiement → ticket) et console d'administration
> (tableau de bord, tickets, réconciliation), branchées sur le backend réel et
> Postgres.
>
> **Statut** : IMP-25 livré. Paiement et connexion admin en **mode DEV**
> (variables explicites, jamais actives en production). Production = Supabase
> Auth + FedaPay réels (aucun changement de code, seulement les variables).

---

## 1. Prérequis & mise à jour des dépendances

| Prérequis | Vérification |
|---|---|
| Node.js ≥ 20 | `node --version` |
| Dépendances à jour | `npm install` à la racine |
| Une base Postgres migrée | locale (§2-A) **ou** projet Supabase (§2-B) |

> **Après CHAQUE récupération de fichiers** : exécutez `npm install` à la racine
> AVANT toute commande `dev`/`start`. Les nouvelles dépendances (React, Vite,
> dotenv…) sont déclarées dans les `package.json`/`package-lock.json` du repo ;
> sans `npm install`, Vite échoue avec `Cannot find package '@vitejs/plugin-react'`.

## 2. Le fichier `.env` — toutes les variables, où les trouver

Le backend lit `.env` **à la racine du monorepo** (ou dans `apps/backend`) ;
une variable déjà présente dans l'environnement garde priorité. Le fichier est
exclu de Git (`.gitignore`). Copiez `.env.example` vers `.env` puis remplissez.

### 2-A. Configuration « 100 % locale » (recommandée pour tester)

```env
DATABASE_URL=postgres://postgres:VOTRE_MDP_LOCAL@127.0.0.1:5432/postgres
AUTH_DEV_MODE=1
DEV_ADMIN_TOKEN=choisissez-un-jeton-long-aleatoire
PAYMENT_DEV_MODE=1
CONNECTOR_TOKEN=choisissez-un-autre-jeton
```

Base locale : PostgreSQL installé selon GUIDE-08, puis `bash tools/db-migrate.sh up`
(11 migrations + seed). `DATABASE_URL` = votre utilisateur/mot de passe local.

### 2-B. Configuration « tout sur Supabase » (votre choix)

Supabase **EST** votre base Postgres hébergée : le backend s'y connecte
directement avec la chaîne de connexion — `DATABASE_URL` reste donc
**indispensable**, c'est simplement l'URL Supabase au lieu de l'URL locale.

| Variable | Où la trouver (GUI Supabase) | Rôle |
|---|---|---|
| `DATABASE_URL` | Dashboard projet → **Settings (roue) → Database → Connection string → URI**, mode **Direct connection** (port 5432) ; remplacez `[YOUR-PASSWORD]` par le mot de passe du projet (Settings → Database → *Reset database password* si perdu) | connexion backend ↔ Postgres Supabase |
| `SUPABASE_URL` | **Settings → API → Project URL** | vérification des JWT admin (facultatif en démo) |
| `SUPABASE_ANON_KEY` | **Settings → API → anon public key** (clé publique par conception) | idem (facultatif en démo) |
| `AUTH_DEV_MODE=1` | — (valeur fixe) | affiche le code OTP au lieu d'un SMS |
| `DEV_ADMIN_TOKEN` | — (valeur libre longue) | connexion admin de la démo (ignoré si SUPABASE_URL est défini) |
| `PAYMENT_DEV_MODE=1` | — (valeur fixe) | paiement simulé (ignoré si clé FedaPay définie) |
| `CONNECTOR_TOKEN` | — (valeur libre longue) | active les routes `/connector` |
| `FEDAPAY_SECRET_KEY`, `FEDAPAY_WEBHOOK_SECRET`, `FEDAPAY_ENVIRONMENT` | Dashboard FedaPay → paramètres API/webhooks (GUIDE-03) | paiements réels (absents en démo) |

Migrations vers Supabase (une seule fois) :

```bash
DATABASE_URL='postgres://postgres:[VOTRE-PASSWORD]@db.<ref>.supabase.co:5432/postgres' bash tools/db-migrate.sh up
```

(ou `supabase db push` selon GUIDE-07). Après cela, la démo lit/écrit DANS
votre projet Supabase : les données de test (téléphones `019725…`, commandes
de démo) y seront visibles — nettoyez-les ou utilisez la config 2-A pour
essayer sans toucher au cloud.

### 2-C. Exemple `.env` complet « Supabase + démo »

```env
DATABASE_URL=postgres://postgres:VOTRE-PASSWORD@db.VOTRE-REF.supabase.co:5432/postgres
SUPABASE_URL=https://VOTRE-REF.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOi...
AUTH_DEV_MODE=1
PAYMENT_DEV_MODE=1
CONNECTOR_TOKEN=choisissez-un-jeton-long
```

> Avec `SUPABASE_URL` défini, l'admin se connecte par compte Supabase (rôle
> ADMIN) ; retirez `SUPABASE_URL`/`SUPABASE_ANON_KEY` pour utiliser
> `DEV_ADMIN_TOKEN` à la place.

Garde-fous codés en dur : le jeton admin DEV n'est actif **que si Supabase
n'est PAS configuré** ; le paiement DEV n'est actif **que si aucune clé
FedaPay n'est définie** ; `POST /webhooks/dev-approve` n'approuve **que** les
paiements au préfixe `DEV-`.

## 3. Lancer la démo

```bash
npm install            # après chaque récupération de fichiers
npm run start -w @dg/backend    # lit .env ; port 3000 par défaut (PORT=…)
npm run dev -w @dg/frontend     # port 5173 ; BACKEND_PORT=… si PORT changé
```

Ouvrez **http://localhost:5173**.

## 4. Parcours client (onglet « Espace client »)

1. **Connexion** : entrez un numéro (ex. `0197250099`) → « Recevoir le code » :
   le code OTP s'affiche (mode DEV) et se pré-remplit → « Valider ».
2. **Offres** : les 6 offres de la Grille A s'affichent (prix servis par le
   backend, jamais recalculés côté navigateur — doc 10 §10.3).
3. **Commande** : cliquez une offre → la commande est créée (clé
   d'idempotence automatique) → « Payer ».
4. **Paiement** : référence `DEV-…` créée → « Simuler l'approbation » :
   c'est exactement le même chemin serveur que le webhook FedaPay réel
   (confirmation → allocation atomique → livraison).
5. **Ticket** : l'état passe à `DELIVERED` et « Mes tickets » affiche le
   ticket (préfixe du code seulement — jamais le code complet à l'écran, D2).

## 5. Console d'administration (onglet « Administration »)

Entrez le `DEV_ADMIN_TOKEN` :

- **Tableau de bord** (IMP-17) : revenu/commandes/paiements/tickets du jour,
  état système, inventaire.
- **Tickets** : statistiques détaillées par état/offre.
- **Réconciliation** (IMP-24) : runs `reconciliation_runs` (statut, attendu,
  vu, violations, anomalies) + alertes ouvertes avec bouton **Acquitter**.

Pour alimenter la vue depuis le « routeur » (dry-run) :

```bash
curl -X POST http://localhost:3001/connector/inventory/report \
  -H "Authorization: Bearer $CONNECTOR_TOKEN" -H 'content-type: application/json' \
  -d '{"router_total_seen":2,"status":"MISMATCH","violations":["ticket_paye_absent:1"],
       "anomalies":[{"kind":"ticket_paye_absent","detail":"name=dgxxxxxx comment=vc-001-09.24.26-"}],
       "by_profile":{"5-HEURES":1},"admin_free_seen":0,"journal_sales":0}'
```

## 6. Vérifications rapides

| Vérification | Commande | Attendu |
|---|---|---|
| API prête | `curl localhost:3001/readyz` | `{"status":"ready"}` |
| Offres | `curl localhost:3001/offers` | 6 offres Grille A |
| Jeton admin | `curl -H "Authorization: Bearer $DEV_ADMIN_TOKEN" localhost:3001/admin/me` | `role: ADMIN` |
| Tests complets | `npm test` (avec `DATABASE_URL`) | 265/265 |

## 7. Limites connues de la démo

- Pas de SMS réel : l'OTP est affiché (décision budget nul, IMP-13).
- Le « routeur » est simulé (DryRunConnector) jusqu'au W2 ; la vue
  réconciliation montre des rapports produits par le Connector (réels en W2).
- Les données créées en démo restent dans votre base locale (téléphones
  `0197…`, clés `dg-demo-…`) ; la base de production Supabase n'est jamais
  touchée par ce guide.
