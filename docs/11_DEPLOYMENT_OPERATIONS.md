# `11_DEPLOYMENT_OPERATIONS.md`

````md
# 11 — DEPLOYMENT & OPERATIONS

## Déo Gracias — Wi-Fi Access & Online Payment System

**Phase :** 10 — Deployment & Operations  
**Statut :** Specification / Production Deployment Blueprint  
**Projet :** Déo Gracias  
**Document précédent :**
- `07_MIKROTIK_INTEGRATION.md`
- `08_WEB_APPLICATION.md`
- `09_ADMIN_DASHBOARD.md`
- `10_SECURITY_RELIABILITY_TESTING.md`

**Document suivant :**
- Exploitation continue / Maintenance / Evolution

---

# 00 — PURPOSE

Cette phase transforme l'architecture validée en système :

- déployable ;
- configurable ;
- sécurisé ;
- observable ;
- maintenable ;
- récupérable ;
- exploitable en conditions réelles.

La Phase 10 ne redéfinit pas le produit.

Elle met en production les briques déjà validées :

```text
07 — MikroTik Integration
        ↓
08 — Web Application
        ↓
09 — Admin Dashboard
        ↓
10 — Security, Reliability & Testing
        ↓
11 — Deployment & Operations
````

Son objectif principal est de répondre à la question :

> **Comment installer, configurer, déployer, surveiller, maintenir et récupérer le système Déo Gracias en conditions réelles ?**

---

# 01 — OBJECTIFS DE LA PHASE

La Phase 10 couvre :

1. la préparation des environnements ;
2. la gestion des variables de configuration ;
3. la gestion des secrets ;
4. le déploiement frontend ;
5. le déploiement backend ;
6. la base de données ;
7. le déploiement du Connector ;
8. la configuration finale du MikroTik ;
9. la configuration du paiement ;
10. les migrations ;
11. le monitoring ;
12. les logs opérationnels ;
13. les sauvegardes ;
14. le restore ;
15. le rollback ;
16. la maintenance ;
17. la gestion des incidents en production ;
18. la mise en production progressive ;
19. la validation finale ;
20. la documentation opérationnelle.

---

# 02 — PRINCIPES DIRECTEURS

## 02.1 — Production ≠ Development

Les environnements doivent être séparés.

```text
DEVELOPMENT
    ↓
TEST / STAGING
    ↓
PRODUCTION
```

Aucun secret de production ne doit être utilisé inutilement dans le développement.

---

## 02.2 — Infrastructure as Documentation

Toute configuration critique doit être documentée.

Le système ne doit pas dépendre uniquement de la mémoire du développeur.

---

## 02.3 — Reproducibility

Un nouveau développeur ou administrateur doit pouvoir comprendre :

* où se trouve le frontend ;
* où se trouve le backend ;
* où se trouve la base ;
* où se trouve le Connector ;
* comment le Connector communique avec MikroTik ;
* quelles variables sont nécessaires ;
* comment déployer ;
* comment restaurer ;
* comment revenir à la version précédente.

---

## 02.4 — Secrets Are Configuration, Not Code

Les secrets ne doivent jamais être écrits directement dans le repository.

Ils doivent être injectés par l'environnement.

---

## 02.5 — Deployment Must Be Reversible

Chaque déploiement de production doit permettre de répondre à :

> Que faisons-nous si cette version casse quelque chose ?

La réponse doit être documentée avant la mise en production.

---

## 02.6 — Observe Before You Optimize

Avant d'optimiser le système, mesurer :

* disponibilité ;
* latence ;
* erreurs ;
* consommation ;
* synchronisation ;
* paiements ;
* inventaire ;
* ressources du Connector ;
* état MikroTik.

---

# 03 — TARGET PRODUCTION ARCHITECTURE

L'architecture de production cible est :

```text
                         INTERNET
                            │
              ┌─────────────┴─────────────┐
              │                           │
              ▼                           ▼
       PUBLIC WEB APP               PAYMENT PROVIDER
              │                           │
              │ HTTPS                     │ WEBHOOK
              ▼                           ▼
       ┌──────────────────────────────────────┐
       │             BACKEND API              │
       │                                      │
       │ Orders / Payments / Tickets / Admin │
       │ Incidents / Audit / Connector       │
       └──────────────────┬───────────────────┘
                          │
                          ▼
                    ┌───────────┐
                    │ DATABASE  │
                    └───────────┘
                          │
                          │ HTTPS outbound
                          ▼
                    ┌───────────┐
                    │ CONNECTOR │
                    │   LOCAL   │
                    └─────┬─────┘
                          │
                    Local network
                          │
                          ▼
                    ┌───────────┐
                    │ MIKROTIK  │
                    └─────┬─────┘
                          │
                          ▼
                    WIFI HOTSPOT
```

---

# 04 — PRODUCTION COMPONENTS

Le système de production comprend au minimum :

```text
1. Frontend public
2. Backend API
3. Database
4. Payment provider
5. Admin dashboard
6. Connector local
7. MikroTik
8. Monitoring / logs
9. Backup system
10. Git repository / CI
```

---

# 05 — RESPONSIBILITY MATRIX

| Composant        | Responsabilité            |
| ---------------- | ------------------------- |
| Frontend         | Expérience utilisateur    |
| Backend          | Autorité métier           |
| Database         | Persistance               |
| Payment Provider | Traitement paiement       |
| Connector        | Pont cloud ↔ réseau local |
| MikroTik         | Autorité réseau           |
| Admin Dashboard  | Administration            |
| Monitoring       | Observation               |
| Backup           | Récupération              |
| Git / CI         | Livraison contrôlée       |

---

# 06 — ENVIRONMENT STRATEGY

## 06.1 — Development

Objectif :

* développement local ;
* tests unitaires ;
* tests d'intégration ;
* expérimentation.

Caractéristiques :

```text
REAL PAYMENT = NO
REAL PRODUCTION DATA = NO
REAL PRODUCTION SECRETS = NO
```

---

## 06.2 — Staging / Test

Objectif :

* validation préproduction ;
* tests E2E ;
* tests paiement ;
* tests Connector ;
* tests de migration ;
* smoke tests.

Lorsque le provider le permet, utiliser un environnement ou des mécanismes de test dédiés.

---

## 06.3 — Production

Objectif :

```text
REAL USERS
REAL PAYMENTS
REAL INVENTORY
REAL MIKROTIK
```

Les accès doivent être strictement contrôlés.

---

# 07 — ENVIRONMENT CONFIGURATION

Les variables doivent être classées par domaine.

## Application

```text
APP_ENV
APP_URL
API_URL
LOG_LEVEL
```

---

## Database

```text
DATABASE_URL
```

---

## Authentication

```text
SESSION_SECRET
AUTH_SECRET
```

selon le mécanisme réellement retenu.

---

## Payment

```text
PAYMENT_PROVIDER
PAYMENT_API_KEY
PAYMENT_SECRET
PAYMENT_WEBHOOK_SECRET
```

---

## Connector

```text
CONNECTOR_ID
CONNECTOR_TOKEN
CONNECTOR_SECRET
```

---

## MikroTik

Les credentials MikroTik doivent rester côté Connector.

Ils ne doivent jamais être envoyés au frontend.

---

# 08 — ENVIRONMENT FILES

Le repository doit contenir un fichier exemple :

```text
.env.example
```

Il doit documenter :

* nom de la variable ;
* rôle ;
* environnement concerné ;
* caractère obligatoire ou optionnel.

Il ne doit contenir aucune vraie valeur secrète.

---

# 09 — SECRET MANAGEMENT

## 09.1 — Secrets interdits dans Git

Ne jamais committer :

```text
API keys
Passwords
Tokens
Webhook secrets
Database passwords
MikroTik credentials
Private keys
Session secrets
```

---

## 09.2 — Secret Exposure Rule

Si un secret est accidentellement committé :

```text
1. considérer le secret compromis
2. révoquer
3. générer un nouveau secret
4. mettre à jour l'environnement
5. vérifier les logs
6. documenter l'incident
```

Ne pas considérer la suppression du commit comme suffisante.

---

# 10 — FRONTEND DEPLOYMENT

Le frontend doit être construit à partir du repository Git.

Pipeline :

```text
Git push
   ↓
CI
   ↓
Install dependencies
   ↓
Lint
   ↓
Tests
   ↓
Build
   ↓
Deploy
```

---

## 10.1 — Frontend Production Configuration

Le frontend doit connaître uniquement les informations publiques nécessaires.

Exemple :

```text
PUBLIC_API_URL
```

Aucune clé secrète ne doit être injectée dans le bundle frontend.

---

## 10.2 — Frontend Build

Avant déploiement :

```text
[ ] dependencies install
[ ] lint
[ ] type check
[ ] tests
[ ] production build
[ ] bundle validation
[ ] smoke test
```

---

# 11 — BACKEND DEPLOYMENT

Pipeline :

```text
Git
 ↓
CI
 ↓
Tests
 ↓
Security checks
 ↓
Build
 ↓
Migration
 ↓
Deploy
 ↓
Health check
 ↓
Smoke test
```

---

## 11.1 — Backend Health Endpoint

Le backend doit exposer un endpoint de santé adapté.

Exemple :

```text
GET /health
```

Il doit permettre de savoir si le service est opérationnel.

---

## 11.2 — Readiness

La disponibilité du processus ne signifie pas nécessairement que le système est prêt.

Distinction :

```text
LIVENESS
=
process running

READINESS
=
service able to serve correctly
```

---

# 12 — DATABASE DEPLOYMENT

La base de données doit être considérée comme un composant critique.

Avant chaque migration :

```text
Backup
 ↓
Migration
 ↓
Validation
```

---

## 12.1 — Migration Rules

Une migration doit être :

* versionnée ;
* reproductible ;
* testée ;
* documentée ;
* réversible lorsque possible.

---

## 12.2 — Destructive Migration

Une migration destructive ne doit jamais être appliquée directement sans :

```text
backup
+
verification
+
rollback plan
```

---

# 13 — INITIAL PRODUCTION DATA

Avant ouverture publique, vérifier :

### Plans

> **CORRECTION IMP-08 (17/09/2026)** : checklist rectifiée sur la **Grille A officielle**
> (accès / validité ; aucune offre 5 000 FCFA).

```text
100 FCFA  → ACCESS 5 HOURS   / VALIDITY 24 HOURS
200 FCFA  → ACCESS 12 HOURS  / VALIDITY 24 HOURS
300 FCFA  → ACCESS 24 HOURS  / VALIDITY 48 HOURS
500 FCFA  → ACCESS 72 HOURS  / VALIDITY 5 DAYS
1,000 FCFA → ACCESS 1 WEEK   / VALIDITY 10 DAYS
4,000 FCFA → ACCESS 1 MONTH  / VALIDITY 40 DAYS
```

Ces valeurs représentent la source commerciale définie pour le système.

Elles ne doivent pas être déduites automatiquement des profils MikroTik.

---

# 14 — MIKROTIK PRODUCTION CONFIGURATION

La configuration finale du MikroTik doit être effectuée avec prudence.

Le système existant contient notamment :

```text
HotSpot
DHCP
DNS
NAT
Firewall
Mangle
Profiles
Tickets
On-Login script
Mikmon
```

Ces éléments constituent l'infrastructure existante et ne doivent pas être remplacés inutilement.

---

# 15 — PRE-CHANGE MIKROTIK BACKUP

Avant toute modification de production :

```text
1. vérifier accès WinBox/WebFig
2. vérifier version RouterOS
3. créer backup
4. exporter configuration si nécessaire
5. vérifier que le backup existe
6. conserver une copie sécurisée
7. documenter la date
8. documenter la modification prévue
```

---

# 16 — MIKROTIK CHANGE POLICY

Toute modification doit être classée :

```text
READ ONLY
LOW RISK
MEDIUM RISK
HIGH RISK
```

Les changements critiques nécessitent :

```text
backup
+
plan de retour
+
fenêtre de maintenance
```

---

# 17 — CONNECTOR DEPLOYMENT

Le Connector est installé dans le réseau local de Déo Gracias.

Architecture :

```text
Internet
   │
   ▼
Backend
   │
   │ HTTPS outbound
   ▼
Connector
   │
   │ Local API/API-SSL
   ▼
MikroTik
```

---

# 18 — CONNECTOR HOST

Le matériel exact devra être choisi selon les contraintes opérationnelles.

Le système doit privilégier une machine :

* stable ;
* disponible pendant les heures d'activité ;
* capable de redémarrer automatiquement ;
* connectée au réseau local ;
* suffisamment sécurisée ;
* facilement maintenable.

---

# 19 — CONNECTOR INSTALLATION

Procédure générale :

```text
1. préparer la machine
2. installer le runtime
3. installer le Connector
4. configurer l'environnement
5. enregistrer le Connector
6. configurer son secret
7. tester la connexion backend
8. tester la connexion MikroTik
9. lancer le health check
10. activer le démarrage automatique
```

---

# 20 — CONNECTOR AUTOSTART

Le Connector doit démarrer automatiquement après redémarrage de la machine.

Objectif :

```text
Power ON
   ↓
OS
   ↓
Connector
   ↓
Backend connection
   ↓
Healthy
```

Un redémarrage manuel ne doit pas être nécessaire après chaque coupure électrique.

---

# 21 — CONNECTOR HEALTH

Le backend doit pouvoir déterminer :

```text
ONLINE
OFFLINE
DEGRADED
UNKNOWN
```

Les informations utiles peuvent inclure :

* dernière connexion ;
* version ;
* dernier heartbeat ;
* dernière synchronisation ;
* dernière erreur.

---

# 22 — CONNECTOR SECURITY

Le Connector doit :

* utiliser HTTPS vers le backend ;
* authentifier ses requêtes ;
* protéger son token ;
* ne pas exposer son interface administrative publiquement ;
* limiter les commandes ;
* journaliser les opérations importantes.

---

# 23 — MIKROTIK API SECURITY

Le Connector doit communiquer avec le MikroTik via le mécanisme compatible avec RouterOS utilisé.

Pour le RouterOS 6.49.17 actuellement identifié :

```text
Classic RouterOS API / API-SSL
```

et non RouterOS REST API.

Le port et les règles d'accès doivent être limités au réseau local nécessaire.

---

# 24 — DEDICATED MIKROTIK USER

Le Connector ne doit pas utiliser :

```text
admin / full
```

comme identité applicative.

Prévoir :

```text
mikrotik-connector
```

ou équivalent.

Les permissions doivent être limitées aux opérations réellement nécessaires.

---

# 25 — MIKROTIK ACCESS RESTRICTION

L'accès API doit être limité autant que possible :

```text
Connector IP
       ↓
MikroTik API
```

et non :

```text
Internet
   ↓
MikroTik API
```

---

# 26 — FINAL CONNECTOR VALIDATION

Tester :

```text
[ ] Backend reachable
[ ] Connector authenticated
[ ] MikroTik reachable
[ ] API connection works
[ ] Read operation works
[ ] Required operation works
[ ] Invalid operation rejected
[ ] Connector restart works
[ ] Backend reconnect works
[ ] MikroTik restart recovery works
```

---

# 27 — TICKET INVENTORY DEPLOYMENT

Le modèle MVP reste basé sur les tickets pré-générés.

```text
Mikmon
   ↓
Generate batch
   ↓
Identify batch
   ↓
Import / associate
   ↓
Backend inventory
```

Le backend devient la source de vérité commerciale.

MikroTik reste la source de vérité réseau.

---

# 28 — DIGITAL BATCH DEPLOYMENT

Chaque batch destiné à la vente en ligne doit être clairement identifié :

```text
BATCH
 ├── Plan
 ├── Quantity
 ├── Destination = DIGITAL
 ├── Generation date
 ├── Availability
 └── Inventory state
```

Un batch physique ne doit pas entrer automatiquement dans l'inventaire digital.

---

# 29 — TICKET / MIKROTIK RECONCILIATION

Avant ouverture publique :

```text
Backend inventory
       ↕
MikroTik ticket inventory
```

doit être vérifié.

Identifier :

* tickets absents ;
* tickets dupliqués ;
* tickets déjà utilisés ;
* tickets mal associés ;
* mauvais plan ;
* mauvais batch.

---

# 30 — COMMERCIAL / MIKROTIK PLAN RECONCILIATION

Les divergences connues entre les prix commerciaux et certains profils MikroTik doivent être traitées explicitement avant automatisation complète.

Le système ne doit pas faire :

```text
price → blindly select profile
```

Il doit utiliser un mapping contrôlé :

```text
COMMERCIAL PLAN
      ↓
MikroTik mapping
      ↓
ticket duration / profile
```

---

# 31 — PAYMENT PROVIDER PRODUCTION

Avant production :

```text
[ ] Merchant account validated
[ ] Production credentials obtained
[ ] Webhook URL configured
[ ] Webhook secret configured
[ ] Allowed payment methods verified
[ ] Settlement destination verified
[ ] Fees documented
[ ] Transaction limits verified
[ ] Test transaction completed
```

Le provider effectivement retenu doit être confirmé à ce stade.

La documentation de déploiement ne doit donc pas figer définitivement FedaPay ou MTN Direct tant que le choix commercial et l'onboarding ne sont pas finalisés.

---

# 32 — PAYMENT WEBHOOK PRODUCTION

Le webhook doit être configuré vers :

```text
HTTPS
+
production endpoint
```

Après configuration :

```text
Provider
   ↓
Webhook
   ↓
Backend
   ↓
Signature verification
   ↓
Event processing
```

---

# 33 — PAYMENT PRODUCTION TEST

Effectuer un achat réel contrôlé.

Par exemple :

```text
Plan
 ↓
Order
 ↓
Payment
 ↓
Webhook
 ↓
Order = PAID
 ↓
Ticket allocated
 ↓
Ticket delivered
```

Le test doit être documenté.

---

# 34 — PUBLIC DOMAIN

Le système doit utiliser un domaine stable en production.

Prévoir :

```text
PUBLIC WEBSITE
API
ADMIN
WEBHOOK
```

selon l'architecture retenue.

---

# 35 — HTTPS

Tous les composants accessibles publiquement doivent utiliser HTTPS.

Minimum :

```text
Frontend → HTTPS
Backend → HTTPS
Webhook → HTTPS
Connector → HTTPS
```

Le trafic local Connector → MikroTik doit utiliser le mécanisme sécurisé disponible et approprié à l'environnement.

---

# 36 — CORS

Le backend doit limiter les origines autorisées.

En production :

```text
CORS_ORIGINS
=
production frontend origin
```

Éviter :

```text
*
```

pour les opérations sensibles.

---

# 37 — CI/CD

Le repository doit disposer d'un pipeline contrôlé.

Pipeline minimal :

```text
PUSH
 ↓
Lint
 ↓
Type Check
 ↓
Unit Tests
 ↓
Integration Tests
 ↓
Security Checks
 ↓
Build
 ↓
Deploy
```

---

# 38 — BRANCH STRATEGY

Le développement doit éviter les modifications directes non contrôlées de la branche de production.

Workflow recommandé :

```text
feature/*
   ↓
pull request
   ↓
CI
   ↓
review
   ↓
main
   ↓
production deployment
```

---

# 39 — DEPLOYMENT ARTIFACT

Chaque production doit être identifiable.

Exemple :

```text
version
commit SHA
build timestamp
environment
```

Cela permet de répondre :

> Quelle version tourne actuellement ?

---

# 40 — RELEASE RECORD

Chaque release doit documenter :

```text
Release ID
Date
Commit
Changes
Database migrations
Environment changes
Known issues
Rollback version
Operator
```

---

# 41 — ROLLOUT STRATEGY

Le premier déploiement doit être progressif.

Ordre :

```text
Infrastructure
 ↓
Backend
 ↓
Database
 ↓
Connector
 ↓
MikroTik integration
 ↓
Admin
 ↓
Controlled payment
 ↓
Public access
```

---

# 42 — PRE-PRODUCTION CHECKLIST

Avant ouverture :

```text
[ ] Domain configured
[ ] HTTPS active
[ ] Frontend deployed
[ ] Backend deployed
[ ] Database ready
[ ] Migrations applied
[ ] Secrets configured
[ ] CORS configured
[ ] Payment configured
[ ] Webhook configured
[ ] Connector installed
[ ] Connector authenticated
[ ] MikroTik reachable
[ ] Ticket inventory imported
[ ] Commercial plans verified
[ ] Admin account secured
[ ] Monitoring active
[ ] Backup active
[ ] Restore procedure documented
[ ] Rollback tested
```

---

# 43 — SMOKE TEST

Après chaque production deployment :

```text
1. frontend loads
2. backend health = OK
3. plans available
4. order creation works
5. payment endpoint works
6. admin login works
7. Connector heartbeat works
8. MikroTik read operation works
9. logs received
10. monitoring healthy
```

---

# 44 — PRODUCTION MONITORING

Le monitoring doit couvrir plusieurs niveaux.

## Application

* uptime ;
* response time ;
* HTTP errors ;
* API latency.

## Database

* availability ;
* connections ;
* query errors ;
* storage.

## Payment

* initiated;
* pending;
* success;
* failure;
* webhook failures.

## Inventory

* available tickets ;
* low inventory ;
* allocation failures.

## Connector

* online/offline ;
* heartbeat ;
* sync errors.

## MikroTik

* availability ;
* API connectivity ;
* active sessions ;
* synchronization failures.

---

# 45 — HEALTH MODEL

Le système global peut être résumé par :

```text
SYSTEM HEALTH
│
├── Frontend
├── Backend
├── Database
├── Payment
├── Connector
├── MikroTik
├── Inventory
└── Backup
```

Un système n'est pas considéré entièrement healthy si un composant critique est indisponible.

---

# 46 — ALERTS

Créer des alertes pour les événements réellement importants.

Exemples :

```text
CRITICAL
Payment confirmed but ticket unavailable

HIGH
Connector offline

HIGH
MikroTik sync repeatedly failing

HIGH
Webhook processing failures

MEDIUM
Low digital inventory

MEDIUM
Repeated admin login failures

LOW
Non-critical performance degradation
```

---

# 47 — LOG RETENTION

Définir une politique de conservation pour :

* application logs ;
* payment events ;
* audit logs ;
* security events ;
* Connector logs ;
* incident records.

La durée exacte doit être déterminée selon les besoins opérationnels et les contraintes de l'infrastructure choisie.

---

# 48 — OPERATIONAL DASHBOARD

Le dashboard admin doit fournir une vue opérationnelle.

Minimum :

```text
SYSTEM STATUS
PAYMENT STATUS
INVENTORY
CONNECTOR
MIKROTIK
INCIDENTS
RECENT AUDIT EVENTS
```

---

# 49 — INVENTORY ALERTING

L'administrateur doit pouvoir détecter :

```text
NORMAL
LOW
CRITICAL
EMPTY
```

pour chaque plan digital.

Exemple :

```text
500 FCFA
Available: 37
Status: LOW
```

Les seuils exacts seront configurables.

---

# 50 — INCIDENT OPERATIONS

Lorsqu'un incident survient :

```text
DETECT
 ↓
CLASSIFY
 ↓
RECORD
 ↓
INVESTIGATE
 ↓
MITIGATE
 ↓
RECOVER
 ↓
VERIFY
 ↓
CLOSE
```

---

# 51 — INCIDENT PRIORITY

## P0 — Critical

Exemple :

```text
Payments failing globally
Database unavailable
Admin compromise
```

Action :

```text
Immediate intervention
```

---

## P1 — High

Exemple :

```text
Connector offline
MikroTik synchronization blocked
```

Action :

```text
Rapid intervention
```

---

## P2 — Medium

Exemple :

```text
Single payment stuck
Low inventory
```

Action :

```text
Operational investigation
```

---

## P3 — Low

Exemple :

```text
Minor UI issue
Non-critical log issue
```

---

# 52 — BACKUP STRATEGY

Les sauvegardes doivent couvrir au minimum :

```text
DATABASE
CONFIGURATION
IMPORTANT OPERATIONAL DATA
```

Les secrets ne doivent pas être copiés dans des sauvegardes non protégées.

---

# 53 — DATABASE BACKUPS

Définir :

```text
Frequency
Retention
Storage
Encryption
Verification
Restore process
```

La fréquence exacte dépendra du provider et de l'infrastructure choisie.

---

# 54 — MIKROTIK BACKUP

Conserver :

* backup binaire ;
* export de configuration approprié ;
* version RouterOS ;
* date ;
* contexte de sauvegarde.

Les backups MikroTik doivent être traités comme des fichiers sensibles.

---

# 55 — BACKUP VERIFICATION

Une sauvegarde doit être considérée comme valide uniquement si :

```text
Created
+
Stored
+
Readable
+
Restorable
```

---

# 56 — RESTORE PROCEDURE

La procédure générale :

```text
1. Detect failure
2. Stop risky operations
3. Identify last valid backup
4. Validate backup
5. Prepare restore environment
6. Restore
7. Validate database
8. Validate backend
9. Validate Connector
10. Validate MikroTik
11. Run smoke tests
12. Reopen service
```

---

# 57 — ROLLBACK STRATEGY

Deux types de rollback doivent être distingués.

## Application rollback

```text
Version N
 ↓
Version N+1
 ↓
problem
 ↓
Version N
```

---

## Database rollback

Plus délicat.

Préférer :

```text
forward-compatible migration
+
backup
+
recovery procedure
```

plutôt qu'un rollback destructif improvisé.

---

# 58 — CONNECTOR ROLLBACK

Le Connector doit également être versionné.

Prévoir :

```text
Connector v1
 ↓
Connector v2
 ↓
failure
 ↓
Connector v1
```

Le backend doit idéalement pouvoir détecter une version incompatible.

---

# 59 — MIKROTIK ROLLBACK

Une modification MikroTik doit toujours avoir une procédure de retour.

Avant modification :

```text
Backup
+
Export
+
Current state record
```

Après modification :

```text
Validation
```

Si problème :

```text
Restore / reverse change
```

---

# 60 — MAINTENANCE WINDOWS

Les opérations risquées doivent être réalisées pendant une fenêtre définie.

Exemples :

* changement MikroTik ;
* migration database ;
* mise à jour Connector ;
* changement payment configuration.

---

# 61 — ZERO-DOWNTIME EXPECTATION

Le zéro downtime absolu n'est pas une exigence initiale du MVP.

La priorité est :

```text
CONTROLLED DEPLOYMENT
+
FAST RECOVERY
```

plutôt qu'une infrastructure inutilement complexe.

---

# 62 — RESOURCE MONITORING

Sur le MikroTik, surveiller notamment les ressources disponibles.

Le modèle identifié est :

```text
RB951Ui-2HnD
RouterOS 6.49.17
```

avec des ressources limitées.

Il faut donc éviter :

* scripts inutiles ;
* processus permanents inutiles ;
* polling agressif ;
* règles complexes ajoutées sans justification ;
* stockage excessif de logs.

---

# 63 — CONNECTOR RESOURCE POLICY

Le Connector doit rester léger.

Éviter :

```text
high CPU loops
aggressive polling
large local databases
unbounded logs
memory leaks
```

Préférer :

```text
heartbeat
event-driven operations
controlled retry
bounded logs
```

---

# 64 — POLLING POLICY

Le Connector ne doit pas interroger constamment le MikroTik sans nécessité.

Préférer :

```text
command-driven sync
+
periodic health check
```

plutôt que :

```text
continuous aggressive polling
```

---

# 65 — OPERATIONAL COMMANDS

Documenter les opérations fréquentes :

```text
start
stop
restart
status
logs
health
version
diagnostics
```

pour le Connector.

---

# 66 — DIAGNOSTIC MODE

Le Connector doit disposer d'un moyen contrôlé de diagnostic.

Exemple :

```text
Diagnostics
 ├── Backend connectivity
 ├── Authentication
 ├── MikroTik connectivity
 ├── API authentication
 ├── Last sync
 └── Last error
```

Les diagnostics ne doivent pas exposer les secrets.

---

# 67 — DEPLOYMENT DOCUMENTATION

Le repository doit contenir une documentation opérationnelle.

Structure recommandée :

```text
docs/
├── deployment/
│   ├── DEPLOYMENT_GUIDE.md
│   ├── ENVIRONMENT_CONFIGURATION.md
│   ├── CONNECTOR_INSTALLATION.md
│   ├── MIKROTIK_PRODUCTION_SETUP.md
│   └── RELEASE_PROCEDURE.md
│
├── operations/
│   ├── OPERATIONS_RUNBOOK.md
│   ├── INCIDENT_RESPONSE.md
│   ├── BACKUP_RESTORE.md
│   ├── ROLLBACK.md
│   └── MONITORING.md
│
└── troubleshooting/
    └── TROUBLESHOOTING.md
```

---

# 68 — OPERATIONS RUNBOOK

Le Runbook doit répondre rapidement à :

### Le site est inaccessible

```text
Check frontend
↓
Check backend
↓
Check DNS
↓
Check HTTPS
```

### Les paiements ne passent plus

```text
Check provider
↓
Check API
↓
Check webhook
↓
Check logs
↓
Check incidents
```

### Le Connector est offline

```text
Check machine
↓
Check network
↓
Check process
↓
Check credentials
↓
Check backend connectivity
```

### Le MikroTik est inaccessible

```text
Check LAN
↓
Check IP
↓
Check API service
↓
Check Connector
↓
Check firewall
```

---

# 69 — TROUBLESHOOTING PRINCIPLE

Le diagnostic doit suivre :

```text
SYMPTOM
 ↓
OBSERVATION
 ↓
ISOLATION
 ↓
CAUSE
 ↓
CORRECTION
 ↓
VALIDATION
```

Ne pas modifier plusieurs composants simultanément sans savoir lequel était responsable.

---

# 70 — PRODUCTION CHANGE MANAGEMENT

Toute modification significative doit documenter :

```text
WHY
WHAT
RISK
BACKUP
PROCEDURE
VALIDATION
ROLLBACK
RESULT
```

---

# 71 — RELEASE CHECKLIST

Avant chaque release :

```text
[ ] Feature complete
[ ] Tests passed
[ ] Security checks passed
[ ] Migration reviewed
[ ] Backup verified
[ ] Release notes written
[ ] Rollback version identified
[ ] Production secrets unchanged/updated correctly
[ ] Deployment window chosen
```

---

# 72 — POST-DEPLOYMENT CHECKLIST

Après deployment :

```text
[ ] Frontend accessible
[ ] API healthy
[ ] Database healthy
[ ] Admin accessible
[ ] Plans visible
[ ] Order creation works
[ ] Payment status works
[ ] Webhook works
[ ] Connector online
[ ] MikroTik reachable
[ ] Inventory visible
[ ] Logs healthy
[ ] No critical incidents
```

---

# 73 — PRODUCTION SMOKE PURCHASE

Une transaction réelle contrôlée doit être effectuée après la mise en production initiale.

Flux :

```text
Client test
 ↓
Plan
 ↓
Order
 ↓
Payment
 ↓
Webhook
 ↓
Ticket
 ↓
HotSpot
```

Documenter :

```text
timestamp
order
payment reference
ticket reference
result
```

Les secrets et informations sensibles ne doivent pas être ajoutés aux documents de test.

---

# 74 — PRODUCTION OPENING

L'ouverture publique doit être progressive.

## Stage 1

```text
Infrastructure only
```

## Stage 2

```text
Internal validation
```

## Stage 3

```text
Controlled real payment
```

## Stage 4

```text
Limited public access
```

## Stage 5

```text
Full production
```

---

# 75 — GO-LIVE GATE

Le système ne peut être déclaré LIVE que si :

```text
Security
        ✓
Testing
        ✓
Deployment
        ✓
Payment
        ✓
Connector
        ✓
MikroTik
        ✓
Inventory
        ✓
Monitoring
        ✓
Backup
        ✓
Rollback
        ✓
Operations
        ✓
```

---

# 76 — FIRST 24 HOURS

Après mise en production :

Surveiller particulièrement :

```text
Payments
Orders
Tickets
Webhook failures
Connector
MikroTik
Inventory
Errors
Latency
```

Ne pas considérer le système comme totalement stabilisé immédiatement après le premier deployment.

---

# 77 — FIRST 7 DAYS

Pendant la première semaine :

Analyser :

* nombre de commandes ;
* taux de succès paiement ;
* tickets délivrés ;
* erreurs ;
* incidents ;
* temps de résolution ;
* synchronisation ;
* consommation ;
* retours utilisateurs.

---

# 78 — OPERATIONS KPIs

Les indicateurs opérationnels peuvent inclure :

```text
Payment success rate
Order completion rate
Ticket delivery success rate
Webhook failure rate
Connector uptime
MikroTik connectivity
Incident count
Incident resolution time
Inventory availability
API error rate
```

---

# 79 — BUSINESS / TECHNICAL SEPARATION

Ne pas confondre :

```text
Business metric
```

et :

```text
Technical metric
```

Exemple :

```text
500 FCFA plans sold
```

est une métrique business.

```text
API latency
```

est une métrique technique.

Les deux doivent pouvoir être observées séparément.

---

# 80 — SECURITY OPERATIONS

En production :

```text
[ ] Secrets rotation procedure exists
[ ] Admin access reviewed
[ ] Failed logins monitored
[ ] Dependencies reviewed
[ ] Logs protected
[ ] Backups protected
[ ] Connector credentials protected
[ ] MikroTik access restricted
```

---

# 81 — ACCESS REVIEW

Périodiquement vérifier :

```text
Admin accounts
Connector accounts
MikroTik users
Payment credentials
Deployment accounts
Repository access
```

Supprimer les accès inutiles.

---

# 82 — DEPENDENCY UPDATES

Ne pas mettre à jour automatiquement toutes les dépendances en production.

Workflow :

```text
Update
 ↓
Test
 ↓
Security review
 ↓
Staging
 ↓
Production
```

---

# 83 — MIKROTIK MAINTENANCE POLICY

Ne pas mettre à jour RouterOS simplement parce qu'une version existe.

Avant une mise à jour :

```text
Current version
 ↓
Compatibility review
 ↓
Backup
 ↓
Maintenance window
 ↓
Upgrade
 ↓
Validation
 ↓
Rollback if required
```

---

# 84 — DOCUMENTATION LIVING SYSTEM

La documentation opérationnelle doit évoluer avec le système.

Après un incident important :

```text
Incident
 ↓
Root cause
 ↓
Fix
 ↓
Runbook update
 ↓
Regression test
```

---

# 85 — POSTMORTEM

Pour un incident important :

```text
Incident ID
Date
Duration
Impact
Detection
Root cause
Resolution
Recovery
What went well
What failed
Preventive actions
```

L'objectif n'est pas de chercher un coupable.

L'objectif est d'améliorer le système.

---

# 86 — OPERATIONAL MATURITY

Le système évolue progressivement.

```text
LEVEL 1
Manual deployment
        ↓
LEVEL 2
Automated CI/CD
        ↓
LEVEL 3
Monitoring
        ↓
LEVEL 4
Automated recovery
        ↓
LEVEL 5
Advanced observability
```

Le MVP n'a pas besoin d'atteindre immédiatement le niveau maximal.

---

# 87 — MVP OPERATIONS PRIORITY

Pour Déo Gracias, l'ordre de priorité est :

```text
1. Reliability
2. Payment integrity
3. Ticket integrity
4. Connector availability
5. MikroTik stability
6. Backup
7. Monitoring
8. Automation
9. Advanced optimization
```

Ne pas construire une infrastructure DevOps disproportionnée pour un système dont le volume initial reste limité.

---

# 88 — OPERATIONAL SIMPLICITY

Chaque automatisation doit être évaluée selon :

```text
VALUE
vs
COMPLEXITY
```

Une solution manuelle documentée peut être préférable à une automatisation fragile.

---

# 89 — DISASTER RECOVERY

Scénarios minimum :

### D1 — Backend unavailable

```text
Detect
 ↓
Recover / redeploy
 ↓
Validate
```

### D2 — Database failure

```text
Stop risky operations
 ↓
Restore
 ↓
Validate
```

### D3 — Connector machine failure

```text
Install replacement
 ↓
Register Connector
 ↓
Connect MikroTik
 ↓
Validate
```

### D4 — MikroTik configuration failure

```text
Disconnect risky operations
 ↓
Restore / reverse configuration
 ↓
Validate HotSpot
```

### D5 — Payment provider unavailable

```text
Detect
 ↓
Display controlled state
 ↓
Do not falsely confirm payment
 ↓
Wait / recover
```

---

# 90 — RECOVERY PRIORITY

En cas de catastrophe :

```text
1. Database integrity
2. Payment integrity
3. Network service
4. Ticket inventory
5. Admin operations
6. Analytics / secondary features
```

---

# 91 — BUSINESS CONTINUITY

Le système doit pouvoir continuer à fonctionner selon ses capacités disponibles.

Exemple :

Si le paiement en ligne est temporairement indisponible :

```text
Digital purchase
    ↓
temporarily unavailable
```

Le Wi-Fi physique existant ne doit pas nécessairement être détruit.

La fonctionnalité nouvelle ne doit pas casser le fonctionnement historique.

---

# 92 — PRESERVING EXISTING SERVICE

Le système actuel constitue une infrastructure opérationnelle.

Le déploiement du nouveau système doit préserver autant que possible :

```text
HotSpot
DHCP
DNS
NAT
Firewall
Mikmon
Physical tickets
Existing authentication
```

Le nouveau système vient s'intégrer autour de cette infrastructure.

---

# 93 — OPERATIONAL SEPARATION

Séparer :

```text
COMMERCIAL SYSTEM
        ↕
NETWORK SYSTEM
```

Le backend gère :

```text
plans
orders
payments
inventory
```

Le MikroTik gère :

```text
network
authentication
sessions
access
```

Le Connector gère :

```text
communication
synchronization
```

---

# 94 — FINAL PRODUCTION ARCHITECTURE

Architecture cible :

```text
                     ┌──────────────────┐
                     │      CLIENT      │
                     └────────┬─────────┘
                              │
                              ▼
                     ┌──────────────────┐
                     │   WEB FRONTEND   │
                     └────────┬─────────┘
                              │ HTTPS
                              ▼
                  ┌────────────────────────┐
                  │      BACKEND API       │
                  │                        │
                  │ Orders                 │
                  │ Payments               │
                  │ Tickets                │
                  │ Admin                  │
                  │ Incidents              │
                  │ Audit                  │
                  └───────┬────────┬───────┘
                          │        │
                    HTTPS │        │ SQL
                          │        │
                          ▼        ▼
                   ┌──────────┐ ┌─────────┐
                   │CONNECTOR │ │ DATABASE│
                   └────┬─────┘ └─────────┘
                        │
                    Local API
                        │
                        ▼
                   ┌──────────┐
                   │ MIKROTIK │
                   └────┬─────┘
                        │
                        ▼
                      WIFI
```

---

# 95 — PRODUCTION SECURITY BOUNDARY

La règle fondamentale :

```text
INTERNET
   ✕
MIKROTIK
```

mais :

```text
INTERNET
   ↓ HTTPS
BACKEND
   ↓ HTTPS
CONNECTOR
   ↓ LOCAL API/API-SSL
MIKROTIK
```

---

# 96 — FINAL OPERATIONS CHECKLIST

## Infrastructure

```text
[ ] Production frontend
[ ] Production backend
[ ] Database
[ ] Domain
[ ] HTTPS
[ ] DNS
```

## Security

```text
[ ] Secrets configured
[ ] Admin protected
[ ] CORS restricted
[ ] Connector secured
[ ] MikroTik API restricted
```

## Payment

```text
[ ] Merchant validated
[ ] Production credentials
[ ] Webhook
[ ] Signature verification
[ ] Settlement verified
[ ] Test payment
```

## Tickets

```text
[ ] Plans loaded
[ ] Digital inventory
[ ] Physical separation
[ ] Batch mapping
[ ] Reconciliation
```

## Connector

```text
[ ] Installed
[ ] Authenticated
[ ] Autostart
[ ] Heartbeat
[ ] MikroTik connection
[ ] Recovery test
```

## MikroTik

```text
[ ] Backup
[ ] Export
[ ] Dedicated user
[ ] API restriction
[ ] Required mapping
[ ] HotSpot validated
```

## Operations

```text
[ ] Monitoring
[ ] Logging
[ ] Alerts
[ ] Backup
[ ] Restore
[ ] Rollback
[ ] Runbook
[ ] Incident procedure
```

---

# 97 — FINAL ACCEPTANCE TEST

Le système doit passer le parcours complet :

```text
CLIENT
 ↓
CONNECT WIFI
 ↓
CAPTIVE PORTAL
 ↓
SELECT PLAN
 ↓
CREATE ORDER
 ↓
PAY
 ↓
PAYMENT PROVIDER
 ↓
WEBHOOK
 ↓
PAYMENT VERIFIED
 ↓
TICKET ALLOCATION
 ↓
TICKET DELIVERY
 ↓
HOTSPOT LOGIN
 ↓
INTERNET ACCESS
```

Puis :

```text
ADMIN
 ↓
OPEN DASHBOARD
 ↓
SEE ORDER
 ↓
SEE PAYMENT
 ↓
SEE TICKET
 ↓
SEE INVENTORY
 ↓
SEE CONNECTOR
 ↓
SEE SYSTEM STATUS
```

---

# 98 — FAILURE ACCEPTANCE TEST

Le système doit également passer :

```text
PAYMENT SUCCESS
+
CONNECTOR OFFLINE
```

Résultat attendu :

```text
Payment preserved
+
Order traceable
+
Incident created
+
No duplicate payment
+
Retry possible
```

---

# 99 — GO-LIVE CRITERIA

Production autorisée uniquement si :

```text
[✓] Phase 9 validated
[✓] Infrastructure deployed
[✓] Secrets configured
[✓] Database ready
[✓] Payment validated
[✓] Webhook validated
[✓] Connector validated
[✓] MikroTik validated
[✓] Inventory reconciled
[✓] Monitoring active
[✓] Backup verified
[✓] Restore procedure validated
[✓] Rollback procedure documented
[✓] Smoke test passed
[✓] Production payment test passed
[✓] Critical incidents = 0
```

---

# 100 — DEFINITION OF DONE

La Phase 10 est terminée lorsque :

```text
ARCHITECTURE VALIDATED
        ↓
ENVIRONMENTS READY
        ↓
SECRETS CONFIGURED
        ↓
FRONTEND DEPLOYED
        ↓
BACKEND DEPLOYED
        ↓
DATABASE READY
        ↓
CONNECTOR DEPLOYED
        ↓
MIKROTIK CONFIGURED
        ↓
PAYMENT CONNECTED
        ↓
INVENTORY RECONCILED
        ↓
MONITORING ACTIVE
        ↓
BACKUPS ACTIVE
        ↓
RESTORE VALIDATED
        ↓
ROLLBACK VALIDATED
        ↓
GO-LIVE TEST PASSED
        ↓
PRODUCTION
```

---

# 101 — REQUIRED DELIVERABLES

La Phase 10 doit produire au minimum :

```text
11_DEPLOYMENT_OPERATIONS.md
```

et :

```text
docs/
├── deployment/
│   ├── DEPLOYMENT_GUIDE.md
│   ├── ENVIRONMENT_CONFIGURATION.md
│   ├── CONNECTOR_INSTALLATION.md
│   ├── MIKROTIK_PRODUCTION_SETUP.md
│   └── RELEASE_PROCEDURE.md
│
├── operations/
│   ├── OPERATIONS_RUNBOOK.md
│   ├── INCIDENT_RESPONSE.md
│   ├── BACKUP_RESTORE.md
│   ├── ROLLBACK.md
│   └── MONITORING.md
│
└── troubleshooting/
    └── TROUBLESHOOTING.md
```

Les fichiers secondaires peuvent être créés progressivement pendant l'implémentation.

---

# 102 — IMPLEMENTATION RULES FOR THE DEVELOPMENT AGENT

L'agent de développement doit respecter les règles suivantes.

## Rule 1

Ne jamais déployer directement une modification non testée en production.

## Rule 2

Ne jamais mettre un secret dans Git.

## Rule 3

Ne jamais exposer le MikroTik directement à Internet.

## Rule 4

Ne jamais utiliser le compte administrateur MikroTik comme compte applicatif.

## Rule 5

Toujours effectuer une sauvegarde avant une modification critique du MikroTik.

## Rule 6

Toujours vérifier la santé du système après deployment.

## Rule 7

Toute migration de base doit être versionnée.

## Rule 8

Toute release doit avoir une version identifiable.

## Rule 9

Toute modification critique doit disposer d'un rollback ou d'une procédure de récupération.

## Rule 10

Ne jamais supprimer les logs ou incidents pour masquer un problème.

## Rule 11

Ne jamais considérer « deployment successful » comme équivalent à « production healthy ».

## Rule 12

Après chaque déploiement, effectuer les smoke tests.

## Rule 13

Après tout incident critique, ajouter si nécessaire :

```text
test
+
documentation
+
preventive measure
```

---

# 103 — OPERATIONAL DOCUMENTATION RULE

À chaque étape d'implémentation significative :

```text
## À DOCUMENTER

Problem encountered:
Solution:
Decision:
Configuration changed:
Rollback:
Validation:
```

La documentation doit être mise à jour au fur et à mesure et non reconstruite entièrement à la fin.

Cette logique est cohérente avec le workflow documentaire du projet : chaque étape doit laisser une trace exploitable, plutôt que repousser toute la documentation à la fin.

---

# 104 — FINAL OPERATIONAL PRINCIPLE

Le système ne doit pas seulement être :

> **deployable**

Il doit être :

> **operable.**

La différence est fondamentale.

```text
DEPLOYABLE
=
on peut le mettre en ligne

OPERABLE
=
on sait le mettre en ligne
+
on sait vérifier son état
+
on sait détecter une panne
+
on sait diagnostiquer
+
on sait récupérer
+
on sait revenir en arrière
+
on sait le maintenir
```

---

# 105 — FINAL PHASE PRINCIPLE

La Phase 10 doit respecter :

```text
SIMPLE
      ↓
CONTROLLED
      ↓
OBSERVABLE
      ↓
RECOVERABLE
      ↓
RELIABLE
```

Ne pas construire une infrastructure inutilement complexe.

Pour Déo Gracias, la priorité est d'obtenir un système :

* stable ;
* compréhensible ;
* sécurisé ;
* facilement maintenable ;
* suffisamment automatisé ;
* capable de fonctionner avec les contraintes réelles du réseau local.

---

# 106 — PHASE 10 CLOSURE

La Phase 10 sera officiellement clôturée après :

```text
Deployment
       ✓
Configuration
       ✓
Payment
       ✓
Connector
       ✓
MikroTik
       ✓
Inventory
       ✓
Monitoring
       ✓
Backup
       ✓
Restore
       ✓
Rollback
       ✓
Operational documentation
       ✓
Go-live
       ✓
```

À ce moment :

# **DÉO GRACIAS — ONLINE PAYMENT & WI-FI ACCESS SYSTEM**

sera considéré comme :

```text
DESIGNED
      ↓
IMPLEMENTED
      ↓
TESTED
      ↓
DEPLOYED
      ↓
OPERABLE
```

---

# 107 — NEXT STAGE

Après validation de la Phase 10, le projet quitte le cycle principal de conception.

Il entre dans :

# **PRODUCTION & CONTINUOUS OPERATIONS**

Les activités deviennent alors :

```text
MONITOR
 ↓
OPERATE
 ↓
MEASURE
 ↓
MAINTAIN
 ↓
IMPROVE
```

Les nouvelles fonctionnalités devront ensuite être traitées comme des évolutions contrôlées et non ajoutées directement au système en production.

````

---

## Point important sur cette Phase 10

J'ai volontairement **évité de figer un hébergeur précis** pour le système Déo Gracias.

Le document de référence AgentZero montre bien un workflow concret de type **GitHub → CI/CD → backend hébergé → frontend hébergé**, avec variables d'environnement et health check, mais ce choix appartient à cet autre projet et ne doit pas être importé automatiquement dans Déo Gracias. :contentReference[oaicite:2]{index=2}

Pour Déo Gracias, le bon niveau de décision à ce stade est :

```text
Architecture de déploiement
        ✓
Responsabilités
        ✓
Sécurité
        ✓
Procédures
        ✓
Rollback
        ✓
Monitoring
        ✓
````

puis, pendant l'implémentation de la Phase 10 :

```text
CHOIX CONCRET DU PROVIDER
        ↓
CONFIGURATION
        ↓
DEPLOYMENT
        ↓
VALIDATION
```

Cela évite de transformer une décision d'infrastructure encore ouverte en contrainte artificielle.

Autre point important : les principes Digital Experience restent présents **uniquement là où ils ont un impact sur l'exploitation**. Par exemple, le mobile doit être traité comme une expérience à part entière et les états `Loading / Error / Success / Offline` doivent rester cohérents en production.  Pour les éventuelles expériences avancées, la dégradation progressive et le nettoyage du cycle de vie restent également des exigences de qualité. 

### État documentaire actuel

```text
07_MIKROTIK_INTEGRATION.md       ✓
08_WEB_APPLICATION.md             ✓
09_ADMIN_DASHBOARD.md             ✓
10_SECURITY_RELIABILITY_TESTING   ✓
11_DEPLOYMENT_OPERATIONS          ← document Phase 10
```

**La Phase 10 est maintenant spécifiée.** La prochaine étape logique est sa **validation formelle**, exactement comme nous venons de le faire pour la Phase 9.

---

# Addendum IMP-08 (17/09/2026) — Relevé physique du site (IMP-05) et préparation lot W2

> Sources : `EVIDENCE-IMP05-01`, photos `PHYS-2026-09-17-01…07`, décision D5.

## Relevé physique (17/09/2026, réalisé par le propriétaire avec guide pas-à-pas)

```text
ONT fibre (SC/APC) → box opérateur « HomeBoard » (192.168.100.1) → RB951 ether1
RB951 ports 2 et 3 → injecteurs PoE Mercury → 2 relais Wi-Fi
RB951 ports 4 et 5 → LIBRES (réserve d'extension)
Onduleur Mercury Maverick 650VA → ONT + box + RB951 + PC + 2 injecteurs PoE
WAN : DHCP client dynamique sur ether1
```

Conséquences opérations :

1. **Aucun hôte on-site permanent** (le PC unique du propriétaire l'accompagne) → toutes les
   opérations physiques restantes sont regroupées dans le **lot W2**.
2. **Zone onduleur validée** : capacité 650VA dimensionnée pour le parc actuel ; toute
   extension (ports 4/5) doit être re-vérifiée contre cette capacité.
3. **WAN dynamique** : le plan de secours connexion (failover/reconnexion) ne peut pas
   s'appuyer sur une IP publique fixe ; monitoring = sondes sortantes (IMP-38).
4. **OD-1 clos sans hôte** (décision D5) : la supervision distante couvre le besoin.
