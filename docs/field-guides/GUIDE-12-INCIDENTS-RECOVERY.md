# GUIDE-12 — Incidents et récupération (IMP-33)

## 1. Ce qu'est un incident

Un incident est un événement traçable qui signale un problème opérationnel et permet la
récupération. Il est créé par le système (détection idempotente) ou manuellement
(`MANUAL_REVIEW`), suivi par l'admin, et résolu par action explicitement auditée.

### 8 types (doc 09 §41)

| Type | Déclencheur / usage | Priorité (code) |
|---|---|---|
| `TICKET_ALLOCATION_ERROR` | Allocation échouée (stock épuisé, ordre invalide) | HIGH (détection auto) |
| `MIKROTIK_SYNC_ERROR` | File MikroTik bloquée (`blocked_at`) | HIGH (détection auto) |
| `CONNECTOR_OFFLINE` | Connector hors-ligne détecté au cycle | MEDIUM (détection auto) |
| `PAYMENT_CONFIRMATION_ERROR` | Argent confirmé, service non délivré | CRITICAL (§42) |
| `TICKET_DELIVERY_ERROR` | Échec de délivrance du ticket | HIGH (§42) |
| `WEBHOOK_ERROR` | Webhook incohérent | assignée à la création (§42) |
| `INVENTORY_ERROR` | Écart inventaire | assignée à la création (§42) |
| `SYSTEM_ERROR` | Erreur système / revue manuelle | assignée à la création (§42) |

### Cycle de vie (doc 09 §43)

```
OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED
  ↘        ↘               ↘          ↘
   → INVESTIGATING → … → RESOLVED → REOPENED (bump `reopened_count`)
                                     → CLOSED (option, `close_reason`)
```

Toute transition doit exister dans `state_transitions` (garde 0009) ; audit
`incident_transition` automatique.

## 2. Détections automatiques (idempotentes)

| Détection | Key | Effet |
|---|---|---|
| Opération MikroTik bloquée | `sync-blocked:<opId>` | Incident `MIKROTIK_SYNC_ERROR` HIGH ; résolu auto si l'opération repasse |
| Allocation échouée | `allocation-failed:<orderId>` | Incident `TICKET_ALLOCATION_ERROR` HIGH (contexte : `error_code`, message) |
| Connector hors-ligne | `connector-offline` | Incident `CONNECTOR_OFFLINE` MEDIUM ; résolu auto au retour du Connector |

Re-détection = pas de doublon (`detection_key` unique). L'incident contient le contexte, les
erreurs et le nombre de tentatives — jamais de secret (clé API, code ticket, PAN, webhook raw).

## 3. Actions admin

Toutes les actions sont idempotentes et auditées (actor, raison, avant/après).

| Action | Effet | Erreur attendue |
|---|---|---|
| `acknowledge` | `OPEN→ACKNOWLEDGED` | 409 si déjà avancé |
| `investigate` | `→INVESTIGATING` | 409 si inapplicable |
| `resolve` (+raison) | `→RESOLVED` (+`closed_at`, `close_reason`) | 409 si déjà résolu/fermé |
| `reopen` (+raison) | `RESOLVED/CLOSED→REOPENED` (+`reopened_count++`) | 409 si ouvert |
| `retry` (+raison, +clé) | Ré-exécute selon le type (voir §4) | 409 si état non retryable |

**404** si incident inconnu, **400** si paramètre inconnu, **409** si transition inapplicable.

## 4. Retry et resync — règles absolues

### Retry par type d'incident

| Type | Comportement | Outcome possible |
|---|---|---|
| `TICKET_ALLOCATION_ERROR` | Ré-exécute `allocateAndDeliver` | `delivered`, `still-no-stock`, `illegal-order` |
| `MIKROTIK_SYNC_ERROR` | **Requeue DB uniquement** : opération → `PENDING`, le Connector traite la file au cycle suivant | `requeued` |
| `CONNECTOR_OFFLINE` | Non retryable (résolution automatique au retour) | `not-applicable` |
| Autres types | Non retryable | `not-applicable` / `not-retryable-state` |

### Règles absolues

1. **Jamais de nouveau paiement** dans un retry (doc 09 §46) : le retry ré-alloque, il ne
   re-paie pas.
2. **Zéro écriture MikroTik** lors d'un resync : seule la file DB est requeue ; les écritures
   routeur restent soumises aux gates de production (IMP-28 walled garden).
3. **Idempotence par clé** : même clé = `replayed`, aucune seconde exécution ;
   `last_retry_key` est persistée sur l'incident.
4. **Tentatives comptées** : `attempts` est incrémenté une fois par retry (pas de double
   comptage au rejeu).

## 5. Scénarios de récupération (doc 09 §117 A→E)

- **A + E** : Connector hors-ligne → incident `CONNECTOR_OFFLINE` ouvert par le cycle de
  synchronisation ; retour du Connector → incident résolu automatiquement.
- **C** : stock épuisé au checkout → `TICKET_ALLOCATION_ERROR` ouvert → l'admin recharge le stock →
  `retry` → ticket délivré, incident `RESOLVED`, `ticket_id` tracé ; rejeu de la même clé =
  `replayed` ; `reopen` possible ensuite.
- **D** : opération MikroTik bloquée → `MIKROTIK_SYNC_ERROR` ouvert → l'admin débloque →
  `retry` (resync) → opération `PENDING`, incident `RESOLVED` ; le Connector la traite au cycle
  suivant sans nouvel appel direct.

## 6. Exploitation quotidienne

1. Consulter la file des incidents (admin) ; filtrer par type, sévérité, état.
2. Prendre en charge (`acknowledge`) puis investiguer si nécessaire.
3. Appliquer l'action de récupération (recharge de stock, déblocage de la file, retour Connector).
4. `retry` avec une clé unique par occurrence (le frontend en génère une).
5. Vérifier l'outcome (`delivered` / `requeued` / …) et la fiche (historique d'audit).
6. `resolve` avec raison explicite ; `reopen` si le problème persiste (compté dans
   `reopened_count`).

## 7. Vérification des gardes (SQL)

```sql
-- Les 8 types et le cycle de vie
SELECT type, priority FROM incidents GROUP BY 1, 2 ORDER BY 1;

-- Historique d'un incident
SELECT action, actor, before, after, at
FROM audit_logs
WHERE entity = 'incident' AND entity_id = '<incident_id>'
ORDER BY at DESC;

-- Incidents ouverts
SELECT id, type, severity, state, attempts, reopened_count, created_at
FROM incidents WHERE state NOT IN ('RESOLVED','CLOSED') ORDER BY created_at;
```
