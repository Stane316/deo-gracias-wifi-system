# ADR 0001 — Monorepo npm workspaces TypeScript strict

- **Statut** : accepté (17/09/2026) — carte blanche stack exercée au plan §8, validée par le démarrage IMP-07.
- **Contexte** : le système comprend 3 exécutables aux contraintes différentes (backend cloud avec workers persistants, frontend SPA, connector LAN léger) partageant une règle métier unique (Grille A, cycle de vie des tickets, contrat Mikmon). Zéro code existant ; équipe = 1 propriétaire non technique + agent ; CI GitHub Actions comme seul garde-fou mécanique.
- **Décision** :
  1. Monorepo **npm workspaces** : `apps/backend`, `apps/frontend`, `apps/connector`, `packages/shared`.
  2. **TypeScript strict** partout (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node 20 (`.nvmrc`), ESM (`type: module`).
  3. `packages/shared` = source unique de la règle métier : offres Grille A, états de ticket, schémas Zod partagés backend/frontend/connector.
  4. Tests : **Vitest** dans chaque workspace ; la règle métier est encodée en tests dès le squelette.
  5. Outillage hors workspaces : `tools/` (probe RouterOS zero-dep = IMP-21/22).
- **Alternatives écartées** : multi-repos (divergence de contrats inévitable, overhead CI ×3) ; pnpm/yarn (npm suffit, zéro outil supplémentaire pour le propriétaire) ; Bun/Deno (écosystème et stabilité moindres pour Fastify/Drizzle).
- **Conséquences** : une seule CI, un seul `npm install` ; les changements transverses sont atomiques ; le connector reste déployable seul (bundle Node) ; contrainte : discipline stricte de périmètre des workspaces (pas d'import backend→frontend).
