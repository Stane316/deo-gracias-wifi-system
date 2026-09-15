# `04_TARGET_ARCHITECTURE.md`

# PHASE 3 — ARCHITECTURE CIBLE DU SYSTÈME

**Projet :** Déo Gracias WiFi Zone — Wi-Fi Access & Payment System
**Version :** 1.0
**Date :** 14 septembre 2026
**Statut :** Architecture cible définie
**Phase :** 3 / 10

---

# 00 — PURPOSE

Ce document définit l'architecture technique cible du système numérique de **Déo Gracias WiFi Zone**.

Il constitue le pont entre :

```text
PHASE 0
Cadrage
        ↓
PHASE 1
Infrastructure existante
        ↓
PHASE 2
Paiement
        ↓
PHASE 3
Architecture cible
        ↓
PHASE 4+
Conception + développement
```

L'objectif n'est pas simplement de construire un site web.

L'objectif est de construire un **système d'accès Wi-Fi automatisé**, capable de relier :

* le client ;
* le portail captif ;
* le paiement ;
* le backend ;
* la base de données ;
* le système de tickets ;
* le MikroTik ;
* l'Internet ;
* l'administration de Déo Gracias ;
* le suivi financier ;
* la sécurité ;
* les mécanismes de récupération en cas d'erreur.

---

# 01 — VISION ARCHITECTURALE

Le système cible doit transformer le fonctionnement actuel :

```text
Client
 ↓
Wi-Fi
 ↓
Portail captif
 ↓
Achat physique
 ↓
Ticket
 ↓
MikroTik
 ↓
Internet
```

en :

```text
Client
 ↓
Wi-Fi Déo Gracias
 ↓
Portail captif
 ↓
Choix d'une offre
 ↓
Commande
 ↓
Paiement
 ↓
Confirmation indépendante
 ↓
Allocation d'un ticket
 ↓
Utilisation du ticket
 ↓
MikroTik
 ↓
Internet
```

Le système doit également continuer à accepter le fonctionnement historique :

```text
Client possède déjà un ticket
        ↓
Entrée du ticket
        ↓
MikroTik
        ↓
Internet
```

Ainsi, le numérique **complète l'infrastructure existante** au lieu de la remplacer brutalement.

---

# 02 — PRINCIPLE ARCHITECTURAL FONDAMENTAL

Le système sera construit autour d'une séparation stricte des responsabilités.

```text
┌─────────────────────────────────────────────┐
│                  CLIENT                     │
│        Portail captif / interface           │
└─────────────────────┬───────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────┐
│                 FRONTEND                    │
│      Interface publique / paiement          │
└─────────────────────┬───────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────┐
│                  BACKEND                    │
│       Autorité métier du système            │
└───────┬──────────────┬──────────────┬───────┘
        │              │              │
        ▼              ▼              ▼
   DATABASE        FEDAPAY        MIKROTIK
        │              │              │
        │              ▼              │
        │          WEBHOOK            │
        │              │              │
        └──────────────┴──────────────┘
```

### Règle absolue

> **Le frontend ne possède aucune autorité métier critique.**

Le frontend peut :

* afficher ;
* demander ;
* transmettre ;
* informer.

Il ne peut pas décider :

* du prix réel ;
* qu'un paiement est réussi ;
* qu'un ticket est vendu ;
* qu'un ticket est valide ;
* qu'un client a accès à Internet.

Ces décisions appartiennent au backend et aux systèmes d'autorité correspondants.

---

# 03 — ARCHITECTURE GLOBALE

Architecture cible :

```text
                              INTERNET
                                  │
                    ┌─────────────┴─────────────┐
                    │                           │
                    ▼                           ▼
              FedaPay                    Infrastructure
              Payment API                    Web/API
                    │                           │
                    │                           ▼
                    │                    ┌──────────────┐
                    │                    │   BACKEND    │
                    │                    │              │
                    │                    │ Auth métier  │
                    │                    │ Orders       │
                    │                    │ Payments     │
                    │                    │ Tickets      │
                    │                    │ Audit        │
                    │                    └──────┬───────┘
                    │                           │
                    │                    ┌──────┴──────┐
                    │                    │             │
                    ▼                    ▼             ▼
              MTN/Moov/             DATABASE      MIKROTIK
              Celtiis                    │             │
                                        │             │
                                        ▼             │
                                  Financial Ledger    │
                                                      │
                                         Local secure │
                                         integration  │
                                                      │
                                                      ▼
                                               Hotspot Déo Gracias
                                                      │
                                                      ▼
                                                  INTERNET
```

---

# 04 — LES COUCHES DU SYSTÈME

L'architecture est divisée en huit grandes couches.

## 04.1 — Network Layer

Responsable de :

* Wi-Fi ;
* accès Internet ;
* DHCP ;
* Hotspot ;
* authentification ;
* limitation d'accès ;
* expiration.

Autorité :

> **MikroTik**

---

## 04.2 — Experience Layer

Responsable de :

* portail captif ;
* offres ;
* paiement ;
* confirmation ;
* affichage du ticket ;
* messages ;
* états utilisateur.

Autorité :

> **Frontend**

mais uniquement pour la présentation et l'interaction.

---

## 04.3 — Application Layer

Responsable de :

* commandes ;
* règles métier ;
* allocation des tickets ;
* gestion des paiements ;
* validation ;
* récupération ;
* administration.

Autorité :

> **Backend**

---

## 04.4 — Payment Layer

Responsable de :

* création des transactions ;
* communication avec FedaPay ;
* réception des webhooks ;
* vérification ;
* synchronisation des statuts.

Autorité externe :

> **FedaPay**

---

## 04.5 — Data Layer

Responsable de :

* offres ;
* commandes ;
* transactions ;
* tickets ;
* événements ;
* utilisateurs administrateurs ;
* audit ;
* statistiques.

Autorité :

> **Database**

---

## 04.6 — Integration Layer

Responsable de la communication entre :

```text
Backend
   ↕
MikroTik
```

Cette couche sera isolée afin de ne pas exposer directement MikroTik à Internet.

---

## 04.7 — Administration Layer

Responsable de :

* gestion des offres ;
* tickets ;
* ventes ;
* transactions ;
* statistiques ;
* incidents ;
* logs ;
* configuration ;
* audit.

---

## 04.8 — Security Layer

Transversale à toutes les autres.

Elle protège :

* paiement ;
* tickets ;
* données ;
* API ;
* comptes administrateurs ;
* MikroTik ;
* webhooks ;
* infrastructure.

---

# 05 — FRONTEND

## 05.1 — Rôle

Le frontend constitue l'interface visible par :

1. les clients Wi-Fi ;
2. l'administratrice de Déo Gracias.

Il existe donc conceptuellement deux interfaces.

```text
                    FRONTEND
                       │
          ┌────────────┴────────────┐
          │                         │
          ▼                         ▼
   PUBLIC / CLIENT             ADMINISTRATION
```

---

# 06 — CLIENT FRONTEND

Le client doit pouvoir :

### Parcours ticket

```text
Portail
   ↓
Entrer ticket
   ↓
Connexion
```

### Parcours paiement

```text
Portail
   ↓
Choisir offre
   ↓
Créer commande
   ↓
Payer
   ↓
Attendre confirmation
   ↓
Ticket délivré
   ↓
Entrer/utiliser ticket
```

---

# 07 — PRINCIPE UX DU PORTAIL

Le portail doit être extrêmement simple.

L'utilisateur n'est pas venu pour explorer une application.

Il est venu pour :

> **avoir Internet.**

La hiérarchie doit donc être :

```text
1. Se connecter
2. Acheter un accès
3. Comprendre les offres
4. Obtenir de l'aide
```

et non :

```text
animations
↓
contenu
↓
publicité
↓
offres
↓
connexion
```

Le référentiel UX impose justement que l'utilisateur puisse comprendre ce qu'il voit, pourquoi il le voit, ce qu'il peut faire et ce qui vient de se produire. 

---

# 08 — OFFRES

Les offres doivent être récupérées depuis le backend.

Le frontend ne doit jamais avoir une logique du type :

```text
100 FCFA = offre X
```

en dur pour déterminer le montant à payer.

Il doit recevoir :

```json
{
  "id": "...",
  "name": "5 heures",
  "price": 100,
  "currency": "XOF",
  "access_duration": "...",
  "validity_duration": "..."
}
```

Le montant utilisé lors du paiement est toujours déterminé côté serveur.

---

# 09 — BACKEND

Le backend constitue le **cerveau métier** du système.

Il doit être la seule autorité capable de dire :

```text
Commande valide
Paiement confirmé
Ticket attribué
Ticket délivré
```

Il devra gérer au minimum :

```text
Orders
Payments
Tickets
Offers
Customers/sessions
MikroTik integration
Webhooks
Audit logs
Admin
System configuration
```

---

# 10 — ARCHITECTURE BACKEND LOGIQUE

Le backend doit être organisé par domaines métier.

```text
Backend
│
├── Offers
│
├── Orders
│
├── Payments
│
├── Tickets
│
├── MikroTik
│
├── Customers / Sessions
│
├── Admin
│
├── Notifications
│
├── Audit
│
└── System
```

Cette organisation évite de transformer le backend en un ensemble de routes sans structure.

---

# 11 — DATABASE

La base de données constitue la mémoire transactionnelle du système.

Elle doit notamment conserver :

```text
OFFERS
ORDERS
PAYMENTS
TICKETS
TICKET_ALLOCATIONS
PAYMENT_EVENTS
AUDIT_LOGS
ADMIN_USERS
SYSTEM_CONFIG
```

---

# 12 — OFFERS

Table conceptuelle :

```text
offers
```

Champs principaux :

```text
id
name
price
currency
access_duration
validity_duration
mikrotik_profile
active
display_order
created_at
updated_at
```

Les six offres actuelles y seront représentées.

---

# 13 — ORDERS

Une commande représente l'intention d'achat.

```text
orders
```

Conceptuellement :

```text
id
public_reference
offer_id
amount
currency
status
created_at
expires_at
paid_at
completed_at
```

États possibles :

```text
PENDING
PAYMENT_PROCESSING
PAID
FULFILLMENT_PENDING
FULFILLED
FAILED
CANCELLED
EXPIRED
REFUND_PENDING
REFUNDED
```

---

# 14 — PAYMENT

La commande et le paiement ne doivent **pas** être confondus.

Une commande signifie :

> « Le client veut acheter cette offre. »

Une transaction signifie :

> « Une opération financière a été initiée auprès du prestataire. »

Donc :

```text
ORDER
   │
   └── PAYMENT
```

et non :

```text
ORDER = PAYMENT
```

---

# 15 — PAYMENT RECORD

Table :

```text
payments
```

Champs conceptuels :

```text
id
order_id
provider
provider_transaction_id
amount
currency
status
payment_method
raw_reference
created_at
updated_at
confirmed_at
```

Le système devra conserver suffisamment d'informations pour effectuer des audits sans stocker inutilement des données sensibles.

---

# 16 — PAYMENT EVENTS

Les webhooks doivent être conservés séparément.

```text
payment_events
```

Pourquoi ?

Parce qu'un événement reçu est une **preuve technique à traiter**, pas directement un état métier.

Exemple :

```text
Webhook reçu
      ↓
Event enregistré
      ↓
Signature vérifiée
      ↓
Event traité
      ↓
Transaction mise à jour
      ↓
Commande mise à jour
      ↓
Fulfillment
```

Cela permet d'auditer les opérations.

---

# 17 — TICKETS

Les tickets existants constituent une ressource consommable.

Table conceptuelle :

```text
tickets
```

Champs :

```text
id
username
password_hash/encrypted_secret
offer_id
mikrotik_profile
status
reserved_at
sold_at
used_at
expires_at
created_at
```

Le stockage exact du secret devra être déterminé pendant la phase Data/Security.

---

# 18 — ÉTATS DES TICKETS

Le système doit distinguer clairement :

```text
AVAILABLE
    ↓
RESERVED
    ↓
SOLD
    ↓
USED
```

et les états exceptionnels :

```text
EXPIRED
CANCELLED
REFUNDED
INVALID
```

### Pourquoi `RESERVED` ?

Pour éviter :

```text
Client A ──┐
           ├──► même ticket
Client B ──┘
```

Deux commandes ne doivent jamais pouvoir obtenir le même ticket.

---

# 19 — ALLOCATION DE TICKET

Lorsqu'un paiement est confirmé :

```text
PAID
 ↓
chercher ticket AVAILABLE
 ↓
verrouiller
 ↓
RESERVED
 ↓
associer à order
 ↓
SOLD
```

Cette opération doit être atomique autant que possible.

---

# 20 — LE CAS CRITIQUE

Nous devons gérer :

> **Argent débité mais ticket non délivré.**

Exemple :

```text
Client
 ↓
100 FCFA
 ↓
FedaPay confirme
 ↓
Backend
 ↓
❌ problème allocation ticket
```

Le système ne doit surtout pas considérer :

```text
PAID = COMPLETED
```

Il doit pouvoir avoir :

```text
PAYMENT = PAID
ORDER = FULFILLMENT_PENDING
```

Puis reprendre automatiquement le traitement.

---

# 21 — PAYMENT ≠ ACCESS

C'est l'un des principes les plus importants de toute l'architecture.

```text
Paiement
   ≠
Ticket
   ≠
Accès réseau
```

Ce sont trois concepts différents.

```text
PAYMENT
   ↓
FULFILLMENT
   ↓
TICKET
   ↓
AUTHENTICATION
   ↓
NETWORK ACCESS
```

Cela permet de diagnostiquer précisément les erreurs.

---

# 22 — FEDAPAY

FedaPay sera la passerelle de paiement principale.

Architecture :

```text
Backend
   │
   │ API
   ▼
FedaPay
   │
   ├── MTN
   ├── Moov
   └── Celtiis
```

Le backend ne doit jamais demander au frontend de décider lui-même du montant.

---

# 23 — INITIALISATION D'UN PAIEMENT

Flux :

```text
Client
 ↓
Choisit offre
 ↓
Frontend
 ↓
POST /orders
 ↓
Backend
 ↓
Vérifie offer_id
 ↓
Récupère prix serveur
 ↓
Crée ORDER
 ↓
Crée PAYMENT
 ↓
FedaPay
 ↓
Retour référence paiement
 ↓
Frontend
```

---

# 24 — CONFIRMATION DE PAIEMENT

Le navigateur peut recevoir une information de retour.

Mais cette information n'est pas suffisante.

La véritable confirmation doit venir de :

```text
FedaPay
   ↓
Webhook
   ↓
Backend
```

Puis :

```text
signature valide ?
       ↓
transaction connue ?
       ↓
montant correct ?
       ↓
currency correcte ?
       ↓
order correcte ?
       ↓
transaction déjà traitée ?
       ↓
oui
       ↓
PAID
```

---

# 25 — WEBHOOK IDEMPOTENT

Le système doit supporter :

```text
Webhook #1
Webhook #2
Webhook #3
```

sans créer :

```text
3 tickets
```

Il doit produire :

```text
1 paiement
1 commande
1 ticket
```

même si le même événement est reçu plusieurs fois.

---

# 26 — VÉRIFICATIONS DU WEBHOOK

Avant toute délivrance :

```text
1. Vérifier signature
2. Vérifier format
3. Vérifier événement
4. Vérifier transaction
5. Vérifier référence
6. Vérifier montant
7. Vérifier devise
8. Vérifier statut
9. Vérifier commande
10. Vérifier idempotence
11. Traiter
```

Aucune étape ne doit être contournée.

---

# 27 — PRICE TAMPERING

Le client ne doit jamais pouvoir envoyer :

```json
{
  "price": 1
}
```

et obtenir une offre à 100 FCFA.

Le client envoie seulement :

```text
offer_id
```

Le backend fait :

```text
offer_id
 ↓
database
 ↓
price officiel
```

Puis crée la transaction avec ce prix.

---

# 28 — OFFER TAMPERING

Même principe pour :

```text
duration
profile
validity
```

Le frontend ne doit jamais être autoritaire.

Un attaquant ne doit pas pouvoir dire :

```text
offer = 100 FCFA
duration = 30 jours
```

Le backend récupère toujours :

```text
Offer
 ↓
prix
 ↓
durée
 ↓
validité
 ↓
profil MikroTik
```

---

# 29 — WALLET / ARGENT

Le système doit distinguer deux concepts.

## 29.1 — Merchant Wallet

C'est le compte de paiement appartenant à Déo Gracias auprès du système de paiement.

```text
Client
 ↓
FedaPay
 ↓
Compte marchand Déo Gracias
```

Le projet ne doit pas devenir lui-même un établissement qui détient l'argent des clients.

---

## 29.2 — Internal Financial Ledger

Notre base peut conserver :

```text
amount
provider
transaction
status
fees
net_amount
settlement_reference
```

mais ce ledger est **un registre comptable**, pas un portefeuille financier réel.

Il permet de savoir :

```text
100 FCFA payé
- frais
= montant net
```

sans que notre application détienne elle-même les fonds.

---

# 30 — SETTLEMENT

Le système devra distinguer :

```text
PAYMENT
```

et :

```text
SETTLEMENT
```

Exemple :

```text
Client paie
     ↓
Transaction approuvée
     ↓
Paiement confirmé
     ↓
Argent dans l'écosystème du prestataire
     ↓
Reversement vers compte Déo Gracias
```

Ces événements ne doivent pas être considérés comme identiques.

---

# 31 — MIKROTIK

MikroTik reste l'autorité du réseau.

Configuration actuelle connue :

```text
Board:
RB951Ui-2HnD

RouterOS:
6.49.17

Hotspot:
hotspot1

Hotspot address:
192.168.88.200

Router:
192.168.88.254/24

WAN/DHCP client:
ether1

WAN IP:
192.168.100.7/24

DHCP Server:
dhcp1

Interface:
DEOGRACIAS

Walled Garden:
VIDE
```

---

# 32 — PRINCIPE D'INTÉGRATION MIKROTIK

Le système cloud ne doit idéalement **pas exposer directement l'API MikroTik à Internet**.

Architecture préférée :

```text
                  CLOUD
                    │
                 Backend
                    │
                    │ HTTPS sécurisé
                    ▼
             Local Integration
                 Agent
                    │
              LAN Déo Gracias
                    │
                    ▼
                MikroTik
```

Cela évite de faire :

```text
Internet
   ↓
Port ouvert
   ↓
MikroTik
```

qui serait une surface d'attaque inutile.

---

# 33 — LOCAL INTEGRATION AGENT

Un petit composant local pourra éventuellement être installé sur un appareil présent dans le réseau Déo Gracias.

Son rôle :

```text
Backend
   ↓
commande sécurisée
   ↓
Agent local
   ↓
MikroTik
```

L'agent ne doit pas être une nouvelle application métier.

Il doit uniquement faire :

* synchronisation ;
* lecture ;
* opérations MikroTik autorisées ;
* reporting ;
* retry.

---

# 34 — POURQUOI CETTE APPROCHE

Le MikroTik possède :

```text
192.168.88.254
```

qui est une adresse privée.

Le serveur Internet ne peut donc pas simplement faire :

```text
https://192.168.88.254
```

depuis le cloud.

Il faudrait ouvrir l'infrastructure.

Nous voulons éviter cela.

L'agent local permet plutôt :

```text
Agent → Backend
```

en connexion sortante.

---

# 35 — ALTERNATIVE

Une autre architecture serait :

```text
Backend Cloud
      ↓
VPN sécurisé
      ↓
Réseau Déo Gracias
      ↓
MikroTik
```

Cette option est également robuste.

Mais elle augmente la complexité opérationnelle.

La décision finale :

```text
Local Agent
vs
VPN
```

sera prise lors de la conception détaillée de l'intégration MikroTik.

---

# 36 — PRÉ-GÉNÉRÉ VS DYNAMIQUE

Deux stratégies restent ouvertes.

## Option A — Tickets pré-générés

```text
Mikhmon
 ↓
Tickets
 ↓
Database
 ↓
AVAILABLE
```

Puis :

```text
Payment
 ↓
Ticket allocation
```

### Avantage

Très faible modification de l'infrastructure existante.

### Inconvénient

Gestion d'inventaire.

---

## Option B — Création dynamique

```text
Payment
 ↓
Backend
 ↓
MikroTik
 ↓
Create user
```

### Avantage

Pas d'inventaire préexistant.

### Inconvénient

Intégration MikroTik plus profonde.

---

# 37 — DÉCISION ARCHITECTURALE PROVISOIRE

Pour préserver l'infrastructure actuelle, l'architecture doit être conçue pour **supporter d'abord les tickets existants/pré-générés**.

Mais le modèle de données ne doit pas empêcher ultérieurement :

```text
PREGENERATED
```

ou :

```text
DYNAMIC
```

Cela permet de prendre la décision définitive après analyse détaillée de l'API MikroTik.

---

# 38 — CAPTIVE PORTAL ET WALLED GARDEN

Le Walled Garden actuel étant vide :

```text
Walled Garden = ∅
```

le système devra ajouter uniquement les autorisations nécessaires.

Conceptuellement :

```text
Client non authentifié
       │
       ▼
Portail Déo Gracias
       │
       ├── Backend
       │
       ├── Payment provider
       │
       └── ressources nécessaires
```

Tout le reste doit rester bloqué.

---

# 39 — PRINCIPE ZERO-TRUST DU WALLED GARDEN

Nous ne devons pas faire :

```text
Autoriser Internet
```

simplement pour permettre le paiement.

Nous devons faire :

```text
Autoriser uniquement
les destinations strictement nécessaires.
```

Les domaines/IP exacts devront être déterminés lors de l'implémentation FedaPay.

**Aucune adresse externe ne doit être inventée dans cette phase.**

---

# 40 — FLUX COMPLET : CLIENT AVEC TICKET

```text
Client
  ↓
Connexion Wi-Fi
  ↓
MikroTik Hotspot
  ↓
Portail
  ↓
Ticket
  ↓
MikroTik vérifie
  ↓
Profil associé
  ↓
Session créée
  ↓
Internet
```

Ce parcours doit rester fonctionnel même si :

```text
Backend
FedaPay
Base de données
```

sont temporairement indisponibles.

C'est important : **le fonctionnement historique ne doit pas dépendre inutilement du nouveau système.**

---

# 41 — FLUX COMPLET : ACHAT

```text
Client
 ↓
Wi-Fi
 ↓
Hotspot
 ↓
Portail
 ↓
Offres
 ↓
Choix 100 FCFA
 ↓
Backend
 ↓
Order
 ↓
Payment
 ↓
FedaPay
 ↓
MTN/Moov/Celtiis
 ↓
Confirmation
 ↓
Webhook
 ↓
Backend
 ↓
Allocation ticket
 ↓
Ticket délivré
 ↓
Client
 ↓
Portail
 ↓
Authentification ticket
 ↓
MikroTik
 ↓
Internet
```

---

# 42 — FLUX COMPLET : PAIEMENT ÉCHOUÉ

```text
Client
 ↓
Commande
 ↓
FedaPay
 ↓
Paiement refusé
 ↓
Webhook/status
 ↓
Backend
 ↓
PAYMENT_FAILED
 ↓
ORDER_FAILED
 ↓
Aucun ticket vendu
```

Le ticket reste :

```text
AVAILABLE
```

---

# 43 — FLUX COMPLET : PAIEMENT ABANDONNÉ

```text
Client
 ↓
Order
 ↓
Payment
 ↓
Client abandonne
 ↓
PENDING
 ↓
expiration
 ↓
ORDER_EXPIRED
```

Aucun ticket ne doit être définitivement vendu.

---

# 44 — FLUX COMPLET : PAIEMENT CONFIRMÉ MAIS MIKROTIK INDISPONIBLE

Cas critique :

```text
FedaPay
 ↓
PAID
 ↓
Backend
 ↓
MikroTik indisponible
```

Le système ne doit pas perdre la vente.

Il doit conserver :

```text
PAYMENT = PAID
ORDER = FULFILLMENT_PENDING
```

puis :

```text
retry
 ↓
MikroTik disponible
 ↓
fulfillment
 ↓
ticket délivré
```

---

# 45 — FLUX COMPLET : WEBHOOK DUPLIQUÉ

```text
Webhook 1
 ↓
PAID
 ↓
Ticket X
```

Puis :

```text
Webhook 2
 ↓
transaction déjà traitée
 ↓
IGNORE
```

Résultat :

```text
1 paiement
1 ticket
```

---

# 46 — FLUX COMPLET : CLIENT TENTE DE TRICHER

Exemple :

```text
Client modifie
price = 1 FCFA
```

Backend :

```text
❌ prix client ignoré
```

Il récupère :

```text
offer_id
 ↓
database
 ↓
100 FCFA
```

Même logique pour :

* durée ;
* profil ;
* ticket ;
* statut ;
* paiement.

---

# 47 — SÉCURITÉ — NIVEAU DE PRIORITÉ MAXIMUM

La sécurité n'est pas un module supplémentaire.

Elle traverse :

```text
Frontend
Backend
Database
Payment
MikroTik
Admin
Logs
Deployment
```

---

# 48 — MODÈLE DE MENACES

Les principales menaces sont :

### T1 — Faux paiement

Un attaquant tente de convaincre le système qu'il a payé.

### T2 — Replay webhook

Un ancien événement est rejoué.

### T3 — Webhook falsifié

Un attaquant envoie lui-même une requête.

### T4 — Modification du prix

Le client modifie le montant.

### T5 — Modification de l'offre

Le client tente d'obtenir une offre supérieure.

### T6 — Double ticket

Une transaction entraîne plusieurs allocations.

### T7 — Brute force ticket

Un attaquant essaie de deviner les codes.

### T8 — Vol de ticket

Un ticket obtenu est récupéré par quelqu'un d'autre.

### T9 — Compromission admin

Un attaquant accède au dashboard.

### T10 — Compromission MikroTik

Un attaquant atteint l'équipement réseau.

### T11 — Fuite de secrets

API keys, credentials ou tokens exposés.

### T12 — Race condition

Deux requêtes traitent simultanément la même ressource.

---

# 49 — RÈGLE DE CONFIANCE

Le système doit avoir une hiérarchie d'autorité.

```text
Frontend
    ↓
NON AUTORITAIRE

Backend
    ↓
Autorité métier

FedaPay
    ↓
Autorité externe du paiement

MikroTik
    ↓
Autorité du réseau
```

Aucune couche ne doit usurper l'autorité d'une autre.

---

# 50 — AUTHENTIFICATION ADMIN

L'administration doit être protégée séparément du portail client.

```text
Client
≠
Admin
```

Le dashboard doit nécessiter :

* authentification ;
* session sécurisée ;
* expiration ;
* contrôle des permissions ;
* protection contre brute force ;
* audit.

---

# 51 — ADMIN RBAC

Prévoir dès l'architecture :

```text
SUPER_ADMIN
ADMIN
OPERATOR
VIEWER
```

Même si, au début, Déo Gracias ne possède qu'une administratrice.

Cela évite de construire une architecture impossible à faire évoluer.

---

# 52 — SECRETS

Les secrets ne doivent jamais apparaître :

```text
Frontend
GitHub
logs
tickets
screenshots
URL
```

Notamment :

* FedaPay secret keys ;
* MikroTik credentials ;
* database credentials ;
* webhook secrets ;
* admin secrets.

Ils doivent être gérés par l'environnement sécurisé du backend.

---

# 53 — TICKETS ET SECRETS

Comme :

```text
username = password
```

un ticket est particulièrement sensible.

Un ticket divulgué équivaut pratiquement à divulguer l'identifiant et le mot de passe.

Donc :

> **Le ticket doit être traité comme un secret d'accès réseau.**

---

# 54 — TICKET BRUTE FORCE

Le portail ne doit pas permettre :

```text
10 000 essais
```

sur les tickets.

Il faut prévoir :

* rate limiting ;
* délai progressif ;
* détection d'abus ;
* journalisation ;
* éventuellement blocage temporaire.

---

# 55 — TICKET ENUMERATION

Le système ne doit pas répondre :

```text
Ticket ABC123 = existe
Ticket ABC124 = n'existe pas
```

de manière permettant à un attaquant de découvrir l'inventaire.

Les réponses doivent rester suffisamment neutres.

---

# 56 — PAYMENT SECURITY

Une transaction doit être liée à :

```text
order_id
provider_transaction_id
amount
currency
offer
status
```

Une confirmation ne doit jamais être acceptée uniquement parce que :

```text
status = approved
```

dans une donnée envoyée par le navigateur.

---

# 57 — SIGNATURE

Les webhooks doivent utiliser le mécanisme de vérification fourni par FedaPay.

Conceptuellement :

```text
Webhook
 ↓
Signature
 ↓
Verification
 ↓
Valid ?
```

Si :

```text
INVALID
```

alors :

```text
❌ aucun changement financier
❌ aucun ticket
❌ aucun accès
```

---

# 58 — IDEMPOTENCY

Les opérations critiques devront avoir des clés d'idempotence lorsque le prestataire et l'opération le permettent.

Exemple :

```text
order_id = DG-2026-000001
```

La même commande ne doit pas pouvoir produire :

```text
ticket A
ticket B
```

---

# 59 — DATABASE TRANSACTIONS

Les opérations critiques doivent être transactionnelles.

Exemple :

```text
BEGIN
 ↓
Lock ticket
 ↓
Check available
 ↓
Assign
 ↓
Update order
 ↓
COMMIT
```

Si une erreur survient :

```text
ROLLBACK
```

---

# 60 — AUDIT LOG

Toutes les opérations sensibles doivent être traçables.

Exemples :

```text
ADMIN_LOGIN
OFFER_CREATED
OFFER_UPDATED
ORDER_CREATED
PAYMENT_RECEIVED
PAYMENT_REJECTED
WEBHOOK_RECEIVED
WEBHOOK_REJECTED
TICKET_RESERVED
TICKET_SOLD
TICKET_CANCELLED
MIKROTIK_ACTION
ADMIN_ACTION
```

---

# 61 — LOGS

Les logs ne doivent jamais contenir :

```text
password
API secret
webhook secret
ticket password en clair
```

sauf nécessité exceptionnelle strictement contrôlée.

---

# 62 — RATE LIMITING

À prévoir au minimum sur :

```text
Login
Ticket authentication
Order creation
Payment initiation
Webhook endpoints
Admin APIs
```

---

# 63 — API SECURITY

Le backend doit :

* valider les inputs ;
* refuser les champs inattendus ;
* vérifier les types ;
* limiter les tailles ;
* normaliser les données ;
* gérer les erreurs ;
* ne jamais faire confiance au frontend.

---

# 64 — CORS

Le backend ne doit autoriser que les origines réellement nécessaires.

Pas :

```text
Access-Control-Allow-Origin: *
```

pour les endpoints sensibles.

---

# 65 — HTTPS

Toutes les communications Internet doivent utiliser HTTPS.

```text
Client
 ↓ HTTPS
Backend

Backend
 ↓ HTTPS
FedaPay
```

Et pour une éventuelle communication agent :

```text
Agent
 ↓ HTTPS
Backend
```

---

# 66 — MIKROTIK SECURITY

Le MikroTik ne doit pas être exposé inutilement.

À éviter :

```text
Internet
 ↓
WinBox/API ouvert
 ↓
MikroTik
```

L'intégration doit privilégier :

```text
Backend
 ↓
canal sécurisé
 ↓
réseau local
 ↓
MikroTik
```

---

# 67 — DATABASE SECURITY

La base doit appliquer :

* principe du moindre privilège ;
* séparation des rôles ;
* secrets hors code ;
* backups ;
* restrictions réseau ;
* journalisation ;
* politiques d'accès.

Si Supabase est retenu, les politiques de sécurité de type Row Level Security devront être utilisées lorsque pertinentes.

---

# 68 — BACKUP

Le système doit prévoir :

```text
Database backup
Configuration backup
MikroTik backup
Environment/secrets recovery plan
```

Les backups MikroTik sont particulièrement importants parce que l'infrastructure réseau existante doit rester récupérable.

---

# 69 — AVAILABILITY

Le système doit distinguer :

### Internet indisponible

Le client ne peut rien faire.

### Backend indisponible

Les tickets déjà existants doivent continuer à fonctionner.

### FedaPay indisponible

Les paiements nouveaux peuvent être temporairement indisponibles.

### MikroTik indisponible

Le paiement peut être confirmé mais la délivrance peut rester en attente.

---

# 70 — FAILURE IS A STATE

Une erreur ne doit pas être un état implicite.

Le système doit avoir des états explicites :

```text
LOADING
PENDING
SUCCESS
FAILED
EXPIRED
CANCELLED
RETRYING
UNAVAILABLE
```

Cette approche rejoint directement le référentiel UX, qui exige que les états Loading, Loaded, Empty, Error, Success, Disabled et Offline/unavailable soient anticipés lorsque pertinents. 

---

# 71 — NOTIFICATIONS CLIENT

Après paiement :

```text
Paiement confirmé
```

Puis :

```text
Préparation de votre accès...
```

Puis :

```text
Votre ticket est prêt.
```

Si problème :

```text
Votre paiement a été confirmé.
Nous préparons encore votre accès.
Veuillez patienter.
```

Le client ne doit jamais voir :

```text
SQL error
Webhook error
MikroTik timeout
```

---

# 72 — ADMIN DASHBOARD

L'administration devra permettre au minimum :

```text
Dashboard
Offers
Orders
Payments
Tickets
Customers/Sessions
MikroTik status
Incidents
Audit logs
Settings
```

---

# 73 — DASHBOARD PRINCIPAL

Indicateurs :

```text
Ventes aujourd'hui
Chiffre d'affaires
Transactions réussies
Transactions échouées
Tickets disponibles
Tickets vendus
Tickets utilisés
Incidents
```

Mais les statistiques doivent provenir du backend/database.

---

# 74 — GESTION DES OFFRES

L'administratrice doit pouvoir :

* activer/désactiver ;
* modifier le nom ;
* modifier le prix ;
* modifier la durée ;
* modifier la validité ;
* modifier l'ordre d'affichage.

Toute modification doit être auditée.

---

# 75 — GESTION DES TICKETS

L'administration doit afficher :

```text
AVAILABLE
RESERVED
SOLD
USED
EXPIRED
```

avec possibilité de rechercher :

* référence ;
* offre ;
* statut ;
* date.

Les secrets ne doivent pas être affichés inutilement.

---

# 76 — GESTION DES PAIEMENTS

L'administration doit pouvoir voir :

```text
Order
Montant
Opérateur
Provider transaction ID
Statut
Date
Ticket associé
```

mais pas modifier arbitrairement :

```text
PAID
```

manuellement sans workflow d'administration extrêmement contrôlé.

---

# 77 — MANUAL OVERRIDE

Les actions administratives critiques doivent être rares.

Exemple :

```text
forcer une commande en remboursement
```

doit exiger :

* permission ;
* confirmation ;
* raison ;
* audit.

---

# 78 — OBSERVABILITÉ

Nous devons pouvoir répondre à :

> « Qu'est-il arrivé à cette vente de 100 FCFA ? »

en moins de quelques minutes.

Avec :

```text
Order ID
 ↓
Payment ID
 ↓
FedaPay transaction
 ↓
Webhook
 ↓
Ticket
 ↓
MikroTik
```

---

# 79 — IDENTIFIANTS

Chaque élément critique doit avoir un identifiant stable.

Exemple :

```text
Order:
DG-ORD-20260914-000001

Payment:
DG-PAY-...

Ticket:
DG-TKT-...

Event:
DG-EVT-...
```

Les formats exacts seront définis dans la Phase Data.

---

# 80 — ARCHITECTURE DE DÉPLOIEMENT

Architecture cible :

```text
                    INTERNET
                       │
            ┌──────────┴──────────┐
            │                     │
            ▼                     ▼
       Frontend CDN          FedaPay
            │                     │
            ▼                     │
         Backend ◄────────────────┘
            │
       ┌────┴─────┐
       ▼          ▼
   Database    Integration
                  │
                  │ HTTPS
                  ▼
             Local Agent
                  │
                  ▼
              MikroTik
                  │
                  ▼
               Wi-Fi
```

---

# 81 — FRONTEND HOSTING

Le frontend peut être déployé sur une infrastructure CDN/edge adaptée.

Objectifs :

* faible latence ;
* HTTPS ;
* cache ;
* disponibilité ;
* déploiement simple.

---

# 82 — BACKEND HOSTING

Le backend doit être hébergé séparément du frontend logique.

Il doit disposer de :

* HTTPS ;
* variables d'environnement ;
* logs ;
* monitoring ;
* secrets ;
* accès database ;
* endpoint webhook public.

---

# 83 — DATABASE HOSTING

La base doit être accessible au backend mais pas directement au navigateur pour les opérations sensibles.

```text
Frontend
   X
Database

Frontend
   ↓
Backend
   ↓
Database
```

---

# 84 — LE CLIENT NE PARLE PAS DIRECTEMENT À MIKROTIK

Règle :

```text
Client
   X
MikroTik API
```

Le client ne doit jamais connaître :

* credentials MikroTik ;
* IP d'administration ;
* API port ;
* détails réseau internes.

---

# 85 — LE CLIENT NE PARLE PAS DIRECTEMENT À LA DATABASE

Même logique :

```text
Client
   X
Database
```

Il passe par :

```text
Frontend
 ↓
Backend
 ↓
Database
```

---

# 86 — LE FRONTEND NE PARLE PAS DIRECTEMENT À FEDAPAY AVEC DES SECRETS

Le navigateur ne doit jamais recevoir une clé secrète FedaPay.

```text
Frontend
 ↓
Backend
 ↓
FedaPay
```

Les éléments publics éventuellement nécessaires à l'expérience client peuvent être exposés selon la documentation du prestataire, mais jamais les secrets.

---

# 87 — COMMUNICATIONS

Résumé :

| Communication      | Canal               |
| ------------------ | ------------------- |
| Client → Frontend  | HTTPS               |
| Frontend → Backend | HTTPS               |
| Backend → Database | connexion sécurisée |
| Backend → FedaPay  | HTTPS/API           |
| FedaPay → Backend  | HTTPS/Webhook       |
| Agent → Backend    | HTTPS               |
| Agent → MikroTik   | LAN sécurisé        |
| Client → MikroTik  | Wi-Fi/Hotspot       |

---

# 88 — ARCHITECTURE LOGIQUE FINALE

```text
                         ┌───────────────────┐
                         │      CLIENT       │
                         └─────────┬─────────┘
                                   │
                              Wi-Fi / HTTP
                                   │
                                   ▼
                         ┌───────────────────┐
                         │     MIKROTIK      │
                         │      Hotspot      │
                         └─────────┬─────────┘
                                   │
                              Captive Portal
                                   │
                                   ▼
                         ┌───────────────────┐
                         │     FRONTEND      │
                         └─────────┬─────────┘
                                   │
                                  HTTPS
                                   │
                                   ▼
                         ┌───────────────────┐
                         │      BACKEND      │
                         │                   │
                         │ Orders            │
                         │ Payments          │
                         │ Tickets           │
                         │ Offers            │
                         │ Security          │
                         │ Admin             │
                         └───┬─────┬─────┬───┘
                             │     │     │
                 ┌───────────┘     │     └────────────┐
                 ▼                 ▼                  ▼
          ┌────────────┐    ┌────────────┐    ┌──────────────┐
          │ DATABASE   │    │  FEDAPAY   │    │ MIKROTIK     │
          │            │    │            │    │ INTEGRATION  │
          └────────────┘    └─────┬──────┘    └──────┬───────┘
                                  │                    │
                            MTN/Moov/Celtiis           │
                                                       ▼
                                                   RB951Ui
                                                       │
                                                       ▼
                                                    INTERNET
```

---

# 89 — FLUX DE CONFIANCE

Le système peut être résumé ainsi :

```text
CLIENT
  │
  │ demande
  ▼
FRONTEND
  │
  │ intention
  ▼
BACKEND
  │
  ├──────────────► DATABASE
  │
  ├──────────────► FEDAPAY
  │                    │
  │                    ▼
  │                 PAYMENT
  │                    │
  │◄───────────────────┘
  │
  ▼
FULFILLMENT
  │
  ▼
TICKET
  │
  ▼
MIKROTIK
  │
  ▼
ACCESS
```

---

# 90 — PRINCIPE DE NON-COUPLAGE

Nous devons éviter :

```text
Frontend
   ↓
FedaPay
   ↓
MikroTik
```

directement.

À la place :

```text
Frontend
   ↓
Backend
   ↓
Payment
   ↓
Business Logic
   ↓
MikroTik
```

Chaque système conserve sa responsabilité.

---

# 91 — PRINCIPE DE RÉVERSIBILITÉ

L'architecture ne doit pas devenir prisonnière de FedaPay.

Nous devons abstraire :

```text
PaymentProvider
```

de manière conceptuelle :

```text
PaymentProvider
      │
      ├── FedaPay
      ├── MTN Direct
      └── Future Provider
```

Ainsi, si un jour :

```text
FedaPay → autre solution
```

nous ne reconstruisons pas tout le système.

---

# 92 — ABSTRACTION MIKROTIK

Même principe :

```text
NetworkAccessProvider
       │
       └── MikroTik
```

Le backend ne doit pas disperser des commandes MikroTik partout.

Il doit avoir une couche d'intégration dédiée.

---

# 93 — ABSTRACTION TICKET

```text
TicketProvider
      │
      ├── PreGeneratedTicketProvider
      │
      └── DynamicMikroTikTicketProvider
```

Cela nous permet de changer de stratégie ultérieurement.

---

# 94 — STACK TECHNIQUE CIBLE

À ce stade, je recommande une architecture moderne mais **pas inutilement complexe**.

### Frontend

```text
React
Vite
TypeScript
```

### Backend

```text
TypeScript
Node.js
API REST
```

Le framework backend précis sera arrêté pendant la phase d'implémentation/architecture détaillée.

### Database

```text
PostgreSQL
```

### Payment

```text
FedaPay
```

### Network

```text
MikroTik
RouterOS 6.49.17
```

### Local Integration

```text
Secure local integration agent
```

### Validation

```text
Schema validation
API validation
Database constraints
```

Cette stack reste cohérente avec l'objectif : **construire un système réel sans introduire une architecture distribuée inutilement complexe dès le départ.**

---

# 95 — POURQUOI PAS DES MICROSERVICES

Nous n'avons aucune raison de créer :

```text
Payment Service
Ticket Service
Order Service
Notification Service
MikroTik Service
```

dans cinq serveurs séparés.

Pour Déo Gracias, cela créerait principalement :

* plus de déploiements ;
* plus de réseau ;
* plus de monitoring ;
* plus de points de panne ;
* plus de complexité.

Nous privilégions donc :

> **Modular Monolith + integrations externes bien isolées.**

---

# 96 — ARCHITECTURE BACKEND RECOMMANDÉE

```text
Application
│
├── modules/
│   ├── offers/
│   ├── orders/
│   ├── payments/
│   ├── tickets/
│   ├── mikrotik/
│   ├── admin/
│   ├── audit/
│   └── system/
│
├── integrations/
│   ├── fedapay/
│   └── mikrotik/
│
├── database/
│
├── security/
│
└── shared/
```

Ce n'est pas encore l'arborescence définitive du code.

C'est le **modèle de séparation des responsabilités**.

---

# 97 — PRINCIPES DE PERFORMANCE

Le portail est utilisé potentiellement sur :

* smartphones ;
* connexions mobiles ;
* réseau Wi-Fi local ;
* appareils peu puissants.

Il doit donc rester léger.

Les référentiels de Digital Experience imposent notamment de considérer le responsive comme un véritable état de conception, avec adaptation possible du layout, contenu, interaction, animation et densité. 

Donc :

```text
Performance
>
Effets inutiles
```

---

# 98 — RESPONSIVE

Priorité :

```text
Mobile
   ↓
Tablet
   ↓
Desktop
```

Le parcours paiement doit être parfaitement utilisable sur smartphone.

---

# 99 — ACCESSIBILITY

Minimum :

* HTML sémantique ;
* labels ;
* contraste ;
* focus ;
* clavier ;
* boutons correctement identifiés ;
* messages d'erreur compréhensibles ;
* états visibles.

Les principes UX de référence demandent notamment navigation clavier, focus visible, contraste, labels, responsive et reduced motion. 

---

# 100 — MOTION

La partie paiement n'a pas besoin d'être spectaculaire.

Une animation doit servir :

```text
feedback
progression
état
confirmation
```

et non :

```text
décoration
```

Cela respecte le principe du Design System :

> **CLARITY → DEPTH → COMPLEXITY**

et l'idée que les effets ne doivent jamais précéder la hiérarchie. 

---

# 101 — ÉTATS UI DU PAIEMENT

Le frontend doit prévoir :

```text
IDLE
OFFER_SELECTED
ORDER_CREATING
PAYMENT_PENDING
PAYMENT_PROCESSING
PAYMENT_SUCCESS
PAYMENT_FAILED
PAYMENT_EXPIRED
FULFILLMENT_PENDING
TICKET_READY
SYSTEM_UNAVAILABLE
```

Cela évite le classique :

```text
bouton → spinner → page blanche
```

---

# 102 — SECURITY CHECKPOINT

Avant de considérer une commande comme terminée :

```text
[✓] Order exists
[✓] Offer exists
[✓] Price matches
[✓] Currency matches
[✓] Payment provider matches
[✓] Provider transaction exists
[✓] Signature valid
[✓] Payment status valid
[✓] Event not already processed
[✓] Order not already fulfilled
[✓] Ticket available
[✓] Ticket locked
[✓] Ticket assigned
[✓] Fulfillment recorded
```

**Aucun paiement ne saute cette chaîne.**

---

# 103 — TRANSACTION STATE MACHINE

La logique principale peut être représentée ainsi :

```text
                 ┌─────────────┐
                 │   CREATED   │
                 └──────┬──────┘
                        ▼
                 ┌─────────────┐
                 │   PENDING   │
                 └──────┬──────┘
                        │
             ┌──────────┼──────────┐
             ▼          ▼          ▼
         SUCCESS      FAILED     EXPIRED
             │
             ▼
           PAID
             │
             ▼
   FULFILLMENT_PENDING
             │
             ▼
        FULFILLED
```

Avec possibilité :

```text
FULFILLED
    ↓
REFUND_PENDING
    ↓
REFUNDED
```

selon les règles métier futures.

---

# 104 — ARCHITECTURE FINANCIÈRE

Le système doit permettre de répondre à :

```text
Combien a payé le client ?
Combien FedaPay a-t-il facturé ?
Combien a été net ?
La transaction a-t-elle été réglée ?
Quelle offre ?
Quel ticket ?
Quand ?
Quel opérateur ?
```

Mais :

> **Le système n'est pas un wallet financier.**

Il est un système de vente + registre financier + intégration de paiement.

---

# 105 — ADMINISTRATION DES DONNÉES

L'administration ne doit pas permettre de modifier directement des données historiques comme si elles n'avaient jamais existé.

Exemple :

Ne pas faire :

```text
payment.status = PAID
```

manuellement sans trace.

Préférer :

```text
ADMIN ACTION
 ↓
reason
 ↓
controlled workflow
 ↓
audit log
```

---

# 106 — DATA IMMUTABILITY

Certaines informations doivent être quasi immuables après confirmation :

```text
Original amount
Original offer
Provider transaction ID
Payment timestamp
Webhook event
Ticket allocation history
```

Une correction doit créer une nouvelle information plutôt que réécrire silencieusement l'histoire.

---

# 107 — AUDIT TRAIL

Exemple :

```text
14:31:02
Order created

14:31:19
Payment initiated

14:31:47
Webhook received

14:31:48
Signature verified

14:31:48
Payment approved

14:31:49
Ticket reserved

14:31:49
Ticket sold

14:31:50
Ticket displayed
```

Si quelque chose échoue :

```text
14:31:49
MikroTik integration unavailable

14:31:50
Fulfillment queued
```

---

# 108 — RECOVERY

Le système doit être capable de reprendre après :

* crash backend ;
* timeout ;
* webhook retardé ;
* webhook dupliqué ;
* MikroTik offline ;
* FedaPay temporairement indisponible ;
* connexion client interrompue.

La question n'est pas :

> « Est-ce qu'une erreur peut arriver ? »

Elle arrivera.

La question est :

> **« Que fait le système lorsqu'elle arrive ? »**

---

# 109 — OBSERVABILITÉ ADMIN

Le dashboard doit pouvoir afficher :

```text
🟢 Payment system operational
🟢 Database operational
🟢 Backend operational
🟢 MikroTik connected
🟡 2 fulfillment pending
🔴 1 webhook failed
```

Pas besoin d'un centre de monitoring gigantesque au départ.

Mais les informations critiques doivent être visibles.

---

# 110 — SÉPARATION PRODUCTION / TEST

Nous devons avoir :

```text
DEVELOPMENT
STAGING
PRODUCTION
```

au minimum conceptuellement.

Les tests de paiement ne doivent jamais utiliser accidentellement :

```text
production credentials
production wallet
production tickets
production MikroTik
```

---

# 111 — PROTECTION CONTRE LA PRODUCTION

Avant toute modification du MikroTik :

```text
Backup
 ↓
Validation
 ↓
Test
 ↓
Change
 ↓
Verification
```

Jamais :

```text
Code généré
 ↓
Production immédiate
```

---

# 112 — COMPATIBILITÉ AVEC L'INFRASTRUCTURE ACTUELLE

L'architecture cible doit respecter :

```text
RB951Ui-2HnD
RouterOS 6.49.17
Hotspot1
192.168.88.254
192.168.100.7
DEOGRACIAS
```

et surtout :

> **ne pas exiger une refonte du réseau pour fonctionner.**

---

# 113 — PRINCIPE DE MINIMUM CHANGE

Nous ne devons modifier MikroTik que lorsque nécessaire.

```text
Infrastructure actuelle
       +
petites extensions nécessaires
       =
système cible
```

et non :

```text
Infrastructure actuelle
       ↓
suppression
       ↓
reconstruction totale
```

---

# 114 — DÉPENDANCES CRITIQUES

Le système final dépendra de :

```text
Internet
   ↓
FedaPay
   ↓
Backend
   ↓
Database
   ↓
MikroTik
```

Mais les dépendances doivent être découplées.

Par exemple :

```text
FedaPay DOWN
```

ne doit pas casser :

```text
tickets physiques déjà existants
```

---

# 115 — ARCHITECTURE DE RÉSILIENCE

| Élément indisponible | Conséquence                                         |
| -------------------- | --------------------------------------------------- |
| Frontend             | nouveau parcours indisponible                       |
| Backend              | nouveaux achats indisponibles                       |
| FedaPay              | paiements nouveaux indisponibles                    |
| Database             | opérations backend indisponibles                    |
| MikroTik             | accès réseau indisponible                           |
| Agent local          | intégration réseau retardée                         |
| Internet général     | tout accès Internet impossible                      |
| Ticket physique      | doit continuer à fonctionner si MikroTik fonctionne |

---

# 116 — CE QUE LE SYSTÈME NE DOIT JAMAIS FAIRE

### ❌ Donner Internet parce que le frontend affiche « succès »

### ❌ Faire confiance au prix envoyé par le client

### ❌ Faire confiance à un statut de paiement envoyé par le navigateur

### ❌ Créer deux tickets pour une transaction

### ❌ Exposer les credentials MikroTik

### ❌ Exposer les clés FedaPay

### ❌ Ouvrir tout Internet dans le Walled Garden

### ❌ Stocker les secrets dans GitHub

### ❌ Modifier silencieusement les historiques financiers

### ❌ Faire dépendre les tickets physiques du backend

---

# 117 — PRINCIPES ARCHITECTURAUX DIRECTEURS

Le système sera gouverné par ces principes :

### P1 — Backend authority

Le backend est l'autorité métier.

### P2 — Provider authority

FedaPay est l'autorité externe du paiement.

### P3 — Network authority

MikroTik est l'autorité du réseau.

### P4 — Least privilege

Chaque composant possède uniquement les permissions nécessaires.

### P5 — No trust in client

Tout ce qui vient du navigateur est considéré comme non fiable.

### P6 — Idempotency

Les opérations critiques doivent pouvoir être rejouées sans duplication.

### P7 — Auditability

Toute opération critique doit être traçable.

### P8 — Recoverability

Une erreur ne doit pas provoquer une perte silencieuse.

### P9 — Minimal infrastructure change

L'existant doit être préservé autant que possible.

### P10 — Evolvability

Le système doit pouvoir évoluer vers plusieurs opérateurs, plusieurs modes de tickets et éventuellement plusieurs zones.

---

# 118 — ÉVOLUTION FUTURE

L'architecture doit pouvoir évoluer vers :

```text
Déo Gracias
      │
      ├── WiFi Zone 1
      ├── WiFi Zone 2
      └── WiFi Zone 3
```

et éventuellement :

```text
Déo Gracias
      │
      ├── MikroTik A
      ├── MikroTik B
      └── MikroTik C
```

Le système ne doit donc pas coder :

```text
mikrotik = "192.168.88.254"
```

comme principe architectural global.

Il doit avoir une notion de :

```text
Network
Router
Hotspot
Location
```

même si nous n'en exploitons qu'un seul au départ.

---

# 119 — EXTENSION FUTURE DES PAIEMENTS

Même logique :

```text
PaymentProvider
       │
       ├── FedaPay
       ├── MTN Direct
       ├── autre
       └── ...
```

Le domaine métier ne doit pas être entièrement dépendant d'une implémentation FedaPay.

---

# 120 — EXTENSION FUTURE DES PRODUITS

Aujourd'hui :

```text
WiFi tickets
```

Demain :

```text
WiFi tickets
+
abonnements
+
promotions
+
codes promotionnels
+
offres personnalisées
```

Le modèle `Offer` doit donc être générique.

---

# 121 — EXTENSION FUTURE DU BUSINESS

Le système pourrait ultérieurement gérer :

```text
multiple locations
multiple routers
multiple admins
multiple payment providers
multiple products
analytics
customer history
```

Mais **aucune de ces fonctionnalités ne doit être développée maintenant**.

L'architecture les rend seulement possibles.

---

# 122 — ARCHITECTURE CIBLE RÉSUMÉE

```text
                    ┌─────────────────┐
                    │     CLIENT      │
                    └────────┬────────┘
                             │
                          Wi-Fi
                             │
                             ▼
                    ┌─────────────────┐
                    │    MIKROTIK     │
                    │     HOTSPOT     │
                    └────────┬────────┘
                             │
                       Captive Portal
                             │
                             ▼
                    ┌─────────────────┐
                    │    FRONTEND     │
                    └────────┬────────┘
                             │
                           HTTPS
                             │
                             ▼
              ┌────────────────────────────┐
              │           BACKEND          │
              │                            │
              │ Orders                     │
              │ Payments                   │
              │ Tickets                    │
              │ Offers                     │
              │ Admin                      │
              │ Security                   │
              │ Audit                      │
              └──────┬─────────┬───────────┘
                     │         │
                     │         │
                     ▼         ▼
              ┌──────────┐  ┌───────────┐
              │DATABASE  │  │  FEDAPAY  │
              └──────────┘  └─────┬─────┘
                                  │
                           MTN / Moov / Celtiis

                     BACKEND
                        │
                        ▼
                 LOCAL AGENT
                        │
                        ▼
                    MIKROTIK
                        │
                        ▼
                     INTERNET
```

---

# 123 — ARCHITECTURE DE CONFIANCE FINALE

Le principe peut être résumé en une chaîne :

```text
INTENT
  ↓
ORDER
  ↓
PAYMENT
  ↓
VERIFICATION
  ↓
FULFILLMENT
  ↓
TICKET
  ↓
AUTHENTICATION
  ↓
NETWORK ACCESS
```

Chaque étape possède son propre état.

Chaque transition doit être vérifiable.

Chaque opération critique doit être idempotente.

Chaque erreur doit pouvoir être récupérée.

---

# 124 — CRITÈRES DE VALIDATION DE L'ARCHITECTURE

La Phase 3 sera considérée comme correctement définie si nous pouvons répondre sans ambiguïté à :

```text
[✓] Qui reçoit le paiement ?
[✓] Qui confirme le paiement ?
[✓] Qui décide qu'une commande est payée ?
[✓] Où est stockée la commande ?
[✓] Où est stocké le ticket ?
[✓] Comment éviter les doubles tickets ?
[✓] Comment éviter les faux paiements ?
[✓] Comment vérifier un webhook ?
[✓] Comment gérer un webhook répété ?
[✓] Comment gérer un paiement confirmé mais ticket non délivré ?
[✓] Comment communiquer avec MikroTik ?
[✓] Comment éviter d'exposer MikroTik ?
[✓] Comment fonctionne le Walled Garden ?
[✓] Comment l'administration fonctionne ?
[✓] Comment les événements sont audités ?
[✓] Comment le système récupère après une panne ?
[✓] Comment préserver les tickets physiques ?
[✓] Comment changer de prestataire de paiement ?
[✓] Comment faire évoluer le système ?
```

---

# 125 — DÉCISIONS DE PHASE 3

## Décision D-01

**Architecture : Modular Monolith + integrations externes.**

---

## Décision D-02

**Backend = autorité métier centrale.**

---

## Décision D-03

**FedaPay = Payment Provider de référence.**

---

## Décision D-04

**PostgreSQL = modèle de données cible.**

---

## Décision D-05

**MikroTik reste l'autorité du réseau.**

---

## Décision D-06

**Pas d'exposition directe de l'API MikroTik à Internet comme architecture privilégiée.**

---

## Décision D-07

**Intégration MikroTik via agent local sécurisé ou VPN, choix final à réaliser en Phase 6.**

---

## Décision D-08

**Les tickets pré-générés sont supportés en premier pour minimiser les changements sur l'existant.**

---

## Décision D-09

**Le système reste compatible avec une future génération dynamique de tickets.**

---

## Décision D-10

**Le paiement et l'accès réseau sont deux domaines distincts.**

---

## Décision D-11

**Le frontend n'est jamais une source d'autorité financière.**

---

## Décision D-12

**Les webhooks sont traités comme des événements non fiables jusqu'à vérification.**

---

## Décision D-13

**Idempotence obligatoire sur les opérations de paiement et d'allocation.**

---

## Décision D-14

**Le système possède un audit trail complet des opérations sensibles.**

---

## Décision D-15

**Le Walled Garden doit être minimal et explicitement contrôlé.**

---

# 126 — POINTS ENCORE À DÉCIDER

La Phase 3 fixe l'architecture, mais quelques choix de niveau inférieur restent volontairement ouverts.

### À décider en Phase 5

* schéma PostgreSQL définitif ;
* relations ;
* contraintes ;
* index ;
* stratégie de stockage des secrets tickets ;
* rétention des données.

### À décider en Phase 6

* API MikroTik ;
* méthode agent/VPN ;
* permissions MikroTik ;
* lecture/écriture ;
* stratégie de synchronisation ;
* création dynamique éventuelle.

### À décider en Phase 4

* UX détaillée ;
* écrans ;
* parcours ;
* microcopy ;
* comportement du portail ;
* expérience de paiement.

### À décider avant production

* statut juridique/compte marchand ;
* credentials FedaPay production ;
* reversement ;
* domaines ;
* infrastructure de déploiement ;
* monitoring ;
* backups ;
* politique de récupération.

---

# 127 — HORS PÉRIMÈTRE DE CETTE PHASE

Cette phase ne réalise pas encore :

```text
❌ Code
❌ SQL définitif
❌ Configuration MikroTik
❌ Configuration FedaPay
❌ Création du compte marchand
❌ Walled Garden production
❌ Déploiement
❌ UI finale
❌ Dashboard final
❌ Agent MikroTik
```

Nous avons seulement défini **comment ces éléments devront s'articuler**.

---

# 128 — CONCLUSION

Le système cible n'est donc pas :

> **« un site web permettant d'acheter des tickets Wi-Fi »**.

C'est :

> **un système transactionnel d'accès réseau, reliant une expérience captive, une infrastructure MikroTik, un système de paiement, une base de données métier et un mécanisme sécurisé de délivrance d'accès.**

Son architecture repose sur quatre autorités :

```text
                 SYSTEM
                    │
       ┌────────────┼────────────┐
       ▼            ▼            ▼
    BACKEND       FEDAPAY      MIKROTIK
       │            │            │
       │            │            │
  Autorité       Autorité     Autorité
   métier        paiement       réseau
```

avec :

```text
DATABASE
   ↓
mémoire et audit
```

et :

```text
FRONTEND
   ↓
expérience utilisateur
```

Le point le plus important est la séparation :

```text
PAIEMENT
   ↓
VÉRIFICATION
   ↓
DÉLIVRANCE
   ↓
ACCÈS
```

Cette séparation est précisément ce qui nous protège contre le scénario que tu as identifié : **quelqu'un qui prétend avoir payé alors qu'il n'a rien payé**.

---

# 129 — CHECKPOINT DE FIN DE PHASE 3

À partir de cette architecture, nous pouvons maintenant passer à la conception détaillée sans repartir de zéro.

Les trois premières phases forment maintenant une chaîne cohérente :

```text
PHASE 0
Pourquoi construire ?
        ↓
PHASE 1
Qu'est-ce qui existe réellement ?
        ↓
PHASE 2
Comment l'argent entre-t-il ?
        ↓
PHASE 3
Comment tous les systèmes communiquent-ils ?
        ↓
PHASE 4
Comment l'utilisateur va-t-il vivre le système ?
```

### **Phase suivante : PHASE 4 — UX & CUSTOMER JOURNEYS**

