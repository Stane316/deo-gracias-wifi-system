# PHASE 0 — PROJECT CHARTER

## Projet : Wi-Fi Access & Payment System — Téo Graciel 7G

**Version :** 1.0
**Phase :** 0 — Project Charter
**Statut :** Validé pour passage en Phase 1
**Contexte :** Automatisation de la vente et de l'activation des accès Wi-Fi
**Infrastructure existante :** Huawei + MikroTik + Hotspot + MikroTik User Profiles + Mikmon Server
**Point de vente :** Boutique Téo Graciel 7G

---

# 00 — OBJECTIF DU DOCUMENT

Ce document constitue le cadrage officiel du projet.

Il définit :

* le problème à résoudre ;
* le fonctionnement actuel ;
* la vision cible ;
* les utilisateurs ;
* les objectifs ;
* les contraintes ;
* le périmètre ;
* les éléments connus ;
* les inconnues critiques ;
* les risques ;
* les principes architecturaux ;
* les critères de réussite ;
* les décisions déjà prises ;
* les décisions qui doivent rester ouvertes ;
* la prochaine phase de travail.

Ce document ne constitue **ni l'architecture technique finale, ni une spécification de développement**.

Aucune implémentation ne doit commencer sur la seule base de ce document.

La priorité suivante est de comprendre précisément l'infrastructure existante avant toute modification.

---

# 01 — VISION DU PROJET

## 01.1 — Vision générale

Transformer le système actuel de vente manuelle de tickets Wi-Fi en un système numérique permettant à un client de :

```text
SE CONNECTER AU WI-FI
        ↓
ACCÉDER AU PORTAIL CAPTIF
        ↓
CHOISIR SON MODE D'ACCÈS
        ↓
┌───────────────────────┬────────────────────────┐
│ J'AI UN TICKET        │ JE N'AI PAS DE TICKET  │
│                       │                        │
│ Entrer le code        │ Choisir une offre      │
│                       │ ↓                      │
│ Validation            │ Paiement en ligne      │
│                       │ ↓                      │
│ Accès Wi-Fi           │ Confirmation paiement  │
│                       │ ↓                      │
│                       │ Attribution ticket     │
│                       │ ↓                      │
│                       │ Accès Wi-Fi            │
└───────────────────────┴────────────────────────┘
```

L'objectif final est que la vente d'un accès Wi-Fi puisse fonctionner **avec une intervention humaine minimale**, tout en conservant le MikroTik existant comme élément central du contrôle d'accès réseau.

---

# 02 — PROBLÈME ACTUEL

Le système actuel fonctionne, mais la vente des tickets dépend directement de la présence de la propriétaire.

Le fonctionnement actuel est :

```text
CLIENT
 ↓
Demande un ticket
 ↓
Paiement à la mère
 ↓
La mère récupère un ticket physique
 ↓
Elle remet le ticket au client
 ↓
Client entre le code
 ↓
MikroTik authentifie le ticket
 ↓
Accès Wi-Fi
 ↓
Décompte de la durée
 ↓
Expiration
 ↓
Déconnexion automatique
```

Cette organisation présente plusieurs limites.

## 02.1 — Dépendance à la présence physique

La propriétaire doit être disponible pour :

* recevoir le paiement ;
* sélectionner le bon ticket ;
* récupérer un ticket physique ;
* transmettre le ticket au client.

## 02.2 — Processus manuel

Même si la partie réseau est déjà largement automatisée, la partie commerciale reste manuelle.

Le système actuel automatise principalement :

```text
AUTHENTIFICATION
+
DURÉE D'ACCÈS
+
EXPIRATION
+
DÉCONNEXION
```

Mais pas :

```text
VENTE
+
PAIEMENT
+
ATTRIBUTION
+
LIVRAISON DU TICKET
```

## 02.3 — Absence de vente numérique autonome

Un client ne peut actuellement pas acheter son accès directement depuis le portail captif.

---

# 03 — INFRASTRUCTURE EXISTANTE — ÉTAT CONNU

## 03.1 — Connexion amont

L'infrastructure comporte un routeur Huawei.

Le modèle exact n'est actuellement pas connu.

L'utilisateur indique que ce routeur permet une connexion de type 2,4 GHz / 2,5 GHz selon sa configuration.

**À vérifier techniquement en Phase 1.**

---

# 04 — MIKROTIK EXISTANT

## 04.1 — Présence confirmée

L'infrastructure possède un équipement MikroTik RouterBOARD.

Le modèle exact n'est pas encore identifié.

La version exacte de RouterOS n'est pas encore connue.

## 04.2 — Administration

L'administration actuelle du système se fait via :

**Mikmon Server**

L'utilisateur dispose actuellement d'un accès administrateur et peut gérer directement le système depuis son PC lorsqu'il est connecté au réseau Wi-Fi de la boutique.

Il peut notamment :

* accéder au système ;
* sélectionner des profils ;
* créer des utilisateurs/tickets ;
* modifier les profils ;
* générer des tickets ;
* générer les lots de tickets ;
* exporter les tickets en PDF.

Cela constitue un point particulièrement important :

> L'administration du système n'est pas hors de portée du projet. L'utilisateur possède déjà une capacité opérationnelle sur le Hotspot.

---

# 05 — HOTSPOT EXISTANT

Un Hotspot MikroTik est déjà configuré.

Le système actuel possède :

* un portail captif personnalisé ;
* des profils utilisateurs ;
* des tickets ;
* des durées d'accès ;
* un système d'expiration ;
* une déconnexion automatique ;
* un affichage du temps restant ;
* un affichage d'informations réseau.

Le portail est personnalisé pour :

**Téo Graciel 7G**

Il affiche notamment :

* le nom de la boutique ;
* le numéro de téléphone de la propriétaire ;
* les différentes tarifications ;
* les informations nécessaires à la connexion.

---

# 06 — FONCTIONNEMENT ACTUEL DES TICKETS

## 06.1 — Génération

Les tickets sont générés depuis Mikmon Server.

Le processus est :

```text
Connexion au réseau
        ↓
Ouverture de Mikmon Server
        ↓
Authentification administrateur
        ↓
Sélection du profil
        ↓
Génération d'un lot
        ↓
Export PDF
        ↓
Impression
        ↓
Découpage physique des tickets
```

L'utilisateur réalise actuellement cette opération lui-même.

## 06.2 — Distribution

Les tickets générés sont imprimés.

La propriétaire conserve physiquement les tickets et les distribue aux clients lors de la vente.

---

# 07 — FORMAT DES IDENTIFIANTS

Les tickets utilisent :

```text
USERNAME = PASSWORD
```

Il n'existe donc pas actuellement de distinction opérationnelle entre :

* nom d'utilisateur ;
* mot de passe.

Le client utilise essentiellement le code/ticket comme identifiant d'accès.

Le fonctionnement exact du portail devra néanmoins être vérifié en Phase 1 afin de déterminer comment le MikroTik traite techniquement cette authentification.

---

# 08 — LOGIQUE ACTUELLE DES PROFILS

Les durées sont configurées dans les **Hotspot User Profiles**.

Tarification actuellement communiquée :

|       Prix |     Durée |
| ---------: | --------: |
|   100 FCFA |  5 heures |
|   200 FCFA | 12 heures |
|   300 FCFA | 24 heures |
|   500 FCFA | 48 heures |
| 1 000 FCFA | 1 semaine |
| 4 000 FCFA |    1 mois |

Les tickets ne possèdent actuellement pas de quota de données connu.

Le modèle commercial actuel est donc principalement :

```text
PRIX
↓
PROFIL
↓
DURÉE
```

et non :

```text
PRIX
↓
DURÉE
+
VOLUME DE DONNÉES
```

---

# 09 — EXPIRATION DES ACCÈS

Le comportement actuel est automatisé.

Lorsqu'un utilisateur se connecte avec un ticket :

```text
Ticket valide
 ↓
Profil identifié
 ↓
Durée appliquée
 ↓
Décompte commencé
 ↓
Temps restant affiché
 ↓
Durée épuisée
 ↓
Utilisateur déconnecté
 ↓
Nouvelle authentification nécessaire
```

Exemple :

```text
Ticket 100 FCFA
↓
Profil correspondant
↓
5 heures
↓
5:00:00
↓
4:59:59
↓
...
↓
00:00:00
↓
Déconnexion
```

Cette fonctionnalité existante doit être **préservée autant que possible**.

Le projet ne doit pas recréer inutilement cette logique si le MikroTik la gère déjà correctement.

---

# 10 — PARCOURS CLIENT ACTUEL

```text
1. Client se connecte au Wi-Fi
        ↓
2. Portail captif
        ↓
3. Client possède déjà un ticket
        ↓
4. Il entre son code
        ↓
5. MikroTik valide
        ↓
6. Accès Internet
        ↓
7. Décompte de la durée
        ↓
8. Expiration
        ↓
9. Déconnexion automatique
```

---

# 11 — PROCESSUS COMMERCIAL ACTUEL

Lorsqu'un client souhaite par exemple un accès de 100 FCFA :

```text
Client
 ↓
Paie 100 FCFA à la propriétaire
 ↓
Propriétaire prend un ticket physique
 ↓
Ticket remis au client
 ↓
Client entre le code
 ↓
Connexion
```

Le ticket est donc actuellement :

> un produit physique représentant un droit d'accès numérique.

---

# 12 — VISION CIBLE

Le système cible doit permettre deux parcours principaux.

## 12.1 — Parcours A : client possédant déjà un ticket

```text
Wi-Fi
 ↓
Portail captif
 ↓
"J'ai déjà un ticket"
 ↓
Entrée du code
 ↓
Validation
 ↓
MikroTik
 ↓
Accès
```

Ce parcours doit rester extrêmement simple.

---

# 13 — PARCOURS B : client sans ticket

```text
Wi-Fi
 ↓
Portail captif
 ↓
"Je veux acheter un accès"
 ↓
Affichage des offres
 ↓
Sélection
 ↓
Création de commande
 ↓
Paiement
 ↓
Confirmation fiable
 ↓
Attribution d'un ticket
 ↓
Affichage / livraison du ticket
 ↓
Authentification
 ↓
Accès Wi-Fi
```

Le système devra notamment gérer le cas critique :

```text
Paiement confirmé
        ↓
Ticket disponible ?
        ↓
      OUI
        ↓
Attribution
```

mais également :

```text
Paiement confirmé
        ↓
Ticket indisponible
        ↓
Ne pas perdre la transaction
        ↓
Procédure de récupération / résolution
```

Cette situation devra être spécifiée en profondeur dans les phases ultérieures.

---

# 14 — OBJECTIFS DU PROJET

## Objectif principal

Automatiser la vente d'accès Wi-Fi tout en conservant le fonctionnement réseau existant autant que possible.

## Objectifs secondaires

### O1 — Réduire l'intervention humaine

La propriétaire ne devrait plus être obligée d'être physiquement présente pour chaque vente.

### O2 — Permettre le paiement numérique

Un client sans ticket doit pouvoir acheter un accès depuis le portail captif.

### O3 — Automatiser l'attribution

Après confirmation du paiement, le système doit pouvoir attribuer automatiquement un accès.

### O4 — Préserver le contrôle MikroTik

Le MikroTik doit continuer à gérer les droits d'accès, les durées et les déconnexions lorsque cela constitue la meilleure architecture.

### O5 — Réduire les coûts

Les frais liés au paiement doivent être minimisés.

Cette contrainte est particulièrement importante pour les petites transactions.

Une commission élevée sur un ticket de :

```text
100 FCFA
```

peut rendre l'automatisation commercialement peu intéressante.

### O6 — Améliorer l'autonomie du commerce

La boutique doit pouvoir vendre des accès même lorsque la propriétaire n'est pas physiquement devant le point de vente.

---

# 15 — CONTRAINTE ÉCONOMIQUE MAJEURE

Le prix minimum actuel est :

**100 FCFA.**

Le système doit donc être conçu avec une forte sensibilité aux frais de transaction.

Exemple problématique :

```text
Prix du ticket : 100 FCFA
Frais client : 9 FCFA
Total payé : 109 FCFA
```

Une telle structure peut diminuer fortement l'intérêt commercial du système.

La recherche devra donc déterminer :

* les opérateurs disponibles ;
* les API disponibles ;
* les frais ;
* les frais fixes éventuels ;
* les commissions ;
* les frais supportés par le client ;
* les frais supportés par la propriétaire ;
* les conditions de règlement ;
* la possibilité d'un règlement direct vers le compte de la propriétaire ;
* les éventuelles contraintes liées aux comptes personnels ;
* la possibilité d'utiliser MTN ;
* la possibilité d'utiliser Celtis ;
* la possibilité d'ajouter Moov ou d'autres solutions si cela est pertinent.

**Aucune décision définitive de fournisseur de paiement n'est prise en Phase 0.**

---

# 16 — COMPTES DE PAIEMENT EXISTANTS

La propriétaire utilise actuellement :

* MTN Mobile Money ;
* Celtis.

Les comptes sont actuellement des numéros personnels.

Les numéros sont connus de l'utilisateur.

Cela ne signifie cependant pas encore que ces comptes personnels sont techniquement ou contractuellement compatibles avec une API de paiement automatisée.

Cette question devra être vérifiée pendant l'étude de paiement.

---

# 17 — PÉRIMÈTRE DU PROJET

## 17.1 — Inclus

Le projet devra potentiellement couvrir :

### Réseau

* intégration au Hotspot MikroTik existant ;
* portail captif ;
* authentification ;
* gestion des tickets ;
* synchronisation ou création d'accès ;
* gestion de l'expiration.

### Application

* portail client ;
* affichage des offres ;
* achat ;
* paiement ;
* suivi de transaction ;
* récupération du ticket ;
* affichage du ticket ;
* gestion des erreurs.

### Backend

* commandes ;
* paiements ;
* tickets ;
* offres ;
* états ;
* historique ;
* événements de paiement ;
* logs ;
* sécurité.

### Administration

À terme, un espace d'administration pourra permettre à la propriétaire de consulter :

* ventes ;
* revenus ;
* tickets ;
* stock ;
* transactions ;
* offres ;
* historique ;
* état du système.

### Exploitation

* logs ;
* sauvegardes ;
* surveillance ;
* gestion des erreurs ;
* procédures de récupération.

---

# 18 — HORS PÉRIMÈTRE INITIAL

Les éléments suivants ne constituent pas des priorités de Phase 0 :

* remplacement du MikroTik ;
* remplacement du routeur Huawei ;
* reconstruction complète du réseau ;
* changement obligatoire du système Hotspot ;
* modification destructive de la configuration actuelle ;
* création immédiate d'un nouveau système de tickets ;
* choix définitif d'une technologie avant reverse engineering ;
* développement immédiat de l'application.

Principe :

> **On intègre d'abord ce qui fonctionne déjà avant d'envisager de le remplacer.**

---

# 19 — PRINCIPLE D'INTÉGRATION

Le projet doit suivre une logique **minimally invasive**.

L'infrastructure actuelle fonctionne.

Il serait donc dangereux de partir de l'hypothèse :

```text
Ancien système
↓
On supprime
↓
On reconstruit tout
```

La stratégie privilégiée est :

```text
INFRASTRUCTURE EXISTANTE
        ↓
REVERSE ENGINEERING
        ↓
COMPRÉHENSION
        ↓
POINTS D'INTÉGRATION
        ↓
AUTOMATISATION
        ↓
VALIDATION
```

Le projet doit préserver les fonctions existantes qui sont déjà fiables.

---

# 20 — PRINCIPE D'AUTORITÉ DU SYSTÈME

Le frontend ne doit jamais être considéré comme une autorité.

Par exemple :

```text
Frontend
→ "Paiement réussi"
```

ne doit jamais suffire à attribuer un accès.

L'autorité doit venir du backend et de la confirmation réelle du système de paiement.

Architecture conceptuelle :

```text
CLIENT
 ↓
FRONTEND
 ↓
BACKEND
 ↓
PAYMENT PROVIDER
 ↓
CONFIRMATION
 ↓
BACKEND
 ↓
TICKET / MIKROTIK
```

---

# 21 — DISTINCTION DES ÉTATS DE PAIEMENT

Le système devra distinguer au minimum :

```text
PAYMENT INITIATED
        ↓
PAYMENT PENDING
        ↓
PAYMENT CONFIRMED
```

et les états d'échec :

```text
PAYMENT FAILED
PAYMENT CANCELLED
PAYMENT EXPIRED
```

La réception d'une demande de paiement ne doit donc jamais être considérée comme une confirmation.

---

# 22 — IDEMPOTENCE ET DUPLICATION

Le système devra prévoir le risque qu'un fournisseur de paiement transmette plusieurs fois le même événement.

Exemple :

```text
Webhook paiement
↓
Commande confirmée
↓
Ticket attribué
```

Si le même webhook arrive une seconde fois :

```text
Même transaction
↓
NE PAS attribuer un deuxième ticket
```

La conception devra donc rendre les opérations critiques idempotentes.

---

# 23 — GESTION DES TICKETS

Le modèle cible devra probablement gérer un état de stock.

Modèle conceptuel proposé :

```text
AVAILABLE
   ↓
RESERVED
   ↓
SOLD
   ↓
USED
```

avec potentiellement :

```text
CANCELLED
EXPIRED
REFUNDED
```

Cependant, ce modèle reste à confirmer après étude du fonctionnement réel de Mikmon/MikroTik.

---

# 24 — DEUX STRATÉGIES TECHNIQUES À ÉTUDIER

Le projet ne doit pas choisir prématurément entre les deux.

## Option A — Stock de tickets pré-générés

```text
Mikmon
 ↓
Génération de tickets
 ↓
Base de données
 ↓
Tickets disponibles
 ↓
Paiement
 ↓
Attribution d'un ticket
```

Avantage potentiel :

* proche du fonctionnement actuel ;
* faible modification du MikroTik ;
* logique déjà maîtrisée.

## Option B — Création dynamique

```text
Paiement
 ↓
Backend
 ↓
API MikroTik / autre mécanisme
 ↓
Création d'un utilisateur
 ↓
Profil correspondant
 ↓
Accès
```

Avantage potentiel :

* pas besoin de gérer un stock physique de tickets ;
* automatisation plus poussée.

Mais cette stratégie peut demander une intégration beaucoup plus profonde avec le MikroTik.

**La décision est volontairement reportée à la Phase 6 — MikroTik Integration.**

---

# 25 — ARCHITECTURE CONCEPTUELLE CIBLE

Architecture abstraite :

```text
                    INTERNET
                       │
                       ▼
              PAYMENT PROVIDER
                       │
                       │ confirmation
                       ▼
┌─────────────────────────────────────────┐
│              BACKEND                    │
│                                         │
│ Orders                                  │
│ Payments                                │
│ Tickets                                 │
│ Offers                                  │
│ Security                                │
│ Logs                                    │
└────────────────────┬────────────────────┘
                     │
                     │ integration
                     ▼
              ┌──────────────┐
              │   MIKROTIK   │
              │    HOTSPOT   │
              └──────┬───────┘
                     │
                     ▼
                  CLIENT
                     │
                     ▼
              CAPTIVE PORTAL
                     │
          ┌──────────┴──────────┐
          │                     │
     EXISTING TICKET       BUY ACCESS
          │                     │
          │                     ▼
          │                 PAYMENT
          │                     │
          │                     ▼
          │              TICKET / ACCESS
          │                     │
          └──────────┬──────────┘
                     ▼
                INTERNET
```

Cette architecture est conceptuelle et **ne constitue pas encore une architecture technique validée**.

---

# 26 — CONTRAINTE PARTICULIÈRE DU CAPTIVE PORTAL

Le client peut être connecté au Wi-Fi sans disposer encore d'un accès Internet complet.

Le système devra donc permettre au client non authentifié d'accéder aux ressources nécessaires au parcours captif.

Conceptuellement :

```text
CLIENT NON AUTHENTIFIÉ
        │
        ├── Portail captif → AUTORISÉ
        │
        ├── Backend nécessaire → AUTORISÉ
        │
        ├── Paiement nécessaire → À ÉTUDIER
        │
        └── Internet général → BLOQUÉ
```

La manière exacte de réaliser cela devra être déterminée lors du reverse engineering du MikroTik.

---

# 27 — EXPÉRIENCE UTILISATEUR

L'expérience doit respecter une règle fondamentale :

> Le client ne doit pas avoir besoin de comprendre l'architecture réseau pour utiliser le service.

Le parcours doit lui expliquer clairement :

* où il se trouve ;
* ce qu'il peut faire ;
* quelle offre il choisit ;
* si le paiement est en cours ;
* si le paiement a réussi ;
* si son ticket est disponible ;
* comment se connecter ;
* pourquoi une action a échoué ;
* quoi faire ensuite.

Cette exigence reprend directement le principe UX selon lequel la compréhension immédiate constitue une fonctionnalité et selon lequel chaque étape importante doit rendre clair ce qui se passe et quelle est l'action suivante.

---

# 28 — ÉTATS UX À PRÉVOIR

Le système devra prévoir explicitement :

```text
DEFAULT
LOADING
PAYMENT PENDING
PAYMENT SUCCESS
PAYMENT FAILED
TICKET DELIVERED
TICKET UNAVAILABLE
NETWORK ERROR
SERVICE UNAVAILABLE
INVALID TICKET
EXPIRED TICKET
ALREADY USED TICKET
```

Cette logique est importante car l'expérience ne doit pas seulement être conçue pour le cas nominal. Le référentiel UX impose également de penser les états, feedbacks, erreurs et mécanismes de récupération.

---

# 29 — SÉCURITÉ — RISQUES À PRENDRE EN COMPTE

Le système devra notamment se protéger contre :

* modification du prix depuis le frontend ;
* falsification d'une commande ;
* réutilisation d'une transaction ;
* faux webhook ;
* replay d'un webhook ;
* double attribution de ticket ;
* découverte de tickets ;
* brute force sur les codes ;
* exposition des secrets ;
* accès non autorisé à l'administration ;
* injection ;
* manipulation des identifiants ;
* création artificielle de commandes ;
* fraude sur les statuts de paiement.

Aucune architecture de sécurité détaillée n'est arrêtée en Phase 0.

---

# 30 — FIABILITÉ — SCÉNARIOS CRITIQUES

Le système doit explicitement prévoir les cas suivants :

## Cas 1

```text
Client paie
↓
Paiement confirmé
↓
Tout fonctionne
↓
Ticket livré
```

## Cas 2

```text
Client paie
↓
Paiement en attente
```

Le système ne doit pas attribuer prématurément le ticket.

## Cas 3

```text
Client paie
↓
Paiement confirmé
↓
Client perd sa connexion
```

La transaction doit rester récupérable.

## Cas 4

```text
Paiement confirmé
↓
Ticket non attribué
```

Le système doit permettre une résolution fiable.

## Cas 5

```text
Paiement confirmé
↓
MikroTik indisponible
```

Le paiement ne doit pas simplement disparaître.

## Cas 6

```text
Webhook reçu deux fois
```

Une seule vente doit être enregistrée.

## Cas 7

```text
Ticket déjà utilisé
```

Le système doit le détecter correctement.

---

# 31 — CONTRAINTES TECHNIQUES CONNUES

## Contraintes confirmées

* MikroTik déjà opérationnel ;
* Hotspot déjà configuré ;
* portail captif personnalisé ;
* administration via Mikmon Server ;
* tickets déjà générés ;
* profils déjà configurés ;
* expiration automatique ;
* déconnexion automatique ;
* infrastructure Huawei + MikroTik ;
* accès administratif local existant.

## Contraintes encore inconnues

* modèle exact du MikroTik ;
* version exacte de RouterOS ;
* modèle exact du Huawei ;
* topologie réseau exacte ;
* méthode exacte utilisée par Mikmon Server pour communiquer avec le MikroTik ;
* configuration Hotspot détaillée ;
* configuration firewall ;
* NAT ;
* DNS ;
* DHCP ;
* walled garden ;
* méthode exacte de génération des utilisateurs ;
* format interne des tickets ;
* méthode d'intégration disponible ;
* accessibilité éventuelle du MikroTik depuis Internet ;
* possibilité d'utiliser directement une API MikroTik ;
* mécanisme exact du portail personnalisé ;
* mécanisme de décompte exact.

---

# 32 — DÉCISIONS PRISES EN PHASE 0

Les décisions suivantes sont désormais établies.

### D01

Le projet sera traité comme un **Wi-Fi Access & Payment System**, et non comme un simple site web.

### D02

Le MikroTik existant doit être considéré comme une infrastructure à intégrer avant d'être remplacée.

### D03

Aucune modification destructive ne doit être effectuée avant reverse engineering.

### D04

La vente doit pouvoir fonctionner sans intervention physique systématique de la propriétaire.

### D05

Le système doit conserver le parcours de connexion avec un ticket existant.

### D06

Le système doit permettre l'achat numérique d'un accès.

### D07

La confirmation du paiement doit être fiable avant l'attribution de l'accès.

### D08

Les frais de paiement doivent être minimisés.

### D09

Le système doit être capable de gérer au minimum les petites transactions de 100 FCFA.

### D10

Le nombre d'opérateurs de paiement n'est pas encore figé.

### D11

La stratégie de tickets pré-générés ou de création dynamique n'est pas encore figée.

### D12

La technologie frontend/backend/database n'est pas encore figée.

---

# 33 — DÉCISIONS VOLONTAIREMENT REPORTÉES

Les décisions suivantes ne doivent pas être prises maintenant :

* choix du framework frontend ;
* choix du backend ;
* choix de la base de données ;
* choix définitif du fournisseur de paiement ;
* choix entre MTN et Celtis ;
* choix d'un agrégateur ;
* choix d'une architecture de paiement multi-opérateurs ;
* choix entre tickets pré-générés et création dynamique ;
* choix entre MikroTik API, RADIUS ou autre mécanisme ;
* hébergement ;
* domaine ;
* infrastructure cloud ;
* architecture exacte du portail ;
* design final ;
* dashboard administrateur final.

Ces décisions doivent être prises **après collecte des informations nécessaires**.

---

# 34 — RISQUES MAJEURS

## R01 — Intégration MikroTik

Le principal risque technique est l'intégration avec la configuration existante sans casser le Hotspot.

**Niveau : ÉLEVÉ**

## R02 — Paiement de faible montant

Les frais de transaction peuvent rendre les petites offres non rentables.

**Niveau : ÉLEVÉ**

## R03 — Confirmation du paiement

Une mauvaise gestion des confirmations peut provoquer :

```text
argent débité
+
aucun accès
```

**Niveau : CRITIQUE**

## R04 — Disponibilité des tickets

Une automatisation mal conçue peut attribuer deux fois le même ticket.

**Niveau : ÉLEVÉ**

## R05 — Dépendance réseau

Le portail et le paiement doivent fonctionner dans le contexte particulier d'un utilisateur qui n'est pas encore authentifié au réseau.

**Niveau : ÉLEVÉ**

## R06 — Compte de paiement personnel

Les possibilités d'automatisation peuvent dépendre du type de compte utilisé.

**Niveau : À VÉRIFIER**

## R07 — Maintenance

Le système devra rester exploitable par une personne qui n'est pas nécessairement développeuse.

**Niveau : MOYEN / ÉLEVÉ**

---

# 35 — CRITÈRES DE SUCCÈS DU PROJET

Le projet sera considéré comme réussi lorsque les conditions suivantes seront réunies.

## Fonctionnel

```text
Client
↓
Wi-Fi
↓
Portail
↓
Choix
↓
Paiement
↓
Confirmation
↓
Accès
```

fonctionne de manière fiable.

## Réseau

Le MikroTik continue correctement à :

* authentifier ;
* appliquer les profils ;
* compter la durée ;
* déconnecter les utilisateurs à expiration.

## Commercial

La propriétaire peut vendre des accès sans devoir remettre manuellement chaque ticket.

## Économique

Les frais de paiement sont suffisamment faibles pour préserver l'intérêt commercial des offres, notamment celle à 100 FCFA.

## Fiabilité

Les scénarios d'échec critiques disposent d'un mécanisme de récupération.

## Sécurité

Un client ne peut pas simplement manipuler le frontend pour obtenir gratuitement un accès.

## Exploitabilité

La propriétaire peut comprendre et utiliser le système sans devoir connaître son architecture technique interne.

---

# 36 — PRINCIPES DE CONCEPTION DU PROJET

Le système devra suivre les principes suivants :

### P1 — User first

Commencer par le besoin réel du client, puis choisir la technologie.

### P2 — Clarity before complexity

Le parcours doit être immédiatement compréhensible.

### P3 — Existing infrastructure first

Réutiliser l'existant lorsqu'il fonctionne correctement.

### P4 — Security by design

La sécurité ne doit pas être ajoutée à la fin.

### P5 — Payment is a state machine

Une tentative de paiement n'est pas une confirmation.

### P6 — Backend authority

Le frontend ne décide jamais seul qu'un paiement est valide.

### P7 — Idempotency

Une même transaction ne doit pas produire plusieurs ventes.

### P8 — Minimal intervention

Les modifications du MikroTik doivent être limitées au strict nécessaire.

### P9 — Recoverability

Toute opération critique doit pouvoir être diagnostiquée et récupérée.

### P10 — Progressive complexity

Commencer par un système fonctionnel et robuste avant d'ajouter des fonctions avancées.

Le référentiel UX confirme cette logique : une expérience peut devenir sophistiquée, mais la complexité doit être justifiée et la hiérarchie doit précéder les effets ou mécanismes avancés.

---

# 37 — PHILOSOPHIE DU PROJET

Le projet ne doit pas être pensé comme :

> « Comment créer un joli site permettant de payer un Wi-Fi ? »

Mais comme :

> **« Comment transformer une infrastructure Wi-Fi existante en un système fiable de vente, paiement, attribution et contrôle d'accès automatisé ? »**

Le site n'est que la partie visible.

Le véritable système est :

```text
NETWORK
+
CAPTIVE PORTAL
+
BACKEND
+
PAYMENT
+
TICKET MANAGEMENT
+
MIKROTIK
+
SECURITY
+
OBSERVABILITY
```

---

# 38 — LIVRABLES ATTENDUS DES PHASES SUIVANTES

## Phase 1

### Existing Infrastructure Blueprint

Documentant :

* Huawei ;
* MikroTik ;
* RouterOS ;
* Hotspot ;
* profils ;
* tickets ;
* portail ;
* réseau ;
* firewall ;
* NAT ;
* DHCP ;
* DNS ;
* walled garden ;
* administration ;
* points d'intégration.

## Phase 2

### Payment Integration Decision

Comparaison des solutions disponibles au Bénin selon :

* API ;
* coût ;
* frais ;
* settlement ;
* comptes personnels/merchant ;
* MTN ;
* Celtis ;
* autres opérateurs ;
* sandbox ;
* webhooks ;
* fiabilité ;
* compatibilité avec les petits montants.

## Phase 3

### System Architecture Blueprint

Définition de l'architecture cible.

## Phase 4

### UX & State Flow Specification

Définition de tous les parcours utilisateurs et états.

## Phase 5

### Backend & Data Specification

Définition des données et règles métier.

## Phase 6

### MikroTik Integration Specification

Décision technique finale concernant l'intégration.

## Phase 7

### Web Application Specification

Définition du portail et de l'application client.

## Phase 8

### Admin Dashboard Specification

Définition de l'interface de gestion.

## Phase 9

### Security & Reliability Specification

Tests et protections.

## Phase 10

### Deployment & Operations Specification

Mise en production, sauvegardes, monitoring et maintenance.

---

# 39 — RÈGLE DE GOUVERNANCE DU PROJET

Aucune phase ne doit être sautée simplement parce qu'une technologie semble évidente.

Le processus doit rester :

```text
COMPRENDRE
   ↓
DOCUMENTer
   ↓
DÉCIDER
   ↓
ARCHITECTURER
   ↓
SPÉCIFIER
   ↓
IMPLÉMENTER
   ↓
TESTER
   ↓
DÉPLOYER
   ↓
MAINTENIR
```

Il est particulièrement important de ne pas commencer par le développement frontend.

---

# 40 — ÉTAT DU PROJET À LA FIN DE LA PHASE 0

## Ce que nous savons

Le système actuel fonctionne déjà avec :

```text
Huawei
 ↓
MikroTik
 ↓
Hotspot
 ↓
Mikmon Server
 ↓
Tickets
 ↓
Profils
 ↓
Décompte
 ↓
Expiration
```

La génération des tickets est maîtrisée par l'utilisateur.

La distribution physique est réalisée par la propriétaire.

Les offres commerciales sont connues.

Les comptes MTN et Celtis sont connus.

---

## Ce que nous ne savons pas encore

Les détails techniques internes du MikroTik et du réseau.

Nous ne connaissons notamment pas :

* le modèle exact ;
* RouterOS ;
* la topologie ;
* les règles réseau ;
* la configuration Hotspot ;
* les mécanismes internes du portail ;
* les possibilités exactes d'intégration ;
* les possibilités exactes des systèmes de paiement.

---

# 41 — CONDITION DE PASSAGE À LA PHASE 1

La Phase 0 est considérée comme **suffisamment cadrée**.

Le projet peut maintenant passer à :

# PHASE 1 — REVERSE ENGINEERING DE L'INFRASTRUCTURE EXISTANTE

L'objectif de cette phase sera de répondre à une seule grande question :

> **« Comment fonctionne réellement aujourd'hui l'installation Téo Graciel 7G, techniquement ? »**

Nous devrons cartographier le système avant de toucher à sa configuration.

La Phase 1 devra notamment identifier :

```text
ROUTEUR HUAWEI
      ↓
TOPOLOGIE
      ↓
MIKROTIK
      ↓
ROUTEROS
      ↓
HOTSPOT
      ↓
CAPTIVE PORTAL
      ↓
USER PROFILES
      ↓
TICKETS
      ↓
AUTHENTIFICATION
      ↓
EXPIRATION
      ↓
FIREWALL / NAT / DNS
      ↓
POINTS D'INTÉGRATION
```

---

# 42 — PROCHAINE ÉTAPE

**Phase suivante : PHASE 1 — Existing Infrastructure Reverse Engineering**

### Objectif immédiat

Identifier précisément :

1. le modèle du MikroTik ;
2. la version RouterOS ;
3. le modèle du Huawei si possible ;
4. la topologie réseau ;
5. la configuration Hotspot ;
6. le fonctionnement des profils ;
7. le fonctionnement des tickets ;
8. le portail captif ;
9. les règles d'accès avant authentification ;
10. les possibilités d'intégration sans casser l'installation.

**Aucune implémentation de la plateforme de paiement ne commence avant cette analyse.**
