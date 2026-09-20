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
