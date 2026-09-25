# DÉO GRACIAS — IMPLEMENTATION MASTER PLAN

> Version 1.1 — clôture IMP-27 et code-first IMP-28 du 25/09/2026
>
> Ce document devient la source de vérité pour la suite des implémentations IMP-01 → IMP-40.
> Il a été établi après inspection du repository local, de l’historique Git, des fichiers suivis,
> des fichiers non suivis, des migrations, des tests, de la CI et des guides opérationnels.
>
> **Aucune implémentation nouvelle n’est autorisée avant validation explicite de Stane.**

---

# CURRENT POSITION

```text
COMPLETED:
IMP-01, IMP-02, IMP-03, IMP-06 → IMP-12, IMP-16 → IMP-22, IMP-27

CURRENT:
IMP-28 — FROZEN : code-first complet, dépendances externes différées, Walled Garden no-write

NEXT:
IMP-29 — AUDIT COMPLET / IMPLEMENTATION GATE PENDING : code non modifié, implémentation uniquement après feu vert explicite de Stane

REMAINING:
IMP-04, IMP-05, IMP-13 → IMP-15, IMP-23 → IMP-24, validation externe IMP-28, IMP-29 → IMP-40
```

# JOURNAL DE PILOTAGE — 25/09/2026

- **IMP-27 — DONE** : stabilisation code/tests confirmée ; commit GitHub `2b90f0e`, CI verte.
- **IMP-28 — FROZEN / PARTIAL / CODE COMPLETE / EXTERNAL DEPENDENCIES DEFERRED** : tests offline, backend indisponible, `503`, inventaire des domaines et protocole no-write documentés ; commit GitHub `7d6bd0df05313f828bdc0b455a43e851c536a45b`, quatre checks CI verts.
- **Décision d'intégration** : Walled Garden de production vide ; aucune commande MikroTik, aucun portail captif physique et aucun paiement FedaPay réel exécutés.
- **Gel** : IMP-28 est gelée ; aucune extension fonctionnelle ou intégration externe ne démarre. Décision détaillée dans `docs/decisions/DECISION-2026-09-25-IMP-28-FREEZE.md`.
- **Audit IMP-29** : terminé le 25/09/2026 ; fondations et écarts consignés dans `docs/IMP-29_REPRISE_AUDIT.md`, aucune modification de code démarrée.
- **Pilotage** : IMP-29 reste en `IMPLEMENTATION GATE PENDING` ; aucune implémentation ne démarre avant validation du rapport et feu vert explicite de Stane.

Précision indispensable : les intégrations physiques et externes restent séparées du code.
`IMP-27` est stabilisée dans GitHub sous le commit `2b90f0e` avec CI verte. `IMP-28` dispose
désormais d'une partie code/test documentée sous le commit `7d6bd0df05313f828bdc0b455a43e851c536a45b`,
avec les quatre checks CI verts ; elle reste PARTIAL au niveau global tant que les preuves physiques
et les configurations externes ne sont pas réalisées.

Le code admin déjà présent ne redéfinit pas le périmètre d'IMP-28. Il constitue une fondation
partielle des futurs IMP-29 à IMP-34 et ne doit pas être traité comme une clôture de ces vagues.
La mémoire persistante des dépendances différées est `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`.

---

# 1. RÈGLE DE SOURCE DE VÉRITÉ

L’ordre de priorité est :

1. état réel des fichiers présents dans le repository local ;
2. tests et résultats observables ;
3. historique Git et commits accessibles ;
4. documentation projet ;
5. anciennes déclarations de conversation, uniquement comme pistes à vérifier.

Un fichier présent ne signifie pas qu’une implémentation est validée. Une implémentation est
considérée comme `DONE` seulement si son code, ses tests et ses preuves attendues sont
suffisamment présents. Une action externe ou physique non effectuée reste `PARTIAL`,
`BLOCKED` ou `NEEDS VERIFICATION`.

---

# 2. SNAPSHOT DU REPOSITORY AUDITÉ

## 2.1 Architecture observée

```text
apps/backend     Fastify + PostgreSQL + workers + auth + paiements + admin API
apps/frontend    React/Vite, espace public, checkout transactionnel, admin
apps/connector   parsing RouterOS, dry-run, file de sync, client RouterOS classique,
                 réconciliation read-only
packages/shared  Grille A, états et invariants métier partagés
supabase/        12 migrations up + 12 rollbacks down
tools/           migrations, smoke, RLS, state guards, génération du seed stock
.github/         CI typecheck/tests, PostgreSQL éphémère, gitleaks

docs/            spécifications, guides physiques, preuves, ADR, UX, environnement
```

## 2.2 Git et workspace

- Branche locale : `main`.
- `HEAD` local : `0167158` — `IMP-25.1`.
- `origin/main` visible : `cd7219c` — `IMP-25.5`.
- La branche locale est donc en retard de cinq commits par rapport à `origin/main`.
- Des changements non commités recouvrent déjà une partie de `IMP-25.2` à `IMP-25.5`,
  puis ajoutent des éléments `IMP-25.6`, `IMP-26` et `IMP-27`.
- Aucun commit `IMP-26` ou `IMP-27` n’est présent dans l’historique visible.
- Une seule branche locale est visible ; aucune branche de travail dédiée n’a été trouvée.
- L’agent n’a effectué aucun `git add`, `git commit` ou `git push`.
- Le workspace contient des fichiers non suivis importants : checkout frontend,
  authentification Supabase navigateur, coffre ticket, migration 0012, guides 10/11 et tests.

## 2.3 Vérification technique au moment du recalage

```text
npm run typecheck : PASS
npm test          : PASS — 149 tests backend, 46 connector, 35 frontend, 45 shared
                    48 tests PostgreSQL ignorés faute de base locale disponible
npm run build     : PASS — build Vite frontend
```

La réussite locale ne constitue pas une preuve de déploiement, de connexion Supabase,
de test FedaPay sandbox, de test RouterOS réel ni de test PostgreSQL intégré exécuté dans
cet environnement.

---

# 3. ÉTAT RÉEL IMP-01 → IMP-40

Statuts autorisés : `DONE`, `PARTIAL`, `NOT STARTED`, `BLOCKED`, `NEEDS VERIFICATION`.

| Implémentation | Statut réel | Preuves dans le repository | Commentaire objectif |
|---|---|---|---|
| IMP-01 | DONE | `GUIDE-01-AUDIT.md`, `EVIDENCE-IMP01-*`, commits `8e2a308`, `f2eb621`, `a069594` | Audit read-only MikroTik documenté et exécuté selon les preuves disponibles. |
| IMP-02 | DONE | `GUIDE-02-BACKUP.md`, `EVIDENCE-IMP02-01-*` | Sauvegardes physiques documentées comme réalisées. La restauration réelle reste un test futur d’exploitation. |
| IMP-03 | DONE | `GUIDE-03-HARDENING.md`, preuve dans `EVIDENCE-IMP04-01-*` | Durcissement documenté comme clos ; les décisions legacy encore ouvertes sont conservées pour IMP-35. |
| IMP-04 | PARTIAL | `GUIDE-04-R3-WG-GRIDA.md`, `EVIDENCE-IMP04-01-*` | Analyse/WG initial et Grille A présents ; tests humains complets et validation production restent à faire. Le WG de production reste vide jusqu’à IMP-38. |
| IMP-05 | BLOCKED | `GUIDE-05-HOST-CONNECTOR.md`, `EVIDENCE-IMP05-01-*` | Exécution classée « clos sans hôte » ; provisioning d’un hôte Connector et heartbeat réels non finalisés. |
| IMP-06 | DONE | `GUIDE-06-STOCK-MIKMON.md`, `stock-manifest-2026-09-17.md`, migration `0010_seed_stock_mikmon.sql` | Génération physique déclarée exécutée et stock documenté. Une re-vérification Connector reste nécessaire. |
| IMP-07 | DONE | commit `2565ae9`, workspaces, TypeScript strict, CI, ADR 0001/0002 | Socle repository et CI présents. |
| IMP-08 | DONE | commit `7e6a374`, corrections de grille/audit dans les docs | Corrections documentaires et constats réseau intégrés. |
| IMP-09 | DONE | commit `2a0b8f9`, migrations `0001`→`0006`, rollbacks et `db-migrate.sh` | Schéma initial et outillage de migrations présents. |
| IMP-10 | DONE | commit `4e91463`, migrations `0007`/`0008`, tests RLS et seed-sync | RLS et Grille A présentes ; test réel dépend de PostgreSQL/Supabase disponible. |
| IMP-11 | DONE | commit `4929694`, `packages/shared/src/states.ts`, migration `0009`, tests | Machines d’état et guards SQL/TypeScript présents. |
| IMP-12 | DONE | commit `d97769a`, `app.ts`, `repo.ts`, `app.test.ts`, `repo.pg.test.ts`, CI PG | Catalogue, commandes idempotentes et API de base présents. |
| IMP-13 | PARTIAL | commit `3eb2acd`, `auth.ts`, routes OTP/admin, `supabase-auth.ts` non suivi | Code d’authentification présent ; aucun SMS réel, aucune configuration Supabase distante ni MFA activée/validée. |
| IMP-14 | NEEDS VERIFICATION | commit `ff452ff`, `fedapay.ts`, webhook signé, tests FedaPay | Intégration sandbox codée et testée sans réseau ; sandbox distante et webhook HTTPS non validés. |
| IMP-15 | NEEDS VERIFICATION | commit `65253b9`, `tickets.ts`, `repo.ts`, tests allocation/livraison | Allocation atomique et DELIVERED présents ; les 48 tests PG d’intégration sont ignorés localement. |
| IMP-16 | DONE | commit `ae7078d`, migration `0010`, manifeste, `stock-sync.test.ts` | Stock digital hashé et distribution Grille A représentés dans le repository. |
| IMP-17 | DONE | commits `8117e84`/`958e521`, `admin.ts`, routes dashboard/stats/ack, tests | KPI, inventaire et alertes v0 présents. Cela ne couvre pas tout le Dashboard Phase 8. |
| IMP-18 | DONE | commit `0c204b2`, `createBackendBatch`, `ticketgen.ts`, `batches.test.ts` | Création de lots digitaux, hash, file `create_ticket`, export ponctuel présents. |
| IMP-19 | DONE | commit `a3b032c`, migration `0011`, expiration et tests | Échéance d’activation et transition SOLD→EXPIRED présentes. |
| IMP-20 | DONE | commit `cc4bf3c`, `workers.ts`, tests workers | Workers expiry, webhook sweeper et réconciliation simulée présents. |
| IMP-21 | DONE | commit `3ff5311`, contrat sync, dry-run, retry, tests | Contrat Connector et dry-run locaux présents ; aucune écriture réelle RouterOS. |
| IMP-22 | DONE | commit `eefcc45`, parsers read-only, réconciliation, fixtures, tests | Connector v0 read-only et anomalies sont implémentés sur fixtures. |
| IMP-23 | PARTIAL | commit `b1bc974`, client RouterOS binaire, gateway, probe, stub/tests | Client et probe codés ; permissions réelles, utilisateur technique et test sur MikroTik restent à effectuer. |
| IMP-24 | PARTIAL | commit `06916bc`, runner, routes inventory/report, runs/alertes, tests | Réconciliation v0 bout à bout avec dry-run ; cycle réel Connector↔MikroTik non démontré. |
| IMP-25 | PARTIAL | commit `48b54f1`, commits `0167158`→`cd7219c`, SPA, DEV modes, guides 09/10 | Démo locale réelle présente ; production, Supabase distant, FedaPay distant et validation complète restent hors preuve. |
| IMP-26 | PARTIAL | fichiers non suivis `checkout/`, `ticketvault.ts`, migration `0012`, `CodeDelivery.tsx`, docs UX | UX 1→6 et coffre/reveal sont présents dans le workspace ; décision, E2E, migration distante et validation complète ne sont pas clôturés. |
| IMP-27 | DONE | commit GitHub `2b90f0e`, `Checkout.tsx`, machine, polling, E2E, PostgreSQL réel, documentation | Parcours paiement → webhook/état backend → allocation → délivrance → récupération corrélée démontré ; les intégrations de production restent dans les dépendances externes différées. |
| IMP-28 | FROZEN — CODE-FIRST COMPLET, EXTERNE DIFFÉRÉ | commit GitHub `7bb18db`, CI verte, `api.test.ts`, E2E offline/503, `IMP-28_VAGUE_4.md` | Aucun nouveau périmètre ; domaines publics, redirect FedaPay réel, portail captif et Walled Garden réel restent différés. |
| IMP-29 | AUDIT COMPLETE — IMPLEMENTATION GATE PENDING | `docs/IMP-29_REPRISE_AUDIT.md`, fondations `Admin.tsx`, `/admin/me`, Supabase navigateur, session refresh/logout, routes admin | Écarts et critères d’acceptation identifiés ; code non modifié, implémentation en attente du feu vert explicite de Stane. |
| IMP-30 | PARTIAL | `admin.ts`, `/admin/dashboard`, `/admin/system/status`, KPI/UI | KPI et santé v0 présents ; activité récente, santé MikroTik réelle, Connector ONLINE/OFFLINE et validation des six questions manquent. |
| IMP-31 | PARTIAL | listes `/admin/orders`, détail, `/admin/payments`, tests et projections SQL non commités | Recherche/pagination/détail v0 présents ; timeline complète, correction exceptionnelle avec raison/permission/audit et intégration PG restent à valider. |
| IMP-32 | PARTIAL | `/admin/tickets`, `/admin/batches`, création digital, coffre et vues frontend | Inventaire et lot digital présents ; import preview→validation→transaction, compteurs complets, physique/digital exhaustif et réservations opérationnelles manquent. |
| IMP-33 | PARTIAL | allocation admin, ack alertes, réconciliation et primitives d’audit | Primitives de récupération présentes ; centre d’incidents, fiche, retry/resync/resolve/reopen idempotents et scénario C complet manquent. |
| IMP-34 | NOT STARTED | catalogue read-only `/offers` et plans SQL existants | Aucun CRUD plan/paramètre métier/audit commercial dédié ni protection grille complète. |
| IMP-35 | PARTIAL | CI typecheck/tests/PostgreSQL/gitleaks, RLS et state tests | Hardening partiel ; rapport `docs/testing/SECURITY_TEST_REPORT.md`, P1-P7/I1-I5/M1-M6/A1-A4/S1-S10, npm audit, CSP et tests de charge manquent. |
| IMP-36 | BLOCKED | code FedaPay sandbox, `GUIDE-11` | Onboarding marchand, KYC, clés live, webhook live et paiement réel sont des actions Stane après IMP-35. |
| IMP-37 | NOT STARTED | guides de déploiement et variables documentés seulement | Pas de déploiement production Railway/Supabase/domaine/monitoring/données réelles prouvé. |
| IMP-38 | BLOCKED | guides WG, client RouterOS et probe présents ; aucune écriture WG | Doit attendre IMP-28, IMP-35, IMP-37, backup vérifié et accord explicite de Stane. |
| IMP-39 | BLOCKED | procédure dans `docs/11_DEPLOYMENT_OPERATIONS.md` | Aucun go-live progressif ni achat réel contrôlé prouvé. Dépend de 36→38. |
| IMP-40 | NOT STARTED | principes/runbooks partiels dans `docs/11_DEPLOYMENT_OPERATIONS.md` | Restore drill, transfert, guide mère, maintenance et postmortem réels restent à produire. |

---

# 4. VÉRIFICATION SPÉCIALE D’IMP-27

## 4.1 Réponse canonique

IMP-27 est :

> **DONE côté code et CI**, commit GitHub `2b90f0e`, avec les intégrations physiques et FedaPay réelle conservées comme dépendances externes différées.

La chaîne contrôlée est couverte par les tests locaux, PostgreSQL réel, E2E mocké et CI GitHub.

## 4.2 Ce qui existe réellement

Présent dans le workspace :

- machine d’états frontend : `apps/frontend/src/checkout/machine.ts` ;
- classification des états backend : `checkout/orderstate.ts` ;
- orchestration commande → paiement → polling : `checkout/Checkout.tsx` ;
- reprise après rafraîchissement via `sessionStorage` ;
- message « ne payez pas une deuxième fois » dans les états sensibles ;
- distinction `PENDING`, `PREPARING`, `FAILED`, `CANCELLED`, `EXPIRED`, `UNKNOWN` ;
- `UNKNOWN` ne devient pas automatiquement un échec ;
- livraison et révélation auditée dans `CodeDelivery.tsx` ;
- récupération par authentification OTP téléphone via `MyTickets.tsx` ;
- instructions HotSpot et copie du code ;
- tests unitaires machine/order state/phone.

## 4.3 Dépendances externes différées

Les éléments suivants ne bloquent plus le code IMP-27, mais restent volontairement hors validation de production :

1. transaction FedaPay sandbox/live réellement exécutée ;
2. webhook HTTPS public et compte marchand FedaPay ;
3. portail captif et routeur MikroTik réels ;
4. Connector connecté et synchronisation RouterOS ;
5. validation physique du réseau et du Walled Garden.

Ces éléments sont conservés dans `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`. Ils ne doivent pas être présentés comme réalisés parce que les adapters, guides ou mocks existent.

## 4.4 Collision de périmètre détectée

Le workspace contient également une implémentation de listes admin dans :

- `apps/backend/src/app.ts` ;
- `apps/backend/src/repo.ts` ;
- `apps/backend/src/fake-repo.ts` ;
- `apps/frontend/src/pages/Admin.tsx` ;
- `apps/frontend/src/api.ts` ;
- `apps/backend/src/admin.test.ts`.

Cette implémentation est réelle mais elle correspond historiquement aux futurs IMP-29 à
IMP-34, pas à l’IMP-27 fourni dans le référentiel canonique actuel. Elle doit être conservée,
aud itée et reclassée sans modifier la clôture indépendante d’IMP-27.

---

# 5. TABLEAU FINAL DE POSITION

| # | Implémentation | Statut réel | Position |
|---:|---|---|---|
| IMP-01 | Audit MikroTik | DONE | historique |
| IMP-02 | Sauvegardes | DONE | historique |
| IMP-03 | Durcissement | DONE | historique |
| IMP-04 | WG initial / Grille A | PARTIAL | historique à vérifier |
| IMP-05 | Hôte Connector | BLOCKED | historique bloqué par hôte |
| IMP-06 | Stock Mikhmon | DONE | historique, re-vérification future |
| IMP-07 | Monorepo / CI | DONE | historique |
| IMP-08 | Corrections audit / réseau | DONE | historique |
| IMP-09 | Schéma initial | DONE | historique |
| IMP-10 | RLS / seed Grille A | DONE | historique, validation distante restante |
| IMP-11 | États / guards | DONE | historique |
| IMP-12 | API catalogue/commandes | DONE | historique |
| IMP-13 | Auth | PARTIAL | historique, configuration externe manquante |
| IMP-14 | FedaPay sandbox | NEEDS VERIFICATION | historique, test distant manquant |
| IMP-15 | Allocation / livraison | NEEDS VERIFICATION | historique, PG/E2E à rejouer |
| IMP-16 | Seed stock | DONE | historique |
| IMP-17 | Dashboard API v0 | DONE | historique, différent du Dashboard complet |
| IMP-18 | Lots digitaux | DONE | historique |
| IMP-19 | Activation deadline | DONE | historique |
| IMP-20 | Workers | DONE | historique |
| IMP-21 | Contrat Connector / dry-run | DONE | historique |
| IMP-22 | Connector read-only | DONE | historique |
| IMP-23 | Client RouterOS | PARTIAL | historique, physique restant |
| IMP-24 | Réconciliation v0 | PARTIAL | historique, routeur réel restant |
| IMP-25 | Démo visuelle / environnement | PARTIAL | historique + workspace non stabilisé |
| IMP-26 | UX 1→6 / coffre code | PARTIAL | historique courant non validé |
| **IMP-27** | **Paiement, délivrance, récupération** | **DONE** | **code + CI validés ; externe différé** |
| IMP-28 | Captif / états dégradés / WG | **FROZEN — CODE-FIRST COMPLET** | **externe différé ; no-write MikroTik** |
| IMP-29 | Socle admin | **AUDIT COMPLETE — GATE IMPLÉMENTATION** | **rapport de reprise terminé ; code non modifié** |
| IMP-30 | Dashboard overview | PARTIAL | FUTURE, v0 déjà présent |
| IMP-31 | Commandes / paiements admin | PARTIAL | FUTURE, code non commité présent |
| IMP-32 | Tickets / lots / import | PARTIAL | FUTURE, primitives déjà présentes |
| IMP-33 | Incidents / récupération | PARTIAL | FUTURE, primitives déjà présentes |
| IMP-34 | Plans / paramètres / audit | NOT STARTED | FUTURE |
| IMP-35 | Hardening / GO-NO-GO | PARTIAL | FUTURE |
| IMP-36 | FedaPay production | BLOCKED | FUTURE gated |
| IMP-37 | Production / données réelles | NOT STARTED | FUTURE |
| IMP-38 | WG production / tests captifs | BLOCKED | FUTURE gated physique |
| IMP-39 | Go-live progressif | BLOCKED | FUTURE gated |
| IMP-40 | Exploitation / transfert | NOT STARTED | FUTURE |

---

# 6. QUESTIONS DE RECALAGE DU PLAN HISTORIQUE

## Question A — Le découpage reste-t-il cohérent ?

Oui, globalement. Le découpage 27→40 reste cohérent si les implémentations sont traitées
comme des gates successifs : fiabilité du parcours client, captif, administration, hardening,
puis production et exploitation.

La correction indispensable est de ne pas confondre :

- `IMP-27` = parcours client paiement/délivrance/récupération ;
- `IMP-29` à `IMP-34` = Dashboard Admin complet.

## Question B — Faut-il fusionner, séparer ou déplacer ?

### Décision 1 — ne pas fusionner IMP-27 et IMP-29→34

Les listes admin déjà codées restent utiles, mais elles doivent être reclassées comme travaux
partiels des IMP-29 à IMP-34. Le paiement client et l’administration ont des critères,
tests et gates différents.

### Décision 2 — conserver IMP-28 séparé

Le captif et la liste Walled Garden dépendent d’une observation physique et d’un futur
endpoint public. Ils ne doivent pas être absorbés dans IMP-27 ni dans IMP-38.

### Décision 3 — conserver IMP-35 avant IMP-36

Le hardening et le GO/NO-GO doivent précéder les clés live et le premier paiement réel.

### Décision 4 — conserver IMP-38 comme opération explicitement gated

Aucune écriture MikroTik ne doit être incluse dans une implémentation distante ordinaire.

## Question C — Dépendances corrigées

```text
IMP-25/26
   ↓
IMP-27 — fiabilité du parcours client
   ↓
IMP-28 — captif / WG / états dégradés
   ↓
IMP-29 — socle admin
   ├── IMP-30 — overview + santé
   ├── IMP-31 — commandes + paiements
   ├── IMP-32 — tickets + lots + import
   ├── IMP-33 — incidents + récupération
   └── IMP-34 — plans + paramètres + audit
             ↓
IMP-35 — hardening + GO/NO-GO
             ↓
IMP-36 — FedaPay production
             ↓
IMP-37 — production prête, non ouverte
             ↓
IMP-38 — WG production + captive réel
             ↓
IMP-39 — go-live progressif
             ↓
IMP-40 — exploitation + transfert
```

`IMP-23` et `IMP-24` restent des dépendances techniques de `IMP-28`, `IMP-30`, `IMP-32`
et `IMP-33`, mais leur validation RouterOS réelle doit être traitée comme un gate explicite,
pas comme une hypothèse implicite.

---

# 7. PLAN CANONIQUE CORRIGÉ IMP-27 → IMP-40

## IMP-27 — finaliser le parcours paiement / délivrance / récupération

### Périmètre

- finaliser polling avec backoff borné ;
- conserver `UNKNOWN` comme état technique non assimilé à un échec ;
- afficher référence et état récupérable ;
- définir l’endpoint et le parcours « référence + token » si le contrat le maintient ;
- garantir refresh/reprise ;
- anti-double clic frontend + idempotence backend ;
- présenter confirmation, préparation, ticket et instructions HotSpot ;
- ajouter E2E navigateur et revue UX Quality Gate.

### Sortie attendue

```text
E2E pending → confirmed → ticket
E2E refresh pendant paiement
E2E double clic
E2E paiement confirmé / allocation retardée
UNKNOWN jamais affiché comme FAILED
```

## IMP-28 — captif, dégradé, Walled Garden

### Code-first réalisé

- distinction backend injoignable, offline navigateur et réponse `5xx` ;
- tests unitaires d'origine `/api` et `status = 0` ;
- tests E2E offline, backend indisponible et backend `503` ;
- inventaire statique des URLs frontend/API/FedaPay ;
- décision documentée : Walled Garden de production vide ;
- protocole read-only du portail captif ;
- mémoire des intégrations différées dans `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`.

### Externe différé

- mesure physique du portail et des assets ;
- hostname public frontend/API réellement déployé ;
- `redirect_url` FedaPay sandbox réellement observée ;
- test HTTP/HTTPS sur téléphone non authentifié ;
- toute écriture Walled Garden, firewall, NAT ou DNS.

### Gate

Validation externe de Stane nécessaire pour les domaines et le portail. Aucune écriture MikroTik dans cet IMP.

## IMP-29 — socle admin

### Périmètre

- `/admin/login` et route guard réel ;
- Supabase Auth email/mot de passe ;
- refresh/logout/session expirée ;
- MFA uniquement si activée côté Supabase ;
- layout/sidebar ;
- permissions serveur ;
- états loading/empty/error/offline ;
- pagination et filtres serveur.

## IMP-30 — overview + santé

### Périmètre

- KPI backend exacts ;
- activité récente ;
- inventaire et alertes ;
- Connector avec états honnêtes ;
- dernière synchronisation ;
- incidents ouverts ;
- vérification des six questions de doc 09 §108.

## IMP-31 — commandes + paiements admin

### Périmètre

- liste/recherche/filtres/pagination ;
- détail commande ;
- timeline commande→paiement→ticket→sync ;
- références non secrètes ;
- aucune action « marquer payé » ;
- procédure exceptionnelle de correction ;
- raison obligatoire, permission et audit ;
- IDOR et intégration PostgreSQL.

## IMP-32 — tickets, lots et import

### Périmètre

- inventaire filtrable ;
- DIGITAL/PHYSICAL ;
- codes masqués ;
- révélation contrôlée et audit ;
- lots et compteurs ;
- import preview→validation→transaction ;
- réservation expirée ;
- stock par plan ;
- réconciliation avec le manifeste IMP-06.

## IMP-33 — incidents et récupération

### Périmètre

- file et fiche incident ;
- contexte, tentatives, erreurs ;
- retry allocation ;
- resync ;
- resolve/reopen ;
- idempotence et audit ;
- scénarios A→E doc 09 §117.

## IMP-34 — plans, paramètres, audit

### Périmètre

- CRUD de plans versionné ;
- snapshots non rétroactifs ;
- activation/désactivation ;
- ordre d’affichage ;
- paramètres métier autorisés ;
- audit de chaque opération sensible ;
- protection contre modification accidentelle de la Grille A.

## IMP-35 — hardening et GO/NO-GO

### Périmètre

- exécuter P1-P7, I1-I5, M1-M6, A1-A4, S1-S10 ;
- gitleaks ;
- audit dépendances ;
- revue RLS ;
- CORS, rate limit, secrets, headers, CSP minimale ;
- tests de charge 1/10/50 utilisateurs ;
- produire `docs/testing/SECURITY_TEST_REPORT.md` ;
- zéro CRITICAL/HIGH ouvert.

## IMP-36 — FedaPay production

### Périmètre Stane

- onboarding marchand ;
- KYC/statut juridique/compte ;
- reversement ;
- coûts et limites ;
- clés live ;
- webhook HTTPS live ;
- transaction réelle contrôlée et remboursement si possible.

Aucun secret ne doit être transmis à l’agent ni commités.

## IMP-37 — production prête mais fermée

### Périmètre

- Supabase production et migrations ;
- backup initial ;
- backend Railway ;
- frontend et domaine ;
- CORS ;
- seeds ;
- stock réel ;
- Sentry/uptime/healthchecks ;
- smoke tests doc 11 §43.

## IMP-38 — WG production et tests captifs réels

### Préconditions obligatoires

1. accord explicite de Stane ;
2. backup OP-P0-1 vérifié ;
3. IMP-28 validé ;
4. IMP-35 validé ;
5. IMP-37 prêt ;
6. scope uniquement `/ip hotspot walled-garden add` ;
7. vérification, logs et rollback préparés.

## IMP-39 — go-live progressif

Paliers obligatoires : infrastructure, interne, achat contrôlé 100 FCFA, accès limité,
production complète. Surveiller 24 heures puis 7 jours et conserver les preuves de la
première vente.

## IMP-40 — exploitation et transfert

- restore drill réel dans Supabase jetable ;
- runbooks ;
- incidents ;
- backup/restore ;
- rollback ;
- monitoring ;
- deployment ;
- backups MikroTik ;
- postmortem ;
- guide mère simple : coupure de courant, Wi-Fi en panne, personne à appeler.

---

# 8. ACTIONS POSSIBLES AVANT LE DÉPART DU SITE

## A — Faisables sans MikroTik

- stabiliser et valider IMP-27 côté frontend/backend ;
- E2E navigateur et tests de résilience ;
- migration/validation Supabase lorsque Stane agit dans son projet ;
- socle admin et modules 29→34 ;
- hardening et rapport IMP-35 ;
- préparation FedaPay sandbox ;
- préparation production sans ouverture publique ;
- documentation, CI, secrets, RLS, rate limits et CSP ;
- production de la liste WG à partir des domaines réellement utilisés.

## B — Nécessitent l’accès MikroTik ou LAN

- vérifier les sauvegardes et leur restauration dans un environnement approprié ;
- exécuter le probe permissions RouterOS IMP-23 avec un utilisateur technique jetable ;
- valider le Connector sur l’équipement réel ;
- capturer les comportements HTTP/DNS/redirect captifs ;
- vérifier les domaines qui doivent réellement passer avant authentification ;
- tester la résolution, le portail legacy et les scénarios réseau dégradé ;
- valider la réconciliation sur inventaire RouterOS réel ;
- IMP-38 : toute écriture WG, uniquement après les gates et accord explicite.

## C — Peut attendre

- IMP-36 à IMP-39 peuvent attendre la fin des validations distantes et des gates de sécurité ;
- IMP-40 peut attendre la première période de production ;
- autologin hors MVP peut attendre ;
- migration RADIUS peut attendre car elle n’est pas nécessaire au MVP actuel ;
- amélioration visuelle non fonctionnelle peut attendre la validation transactionnelle.

---

# 9. PRIORISATION TEMPORELLE

| Priorité | Implémentations / actions | Pourquoi |
|---|---|---|
| P0 — maintenant | Recalage Git, stabilisation IMP-27, E2E transactionnel, vérification sauvegarde/routeur | Empêche de construire sur une base non validée et protège le parcours financier critique. |
| P1 — avant départ si possible | IMP-23 réel, capture captif/WG, validation DNS/HTTP, préparation hôte Connector | Exploite la présence physique sans effectuer d’écriture risquée. |
| P2 — entièrement à distance | IMP-28 documentaire, IMP-29→35, intégration tests, sécurité, Supabase préparé | Aucun accès MikroTik nécessaire pour avancer sur le cloud et l’application. |
| P3 — production gated | IMP-36→39 | Nécessite validations Stane, clés externes, production HTTPS et gates précédents. |
| P4 — après go-live | IMP-40 | Requiert un système effectivement exploité et des preuves de fonctionnement réelles. |

Le fait qu’une implémentation concerne MikroTik ne suffit pas à la classer P0. Elle devient
P0 seulement si elle débloque une décision imminente et si elle est réalisable sans contourner
les gates de sécurité.

---

# 10. RÈGLES DE WORKFLOW

1. Aucun nouveau code avant validation explicite de Stane de ce document.
2. Aucun `git add`, `git commit` ou `git push` par l’agent.
3. Avant toute reprise de code, réconcilier `main`, `origin/main` et les changements non commités.
4. Ne pas écraser les travaux `IMP-25.6`, `IMP-26` et `IMP-27` ; les séparer par périmètre.
5. Une implémentation à la fois, avec architecture et critères explicites.
6. Format de suivi obligatoire : `PROBLÈME → CAUSE → IMPACT → SOLUTION → FICHIERS → TEST`.
7. Le frontend ne décide jamais seul du paiement, du ticket ou d’un état métier.
8. Aucun secret dans le chat, le frontend, le dépôt ou les logs.
9. Toute action MikroTik nécessite backup, scope, vérification et rollback.
10. Toute erreur runtime ou de déploiement doit être traitée avant clôture.
11. Les tests PostgreSQL, sandbox, RouterOS et production doivent être distingués des tests unitaires.
12. Toute implémentation est clôturée seulement après preuves et validation de son DoD.

---

# 11. HISTORIQUE DES CHANGEMENTS DU PLAN

## Version 1.0 — 25/09/2026

- audit initial complet du repository et du workspace ;
- constat que `HEAD` local est `IMP-25.1` et `origin/main` est `IMP-25.5` ;
- constat des changements non commités `IMP-25.6`, `IMP-26` et `IMP-27` ;
- correction de la confusion historique : `IMP-27` concerne le parcours paiement/délivrance,
  pas le Dashboard Admin complet ;
- reclassement des listes admin présentes vers IMP-29→IMP-34 ;
- classification explicite IMP-01→IMP-40 ;
- ajout des contraintes physiques MikroTik, des gates FedaPay/Supabase et des priorités ;
- interdiction de reprendre l’implémentation avant validation de Stane.

Toute modification ultérieure du découpage doit être ajoutée ici, avec sa justification et la
date de validation propriétaire.
