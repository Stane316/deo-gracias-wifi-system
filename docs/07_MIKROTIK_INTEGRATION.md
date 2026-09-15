# `07_MIKROTIK_INTEGRATION.md`

````markdown
# 07 — MIKROTIK INTEGRATION

**Projet :** Déo Gracias — Wi-Fi Access & Online Payment System  
**Phase :** 6 — MikroTik Integration  
**Document :** `07_MIKROTIK_INTEGRATION.md`  
**Statut :** VALIDÉ — Architecture d'intégration définie  
**Version :** 1.0  
**Date :** 15 septembre 2026  

---

# 00 — DOCUMENT CONTROL

## 00.1 — Purpose

Ce document définit l'intégration technique entre le système logiciel
Déo Gracias et l'infrastructure réseau MikroTik existante.

Il constitue le contrat technique de référence pour :

- la Phase 7 — Web Application ;
- la future implémentation du Connector MikroTik ;
- la génération et la gestion des tickets numériques ;
- la synchronisation entre le backend et le réseau ;
- les futures évolutions de l'infrastructure ;
- les agents IA chargés du développement.

Aucune implémentation future ne doit contredire les décisions,
contraintes et invariants définis dans ce document sans modification
explicite de celui-ci.

---

# 01 — OBJECTIFS DE LA PHASE

La Phase 6 avait pour objectif de comprendre précisément :

1. l'identité et les capacités du routeur ;
2. la topologie réseau ;
3. le fonctionnement du DHCP ;
4. le fonctionnement du DNS ;
5. le HotSpot ;
6. les profils utilisateurs ;
7. les tickets ;
8. Mikmon ;
9. l'authentification ;
10. les mécanismes d'expiration ;
11. les règles Firewall/NAT ;
12. le Walled Garden ;
13. les scripts existants ;
14. les services d'administration ;
15. les possibilités d'intégration API ;
16. les contraintes matérielles ;
17. les risques liés à l'automatisation.

La phase devait également permettre de déterminer la stratégie
d'intégration du futur système de paiement avec le réseau existant.

---

# 02 — DÉCISION ARCHITECTURALE PRINCIPALE

## 02.1 — Décision

Le système adoptera une architecture :

```text
CLIENT
  │
  ▼
WI-FI
  │
  ▼
MIKROTIK HOTSPOT
  │
  ├──────────────► TICKET EXISTANT
  │
  │
  ▼
PORTAIL / WEB APPLICATION
  │
  ▼
BACKEND CLOUD
  │
  ├── DATABASE
  │
  ├── PAYMENT PROVIDER
  │
  └── TICKET INVENTORY
          │
          ▼
     LOCAL CONNECTOR
          │
          ▼
       MIKROTIK
````

Le MikroTik reste responsable du contrôle réseau.

Le backend reste responsable de la logique métier.

Le Connector constitue la frontière entre le cloud et l'infrastructure
locale.

---

# 03 — PRINCIPES D'INTÉGRATION

## 03.1 — Séparation des responsabilités

Le système est divisé en plusieurs autorités.

### Backend

Responsable de :

* plans commerciaux ;
* prix ;
* durée commerciale ;
* commandes ;
* paiements ;
* attribution des tickets ;
* inventaire numérique ;
* états métier ;
* incidents ;
* audit ;
* orchestration.

### MikroTik

Responsable de :

* connectivité ;
* DHCP ;
* DNS ;
* HotSpot ;
* authentification réseau ;
* sessions ;
* limitation d'utilisation ;
* expiration effective ;
* état réseau.

### Mikmon

Responsable dans le MVP de :

* génération des tickets ;
* génération des lots ;
* impression des tickets ;
* opérations de génération manuelle.

### Connector

Responsable de :

* communication sécurisée avec le backend ;
* communication locale avec MikroTik ;
* lecture de l'état réseau ;
* synchronisation contrôlée ;
* opérations MikroTik autorisées ;
* retry ;
* remontée des erreurs.

---

# 04 — INFRASTRUCTURE MIKROTIK IDENTIFIÉE

## 04.1 — Équipement

Routeur :

```text
Manufacturer : MikroTik
Board        : RB951Ui-2HnD
Model        : 951Ui-2HnD
Revision     : r3
Architecture : mipsbe
CPU          : MIPS 74Kc V4.12
CPU          : 600 MHz
CPU cores    : 1
RAM          : 128 MiB
Storage      : 128 MiB
```

État observé :

```text
Free memory : ~92.8 MiB
Free HDD    : ~104.7 MiB
Bad blocks  : 0%
CPU load    : ~4%
```

---

# 05 — VERSION ROUTEROS

Version actuellement observée :

```text
RouterOS : 6.49.17
Status   : stable
```

Firmware :

```text
Factory firmware : 6.49.17
Current firmware : 6.49.17
Upgrade firmware : 6.49.17
```

Le système doit donc être conçu pour RouterOS 6.49.17.

---

# 06 — TOPOLOGIE RÉSEAU

## 06.1 — Bridge LAN

Bridge principal :

```text
DEOGRACIAS
```

Mode :

```text
RSTP
VLAN filtering : no
```

Interfaces membres observées :

```text
ether2
ether3
ether4
ether5
wlan1
```

`ether2` et `ether3` sont actuellement actifs avec hardware offload.

`ether4` et `ether5` sont actuellement inactifs.

`wlan1` appartient au bridge.

---

# 07 — INTERFACES ET ADRESSAGE

## 07.1 — LAN

Interface :

```text
DEOGRACIAS
```

Adresse :

```text
192.168.88.254/24
```

Réseau :

```text
192.168.88.0/24
```

---

## 07.2 — WAN

Interface :

```text
ether1
```

Adresse dynamique observée :

```text
192.168.100.7/24
```

Gateway :

```text
192.168.100.1
```

Route par défaut :

```text
0.0.0.0/0 → 192.168.100.1
```

---

# 08 — DHCP

Serveur DHCP :

```text
dhcp1
```

Interface :

```text
DEOGRACIAS
```

Pool :

```text
dhcp_pool0
```

Plage observée :

```text
192.168.88.1
→
192.168.88.253
```

Gateway distribué :

```text
192.168.88.254
```

DNS distribués :

```text
8.8.8.8
8.8.4.4
```

Lease time :

```text
1d10m
```

---

# 09 — DNS

Serveurs DNS :

```text
8.8.8.8
8.8.4.4
```

Serveur dynamique observé :

```text
192.168.100.1
```

DoH :

```text
non configuré
```

Remote requests :

```text
allow-remote-requests = no
```

Cache :

```text
2048 KiB
```

Cache utilisé lors de l'audit :

```text
~237 KiB
```

---

# 10 — HOTSPOT

## 10.1 — HotSpot Server

Nom :

```text
hotspot1
```

Interface :

```text
DEOGRACIAS
```

Address pool :

```text
dhcp_pool0
```

Profile :

```text
hsprof1
```

DNS name :

```text
192.168.88.254
```

Proxy :

```text
running
```

Idle timeout :

```text
00:05:00
```

Keepalive :

```text
non spécifié au niveau serveur
```

Login timeout :

```text
non spécifié
```

Addresses per MAC :

```text
1
```

---

# 11 — HOTSPOT AUTHENTICATION

Le profil HotSpot utilise notamment :

```text
HTTP CHAP : yes
HTTP PAP  : yes
HTTPS     : no
Cookie    : yes
MAC Cookie: yes
Trial     : no
MAC       : no
```

RADIUS :

```text
use RADIUS      : yes
interim update  : yes
```

NAS Port Type :

```text
wireless-802.11
```

Les paramètres RADIUS détaillés n'ont pas été entièrement
caractérisés dans cette phase.

Ils constituent donc un point de vérification future avant toute
automatisation de l'authentification.

Ils ne bloquent cependant pas la Phase 7.

---

# 12 — HOTSPOT USER PROFILES

Les profils commerciaux actuellement observés comprennent :

| Prix observé | Profil MikroTik observé |
| -----------: | ----------------------- |
|      50 FCFA | `1-HEURES`              |
|     100 FCFA | `5-HEURES`              |
|     200 FCFA | `12-HEURES`             |
|     300 FCFA | `24-HEURES`             |
|     500 FCFA | `72-HEURES`             |
|    1000 FCFA | `1-SEMAINE`             |
|    4000 FCFA | nom exact non confirmé  |
|    5000 FCFA | profil non confirmé     |

Profils non commerciaux observés :

```text
Admin-free
default
```

---

# 13 — IMPORTANT : LES PROFILS MIKROTIK NE SONT PAS LA SOURCE COMMERCIALE

Le système ne doit pas considérer les profils MikroTik comme la
source de vérité des offres commerciales.

Les offres commerciales officielles sont :

|       Prix | Durée commerciale |
| ---------: | ----------------- |
|   100 FCFA | 5 heures          |
|   200 FCFA | 12 heures         |
|   300 FCFA | 24 heures         |
|   500 FCFA | 48 heures         |
| 1 000 FCFA | 5 jours           |
| 4 000 FCFA | 10 jours          |
| 5 000 FCFA | 40 jours          |

Des divergences existent actuellement entre les profils MikroTik
et les offres commerciales.

Exemples :

```text
500 FCFA
Commercial : 48h
MikroTik   : 72h

1000 FCFA
Commercial : 5 jours
MikroTik   : 1 semaine
```

Il existe également un profil :

```text
50 FCFA → 1 heure
```

qui ne fait pas partie de la grille commerciale actuellement
retenue.

---

# 14 — RÈGLE DE RÉCONCILIATION COMMERCIALE

Le backend doit utiliser une table `plans` comme source de vérité.

Exemple conceptuel :

```text
PLAN
│
├── commercial price
├── commercial duration
├── MikroTik profile mapping
└── ticket generation parameters
```

Le backend ne doit jamais déduire le prix ou la durée commerciale
à partir d'un profil MikroTik.

Le mapping doit être explicite.

Exemple :

```text
PLAN_500
price = 500
duration = 48h
mikrotik_profile = <à confirmer>
ticket_limit_uptime = 48h
```

Cette distinction est obligatoire afin d'éviter que les divergences
historiques de configuration réseau ne deviennent des divergences
commerciales.

---

# 15 — TICKETS

## 15.1 — Modèle actuel

Le système actuel utilise des tickets HotSpot.

Un ticket possède notamment :

```text
username
password
profile
uptime
Bytes In
Bytes Out
comment
MAC/address
limit-uptime
session timeout
```

Particularité :

```text
username = password
```

Les identifiants sont générés aléatoirement.

Format observé :

```text
lowercase letters + digits
```

---

# 16 — EXPIRATION DES TICKETS

La durée d'un ticket peut être définie via le mécanisme de génération
Mikmon et le champ de limitation d'utilisation.

Exemples observés :

```text
5H
1H
30D
```

Le système doit donc distinguer :

```text
Commercial duration
        ↓
Ticket limit uptime
```

Le profil MikroTik ne doit pas être considéré comme l'unique
mécanisme définissant la durée effective du ticket.

---

# 17 — MIKMON

Mikmon constitue actuellement l'outil opérationnel de génération.

Workflow actuel :

```text
PC local
   ↓
Connexion Wi-Fi
   ↓
Mikmon
   ↓
Authentification administrateur
   ↓
Sélection du profil
   ↓
Quantité
   ↓
Génération username/password
   ↓
Time Limit
   ↓
Génération
   ↓
Export PDF
   ↓
Impression
   ↓
Découpe
   ↓
Vente
```

Mikmon reste dans le périmètre du MVP.

---

# 18 — STRATÉGIE DE GÉNÉRATION MVP

## Décision

Le MVP utilisera des tickets pré-générés.

Le système ne créera pas immédiatement les utilisateurs MikroTik
dynamiquement via API.

Architecture :

```text
MIKMON
  ↓
PRE-GENERATED TICKETS
  ↓
TICKET INVENTORY
  ↓
BACKEND
  ↓
CUSTOMER
```

Cette approche réduit :

* le risque réseau ;
* la complexité ;
* la dépendance à l'API MikroTik ;
* le risque de modifier la configuration existante ;
* les problèmes liés à la connectivité cloud ↔ routeur.

---

# 19 — DIGITAL VS PHYSICAL INVENTORY

Les tickets doivent être séparés selon leur destination.

Valeurs :

```text
DIGITAL
PHYSICAL
```

Un lot de tickets doit donc posséder une destination.

Exemple :

```text
Batch #DG-2026-001
Plan : 100 FCFA / 5h
Quantity : 100
Destination : DIGITAL
```

Un autre lot :

```text
Batch #DG-2026-002
Plan : 100 FCFA / 5h
Quantity : 100
Destination : PHYSICAL
```

---

# 20 — POURQUOI LA SÉPARATION EST OBLIGATOIRE

Un ticket généré n'est pas automatiquement disponible pour la vente
numérique.

Il peut être :

```text
GENERATED
↓
PHYSICAL
↓
PRINTED
↓
SOLD MANUALLY
```

ou :

```text
GENERATED
↓
DIGITAL
↓
AVAILABLE ONLINE
↓
SOLD ONLINE
```

Le backend doit empêcher qu'un ticket destiné au stock physique soit
attribué automatiquement à une commande numérique.

---

# 21 — TICKET BATCH

Le modèle `ticket_batches` doit permettre de suivre :

```text
batch_id
plan_id
destination
quantity
generated_at
generation_source
print_status
import_status
available_quantity
reserved_quantity
sold_quantity
used_quantity
cancelled_quantity
metadata
created_at
updated_at
```

Les valeurs exactes peuvent évoluer lors de la Phase 5/7.

---

# 22 — ÉTATS DU TICKET

Cycle nominal :

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
REFUNDED
```

---

# 23 — ÉTATS DU LOT

Le lot peut être conceptuellement suivi par :

```text
CREATED
↓
GENERATED
↓
IMPORTED
↓
AVAILABLE
↓
DEPLETED
```

Pour les lots physiques :

```text
GENERATED
↓
PRINTED
↓
DISTRIBUTED
```

Le système doit conserver la distinction entre :

```text
printed
```

et :

```text
sold
```

---

# 24 — MIKROTIK COMMENT

Le champ `comment` des utilisateurs MikroTik est actuellement
utilisé par un script On-Login.

Il ne doit donc pas être considéré comme un champ libre destiné au
backend.

Toute modification de sa convention nécessite un test préalable.

Le backend ne doit jamais écraser aveuglément le contenu du champ
`comment`.

---

# 25 — ON-LOGIN SCRIPT

Un script On-Login existe actuellement.

Il effectue notamment :

1. recherche de l'utilisateur ;
2. lecture du commentaire ;
3. extraction d'informations depuis le commentaire ;
4. génération d'une date d'expiration ;
5. création temporaire d'un scheduler ;
6. calcul de la date de fin ;
7. modification du commentaire utilisateur ;
8. collecte de données de session ;
9. création d'une entrée dans `/system script`.

Le script utilise notamment :

```text
comment
username
MAC
address
date
time
profile
```

et identifie ses propres entrées via :

```text
comment = mikhmon
```

---

# 26 — RÈGLE DE COMPATIBILITÉ AVEC LE SCRIPT

Le Connector ne doit pas :

* supprimer le script ;
* modifier le script ;
* renommer le script ;
* remplacer la convention de commentaire ;
* utiliser le commentaire comme identifiant de batch sans validation ;
* créer des utilisateurs dont les données provoquent un comportement
  inattendu du script.

Le script existant est considéré comme une dépendance legacy à
préserver pendant le MVP.

---

# 27 — HOTSPOT ACTIVE SESSIONS

Des sessions actives sont actuellement visibles.

Exemple de données disponibles :

```text
server
user
address
uptime
idle-time
session-timeout
RS state
time wait
```

Le Connector pourra exploiter ces informations pour :

* monitoring ;
* diagnostic ;
* synchronisation ;
* support ;
* administration.

Aucune automatisation destructive ne doit être réalisée à partir de
ces données sans règle métier explicite.

---

# 28 — HOTSPOT HOSTS

Les hosts HotSpot permettent d'observer notamment :

```text
MAC
address
to-address
server
credential type
RS timer
TS wait
```

Ces informations peuvent être utilisées ultérieurement pour le
diagnostic réseau.

Elles ne constituent pas une source commerciale.

---

# 29 — HOTSPOT COOKIES

Des cookies HotSpot sont présents.

Ils permettent notamment d'associer :

```text
user
MAC
expiration
```

Le système applicatif ne doit pas essayer de remplacer ou gérer
directement ces cookies dans le MVP.

Le comportement HotSpot existant doit être conservé.

---

# 30 — IP BINDING

Une entrée IP Binding est actuellement présente :

```text
Type   : P
Address: 192.168.88.200
Server : hotspot1
```

Elle ne doit pas être supprimée ou modifiée sans justification
technique et sauvegarde préalable.

Cette configuration ne doit pas être utilisée comme mécanisme
commercial.

---

# 31 — WALLED GARDEN

État actuel :

```text
Walled Garden : empty
Walled Garden IP List : empty
```

Aucune ouverture générale n'est autorisée.

Lors de l'intégration du portail en ligne, seules les ressources
strictement nécessaires devront être autorisées.

Principe :

```text
ALLOWLIST
rather than
BROAD INTERNET ACCESS
```

Les règles exactes seront définies pendant l'implémentation du portail
et testées sur l'infrastructure réelle.

---

# 32 — FIREWALL

Les règles actuellement observées sont principalement liées au
HotSpot dynamique.

Elles comprennent notamment les chaînes :

```text
hs-unauth
hs-unauth-to
hs-input
```

ainsi que des règles de redirection et de contrôle HotSpot.

Le système ne doit pas remplacer ou reconstruire le firewall HotSpot
existant.

---

# 33 — NAT

Les règles NAT actuelles sont liées au fonctionnement du HotSpot.

Elles comprennent notamment :

```text
hotspot
pre-hotspot
DNS redirect
HTTP redirect
HTTPS redirect
hs-unauth
hs-auth
```

Ces règles sont essentielles au fonctionnement du portail captif.

Elles ne doivent pas être remplacées par le backend.

---

# 34 — MANGLE

Une règle Mangle existe :

```text
postrouting
change-ttl
new-ttl = 1
out-interface = DEOGRACIAS
passthrough = no
```

Cette règle doit être conservée.

Aucune modification n'est prévue dans le MVP.

---

# 35 — ROUTING

Routes observées :

```text
0.0.0.0/0
    ↓
192.168.100.1
    ↓
ether1
```

Réseaux connectés :

```text
192.168.88.0/24
192.168.100.0/24
```

---

# 36 — SERVICES MIKROTIK

Services présents :

```text
api
api-ssl
ftp
ssh
telnet
winbox
www
www-ssl
```

API :

```text
api     : enabled
api-ssl : enabled
```

---

# 37 — API STRATÉGIE

Le routeur utilise :

```text
RouterOS 6.49.17
```

Le Connector utilisera donc l'API classique RouterOS.

Le système ne doit pas supposer la disponibilité de RouterOS REST API.

Architecture :

```text
Cloud Backend
      │
 HTTPS
      │
      ▼
Local Connector
      │
 RouterOS API / API-SSL
      │
      ▼
MikroTik
```

---

# 38 — POURQUOI LE CONNECTOR EST NÉCESSAIRE

Le MikroTik ne doit pas être exposé directement au backend cloud.

Architecture interdite :

```text
INTERNET
   ↓
MIKROTIK API
```

Architecture retenue :

```text
INTERNET
   ↓
CLOUD BACKEND
   ↓
HTTPS OUTBOUND
   ↓
LOCAL CONNECTOR
   ↓
MIKROTIK API
```

Le Connector fonctionne donc comme une passerelle locale.

---

# 39 — CONNECTOR : RESPONSABILITÉS

Le Connector devra :

### Communication cloud

* s'authentifier auprès du backend ;
* recevoir les tâches autorisées ;
* envoyer les résultats ;
* envoyer les erreurs ;
* envoyer les métriques nécessaires.

### Communication MikroTik

* établir une connexion API ;
* vérifier l'état de connexion ;
* lire les données nécessaires ;
* exécuter uniquement les opérations autorisées ;
* gérer les erreurs ;
* gérer les retries.

---

# 40 — CONNECTOR : MODE MVP

Le Connector doit commencer en :

```text
READ-ONLY
```

Il pourra dans un premier temps :

* vérifier la connexion ;
* lire l'identité ;
* lire RouterOS ;
* lire les utilisateurs ;
* lire les profils ;
* lire les sessions ;
* lire l'état HotSpot ;
* effectuer des diagnostics.

Aucune écriture automatique ne doit être activée immédiatement.

---

# 41 — PHASE WRITE

Les opérations d'écriture seront introduites séparément.

Avant toute écriture :

```text
BACKUP
↓
TEST
↓
LIMITED SCOPE
↓
VERIFY
↓
LOG
```

Les opérations d'écriture devront être :

* explicitement autorisées ;
* idempotentes lorsque possible ;
* journalisées ;
* récupérables ;
* testées hors production.

---

# 42 — COMPTE TECHNIQUE MIKROTIK

Le Connector ne doit jamais utiliser :

```text
admin
```

ou un compte :

```text
full
```

en production.

Un utilisateur technique dédié devra être créé.

Principe :

```text
connector-user
```

avec le minimum de permissions nécessaires.

Le niveau exact de permissions devra être validé expérimentalement
avant activation des opérations d'écriture.

---

# 43 — COMPTE ADMINISTRATEUR ACTUEL

Le routeur possède actuellement :

```text
admin
group = full
```

Cette configuration est conservée pendant l'audit.

Elle ne doit pas devenir l'identité permanente du Connector.

---

# 44 — SÉCURITÉ API

L'API MikroTik ne doit pas être publiquement accessible.

Le Connector doit être le seul composant applicatif à communiquer
avec l'API locale.

Les secrets doivent être stockés hors du code source.

Architecture :

```text
SECRET
↓
SECURE CONFIGURATION
↓
CONNECTOR
↓
API-SSL
```

---

# 45 — INVENTAIRE : SOURCE DE VÉRITÉ

Deux niveaux d'autorité doivent être conservés.

## Backend

Source de vérité pour :

```text
plans
prices
commercial duration
orders
payments
digital ticket inventory
ticket allocation
business state
```

## MikroTik

Source de vérité pour :

```text
network state
HotSpot state
active sessions
actual connectivity
actual RouterOS state
```

Aucune couche ne doit remplacer silencieusement l'autre.

---

# 46 — PAYMENT → TICKET

Le paiement ne doit pas provoquer directement une commande MikroTik.

Flux :

```text
CUSTOMER
   ↓
ORDER
   ↓
PAYMENT
   ↓
PAYMENT CONFIRMED
   ↓
TICKET ALLOCATION
   ↓
TICKET DELIVERY
```

La confirmation du paiement et la livraison du ticket sont deux
étapes différentes.

---

# 47 — CRITICAL FAILURE SCENARIO

Cas critique :

```text
CLIENT PAYE
   ↓
PAYMENT CONFIRMED
   ↓
TICKET ALLOCATION FAILURE
```

Le système ne doit jamais :

```text
ask customer to pay again
```

Il doit conserver :

```text
payment = PAID
order = PAID
```

puis :

```text
incident
   ↓
retry
   ↓
ticket allocation
   ↓
delivery
```

---

# 48 — SYNCHRONISATION

Le futur modèle `mikrotik_sync` devra permettre de suivre :

```text
ticket_id
order_id
remote_username
operation
desired_state
status
attempts
last_error
remote_reference
created_at
updated_at
```

États conceptuels :

```text
PENDING
↓
PROCESSING
↓
APPLIED
```

ou :

```text
FAILED
↓
RETRYING
↓
APPLIED
```

---

# 49 — IDEMPOTENCE

Toute opération sensible doit être conçue pour éviter les doublons.

Exemples :

```text
payment webhook
ticket allocation
ticket assignment
connector command
sync operation
```

Le système doit pouvoir recevoir deux fois la même commande sans
créer deux effets commerciaux.

---

# 50 — TICKET ALLOCATION

L'allocation doit être atomique.

Exemple :

```text
AVAILABLE
    ↓
RESERVED
    ↓
ASSIGNED
```

Deux clients ne doivent jamais pouvoir obtenir le même ticket.

La base de données doit assurer cette contrainte.

---

# 51 — RESERVATION TTL

Un ticket réservé mais non finalisé doit pouvoir revenir dans le stock.

Exemple :

```text
AVAILABLE
↓
RESERVED
↓
reservation expires
↓
AVAILABLE
```

La durée exacte du TTL sera définie dans la Phase 7/implémentation.

---

# 52 — CONSERVATION DU SYSTÈME ACTUEL

Le MVP doit conserver :

```text
MikroTik HotSpot
DHCP
DNS
NAT
Firewall
Mangle
Mikmon
username = password
existing authentication
existing On-Login script
```

Aucune reconstruction complète de l'infrastructure n'est prévue.

---

# 53 — ÉLÉMENTS INTERDITS EN MVP

Le MVP ne doit pas introduire automatiquement :

* remplacement complet du HotSpot ;
* nouvelle authentification réseau ;
* remplacement de Mikmon ;
* RADIUS redesign ;
* exposition publique de l'API MikroTik ;
* création dynamique massive d'utilisateurs ;
* modification automatique du firewall ;
* modification automatique du NAT ;
* suppression du script On-Login ;
* modification arbitraire des commentaires ;
* changement des profils existants sans migration planifiée.

---

# 54 — DYNAMIC USER CREATION

La création dynamique d'utilisateurs MikroTik via API est considérée
comme une évolution future.

Elle pourra éventuellement permettre :

```text
PAYMENT
↓
BACKEND
↓
CONNECTOR
↓
MIKROTIK API
↓
CREATE USER
↓
RETURN CREDENTIAL
```

Mais cette architecture n'est pas celle du MVP.

Elle ne sera étudiée qu'après stabilisation du système de tickets
pré-générés.

---

# 55 — BACKUP ET ROLLBACK

Avant toute modification significative du MikroTik :

```text
BACKUP
+
EXPORT
+
DOCUMENTATION
```

doivent être disponibles.

Les sauvegardes doivent être protégées car elles peuvent contenir
des informations sensibles de configuration.

---

# 56 — STRATÉGIE DE DÉPLOIEMENT

Le Connector doit être installé sur une machine présente dans le
réseau local.

Architecture :

```text
[ INTERNET ]
      │
      ▼
[ CLOUD BACKEND ]
      │
      │ HTTPS OUTBOUND
      ▼
[ LOCAL PC / CONNECTOR ]
      │
      │ LAN
      ▼
[ MIKROTIK ]
      │
      ▼
[ HOTSPOT CLIENTS ]
```

Le Connector ne nécessite donc pas que le MikroTik soit directement
accessible depuis Internet.

---

# 57 — CONNECTIVITY FAILURE

Si Internet est indisponible :

```text
CLIENT
↓
MIKROTIK
↓
HOTSPOT
```

doit continuer à fonctionner selon les capacités locales existantes.

Le Connector doit détecter :

```text
backend unavailable
```

et ne pas générer de modifications incohérentes.

---

# 58 — MIKROTIK FAILURE

Si le MikroTik est indisponible :

```text
Connector
↓
connection failed
```

Le backend doit conserver l'état métier.

Les opérations en attente doivent pouvoir être :

```text
retried
```

sans perte d'information.

---

# 59 — PAYMENT PROVIDER FAILURE

Une panne du prestataire de paiement ne doit pas être interprétée
comme :

```text
payment successful
```

Le système doit conserver les états :

```text
PENDING
FAILED
DECLINED
CANCELLED
```

jusqu'à confirmation fiable.

---

# 60 — TICKET DELIVERY FAILURE

Si le paiement est confirmé mais que le ticket ne peut pas être
livré :

```text
payment = PAID
order = PAID
ticket = RESERVED / ASSIGNED
delivery = FAILED
```

Le système crée ou met à jour un incident.

Aucun second paiement ne doit être demandé automatiquement.

---

# 61 — INCIDENT MANAGEMENT

Les incidents doivent être persistés.

Exemples :

```text
PAYMENT_CONFIRMED_TICKET_UNAVAILABLE
CONNECTOR_OFFLINE
MIKROTIK_API_ERROR
TICKET_SYNC_FAILED
PAYMENT_WEBHOOK_FAILED
TICKET_DELIVERY_FAILED
INVENTORY_INCONSISTENCY
```

Chaque incident doit pouvoir être associé à :

```text
order
payment
ticket
batch
connector
mikrotik operation
```

lorsque pertinent.

---

# 62 — OBSERVABILITY

Le futur système doit permettre d'observer :

### Backend

* commandes ;
* paiements ;
* allocations ;
* erreurs ;
* incidents.

### Connector

* online/offline ;
* dernière synchronisation ;
* erreurs API ;
* retries ;
* opérations réussies.

### MikroTik

* RouterOS version ;
* uptime ;
* sessions ;
* utilisateurs ;
* HotSpot ;
* connectivité.

---

# 63 — AUDIT LOG

Les opérations sensibles doivent être journalisées.

Exemples :

```text
TICKET_ALLOCATED
TICKET_RELEASED
PAYMENT_CONFIRMED
PAYMENT_REFUNDED
MIKROTIK_SYNC_STARTED
MIKROTIK_SYNC_COMPLETED
MIKROTIK_SYNC_FAILED
ADMIN_ACTION
```

---

# 64 — CONSTRAINTES MATÉRIELLES

Le RB951Ui-2HnD dispose de ressources limitées :

```text
128 MiB RAM
1 CPU core
600 MHz
128 MiB storage
```

Le Connector et le backend ne doivent donc pas essayer de déplacer
des traitements lourds vers le MikroTik.

Le MikroTik doit rester un équipement réseau.

Les traitements métier restent dans le backend.

---

# 65 — PERFORMANCE

Le système doit privilégier :

```text
small commands
+
minimal data transfer
+
short API operations
+
retry with backoff
```

Il ne faut pas effectuer de polling agressif.

Le Connector doit éviter :

```text
continuous high-frequency polling
```

sans nécessité.

---

# 66 — COMPATIBILITÉ

Le Connector doit être explicitement compatible avec :

```text
MikroTik RB951Ui-2HnD
RouterOS 6.49.17
RouterOS classic API
```

Il ne doit pas supposer :

```text
RouterOS 7
REST API
```

tant qu'une migration n'a pas été décidée.

---

# 67 — PRINCIPES DE MIGRATION FUTURE

Une migration vers une architecture plus automatisée pourra être
envisagée :

```text
MVP
│
├── Mikmon
├── Pre-generated tickets
└── Digital inventory
        ↓
STABLE SYSTEM
        ↓
Connector write operations
        ↓
Dynamic ticket management
        ↓
Potential RADIUS / centralized auth
```

Chaque étape devra être indépendante et réversible.

---

# 68 — DÉCISIONS FIGÉES

Les décisions suivantes sont considérées comme validées :

### D1

MikroTik reste le contrôleur réseau.

### D2

Backend = source de vérité commerciale.

### D3

MikroTik = source de vérité réseau.

### D4

Mikmon reste utilisé pour le MVP.

### D5

MVP basé sur des tickets pré-générés.

### D6

Tickets numériques et physiques séparés par lots.

### D7

Connector local préféré à l'exposition publique du MikroTik.

### D8

Connector cloud → HTTPS outbound.

### D9

Connector → MikroTik via API/API-SSL classique.

### D10

Le Connector commence en lecture seule.

### D11

Le compte `admin/full` ne doit pas être utilisé par le Connector.

### D12

Le HotSpot existant doit être conservé.

### D13

Firewall/NAT/Mangle existants doivent être conservés.

### D14

Le script On-Login doit être conservé.

### D15

Le champ `comment` ne doit pas être détourné sans test.

### D16

Le Walled Garden reste fermé jusqu'à définition des besoins
exacts du portail.

### D17

Les prix et durées commerciales sont définis par le backend.

### D18

Les divergences actuelles des profils MikroTik ne doivent pas être
silencieusement propagées au produit.

### D19

Une confirmation de paiement ne signifie pas automatiquement que le
ticket a été livré.

### D20

Les erreurs doivent être récupérables et auditables.

---

# 69 — POINTS ENCORE À CONFIRMER

La Phase 6 est considérée comme suffisamment documentée pour permettre
la Phase 7.

Cependant, certains éléments restent volontairement ouverts.

## P1 — RADIUS

Configuration exacte à caractériser avant automatisation avancée.

## P2 — Mapping 4 000 FCFA

Nom exact du profil MikroTik à confirmer.

## P3 — Mapping 5 000 FCFA

Existence/configuration exacte du profil MikroTik à confirmer.

## P4 — Profiles

Vérification complète de `shared-users` et des paramètres de tous
les profils avant automatisation d'écriture.

## P5 — Portal files

La localisation exacte des fichiers HTML personnalisés du HotSpot
n'a pas été établie.

## P6 — Connector permissions

Les permissions exactes nécessaires au compte technique doivent être
testées avant activation des écritures.

Ces éléments ne bloquent pas la conception de l'application Web.

---

# 70 — RELATION AVEC LA PHASE 7

La Phase 7 devra maintenant construire l'application autour de cette
architecture.

Le Web Application doit considérer le MikroTik comme une infrastructure
existante et non comme une base de données commerciale.

Architecture logique :

```text
                    ┌─────────────────────┐
                    │      CUSTOMER       │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │    WEB APPLICATION  │
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │       BACKEND       │
                    │                     │
                    │ Plans               │
                    │ Orders              │
                    │ Payments            │
                    │ Tickets             │
                    │ Inventory           │
                    │ Incidents           │
                    └──────┬───────┬──────┘
                           │       │
                ┌──────────┘       └──────────┐
                ▼                             ▼
      ┌─────────────────┐           ┌─────────────────┐
      │ PAYMENT PROVIDER │           │ LOCAL CONNECTOR │
      └─────────────────┘           └────────┬────────┘
                                             │
                                             ▼
                                   ┌──────────────────┐
                                   │     MIKROTIK     │
                                   │                  │
                                   │ HotSpot          │
                                   │ Users            │
                                   │ Sessions         │
                                   │ Network          │
                                   └──────────────────┘
```

---

# 71 — CE QUE LA PHASE 7 PEUT MAINTENANT CONSTRUIRE

La Phase 7 peut commencer la conception détaillée de :

1. portail public ;
2. catalogue des offres ;
3. sélection d'une offre ;
4. création de commande ;
5. initiation du paiement ;
6. attente de confirmation ;
7. confirmation du paiement ;
8. allocation d'un ticket ;
9. affichage du ticket ;
10. gestion des erreurs ;
11. gestion des états ;
12. communication avec le backend ;
13. préparation de l'intégration HotSpot ;
14. responsive design ;
15. accessibilité ;
16. performance ;
17. sécurité côté client.

L'administration complète de la mère reste réservée à la Phase 8.

---

# 72 — INVARIANTS POUR L'AGENT DE DÉVELOPPEMENT

L'agent de développement doit impérativement respecter les règles
suivantes.

## NEVER

```text
NEVER expose MikroTik API to the public Internet.
NEVER use admin/full as Connector identity.
NEVER trust frontend prices.
NEVER mark an order paid from frontend state.
NEVER allocate a physical ticket to digital order.
NEVER overwrite MikroTik comments blindly.
NEVER modify HotSpot firewall rules casually.
NEVER replace existing NAT rules.
NEVER remove the On-Login script.
NEVER assume RouterOS REST API exists.
NEVER assume MikroTik profile = commercial plan.
NEVER ask customer to pay twice because of an internal allocation error.
```

## ALWAYS

```text
ALWAYS validate prices server-side.
ALWAYS verify payment server-side.
ALWAYS use idempotency.
ALWAYS use transactional ticket allocation.
ALWAYS preserve existing network behavior.
ALWAYS log sensitive operations.
ALWAYS handle connector failures.
ALWAYS handle payment confirmation separately from ticket delivery.
ALWAYS keep digital and physical inventory separate.
ALWAYS preserve a recovery path.
```

---

# 73 — PHASE 6 ACCEPTANCE CRITERIA

La Phase 6 est considérée comme validée lorsque les éléments suivants
sont documentés :

* [x] modèle MikroTik identifié ;
* [x] RouterOS identifié ;
* [x] interfaces identifiées ;
* [x] bridge identifié ;
* [x] adressage LAN identifié ;
* [x] adressage WAN identifié ;
* [x] DHCP identifié ;
* [x] DNS identifié ;
* [x] HotSpot identifié ;
* [x] profils identifiés ;
* [x] mécanisme de ticket identifié ;
* [x] Mikmon identifié ;
* [x] mécanisme d'expiration identifié ;
* [x] sessions HotSpot observées ;
* [x] hosts HotSpot observés ;
* [x] cookies observés ;
* [x] IP Binding identifié ;
* [x] Walled Garden identifié ;
* [x] Firewall identifié ;
* [x] NAT identifié ;
* [x] Mangle identifié ;
* [x] routing identifié ;
* [x] services API identifiés ;
* [x] utilisateur administrateur identifié ;
* [x] script On-Login identifié ;
* [x] divergences commerciales identifiées ;
* [x] stratégie digital/physical définie ;
* [x] stratégie Connector définie ;
* [x] stratégie API définie ;
* [x] stratégie MVP définie ;
* [x] contraintes de sécurité définies ;
* [x] contraintes de migration définies ;
* [x] risques critiques identifiés ;
* [x] architecture d'intégration validée.

---

# 74 — RISQUES PRINCIPAUX

| Risque                                     | Niveau   | Réponse                      |
| ------------------------------------------ | -------- | ---------------------------- |
| Paiement confirmé mais ticket indisponible | CRITIQUE | état PAID + incident + retry |
| Exposition API MikroTik                    | CRITIQUE | Connector local              |
| Utilisation du compte admin                | ÉLEVÉ    | compte technique dédié       |
| Divergence profils/prix                    | ÉLEVÉ    | backend source of truth      |
| Collision de tickets                       | ÉLEVÉ    | allocation transactionnelle  |
| Modification du commentaire                | ÉLEVÉ    | préserver script             |
| Modification HotSpot                       | ÉLEVÉ    | pas de reconstruction        |
| Connector offline                          | ÉLEVÉ    | retry + monitoring           |
| RouterOS ancien                            | MOYEN    | API classique                |
| Ressources limitées                        | MOYEN    | traitements hors MikroTik    |
| Stock physique mélangé au stock digital    | ÉLEVÉ    | ticket batches               |
| Webhook dupliqué                           | ÉLEVÉ    | idempotence                  |
| Perte de connectivité                      | MOYEN    | états persistants + retry    |

---

# 75 — PHILOSOPHIE D'INTÉGRATION

L'objectif n'est pas de remplacer immédiatement l'infrastructure
existante.

L'objectif est de construire progressivement une couche logicielle
au-dessus de celle-ci.

Principe :

```text
UNDERSTAND
    ↓
PRESERVE
    ↓
ISOLATE
    ↓
INTEGRATE
    ↓
AUTOMATE
    ↓
OPTIMIZE
```

Et non :

```text
REPLACE EVERYTHING
```

Le système doit évoluer à partir de l'infrastructure existante.

---

# 76 — ARCHITECTURAL PRINCIPLE

Le projet suit le principe :

> **Business logic belongs to the application.
> Network enforcement belongs to MikroTik.
> Integration belongs to the Connector.**

Cette séparation doit rester vraie même si l'implémentation évolue.

---

# 77 — PHASE 6 CLOSURE

La Phase 6 — MikroTik Integration est officiellement clôturée au niveau
de la découverte, de l'architecture et des décisions d'intégration.

Les opérations suivantes restent volontairement hors de cette phase :

* création du compte technique ;
* développement du Connector ;
* activation des écritures API ;
* modification des profils ;
* modification du HotSpot ;
* modification du Walled Garden ;
* automatisation de la création des tickets.

Ces opérations appartiennent aux phases d'implémentation et
d'exploitation ultérieures.

---

# 78 — NEXT PHASE

La prochaine étape logique est :

# PHASE 7 — WEB APPLICATION

Objectif :

> Concevoir et spécifier l'application Web publique qui permettra au
> client de consulter une offre, initier un paiement, recevoir un ticket
> numérique et comprendre clairement l'état de sa transaction.

La Phase 7 devra être construite à partir de ce document comme contrat
d'intégration MikroTik.

````

### Statut

**`07_MIKROTIK_INTEGRATION.md` est donc le document officiel de clôture de la Phase 6.**

Il fixe surtout une frontière essentielle pour la suite :

```text
                 BUSINESS
                    │
                    ▼
              ┌───────────┐
              │  BACKEND  │
              └─────┬─────┘
                    │
             BUSINESS TRUTH
                    │
                    ▼
              ┌───────────┐
              │ CONNECTOR │
              └─────┬─────┘
                    │
             NETWORK TRUTH
                    │
                    ▼
              ┌───────────┐
              │ MIKROTIK  │
              └───────────┘
````

C'est cette séparation qui empêchera notamment **un vieux profil MikroTik `72-HEURES` de devenir accidentellement l'offre commerciale 500 FCFA**, ou qu'un problème du routeur soit interprété comme un problème de paiement.

**Phase 6 → clôturée.**
**Prochaine phase officielle → Phase 7 — Web Application.**
