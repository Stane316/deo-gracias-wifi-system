# GUIDE-10 — Intégration & mise en service de l'environnement (Supabase, Postgres, services)

> **Pourquoi ce guide existe** : « code écrit ≠ système configuré ». Ce guide
> liste CE QUI EXISTE réellement dans le dépôt, CE QUI a été configuré, CE QUI
> reste à exécuter, dans quel ordre, en méthode **GUI** et **CLI**, avec
> résultats attendus et erreurs connues. Aucune invention : tout renvoie à des
> fichiers réels du repo.

---

## Étape 0 — Ce que contient VRAIMENT le dépôt (audit)

```text
supabase/
├── config.toml          # config Supabase CLI (project_id = PLACEHOLDER, à lier)
├── migrations/          # 12 migrations OFFICIELLES, ordonnées 0001→0012
└── down/                # 12 rollbacks (jamais exécutés pour installer ;
                         # servent à `tools/db-migrate.sh down` / reset)
tools/
├── db-migrate.sh        # applique up/down/reset + smoke/rls/states (psql pur)
├── db-smoke.sql         # assertions post-migration (6 plans, 660 tickets…)
├── db-rls-tests.sql     # tests RLS (à exécuter pour vérifier, pas pour installer)
├── db-state-tests.sql   # tests gardes d'état (idem)
└── gen-seed-stock-0010.py  # GÉNÉRATEUR du seed 0010 (déjà consommé : ne PAS rejouer)
```

Il n'existe **AUCUN** dossier `supabase/tables/` ni de SQL dupliqués : chaque
table est créée **exactement une fois** dans les 12 migrations (vérifié par
analyse : customers, plans, orders, payments, payment_events, tickets,
ticket_batches, mikrotik_sync, access_sessions, reconciliation_runs,
audit_logs, incidents, alerts, settings, state_transitions = 1 création chacune).

### Rôle de chaque fichier SQL

| Fichier | Type | Crée / fait | Doit être exécuté ? | Dépend de |
|---|---|---|---|---|
| migrations/0001_extensions.sql | migration | extensions pgcrypto + `set_updated_at()` | OUI, 1er | rien |
| 0002_customers_plans.sql | migration | `customers`, `plans` (+enum-like checks) | OUI, 2e | 0001 |
| 0003_orders_payments.sql | migration | `orders`, `payments`, `payment_events` + FK | OUI | 0002 |
| 0004_tickets_batches.sql | migration | `ticket_batches`, `tickets` + FK + guards partielles | OUI | 0002/0003 |
| 0005_mikrotik_sync_sessions.sql | migration | `mikrotik_sync`, `access_sessions`, `reconciliation_runs` | OUI | 0004 |
| 0006_audit_incidents_alerts.sql | migration | `audit_logs` (insert-only), `incidents`, `alerts`, `settings` | OUI | 0001 |
| 0007_rls_policies.sql | migration | **RLS** sur toutes les tables + politiques | OUI | 0002-0006 |
| 0008_seed_plans_grille_a.sql | seed | 6 plans Grille A (idempotent : ON CONFLICT) | OUI | 0002 |
| 0009_state_guards.sql | migration | trigger `guard_state_transition` + audit transitions | OUI | 0003-0005 |
| 0010_seed_stock_mikmon.sql | seed | 660 tickets legacy hashés (NON rejouable : générée une fois) | OUI, 1 fois | 0004 |
| 0011_activation_deadline.sql | migration | colonne `activation_deadline` + transition SOLD→EXPIRED | OUI | 0004/0009 |
| 0012_ticket_code_vault.sql | migration | colonne `tickets.code_cipher` (sceau chiffré du code) | OUI | 0004 |
| down/*.sql | **rollback** | supprime ce que la migration crée | **NON pour installer** | — |
| tools/db-smoke.sql | vérification | assertions SELECT | optionnel (recommandé) | base migrée |
| tools/db-rls-tests.sql / db-state-tests.sql | tests | vérifient RLS/gardes | optionnel | base migrée |

**Ne JAMAIS exécuter** : `down/` pour installer, `gen-seed-stock-0010.py`
(données déjà figées dans 0010), `db-rls-tests`/`db-state-tests` comme
migrations.

---

## Étape 1 — Cause exacte de « relation "customers" already exists »

1. `customers` est créé **une seule fois**, dans `0002` (ligne 6).
2. L'erreur signifie : au moment où 0002 a été lancé, la table existait DÉJÀ.
3. Sur une base neuve, la chaîne 0001→0012 s'exécute sans erreur (prouvé :
   base vide → up → smoke → down → up → rls → states, tout vert ; CI GitHub
   idem sur Postgres 16 et 17).
4. Conclusion : l'erreur vient d'une **exécution manuelle répétée ou
   partielle** dans le SQL Editor (ex. 0002 lancé une première fois, échec ou
   interruption en cours de script, puis relancé ; ou 0002 relancé « pour
   vérifier »). Le SQL Editor n'a **aucun historique** : il rejoue tout le
   script à chaque clic « Run ».
5. Ce n'est PAS un défaut des migrations et PAS un doublon de fichiers.

### Votre situation = Cas A (base de développement jetable)

Votre projet Supabase ne contient que des tentatives de migrations et aucune
donnée réelle → **réinitialisation propre recommandée**, puis exécution
ordonnée **une seule fois**.

---

## Étape 2 — Réinitialiser proprement le projet Supabase (GUI)

1. Ouvrir https://supabase.com/dashboard → votre projet.
2. Menu gauche → **SQL Editor** (icône base de données / « SQL »).
3. « New query », coller EXACTEMENT :

```sql
drop schema if exists public cascade;
create schema public;
grant all on schema public to postgres, public;
```

4. « Run ». Résultat attendu : `Success. No rows returned`.
5. Vérifier le vide : menu gauche → **Table Editor** → la liste des tables
   `public` est vide (les sections Auth/Storage restent, elles vivent dans
   d'autres schémas — normal).

> Cette opération ne touche NI `auth`, NI `storage`, NI les réglages du
> projet : uniquement le schéma `public` (celui de nos tables).

**CLI alternative** : `psql "$DATABASE_URL" -c "drop schema public cascade; create schema public;"`.

---

## Étape 3 — Récupérer la chaîne de connexion (DATABASE_URL)

**GUI** : Dashboard → roue crantée **Project Settings** (bas du menu gauche) →
**Database** → section **Connection string** → onglet **URI** → choisir le
mode **Direct connection** (session, port 5432) → copier l'URI
`postgres://postgres.[ref]:[YOUR-PASSWORD]@db.[ref].supabase.co:5432/postgres`
→ remplacer `[YOUR-PASSWORD]` par le mot de passe du projet.

Mot de passe oublié : même page → **Reset database password** (le nouveau mot
de passe s'affiche une fois : copiez-le dans votre `.env`, jamais au repo).

> ⚠️ **LES DEUX URL SUPABASE — ne JAMAIS les intervertir** (erreur observée en
> réel le 24/09, `connect ETIMEDOUT …:5432`) :
>
> | Variable | Forme exacte | Où la lire |
> |---|---|---|
> | `DATABASE_URL` | `postgres://postgres.[ref]:MOT_DE_PASSE@db.[ref].supabase.co:5432/postgres` | Settings → **Database** → Connection string → URI (Direct) |
> | `SUPABASE_URL` | `https://[ref].supabase.co` | Settings → **API** → Project URL |
>
> Copier l'URL `https://…supabase.co` dans `DATABASE_URL` fait tenter à pg une
> connexion TCP vers `https://` → timeout. Depuis IMP-25.4, le backend **refuse
> de démarrer** avec un message qui nomme exactement cette confusion.

**Vérifier sans révéler** : dans un terminal, `echo $DATABASE_URL | cut -c1-30`
(montre le début seulement) ou tester la connexion :
`psql "$DATABASE_URL" -c "select 1"`.

**Projets Supabase récents — hôte Direct IPv6-seul, pooler Supavisor requis
(cause prouvée en réel le 25/09 par interrogation DNS publique 1.1.1.1/8.8.8.8 :
`db.<ref>.supabase.co` ne publie AUCUN enregistrement IPv4, seulement un AAAA
IPv6 ; le pooler `aws-0-<region>.pooler.supabase.com` publie bien de l'IPv4)**.

Conséquence : sans IPv6 sur votre réseau (cas général à domicile), Windows/Node
échoue en `ENOTFOUND`/`ENETUNREACH` sur l'URI de l'onglet **URI** (Direct).
L'onglet URI du Dashboard montre bien `db.<ref>…` : c'est normal, mais ce n'est
**pas** la bonne URL pour vous.

**La bonne URL** : Settings → Database → section **« Connection pooling »**
(Supavisor) → copier l'URI :
- mode **Session** (port **5432**) : recommandé pour ce backend ;
- mode **Transaction** (port **6543**) : fonctionne aussi.
Forme : `postgresql://postgres.<ref>:MOT_DE_PASSE@aws-0-<region>.pooler.supabase.com:5432/postgres`.
Collez-la dans `DATABASE_URL`, redémarrez le backend.

Alternatives si vous tenez au Direct : activer l'IPv6 de bout en bout, ou
l'add-on IPv4 Supabase (payant) — non recommandé.

Le backend traduit chaque panne de connexion (DNS/IPv6, refus, timeout,
mot de passe, TLS) en message actionnable au lieu d'une erreur brute (IMP-25.5/25.6).

---

## Étape 4 — Appliquer les 12 migrations (au choix)

### Méthode CLI (RECOMMANDÉE : historique + idempotence)

Le dossier `supabase/migrations/` est AU FORMAT Supabase CLI : `db push`
applique dans l'ordre et enregistre chaque migration dans la table
`supabase_migrations.schema_migrations` → une migration déjà appliquée n'est
**jamais rejouée** (impossible de reproduire votre erreur).

```bash
# 1. Installer le CLI (une fois) : https://supabase.com/docs/guides/cli
npm install -g supabase        # ou brew install supabase / scoop
supabase login                 # ouvre le navigateur
# 2. Lier le repo à VOTRE projet (référence visible dans Dashboard → Settings → General → Project ID)
supabase link --project-ref <VOTRE-REF>
# 3. Pousser les migrations
supabase db push --db-url "$DATABASE_URL"
# 4. Vérifier l'état
supabase migration list --linked
```

Résultat attendu : 12 lignes `Applied`. Erreur possible : `project not linked`
→ refaire l'étape 2.

### Méthode GUI (SQL Editor) — si vous préférez

Sur la base RÉINITIALISÉE (étape 2), ouvrir CHAQUE fichier de
`supabase/migrations/` **dans l'ordre 0001 → 0012**, coller son contenu dans
une nouvelle requête, **Run UNE SEULE FOIS**, attendre `Success` avant le
suivant. Ne JAMAIS recliquer Run sur un fichier déjà passé, même « pour voir ».

Après 0012 : Table Editor → vous devez voir 15 tables `public` :
`customers, plans, orders, payments, payment_events, tickets, ticket_batches,
mikrotik_sync, access_sessions, reconciliation_runs, audit_logs, incidents,
alerts, settings, state_transitions`.

Vérification finale (SQL Editor) :

```sql
select count(*) from public.plans;              -- attendu : 6
select count(*) from public.tickets;            -- attendu : 660
select count(*) from public.alerts;             -- attendu : 0
```

---

## Étape 5 — Le fichier `.env` complet (backend + frontend)

Créer `.env` **à la racine du repo** (exclu de Git). Le backend le lit
automatiquement (dotenv, IMP-25.1).

| Variable | Sensibilité | Où la trouver | Exemple FICTIF | Commiter ? |
|---|---|---|---|---|
| `APP_ENV` | RUNTIME REQUIRED | `.env.example` | `local` / `test` / `staging` / `production` | non |
| `DATABASE_URL` | SECRET (server-only) | étape 3 | `postgres://postgres.abc:xxxx@db.abc.supabase.co:5432/postgres` | **JAMAIS** |
| `SUPABASE_URL` | PUBLIC (client-safe) | Settings → API → Project URL | `https://abc.supabase.co` | non (mais public) |
| `SUPABASE_ANON_KEY` | PUBLIC (client-safe) | Settings → API → anon public | `eyJhbGciOi…` | non (mais public) |
| `AUTH_DEV_MODE` | LOCAL ONLY | valeur `1` en démo | `1` | non |
| `DEV_ADMIN_TOKEN` | SECRET local | valeur inventée longue | `dg-demo-9f27…` | **JAMAIS** |
| `PAYMENT_DEV_MODE` | LOCAL ONLY | `1` en démo | `1` | non |
| `CONNECTOR_TOKEN` | SECRET (server-only) | valeur inventée longue | `cn-8c41…` | **JAMAIS** |
| `FEDAPAY_SECRET_KEY` | SECRET | dashboard FedaPay | — **différé** (§7) | **JAMAIS** |
| `FEDAPAY_WEBHOOK_SECRET` | SECRET | dashboard FedaPay | — **différé** | **JAMAIS** |
| `PORT` / `HOST` / `WORKERS` / `BACKEND_PORT` | LOCAL ONLY | optionnels | `3000`/`0.0.0.0` | non |

Rappel garde-fous : `DEV_ADMIN_TOKEN` inactif si `SUPABASE_URL` présent ;
`PAYMENT_DEV_MODE` inactif si clé FedaPay présente.

---

## Étape 6 — Auth admin : DEV maintenant, Supabase ensuite

- **Maintenant (démo)** : laisser `SUPABASE_URL`/`SUPABASE_ANON_KEY` **vides**
  et utiliser `DEV_ADMIN_TOKEN` dans l'onglet Administration.
- **Plus tard (production)** : remplir `SUPABASE_URL` + `SUPABASE_ANON_KEY`,
  créer l'utilisateur admin dans Dashboard → **Authentication** → Users →
  ajouter l'email + mot de passe, puis lui donner le rôle via
  `app_metadata` : `{"role":"ADMIN"}` (Authentication → user → actions →
  « Edit user » / « Update user metadata », selon version). Le code lit
  `app_metadata.role` (ADMIN ou SUPER_ADMIN). Aucune migration nécessaire.
- OTP client : en démo le code s'affiche (AUTH_DEV_MODE=1). En production il
  faudra un fournisseur SMS OU l'OTP Supabase côté frontend — décision
  propriétaire toujours ouverte (IMP-13).

---

## Étape 7 — FedaPay : **configuration différée — aucune action nécessaire maintenant**

Vérifié dans le code : `FedaPayClient` n'est instancié QUE si
`FEDAPAY_SECRET_KEY` est définie ; sinon les routes de paiement réelles
répondent 503 honnête et la démo utilise `PAYMENT_DEV_MODE=1` (chemin serveur
identique au webhook réel). Le jour voulu : compte FedaPay sandbox →
Dashboard → Developers → API keys (secret) + Webhooks (secret + URL publique
`https://VOTRE-HOTE/webhooks/fedapay`) → renseigner les 3 variables → redémarrer.
Guide détaillé existant : docs/03_PAYMENT_STUDY.md.

---

## Étape 8 — Autres services : inventaire honnête

| Service | Utilisé maintenant ? | Action |
|---|---|---|
| Supabase DB (Postgres hébergé) | OUI | étapes 2-4 |
| Supabase Auth | NON (démo DEV) | étape 6 plus tard |
| Supabase Storage / Buckets | **NON** (aucun bucket dans le code) | rien |
| Supabase Edge Functions | **NON** (`config.toml [functions]` vide) | rien |
| PostgreSQL local | OPTIONNEL (alternative à Supabase : DATABASE_URL locale + `tools/db-migrate.sh up`) | GUIDE-08 |
| FedaPay | différé | étape 7 |
| SMS / email | NON | rien (décision attendue) |
| MikroTik / Connector | NON avant W2 (routeur réel) | IMP-23/24 prêts, GUIDE-05 |
| Hébergement cloud du backend | NON (Phase 1 : votre PC, OD-1) | plus tard |

---

## Étape 9 — Lancer et valider visuellement

```bash
npm install                     # après CHAQUE récupération de fichiers
npm run start -w @dg/backend    # lit .env ; « Server listening … :3000 »
npm run dev -w @dg/frontend     # « Local: http://localhost:5173 »
```

Ouvrir http://localhost:5173 :

- [ ] en-tête blanc, logo « WIFI ZONE », titre bleu, pied cyan « Merci pour votre confiance » ;
- [ ] 6 offres Grille A avec prix (servis par le backend) ;
- [ ] connexion OTP : code affiché (mode DEV), session créée ;
- [ ] commande → paiement → « Simuler l'approbation » → état DELIVERED, ticket listé ;
- [ ] Administration : jeton DEV → tableau de bord, tickets, réconciliation ;
- [ ] aucune erreur rouge dans la console navigateur (F12) ;
- [ ] `curl http://localhost:3000/readyz` → `{"status":"ready"}`.

Erreur connue résolue ce tour : `ECONNREFUSED 127.0.0.1:3001` venait d'un
désalignement de ports (vite visait 3001, backend par défaut 3000) — le proxy
vise désormais 3000 par défaut (`BACKEND_PORT` pour changer).

---

## Étape 10 — Tests de non-régression

```bash
npm run typecheck        # 4 paquets, 0 erreur
DATABASE_URL=… npm test  # tests unitaires + intégration PostgreSQL lorsque la base est disponible
npm run build            # build frontend et contrôle CI local
```

Sans `DATABASE_URL`, les tests PostgreSQL sont ignorés explicitement ; ils ne
sont pas comptés comme une validation verte. La CI fournit un PostgreSQL
éphémère, applique les migrations, exécute les tests puis le build. Les tests
IMP-25.6 vérifient aussi que les diagnostics et erreurs 5xx ne recopient aucune
valeur secrète.

Sur la base Supabase, après migrations : les 3 SELECT de l'étape 4
(6 plans / 660 tickets / 0 alertes) sont la validation minimale ;
`tools/db-migrate.sh smoke` fonctionne aussi contre DATABASE_URL Supabase.

---

## Étape 11 — Diagnostic « la relation public.plans n'existe pas »

Symptôme : l'interface s'affiche mais la carte Offres montre cette erreur.
Signification : le backend est **connecté** à une base, mais cette base n'a
**pas le schéma**. Depuis IMP-25.3, `/readyz` et `/offers` répondent 503
« Base non migrée » avec la liste des tables manquantes, et le log de
démarrage affiche uniquement la cible réseau (`postgres://hote:port`), jamais
l'utilisateur, le mot de passe, le chemin de base ou les paramètres URI.

Procédure structurée (PowerShell) :

```powershell
# 1. Quelle base le backend vise-t-il ? (mot de passe masqué)
$env:DATABASE_URL -replace ':[^:@/]+@', ':***@'

# 2. Cette base a-t-elle le schéma ? (psql ou SQL Editor)
psql $env:DATABASE_URL -c "select count(*) from information_schema.tables where table_schema='public'"
```

- Résultat **0 ou < 15** → la base visée n'est pas migrée : appliquez l'étape 4
  sur CETTE base (ou corrigez DATABASE_URL vers la bonne base).
- Résultat **15** mais l'erreur persiste → le backend lit un autre `.env` ou
  une variable exportée ailleurs : redémarrez le backend dans le terminal où
  `.env` est à la racine du repo ; le log de démarrage montre la cible.

Côté Supabase (vérité visuelle) : SQL Editor →
`select count(*) from public.plans;` → 6 si vos migrations y sont bien
passées. Si 6 côté Supabase et 0 côté DATABASE_URL : votre `.env` pointe une
autre base (souvent un Postgres local resté par défaut) → remplacez
DATABASE_URL par l'URI Supabase (étape 3) et redémarrez le backend.

## Ordre résumé

```text
npm install → .env → reset schéma public (ét.2) → migrations 0001→0012 (ét.4)
→ vérifs SELECT → backend → frontend → parcours visuel → tests
```
