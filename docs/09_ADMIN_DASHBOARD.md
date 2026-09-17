# `09_ADMIN_DASHBOARD.md`

# Phase 8 — Admin Dashboard

**Projet :** Déo Gracias — Wi-Fi Access & Online Payment System
**Phase :** 8 — Admin Dashboard
**Statut :** Spécification officielle
**Document :** `09_ADMIN_DASHBOARD.md`
**Dépendances :**

* `00_PROJECT_CONTEXT`
* `01_PRODUCT_REQUIREMENTS`
* `02_EXISTING_INFRASTRUCTURE`
* `03_PAYMENT_RESEARCH`
* `04_ARCHITECTURE`
* `05_DATA_MODEL`
* `06_UX_SPECIFICATION`
* `07_MIKROTIK_INTEGRATION`
* `08_WEB_APPLICATION.md`

---

# 1. Objet du document

Ce document définit l'architecture fonctionnelle, UX, technique et opérationnelle du **Dashboard Administrateur** de la plateforme Déo Gracias.

Le Dashboard constitue l'interface privée permettant à l'administrateur autorisé de :

* surveiller l'activité commerciale ;
* consulter les ventes ;
* suivre les paiements ;
* gérer l'inventaire de tickets numériques ;
* gérer les lots de tickets ;
* suivre l'état du système MikroTik ;
* détecter et traiter les incidents ;
* consulter les journaux d'activité ;
* contrôler les paramètres métier nécessaires ;
* effectuer les opérations de récupération autorisées.

Le Dashboard n'est **pas** le portail captif client.

Il ne doit pas devenir une seconde application commerciale indépendante.

Il constitue la couche de **pilotage et d'exploitation** du système.

---

# 2. Position de la Phase 8 dans l'architecture

L'architecture globale est organisée autour de quatre zones principales :

```text
                         ┌─────────────────────┐
                         │     CLIENT WI-FI     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   PORTAIL CAPTIF     │
                         │  Web Application     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │    CLOUD BACKEND     │
                         │ Business Logic/API   │
                         └───────┬─────┬───────┘
                                 │     │
                  ┌──────────────┘     └──────────────┐
                  ▼                                   ▼
        ┌──────────────────┐                ┌──────────────────┐
        │ PAYMENT PROVIDER │                │ LOCAL CONNECTOR  │
        │    FedaPay/etc. │                │    HTTPS ↔ LAN   │
        └──────────────────┘                └────────┬─────────┘
                                                     │
                                                     ▼
                                             ┌───────────────┐
                                             │   MIKROTIK    │
                                             └───────────────┘

                         ┌─────────────────────┐
                         │   ADMIN DASHBOARD   │
                         │       PHASE 8       │
                         └──────────┬──────────┘
                                    │
                                    ▼
                              CLOUD BACKEND
```

Le Dashboard ne communique donc **pas directement avec MikroTik depuis le navigateur**.

Le navigateur communique avec le backend.

Le backend communique avec le Connector.

Le Connector communique avec MikroTik.

---

# 3. Principe fondamental

## 3.1 Le Dashboard n'est pas la source de vérité

Le Dashboard est une interface de contrôle.

Il ne doit jamais devenir une deuxième base de données métier.

La hiérarchie est :

```text
DATABASE / BACKEND
        │
        │ source de vérité métier
        ▼
ADMIN DASHBOARD
        │
        │ commandes autorisées
        ▼
BACKEND
```

Le Dashboard ne doit jamais :

* modifier directement la base de données ;
* calculer lui-même le prix officiel ;
* décider qu'un paiement est réussi ;
* créer directement un utilisateur MikroTik ;
* exposer les identifiants MikroTik ;
* considérer l'interface MikroTik comme source de vérité commerciale.

---

# 4. Objectifs de la Phase 8

La Phase 8 doit permettre à un administrateur autorisé de gérer efficacement les opérations suivantes :

### A. Vue générale

Comprendre rapidement :

* ventes du jour ;
* revenus ;
* paiements en attente ;
* tickets disponibles ;
* tickets vendus ;
* tickets utilisés ;
* tickets proches de l'épuisement ;
* incidents ;
* état du Connector ;
* état de synchronisation MikroTik.

### B. Gestion commerciale

Consulter :

* commandes ;
* paiements ;
* ventes ;
* plans ;
* historique.

### C. Gestion des tickets

Gérer :

* lots ;
* inventaire ;
* disponibilité ;
* tickets réservés ;
* tickets vendus ;
* tickets délivrés ;
* tickets utilisés ;
* tickets expirés.

### D. Exploitation technique

Surveiller :

* Connector ;
* synchronisation ;
* MikroTik ;
* erreurs ;
* opérations en attente.

### E. Gestion des incidents

Identifier :

* paiement confirmé mais ticket non délivré ;
* ticket indisponible ;
* synchronisation échouée ;
* Connector hors ligne ;
* webhook problématique ;
* allocation échouée ;
* erreur système.

### F. Audit

Permettre de savoir :

* qui a effectué une action ;
* quoi ;
* quand ;
* sur quelle ressource ;
* avec quel résultat.

---

# 5. Hors périmètre

La Phase 8 ne doit pas introduire arbitrairement :

* une nouvelle application mobile ;
* une nouvelle solution de paiement ;
* un CRM complet ;
* une comptabilité complète ;
* un système de facturation complexe ;
* un ERP ;
* une gestion avancée des employés ;
* une marketplace ;
* une gestion marketing avancée ;
* une modification automatique de la configuration MikroTik ;
* une refonte du portail captif.

Ces fonctionnalités pourront être étudiées ultérieurement.

---

# 6. Utilisateurs administratifs

Le système doit être conçu autour de rôles, même si le MVP ne comporte initialement qu'un seul administrateur.

## 6.1 Admin principal

Permissions possibles :

* consulter le Dashboard ;
* consulter commandes ;
* consulter paiements ;
* gérer inventaire ;
* gérer lots ;
* gérer incidents ;
* consulter logs ;
* lancer certaines opérations de récupération ;
* gérer les paramètres métier autorisés.

## 6.2 Futurs rôles

L'architecture doit permettre ultérieurement :

```text
SUPER_ADMIN
ADMIN
OPERATOR
READ_ONLY
TECHNICIAN
```

Mais ces rôles ne doivent pas nécessairement être implémentés intégralement dans le MVP.

---

# 7. Authentification

Le Dashboard doit être inaccessible publiquement.

Flux :

```text
/admin/login
       │
       ▼
Authentification
       │
       ├── Échec ──► message générique
       │
       ▼
Session sécurisée
       │
       ▼
/admin
```

---

# 8. Sécurité de l'authentification

Le système doit prévoir :

* mots de passe hashés par le système d'authentification ;
* sessions sécurisées ;
* cookies `HttpOnly` lorsque pertinents ;
* `Secure` en production ;
* protection CSRF selon architecture ;
* expiration de session ;
* limitation des tentatives ;
* déconnexion explicite ;
* journalisation des connexions administratives ;
* contrôle d'autorisation côté serveur.

Le frontend ne doit jamais être considéré comme une frontière de sécurité.

---

# 9. MFA

Le Dashboard doit être architecturé pour supporter ultérieurement une authentification multifacteur.

Si le système d'authentification utilisé permet facilement la MFA, celle-ci doit être privilégiée pour le compte administrateur principal.

La décision d'activation obligatoire appartient à la phase de déploiement et de sécurité.

---

# 10. Architecture du Dashboard

Architecture logique :

```text
Admin Browser
     │
     │ HTTPS
     ▼
Admin Frontend
     │
     │ authenticated API
     ▼
Backend API
     │
     ├── Orders
     ├── Payments
     ├── Tickets
     ├── Batches
     ├── Incidents
     ├── Audit
     ├── Plans
     └── Infrastructure
```

Le frontend ne doit jamais contenir de secrets serveur.

---

# 11. Navigation principale

Le Dashboard doit utiliser une navigation claire.

Structure recommandée :

```text
Dashboard
│
├── Vue générale
│
├── Ventes
│   ├── Commandes
│   └── Paiements
│
├── Tickets
│   ├── Inventaire
│   └── Lots
│
├── Incidents
│
├── Système
│   ├── Connector
│   ├── MikroTik
│   └── Synchronisation
│
├── Journal
│
└── Paramètres
```

Le menu exact pourra être adapté lors de l'implémentation UX, mais la séparation fonctionnelle doit rester intacte.

---

# 12. Dashboard — Vue générale

La page principale `/admin` doit permettre une lecture rapide de la situation.

## 12.1 Indicateurs principaux

Afficher notamment :

### Aujourd'hui

* chiffre d'affaires ;
* nombre de ventes ;
* nombre de paiements confirmés ;
* nombre de tickets délivrés.

### Inventaire

* tickets disponibles ;
* tickets réservés ;
* tickets vendus ;
* tickets proches de l'épuisement.

### Système

* Connector : `ONLINE / OFFLINE / UNKNOWN`
* synchronisation : `HEALTHY / WARNING / ERROR`
* incidents ouverts.

---

# 13. Règle importante concernant les statistiques

Les chiffres doivent provenir du backend.

Le frontend ne doit pas reconstruire :

```text
revenu = nombre de tickets × prix
```

si cette information peut être obtenue depuis les commandes/paiements réels.

Le Dashboard doit utiliser les données métier persistées.

---

# 14. Widgets principaux

La page Dashboard peut comporter :

```text
┌─────────────────────────────────────────┐
│ CA aujourd'hui                          │
├─────────────────────────────────────────┤
│ Ventes       Paiements       Tickets    │
└─────────────────────────────────────────┘

┌──────────────────┐ ┌──────────────────┐
│ Inventaire       │ │ Système          │
│                  │ │                  │
│ 125 disponibles  │ │ Connector ONLINE │
└──────────────────┘ └──────────────────┘

┌─────────────────────────────────────────┐
│ Activité récente                        │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│ Incidents nécessitant attention         │
└─────────────────────────────────────────┘
```

---

# 15. Activité récente

Afficher les événements importants :

* nouvelle vente ;
* paiement confirmé ;
* ticket délivré ;
* ticket réservé ;
* incident créé ;
* synchronisation échouée ;
* opération administrative.

Chaque événement doit pouvoir conduire vers la ressource concernée.

---

# 16. Ventes

Route logique :

```text
/admin/orders
```

Cette section permet de consulter les commandes.

---

# 17. Liste des commandes

Colonnes recommandées :

| Champ                | Description            |
| -------------------- | ---------------------- |
| Référence            | référence publique     |
| Plan                 | formule achetée        |
| Montant              | montant de la commande |
| Paiement             | état du paiement       |
| Commande             | état global            |
| Ticket               | état de délivrance     |
| Création             | date                   |
| Dernière mise à jour | date                   |

---

# 18. Filtres des commandes

Prévoir :

* date ;
* plan ;
* statut ;
* paiement ;
* ticket ;
* référence.

Recherche par référence publique.

---

# 19. Détail d'une commande

Route :

```text
/admin/orders/:id
```

Afficher :

### Commande

* référence ;
* plan ;
* prix ;
* date ;
* statut.

### Paiement

* fournisseur ;
* référence fournisseur ;
* méthode ;
* montant ;
* statut ;
* timestamps.

### Ticket

* état ;
* référence interne ;
* lot ;
* délivrance ;
* utilisation lorsque disponible.

### Historique

Afficher la chronologie :

```text
Commande créée
      ↓
Paiement initié
      ↓
Paiement confirmé
      ↓
Ticket attribué
      ↓
Ticket délivré
      ↓
Ticket utilisé
```

---

# 20. Protection des données sensibles

Le Dashboard ne doit pas afficher inutilement :

* secrets API ;
* signatures webhook ;
* tokens ;
* credentials MikroTik ;
* mots de passe techniques.

Concernant le ticket :

> L'administrateur ne doit voir le secret du ticket que lorsque cette information est réellement nécessaire à une opération autorisée.

Les données sensibles doivent être masquées par défaut.

---

# 21. Paiements

Route :

```text
/admin/payments
```

Cette section permet de suivre les paiements indépendamment des commandes.

---

# 22. Liste des paiements

Informations :

* référence paiement interne ;
* référence fournisseur ;
* commande ;
* montant ;
* devise ;
* opérateur ;
* fournisseur ;
* statut ;
* date ;
* dernière mise à jour.

---

# 23. États des paiements

Les états doivent respecter le modèle défini précédemment :

```text
INITIATED
PENDING
APPROVED
DECLINED
CANCELLED
REFUNDED
TRANSFERRED
```

Le frontend doit présenter ces états avec des libellés compréhensibles.

---

# 24. Ne jamais modifier manuellement un paiement arbitrairement

Le Dashboard ne doit pas fournir un bouton :

> « Marquer comme payé »

qui permettrait à un utilisateur administratif de contourner le système de paiement.

Une éventuelle procédure de correction doit être :

* explicitement définie ;
* autorisée ;
* auditée ;
* protégée ;
* exceptionnelle.

---

# 25. Inventaire des tickets

Route :

```text
/admin/tickets
```

Le Dashboard doit permettre de visualiser l'inventaire.

---

# 26. États des tickets

Le modèle de référence est :

```text
AVAILABLE
   ↓
RESERVED
   ↓
ASSIGNED
   ↓
DELIVERED
   ↓
USED
```

États complémentaires :

```text
EXPIRED
CANCELLED
```

---

# 27. Informations affichées

Pour chaque ticket :

* identifiant interne ;
* code/username masqué si nécessaire ;
* plan ;
* lot ;
* destination ;
* état ;
* commande associée ;
* date de création ;
* date de réservation ;
* date de délivrance ;
* date d'utilisation si connue ;
* référence MikroTik lorsque disponible.

---

# 28. Distinction DIGITAL / PHYSICAL

Cette distinction est obligatoire.

Chaque lot doit posséder une destination :

```text
DIGITAL
PHYSICAL
```

Le système ne doit jamais attribuer automatiquement un ticket provenant d'un lot `PHYSICAL` à une vente numérique.

---

# 29. Lots de tickets

Route :

```text
/admin/tickets/batches
```

Le concept de lot est essentiel à l'exploitation.

Un lot représente un ensemble de tickets générés ensemble et possédant des caractéristiques communes.

---

# 30. Données d'un lot

Chaque lot doit pouvoir contenir :

```text
batch_id
plan_id
quantity
destination
generation_source
generation_date
status
available_count
reserved_count
assigned_count
delivered_count
used_count
expired_count
```

---

# 31. Origine des lots

Pour le MVP :

```text
Mikmon
   ↓
Génération
   ↓
Lot
   ↓
Import / association
   ↓
Backend
```

Mikmon reste l'outil de génération.

Le Dashboard devient l'outil de gestion d'inventaire.

---

# 32. Statut d'un lot

Exemple :

```text
CREATED
IMPORTED
ACTIVE
DEPLETED
ARCHIVED
```

Le statut exact pourra être affiné lors de l'implémentation.

---

# 33. Import de tickets

Le Dashboard peut prévoir une fonctionnalité :

> Importer un lot de tickets

Cette fonctionnalité doit être traitée comme une opération sensible.

Avant import :

* validation du format ;
* validation du plan ;
* validation de la quantité ;
* détection des doublons ;
* validation des codes ;
* validation de la destination ;
* prévisualisation.

Puis :

```text
Preview
   ↓
Validation
   ↓
Import transactionnel
   ↓
Résultat
```

---

# 34. Aucun import partiel silencieux

Si 500 tickets sont importés et que 17 sont invalides, le système ne doit pas simplement importer 483 sans explication.

Il doit fournir un résultat explicite :

```text
500 lignes analysées
483 valides
17 invalides

Import non effectué
```

ou, si l'import partiel est explicitement autorisé :

```text
483 importés
17 rejetés
```

avec audit complet.

---

# 35. Plans commerciaux

Route :

```text
/admin/plans
```

Le Dashboard peut permettre la consultation des plans commerciaux.

Source de vérité actuelle :

> **CORRECTION IMP-08 (17/09/2026)** : grille erronée (« Grille B ») remplacée par la
> **Grille A officielle** (décision propriétaire docs 03/05, confirmée audit 16/09/2026).
> Aucune offre 5 000 FCFA.

|       Prix | Accès (cumulatif) | Validité |
| ---------: | ----------------: | -------: |
|   100 FCFA |          5 heures |    24 h |
|   200 FCFA |         12 heures |    24 h |
|   300 FCFA |         24 heures |    48 h |
|   500 FCFA |         72 heures |     5 j |
| 1 000 FCFA |         1 semaine |    10 j |
| 4 000 FCFA |            1 mois |    40 j |

Ces valeurs sont les références commerciales.

---

# 36. Attention aux profils MikroTik

La configuration MikroTik actuellement observée présentait des divergences apparentes :

* 500 FCFA → profil observé `72-HEURES`, alors que le tarif commercial est 48 heures ;
* 1 000 FCFA → profil observé `1-SEMAINE`, alors que le tarif commercial est 5 jours ;
* certains profils techniques/commerciaux observés ne correspondent pas exactement au catalogue actuel.

> **CORRECTION IMP-08 (17/09/2026, audit du 16/09)** : ces « divergences » étaient des erreurs
> de la Grille B documentaire. Le routeur applique la Grille A exacte (accès = limit-uptime :
> 500 F → 72 h, 1 000 F → 7 j ; validité = moniteurs : 5 j, 10 j). Profils legacy hors Grille A
> documentés : `1-HEURE` (50 F, 0 user) et `Admin-free` (gratuit illimité, inventaire à figer
> en IMP-35). La règle ci-dessous reste valable par principe.

Le Dashboard ne doit donc jamais déduire la durée commerciale à partir du nom d'un profil MikroTik.

La relation correcte est :

```text
PLAN COMMERCIAL
      │
      ├── prix
      ├── durée officielle
      │
      └── mapping technique MikroTik
```

---

# 37. Modification des plans

Une modification d'un plan doit être considérée comme une opération critique.

Exemple :

```text
500 FCFA
72 h
```

(valeur officielle Grille A) ne doit pas être modifié accidentellement en :

```text
500 FCFA
48 h
```

(ancienne valeur erronée de la Grille B) sans confirmation.

> **CORRECTION IMP-08 (17/09/2026)** : exemple inversé pour refléter la Grille A officielle.

---

# 38. Versionnement du catalogue

L'architecture doit permettre de conserver l'historique des changements.

Une commande existante doit conserver son :

```text
price_snapshot
duration_snapshot
```

afin qu'une modification ultérieure du plan ne modifie pas rétroactivement l'historique commercial.

---

# 39. Incidents

Route :

```text
/admin/incidents
```

Cette section est essentielle.

Elle constitue le centre de récupération opérationnelle.

---

# 40. Exemple critique

Cas :

```text
Client
  ↓
Paiement
  ↓
Provider confirme
  ↓
Backend reçoit confirmation
  ↓
Ticket non disponible
```

Le système ne doit jamais demander au client de payer une deuxième fois.

Le résultat doit être :

```text
PAYMENT = APPROVED
ORDER = PAID
TICKET = ALLOCATION_FAILED
INCIDENT = OPEN
```

---

# 41. Types d'incidents

Prévoir au minimum :

```text
PAYMENT_CONFIRMATION_ERROR
TICKET_ALLOCATION_ERROR
TICKET_DELIVERY_ERROR
MIKROTIK_SYNC_ERROR
CONNECTOR_OFFLINE
WEBHOOK_ERROR
INVENTORY_ERROR
SYSTEM_ERROR
```

---

# 42. Priorité des incidents

Niveaux :

```text
LOW
MEDIUM
HIGH
CRITICAL
```

Exemple :

### LOW

Erreur non bloquante.

### MEDIUM

Opération nécessitant une vérification.

### HIGH

Vente ou opération affectée.

### CRITICAL

Argent client confirmé mais service non délivré.

---

# 43. Cycle de vie d'un incident

```text
OPEN
  ↓
ACKNOWLEDGED
  ↓
INVESTIGATING
  ↓
RESOLVED
```

Possibilité :

```text
REOPENED
```

---

# 44. Fiche incident

Chaque incident doit afficher :

* ID ;
* type ;
* priorité ;
* statut ;
* commande ;
* paiement ;
* ticket ;
* Connector ;
* erreur technique ;
* date ;
* dernière tentative ;
* nombre de tentatives ;
* action recommandée ;
* historique.

---

# 45. Actions de récupération

Selon le type d'incident, le Dashboard pourra proposer :

```text
Retry
Reallocate
Resync
Mark resolved
Open details
```

Mais :

> aucune action de récupération ne doit contourner les invariants métier.

---

# 46. Exemple de récupération

Paiement confirmé + allocation échouée :

```text
Retry allocation
      ↓
transaction backend
      ↓
ticket disponible ?
      │
      ├── Oui → allocation
      │
      └── Non → incident reste ouvert
```

Jamais :

```text
nouveau paiement
```

---

# 47. Système / Connector

Route :

```text
/admin/system
```

Cette section permet de surveiller le système local.

---

# 48. État du Connector

Afficher :

```text
ONLINE
OFFLINE
UNKNOWN
```

Informations utiles :

* dernière communication ;
* version du Connector ;
* dernière synchronisation ;
* dernière erreur ;
* nombre d'opérations en attente.

---

# 49. Heartbeat

Le Connector doit envoyer périodiquement un signal au backend.

Concept :

```text
Connector
    │
    │ heartbeat
    ▼
Backend
```

Le Dashboard affiche ensuite :

```text
Dernier contact :
il y a 18 secondes
```

ou :

```text
Dernier contact :
il y a 27 minutes
⚠ Connector probablement hors ligne
```

---

# 50. Synchronisation MikroTik

Afficher :

* état ;
* dernière synchronisation ;
* opérations en attente ;
* opérations réussies ;
* opérations échouées ;
* dernière erreur.

---

# 51. Ne pas exposer MikroTik directement

Le Dashboard ne doit jamais afficher une fonctionnalité du type :

```text
Connect to MikroTik
IP: 192.168...
Username: admin
Password: ...
```

Le système doit masquer complètement cette couche.

Architecture :

```text
Dashboard
   ↓
Backend
   ↓
Connector
   ↓
MikroTik
```

---

# 52. Vue MikroTik

Le Dashboard peut afficher uniquement des informations d'exploitation nécessaires :

```text
MikroTik
────────────────────
Model: RB951Ui-2HnD
RouterOS: 6.49.17
Status: ONLINE
Last sync: ...
```

Il ne doit pas devenir un WinBox/WebFig alternatif.

---

# 53. Journal d'audit

Route :

```text
/admin/audit
```

Le journal doit exploiter le modèle :

```text
audit_logs
```

---

# 54. Actions auditées

Exemples :

```text
ADMIN_LOGIN
ADMIN_LOGOUT

PLAN_UPDATED

BATCH_CREATED
BATCH_IMPORTED
BATCH_ARCHIVED

TICKET_RESERVED
TICKET_RELEASED

INCIDENT_CREATED
INCIDENT_RESOLVED
INCIDENT_REOPENED

SYNC_RETRIED

SETTING_UPDATED
```

---

# 55. Structure d'un audit log

```text
actor
action
entity_type
entity_id
metadata
ip
user_agent
created_at
```

Les logs doivent être append-only autant que possible.

---

# 56. Recherche dans les logs

Prévoir :

* période ;
* utilisateur ;
* action ;
* entité ;
* référence.

---

# 57. Paramètres

Route :

```text
/admin/settings
```

Les paramètres doivent être divisés par catégories.

```text
Business
Payment
Tickets
System
Security
```

---

# 58. Paramètres métier

Exemples :

* plans actifs ;
* ordre d'affichage ;
* disponibilité commerciale.

Les prix ne doivent être modifiables que via une opération administrative protégée.

---

# 59. Paramètres système

Ne pas exposer inutilement :

* secrets ;
* credentials ;
* clés privées ;
* tokens.

Les secrets doivent être gérés par l'environnement serveur ou un système sécurisé approprié.

---

# 60. États UX obligatoires

Le Dashboard doit respecter le système d'états global :

```text
Loading
Loaded
Empty
Error
Success
Disabled
Offline
```

---

# 61. État Loading

Les pages importantes doivent afficher un état de chargement compréhensible.

Éviter les écrans blancs.

---

# 62. État Empty

Exemple :

```text
Aucun incident ouvert

Le système ne signale actuellement
aucun incident nécessitant votre attention.
```

---

# 63. État Error

Exemple :

```text
Impossible de charger les commandes.

Réessayer
```

Ne jamais afficher directement une stack trace à l'administrateur.

---

# 64. État Offline

Particulièrement important pour :

* Connector ;
* synchronisation ;
* MikroTik.

Exemple :

```text
Connector hors ligne

Dernière communication :
il y a 18 minutes.

Les opérations dépendantes de MikroTik
peuvent être retardées.
```

---

# 65. Responsive design

Le Dashboard doit être utilisable :

* ordinateur ;
* tablette ;
* mobile.

Cependant, contrairement au portail client, l'interface admin peut privilégier le desktop.

Priorité :

```text
Desktop
Tablet
Mobile
```

Le mobile doit rester fonctionnel pour permettre à la mère de vérifier :

* ventes ;
* paiements ;
* inventaire ;
* incidents.

---

# 66. UX pour l'administratrice non technique

L'interface doit éviter les termes techniques inutiles.

Par exemple :

Au lieu de :

```text
payment_event.status = APPROVED
```

afficher :

```text
Paiement confirmé
```

Au lieu de :

```text
mikrotik_sync FAILED
```

afficher :

```text
Synchronisation réseau échouée
```

Les détails techniques restent accessibles dans une section secondaire.

---

# 67. Confirmation des actions sensibles

Les opérations irréversibles ou importantes doivent demander confirmation.

Exemple :

```text
Archiver ce lot ?

125 tickets encore disponibles
```

L'interface doit afficher les conséquences.

---

# 68. Protection contre les doubles actions

Les boutons sensibles doivent être désactivés pendant l'exécution :

```text
Retrying...
```

afin d'éviter :

```text
double retry
double allocation
double import
```

Le backend doit néanmoins rester la véritable protection grâce à l'idempotence.

---

# 69. API du Dashboard

Le Dashboard doit communiquer avec une API backend structurée.

Exemples conceptuels :

```http
GET /api/admin/dashboard
GET /api/admin/orders
GET /api/admin/orders/:id
GET /api/admin/payments
GET /api/admin/tickets
GET /api/admin/ticket-batches
GET /api/admin/incidents
GET /api/admin/audit-logs
GET /api/admin/system/status
GET /api/admin/plans
```

Actions :

```http
POST /api/admin/ticket-batches
POST /api/admin/ticket-batches/import
POST /api/admin/incidents/:id/retry
POST /api/admin/incidents/:id/resolve
PATCH /api/admin/plans/:id
```

Les routes définitives seront arrêtées pendant l'implémentation backend.

---

# 70. Autorisation serveur

Chaque endpoint `/admin/*` doit effectuer :

```text
Authentication
      ↓
Authorization
      ↓
Validation
      ↓
Business rule
      ↓
Database transaction
      ↓
Audit
```

Jamais :

```text
Frontend says "I'm admin"
        ↓
Backend trusts it
```

---

# 71. Pagination

Les listes importantes doivent être paginées :

* commandes ;
* paiements ;
* tickets ;
* lots ;
* incidents ;
* audit logs.

Ne jamais charger tout l'historique en une seule requête.

---

# 72. Filtres côté serveur

Les recherches doivent être exécutées côté backend lorsque les volumes deviennent importants.

Exemple :

```text
GET /orders?
status=PAID&
plan=500&
from=...&
to=...
```

---

# 73. Performance

Le Dashboard doit éviter :

* requêtes répétitives ;
* appels API inutiles ;
* polling agressif ;
* téléchargement massif ;
* recalcul frontend de statistiques lourdes.

Les données peuvent être mises en cache lorsque cela est pertinent.

---

# 74. Actualisation

Pour les informations sensibles :

* paiements ;
* incidents ;
* Connector ;

prévoir une actualisation raisonnablement fréquente.

Une architecture temps réel pourra être utilisée si elle est déjà disponible dans le backend, mais elle n'est pas obligatoire pour le MVP.

---

# 75. Sécurité des tickets

Le Dashboard constitue une surface particulièrement sensible.

Un administrateur qui obtient un ticket valide peut potentiellement fournir un accès Wi-Fi.

Il faut donc :

* contrôler les permissions ;
* journaliser les accès ;
* masquer les secrets ;
* éviter les exports non nécessaires ;
* limiter les données visibles.

---

# 76. Export

Les exports doivent être limités aux besoins opérationnels.

Exemples possibles :

```text
CSV commandes
CSV ventes
CSV inventaire
```

Les exports de tickets doivent être considérés comme particulièrement sensibles.

---

# 77. Principe de moindre privilège

Le Dashboard doit respecter :

```text
Voir ≠ Modifier
Modifier ≠ Administrer
Administrer ≠ Accéder aux secrets
```

Chaque action doit être explicitement autorisée.

---

# 78. Relation avec MikroTik

Le Dashboard ne doit pas :

* modifier directement `/ip hotspot user` ;
* modifier directement les profiles ;
* modifier le firewall ;
* modifier NAT ;
* modifier DHCP ;
* modifier DNS ;
* modifier les scripts existants.

Toute opération MikroTik passe par :

```text
Backend
   ↓
Connector
   ↓
RouterOS API/API-SSL
```

---

# 79. Respect du système MikroTik existant

Le Dashboard doit préserver les éléments existants identifiés durant la Phase 6 :

* HotSpot ;
* DHCP ;
* NAT ;
* firewall ;
* mangle ;
* authentification ;
* scripts On-Login ;
* Mikmon ;
* profils ;
* mécanisme username=password.

Aucune modification automatique ne doit être introduite simplement parce qu'une interface admin existe.

---

# 80. Gestion des erreurs de synchronisation

Exemple :

```text
Ticket backend = DELIVERED
MikroTik sync = FAILED
```

Le Dashboard doit rendre cette divergence visible.

Il ne doit pas modifier artificiellement l'état métier pour cacher l'erreur.

---

# 81. Principe de cohérence des états

Les trois couches peuvent avoir des états différents :

```text
Backend
Ticket = DELIVERED

Connector
Sync = FAILED

MikroTik
User = UNKNOWN
```

Le Dashboard doit montrer cette situation explicitement.

Exemple :

> Ticket délivré au client, mais synchronisation réseau non confirmée.

---

# 82. Incident critique de cohérence

Un système de production doit pouvoir identifier :

```text
PAYMENT APPROVED
        +
TICKET NOT DELIVERED
```

comme une anomalie prioritaire.

Cette situation doit être visible depuis le Dashboard.

---

# 83. Dashboard de santé

Une section synthétique peut afficher :

```text
APPLICATION       ● Healthy
DATABASE          ● Healthy
PAYMENT PROVIDER  ● Healthy
CONNECTOR         ● Healthy
MIKROTIK          ● Healthy
```

avec :

```text
● Healthy
● Warning
● Error
● Unknown
```

---

# 84. Architecture de récupération

Le Dashboard n'est pas seulement un outil de visualisation.

Il doit permettre au système de revenir vers un état cohérent.

Exemple :

```text
Erreur
 ↓
Incident
 ↓
Diagnostic
 ↓
Retry
 ↓
Succès
 ↓
Incident resolved
```

---

# 85. Notifications

Le Dashboard peut afficher :

* alertes ;
* badges ;
* notifications internes.

Priorité aux événements opérationnels importants.

Exemple :

```text
⚠ 3 tickets de 500 FCFA restants
```

ou :

```text
🔴 1 paiement confirmé sans ticket délivré
```

---

# 86. Pas de surcharge visuelle

Le Dashboard doit respecter le principe :

> Information opérationnelle avant décoration.

Les animations et effets visuels doivent rester secondaires.

La priorité est :

```text
Comprendre
→ décider
→ agir
```

---

# 87. Design System

Le Dashboard doit réutiliser le Design System global du projet.

Il doit respecter :

* tokens ;
* typographie ;
* spacing ;
* composants ;
* états ;
* responsive ;
* accessibilité ;
* focus states ;
* reduced motion.

Il ne doit pas créer arbitrairement un deuxième langage visuel.

---

# 88. Accessibilité

Prévoir notamment :

* contraste suffisant ;
* navigation clavier ;
* focus visible ;
* labels explicites ;
* boutons compréhensibles ;
* messages d'erreur accessibles ;
* tableaux lisibles ;
* alternatives aux couleurs seules.

---

# 89. Architecture des composants

Organisation conceptuelle :

```text
AdminLayout
├── AdminSidebar
├── AdminHeader
├── AdminBreadcrumbs
└── AdminContent

Dashboard
├── KPIGrid
├── RevenueCard
├── InventoryCard
├── SystemHealthCard
├── RecentActivity
└── IncidentSummary

Orders
├── OrdersTable
├── OrderFilters
└── OrderDetails

Tickets
├── TicketTable
├── TicketFilters
├── BatchTable
└── BatchDetails

Incidents
├── IncidentTable
├── IncidentFilters
└── IncidentDetails
```

---

# 90. Séparation des responsabilités

Le frontend doit séparer :

```text
UI
API client
State management
Validation UI
Formatting
```

Le backend conserve :

```text
Business logic
Authorization
Transactions
Persistence
Integrations
Audit
```

---

# 91. Gestion des états frontend

Chaque écran doit explicitement gérer :

```text
loading
success
empty
error
mutating
disabled
offline
```

Éviter les composants qui supposent que les données existent toujours.

---

# 92. Journalisation technique

Les erreurs techniques doivent être journalisées côté serveur.

Le Dashboard présente une version adaptée à l'administrateur.

Exemple :

```text
Utilisateur :
Impossible de synchroniser le ticket.

Détails techniques :
Connector timeout after 10s
```

---

# 93. Aucun secret dans les logs

Ne jamais écrire dans les logs :

* mots de passe ;
* tokens ;
* clés API ;
* secrets webhook ;
* credentials MikroTik ;
* données sensibles inutiles.

---

# 94. Protection contre l'énumération

Les endpoints admin doivent également éviter de révéler inutilement des informations lorsqu'un ID n'existe pas ou n'est pas accessible.

---

# 95. Rate limiting

Prévoir du rate limiting sur :

* login ;
* recherche ;
* actions administratives sensibles ;
* retry ;
* import ;
* endpoints à fort coût.

---

# 96. Audit des opérations sensibles

Au minimum :

```text
Qui ?
Quoi ?
Quand ?
Sur quoi ?
Résultat ?
```

doit être enregistré.

---

# 97. Transactionnalité

Les actions comme l'import d'un lot ou l'allocation d'un ticket doivent utiliser des transactions lorsque nécessaire.

Exemple :

```text
Créer allocation
+
mettre ticket RESERVED
+
associer commande
```

doit être atomique.

---

# 98. Idempotence

Une opération administrative pouvant être répétée doit être conçue pour éviter les doublons.

Exemple :

```text
Retry allocation
Retry allocation
Retry allocation
```

ne doit jamais produire trois tickets différents pour une seule commande.

---

# 99. Règles métier incontournables

Le Dashboard ne doit jamais permettre de violer les invariants suivants :

### Règle 1

Une commande payée ne peut pas être recréditée simplement par modification frontend.

### Règle 2

Un ticket ne peut être vendu deux fois.

### Règle 3

Un ticket `PHYSICAL` ne peut pas être alloué automatiquement à une vente `DIGITAL`.

### Règle 4

Une commande ne doit pas recevoir plusieurs tickets actifs sans justification métier.

### Règle 5

Un paiement confirmé ne doit pas être oublié parce qu'une étape ultérieure échoue.

### Règle 6

Une erreur MikroTik ne doit pas être masquée.

### Règle 7

Une opération administrative sensible doit être auditée.

---

# 100. Séquence globale d'une vente

Le Dashboard doit permettre de reconstruire :

```text
Client
  ↓
Commande
  ↓
Paiement
  ↓
Confirmation
  ↓
Allocation
  ↓
Délivrance
  ↓
Utilisation
```

Chaque étape doit être traçable.

---

# 101. Séquence d'un incident

```text
Événement
   ↓
Détection
   ↓
Incident
   ↓
Dashboard
   ↓
Diagnostic
   ↓
Action
   ↓
Retry / correction
   ↓
Résolution
```

---

# 102. Architecture de données utilisée

Le Dashboard exploitera principalement :

```text
plans
customers
tickets
ticket_batches
orders
payments
payment_events
audit_logs
mikrotik_sync
incidents
```

Le Dashboard ne doit pas créer de modèle parallèle équivalent.

---

# 103. Relations principales

```text
PLAN
 │
 ├───────────────┐
 ▼               ▼
TICKET          ORDER
 │               │
 │               ▼
 │            PAYMENT
 │
 ▼
TICKET_BATCH

ORDER
 │
 ▼
MIKROTIK_SYNC

SYSTEM EVENT
 │
 ▼
INCIDENT

ADMIN ACTION
 │
 ▼
AUDIT_LOG
```

---

# 104. Gestion du stock

Le stock disponible doit être calculé à partir de l'état réel des tickets.

Conceptuellement :

```text
AVAILABLE tickets
```

et non :

```text
quantity_generated - quantity_sold
```

si des réservations, expirations ou annulations existent.

---

# 105. Réservations expirées

Le Dashboard doit pouvoir signaler les réservations expirées.

Exemple :

```text
Ticket RESERVED
      ↓
reservation_expires_at dépassé
      ↓
Ticket → AVAILABLE
```

Cette opération doit être exécutée par le backend, pas par le navigateur.

---

# 106. Tickets épuisés

Lorsqu'un plan atteint :

```text
AVAILABLE = 0
```

le Dashboard doit le signaler.

Le portail public pourra ensuite désactiver l'achat de ce plan selon les règles définies dans `08_WEB_APPLICATION.md`.

---

# 107. Cohérence catalogue ↔ inventaire

Le Dashboard doit permettre de voir :

```text
Plan
Prix
Durée
Tickets disponibles
Tickets réservés
Tickets vendus
```

sur une même vue lorsque cela facilite la décision.

---

# 108. Exploitation quotidienne

La mère doit pouvoir ouvrir le Dashboard et répondre rapidement à :

1. Combien ai-je vendu aujourd'hui ?
2. Combien ai-je encaissé ?
3. Quels plans se vendent ?
4. Combien de tickets numériques restent ?
5. Y a-t-il un problème ?
6. Le système fonctionne-t-il ?

C'est le principal objectif UX du Dashboard.

---

# 109. Vue mobile simplifiée

Sur mobile, la priorité doit être :

```text
CA
Ventes
Tickets disponibles
Incidents
État système
```

Les fonctions secondaires peuvent être accessibles dans des écrans dédiés.

---

# 110. Ce que le Dashboard ne doit pas faire

Le Dashboard ne doit pas devenir :

> « un panneau de contrôle technique complet du MikroTik ».

Il doit rester :

> **un panneau de pilotage du service Wi-Fi et de son système de vente.**

---

# 111. Dépendance avec la Phase 7

La Phase 7 définit principalement :

```text
Client
 ↓
Catalogue
 ↓
Commande
 ↓
Paiement
 ↓
Confirmation
 ↓
Ticket
```

La Phase 8 ajoute :

```text
Administrateur
 ↓
Surveillance
 ↓
Gestion
 ↓
Diagnostic
 ↓
Récupération
```

Les deux utilisent le même backend.

---

# 112. Contrat entre Phase 7 et Phase 8

Le backend doit fournir une séparation logique :

```text
PUBLIC API
/api/...

ADMIN API
/api/admin/...
```

Les données peuvent partager les mêmes modèles, mais les permissions et usages diffèrent.

---

# 113. Aucun contournement de l'API publique

L'administrateur ne doit pas utiliser les mêmes endpoints que le client avec simplement une interface différente.

Exemple incorrect :

```text
POST /api/order
```

avec un champ :

```json
{
  "isAdmin": true
}
```

L'autorisation doit être déterminée par la session et les permissions serveur.

---

# 114. Observabilité

Le Dashboard doit progressivement devenir une surface d'observabilité métier.

Trois dimensions :

```text
BUSINESS
  ventes / paiements / tickets

TECHNICAL
  connector / sync / MikroTik

RELIABILITY
  incidents / retries / erreurs
```

---

# 115. Critères d'acceptation fonctionnels

La Phase 8 est considérée fonctionnellement complète lorsque l'administrateur peut :

### Auth

* se connecter ;
* se déconnecter ;
* accéder uniquement aux routes autorisées.

### Dashboard

* consulter les KPI ;
* voir les incidents ;
* voir l'état système.

### Commandes

* rechercher une commande ;
* filtrer ;
* consulter son détail.

### Paiements

* consulter les paiements ;
* voir leur statut ;
* accéder au paiement associé à une commande.

### Tickets

* consulter l'inventaire ;
* filtrer les tickets ;
* consulter les lots.

### Lots

* créer/importer selon le workflow défini ;
* distinguer DIGITAL et PHYSICAL ;
* voir les quantités.

### Incidents

* consulter ;
* filtrer ;
* voir les détails ;
* lancer les actions autorisées ;
* résoudre un incident.

### Système

* voir l'état du Connector ;
* voir la dernière synchronisation ;
* détecter un Connector hors ligne.

### Audit

* consulter les opérations administratives.

---

# 116. Critères d'acceptation de sécurité

Le Dashboard est considéré conforme lorsque :

* aucune route admin n'est accessible sans authentification ;
* l'autorisation est vérifiée côté serveur ;
* aucun secret MikroTik n'est envoyé au navigateur ;
* aucun secret de paiement n'est exposé ;
* les actions sensibles sont auditées ;
* les tickets sensibles sont protégés ;
* le rate limiting est présent sur les surfaces sensibles ;
* les erreurs internes ne sont pas exposées directement ;
* les actions critiques sont idempotentes.

---

# 117. Critères d'acceptation de cohérence

Le système doit démontrer les scénarios suivants.

### Scénario A — paiement réussi

```text
Payment APPROVED
→ Order PAID
→ Ticket ALLOCATED
→ Ticket DELIVERED
```

### Scénario B — paiement refusé

```text
Payment DECLINED
→ Order FAILED
→ aucun ticket vendu
```

### Scénario C — paiement réussi mais ticket indisponible

```text
Payment APPROVED
→ Order PAID
→ Allocation FAILED
→ Incident OPEN
```

### Scénario D — Connector hors ligne

```text
Connector OFFLINE
→ opération sync pending
→ incident/warning
```

### Scénario E — ticket physique

```text
PHYSICAL batch
→ ticket jamais sélectionné
→ DIGITAL order
```

---

# 118. Tests à prévoir

## Tests unitaires

* calcul KPI ;
* filtrage ;
* autorisation ;
* transitions d'état ;
* validation import ;
* permissions.

## Tests d'intégration

* Admin API ↔ database ;
* commandes ↔ paiements ;
* tickets ↔ lots ;
* incidents ↔ synchronisation.

## Tests E2E

```text
Login
→ Dashboard
→ Order
→ Payment
→ Ticket
→ Incident
→ Retry
```

---

# 119. Tests de sécurité

Tester notamment :

* accès non authentifié ;
* accès avec rôle insuffisant ;
* IDOR ;
* modification d'ID dans URL ;
* double soumission ;
* replay d'une action ;
* injection ;
* rate limiting ;
* fuite de secrets ;
* export non autorisé.

---

# 120. Tests de résilience

Simuler :

* backend indisponible ;
* database indisponible ;
* Connector hors ligne ;
* MikroTik indisponible ;
* paiement confirmé avec backend retardé ;
* webhook dupliqué ;
* allocation répétée ;
* stock épuisé.

---

# 121. Déploiement

Le Dashboard est une application web privée.

Architecture :

```text
Browser
   │
 HTTPS
   ▼
Frontend
   │
 HTTPS
   ▼
Backend
   │
 ├── Database
 ├── Payment provider
 └── Connector
```

Aucun port MikroTik ne doit être exposé au navigateur.

---

# 122. Environnement

Séparer :

```text
development
staging
production
```

Les secrets ne doivent jamais être commités dans Git.

---

# 123. GitHub

Le dépôt doit conserver :

```text
/docs
   00_PROJECT_CONTEXT/
   01_PRODUCT_REQUIREMENTS/
   ...
   09_ADMIN_DASHBOARD.md
```

Le document présent constitue le contrat de référence de la Phase 8.

---

# 124. Prompt de développement futur

L'agent de développement qui implémentera cette phase devra respecter les règles suivantes :

```text
Tu ne dois pas commencer par coder immédiatement.

Tu dois d'abord analyser :
- 08_WEB_APPLICATION.md
- 07_MIKROTIK_INTEGRATION.md
- 05_DATA_MODEL
- 06_UX_SPECIFICATION
- 09_ADMIN_DASHBOARD.md

Tu dois ensuite vérifier les dépendances backend nécessaires.

Tu dois implémenter le Dashboard par étapes.

Tu ne dois jamais :
- contourner le backend ;
- exposer MikroTik ;
- exposer des secrets ;
- créer une deuxième logique métier ;
- modifier silencieusement les états ;
- inventer des données.

À chaque étape :
1. expliquer ce qui sera réalisé ;
2. implémenter ;
3. tester ;
4. vérifier les invariants ;
5. documenter ;
6. indiquer la prochaine étape.
```

---

# 125. Découpage d'implémentation recommandé

La Phase 8 sera implémentée dans l'ordre suivant.

## Étape 8.1 — Admin foundation

* structure du Dashboard ;
* layout ;
* navigation ;
* authentification ;
* protection des routes ;
* permissions.

## Étape 8.2 — Dashboard Overview

* KPI ;
* activité récente ;
* santé système ;
* incidents.

## Étape 8.3 — Orders & Payments

* commandes ;
* détails ;
* paiements ;
* filtres ;
* recherche.

## Étape 8.4 — Ticket Inventory

* tickets ;
* lots ;
* inventaire ;
* DIGITAL / PHYSICAL.

## Étape 8.5 — Incident Center

* liste ;
* détail ;
* priorités ;
* statuts ;
* actions de récupération.

## Étape 8.6 — System Monitoring

* Connector ;
* synchronisation ;
* état MikroTik ;
* erreurs.

## Étape 8.7 — Audit & Settings

* audit logs ;
* paramètres autorisés ;
* opérations sensibles.

## Étape 8.8 — Security Hardening

* permissions ;
* rate limiting ;
* audit ;
* secrets ;
* protections.

## Étape 8.9 — Tests

* unitaires ;
* intégration ;
* E2E ;
* sécurité ;
* résilience.

## Étape 8.10 — Validation finale

* checklist ;
* correction ;
* documentation ;
* préparation de la phase suivante.

---

# 126. Règle anti-scope-creep

Aucune nouvelle fonctionnalité ne doit être ajoutée au milieu de l'implémentation simplement parce qu'elle semble intéressante.

Toute nouvelle idée doit être classée :

```text
CRITICAL
IMPORTANT
OPTIONAL
FUTURE
```

Seules les fonctionnalités nécessaires au contrat de Phase 8 doivent être implémentées.

---

# 127. Décisions techniques figées

Les décisions suivantes constituent le contrat de Phase 8 :

1. Le Dashboard est une interface privée.
2. Le backend reste la source de vérité.
3. Le navigateur ne communique jamais directement avec MikroTik.
4. Les tickets DIGITAL et PHYSICAL sont séparés.
5. Les paiements ne sont pas modifiables arbitrairement depuis l'interface.
6. Les incidents sont des objets métier à part entière.
7. Les opérations sensibles sont auditées.
8. Les actions doivent être idempotentes.
9. Les secrets ne sont jamais exposés au frontend.
10. Les états backend doivent être respectés.
11. Le Dashboard ne remplace pas WinBox/WebFig.
12. Le Dashboard ne modifie pas directement la configuration réseau.
13. Les plans commerciaux restent indépendants des noms de profils MikroTik.
14. Le catalogue commercial actuel constitue la référence.
15. Les erreurs de synchronisation doivent être visibles et récupérables.
16. L'UX privilégie la compréhension et l'exploitation plutôt que la décoration.

---

# 128. Points restant conditionnels

Les éléments suivants ne doivent pas être inventés avant leur validation technique :

* fournisseur de paiement définitivement contractualisé ;
* méthode exacte d'authentification admin ;
* MFA effectivement activée ;
* endpoints définitifs du backend ;
* technologie exacte du Connector ;
* mécanisme définitif d'import Mikmon ;
* mapping final de chaque plan commercial vers les profils MikroTik ;
* détail de la configuration RADIUS existante.

Ces éléments peuvent être raccordés pendant les phases d'implémentation correspondantes.

---

# 129. Définition de terminé — Phase 8

La Phase 8 sera officiellement terminée lorsque :

```text
                 ┌──────────────────────┐
                 │   ADMIN AUTHENTIFIÉ  │
                 └──────────┬───────────┘
                            ▼
                 ┌──────────────────────┐
                 │      DASHBOARD       │
                 └──────────┬───────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
      Ventes             Tickets            Système
        │                   │                   │
        ▼                   ▼                   ▼
    Paiements             Lots              Connector
        │                   │                   │
        └───────────────────┼───────────────────┘
                            ▼
                       Incidents
                            │
                            ▼
                      Récupération
                            │
                            ▼
                          Audit
```

et que les scénarios critiques de vente, paiement, inventaire et incident ont été testés avec succès.

---

# 130. Conclusion officielle

La Phase 8 transforme l'application Déo Gracias en un système réellement exploitable.

Le portail public permet au client de **acheter un accès**.

Le backend permet au système de **traiter la transaction et gérer l'état métier**.

Le Connector permet au système de **dialoguer avec l'infrastructure locale**.

Le Dashboard permet à l'administrateur de **comprendre, surveiller et récupérer le système**.

La séparation est donc :

```text
CLIENT
   │
   ▼
WEB APPLICATION
   │
   ▼
BACKEND
   │
   ├──────── PAYMENT
   │
   ├──────── DATABASE
   │
   └──────── CONNECTOR
                    │
                    ▼
                 MIKROTIK

ADMIN
   │
   ▼
ADMIN DASHBOARD
   │
   ▼
BACKEND
```

Cette séparation doit être conservée pendant toute l'implémentation.

**Statut du document : `PHASE 8 SPECIFICATION — READY FOR IMPLEMENTATION`**

---

## Prochaine phase

Une fois `09_ADMIN_DASHBOARD.md` validé, la prochaine étape logique sera **la Phase 9 — Security, Reliability & Testing**.

Elle devra prendre comme entrées les quatre briques désormais définies :

**`07_MIKROTIK_INTEGRATION.md` → `08_WEB_APPLICATION.md` → `09_ADMIN_DASHBOARD.md` → Phase 9**

et vérifier le système de bout en bout avant le déploiement.
