# `10_SECURITY_RELIABILITY_TESTING.md`

````md
# 10 — SECURITY, RELIABILITY & TESTING

## Déo Gracias — Wi-Fi Access & Online Payment System

**Phase :** 9 — Security, Reliability & Testing  
**Statut :** Specification / Validation Framework  
**Projet :** Déo Gracias  
**Document précédent :**
- `07_MIKROTIK_INTEGRATION.md`
- `08_WEB_APPLICATION.md`
- `09_ADMIN_DASHBOARD.md`

**Document suivant :**
- Phase 10 — Deployment & Operations

---

# 1. OBJECTIF DU DOCUMENT

Cette phase définit le cadre de sécurité, de fiabilité et de tests du système Déo Gracias.

Elle intervient après la définition :

```text
07_MIKROTIK_INTEGRATION
        ↓
08_WEB_APPLICATION
        ↓
09_ADMIN_DASHBOARD
        ↓
10_SECURITY_RELIABILITY_TESTING
````

L'objectif n'est pas simplement de vérifier que les interfaces fonctionnent.

L'objectif est de déterminer si le système peut être considéré comme :

* fonctionnel ;
* sécurisé ;
* résilient ;
* cohérent ;
* observable ;
* récupérable ;
* testable ;
* suffisamment fiable pour une utilisation réelle.

---

# 2. POSITIONNEMENT DE LA PHASE

Cette phase ne doit pas introduire de nouvelles fonctionnalités métier majeures.

Elle doit vérifier les fonctionnalités déjà définies.

Principe :

```text
CONCEPTION
    ↓
IMPLÉMENTATION
    ↓
TEST
    ↓
DÉTECTION DES PROBLÈMES
    ↓
CORRECTION
    ↓
RETEST
    ↓
VALIDATION
```

La phase ne doit donc pas devenir une nouvelle phase de développement fonctionnel.

Toute fonctionnalité non prévue dans les phases précédentes doit être considérée comme :

```text
CHANGE REQUEST
```

et non ajoutée silencieusement au périmètre.

---

# 3. OBJECTIFS

La Phase 9 poursuit huit objectifs principaux.

## 3.1 Security

Protéger :

* les comptes administrateurs ;
* les commandes ;
* les paiements ;
* les tickets ;
* les données clients ;
* les secrets ;
* les communications ;
* le Connector ;
* le MikroTik.

---

## 3.2 Integrity

Garantir que :

* le prix payé correspond au plan réellement vendu ;
* le paiement confirmé correspond à la bonne commande ;
* un paiement ne peut pas être traité deux fois ;
* un ticket ne peut pas être vendu deux fois ;
* un ticket physique ne peut pas être attribué au canal digital ;
* les données du backend ne sont pas arbitrairement remplacées par celles du MikroTik.

---

## 3.3 Reliability

Le système doit continuer à fonctionner correctement lorsque :

* le paiement est retardé ;
* le webhook arrive plusieurs fois ;
* le webhook arrive dans le désordre ;
* le MikroTik est temporairement inaccessible ;
* le Connector est arrêté ;
* le réseau local tombe ;
* le client ferme son navigateur ;
* le ticket n'est momentanément pas disponible ;
* une requête est répétée ;
* une opération échoue partiellement.

---

## 3.4 Recoverability

Le système doit permettre de récupérer une situation anormale sans :

* perdre le paiement ;
* vendre deux fois le même ticket ;
* demander inutilement au client de repayer ;
* créer des incohérences entre backend et MikroTik.

---

## 3.5 Observability

Les événements importants doivent être observables.

Le système doit permettre de comprendre :

```text
WHAT
    ↓
WHEN
    ↓
WHERE
    ↓
WHO / WHICH SYSTEM
    ↓
WHY
    ↓
RESULT
```

---

## 3.6 Testability

Les composants critiques doivent pouvoir être testés indépendamment.

---

## 3.7 Operational Safety

Une erreur d'administration ne doit pas pouvoir facilement :

* supprimer massivement l'inventaire ;
* modifier arbitrairement les prix ;
* confirmer artificiellement un paiement ;
* exposer des secrets ;
* désynchroniser massivement le MikroTik.

---

## 3.8 Production Readiness

À la fin de cette phase, le système doit avoir un niveau de confiance suffisant pour passer à :

```text
Phase 10 — Deployment & Operations
```

---

# 4. PRINCIPES DIRECTEURS

## 4.1 Security by Design

La sécurité ne doit pas être ajoutée uniquement après le développement.

Elle doit être intégrée dans :

* l'architecture ;
* les API ;
* la base de données ;
* les permissions ;
* les workflows ;
* les logs ;
* les tests.

---

## 4.2 Deny by Default

Par défaut :

```text
NO ACCESS
NO TRUST
NO ACTION
```

tant que l'autorisation n'est pas explicitement démontrée.

Ce principe est particulièrement important pour l'administration et les API.

---

## 4.3 Backend Authority

Le frontend ne constitue jamais une autorité métier.

Le client ne doit jamais pouvoir décider lui-même :

* du prix ;
* du statut du paiement ;
* du ticket reçu ;
* de la durée ;
* du statut d'une commande ;
* de l'autorisation administrative.

---

## 4.4 Payment Provider Is Not the Application Authority

La réception d'une notification du prestataire ne doit pas automatiquement être considérée comme suffisante.

Le système doit vérifier :

* signature ;
* référence ;
* montant ;
* devise ;
* commande ;
* état actuel ;
* intégrité de l'événement.

---

## 4.5 MikroTik Is Network Authority

Le MikroTik reste l'autorité sur l'état réseau réel.

Le backend reste l'autorité sur :

* catalogue ;
* prix ;
* commandes ;
* paiements ;
* inventaire commercial ;
* attribution.

Le Connector constitue la frontière entre les deux.

---

# 5. MODÈLE DE CONFIANCE

L'architecture doit être considérée comme plusieurs zones de confiance.

```text
                    INTERNET
                       │
                       ▼
              ┌─────────────────┐
              │ Public Web App  │
              └────────┬────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Cloud Backend   │
              └──────┬─────┬────┘
                     │     │
             ┌───────┘     └────────┐
             ▼                      ▼
       Payment Provider       Database
                                   
                     │
                     ▼
              HTTPS outbound
                     │
                     ▼
              ┌──────────────┐
              │   Connector  │
              └──────┬───────┘
                     │
              Local API/API-SSL
                     │
                     ▼
              ┌──────────────┐
              │   MikroTik   │
              └──────────────┘
```

Le MikroTik ne doit pas être exposé directement à Internet pour permettre au backend cloud de le contrôler.

---

# 6. SECURITY BOUNDARIES

Les principales frontières de sécurité sont :

## Boundary A — Client → Web App

Menaces :

* manipulation des paramètres ;
* automatisation ;
* brute force ;
* injection ;
* falsification d'état ;
* abus d'API.

---

## Boundary B — Web App → Backend

Menaces :

* accès non autorisé ;
* IDOR ;
* manipulation des identifiants ;
* appels directs aux endpoints ;
* abus de ressources.

---

## Boundary C — Backend → Payment Provider

Menaces :

* mauvaise vérification des événements ;
* replay ;
* duplication ;
* montant incorrect ;
* mauvais mapping commande/paiement.

---

## Boundary D — Payment Provider → Webhook

Menaces :

* faux webhook ;
* replay ;
* payload modifié ;
* événement dupliqué ;
* événement hors séquence.

---

## Boundary E — Backend → Connector

Menaces :

* Connector usurpé ;
* token compromis ;
* commandes non autorisées ;
* replay ;
* communication non sécurisée.

---

## Boundary F — Connector → MikroTik

Menaces :

* credentials compromis ;
* compte trop privilégié ;
* accès depuis une mauvaise machine ;
* commandes non prévues ;
* modification accidentelle de configuration.

---

## Boundary G — Admin → Dashboard

Menaces :

* vol de session ;
* brute force ;
* privilege escalation ;
* accès à des données non autorisées ;
* opérations destructrices.

---

# 7. SECURITY THREAT MODEL

## 7.1 Acteurs

Le système doit considérer au minimum :

```text
CLIENT
ADMIN
CONNECTOR
PAYMENT PROVIDER
MIKROTIK
ATTACKER
```

---

# 7.2 Actifs critiques

Les actifs critiques sont :

### Très haute criticité

* secrets de paiement ;
* credentials MikroTik ;
* compte administrateur ;
* session administrateur ;
* données de paiement ;
* inventaire des tickets.

### Haute criticité

* commandes ;
* tickets ;
* événements de paiement ;
* configuration des plans ;
* audit logs.

### Moyenne criticité

* données client minimales ;
* statistiques ;
* données opérationnelles.

---

# 7.3 Principales menaces

Le système doit notamment être protégé contre :

* Broken Access Control ;
* Authentication Failures ;
* Injection ;
* Cryptographic Failures ;
* Security Misconfiguration ;
* Software/Data Integrity Failures ;
* Logging & Alerting Failures ;
* mauvaise gestion des exceptions ;
* brute force ;
* enumeration ;
* replay attacks ;
* double paiement logique ;
* double attribution de ticket ;
* manipulation de prix ;
* fuite de secrets ;
* Connector compromis.

Le référentiel OWASP fourni rappelle notamment que le contrôle d'accès doit être effectué côté serveur, avec principe de refus par défaut, vérification de propriété et rate limiting. 

Il souligne également l'importance du logging structuré, de l'audit trail et de l'absence de mots de passe/tokens dans les logs. 

---

# 8. AUTHENTICATION SECURITY

## 8.1 Administration

L'accès au dashboard doit être protégé par une authentification forte.

Minimum :

```text
Login
+
Password
+
Server-side session
```

Si disponible :

```text
MFA
```

---

## 8.2 Password

Les mots de passe administrateurs doivent être :

* suffisamment longs ;
* stockés sous forme de hash sécurisé ;
* jamais stockés en clair ;
* jamais écrits dans les logs.

---

## 8.3 Session

La session doit :

* utiliser un identifiant aléatoire ;
* être invalidée au logout ;
* expirer après une période d'inactivité ;
* avoir une durée maximale ;
* être protégée contre le vol ;
* être renouvelée après authentification.

---

## 8.4 Brute Force

Prévoir :

* rate limiting ;
* ralentissement progressif ;
* protection contre les tentatives répétées ;
* logs des échecs ;
* éventuellement verrouillage temporaire.

---

# 9. AUTHORIZATION

L'authentification répond à :

> Qui es-tu ?

L'autorisation répond à :

> Que peux-tu faire ?

Les deux doivent être séparées.

---

## 9.1 Server-Side Authorization

Une protection frontend comme :

```text
if (isAdmin) showAdmin()
```

n'est jamais suffisante.

Le backend doit vérifier lui-même :

```text
authenticated
+
authorized
+
allowed action
```

---

## 9.2 Resource Ownership

Chaque ressource sensible doit être protégée.

Exemple :

```text
GET /orders/:id
```

ne doit jamais simplement retourner :

```text
order.id === requestedId
```

Il faut vérifier que l'utilisateur possède réellement le droit d'accès à cette commande.

---

## 9.3 Admin Operations

Les opérations sensibles doivent être protégées séparément.

Exemples :

* modification d'un plan ;
* désactivation d'un plan ;
* annulation ;
* remboursement ;
* manipulation d'inventaire ;
* association de ticket ;
* synchronisation MikroTik.

---

# 10. PAYMENT SECURITY

La partie paiement constitue une zone critique.

---

# 10.1 Payment Lifecycle

Le système doit distinguer :

```text
ORDER CREATED
        ↓
PAYMENT INITIATED
        ↓
PAYMENT PENDING
        ↓
PAYMENT APPROVED
        ↓
TICKET ALLOCATED
        ↓
TICKET DELIVERED
```

Une transaction n'est donc pas considérée comme terminée uniquement parce que l'utilisateur a quitté l'écran de paiement.

---

# 10.2 Never Trust Client Payment State

Le frontend ne doit jamais pouvoir envoyer :

```json
{
  "status": "paid"
}
```

et provoquer une attribution de ticket.

Le statut doit être déterminé côté backend à partir d'une source de paiement vérifiée.

---

# 10.3 Amount Integrity

Le montant doit être calculé côté serveur.

Exemple :

```text
plan_id
    ↓
server retrieves plan
    ↓
server retrieves price
    ↓
payment initialized
```

Le client ne doit pas pouvoir imposer :

```text
price = 1000
```

pour acheter un plan de :

```text
5000 FCFA
```

---

# 10.4 Price Snapshot

Une commande doit conserver le prix utilisé au moment de l'achat.

Exemple :

```text
Plan actuel
    ↓
500 FCFA

Order
    ↓
price_snapshot = 500
```

Une modification future du plan ne doit pas modifier rétroactivement la commande.

---

# 11. WEBHOOK SECURITY

Les webhooks sont critiques.

---

## 11.1 Signature Verification

Chaque webhook supportant une signature doit être vérifié avant traitement.

```text
Incoming webhook
        ↓
Read raw payload
        ↓
Verify signature
        ↓
Validate structure
        ↓
Validate reference
        ↓
Validate amount
        ↓
Process event
```

---

## 11.2 Replay Protection

Un événement déjà traité ne doit pas pouvoir être exécuté une seconde fois.

Utiliser notamment :

```text
provider_event_id
```

avec contrainte d'unicité.

---

## 11.3 Idempotency

Si le même événement arrive :

```text
1st request → process
2nd request → duplicate
3rd request → duplicate
```

le résultat métier doit rester identique.

---

## 11.4 Out-of-Order Events

Le système doit gérer les événements reçus dans un ordre inattendu.

Exemple :

```text
APPROVED
↓
PENDING
```

ne doit pas faire revenir automatiquement une commande déjà confirmée vers :

```text
PENDING
```

Les transitions d'état doivent être contrôlées.

---

# 12. CRITICAL PAYMENT FAILURE

Le scénario suivant est critique :

```text
CLIENT
  ↓
PAYMENT
  ↓
MONEY DEBITED
  ↓
WEBHOOK RECEIVED
  ↓
ORDER = PAID
  ↓
TICKET ALLOCATION FAILS
```

Le système ne doit jamais demander immédiatement au client de repayer.

La commande doit rester traçable :

```text
PAID
+
TICKET ALLOCATION FAILED
```

puis :

```text
INCIDENT
+
RETRY
```

---

# 13. TICKET INVENTORY SECURITY

L'inventaire constitue une ressource financière.

Un ticket ne doit jamais pouvoir être attribué deux fois.

---

## 13.1 Atomic Allocation

L'allocation doit être atomique.

Conceptuellement :

```text
AVAILABLE
      ↓
RESERVED
      ↓
ASSIGNED
```

Deux requêtes concurrentes ne doivent pas pouvoir sélectionner le même ticket.

---

## 13.2 Concurrency Test

Tester explicitement :

```text
Request A → Ticket X
Request B → Ticket X
```

Résultat attendu :

```text
Request A → success
Request B → another ticket / controlled failure
```

Jamais :

```text
A → Ticket X
B → Ticket X
```

---

# 14. DIGITAL VS PHYSICAL INVENTORY

Le système doit conserver la séparation :

```text
DIGITAL
PHYSICAL
```

Un ticket appartenant à une série physique ne doit jamais être automatiquement proposé à un client digital.

---

## 14.1 Batch Integrity

Chaque batch doit conserver :

* identifiant ;
* plan ;
* quantité ;
* destination ;
* état ;
* origine ;
* timestamps.

---

## 14.2 Printed ≠ Sold

Le fait qu'un batch ait été imprimé ne signifie pas que tous ses tickets ont été vendus.

Le système doit distinguer :

```text
GENERATED
PRINTED
AVAILABLE
SOLD
USED
```

selon le modèle défini précédemment.

---

# 15. TICKET SECRET SECURITY

Les credentials des tickets doivent être traités comme des secrets d'accès.

Le système doit éviter de conserver inutilement des secrets en clair.

Lorsque le fonctionnement impose leur restitution au client, la stratégie de stockage doit être explicitement documentée.

Ne jamais :

* afficher les tickets dans des logs ;
* envoyer les tickets dans des analytics ;
* exposer l'inventaire complet dans une API publique ;
* retourner plus de données que nécessaire.

---

# 16. MIKROTIK SECURITY

## 16.1 No Public MikroTik API

Le MikroTik ne doit pas être directement exposé à Internet pour permettre les opérations applicatives.

Architecture préférée :

```text
Cloud
  ↓
HTTPS outbound
  ↓
Connector
  ↓
Local API/API-SSL
  ↓
MikroTik
```

---

# 16.2 Dedicated Technical User

Le Connector ne doit pas utiliser :

```text
admin
```

avec des privilèges complets.

Un compte technique dédié doit être créé avec le minimum de privilèges nécessaires.

---

# 16.3 Least Privilege

Le Connector doit disposer uniquement des permissions nécessaires à ses opérations.

Par exemple :

```text
READ
+
required ticket operations
```

et non :

```text
FULL ADMIN
```

---

# 16.4 API Security

Le Connector doit :

* authentifier le MikroTik ;
* vérifier le certificat lorsque API-SSL est utilisé ;
* limiter l'adresse source autorisée ;
* protéger ses secrets ;
* ne jamais exposer directement l'API MikroTik au navigateur.

---

# 17. CONNECTOR SECURITY

Le Connector représente une frontière particulièrement sensible.

---

## 17.1 Connector Authentication

Le backend doit pouvoir distinguer :

```text
known connector
unknown client
revoked connector
```

---

## 17.2 Credential Rotation

Prévoir la possibilité de renouveler :

* token ;
* secret ;
* credentials techniques.

---

## 17.3 Command Validation

Le Connector ne doit pas accepter une commande arbitraire provenant du réseau.

Préférer :

```text
KNOWN COMMAND
+
VALID PAYLOAD
+
AUTHORIZED RESOURCE
```

---

## 17.4 Replay Protection

Une commande sensible ne doit pas pouvoir être rejouée indéfiniment.

---

# 18. DATA SECURITY

## 18.1 Data Minimization

Ne conserver que les données nécessaires.

Particulièrement pour :

* téléphone ;
* identité client ;
* IP ;
* user-agent ;
* informations de paiement.

---

## 18.2 Sensitive Data

Ne jamais exposer inutilement :

* passwords ;
* API keys ;
* webhook secrets ;
* Connector tokens ;
* MikroTik credentials ;
* secrets de session.

---

## 18.3 Encryption

Les communications sensibles doivent utiliser HTTPS/TLS.

Les secrets persistants doivent être protégés selon les capacités de l'infrastructure retenue.

---

# 19. INPUT VALIDATION

Toutes les entrées externes doivent être considérées comme non fiables.

Sources :

```text
Browser
Webhook
Admin
Connector
MikroTik
Payment provider
```

Valider :

* type ;
* longueur ;
* format ;
* plage ;
* enum ;
* relation ;
* état métier.

---

# 20. INJECTION PROTECTION

Tester notamment :

* SQL injection ;
* XSS ;
* command injection ;
* header injection ;
* log injection.

Les requêtes vers la base doivent utiliser des mécanismes paramétrés.

Les entrées ne doivent jamais être concaténées directement dans des requêtes sensibles.

---

# 21. API SECURITY

Chaque endpoint doit être classé.

```text
PUBLIC
AUTHENTICATED
ADMIN
CONNECTOR
INTERNAL
WEBHOOK
```

Exemple :

| Endpoint type       |   Public | Auth | Admin | Connector |
| ------------------- | -------: | ---: | ----: | --------: |
| Plans               |        ✓ |      |       |           |
| Create Order        |        ✓ |      |       |           |
| Payment status      | contrôlé |      |       |           |
| Admin orders        |          |      |     ✓ |           |
| Inventory           |          |      |     ✓ |           |
| Connector heartbeat |          |      |       |         ✓ |
| MikroTik command    |          |      |       |         ✓ |
| Webhook             | provider |      |       |           |

---

# 22. RATE LIMITING

Prévoir des limites sur les endpoints susceptibles d'être abusés.

Priorités :

* login ;
* ticket validation ;
* order creation ;
* payment initiation ;
* status polling ;
* webhook ;
* admin authentication.

---

# 23. ENUMERATION PROTECTION

Éviter les réponses permettant de deviner facilement :

* tickets valides ;
* utilisateurs ;
* commandes ;
* identifiants internes ;
* comptes administrateurs.

Les messages publics doivent révéler uniquement l'information nécessaire.

---

# 24. ERROR HANDLING

Les erreurs doivent être contrôlées.

Ne jamais retourner au client :

```text
stack trace
database error
SQL query
secret
internal hostname
credentials
```

---

## 24.1 User Error

Exemple :

```text
Le paiement n'a pas pu être confirmé.
Veuillez réessayer.
```

---

## 24.2 Internal Error

Le backend doit enregistrer un contexte technique approprié dans les logs.

Le client reçoit uniquement une réponse sûre.

---

# 25. FAIL-SAFE BEHAVIOR

En cas de doute :

```text
DO NOT GRANT
DO NOT DUPLICATE
DO NOT DELETE
DO NOT CHARGE AGAIN
```

Exemples :

### Paiement incertain

```text
→ ne pas attribuer arbitrairement
→ vérifier
```

### Ticket incertain

```text
→ ne pas attribuer
→ conserver l'état
```

### Connector incertain

```text
→ ne pas exécuter une commande dangereuse
```

---

# 26. RELIABILITY MODEL

Les composants critiques doivent être considérés comme potentiellement indisponibles.

```text
Cloud Backend       → peut tomber
Database            → peut être temporairement indisponible
Payment Provider    → peut être lent
Connector           → peut être offline
MikroTik            → peut être offline
Internet local      → peut tomber
Client browser      → peut disparaître
```

Le système doit être conçu autour de cette réalité.

---

# 27. CONNECTOR OFFLINE

Lorsque le Connector est offline :

```text
Backend
    ↓
Connector unavailable
```

Le système doit :

* détecter l'absence ;
* afficher l'état ;
* ne pas considérer l'opération comme réussie ;
* conserver l'opération ;
* permettre un retry contrôlé.

---

# 28. RETRY STRATEGY

Les retries doivent être :

* limités ;
* traçables ;
* idempotents ;
* progressivement espacés.

Éviter les retries infinis.

Conceptuellement :

```text
Attempt 1
   ↓
failure
   ↓
wait
   ↓
Attempt 2
   ↓
failure
   ↓
wait
   ↓
Attempt 3
   ↓
Incident
```

---

# 29. INCIDENT MANAGEMENT

Les incidents doivent constituer une entité opérationnelle exploitable.

Exemples :

```text
PAYMENT_CONFIRMED_TICKET_ALLOCATION_FAILED
CONNECTOR_OFFLINE
MIKROTIK_SYNC_FAILED
WEBHOOK_PROCESSING_FAILED
INVENTORY_EXHAUSTED
DUPLICATE_PAYMENT_EVENT
```

---

## 29.1 Incident States

```text
OPEN
 ↓
INVESTIGATING
 ↓
RESOLVED
```

Possibilité :

```text
OPEN
 ↓
IGNORED / CLOSED
```

si le modèle métier le justifie.

---

## 29.2 Incident Severity

```text
LOW
MEDIUM
HIGH
CRITICAL
```

---

# 30. AUDIT LOGGING

Les opérations critiques doivent être auditables.

Exemples :

```text
ADMIN_LOGIN
ADMIN_LOGIN_FAILED
PLAN_UPDATED
PLAN_DISABLED
ORDER_CANCELLED
TICKET_ASSIGNED
TICKET_REVOKED
INVENTORY_IMPORTED
PAYMENT_CONFIRMED
REFUND_PROCESSED
CONNECTOR_REGISTERED
CONNECTOR_REVOKED
MIKROTIK_OPERATION
SECURITY_EVENT
```

---

# 31. LOGGING RULES

Les logs doivent être :

* structurés ;
* horodatés ;
* contextualisés ;
* recherchables ;
* suffisamment détaillés pour diagnostiquer ;
* exempts de secrets.

Le référentiel OWASP fourni recommande notamment des logs structurés, un audit trail des transactions importantes et l'absence de mots de passe, tokens ou données sensibles dans les logs. 

---

# 32. CORRELATION IDs

Les opérations critiques doivent pouvoir être suivies de bout en bout.

Exemple :

```text
request_id
order_id
payment_id
provider_event_id
ticket_id
sync_id
incident_id
```

Cela permet de reconstruire :

```text
CLIENT
 ↓
ORDER
 ↓
PAYMENT
 ↓
WEBHOOK
 ↓
TICKET
 ↓
CONNECTOR
 ↓
MIKROTIK
```

---

# 33. TESTING STRATEGY

Les tests doivent être organisés par niveaux.

```text
UNIT
 ↓
INTEGRATION
 ↓
CONTRACT
 ↓
END-TO-END
 ↓
SECURITY
 ↓
RESILIENCE
 ↓
USER ACCEPTANCE
```

---

# 34. UNIT TESTS

Tester isolément :

* calcul des prix ;
* durée ;
* transitions d'état ;
* validation ;
* allocation ;
* idempotency ;
* permissions ;
* parsing ;
* retry logic ;
* incident classification.

---

# 35. INTEGRATION TESTS

Tester :

```text
Backend
+
Database
```

puis :

```text
Backend
+
Payment Provider
```

puis :

```text
Backend
+
Connector
```

puis :

```text
Connector
+
MikroTik
```

---

# 36. PAYMENT TESTS

Scénarios minimum :

### P1 — Payment success

```text
Order
→ Payment
→ Approved
→ Ticket
→ Delivered
```

Expected :

```text
SUCCESS
```

---

### P2 — Payment declined

```text
Order
→ Payment
→ Declined
```

Expected :

```text
NO TICKET
```

---

### P3 — Payment pending

```text
Order
→ Pending
```

Expected :

```text
NO PREMATURE TICKET
```

---

### P4 — Duplicate webhook

```text
Webhook A
Webhook A
```

Expected :

```text
ONE BUSINESS EFFECT
```

---

### P5 — Webhook invalid signature

Expected :

```text
REJECTED
+
LOGGED
```

---

### P6 — Wrong amount

Expected :

```text
REJECTED / INCIDENT
```

---

### P7 — Payment approved but ticket allocation fails

Expected :

```text
ORDER = PAID
TICKET = NOT_YET_DELIVERED
INCIDENT = OPEN
RETRY = POSSIBLE
```

Never :

```text
PAY AGAIN
```

---

# 37. INVENTORY TESTS

Tester :

### I1

Ticket available.

Expected:

```text
ALLOCATED
```

### I2

Ticket already assigned.

Expected:

```text
NOT AVAILABLE
```

### I3

Two simultaneous allocation requests.

Expected:

```text
ONE SUCCESS
ONE CONTROLLED FAILURE
```

### I4

Digital order attempts physical ticket.

Expected:

```text
REJECTED
```

### I5

Inventory empty.

Expected:

```text
NO FALSE PAYMENT SUCCESS
```

---

# 38. MIKROTIK TESTS

Tester :

### M1 — Connector online

Expected:

```text
HEALTHY
```

### M2 — Connector offline

Expected:

```text
OFFLINE
```

### M3 — MikroTik unreachable

Expected:

```text
SYNC FAILED
+
RETRY
+
INCIDENT
```

### M4 — Read operation

Expected:

```text
SUCCESS
```

### M5 — Invalid command

Expected:

```text
REJECTED
```

### M6 — Unauthorized Connector

Expected:

```text
REJECTED
```

---

# 39. ADMIN TESTS

Tester :

### A1

Unauthenticated user accesses dashboard.

Expected:

```text
DENIED
```

### A2

Authenticated non-authorized user accesses protected resource.

Expected:

```text
DENIED
```

### A3

Admin changes plan.

Expected:

```text
AUTHORIZED
+
AUDIT LOG
```

### A4

Admin attempts manual payment confirmation.

Expected:

```text
NOT ALLOWED
```

unless an explicitly designed and audited operational procedure exists.

---

# 40. SECURITY TESTING

La sécurité doit être testée activement.

---

## 40.1 Authentication

Tester :

* mauvais mot de passe ;
* brute force ;
* session expiration ;
* logout ;
* session reuse ;
* concurrent sessions selon politique ;
* password reset si implémenté.

---

## 40.2 Authorization

Tester :

* accès direct `/admin` ;
* accès API sans rôle ;
* changement d'ID ;
* accès à une autre commande ;
* modification sans permission ;
* endpoint caché mais accessible directement.

---

## 40.3 Injection

Tester :

* SQL injection ;
* XSS ;
* malformed JSON ;
* oversized payload ;
* unexpected types ;
* special characters.

---

## 40.4 API Abuse

Tester :

* requêtes répétées ;
* requêtes parallèles ;
* pagination abusive ;
* payload énorme ;
* polling excessif.

---

# 41. OWASP SECURITY BASELINE

La phase de sécurité doit utiliser un référentiel moderne plutôt qu'une simple liste historique.

Le document OWASP fourni indique notamment les catégories 2025 :

```text
A01 Broken Access Control
A02 Security Misconfiguration
A03 Software Supply Chain Failures
A04 Cryptographic Failures
A05 Injection
A06 Insecure Design
A07 Authentication Failures
A08 Software & Data Integrity Failures
A09 Security Logging & Alerting Failures
A10 Mishandling of Exceptional Conditions
```



Ces catégories doivent servir de grille de contrôle, sans transformer le projet en audit de conformité formel.

---

# 42. DEPENDENCY SECURITY

Toutes les dépendances doivent être vérifiées.

Contrôler :

* versions ;
* vulnérabilités connues ;
* packages inutilisés ;
* packages abandonnés ;
* dépendances transitives ;
* scripts d'installation suspects.

Une stratégie de supply-chain security doit être appliquée aux dépendances et au pipeline.

---

# 43. SECRET MANAGEMENT

Les secrets ne doivent jamais être :

```text
hardcoded
committed
logged
exposed to frontend
```

Exemples :

* payment API keys ;
* webhook secrets ;
* database credentials ;
* Connector secrets ;
* MikroTik credentials ;
* admin secrets.

Le repository GitHub doit être considéré comme public ou potentiellement exposable.

---

# 44. ENVIRONMENT SEPARATION

Séparer :

```text
DEVELOPMENT
STAGING / TEST
PRODUCTION
```

Les credentials de production ne doivent pas être utilisés dans le développement.

---

# 45. DATABASE RELIABILITY

Tester :

* contraintes uniques ;
* foreign keys ;
* transactions ;
* rollback ;
* concurrent updates ;
* suppression ;
* états impossibles.

Les invariants critiques doivent être garantis autant que possible par la base et non uniquement par le frontend.

---

# 46. CRITICAL INVARIANTS

Les invariants suivants doivent toujours rester vrais.

### Invariant 1

```text
A payment cannot create two tickets.
```

### Invariant 2

```text
A ticket cannot belong to two successful orders.
```

### Invariant 3

```text
A physical ticket cannot be allocated to a digital order.
```

### Invariant 4

```text
A client cannot determine the price server-side.
```

### Invariant 5

```text
An unverified webhook cannot confirm payment.
```

### Invariant 6

```text
The browser cannot execute MikroTik commands.
```

### Invariant 7

```text
An unauthenticated client cannot access admin resources.
```

### Invariant 8

```text
A failed synchronization must remain observable.
```

---

# 47. FAILURE MATRIX

| Failure                          | Expected behavior                   |
| -------------------------------- | ----------------------------------- |
| Payment pending                  | Keep order pending                  |
| Payment rejected                 | No ticket                           |
| Duplicate webhook                | Ignore duplicate business effect    |
| Invalid webhook                  | Reject                              |
| Wrong amount                     | Reject / incident                   |
| Ticket unavailable               | Controlled failure                  |
| Allocation failure after payment | Keep payment + incident             |
| Connector offline                | Retry / incident                    |
| MikroTik offline                 | Retry / incident                    |
| Database temporary failure       | No false success                    |
| Client closes browser            | Backend state remains authoritative |
| Admin unauthorized               | Deny                                |
| Invalid API payload              | Reject                              |
| Duplicate request                | Idempotent where required           |

---

# 48. CHAOS / RESILIENCE TESTING

Sans mettre immédiatement en place une infrastructure complexe de chaos engineering, quelques scénarios contrôlés doivent être exécutés.

Tester volontairement :

```text
Connector OFF
MikroTik OFF
Payment webhook delayed
Payment webhook duplicated
Database transaction failure
Network interruption
Client disconnect
```

L'objectif est de vérifier que le système échoue proprement.

---

# 49. RECOVERY TESTING

Pour chaque incident critique :

```text
FAILURE
 ↓
DETECTION
 ↓
RECORD
 ↓
RECOVERY
 ↓
RETRY
 ↓
VALIDATION
```

Exemple :

```text
Payment approved
        ↓
Connector unavailable
        ↓
Incident created
        ↓
Connector returns
        ↓
Retry
        ↓
Ticket synchronized
        ↓
Order completed
```

---

# 50. BACKUP & RESTORE TEST

Avant la production :

1. créer une sauvegarde ;
2. vérifier qu'elle existe ;
3. tester sa restauration dans un environnement contrôlé ;
4. vérifier l'intégrité des données ;
5. documenter la procédure.

Une sauvegarde jamais restaurée/testée ne doit pas être considérée comme pleinement fiable.

---

# 51. ADMIN DASHBOARD QUALITY TESTING

Le dashboard doit également être testé sur :

### Functional

* navigation ;
* recherche ;
* filtres ;
* pagination ;
* détails ;
* actions ;
* incidents ;
* inventaire.

### UX

* clarté ;
* feedback ;
* erreurs ;
* loading ;
* empty states.

### Responsive

* desktop ;
* laptop ;
* tablette ;
* mobile lorsque nécessaire.

Le système UX de référence impose notamment de tester navigation, actions principales, erreurs, mobile, clavier, reduced motion et contenus absents ou longs. 

---

# 52. WEB APPLICATION QUALITY TESTING

La partie publique doit être testée sur :

```text
First load
Catalog
Plan selection
Order
Payment
Payment status
Ticket delivery
Ticket display
Error states
Network failure
Mobile
Accessibility
```

---

# 53. UX ERROR TESTING

Chaque erreur importante doit répondre à :

```text
What happened?
Why?
What can I do now?
```

Une interface sophistiquée ne doit jamais masquer l'état réel du système.

Le système UX de référence considère notamment que visibilité, contrôle, cohérence, prévention et récupération font partie de la qualité de l'expérience. 

---

# 54. ACCESSIBILITY TESTING

Minimum :

* navigation clavier ;
* focus visible ;
* labels ;
* contraste ;
* structure sémantique ;
* messages d'erreur ;
* alternatives textuelles ;
* reduced motion.

---

# 55. MOTION & EXPERIENCE SAFETY

Les expériences visuelles ne doivent pas compromettre la compréhension du système.

Tester :

```text
Normal motion
Reduced motion
Low-power device
Slow device
Slow network
```

Les systèmes 3D et motion doivent également gérer proprement :

```text
INIT
MOUNT
ACTIVE
UPDATE
PAUSE
UNMOUNT
CLEANUP
```

afin d'éviter listeners persistants, boucles d'animation et ressources inutilisées. 

---

# 56. PERFORMANCE TESTING

Tester notamment :

* temps de chargement ;
* taille des assets ;
* JavaScript ;
* images ;
* API response time ;
* database queries ;
* dashboard avec données nombreuses ;
* mobile ;
* réseau lent.

La performance ne doit pas être obtenue au détriment de la fiabilité.

---

# 57. LOAD TESTING

Le système doit être testé progressivement.

Scénarios :

```text
1 user
10 users
50 users
100 users
```

selon les capacités réelles de l'infrastructure.

Mesurer :

* latency ;
* errors ;
* throughput ;
* database load ;
* payment request rate ;
* ticket allocation contention.

Les valeurs définitives seront définies selon l'infrastructure réellement choisie.

---

# 58. TEST ENVIRONMENT

Prévoir :

```text
LOCAL
    ↓
TEST
    ↓
STAGING
    ↓
PRODUCTION
```

Les tests destructifs ne doivent jamais être effectués directement sur les données réelles.

---

# 59. TEST DATA

Les données de test doivent être artificielles.

Ne pas utiliser inutilement :

* vrais paiements ;
* vrais clients ;
* vrais credentials ;
* vrais tickets en circulation ;
* vrais secrets.

---

# 60. TEST CASE FORMAT

Chaque test critique doit avoir :

```text
ID
Name
Preconditions
Input
Steps
Expected result
Actual result
Status
Evidence
```

Exemple :

```text
ID:
PAY-004

Name:
Duplicate payment webhook

Precondition:
Order exists

Input:
Same provider event twice

Expected:
One payment confirmation
One ticket allocation
No duplicate ticket
```

---

# 61. ACCEPTANCE CRITERIA

La phase ne sera pas considérée comme terminée si :

```text
[ ] Authentication tested
[ ] Authorization tested
[ ] Rate limiting tested
[ ] Input validation tested
[ ] Payment lifecycle tested
[ ] Webhook signature tested
[ ] Webhook idempotency tested
[ ] Replay protection tested
[ ] Duplicate payment tested
[ ] Ticket allocation concurrency tested
[ ] Digital/physical separation tested
[ ] Connector authentication tested
[ ] Connector offline tested
[ ] MikroTik unavailable tested
[ ] Retry behavior tested
[ ] Incident creation tested
[ ] Audit logging tested
[ ] Secrets checked
[ ] Dependencies checked
[ ] Database constraints tested
[ ] Backup tested
[ ] Restore tested
[ ] Accessibility tested
[ ] Responsive behavior tested
[ ] Error states tested
[ ] Performance baseline measured
[ ] Critical E2E journey tested
```

---

# 62. CRITICAL END-TO-END TEST

Le test principal du système est :

```text
CLIENT
 ↓
CONNECT WI-FI
 ↓
CAPTIVE PORTAL
 ↓
SELECT PLAN
 ↓
CREATE ORDER
 ↓
PAY
 ↓
PAYMENT CONFIRMED
 ↓
WEBHOOK VERIFIED
 ↓
ORDER PAID
 ↓
TICKET RESERVED
 ↓
TICKET ASSIGNED
 ↓
TICKET DELIVERED
 ↓
CLIENT USES TICKET
 ↓
MIKROTIK AUTHENTICATES
```

Ce scénario doit être validé de bout en bout.

---

# 63. CRITICAL FAILURE E2E TEST

Deuxième scénario critique :

```text
CLIENT
 ↓
PAYMENT
 ↓
PAYMENT CONFIRMED
 ↓
TICKET ALLOCATION FAILURE
 ↓
INCIDENT
 ↓
RECOVERY
 ↓
TICKET ALLOCATED
 ↓
DELIVERY
```

Expected :

```text
NO DOUBLE PAYMENT
NO DOUBLE TICKET
NO DATA LOSS
FULL TRACEABILITY
```

---

# 64. SECURITY INCIDENT SCENARIOS

Tester au minimum :

### S1

Tentative d'accès à `/admin` sans authentification.

### S2

Tentative de modification d'un order appartenant à un autre utilisateur.

### S3

Faux webhook.

### S4

Webhook rejoué.

### S5

Manipulation du prix dans le frontend.

### S6

Tentative de réservation concurrente du même ticket.

### S7

Tentative d'utilisation du Connector sans authentification.

### S8

Tentative d'exécution d'une commande MikroTik non autorisée.

### S9

Tentative de brute force admin.

### S10

Tentative d'injection.

---

# 65. SECURITY SEVERITY

Les problèmes détectés doivent être classés.

```text
CRITICAL
HIGH
MEDIUM
LOW
INFO
```

---

## CRITICAL

Exemple :

```text
Attacker can confirm a payment without paying.
```

ou :

```text
Attacker can obtain admin access.
```

→ aucune mise en production.

---

## HIGH

Exemple :

```text
Ticket duplication possible
```

→ correction avant production.

---

## MEDIUM

Impact limité mais réel.

→ correction avant ou très rapidement après production selon contexte.

---

## LOW

Amélioration non critique.

---

# 66. DEFINITION OF DONE

La Phase 9 est terminée lorsque :

```text
ARCHITECTURE
      ↓
SECURITY REVIEW
      ↓
FUNCTIONAL TESTS
      ↓
INTEGRATION TESTS
      ↓
E2E TESTS
      ↓
SECURITY TESTS
      ↓
RESILIENCE TESTS
      ↓
RECOVERY TESTS
      ↓
AUDIT
      ↓
GO / NO-GO
```

---

# 67. GO / NO-GO

Une décision formelle doit être prise.

## GO

Possible uniquement si :

* aucun problème Critical ouvert ;
* aucun problème High critique ouvert ;
* paiements fiables ;
* inventaire fiable ;
* sécurité administrative acceptable ;
* Connector contrôlé ;
* récupération testée ;
* logs opérationnels ;
* sauvegardes vérifiées.

---

## NO-GO

La production est bloquée si :

* paiement falsifiable ;
* ticket duplicable ;
* admin accessible sans autorisation ;
* Connector exploitable ;
* secrets exposés ;
* webhook non vérifié ;
* données critiques perdues ;
* recovery impossible.

---

# 68. SECURITY & RELIABILITY CHECKLIST

## Architecture

[ ] Trust boundaries définies
[ ] Backend authority définie
[ ] MikroTik isolation définie
[ ] Connector boundary définie

## Authentication

[ ] Admin auth
[ ] Password hashing
[ ] Session security
[ ] Rate limiting
[ ] Logout
[ ] Timeout

## Authorization

[ ] Server-side authorization
[ ] Role checks
[ ] Resource ownership
[ ] Admin protection

## Payment

[ ] Server-side price
[ ] Payment state machine
[ ] Webhook verification
[ ] Signature verification
[ ] Idempotency
[ ] Replay protection
[ ] Amount verification

## Tickets

[ ] Atomic allocation
[ ] Concurrency protection
[ ] Digital/physical separation
[ ] Secret handling
[ ] Inventory consistency

## MikroTik

[ ] No public API
[ ] Dedicated technical user
[ ] Least privilege
[ ] API-SSL where appropriate
[ ] Connector authentication
[ ] Command validation

## Reliability

[ ] Retry strategy
[ ] Offline detection
[ ] Incident system
[ ] Recovery procedures
[ ] Backup
[ ] Restore test

## Observability

[ ] Structured logs
[ ] Audit logs
[ ] Correlation IDs
[ ] Security events
[ ] Critical alerts

## Testing

[ ] Unit
[ ] Integration
[ ] Contract
[ ] E2E
[ ] Security
[ ] Resilience
[ ] Recovery
[ ] Accessibility
[ ] Performance

---

# 69. REQUIRED DELIVERABLES

À la fin de la phase, les livrables doivent être :

```text
10_SECURITY_RELIABILITY_TESTING.md
```

ainsi que, selon l'organisation du repository :

```text
/docs/testing/
    TEST_PLAN.md
    TEST_CASES.md
    SECURITY_TEST_REPORT.md
    RELIABILITY_TEST_REPORT.md
    E2E_TEST_REPORT.md
```

et éventuellement :

```text
/docs/incidents/
    INCIDENT_RESPONSE.md
```

---

# 70. IMPLEMENTATION RULES FOR THE DEVELOPMENT AGENT

L'IA chargée de l'implémentation doit respecter les règles suivantes.

## Rule 1

Ne jamais désactiver une sécurité simplement pour faire passer un test.

---

## Rule 2

Ne jamais modifier MikroTik en production sans sauvegarde et procédure contrôlée.

---

## Rule 3

Ne jamais utiliser le compte administrateur MikroTik comme compte applicatif.

---

## Rule 4

Ne jamais considérer le frontend comme une autorité.

---

## Rule 5

Ne jamais considérer un paiement comme confirmé uniquement sur la base d'un retour navigateur.

---

## Rule 6

Ne jamais créer un second ticket parce qu'une première tentative d'allocation semble avoir échoué sans vérifier l'état réel.

---

## Rule 7

Ne jamais supprimer une trace d'incident pour masquer une erreur.

---

## Rule 8

Ne jamais logger les secrets.

---

## Rule 9

Toute modification d'une logique critique doit être accompagnée de tests.

---

## Rule 10

Toute correction d'un bug de sécurité doit ajouter un test de régression.

---

# 71. REGRESSION TESTING

Après chaque correction importante :

```text
BUG
 ↓
FIX
 ↓
REGRESSION TEST
 ↓
FULL CRITICAL TEST
```

Les tests critiques doivent rester exécutables après les évolutions futures.

---

# 72. PHASE GATE

La phase suivante ne doit commencer qu'après validation de :

```text
Security
      ✓
Reliability
      ✓
Testing
      ✓
Recovery
      ✓
Observability
      ✓
Production readiness
      ✓
```

---

# 73. FINAL ARCHITECTURAL PRINCIPLE

Le système Déo Gracias ne doit jamais être considéré comme fiable uniquement parce que :

> « le parcours normal fonctionne ».

La vraie fiabilité est démontrée lorsque :

```text
NORMAL CASE
        +
ERROR CASE
        +
DUPLICATE CASE
        +
TIMEOUT CASE
        +
OFFLINE CASE
        +
ATTACK CASE
        +
RECOVERY CASE
```

produisent tous un comportement contrôlé.

---

# 74. FINAL QUALITY MODEL

Le système final doit être évalué selon :

```text
SECURITY
    +
INTEGRITY
    +
RELIABILITY
    +
OBSERVABILITY
    +
RECOVERABILITY
    +
TESTABILITY
    +
UX QUALITY
```

Une fonctionnalité qui fonctionne mais peut perdre un paiement n'est pas terminée.

Une fonctionnalité sécurisée mais impossible à récupérer après une panne n'est pas terminée.

Une fonctionnalité fonctionnelle mais non observable n'est pas suffisamment opérationnelle.

---

# 75. PHASE 9 CLOSURE

La Phase 9 est considérée comme validée uniquement lorsque le système démontre que :

1. les utilisateurs autorisés peuvent effectuer les parcours prévus ;
2. les utilisateurs non autorisés sont bloqués ;
3. les paiements sont vérifiés et idempotents ;
4. les tickets ne peuvent pas être attribués deux fois ;
5. l'inventaire digital et physique reste cohérent ;
6. le Connector ne constitue pas une porte d'entrée publique vers le MikroTik ;
7. les erreurs critiques sont détectées ;
8. les incidents peuvent être suivis ;
9. les opérations critiques sont auditables ;
10. les scénarios de panne peuvent être récupérés ;
11. les tests critiques sont reproductibles ;
12. aucun problème de sécurité critique ou bloquant ne reste ouvert.

---

# 76. NEXT PHASE

Après validation complète :

# PHASE 10 — DEPLOYMENT & OPERATIONS

Cette phase traitera :

* environnement de production ;
* déploiement frontend ;
* déploiement backend ;
* base de données ;
* Connector ;
* installation locale ;
* configuration MikroTik finale ;
* secrets de production ;
* monitoring ;
* sauvegardes opérationnelles ;
* maintenance ;
* procédures de rollback ;
* mise en production progressive ;
* documentation opérationnelle.

La Phase 10 ne doit commencer qu'après le GO formel de la Phase 9.

````

### Pourquoi cette Phase 9 est structurée ainsi

Il y a un point important : **la sécurité ici n'est pas séparée artificiellement du métier**.

Le risque principal du projet n'est pas seulement quelqu'un qui réussit à faire une injection SQL. Le risque critique est une rupture de la chaîne :

```text
ARGENT
  ↓
COMMANDE
  ↓
PAIEMENT
  ↓
TICKET
  ↓
INVENTAIRE
  ↓
MIKROTIK
  ↓
ACCÈS INTERNET
````

C'est pourquoi les tests de **double webhook, double allocation, paiement confirmé mais ticket indisponible, Connector offline, MikroTik inaccessible et récupération d'incident** sont centraux.

Cela correspond aussi aux principes déjà établis dans les documents précédents : le système doit prévoir les états d'erreur, les mécanismes de récupération et le feedback plutôt que considérer uniquement le « happy path ». 

Et pour le Connector/MikroTik, je conserve volontairement le principe défini précédemment : **le cloud ne devient pas directement un client Internet du routeur** ; le Connector constitue la frontière contrôlée entre l'application et l'infrastructure locale.

Enfin, cette phase reste cohérente avec le principe de qualité globale des référentiels UX : une expérience réussie n'est pas seulement « fonctionnelle », mais doit également être cohérente, accessible, responsive et capable de gérer les états réels du système. 

**Document proposé : `10_SECURITY_RELIABILITY_TESTING.md`**
**Statut : prêt pour validation de la Phase 9.**
