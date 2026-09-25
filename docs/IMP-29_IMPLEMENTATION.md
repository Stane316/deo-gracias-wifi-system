# IMP-29 — Implémentation du socle admin

Date : 2026-09-25

Statut : **PARTIAL — CODE-FIRST SLICE COMPLETE / EXTERNAL VALIDATION DEFERRED**

Référence de reprise : `docs/IMP-29_REPRISE_AUDIT.md`

## PROBLÈME

Le socle admin existait déjà mais utilisait un routage hash `#/admin`, une navigation par tabs et une interface de filtres incomplète. Le contrat IMP-29 exigeait `/admin/login`, `/admin`, un route guard visible, un layout/sidebar, des filtres serveur et une preuve navigateur.

## CAUSE

Les fondations admin des vagues précédentes n’avaient pas encore été reclassées dans un flux IMP-29 testable :

- `App.tsx` ne distinguait pas `/admin/login` et `/admin` ;
- la compatibilité hash était le seul routage public/admin ;
- le shell admin ne comportait pas de sidebar ;
- l’UI envoyait `search` mais pas le filtre `state` prévu par le backend ;
- aucun E2E admin n’existait.

## IMPACT

L’accès direct au login admin, le retour après expiration/logout, la navigation privée et l’exécution du filtre côté serveur n’étaient pas démontrés au navigateur.

## SOLUTION

### Routage et route guard

- ajout de `admin-route.ts` avec les routes canoniques `/admin/login` et `/admin` ;
- écoute de `popstate` et `hashchange` ;
- compatibilité conservée pour `#/admin` et `#/admin/login` ;
- accès non authentifié à `/admin` ramené vers `/admin/login` ;
- session valide sur `/admin/login` ramenée vers `/admin` ;
- logout et refus d’authentification ramenés vers `/admin/login` ;
- la sécurité reste côté backend, les routes `/admin/*` ne font pas confiance au frontend.

### Shell admin

- remplacement de la barre de tabs par un shell avec sidebar ;
- navigation accessible avec `aria-label` et `aria-current` ;
- logout présent dans la sidebar ;
- responsive mobile conservé ;
- contenu fonctionnel existant réutilisé sans l’élargir vers IMP-30 à IMP-34.

### Pagination et filtres

- conservation de `limit` et `offset` bornés côté backend ;
- ajout de `state` dans les requêtes frontend ;
- filtres UI pour commandes, paiements, tickets, lots et incidents ;
- changement de filtre réinitialise la pagination ;
- les données restent demandées au serveur, sans chargement intégral imposé.

### E2E

Ajout de deux scénarios navigateur IMP-29 :

1. accès direct `/admin` sans session → `/admin/login` sans données admin ;
2. connexion locale contrôlée → `/admin`, sidebar, filtre `PAID` transmis côté serveur et logout.

Le test utilise le mode local contrôlé avec token simulé. Il ne constitue pas une validation Supabase distante.

## ARCHITECTURE

```text
URL /admin/login ou /admin
          │
          ▼
       App.tsx
          │ route déterminée par admin-route.ts
          ▼
       Admin.tsx
          │ sessionStorage / Supabase Auth client
          │ Bearer token
          ▼
       /api/admin/*
          │
          ▼
       Backend Fastify
          │ authentification + rôle serveur
          ▼
       FakeRepo / PgRepo
```

## FICHIERS

### CREATED

- `apps/frontend/src/admin-route.ts`
- `apps/frontend/src/admin-route.test.ts`
- `apps/frontend/e2e/admin.spec.ts`
- `docs/IMP-29_IMPLEMENTATION.md`

### MODIFIED

- `apps/frontend/src/App.tsx`
  - routage pathname/hash ;
  - liens `/admin/login` et `/` ;
  - écoute navigation navigateur.

- `apps/frontend/src/pages/Admin.tsx`
  - route guard de présentation ;
  - redirections login/dashboard/logout ;
  - sidebar ;
  - filtres serveur ;
  - pagination réinitialisée lors d’un filtrage.

- `apps/frontend/src/styles.css`
  - shell/sidebar admin ;
  - responsive mobile ;
  - styles filtres et navigation.

- `docs/IMPLEMENTATION_MASTER_PLAN.md`
  - position IMP-29 mise à jour ;
  - référence du rapport d’implémentation.

### DELETED / RENAMED

```text
Aucun fichier supprimé.
Aucun fichier renommé.
```

## TESTS

```text
npm run typecheck     ✅
npm test              ✅
npm run build         ✅
```

Résultats unitaires :

```text
Backend    : 158 passed, 49 skipped sans DATABASE_URL
Connector  : 46 passed
Frontend   : 43 passed
Shared     : 45 passed
```

Playwright :

```text
12 passed
- 2 scénarios IMP-29 admin
- 10 scénarios IMP-27/IMP-28 checkout
```

CI GitHub de la base précédente `4215e3596226f61f3b8d53df2f9ed1c0fcaef219` : **4/4 checks verts**. La validation finale du commit contenant cette implémentation devra être vérifiée directement sur GitHub après push par Stane.

## LIMITES

- aucun compte Supabase distant utilisé ;
- aucune session Supabase réelle ;
- aucune MFA réelle ;
- aucun domaine public admin validé ;
- aucune configuration production ;
- mode local contrôlé utilisé pour l’E2E admin ;
- les permissions restent la matrice existante `ADMIN`/`SUPER_ADMIN` ;
- les fonctionnalités complètes IMP-30 à IMP-34 ne sont pas ouvertes.

Les limites externes restent suivies dans `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`.

## VALIDATION ET PROCHAINE ÉTAPE

```text
IMP-29 code-first : COMPLETE POUR CETTE SLICE
IMP-29 global     : PARTIAL — EXTERNAL VALIDATION DEFERRED
```

Prochaine étape : validation du diff et push par Stane, puis audit direct du commit et de la CI. Aucun test Supabase distant, MikroTik, portail captif ou FedaPay réel ne doit être lancé dans cette vague.
