# PHASE 5 — DATA & BACKEND SYSTEM

## Modèle métier, système de données, machines à états, intégrité transactionnelle et logique backend

**Projet :** Déo Gracias Wi-Fi Zone
**Phase :** 5 — Data & Backend System
**Statut :** Spécification / conception
**Implémentation :** Non commencée
**Dépendances :** Phases 0 → 4
**Prochaine phase :** Phase 6 — MikroTik Integration

---

# 00 — PURPOSE

Cette phase transforme les parcours UX définis en Phase 4 et l'architecture cible définie en Phase 3 en un **modèle métier et un système backend formel**.

Le backend devient ici la **source d'autorité du système**.

Il doit notamment garantir que :

* un prix ne peut pas être manipulé par le client ;
* un paiement n'est considéré comme confirmé que lorsqu'une preuve fiable est reçue et validée ;
* un webhook ne peut pas être rejoué pour provoquer une double opération ;
* un paiement confirmé ne soit jamais perdu ;
* un ticket ne puisse pas être attribué à deux commandes ;
* une commande ne puisse pas recevoir plusieurs tickets par erreur ;
* un ticket ne soit pas délivré avant la confirmation du paiement ;
* un client ne puisse pas fabriquer lui-même un statut `PAID` ;
* une panne MikroTik ne fasse pas disparaître une vente ;
* chaque événement critique soit traçable ;
* les opérations sensibles puissent être auditées et réconciliées.

Le système doit être conçu autour de cette règle :

> **Le frontend demande. Le backend décide. Les systèmes externes prouvent.**

---

# 01 — BACKEND PHILOSOPHY

## 01.1 — Backend as Business Authority

Le frontend peut demander :

```text
"Je veux acheter l'offre X."
```

Mais il ne peut pas décider :

```text
"Cette offre coûte 100 FCFA."
"Le paiement est réussi."
"Ce ticket m'appartient."
"Je suis autorisé sur MikroTik."
```

Ces décisions appartiennent au backend.

Architecture conceptuelle :

```text
CLIENT
  │
  ▼
FRONTEND
  │
  │ request
  ▼
BACKEND
  │
  ├── Database
  ├── Payment Provider
  ├── Ticket Inventory
  └── MikroTik
```

Le frontend reste une couche de présentation et d'interaction.

---

# 02 — SOURCE OF TRUTH

Le système doit avoir une hiérarchie claire des sources de vérité.

## 02.1 — Offre

La base de données est la source de vérité du prix et des paramètres commerciaux.

```text
Frontend
   ↓
plan_id
   ↓
Backend
   ↓
Database
   ↓
prix officiel
```

---

## 02.2 — Paiement

Le client n'est jamais une source de vérité.

Le statut doit être établi à partir de la chaîne de paiement autorisée.

```text
Customer
   ✗
Frontend
   ✗
Payment Provider / Aggregator
   ✓
Backend
   ✓
```

---

## 02.3 — Ticket

La base de données constitue la source de vérité de l'inventaire applicatif.

MikroTik constitue la source de vérité opérationnelle de l'existence/configuration de l'accès réseau lorsqu'une synchronisation est nécessaire.

---

## 02.4 — Accès réseau

Le backend doit pouvoir déterminer :

```text
Paiement confirmé ?
        ↓
Ticket attribué ?
        ↓
Accès synchronisé ?
        ↓
MikroTik prêt ?
```

L'utilisateur ne doit jamais pouvoir sauter ces étapes.

---

# 03 — MODÈLE MÉTIER GLOBAL

Le cœur métier peut être représenté ainsi :

```text
CUSTOMER
    │
    │ creates
    ▼
ORDER
    │
    ├──────────────► PAYMENT
    │                   │
    │                   ▼
    │             PAYMENT_EVENTS
    │
    ▼
PLAN
    │
    ▼
TICKET ALLOCATION
    │
    ▼
TICKET
    │
    ▼
MIKROTIK_SYNC
    │
    ▼
ACCESS SESSION
```

Les opérations critiques produisent également :

```text
AUDIT_LOG
```

et les anomalies :

```text
INCIDENT
```

---

# 04 — ENTITÉS PRINCIPALES

Le modèle de données doit au minimum comprendre :

```text
customers
plans
tickets
orders
payments
payment_events
mikrotik_sync
access_sessions
audit_logs
```

Une table ou structure supplémentaire `admin_users` / `users` pourra être utilisée pour l'administration selon l'architecture d'authentification retenue.

---

# 05 — ENTITY : CUSTOMERS

## Rôle

Représente la personne effectuant une opération sur le portail.

Un client peut :

* consulter les offres ;
* créer une commande ;
* initier un paiement ;
* obtenir un accès ;
* retrouver une transaction selon les mécanismes prévus.

---

## Données conceptuelles

```text
customers
──────────────
id
identifier
phone
created_at
updated_at
metadata
```

### Important

Ne collecter que les données réellement nécessaires.

Le système n'a pas besoin de transformer un achat Wi-Fi de quelques centaines de FCFA en profil utilisateur excessivement détaillé.

---

# 06 — IDENTIFICATION CLIENT

Le système doit pouvoir fonctionner même avec une identification minimale.

L'identification peut reposer selon les capacités retenues sur :

* numéro de téléphone ;
* identifiant de session ;
* identifiant client interne ;
* référence de transaction ;
* mécanisme temporaire de récupération.

La décision finale dépendra de l'architecture d'authentification choisie.

---

# 07 — ENTITY : PLANS

`plans` représente les offres commerciales.

Structure conceptuelle :

```text
plans
──────────────
id
code
name
price
currency
access_duration
validity_duration
mikrotik_profile
is_active
created_at
updated_at
```

Exemple conceptuel :

```text
5H
100 FCFA
access_duration = 5h
validity_duration = 24h
mikrotik_profile = 5-HEURES
```

---

# 08 — RÈGLE CRITIQUE SUR LES PLANS

Le frontend ne doit jamais envoyer :

```json
{
  "price": 100
}
```

comme information faisant autorité.

Il doit envoyer :

```text
plan_id
```

Puis le backend fait :

```text
plan_id
   ↓
Database
   ↓
prix officiel
```

Ainsi, une modification côté navigateur :

```text
100 FCFA → 1 FCFA
```

ne peut pas modifier le montant réel de la commande.

---

# 09 — SNAPSHOT DES INFORMATIONS DE PLAN

Une commande doit conserver un snapshot des paramètres commerciaux utilisés au moment de l'achat.

Pourquoi ?

Parce qu'un plan peut être modifié ultérieurement.

Exemple :

```text
Aujourd'hui
24H = 300 FCFA
```

Puis plus tard :

```text
24H = 350 FCFA
```

Une ancienne commande à 300 FCFA doit rester historiquement cohérente.

Donc `orders` doit conserver notamment :

```text
plan_id
plan_name_snapshot
price_snapshot
currency_snapshot
access_duration_snapshot
validity_duration_snapshot
```

---

# 10 — ENTITY : ORDERS

`orders` représente l'intention commerciale d'achat.

Une commande est créée avant que le paiement soit confirmé.

Structure conceptuelle :

```text
orders
──────────────
id
reference
customer_id
plan_id

price
currency

status

payment_id
ticket_id

created_at
updated_at
expires_at
```

---

# 11 — ORDER STATE MACHINE

La machine principale est :

```text
CREATED
   ↓
PAYMENT_PENDING
   ↓
PAID
   ↓
TICKET_ALLOCATED
   ↓
DELIVERED
```

Branches :

```text
PAYMENT_PENDING
   ├── FAILED
   ├── EXPIRED
   └── CANCELLED

PAID
   └── REFUNDED
```

Et des états techniques complémentaires peuvent être nécessaires pour représenter les problèmes d'exécution sans détruire l'état financier.

---

# 12 — SIGNIFICATION DES ÉTATS ORDER

## `CREATED`

La commande existe.

Aucun paiement n'est encore confirmé.

---

## `PAYMENT_PENDING`

Une tentative de paiement est en cours ou attend confirmation.

---

## `PAID`

Le paiement a été confirmé selon les règles du système.

Cela ne signifie pas encore :

> accès disponible.

---

## `TICKET_ALLOCATED`

Un ticket a été réservé/attribué à la commande.

---

## `DELIVERED`

L'accès ou les informations nécessaires ont effectivement été délivrés au client.

---

## `FAILED`

La commande n'a pas pu aboutir selon un motif d'échec définitif.

---

## `EXPIRED`

La commande ou son processus de paiement a dépassé sa fenêtre de validité sans confirmation exploitable.

---

## `CANCELLED`

La commande a été annulée selon une opération autorisée.

---

## `REFUNDED`

Le paiement correspondant a fait l'objet d'un remboursement confirmé.

---

# 13 — IMPORTANT : ORDER STATE ≠ PAYMENT STATE ≠ ACCESS STATE

Il ne faut surtout pas tout mettre dans un seul statut.

Exemple :

```text
ORDER
PAID

PAYMENT
CONFIRMED

TICKET
ALLOCATED

MIKROTIK
PENDING

ACCESS
PENDING
```

C'est beaucoup plus précis que :

```text
ORDER = ERROR
```

Le système doit conserver la réalité de chaque sous-système.

---

# 14 — ENTITY : PAYMENTS

`payments` représente la transaction financière principale.

Structure conceptuelle :

```text
payments
──────────────
id
order_id
provider
aggregator
operator
external_reference
amount
currency
status
initiated_at
confirmed_at
failed_at
expires_at
metadata
created_at
updated_at
```

---

# 15 — PAYMENT STATE MACHINE

Machine minimale :

```text
CREATED
   ↓
INITIATED
   ↓
PENDING
   ↓
CONFIRMED
```

Branches :

```text
PENDING
 ├── FAILED
 ├── CANCELLED
 └── EXPIRED
```

Et après confirmation :

```text
CONFIRMED
   ↓
REFUNDED
```

---

# 16 — PAYMENT STATE DEFINITIONS

### `CREATED`

Transaction financière créée dans le système.

### `INITIATED`

Demande de paiement envoyée au prestataire.

### `PENDING`

Le résultat définitif n'est pas encore connu.

### `CONFIRMED`

Le paiement a été authentiquement confirmé.

### `FAILED`

Le paiement a échoué de manière définitive.

### `CANCELLED`

La transaction a été annulée.

### `EXPIRED`

La fenêtre de confirmation est dépassée selon les règles du provider.

### `REFUNDED`

Le montant a été remboursé.

---

# 17 — PAYMENT CONFIRMATION RULE

Le système doit appliquer une règle extrêmement stricte :

```text
Frontend says PAID
        ↓
IGNORED as proof
```

```text
Provider/Aggregator sends event
        ↓
Backend validates
        ↓
Payment becomes CONFIRMED
```

La confirmation doit donc être **server-side**.

---

# 18 — ENTITY : PAYMENT_EVENTS

`payment_events` conserve les événements reçus du système de paiement.

Cette table est essentielle.

Structure :

```text
payment_events
────────────────────
id
payment_id
provider
event_id
event_type
external_reference
payload
signature
signature_valid
received_at
processed_at
processing_status
error_message
```

---

# 19 — POURQUOI PAYMENT_EVENTS ?

Parce qu'un paiement n'est pas uniquement un état final.

Il existe une chronologie :

```text
Event 01
Payment initiated

Event 02
Payment pending

Event 03
Payment confirmed
```

Le système doit conserver cette chronologie.

Cela permet :

* diagnostic ;
* audit ;
* réconciliation ;
* détection de doublons ;
* récupération après panne.

---

# 20 — IDEMPOTENCE DES PAYMENT EVENTS

Un même événement peut être reçu plusieurs fois.

Exemple :

```text
Webhook #123
```

reçu :

```text
1 fois
2 fois
3 fois
```

Le résultat métier doit rester :

```text
1 paiement confirmé
```

et non :

```text
3 paiements
3 tickets
```

---

# 21 — IDEMPOTENCY KEY

Chaque événement externe doit posséder un identifiant unique exploitable.

Contrainte conceptuelle :

```text
UNIQUE(provider, event_id)
```

ou une équivalence adaptée au provider.

Ainsi :

```text
event_id = ABC123
```

ne peut pas être traité comme trois événements différents.

---

# 22 — WEBHOOK PROCESSING

Pipeline :

```text
Webhook received
      ↓
Raw event stored
      ↓
Signature verified
      ↓
Event identity checked
      ↓
Duplicate check
      ↓
Payload validated
      ↓
Payment located
      ↓
State transition validated
      ↓
Payment updated
      ↓
Business action triggered
      ↓
Event marked processed
```

---

# 23 — WEBHOOK SECURITY

Un webhook ne doit jamais être accepté simplement parce qu'il contient :

```text
status = SUCCESS
```

Le backend doit vérifier selon les mécanismes fournis par le prestataire :

* signature ;
* secret ;
* authenticité de la requête ;
* référence transaction ;
* montant ;
* devise ;
* commande ;
* état ;
* cohérence des données.

---

# 24 — ATOMICITÉ DU PAIEMENT

Lorsqu'un événement confirme un paiement, la mise à jour critique doit être traitée comme une opération cohérente.

Conceptuellement :

```text
BEGIN TRANSACTION

validate payment event
update payment
update order
create allocation job / allocation state
create audit event

COMMIT
```

Si une étape critique échoue :

```text
ROLLBACK
```

ou le système doit utiliser une stratégie transactionnelle équivalente.

---

# 25 — NE PAS COUPLER EXCESSIVEMENT PAYMENT ET MIKROTIK

Une confirmation financière ne doit pas être annulée simplement parce que MikroTik est temporairement inaccessible.

Mauvaise logique :

```text
Payment confirmed
↓
MikroTik offline
↓
Payment = failed
```

Bonne logique :

```text
Payment = CONFIRMED
Access = PENDING
```

Cela protège l'intégrité financière.

---

# 26 — ENTITY : TICKETS

`tickets` représente l'inventaire des accès Wi-Fi.

Structure conceptuelle :

```text
tickets
──────────────
id
code
username
password_reference
plan_id
status
order_id
created_at
reserved_at
sold_at
used_at
expires_at
metadata
```

Selon le fonctionnement actuel, le `name` du ticket est identique au `password`.

Cette particularité doit être conservée dans la logique d'intégration, mais **les secrets/codes ne doivent pas être exposés inutilement dans les logs ou interfaces administratives**.

---

# 27 — TICKET STATES

Machine recommandée :

```text
AVAILABLE
   ↓
RESERVED
   ↓
SOLD
   ↓
USED
```

Branches possibles :

```text
AVAILABLE → EXPIRED
RESERVED → RELEASED
SOLD → REFUNDED
```

---

# 28 — SIGNIFICATION

### `AVAILABLE`

Ticket disponible dans l'inventaire.

### `RESERVED`

Ticket temporairement réservé à une commande.

### `SOLD`

Ticket associé à un paiement confirmé.

### `USED`

Ticket effectivement utilisé pour l'accès.

### `EXPIRED`

Ticket devenu inutilisable selon les règles métier.

### `RELEASED`

Réservation annulée et ticket retourné à l'inventaire.

---

# 29 — PROBLÈME CENTRAL : DOUBLE ALLOCATION

Le système doit empêcher :

```text
ORDER A → TICKET X
ORDER B → TICKET X
```

même si :

* deux clients paient simultanément ;
* deux webhooks arrivent en même temps ;
* deux workers exécutent la même opération ;
* le serveur redémarre pendant l'allocation.

---

# 30 — TICKET ALLOCATION ATOMIQUE

Le principe doit être :

```text
BEGIN
   find AVAILABLE ticket
   lock ticket
   verify still AVAILABLE
   assign ticket to order
   change state
COMMIT
```

La méthode exacte dépendra du moteur SQL et de l'implémentation retenue, mais le principe est non négociable :

> **l'allocation doit être atomique.**

---

# 31 — CONTRAINTES D'INTÉGRITÉ TICKET

La base doit également empêcher plusieurs associations incohérentes.

Exemple :

```text
ticket.order_id
```

avec une contrainte permettant de garantir qu'un ticket vendu ne puisse appartenir qu'à une seule commande.

Selon le modèle final, on pourra utiliser :

* `UNIQUE(order_id)` pour une relation one-to-one appropriée ;
* `UNIQUE(ticket_id)` dans une table d'allocation ;
* contraintes de clés étrangères ;
* contraintes de statut.

---

# 32 — INVENTAIRE ET COMMANDES

La relation métier doit être :

```text
PLAN
 ↓
TICKET
 ↓
ORDER
```

et non :

```text
CLIENT → choisit librement n'importe quel ticket
```

Le client choisit un plan.

Le backend choisit le ticket compatible.

---

# 33 — ENTITY : MIKROTIK_SYNC

Cette entité représente la synchronisation entre le backend et MikroTik.

Structure conceptuelle :

```text
mikrotik_sync
────────────────
id
ticket_id
order_id
action
status
attempt_count
last_attempt_at
successful_at
error_code
error_message
request_reference
response_reference
created_at
updated_at
```

---

# 34 — MIKROTIK SYNC STATES

```text
PENDING
   ↓
PROCESSING
   ↓
SUCCESS
```

Branches :

```text
PROCESSING
   ↓
FAILED
   ↓
RETRY
   ↓
PROCESSING
```

Et si nécessaire :

```text
BLOCKED
MANUAL_REVIEW
```

---

# 35 — OBJECTIF DE MIKROTIK_SYNC

Le système doit pouvoir distinguer :

```text
Ticket attribué
```

de :

```text
Ticket correctement synchronisé avec MikroTik
```

Exemple :

```text
Payment = CONFIRMED
Ticket = SOLD
MikroTik = PENDING
```

Cela signifie :

> le client a payé, mais l'accès réseau n'est pas encore prêt.

---

# 36 — RETRY SYSTEM

Une panne temporaire ne doit pas nécessiter une intervention humaine immédiate.

Exemple :

```text
Tentative 1
↓
échec réseau

Attente
↓
Tentative 2

Attente
↓
Tentative 3
```

Le nombre et le délai exacts seront définis lors de l'implémentation.

Mais le principe est :

> **retry automatique pour les erreurs temporaires, intervention humaine pour les erreurs persistantes ou ambiguës.**

---

# 37 — ACCESS SESSIONS

Même si cette entité n'était pas explicitement dans la liste initiale, elle est nécessaire pour représenter l'utilisation effective du service.

Structure conceptuelle :

```text
access_sessions
──────────────────
id
customer_id
ticket_id
mikrotik_identifier
started_at
ended_at
status
last_seen_at
bytes_in
bytes_out
metadata
```

Elle permet éventuellement de distinguer :

```text
Ticket vendu
```

de :

```text
Ticket réellement utilisé.
```

---

# 38 — SESSION STATES

```text
NOT_STARTED
   ↓
ACTIVE
   ↓
ENDED
```

Branches possibles :

```text
EXPIRED
DISCONNECTED
ERROR
```

La donnée exacte dépendra de ce que MikroTik peut réellement fournir.

---

# 39 — ENTITY : AUDIT_LOGS

Les opérations sensibles doivent être auditables.

Structure conceptuelle :

```text
audit_logs
────────────────
id
actor_type
actor_id
action
entity_type
entity_id
before
after
ip_address
user_agent
request_id
created_at
metadata
```

---

# 40 — ACTIONS À AUDITER

Au minimum :

```text
ORDER_CREATED
PAYMENT_INITIATED
PAYMENT_CONFIRMED
PAYMENT_FAILED
PAYMENT_REFUNDED

TICKET_RESERVED
TICKET_RELEASED
TICKET_SOLD
TICKET_USED

MIKROTIK_SYNC_STARTED
MIKROTIK_SYNC_SUCCEEDED
MIKROTIK_SYNC_FAILED

PLAN_CREATED
PLAN_UPDATED
PLAN_DISABLED

ADMIN_LOGIN
ADMIN_LOGOUT
ADMIN_ACTION
```

---

# 41 — AUDIT IMMUTABILITY

Les logs d'audit ne doivent pas être traités comme une simple table de commentaires.

Une fois enregistrés, ils doivent être aussi immuables que possible.

Une administratrice ne doit pas pouvoir simplement :

```text
DELETE audit_log
```

pour supprimer la trace d'une opération sensible.

---

# 42 — INCIDENTS

Les incidents doivent être considérés comme une entité métier à part entière.

Exemples :

```text
PAYMENT_CONFIRMED_ACCESS_PENDING
PAYMENT_UNKNOWN
MIKROTIK_UNAVAILABLE
TICKET_ALLOCATION_FAILED
WEBHOOK_INVALID
WEBHOOK_DUPLICATE
SYNC_FAILED
```

Structure conceptuelle :

```text
incidents
──────────────
id
type
severity
status
order_id
payment_id
ticket_id
description
detected_at
resolved_at
resolved_by
resolution
metadata
```

---

# 43 — INCIDENT STATES

```text
OPEN
 ↓
INVESTIGATING
 ↓
RESOLVED
```

ou :

```text
OPEN
 ↓
IGNORED / FALSE_POSITIVE
```

selon le type.

---

# 44 — RELATIONS PRINCIPALES

```text
CUSTOMER
   │
   └──< ORDERS
           │
           ├── PLAN
           │
           └── PAYMENT
                  │
                  └──< PAYMENT_EVENTS
           │
           └── TICKET
                  │
                  ├── MIKROTIK_SYNC
                  │
                  └── ACCESS_SESSIONS
```

Et :

```text
ORDERS
  │
  └──< INCIDENTS

PAYMENTS
  │
  └──< INCIDENTS

TICKETS
  │
  └──< AUDIT_LOGS

ADMIN USERS
  │
  └──< AUDIT_LOGS
```

---

# 45 — RELATION CARDINALITIES

Conceptuellement :

```text
Customer
1 ─────── N
Orders
```

```text
Plan
1 ─────── N
Orders
```

```text
Order
1 ─────── N
Payment Attempts
```

Cela est important : une commande peut éventuellement avoir plusieurs tentatives de paiement.

En revanche, le modèle doit clairement identifier **le paiement actuellement valide/actif**.

---

# 46 — PAYMENT ATTEMPTS

Il est préférable de ne pas considérer chaque tentative comme un nouveau `order`.

Exemple :

```text
ORDER #123
    │
    ├── PAYMENT ATTEMPT #1 → FAILED
    │
    ├── PAYMENT ATTEMPT #2 → CANCELLED
    │
    └── PAYMENT ATTEMPT #3 → CONFIRMED
```

La commande reste la même.

Cela facilite :

* l'historique ;
* la réconciliation ;
* le support ;
* l'analyse des échecs.

---

# 47 — RÈGLE D'UNICITÉ DE COMMANDE

Une commande doit avoir une référence interne unique :

```text
ORDER-XXXXXXXX
```

Cette référence ne doit pas être prédictible de manière dangereuse si elle est exposée publiquement.

Le format final sera défini lors de l'implémentation.

---

# 48 — RÈGLE DE MONNAIE

Les montants financiers ne doivent pas être manipulés avec des flottants.

Préférer une représentation exacte :

```text
100
200
300
500
1000
4000
```

avec :

```text
currency = XOF
```

Le backend doit contrôler :

```text
amount
currency
```

---

# 49 — PAYMENT/ORDER CONSISTENCY

Pour chaque paiement :

```text
payment.order_id
```

doit correspondre à une commande existante.

Et :

```text
payment.amount
```

doit correspondre au montant attendu par la commande.

Exemple :

```text
ORDER
300 XOF

PAYMENT
300 XOF
```

Un événement :

```text
PAYMENT SUCCESS
100 XOF
```

pour cette commande ne doit pas automatiquement être accepté comme paiement complet.

---

# 50 — PROVIDER REFERENCE

Chaque paiement externe doit conserver sa référence externe.

Exemple :

```text
internal_payment_id
external_payment_reference
```

Ne jamais utiliser uniquement la référence interne pour communiquer avec le provider.

---

# 51 — PAYMENT RECONCILIATION

Le système doit pouvoir comparer :

```text
Notre base
        ↕
Provider / Aggregator
```

Exemples d'anomalies :

```text
Notre système : PENDING
Provider       : CONFIRMED
```

ou :

```text
Notre système : CONFIRMED
Provider       : REFUNDED
```

Ces différences doivent pouvoir être détectées.

---

# 52 — RÉCONCILIATION

Le système devra prévoir un mécanisme permettant de rechercher périodiquement :

```text
PENDING payments
```

dont le statut externe pourrait avoir évolué.

Cette opération peut utiliser :

* récupération de statut ;
* événements provider ;
* mécanisme de réconciliation ;
* intervention administrative.

La méthode exacte dépendra du prestataire retenu en Phase 2.

---

# 53 — ORDER LIFECYCLE COMPLET

Le cycle nominal devient :

```text
CLIENT
 ↓
Create Order
 ↓
ORDER = CREATED
 ↓
Create Payment
 ↓
ORDER = PAYMENT_PENDING
 ↓
Provider
 ↓
Webhook
 ↓
Validation
 ↓
PAYMENT = CONFIRMED
 ↓
ORDER = PAID
 ↓
Allocate Ticket
 ↓
ORDER = TICKET_ALLOCATED
 ↓
MikroTik synchronization
 ↓
Access ready
 ↓
ORDER = DELIVERED
```

---

# 54 — ÉCHEC DU PAIEMENT

```text
CREATED
   ↓
PAYMENT_PENDING
   ↓
FAILED
```

Aucune attribution de ticket ne doit être déclenchée.

---

# 55 — PAIEMENT ANNULÉ

```text
CREATED
   ↓
PAYMENT_PENDING
   ↓
CANCELLED
```

Le ticket n'est pas attribué.

---

# 56 — EXPIRATION

```text
CREATED
   ↓
PAYMENT_PENDING
   ↓
EXPIRED
```

Si aucune confirmation financière valide n'est reçue.

---

# 57 — PAIEMENT CONFIRMÉ

```text
PAYMENT_PENDING
   ↓
PAID
```

Puis :

```text
PAID
 ↓
TICKET_ALLOCATION
```

---

# 58 — TICKET ALLOCATION FAILURE

Situation :

```text
ORDER = PAID
```

mais :

```text
Aucun ticket disponible
```

Le système **ne doit pas transformer la commande en FAILED**.

Il doit conserver :

```text
Payment = CONFIRMED
Order = PAID
Fulfillment = PENDING / FAILED
Incident = OPEN
```

Cela préserve la vérité financière.

---

# 59 — TICKET ALLOCATION RECOVERY

Lorsqu'un ticket compatible devient disponible :

```text
PAID
 ↓
Retry allocation
 ↓
TICKET_ALLOCATED
```

Puis :

```text
MIKROTIK_SYNC
```

---

# 60 — MIKROTIK FAILURE

Situation :

```text
Payment = CONFIRMED
Ticket = SOLD
MikroTik = UNAVAILABLE
```

Le système doit :

1. conserver le paiement ;
2. conserver le ticket ;
3. enregistrer l'échec ;
4. créer ou mettre à jour l'incident ;
5. retenter ;
6. informer le client correctement ;
7. permettre une intervention administrative.

---

# 61 — NEVER LOSE MONEY

Principe fondamental :

> **Une panne technique ne doit jamais effacer la réalité financière.**

Ainsi :

```text
Payment confirmed
```

reste vrai même si :

```text
MikroTik offline
Database worker crashed
Ticket delivery delayed
```

La récupération se fait à partir de l'état persistant.

---

# 62 — NEVER DUPLICATE ACCESS

Inversement :

```text
Payment confirmed
```

ne doit pas entraîner :

```text
Ticket A
+
Ticket B
```

pour une seule commande.

Le backend doit avoir des contraintes garantissant :

```text
ONE SUCCESSFUL FULFILLMENT
PER ORDER
```

sauf opération explicitement autorisée.

---

# 63 — TRANSACTION BOUNDARIES

Il faut distinguer les opérations purement internes des appels externes.

### Transaction DB

```text
Create order
+
Create payment
```

peut être atomique.

Mais :

```text
DB transaction
+
appel HTTP au provider
```

ne doit pas être naïvement traité comme une transaction ACID unique.

Même problème avec MikroTik.

---

# 64 — OUTBOX / JOB PATTERN

Pour les opérations asynchrones, le système peut utiliser un mécanisme de jobs/outbox.

Concept :

```text
Database Transaction
       ↓
Persist business state
       ↓
Create job
       ↓
Worker
       ↓
External system
```

Ainsi, un crash entre :

```text
"paiement confirmé"
```

et :

```text
"allocation ticket"
```

ne fait pas disparaître l'action à effectuer.

---

# 65 — EVENT-DRIVEN LOGIQUE

Les événements internes peuvent suivre :

```text
PAYMENT_CONFIRMED
        ↓
FULFILLMENT_REQUESTED
        ↓
TICKET_ALLOCATED
        ↓
MIKROTIK_SYNC_REQUESTED
        ↓
ACCESS_READY
        ↓
ORDER_DELIVERED
```

Cela permet de découpler les composants.

---

# 66 — RETRY + IDEMPOTENCE

Les retries sont dangereux sans idempotence.

Exemple :

```text
Worker
 ↓
Allocate ticket
 ↓
Success
 ↓
Response lost
 ↓
Retry
```

Sans protection :

```text
Ticket A
Ticket B
```

Avec idempotence :

```text
Fulfillment already completed
↓
Return existing result
```

---

# 67 — IDEMPOTENCY DES OPÉRATIONS INTERNES

Les opérations critiques doivent avoir une clé d'idempotence.

Exemples :

```text
order_id
payment_id
fulfillment_id
sync_id
event_id
```

Le système doit pouvoir répondre :

> « Cette opération a déjà été exécutée. »

plutôt que de l'exécuter une deuxième fois.

---

# 68 — PERMISSIONS

Les permissions doivent être basées sur les rôles.

Exemple :

```text
CUSTOMER
ADMIN
SUPER_ADMIN
SYSTEM
```

---

# 69 — CUSTOMER PERMISSIONS

Un client peut :

```text
CREATE_ORDER
VIEW_OWN_ORDER
INITIATE_PAYMENT
VIEW_OWN_PAYMENT_STATUS
VIEW_OWN_ACCESS
USE_TICKET
```

Mais pas :

```text
CONFIRM_PAYMENT
ALLOCATE_TICKET
MODIFY_PRICE
MODIFY_ORDER_AMOUNT
ACCESS_OTHER_CUSTOMER_DATA
MODIFY_MIKROTIK
```

---

# 70 — ADMIN PERMISSIONS

Une administratrice peut éventuellement :

```text
VIEW_DASHBOARD
VIEW_ORDERS
VIEW_PAYMENTS
VIEW_TICKETS
VIEW_INCIDENTS
VIEW_SALES
```

Les opérations sensibles doivent avoir des permissions supplémentaires :

```text
MANAGE_PLANS
MANAGE_TICKETS
RETRY_SYNC
REFUND
MANAGE_SETTINGS
```

---

# 71 — SUPER ADMIN

Le rôle privilégié peut avoir :

```text
SYSTEM_CONFIGURATION
USER_MANAGEMENT
SECURITY_CONFIGURATION
AUDIT_ACCESS
PAYMENT_CONFIGURATION
MIKROTIK_CONFIGURATION
```

Mais même un super-admin ne devrait pas pouvoir supprimer silencieusement les traces d'audit.

---

# 72 — SYSTEM ACTOR

Certaines opérations sont exécutées automatiquement.

Exemple :

```text
SYSTEM
 ├── process webhook
 ├── allocate ticket
 ├── retry MikroTik sync
 ├── expire order
 └── reconcile payment
```

Les logs doivent identifier :

```text
actor_type = SYSTEM
```

afin de différencier :

```text
ADMIN ACTION
```

de :

```text
AUTOMATED ACTION
```

---

# 73 — DATA ACCESS RULE

Une requête client doit toujours être filtrée par son contexte.

Interdit :

```text
GET /orders/123
```

si n'importe quel utilisateur peut consulter l'ordre 123.

Le backend doit vérifier :

```text
current_customer
        ↓
order.customer_id
```

---

# 74 — TICKET CODE SECURITY

Le code d'un ticket est une information d'accès.

Il doit donc être traité comme une donnée sensible.

Éviter :

```text
console.log(ticket.code)
```

ou :

```text
audit_log = full ticket payload
```

Les logs doivent masquer les informations sensibles.

---

# 75 — ADMIN DATA MASKING

Dans l'administration, certains codes peuvent être affichés sous forme :

```text
dyfi****
```

ou :

```text
••••••98
```

avec révélation contrôlée uniquement lorsque nécessaire.

---

# 76 — API TRUST MODEL

Le backend doit considérer toute requête frontend comme potentiellement manipulée.

Exemples :

```text
prix falsifié
plan falsifié
order_id falsifié
customer_id falsifié
status falsifié
ticket_id falsifié
```

La validation doit toujours être effectuée côté serveur.

---

# 77 — VALIDATION LAYER

Chaque entrée externe doit passer par :

```text
Transport validation
        ↓
Schema validation
        ↓
Authentication
        ↓
Authorization
        ↓
Business validation
        ↓
Database constraints
```

La sécurité ne doit pas dépendre d'une seule couche.

---

# 78 — DATABASE AS LAST LINE OF DEFENSE

Même si le backend vérifie :

```text
ticket available
```

la base doit également empêcher les incohérences.

Principe :

```text
Application validation
+
Database constraints
```

et non :

```text
Application validation only
```

---

# 79 — FOREIGN KEYS

Les relations critiques doivent utiliser des clés étrangères.

Exemples :

```text
orders.customer_id → customers.id

orders.plan_id → plans.id

payments.order_id → orders.id

payment_events.payment_id → payments.id

tickets.plan_id → plans.id

tickets.order_id → orders.id
```

Cela empêche les références orphelines.

---

# 80 — UNIQUE CONSTRAINTS

Exemples de contraintes conceptuelles :

```text
plans.code UNIQUE

orders.reference UNIQUE

tickets.code UNIQUE

payment_events.event_id UNIQUE par provider

payments.external_reference UNIQUE lorsque fournie

```

Les contraintes exactes seront adaptées au provider et au schéma final.

---

# 81 — CHECK CONSTRAINTS

Lorsque le SGBD le permet et que cela reste approprié :

```text
price >= 0
amount > 0
```

et les valeurs de statut doivent appartenir à l'ensemble autorisé.

---

# 82 — SOFT DELETE

Les données financières et historiques ne doivent généralement pas être supprimées physiquement simplement parce qu'elles ne sont plus visibles dans l'interface.

Pour les entités sensibles :

```text
active
disabled
archived
```

est souvent préférable à :

```text
DELETE
```

---

# 83 — DATA RETENTION

Le système devra définir ultérieurement :

* durée de conservation des transactions ;
* durée des logs ;
* durée des événements de paiement ;
* durée des incidents ;
* politique de suppression/anonymisation des données client.

Cette décision devra tenir compte des contraintes opérationnelles et réglementaires applicables.

---

# 84 — PAYMENT EVENT RAW PAYLOAD

Le payload reçu du provider peut être extrêmement utile pour le diagnostic.

Mais il doit être :

* stocké de manière contrôlée ;
* protégé ;
* non exposé au client ;
* nettoyé des secrets inutiles si nécessaire.

---

# 85 — REQUEST CORRELATION

Chaque requête importante doit pouvoir être reliée à un identifiant :

```text
request_id
```

Exemple :

```text
Client request
    ↓
Order #123
    ↓
Payment #456
    ↓
Webhook #789
    ↓
Ticket #ABC
    ↓
MikroTik sync #DEF
```

Grâce aux références et IDs, l'administration peut reconstruire le parcours complet.

---

# 86 — OBSERVABILITY

Le système doit permettre de répondre :

> Que s'est-il passé ?

> Quand ?

> Sur quelle commande ?

> Avec quel paiement ?

> Quel ticket ?

> Quelle opération MikroTik ?

> Quelle erreur ?

> Combien de tentatives ?

Cette approche correspond au principe d'une expérience et d'une architecture observables : les systèmes complexes doivent être contrôlables et observables plutôt que constitués d'effets ou de comportements indépendants. 

---

# 87 — FAILURE CLASSIFICATION

Les erreurs doivent être classifiées.

## Temporary

```text
NETWORK_TIMEOUT
PROVIDER_TIMEOUT
MIKROTIK_UNAVAILABLE
DATABASE_CONNECTION_ERROR
```

→ retry.

## Permanent

```text
INVALID_PAYMENT
INVALID_PLAN
INVALID_TICKET
AUTHORIZATION_FAILURE
```

→ ne pas retry aveuglément.

## Unknown

```text
UNKNOWN_PAYMENT_STATUS
UNKNOWN_PROVIDER_RESULT
```

→ réconciliation / vérification.

---

# 88 — RECOVERY MATRIX

| Situation           | Paiement  | Ticket                    | Accès                    | Action           |
| ------------------- | --------- | ------------------------- | ------------------------ | ---------------- |
| Paiement refusé     | FAILED    | Aucun                     | Aucun                    | Fin              |
| Paiement pending    | PENDING   | Aucun                     | Aucun                    | Attendre         |
| Paiement confirmé   | CONFIRMED | Allocation                | Pending                  | Continuer        |
| Ticket indisponible | CONFIRMED | Aucun                     | Pending                  | Retry / incident |
| Ticket attribué     | CONFIRMED | SOLD                      | Pending                  | Sync MikroTik    |
| MikroTik offline    | CONFIRMED | SOLD                      | Pending                  | Retry            |
| Sync réussie        | CONFIRMED | SOLD/USED selon modèle    | READY                    | Deliver          |
| Remboursement       | REFUNDED  | Politique de récupération | Désactiver si nécessaire | Audit            |

---

# 89 — CRITICAL INVARIANTS

Ces invariants sont les règles que le système ne doit jamais violer.

## Invariant 1

```text
Un paiement confirmé doit rester traçable.
```

## Invariant 2

```text
Un ticket ne peut pas être attribué simultanément à deux commandes.
```

## Invariant 3

```text
Un client ne peut pas créer lui-même un paiement confirmé.
```

## Invariant 4

```text
Un ticket ne doit pas être délivré sur la seule déclaration du frontend.
```

## Invariant 5

```text
Une même notification de paiement ne doit pas produire plusieurs effets métier.
```

## Invariant 6

```text
Une panne MikroTik ne doit pas annuler silencieusement un paiement confirmé.
```

## Invariant 7

```text
Une commande livrée ne doit pas être livrée une deuxième fois par un retry.
```

## Invariant 8

```text
Les historiques financiers critiques ne doivent pas être supprimés silencieusement.
```

---

# 90 — TRANSACTION NOMINALE

Le parcours complet peut maintenant être décrit au niveau backend :

```text
1. Client sélectionne PLAN
       ↓
2. Backend récupère PLAN officiel
       ↓
3. ORDER créée
       ↓
4. PAYMENT créée
       ↓
5. Paiement initié
       ↓
6. PAYMENT = PENDING
       ↓
7. Provider confirme
       ↓
8. Webhook validé
       ↓
9. PAYMENT = CONFIRMED
       ↓
10. ORDER = PAID
       ↓
11. Ticket réservé
       ↓
12. Ticket attribué
       ↓
13. MikroTik synchronization
       ↓
14. Access ready
       ↓
15. ORDER = DELIVERED
```

---

# 91 — EXACTLY-ONCE EFFECT

Les systèmes distribués ne garantissent pas toujours qu'un événement externe n'arrive qu'une seule fois.

L'objectif doit donc être :

> **exactly-once business effect**

même si techniquement le message est reçu plusieurs fois.

Exemple :

```text
Webhook reçu 3 fois
```

Résultat :

```text
1 payment confirmation
1 ticket allocation
1 access delivery
```

---

# 92 — CONCURRENCY

Deux opérations peuvent se produire simultanément :

```text
Client A paie 300 FCFA
Client B paie 300 FCFA
```

Les deux workers cherchent un ticket.

La base doit garantir :

```text
Ticket A → Order A
Ticket B → Order B
```

et jamais :

```text
Ticket A → Order A
Ticket A → Order B
```

---

# 93 — ORDER FULFILLMENT

Il est utile de considérer la délivrance comme un processus distinct :

```text
ORDER
 ↓
PAYMENT
 ↓
FULFILLMENT
```

Le fulfillment peut contenir :

```text
ticket allocation
↓
ticket preparation
↓
MikroTik sync
↓
access activation
↓
delivery
```

Cela permettra d'isoler les problèmes techniques des problèmes financiers.

---

# 94 — FULFILLMENT IDEMPOTENCY

Pour une commande donnée :

```text
fulfillment(order_id)
```

doit être idempotent.

Si le worker reçoit :

```text
FULFILLMENT(order 123)
```

une deuxième fois :

```text
si déjà délivré
→ retourner résultat existant
```

et non :

```text
créer un deuxième accès
```

---

# 95 — WALLET / PAYMENT PROVIDER SEPARATION

Le backend doit distinguer :

```text
Customer
↓
Payment
↓
Aggregator / Provider
↓
Operator / Wallet
↓
Settlement
```

Une transaction de paiement n'est pas automatiquement équivalente à :

```text
argent disponible dans un wallet applicatif.
```

La partie settlement dépend des capacités et conditions du prestataire étudiées en Phase 2.

Le modèle doit donc rester suffisamment abstrait pour supporter :

```text
MTN
Moov
Celtiis
```

sans coder le métier directement autour d'un seul opérateur.

---

# 96 — PAYMENT METHOD MODEL

Une représentation logique peut être :

```text
operator
provider
payment_method
```

Exemple :

```text
operator = MTN
provider = Aggregator X
payment_method = Mobile Money
```

Cela permet d'éviter de confondre :

* opérateur Mobile Money ;
* agrégateur ;
* méthode de paiement ;
* compte de règlement.

---

# 97 — CONFIGURATION DES PROVIDERS

Les secrets de paiement ne doivent jamais être stockés dans :

```text
frontend
source code
GitHub
database en clair si évitable
logs
```

Ils doivent utiliser un mécanisme sécurisé de secrets/configuration.

---

# 98 — ENVIRONNEMENTS

Séparer :

```text
DEVELOPMENT
STAGING
PRODUCTION
```

Les transactions de test ne doivent jamais être mélangées aux transactions réelles.

---

# 99 — TEST DATA ISOLATION

Le système doit éviter qu'un ticket réel puisse être accidentellement attribué pendant un test.

Prévoir conceptuellement :

```text
TEST MODE
```

et :

```text
PRODUCTION MODE
```

séparés.

---

# 100 — BACKEND LAYERS

Architecture logique recommandée :

```text
┌─────────────────────────────┐
│          API LAYER          │
├─────────────────────────────┤
│      APPLICATION LAYER      │
├─────────────────────────────┤
│       DOMAIN / RULES        │
├─────────────────────────────┤
│    INFRASTRUCTURE LAYER     │
├─────────────────────────────┤
│ Database │ Payment │ MikroTik│
└─────────────────────────────┘
```

---

# 101 — API LAYER

Responsabilités :

* recevoir requêtes ;
* authentifier ;
* valider schémas ;
* appliquer rate limiting ;
* appeler les services métier ;
* formater les réponses.

Elle ne doit pas contenir toute la logique métier.

---

# 102 — APPLICATION LAYER

Orchestre les cas d'utilisation.

Exemples :

```text
CreateOrder
InitiatePayment
ProcessPaymentWebhook
AllocateTicket
DeliverAccess
RetryMikrotikSync
ReconcilePayment
```

---

# 103 — DOMAIN LAYER

Contient les règles métier critiques :

```text
CanOrderBePaid?
CanPaymentBecomeConfirmed?
CanTicketBeAllocated?
CanOrderBeDelivered?
CanTicketBeReleased?
CanPaymentBeRefunded?
```

Cette séparation réduit le risque de reproduire des règles contradictoires dans plusieurs endpoints.

---

# 104 — INFRASTRUCTURE LAYER

Contient les intégrations :

```text
Database
Payment provider
Aggregator
MikroTik
Email/SMS/WhatsApp éventuellement
Logging
Queue
Cache
```

Le domaine ne doit pas être entièrement dépendant d'un fournisseur particulier.

---

# 105 — JOBS / WORKERS

Les tâches longues ou résilientes doivent être exécutées par des workers lorsque nécessaire.

Exemples :

```text
ProcessPaymentEvent
AllocateTicket
SyncMikrotik
RetryPaymentReconciliation
ExpireOrders
DetectIncidents
```

---

# 106 — CRON / SCHEDULED TASKS

Certaines tâches doivent pouvoir être planifiées :

```text
expire pending orders
reconcile pending payments
retry failed sync
clean temporary sessions
generate operational reports
```

Les fréquences seront définies en Phase 10.

---

# 107 — RATE LIMITING

Les endpoints sensibles doivent être protégés.

Particulièrement :

```text
ticket login
payment initiation
payment status
webhook
admin login
```

Le but est notamment de réduire :

* brute force ticket ;
* spam transaction ;
* abus API ;
* surcharge.

---

# 108 — TICKET BRUTE FORCE

Un code de ticket étant un moyen d'accès, il faut prévoir :

```text
rate limiting
failed attempt tracking
temporary blocking
monitoring
```

Le comportement exact sera défini dans la Phase 9 — Security & Testing.

---

# 109 — ADMIN AUTHENTICATION

L'administration doit utiliser une authentification robuste.

Les sessions admin doivent être séparées des sessions clients.

Les opérations sensibles peuvent nécessiter une confirmation supplémentaire selon le niveau de risque.

---

# 110 — DATA PRIVACY

Le système doit appliquer le principe :

> **collecter uniquement ce qui est nécessaire.**

Les données clients doivent être protégées contre :

* accès non autorisé ;
* exposition accidentelle ;
* logs excessifs ;
* API trop permissive.

---

# 111 — API RESPONSE DESIGN

Le backend doit retourner des états métier explicites.

Exemple :

```json
{
  "orderStatus": "PAID",
  "accessStatus": "PENDING"
}
```

plutôt que :

```json
{
  "success": true
}
```

Le second est trop ambigu.

---

# 112 — ERROR MODEL

Les erreurs backend doivent être structurées.

Conceptuellement :

```text
code
message
status
request_id
retryable
```

Exemple :

```text
PAYMENT_CONFIRMATION_PENDING
```

avec :

```text
retryable = true
```

---

# 113 — CLIENT-FACING ERROR VS INTERNAL ERROR

Le backend peut connaître :

```text
MIKROTIK_CONNECTION_TIMEOUT
```

mais le client voit :

> Votre accès est en cours de préparation. Nous rencontrons momentanément un problème de connexion au service.

La technologie interne ne doit pas être inutilement exposée.

---

# 114 — ADMIN ERROR DETAIL

L'administration peut recevoir davantage d'informations :

```text
Incident:
MIKROTIK_CONNECTION_TIMEOUT

attempt_count: 4

last_attempt:
...

request_id:
...

action:
RETRY
```

Cette différence est essentielle.

---

# 115 — DATA FLOW : PURCHASE

```text
Frontend
   ↓
POST /orders
   ↓
Backend
   ↓
Validate plan
   ↓
Create order
   ↓
Return order reference
```

---

# 116 — DATA FLOW : PAYMENT

```text
Frontend
   ↓
POST payment initiation
   ↓
Backend
   ↓
Validate order
   ↓
Create payment
   ↓
Provider
   ↓
Payment pending
```

---

# 117 — DATA FLOW : WEBHOOK

```text
Provider
   ↓
Webhook
   ↓
Backend
   ↓
Verify signature
   ↓
Check event ID
   ↓
Validate amount/reference
   ↓
Update payment
   ↓
Update order
   ↓
Trigger fulfillment
```

---

# 118 — DATA FLOW : FULFILLMENT

```text
PAID
 ↓
Find compatible AVAILABLE ticket
 ↓
Atomic reservation
 ↓
Ticket assigned
 ↓
MikroTik sync
 ↓
Success
 ↓
Access ready
 ↓
DELIVERED
```

---

# 119 — DATA FLOW : FAILURE RECOVERY

```text
Failure
 ↓
Persist state
 ↓
Create incident
 ↓
Classify error
 ↓
Retry if temporary
 ↓
Reconcile if unknown
 ↓
Manual intervention if required
 ↓
Resolve
```

---

# 120 — END-TO-END SECURITY MODEL

Le système doit avoir plusieurs barrières :

```text
                 INTERNET
                    │
                    ▼
              HTTPS / TLS
                    │
                    ▼
              API Security
                    │
                    ▼
          Authentication / AuthZ
                    │
                    ▼
             Input Validation
                    │
                    ▼
            Business Rules
                    │
                    ▼
           Database Constraints
                    │
             ┌──────┴──────┐
             ▼             ▼
         Payment        MikroTik
         Security       Security
             │             │
             └──────┬──────┘
                    ▼
                Audit Log
```

---

# 121 — THREAT MODEL MINIMAL

Le système doit résister notamment à :

### Attaquant 1

Modifie le prix dans le navigateur.

→ Backend ignore le prix fourni.

### Attaquant 2

Envoie :

```text
payment_status=success
```

→ Aucun effet sans preuve valide.

### Attaquant 3

Rejoue un webhook.

→ Idempotence.

### Attaquant 4

Tente de récupérer le ticket d'un autre client.

→ Authorization.

### Attaquant 5

Réutilise un ticket.

→ État du ticket + validation MikroTik.

### Attaquant 6

Déclenche plusieurs paiements.

→ Idempotence + état commande + verrouillage.

### Attaquant 7

Essaie de deviner des tickets.

→ Rate limiting + surveillance.

---

# 122 — PAYMENT FRAUD RULE

La règle fondamentale du système est :

```text
Client declaration
        ≠
Payment proof
```

et :

```text
Payment provider event
        +
cryptographic / provider validation
        +
business validation
        =
Payment confirmation
```

---

# 123 — DATA CONSISTENCY RULE

Le système doit préférer :

```text
UNKNOWN / PENDING
```

à :

```text
FALSE
```

lorsque la réalité externe est inconnue.

Exemple :

```text
Provider timeout
```

ne signifie pas nécessairement :

```text
Payment failed
```

Il peut signifier :

```text
Payment status unknown
```

---

# 124 — STATE TRANSITION VALIDATION

Toutes les transitions doivent être contrôlées.

Par exemple :

```text
FAILED → PAID
```

ne doit pas être possible arbitrairement.

Une transition vers `PAID` doit respecter les conditions métier.

Même principe :

```text
AVAILABLE → USED
```

ne devrait pas être directement autorisé sans le parcours approprié.

---

# 125 — STATE MACHINE CENTRALIZATION

Les règles de transition doivent être centralisées autant que possible.

Éviter :

```text
Endpoint A → règle différente
Endpoint B → autre règle
Webhook → troisième règle
Admin → quatrième règle
```

Préférer :

```text
Order State Machine
Payment State Machine
Ticket State Machine
Sync State Machine
```

Chaque machine possède ses transitions autorisées.

---

# 126 — MASTER STATE MODEL

Le système peut être résumé ainsi :

```text
ORDER
CREATED
   ↓
PAYMENT_PENDING
   ↓
PAID
   ↓
TICKET_ALLOCATED
   ↓
DELIVERED

        ↘ FAILED
        ↘ EXPIRED
        ↘ CANCELLED
        ↘ REFUNDED
```

Avec sous-machines :

```text
PAYMENT
CREATED
 ↓
INITIATED
 ↓
PENDING
 ↓
CONFIRMED
 ↓
REFUNDED
```

```text
TICKET
AVAILABLE
 ↓
RESERVED
 ↓
SOLD
 ↓
USED
```

```text
MIKROTIK
PENDING
 ↓
PROCESSING
 ↓
SUCCESS
```

ou :

```text
FAILED
 ↓
RETRY
```

---

# 127 — FINAL DOMAIN MODEL

```text
                         ┌─────────────┐
                         │   CUSTOMER  │
                         └──────┬──────┘
                                │
                                │ 1:N
                                ▼
                         ┌─────────────┐
                         │    ORDER    │
                         └──────┬──────┘
                                │
                ┌───────────────┼────────────────┐
                │               │                │
                ▼               ▼                ▼
          ┌──────────┐    ┌──────────┐     ┌───────────┐
          │   PLAN   │    │ PAYMENT  │     │  TICKET   │
          └──────────┘    └─────┬────┘     └─────┬─────┘
                                │                │
                                ▼                ▼
                       ┌────────────────┐  ┌──────────────┐
                       │ PAYMENT_EVENTS │  │ MIKROTIK_SYNC│
                       └────────────────┘  └──────┬───────┘
                                                  │
                                                  ▼
                                          ┌───────────────┐
                                          │ACCESS_SESSIONS│
                                          └───────────────┘

ORDER / PAYMENT / TICKET
          │
          ▼
     ┌──────────┐
     │ INCIDENTS│
     └──────────┘

ALL CRITICAL ACTIONS
          │
          ▼
     ┌────────────┐
     │ AUDIT_LOGS │
     └────────────┘
```

---

# 128 — PHASE 5 QUALITY GATE

Avant de considérer le modèle backend terminé, nous devons pouvoir répondre « oui » à :

### Data

```text
[ ] Toutes les entités principales sont définies
[ ] Les relations sont définies
[ ] Les cardinalités sont définies
[ ] Les clés primaires sont prévues
[ ] Les clés étrangères sont prévues
[ ] Les contraintes UNIQUE sont identifiées
[ ] Les données sensibles sont identifiées
```

### Payments

```text
[ ] Payment ≠ Order
[ ] Payment ≠ Ticket
[ ] Payment Events sont persistés
[ ] Webhooks idempotents
[ ] Signature/authenticité vérifiée
[ ] Montant vérifié
[ ] Référence vérifiée
[ ] Réconciliation prévue
```

### Tickets

```text
[ ] Inventory défini
[ ] États définis
[ ] Allocation atomique prévue
[ ] Double allocation empêchée
[ ] Ticket lié à une commande
[ ] Ticket compatible avec un plan
```

### MikroTik

```text
[ ] Synchronisation séparée du paiement
[ ] Retry prévu
[ ] État de synchronisation persisté
[ ] Erreurs persistées
[ ] Panne MikroTik ≠ paiement échoué
```

### Sécurité

```text
[ ] Frontend non fiable
[ ] Backend autoritaire
[ ] Authorization
[ ] Rate limiting
[ ] Secrets protégés
[ ] Audit logs
[ ] Validation multi-couches
```

### Recovery

```text
[ ] Paiement confirmé mais accès retardé
[ ] Webhook en double
[ ] Webhook perdu
[ ] Provider indisponible
[ ] Ticket indisponible
[ ] MikroTik indisponible
[ ] Worker interrompu
[ ] Retry
[ ] Réconciliation
[ ] Intervention manuelle
```

---

# 129 — PRINCIPES NON NÉGOCIABLES DU BACKEND

Le système doit désormais être construit autour de ces règles :

> **1. Le frontend n'est jamais une autorité financière.**

> **2. Le paiement confirmé doit être persistant et traçable.**

> **3. Payment confirmation et access delivery sont deux étapes différentes.**

> **4. Une opération rejouée ne doit pas produire un deuxième effet métier.**

> **5. L'allocation d'un ticket doit être atomique.**

> **6. Une panne externe ne doit pas détruire un état interne déjà confirmé.**

> **7. Les états `PENDING` et `UNKNOWN` doivent être traités comme des états réels, pas comme des erreurs par défaut.**

> **8. La base de données doit protéger les invariants critiques.**

> **9. Toute opération sensible doit être traçable.**

> **10. Le système doit pouvoir récupérer son état après une panne.**

---

# 130 — CE QUE LA PHASE 5 NOUS DONNE

À la fin de cette phase, nous ne possédons pas encore le code.

Mais nous possédons désormais le **modèle logique du système** :

```text
CUSTOMER
   ↓
ORDER
   ↓
PAYMENT
   ↓
PAYMENT EVENTS
   ↓
CONFIRMATION
   ↓
FULFILLMENT
   ↓
TICKET
   ↓
MIKROTIK SYNC
   ↓
ACCESS SESSION
```

avec :

```text
INCIDENTS
AUDIT LOGS
RECONCILIATION
RETRY
IDEMPOTENCY
```

autour de cette chaîne.

C'est ce qui permet d'éviter de construire simplement « un site qui prend des paiements » et de construire à la place un **véritable système de distribution d'accès réseau piloté par transaction**.

---

# 131 — LIMITES VOLONTAIRES DE LA PHASE 5

Nous ne fixons pas encore définitivement :

* le framework backend ;
* le SGBD final ;
* la structure SQL exacte ;
* les endpoints définitifs ;
* la librairie ORM ;
* le système de queue exact ;
* le provider de paiement concret ;
* les méthodes API MikroTik ;
* les secrets ;
* le déploiement ;
* les politiques de monitoring détaillées.

Ces éléments seront définis lorsque leur phase respective les nécessitera.

Cela évite de mélanger **modèle métier** et **choix d'implémentation**.

---

# 132 — LIVRABLE DE PHASE 5

## **DATA & BACKEND SYSTEM SPECIFICATION**

Le présent document constitue la spécification de référence pour :

### Modèle métier

* Customers
* Plans
* Orders
* Payments
* Payment Events
* Tickets
* MikroTik Sync
* Access Sessions
* Incidents
* Audit Logs

### Machines à états

* Order
* Payment
* Ticket
* MikroTik Sync
* Access Session
* Incident

### Intégrité

* Foreign keys
* Unique constraints
* State transitions
* Atomic allocation
* Payment consistency
* Order consistency

### Fiabilité

* Idempotence
* Retry
* Reconciliation
* Recovery
* Event persistence
* Fulfillment separation

### Sécurité

* Backend authority
* Payment verification
* Authorization
* Rate limiting
* Sensitive-data protection
* Auditability

### Architecture backend

```text
API
 ↓
Application Services
 ↓
Domain Rules
 ↓
Infrastructure
 ↓
Database / Payment / MikroTik
```

---

# 133 — CHECKPOINT DE FIN DE PHASE 5

Nous avons maintenant suffisamment défini le **cerveau métier** pour passer à la couche réseau.

La question suivante devient :

> **Comment le backend va-t-il concrètement transformer un accès payé en utilisateur/ticket opérationnel sur le MikroTik RB951Ui-2HnD sous RouterOS 6.49.17, sans casser le Hotspot existant de Déo Gracias ?**

C'est précisément l'objectif de la prochaine phase.

---

# PHASE 6 — MIKROTIK INTEGRATION

La prochaine phase devra définir précisément :

```text
BACKEND
   ↓
Ticket / User
   ↓
MikroTik API / mécanisme d'intégration
   ↓
User Profile
   ↓
Hotspot
   ↓
Authentication
   ↓
Internet
```

Nous devrons notamment étudier :

* le mécanisme exact de communication avec le MikroTik ;
* les permissions nécessaires ;
* l'authentification backend → MikroTik ;
* la création/gestion des utilisateurs ;
* la compatibilité avec les profils actuels ;
* la stratégie ticket pré-généré vs création dynamique ;
* la synchronisation ;
* les timeouts ;
* les retries ;
* les erreurs RouterOS ;
* les risques de modification de la configuration existante ;
* le comportement lorsque le MikroTik est inaccessible ;
* les mécanismes de lecture/écriture minimaux ;
* la sécurité de l'interface d'administration MikroTik ;
* et surtout **comment intégrer le nouveau système sans détruire le fonctionnement actuel du Wi-Fi Déo Gracias**.

**PHASE 5 — DATA & BACKEND SYSTEM : terminée au niveau de la spécification.**

**Prochaine étape : PHASE 6 — MIKROTIK INTEGRATION.**
