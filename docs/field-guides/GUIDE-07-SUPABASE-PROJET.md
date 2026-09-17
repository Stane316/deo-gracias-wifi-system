# GUIDE-07 — Créer et lier le projet Supabase (IMP-09)

> **Qui exécute** : le propriétaire, sur sa propre machine (le compte Supabase est le sien ;
> l'agent n'a et n'aura jamais les credentials).
> **Durée estimée** : 15–20 minutes. **Coût** : 0 FCFA (free tier).
> **Prérequis** : compte Supabase existant (confirmé 17/09), Node.js 20+, repo à jour
> (commit IMP-09 poussé), Git Bash/PowerShell sous Windows.

## 0. Règles de sécurité (rappel INC-01)

- Le **mot de passe base de données** et la **service_role key** ne passent JAMAIS par le
  chat, le repo, ou un fichier commité. Coffre-fort / gestionnaire de mots de passe uniquement.
- L'`anon key` est conçue pour être publique (frontend) : elle peut être stockée chez
  l'hébergeur frontend, jamais dans le repo.
- Ce guide ne demande aucune saisie de secret dans le repo.

## 1. Créer le projet (dashboard)

1. dashboard Supabase → **New project**.
2. Organization : la vôtre (ou en créer une, nom `deo-gracias`).
3. Name : `deo-gracias-prod`. **Database password** : généré fort, coffré immédiatement.
4. **Region : Paris (West Europe)** — latence minimale depuis Cotonou parmi les régions
   Supabase ; le choix de région est définitif par projet.
5. Plan : **Free**.
6. Attendre le provisioning (~2 min), puis Settings → API : noter `Project ref` (ex.
   `abcdefghijklmn...` — non secret), `anon key`, `service_role key` (coffrée).

## 2. Installer le CLI et lier (votre machine)

```bash
npm install -g supabase
cd <votre clone du repo>
supabase login                 # ouvre le navigateur, OAuth compte Supabase
supabase link --project-ref <votre project ref>
#   -> demande le mot de passe base : le fournir via la variable d'environnement
#      SUPABASE_DB_PASSWORD (jamais en clair dans l'historique shell) :
#      Windows PowerShell :  $env:SUPABASE_DB_PASSWORD = "..."
#      Linux/macOS :         export SUPABASE_DB_PASSWORD="..."
```

`supabase link` écrit le lien dans `supabase/.temp/` (gitignoré) — le `project_id` du
`config.toml` commité reste un placeholder.

## 3. Pousser les migrations 0001→0006

```bash
supabase db push               # applique 0001..0006 au projet cloud
```

Vérification (SQL editor du dashboard) :

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY 1;
-- attendu : 14 tables (customers, plans, orders, payments, payment_events,
-- ticket_batches, tickets, mikrotik_sync, access_sessions, reconciliation_runs,
-- audit_logs, incidents, alerts, settings)
```

Test d'immuabilité audit (doit échouer avec une erreur « insert-only ») :

```sql
-- insérer une ligne de test puis tenter :
-- UPDATE public.audit_logs SET actor = 'x';   → ERREUR attendue
```

## 4. Ce qui NE doit PAS être fait maintenant

- Ne pas créer les seeds (0007/0008 = IMP-10) ni importer le stock 660 (0009 = IMP-16).
- Ne pas activer de RLS manuellement dans le dashboard (migration 0007 = IMP-10).
- Ne pas exposer la `service_role key` ailleurs que chez l'hébergeur backend futur.
- Ne pas créer d'Edge Functions (le backend Fastify porte l'API, blueprint §2).

## 5. Retour attendu à l'agent

- « GUIDE-07 exécuté : projet <ref> créé, migrations 0001–0006 poussées, 14 tables OK,
  test insert-only OK » (sans aucun secret dans le message).
- En cas d'erreur : copier le message d'erreur exact (sans mot de passe) + l'étape.
