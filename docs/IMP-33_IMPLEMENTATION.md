# IMP-33 — Incidents et récupération

## PROBLÈME

Les échecs d'allocation (stock épuisé, ordre invalide), les blocages de la file MikroTik et les
pannes du Connector n'étaient pas transformés en incidents traçables. L'admin ne disposait ni de
file d'incidents, ni de fiche, ni d'actions contrôlées (ack, investigate, resolve, reopen, retry) :
aucun moyen de reprendre une allocation échouée, aucun moyen de requeue une opération MikroTik
bloquée, et aucun audit des interventions.

## CAUSE

- Aucune table d'incidents : les erreurs restaient dans les logs et les `error_code` ;
- `mikrotik_sync.blocked_at` était posé mais jamais détecté, ni repris ;
- Le Connector hors-ligne n'ouvrait aucun incident de disponibilité ;
- Aucune route admin d'incidents, aucune action idempotente, aucun retry contrôlé ;
- La transition `RESOLVED→REOPENED` n'existait pas dans la table de garde
  `state_transitions` (doc 09 §43).

## IMPACT

Sans correction : un échec d'allocation perdait le client (ticket jamais délivré) sans visibilité ;
un blocage MikroTik restait bloqué indéfiniment ; une panne Connector n'était signalée à personne ;
les actions admin manuelles (si elles existaient) n'auraient ni idempotence ni audit.

## SOLUTION

### Migration `0016_incident_recovery` (+ down)

- `incidents` (table existante 0006, étendue — aucun modèle parallèle) : colonnes de la fiche
  (références commande/paiement/ticket/Connector, `error` sûre, `recommended_action`,
  `acknowledged_at/by`, `last_attempt_at`), les 8 types du doc 09 §41
  (`PAYMENT_CONFIRMATION_ERROR`, `TICKET_ALLOCATION_ERROR`, `TICKET_DELIVERY_ERROR`,
  `MIKROTIK_SYNC_ERROR`, `CONNECTOR_OFFLINE`, `WEBHOOK_ERROR`, `INVENTORY_ERROR`,
  `SYSTEM_ERROR`) ; priorités §42 (LOW/MEDIUM/HIGH/CRITICAL) ; cycle §43
  (`OPEN→ACKNOWLEDGED→INVESTIGATING→RESOLVED/CLOSED`, `REOPENED` depuis RESOLVED/CLOSED) ;
  `context` (jamais de secret), `attempts`, `reopened_count`, `detection_key` unique partiel
  (idempotence des détections), `last_retry_key` (anti-rejeu du retry), `close_reason`,
  `order_id`/`payment_id`/`ticket_id` ; `CHECK` : `closed_at` obligatoire et seulement si
  RESOLVED/CLOSED ; `reopened_count` ≥ 1 seulement si REOPENED ;
- `state_transitions` : `('incident','RESOLVED','REOPENED')` + **`('mikrotik_sync','FAILED','PENDING')`
  et `('mikrotik_sync','BLOCKED','PENDING')`** — le resync passe par la transition légitime de la
  table de garde (garde 0009 dynamique, audit automatique) ;
- 17 tables au total (inchangées ; `incidents` est étendue en place).

### Repo (`repo.ts` + parité `fake-repo.ts`)

- **Détections idempotentes** (une `detection_key` par occurrence, jamais de doublon) :
  - `markSyncBlocked(op)` (tickets.ts) → `MIKROTIK_SYNC_ERROR` HIGH, key `sync-blocked:<opId>` ;
    résolution automatique dès que l'opération repasse ;
  - `detectAllocationFailure(order, code, message)` (tickets.ts) → `TICKET_ALLOCATION_ERROR`
    HIGH, key `allocation-failed:<orderId>` ;
  - `runConnectorOfflineDetection(actor, now)` (workers.ts, appelé en dernière étape du cycle de
    synchronisation) → `CONNECTOR_OFFLINE` MEDIUM, key `connector-offline` ; résolution
    automatique dès que le Connector répond (scénario E).
- **Fiche incident** : `getAdminIncidents` (liste + filtres type/severité/état, contexte projeté)
  et `getAdminIncident(id)` (détail : fiche, contexte, erreurs, tentatives, historique d'audit).
  Projection sans secret : jamais de clé API, code ticket, PAN, webhook raw.
- **Actions idempotentes** : `acknowledgeIncident`, `investigateIncident`, `resolveIncident`
  (+`close_reason`), `reopenIncident` — transition selon la table de garde ; 404 si absent, 409
  si transition inapplicable, 400 si état inconnu ; `REOPENED` compte dans `reopened_count` ;
  audit `incident_transition` pour chaque transition.
- **Retry par clé d'idempotence** : `retryIncident(id, actor, reason, idempotencyKey)` :
  - `TICKET_ALLOCATION_ERROR` → ré-exécute `allocateAndDeliver` (jamais de nouveau paiement :
    tout autre type → `not-applicable` / `not-retryable-state`) ;
  - `MIKROTIK_SYNC_ERROR` → **requeue DB uniquement** : l'opération repasse en `PENDING`, zéro
    écriture MikroTik, le Connector traite la file au cycle suivant ;
  - `CONNECTOR_OFFLINE` → `not-applicable` (la résolution est automatique au retour) ;
  - outcomes : `delivered | requeued | still-no-stock | illegal-order | replayed |
    not-applicable | not-retryable-state` ;
  - même clé = `replayed` (aucune seconde exécution) ; `last_retry_key` persiste sur l'incident.
- **Audit** : `incident_created`, `incident_transition`, `incident_retry` (actor, avant/après,
  contexte après sans secret).

### Routes (`app.ts` + `schemas.ts`)

- `GET /api/v1/admin/incidents` (filtres `type`, `severity`, `state`) ;
- `GET /api/v1/admin/incidents/:id` ;
- `POST /api/v1/admin/incidents/:id/acknowledge|investigate|resolve|reopen` (body `{reason}`) ;
- `POST /api/v1/admin/incidents/:id/retry` (body `{reason, idempotency_key}`) ;
- 400/404/409/200 selon les cas.

### Frontend (`Admin.tsx`)

- File des incidents avec filtres (type, sévérité, état) et fiches ouvertes ;
- Actions ack / investigate / resolve / reopen / retry avec raison ; retry demande une clé
  d'idempotence (générée par défaut, éditable).

### Leçon — deadlock PostgreSQL prouvé

La première écriture de `retryIncident` (1 transaction : verrou `FOR UPDATE` sur l'incident +
INSERT de détection `ON CONFLICT (detection_key)`) **deadlockait sur PG** : `pg_locks` montrait le
premier transaction `idle in transaction` après l'UPDATE et le second `active` en attente
`Lock/transactionid` sur l'INSERT. La détection `ON CONFLICT` attend la ligne verrouillée par la
même transaction non committée. Correction : **réécriture en 3 phases** — (1) tentative sous verrou
(`attempts+1`, garde anti-rejeu, COMMIT libère le verrou) ; (2) action hors transaction (allocation
ou requeue) ; (3) transaction finale de résolution conditionnelle (`WHERE state IN (4 états ouverts)`),
rejoignable par la détection en cours. Le deadlock n'était pas détecté par le deadlock detector PG
(client externe bloqué côté JS).

## FICHIERS

- `supabase/migrations/0016_incident_recovery.sql` + `supabase/down/0016_incident_recovery.sql`
- `apps/backend/src/repo.ts` (détections, fiche, actions, retry 3 phases, resync)
- `apps/backend/src/fake-repo.ts` (parité complète)
- `apps/backend/src/tickets.ts` (hooks `markSyncBlocked` / `detectAllocationFailure`)
- `apps/backend/src/workers.ts` (`runConnectorOfflineDetection` en fin de cycle)
- `apps/backend/src/schemas.ts` (types incidents + body d'actions)
- `apps/backend/src/app.ts` (routes admin incidents)
- `apps/frontend/src/pages/Admin.tsx` (file + fiche + actions)
- `apps/backend/src/admin-incidents.test.ts` (11 tests FakeRepo)
- `apps/backend/src/repo.pg.test.ts` (4 E2E PostgreSQL : A+E, C, D, worker offline)
- `docs/IMPLEMENTATION_MASTER_PLAN.md`, `docs/field-guides/GUIDE-12-INCIDENTS-RECOVERY.md`

## TEST

- **Backend 245/245** dont 58 tests PostgreSQL réel (54 existants + 4 E2E PG IMP-33) ;
- **E2E PG IMP-33** (PostgreSQL 17 local, migrations 16) :
  - `A + E` : incident `CONNECTOR_OFFLINE` ouvert par le worker, résolu automatiquement au retour
    du Connector ;
  - `C` : incident `TICKET_ALLOCATION_ERROR` (stock épuisé) → retry avec clé → ticket délivré, incident
    `RESOLVED`, `ticket_id` posé, rejeu même clé = `replayed`, reopen → `REOPENED` ;
  - `D` : incident `MIKROTIK_SYNC_ERROR` (opération bloquée) → resync via retry → opération `PENDING`
    (zéro écriture MikroTik), incident `RESOLVED` ;
  - `worker offline` : détection MEDIUM idempotente du cycle de synchronisation.
- **Suite sans DB 187/187** (dont 11 tests FakeRepo IMP-33 : parité actions/retry/idempotence/409/404) ;
- **4 workspaces verts** (321 tests), typecheck/build OK, gitleaks 0 leak (1 faux positif local
  `.env` non suivi, exclu de CI) ;
- Chaîne de migrations `down/up` OK (16 migrations + rollback).
