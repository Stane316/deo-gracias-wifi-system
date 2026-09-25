# IMP-29 — Audit de reprise

Date : 2026-09-25

Statut : **AUDIT COMPLETE — IMPLEMENTATION NOT STARTED**

Décision : **GATE D’IMPLÉMENTATION EN ATTENTE**

## PROBLÈME

IMP-29 doit reprendre les fondations d’administration déjà présentes sans les confondre avec une implémentation complète du socle admin. L’audit doit établir :

- l’état GitHub et CI ;
- l’état du workspace local ;
- les fondations backend, frontend, Supabase et tests ;
- le périmètre canonique d’IMP-29 ;
- les écarts avant implémentation ;
- les critères d’acceptation et le plan de tests.

## CAUSE

Le repository contient déjà du code d’administration introduit pendant les vagues précédentes : authentification, dashboard, listes, audit, incidents, lots, réconciliation et client Supabase. La présence de ces fichiers ne vaut pas clôture d’IMP-29 ni validation Supabase distante.

## IMPACT

Sans audit de reprise, il existe un risque de :

- réimplémenter des routes déjà présentes ;
- élargir IMP-29 vers IMP-30 à IMP-34 ;
- considérer une démo locale comme une authentification Supabase de production ;
- oublier le route guard, les états frontend ou les tests navigateur ;
- modifier le code avant de connaître l’écart réel avec le contrat canonique.

## ÉTAT GITHUB

Vérification directe du repository public :

```text
remote main : 6330c7994a7c154bbc74460a1f31d9a14fbae005
message     : docs: freeze IMP-28 and gate IMP-29
```

Le commit contient le gel IMP-28 et le gate IMP-29. CI GitHub vérifiée après la fin du workflow :

```text
Gitleaks                                  success
Typecheck + tests                         success
Migrations PostgreSQL 16                  success
Migrations PostgreSQL 17                  success
```

Le commit GitHub est donc la base de référence distante pour la suite.

## ÉTAT DU WORKSPACE

État observé avant toute implémentation :

```text
branche locale : main
HEAD local     : 373ef3cc99322d7d35b05b87ba4c008c08bc4853
remote main    : 6330c7994a7c154bbc74460a1f31d9a14fbae005
remote local   : non configuré
```

Le workspace local contient des modifications non commitées et des fichiers non suivis liés aux vagues précédentes. Aucun reset, merge, rebase, `git add`, commit ou push n’a été exécuté pendant cet audit.

Avant toute implémentation IMP-29, Stane doit effectuer ou valider l’alignement manuel du workspace sur le commit GitHub courant. Les modifications utiles doivent être conservées ; aucun écrasement automatique n’est autorisé.

## PÉRIMÈTRE CANONIQUE IMP-29

Source principale : `docs/IMPLEMENTATION_MASTER_PLAN.md`, section `IMP-29 — socle admin`.

```text
IN SCOPE
- /admin/login et route guard réel
- Supabase Auth email/mot de passe
- refresh, logout et session expirée
- MFA uniquement si activée côté Supabase
- layout/sidebar
- permissions serveur
- états loading/empty/error/offline
- pagination et filtres serveur

OUT OF SCOPE
- KPI et santé complets IMP-30
- commandes/paiements opérationnels additionnels IMP-31
- tickets/lots/import complet IMP-32
- incidents/récupération complète IMP-33
- plans/paramètres/audit complet IMP-34
- hardening/go-no-go IMP-35
- FedaPay production, MikroTik et portail captif
```

Les pages et routes admin déjà présentes pour IMP-17, IMP-18, IMP-24 et IMP-27 sont des fondations réutilisables. Elles ne doivent pas être élargies pendant IMP-29 sans reclassification explicite vers IMP-30 à IMP-34.

## FONDATIONS EXISTANTES

### Backend

| Élément | État observé | Position audit |
|---|---|---|
| `apps/backend/src/auth.ts` | `SupabaseAuthVerifier`, rôles `ADMIN`/`SUPER_ADMIN`, vérificateur DEV statique | Réutilisable ; tests et timeout/résilience à compléter |
| `apps/backend/src/server.ts` | sélection Supabase ou DEV selon environnement | Garde-fous présents ; validation runtime à conserver |
| `GET /admin/me` | authentification, rôle, audit succès/refus | Présent ; doit être couvert dans une matrice de route guard |
| `requireAdminImp27` | auth/rôle partagé pour les listes IMP-27 | Réutilisable mais les routes historiques utilisent aussi du code dupliqué |
| `/admin/dashboard`, `/admin/tickets/stats` | KPI/inventaire backend | Fondations IMP-17, pas le cœur à réimplémenter |
| `/admin/orders`, `/admin/payments`, `/admin/tickets`, `/admin/batches`, `/admin/incidents`, `/admin/audit-logs` | listes paginées avec search/state côté serveur | Fondations IMP-27 ; UI et contrat à auditer, pas à recréer |
| `apps/backend/src/repo.ts` | contrats FakeRepo et PgRepo, pagination SQL, projections sans secrets | Base technique présente ; couverture PostgreSQL admin à compléter |
| `apps/backend/src/schemas.ts` | limites `limit`, `offset`, `search`, `state` | Présent ; filtres autorisés à formaliser par ressource |

### Frontend

| Élément | État observé | Position audit |
|---|---|---|
| `apps/frontend/src/App.tsx` | routage hash `#/` et `#/admin` | Pas encore un routeur `/admin/login` + `/admin` canonique |
| `apps/frontend/src/pages/Admin.tsx` | écran login, refresh, logout, tabs, chargement, erreurs, empty states, pagination | Fondation riche ; pas de test navigateur admin identifié |
| `apps/frontend/src/supabase-auth.ts` | password login, refresh, logout, `sessionStorage` | Client Supabase minimal présent ; cas expiration/stockage à tester |
| `apps/frontend/src/api.ts` | Bearer token, origine relative `/api`, status `0` | Réutilisable ; méthode `PATCH` non nécessaire au périmètre IMP-29 actuel |
| Navigation | tabs dans le composant admin | Pas de layout/sidebar canonique distinct |
| Permissions | serveur décide via `/admin/me` et les routes | Frontend ne doit pas être renforcé comme frontière de sécurité |

### Base et Supabase

| Élément | État observé | Position audit |
|---|---|---|
| `supabase/migrations/0007_rls_policies.sql` | rôles `anon`, `authenticated`, `service_role`, RLS et `auth.uid()` | Matrice SQL présente ; validation distante non réalisée |
| `customers.auth_user_id` | liaison prévue pour Auth Supabase | À vérifier dans les tests PostgreSQL et sur projet distant plus tard |
| `supabase/config.toml` | `project_id` placeholder | Aucun projet Supabase distant configuré dans le workspace |
| `SUPABASE_URL` / `SUPABASE_ANON_KEY` | variables prévues | Valeurs production non disponibles et non requises pour le code-first audit |

### Tests existants

- `apps/backend/src/auth.test.ts` : OTP, rôles admin, 401/403, audit `/admin/me`, refus par défaut.
- `apps/backend/src/admin.test.ts` : dashboard, inventaire, ack idempotent, listes, pagination, absence de codes clairs.
- `apps/frontend/src/supabase-auth.test.ts` : password login, refresh et erreur générique.
- CI : typecheck, tests, build, migrations PostgreSQL 16/17, RLS, Gitleaks et Playwright public.

Absences notables identifiées :

- aucun test Playwright du parcours admin ;
- aucun test de navigation directe `/admin/login` puis `/admin` ;
- aucun test UI complet 401/403/503/offline ;
- couverture limitée de `readAdminSession`, `writeAdminSession`, expiration et logout ;
- aucune preuve Supabase distante ;
- aucune matrice explicite de permissions au-delà de `ADMIN`/`SUPER_ADMIN`.

## ÉCARTS IMP-29

| Critère | État | Écart à traiter pendant l’implémentation |
|---|---|---|
| `/admin/login` | PARTIAL | routage actuel par hash `#/admin`, pas de route canonique dédiée |
| Route guard réel | PARTIAL | APIs protégées ; garde frontend et redirection explicite à formaliser |
| Password Auth Supabase | CODE PRESENT | tests de contrat présents ; configuration distante différée |
| Refresh/logout/session expirée | PARTIAL | logique présente ; tests stockage, expiration, refus et reprise à compléter |
| MFA conditionnelle | CONDITIONAL | ne pas inventer un flux ; vérifier seulement si activée côté Supabase |
| Layout/sidebar | PARTIAL | tabs présentes ; layout/sidebar canonique absent |
| Permissions serveur | PARTIAL | ADMIN/SUPER_ADMIN présents ; matrice de permissions et default-deny à formaliser |
| Loading/empty/error/offline | PARTIAL | états présents ; preuve UI navigateur manquante |
| Pagination serveur | CODE PRESENT | backend SQL et contrats présents ; preuve UI et limites à compléter |
| Filtres serveur | PARTIAL | search/state backend présents ; UI expose surtout la recherche |
| Audit auth | CODE PRESENT | `admin_auth_ok` et `admin_auth_denied` présents ; test de toutes les routes à renforcer |
| Secrets | PARTIAL | projections sans code clair ; tests anti-secrets à généraliser |

## CRITÈRES D’ACCEPTATION PROPOSÉS

IMP-29 ne pourra être déclarée `DONE` que si les critères suivants sont démontrés :

### A. Authentification et routes

- [ ] accès direct à `/admin/login` affiche uniquement la connexion ;
- [ ] un visiteur non authentifié ne voit aucune donnée admin ;
- [ ] une session valide permet l’accès à `/admin` ;
- [ ] un token invalide, expiré ou absent revient à l’état de connexion ;
- [ ] les API admin retournent `401` sans identité et `403` sans rôle autorisé ;
- [ ] aucune décision de sécurité ne vient du frontend seul.

### B. Supabase Auth

- [ ] email/mot de passe envoyé uniquement en POST HTTPS vers Supabase ;
- [ ] mot de passe absent des URLs, logs et états persistés ;
- [ ] erreur d’identifiants générique ;
- [ ] refresh effectué avant expiration ou après `401` ;
- [ ] logout supprime toujours la session locale, même si la révocation distante échoue ;
- [ ] session expirée impossible à utiliser contre une route admin ;
- [ ] MFA uniquement testée si elle est activée dans le projet Supabase ;
- [ ] aucune clé `service_role` dans le bundle ou le frontend.

### C. Permissions serveur et audit

- [ ] chaque endpoint `/admin/*` passe par authentification puis autorisation serveur ;
- [ ] `ADMIN` et `SUPER_ADMIN` sont explicitement testés ;
- [ ] utilisateur authentifié sans rôle admin refusé ;
- [ ] échec/succès de connexion admin audité sans secret ;
- [ ] les projections admin ne contiennent ni code ticket clair, ni mot de passe, ni secret provider ;
- [ ] les identifiants invalides ne permettent pas d’IDOR.

### D. Shell et états UX

- [ ] navigation admin stable et accessible ;
- [ ] état chargement visible ;
- [ ] état vide distinct d’une panne ;
- [ ] erreurs `401`, `403`, `503` et réseau `status 0` actionnables ;
- [ ] logout visible et effectif ;
- [ ] aucune donnée périmée présentée comme autoritaire après expiration.

### E. Pagination et filtres

- [ ] `limit` et `offset` bornés côté backend ;
- [ ] total, page courante et navigation cohérents ;
- [ ] recherche exécutée côté serveur ;
- [ ] filtres d’état explicitement définis par ressource ;
- [ ] aucun chargement intégral obligatoire des listes ;
- [ ] résultat vide stable et testable.

## PLAN DE TESTS

### T1 — Tests unitaires frontend

Couvrir :

- `browserSupabaseConfig` avec URL valide/invalide et absence de clé ;
- session absente, JSON corrompu, champs manquants ;
- session valide, session expirée ;
- `writeAdminSession` puis `readAdminSession` ;
- password login, refresh, logout et panne réseau ;
- suppression locale garantie au logout ;
- messages d’erreur génériques ;
- API `status 0`, `401`, `403`, `503`.

### T2 — Tests backend auth/RBAC

Couvrir chaque route admin avec une matrice :

```text
sans Authorization       → 401
Bearer invalide          → 401
identité sans rôle       → 403
ADMIN                    → 200/route autorisée
SUPER_ADMIN              → 200/route autorisée
verifier absent          → 503 honnête
```

Vérifier l’audit `admin_auth_ok` et `admin_auth_denied`, sans token ni mot de passe dans les événements.

### T3 — Tests API et PostgreSQL

- listes FakeRepo et PgRepo ;
- `limit`, `offset`, `search`, `state` ;
- listes vides ;
- détail absent et identifiant invalide ;
- projections anti-secrets ;
- pagination sur dataset supérieur à une page ;
- RLS existante et non-régression des migrations ;
- absence d’IDOR sur les détails admin.

### T4 — Tests frontend navigateur

Ajouter un parcours Playwright admin contrôlé par fixtures/mocks, sans Supabase distant :

1. visiteur ouvre `/admin/login` ;
2. affichage du formulaire sans donnée admin ;
3. identifiants refusés ;
4. login accepté avec session simulée ;
5. appel `/api/admin/me` avec Bearer ;
6. affichage du shell admin ;
7. navigation et chargement d’une liste ;
8. état vide ;
9. panne backend `503` ;
10. offline ;
11. expiration/refresh ;
12. logout et retour à la connexion.

### T5 — Sécurité et CI

- Gitleaks ;
- typecheck ;
- tests unitaires ;
- build ;
- Playwright ;
- migrations PostgreSQL 16/17 ;
- RLS ;
- audit manuel des bundles et variables publiques ;
- vérification qu’aucun `service_role`, mot de passe ou code ticket clair n’est embarqué.

### T6 — Validation externe séparée

Non requis pour clôturer le code-first IMP-29 :

- projet Supabase distant ;
- compte admin réellement créé ;
- MFA réellement activée ;
- domaine public et HTTPS de production ;
- déploiement cloud.

Ces éléments restent dans `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`.

## DÉCISION D’AUDIT

```text
AUDIT IMP-29                         : COMPLETE
IMPLEMENTATION IMP-29                : NOT STARTED
FONDATIONS RÉUTILISABLES             : PRESENT
ÉCARTS IDENTIFIÉS                    : YES
TESTS SUPPLÉMENTAIRES À PRÉPARER    : YES
SUPABASE DISTANT                     : DEFERRED
MIKROTIK / PORTAIL / FEDAPAY         : OUT OF SCOPE
```

## PROCHAINE ÉTAPE

Après validation de ce rapport par Stane, préparer l’implémentation IMP-29 en deux temps :

1. alignement manuel du workspace local sur GitHub `6330c7994a7c154bbc74460a1f31d9a14fbae005` ;
2. plan technique détaillé et découpage test-first, sans commencer les changements de code avant autorisation explicite d’implémentation.
