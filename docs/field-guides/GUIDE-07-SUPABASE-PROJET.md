# GUIDE-07 v2 — Projet Supabase : création + migrations 0001→0006 (méthodes GUI et CLI)

> **Qui exécute** : le propriétaire, sur sa propre machine (le compte Supabase est le sien ;
> l'agent n'a et n'aura jamais les credentials ; l'agent n'exécute aucune migration à distance).
> **Version v2 (17/09/2026)** : ajoute la **méthode A (Dashboard SQL Editor)** demandée,
> la **méthode B (CLI)** testée en sandbox par l'agent (CLI 2.117.0), et le tableau comparatif.
> **Coût** : 0 FCFA (free tier). **Durée** : 15–25 min.
> **Prérequis** : compte Supabase, repo à jour (commit IMP-09 intégré), migrations présentes
> dans `supabase/migrations/0001…0006.sql`.

## 0. Règles de sécurité (rappel INC-01)

- Mot de passe base et `service_role key` : coffre-fort uniquement ; JAMAIS chat/repo/dashboard partagé.
- `anon key` : publique par conception (frontend), jamais dans le repo.
- Aucune saisie de secret dans le code source ou le dépôt.

## 1. Créer le projet — interface graphique uniquement

> La création d'un projet cloud Supabase n'existe **pas** en CLI (le CLI ne crée que des
> projets locaux Docker). Une seule méthode ici, et c'est normal.

1. https://supabase.com/dashboard → connexion → **New project**.
2. Organization : la vôtre (sinon en créer une : `deo-gracias`).
3. Name : `deo-gracias-prod` ; **Database password** : généré fort → coffré immédiatement.
4. **Region : Paris (West Europe)** (latence minimale depuis Cotonou ; région définitive).
5. Pricing plan : **Free** → **Create new project** ; attendre le provisioning (~2 min).
6. Settings (roue crantée) → **API** : noter `Project ref` (non secret), `anon key`,
   `service_role key` (coffrée).
7. Vérification : le menu **Table Editor** affiche une base vide (schéma `public` sans tables).

## 2. Tableau comparatif des deux méthodes d'application des migrations

| Élément | Méthode A — Dashboard SQL Editor | Méthode B — CLI Supabase | Vérification |
|---|---|---|---|
| Prérequis | navigateur uniquement | Node 20+, CLI installée, mot de passe base | — |
| Application 0001→0008 | copier-coller + Run, 8 fois dans l'ordre | `supabase db push` (1 commande) | 14 tables + 6 plans + requêtes §3.4 / `migration list` |
| Historique `supabase_migrations.schema_migrations` | **NON renseigné** → §5 si CLI adoptée plus tard | renseigné automatiquement (versions `0001`…`0006`) | `supabase migration list --linked` |
| Risque principal | oubli d'un fichier ou de l'ordre | erreur de link (mauvais projet) → vérifier le ref avant push | comparaison ref affiché vs dashboard |
| Testée par l'agent | non (accès dashboard = vous seul) | **oui** en sandbox : `migration up --db-url` + `migration list --db-url` + idempotence + smoke OK (CLI 2.117.0) | voir §6 |

**Choix libre** : les deux aboutissent au même schéma. La méthode B est recommandée si vous
comptez réutiliser le CLI plus tard (historique propre) ; la méthode A convient parfaitement
à votre habitude du GUI, à condition de lire le §5.

## 3. Méthode A — Dashboard SQL Editor (GUI)

1. Dashboard → votre projet → menu gauche **SQL Editor** (icône `>_` ; sur certaines versions :
   **Database** → **SQL Editor**).
2. **Ordre obligatoire = tri des noms de fichiers (actuellement 0001 → 0008)**
   (dépendances : les clés étrangères de 0003/0004 pointent vers les tables de 0002 ;
   0007 pose la RLS, 0008 le seed Grille A). Pour chaque fichier, dans l'ordre :
   a. ouvrir le fichier dans le repo (`supabase/migrations/000X_….sql`) ;
   b. copier **l'intégralité** du contenu ;
   c. SQL Editor → **New query** → coller → bouton **Run** (ou Ctrl/Cmd+Entrée) ;
   d. résultat attendu sous l'éditeur : `Success. No rows returned`.
3. Si une erreur apparaît : **ne pas ré-exécuter au hasard** — copier le message exact et
   me le transmettre (sans secret) ; les fichiers sont idempotents ni rejouables sans analyse.
4. Vérifications finales (nouvelle requête, une seule fois) :

```sql
-- 4.1 : 14 tables attendues
SELECT count(*) AS tables_public
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';   -- attendu : 14

-- 4.2 : liste nominative
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;

-- 4.3 : seed Grille A présent (IMP-10)
SELECT count(*) AS plans_v1 FROM public.plans WHERE version = 1;   -- attendu : 6

-- 4.4 : garde insert-only (doit produire une ERREUR « insert-only »)
INSERT INTO public.audit_logs(actor, action, entity) VALUES ('system','guide07','test');
UPDATE public.audit_logs SET actor = 'x';   -- ← ERREUR attendue = preuve que la garde vit
DELETE FROM public.audit_logs;              -- ← ERREUR attendue aussi
```

   (La ligne INSERT réussit ; les deux suivantes doivent échouer : c'est le comportement
   voulu. Laissez la ligne de test : elle est inoffensive et auditée comme telle.)
5. Confirmer dans **Table Editor** : les 14 tables apparaissent (rafraîchir si besoin).

## 4. Méthode B — CLI Supabase

Prérequis : Node 20+, repo à jour, `Project ref` noté (§1.6), mot de passe base coffré.

```bash
# 4.1 installation + connexion (depuis n'importe où)
npm install -g supabase
supabase login                      # ouvre le navigateur (OAuth compte Supabase)

# 4.2 dans le répertoire du repo (là où se trouve supabase/config.toml)
cd <votre clone du repo>
# mot de passe via variable d'environnement, jamais en clair dans l'historique :
#   PowerShell :  $env:SUPABASE_DB_PASSWORD = "..."
#   bash/zsh  :   export SUPABASE_DB_PASSWORD="..."
supabase link --project-ref <votre project ref>
supabase db push                    # applique 0001→0006 au projet lié
supabase migration list --linked    # attendu : 0001…0006 marquées appliquées
```

Résultats attendus : `Applying migration 000X_….sql` ×6 puis `Remote database is up to date`.
Vérification complémentaire : requêtes §3.4 dans le SQL Editor, ou :

```bash
supabase migration list --linked
```

**Variante testée par l'agent (sandbox, CLI 2.117.0)** — utile si vous préférez cibler une
URL explicite plutôt que le lien projet :

```bash
supabase migration up --db-url "postgres://postgres:<MOT_DE_PASSE>@db.<ref>.supabase.co:5432/postgres"
supabase migration list --db-url "<même URL>"
```

Preuves observées en sandbox sur PostgreSQL 17 local : 6 migrations appliquées, versions
`0001`…`0006` enregistrées dans `supabase_migrations.schema_migrations`, re-run idempotent
(« up to date »), smoke 14 tables OK. L'URL complète (pooler/direct) se copie depuis
Dashboard → Settings → Database → **Connection string** (remplacer le mot de passe par le vôtre).

## 5. Si méthode A choisie, puis CLI adoptée plus tard

La méthode A ne renseigne **pas** `schema_migrations`. Le jour où un `supabase db push` sera
lancé, le CLI croira les 6 migrations « pending » et échouera (objets déjà présents).
Solution (une seule fois, dans le repo) :

```bash
for v in 0001 0002 0003 0004 0005 0006 0007 0008; do
  supabase migration repair "$v" --status applied --linked   # ou --db-url "<URL>"
done
supabase migration list --linked    # 0001…0006 doivent apparaître appliquées
```

(Sous PowerShell : répéter la commande `supabase migration repair 000X --status applied --linked`
huit fois.) Aucune autre action nécessaire si vous restez en méthode A.

## 6. Ce qui NE doit PAS être fait maintenant

- 0007 (RLS) et 0008 (seed Grille A) sont livrées par IMP-10 : les appliquer comme les
  autres (méthode A ou B). RLS/seed manuels hors migrations : interdits.
- Ne pas importer le stock 660 (0009 = IMP-16).
- Ne pas importer le stock 660 (0009 = IMP-16).
- Ne pas créer d'Edge Functions (l'API = backend Fastify, blueprint §2).
- Ne pas exposer la `service_role key` ailleurs que chez l'hébergeur backend futur.

## 7. Retour attendu à l'agent

- Méthode utilisée (A ou B) + « 14 tables OK, garde insert-only OK » ou `migration list` copié ;
- en cas d'erreur : message exact (sans mot de passe) + numéro du fichier/étape.
- Aucun secret, aucune key, aucun mot de passe dans le message.
