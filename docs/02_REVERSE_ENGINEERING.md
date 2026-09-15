# PHASE 1 — REVERSE ENGINEERING DE L'INFRASTRUCTURE EXISTANTE

**Projet :** Système numérique de vente et d'accès Wi-Fi — Téo Graciel 7G
**Phase :** 1 — Reverse Engineering
**Statut :** Démarrage
**Objectif :** Comprendre précisément l'infrastructure actuelle avant toute conception ou modification.

---

# 1. OBJECTIF DE LA PHASE

L'objectif de cette phase est de reconstruire, aussi précisément que possible, le fonctionnement actuel du système Wi-Fi de Téo Graciel 7G.

Nous ne cherchons pas encore à améliorer le système.

Nous ne cherchons pas encore à intégrer le paiement.

Nous ne développons encore aucune application.

Nous devons d'abord répondre à une question fondamentale :

> **Comment le système actuel fonctionne-t-il réellement, de bout en bout ?**

Le reverse engineering doit permettre de passer de :

```text
"Je sais que ça fonctionne"
```

à :

```text
"Je sais exactement pourquoi et comment ça fonctionne."
```

---

# 2. RÈGLE FONDAMENTALE

## NE RIEN CASSER

Le MikroTik actuel est considéré comme une infrastructure de production.

Il fonctionne actuellement pour les clients.

Par conséquent :

* aucune modification de configuration ;
* aucune suppression d'utilisateur ;
* aucune modification de profil ;
* aucune modification de firewall ;
* aucune modification du NAT ;
* aucune modification du DHCP ;
* aucune modification du Hotspot ;
* aucune modification du DNS ;
* aucune modification du walled garden ;
* aucune modification des règles d'authentification ;
* aucune mise à jour de RouterOS ;
* aucun redémarrage volontaire ;
* aucune réinitialisation ;
* aucune expérimentation directement en production.

La Phase 1 est une phase **d'observation et de documentation**.

---

# 3. ÉTAT INITIAL CONNU

## 3.1 Matériel

### Routeur / ONT principal

```text
Marque       : Huawei
Modèle       : OptiXstar HG8145V6
Type         : GPON ONT / routeur
Wi-Fi        : 2,4 GHz + 5 GHz
Certitude    : CERTAIN
```

Cet équipement semble constituer le point d'entrée de la connexion Internet par fibre.

---

### MikroTik

```text
Marque       : MikroTik
Famille      : RouterBOARD
Modèle       : RB951Ui-2HnD
Statut       : TRÈS PROBABLE
Confirmation : à effectuer
```

L'inscription `951Ui-2HnD` a été observée directement par le propriétaire du système, mais n'a pas encore été photographiée de manière exploitable.

---

### Boîtier intermédiaire

```text
Marque       : inconnue
Modèle       : inconnu
Fonction     : inconnue
Statut       : à identifier
```

---

# 4. FONCTIONNEMENT ACTUEL CONNU

Le système actuel fonctionne approximativement comme ceci :

```text
Internet
   │
   ▼
Huawei HG8145V6
   │
   ▼
MikroTik RouterBOARD
   │
   ▼
Hotspot MikroTik
   │
   ▼
Portail captif
   │
   ▼
Authentification
   │
   ▼
Ticket
   │
   ▼
Profil utilisateur
   │
   ▼
Accès Internet
```

Cette architecture est encore une **représentation provisoire**.

Nous devons la confirmer techniquement.

---

# 5. SYSTÈME DE TICKETS ACTUEL

Le système utilise actuellement des tickets générés avec **Mikmon Server**.

L'administrateur dispose d'un accès permettant notamment de :

* sélectionner un profil ;
* générer des utilisateurs ;
* générer des lots ;
* exporter les tickets ;
* imprimer les tickets.

Les tickets utilisent :

```text
username = password
```

Le client saisit donc essentiellement le code/mot de passe du ticket.

---

# 6. PROFILS COMMERCIAUX ACTUELS

Les offres connues sont :

|       Prix |     Durée |
| ---------: | --------: |
|   100 FCFA |  5 heures |
|   200 FCFA | 12 heures |
|   300 FCFA | 24 heures |
|   500 FCFA | 48 heures |
| 1 000 FCFA |   7 jours |
| 4 000 FCFA |    1 mois |

Aucune limite de volume de données n'est actuellement connue.

Le modèle commercial actuel est donc principalement :

```text
PRIX
 ↓
PROFIL
 ↓
DURÉE
 ↓
ACCÈS
```

---

# 7. COMPORTEMENT ACTUEL D'UN TICKET

Le fonctionnement rapporté est :

```text
Client achète un ticket physique
        ↓
Reçoit un code
        ↓
Se connecte au Wi-Fi
        ↓
Portail captif
        ↓
Entre le code
        ↓
MikroTik identifie le compte
        ↓
Le profil associé est appliqué
        ↓
Le compteur commence
        ↓
Accès Internet
        ↓
Expiration
        ↓
Déconnexion
        ↓
Nouvelle authentification nécessaire
```

Ce comportement devra être confirmé directement dans la configuration.

---

# 8. QUESTIONS PRINCIPALES DU REVERSE ENGINEERING

À la fin de cette phase, nous devons pouvoir répondre avec certitude aux questions suivantes.

## A. HARDWARE

1. Quel est exactement le modèle du MikroTik ?
2. Quelle est sa version matérielle ?
3. Quel est le rôle exact du Huawei ?
4. Quel est le rôle du boîtier intermédiaire ?
5. Quels équipements supplémentaires existent sur le réseau ?
6. Quels ports Ethernet sont utilisés ?
7. Où chaque câble va-t-il ?

---

# 9. B. ROUTEROS

Nous devons déterminer :

* version exacte de RouterOS ;
* architecture CPU ;
* niveau de licence ;
* uptime ;
* ressources disponibles ;
* stockage ;
* mémoire ;
* configuration générale.

Objectif :

```text
MikroTik
├── Hardware
├── RouterOS
├── Licence
├── Ressources
└── État actuel
```

---

# 10. C. TOPOLOGIE RÉSEAU

Nous devons reconstruire :

```text
Internet
   ↓
Huawei
   ↓
MikroTik
   ↓
LAN
   ↓
Hotspot
   ↓
Clients
```

Mais il faut déterminer précisément :

* quelle interface MikroTik reçoit Internet ;
* quelle interface distribue le réseau ;
* quelle adresse IP est utilisée ;
* quel subnet est utilisé ;
* quel équipement fait DHCP ;
* quel équipement fait DNS ;
* quel équipement fait NAT ;
* si des VLAN existent ;
* si plusieurs réseaux existent ;
* si un bridge existe ;
* quelles interfaces appartiennent au bridge.

---

# 11. D. HOTSPOT MIKROTIK

Cette partie est critique.

Nous devons déterminer :

### Hotspot Server

* nom ;
* interface ;
* adresse ;
* pool ;
* profil serveur ;
* DNS name ;
* méthode d'authentification.

### Hotspot User Profiles

Pour chaque profil :

* nom ;
* durée ;
* vitesse ;
* limites ;
* session timeout ;
* idle timeout ;
* shared users ;
* adresse ;
* autres paramètres.

Nous devons notamment vérifier si :

```text
100 FCFA → 5h
200 FCFA → 12h
...
```

correspond bien à des **User Profiles MikroTik**.

---

# 12. E. AUTHENTIFICATION DES TICKETS

Nous devons déterminer exactement ce qui se passe lorsqu'un utilisateur saisit son ticket.

Questions :

* Les utilisateurs sont-ils stockés directement dans `/ip hotspot user` ?
* Les utilisateurs sont-ils créés par Mikmon ?
* Le username et le password sont-ils réellement identiques ?
* Le profil est-il attaché directement à l'utilisateur ?
* Comment le MikroTik sait-il qu'un ticket correspond à 5 heures ?
* La durée est-elle définie dans le profil ?
* Le ticket commence-t-il son temps à la première connexion ?
* Le temps continue-t-il pendant la déconnexion ?
* Existe-t-il une expiration absolue ?
* Que devient le ticket après expiration ?

Cette dernière question est particulièrement importante pour notre future automatisation.

---

# 13. F. MIKMON SERVER

Nous devons comprendre le rôle exact de Mikmon.

Il faut déterminer :

```text
Mikmon
   │
   ├── Connexion au MikroTik
   ├── Gestion des profils
   ├── Génération utilisateurs
   ├── Génération tickets
   ├── Export PDF
   └── Autres fonctions
```

Nous devons savoir si Mikmon :

* communique directement avec le MikroTik ;
* utilise l'API MikroTik ;
* utilise une autre méthode ;
* possède sa propre base de données ;
* stocke les tickets localement ;
* ne fait que générer des utilisateurs sur le MikroTik.

---

# 14. G. PORTAIL CAPTIF

Nous devons analyser le portail actuel.

Il faut déterminer :

* où sont stockés les fichiers ;
* HTML ;
* CSS ;
* JavaScript éventuel ;
* images ;
* logo ;
* informations commerciales ;
* formulaire d'authentification ;
* URL d'action du formulaire ;
* mécanisme de redirection ;
* page avant connexion ;
* page après connexion ;
* page d'erreur ;
* page de déconnexion ;
* page d'expiration.

Nous devons également déterminer si le portail est :

```text
Portail MikroTik natif personnalisé
```

ou :

```text
Application externe
```

ou une combinaison des deux.

---

# 15. H. WALLED GARDEN

Cette partie sera fondamentale pour le futur paiement en ligne.

Nous devons déterminer précisément ce que peut faire un client :

### AVANT authentification

Par exemple :

```text
Wi-Fi
   ↓
Captive Portal
   ↓
Internet bloqué
```

Mais peut-il accéder à :

* portail ;
* serveur externe ;
* API backend ;
* domaine de paiement ;
* pages de paiement ;
* DNS ;
* autres domaines ?

Nous devons identifier le **walled garden** actuel.

Cela déterminera directement la faisabilité de :

```text
Client connecté au Wi-Fi
        ↓
Pas encore authentifié
        ↓
Choix d'une offre
        ↓
Paiement
        ↓
Confirmation
        ↓
Ticket
```

---

# 16. I. FIREWALL

Nous devons inventorier les règles existantes.

Sans les modifier.

À documenter :

* chaînes ;
* règles ;
* NAT ;
* filter ;
* mangle si présent ;
* redirects ;
* ports ouverts ;
* règles Hotspot ;
* exceptions ;
* accès administratif.

Objectif :

> Comprendre les barrières réseau existantes avant d'envisager une quelconque intégration.

---

# 17. J. DHCP / DNS / NAT

Nous devons identifier :

### DHCP

* serveur ;
* pool ;
* réseau ;
* gateway ;
* DNS.

### DNS

* serveur DNS MikroTik ou externe ;
* allow remote requests ;
* redirections éventuelles.

### NAT

* masquerade ;
* source NAT ;
* destination NAT ;
* port forwarding éventuel.

---

# 18. K. ACCÈS ADMINISTRATIF

Nous savons déjà que l'administration est possible depuis le réseau local.

Nous devons identifier comment.

Les méthodes potentielles comprennent notamment :

* WinBox ;
* WebFig ;
* SSH ;
* console ;
* Mikmon ;
* autre outil.

### WinBox

WinBox est l'outil graphique de gestion de MikroTik.

### WebFig

WebFig est l'interface web de gestion de RouterOS.

À ce stade, nous ne devons utiliser aucune méthode qui n'est pas nécessaire.

Le but est simplement de comprendre par quel canal tu administres actuellement le MikroTik.

---

# 19. L. ACCÈS DEPUIS INTERNET

Nous devons déterminer si le MikroTik est accessible depuis Internet.

À vérifier :

* IP publique ;
* accès WAN ;
* port forwarding ;
* DDNS ;
* services RouterOS exposés ;
* restrictions d'accès ;
* firewall d'administration.

IMPORTANT :

Nous ne tenterons pas de scanner ou d'attaquer l'équipement.

Nous chercherons uniquement à comprendre sa configuration depuis l'administration légitime existante.

---

# 20. M. SÉCURITÉ

Nous devons documenter :

* comptes administrateurs ;
* services activés ;
* méthodes d'accès ;
* restrictions ;
* mots de passe ;
* secrets ;
* API ;
* ports d'administration.

Les mots de passe et secrets **ne doivent jamais être copiés dans notre documentation**.

Nous noterons uniquement :

```text
Présent
Absent
Inconnu
À vérifier
```

---

# 21. N. ÉTAT DU SYSTÈME DE TICKETS

Nous devons comprendre la relation exacte :

```text
OFFRE COMMERCIALE
      ↓
USER PROFILE
      ↓
USER / TICKET
      ↓
MIKROTIK
      ↓
AUTHENTIFICATION
      ↓
SESSION
```

Nous devons notamment déterminer si une future plateforme peut simplement :

```text
prendre un ticket existant
        ↓
le vendre
        ↓
le transmettre au client
```

ou si nous devons créer un mécanisme différent.

---

# 22. DÉCISION ARCHITECTURALE REPORTÉE

Nous ne décidons PAS encore entre :

### Option A — Inventaire de tickets pré-générés

```text
Mikmon
 ↓
1000 tickets
 ↓
Base de données
 ↓
Ticket disponible
 ↓
Paiement
 ↓
Attribution
```

et :

### Option B — Création dynamique

```text
Paiement
 ↓
Backend
 ↓
MikroTik API
 ↓
Création utilisateur
 ↓
Profil
 ↓
Accès
```

et éventuellement :

### Option C — Autre architecture

Cette décision sera prise **après analyse du système actuel**.

---

# 23. RISQUES IDENTIFIÉS À CE STADE

## Risque 1 — Dépendance au système existant

La future plateforme devra probablement s'intégrer au Hotspot actuel.

---

## Risque 2 — Modification accidentelle

Une mauvaise modification du MikroTik pourrait interrompre le Wi-Fi commercial.

---

## Risque 3 — Paiement confirmé mais ticket indisponible

Cas critique :

```text
Client paie
 ↓
Paiement confirmé
 ↓
Aucun ticket disponible
```

Le système devra prévoir une stratégie.

---

## Risque 4 — Paiement confirmé mais MikroTik inaccessible

```text
Paiement
 ↓
Confirmation
 ↓
MikroTik indisponible
```

Le paiement ne doit jamais être considéré comme perdu simplement parce que l'équipement réseau est temporairement indisponible.

---

## Risque 5 — Double attribution

```text
Paiement A
     ↓
Ticket X

Paiement B
     ↓
Ticket X
```

Impossible.

Le futur système devra empêcher cela.

---

# 24. MÉTHODOLOGIE DE COLLECTE

Nous allons maintenant procéder dans cet ordre :

```text
ÉTAPE 1
Identification matérielle finale
        ↓
ÉTAPE 2
Accès administratif
        ↓
ÉTAPE 3
RouterOS
        ↓
ÉTAPE 4
Interfaces / IP / Bridge
        ↓
ÉTAPE 5
DHCP / DNS / NAT
        ↓
ÉTAPE 6
Hotspot
        ↓
ÉTAPE 7
User Profiles
        ↓
ÉTAPE 8
Tickets / Users
        ↓
ÉTAPE 9
Firewall / Walled Garden
        ↓
ÉTAPE 10
Portail captif
        ↓
ÉTAPE 11
Mikmon Server
        ↓
ÉTAPE 12
Topologie finale
        ↓
ÉTAPE 13
Architecture actuelle documentée
```

Aucune étape ne doit être sautée si elle contient une information nécessaire à l'architecture future.

---

# 25. PREMIÈRE COLLECTE — CE QUE NOUS ALLONS FAIRE MAINTENANT

Nous allons commencer par **l'état matériel et l'accès administratif**, sans modifier quoi que ce soit.

Tu dois récupérer les informations suivantes.

## A. MikroTik

Depuis ton PC connecté au Wi-Fi Téo Graciel 7G, ouvre ton environnement actuel d'administration.

Nous voulons simplement savoir :

1. Comment tu ouvres actuellement Mikmon Server.
2. Quelle adresse/IP ou quel nom tu utilises pour accéder au MikroTik, si cela apparaît.
3. Si Mikmon affiche le modèle du MikroTik.
4. Si Mikmon affiche la version de RouterOS.
5. Si Mikmon affiche une adresse IP du MikroTik.

---

# 26. CAPTURES À FOURNIR

Pour cette première collecte, nous voulons idéalement les captures suivantes.

### Capture 01 — Écran principal Mikmon

Capture complète montrant :

* interface ;
* menus ;
* informations générales ;
* sans mot de passe.

### Capture 02 — Informations du MikroTik

Si Mikmon possède une page :

```text
System
Router
Device
Information
About
```

ou similaire, capture-la.

### Capture 03 — Liste des profils

Montre les User Profiles.

Tu peux masquer :

* mots de passe ;
* secrets ;
* informations personnelles.

Mais laisse visibles si possible :

* nom du profil ;
* durée ;
* vitesse ;
* limites ;
* paramètres techniques.

### Capture 04 — Liste des tickets/users

Capture une petite partie de la liste des utilisateurs/tickets.

**Ne montre pas les codes utilisables en production.**

Tu peux masquer les valeurs sensibles tout en laissant visibles les colonnes et paramètres.

### Capture 05 — Portail captif

Avec un téléphone connecté au Wi-Fi :

1. ouvrir le portail ;
2. prendre une capture de la page avant authentification ;
3. si possible, une capture après connexion avec un ticket de test ;
4. capture de la page d'expiration si elle est facilement accessible.

---

# 27. INFORMATIONS À NE PAS ENVOYER

Ne m'envoie jamais :

* mot de passe administrateur ;
* mot de passe Wi-Fi si inutile ;
* token ;
* clé API ;
* clé privée ;
* secret webhook ;
* cookie de session ;
* QR code contenant des identifiants ;
* codes de tickets encore vendables.

Si une capture contient accidentellement une information sensible, masque-la avant de me l'envoyer.

---

# 28. LIVRABLE ATTENDU DE LA PHASE 1

À la fin du reverse engineering, nous produirons un document professionnel :

# EXISTING INFRASTRUCTURE BLUEPRINT

Il contiendra notamment :

```text
01 — Hardware Inventory
02 — Physical Topology
03 — Logical Network Topology
04 — MikroTik Hardware
05 — RouterOS
06 — Interfaces
07 — IP Addressing
08 — Bridge
09 — DHCP
10 — DNS
11 — NAT
12 — Firewall
13 — Hotspot
14 — User Profiles
15 — Tickets
16 — Mikmon Server
17 — Captive Portal
18 — Walled Garden
19 — Authentication Flow
20 — Administration
21 — Security
22 — Failure Scenarios
23 — Current Limitations
24 — Integration Constraints
25 — Unknowns Remaining
26 — Recommended Architecture Constraints
```

Ce document deviendra ensuite **la source de vérité technique de tout le projet**.

---

# 29. CRITÈRE DE FIN DE PHASE

Nous ne considérerons pas la Phase 1 comme terminée simplement parce que nous connaissons le modèle du MikroTik.

Elle sera terminée lorsque nous pourrons expliquer précisément :

> **"Un client arrive sur le réseau, voici ce qui se passe techniquement jusqu'à son authentification, voici comment le MikroTik identifie son ticket, voici comment son profil lui attribue sa durée, voici comment le réseau lui donne Internet, voici comment son accès expire, et voici exactement où une future plateforme de paiement pourrait s'intégrer sans casser l'existant."**

C'est cette compréhension qui nous permettra ensuite de concevoir une architecture réellement compatible avec l'installation de Téo Graciel 7G.

---

# 30. ÉTAT DE LA PHASE

```text
PHASE 1 — REVERSE ENGINEERING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[✓] Reconnaissance hardware préliminaire
[✓] Huawei identifié
[~] MikroTik identifié — confirmation nécessaire
[~] Topologie physique — partiellement connue
[ ] RouterOS
[ ] Interfaces
[ ] IP
[ ] Bridge
[ ] DHCP
[ ] DNS
[ ] NAT
[ ] Firewall
[ ] Hotspot
[ ] User Profiles
[ ] Tickets
[ ] Mikmon
[ ] Captive Portal
[ ] Walled Garden
[ ] Authentication Flow
[ ] Architecture finale

STATUT : EN COURS
```

---

# 31. PROCHAINE ÉTAPE

## ÉTAPE 1 — INVENTAIRE TECHNIQUE DU MIKROTIK

Nous allons commencer par récupérer **l'état réel du MikroTik**, sans modification.

Nous chercherons en priorité :

```text
Modèle exact
RouterOS
Licence
IP
Interfaces
Uptime
Ressources
```

**Après cette collecte, nous analyserons les captures une par une avant de passer à l'étape suivante.**

Nous ne passerons pas directement au Hotspot tant que nous n'aurons pas établi une base fiable de l'état du routeur.
