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
