# PHASE 4 — UX & CUSTOMER JOURNEYS

## Spécification complète de l’expérience utilisateur du système Déo Gracias Wi-Fi Zone

**Projet :** Système digital de vente et d’accès Wi-Fi — Déo Gracias
**Phase :** 4 — UX & Customer Journeys
**Statut :** Spécification / conception
**Implémentation :** Non commencée
**Dépendances :** Phase 0 — Cadrage · Phase 1 — Infrastructure existante · Phase 2 — Paiement · Phase 3 — Architecture cible
**Principe directeur :** l’expérience utilisateur doit servir l’architecture, et non l’inverse.

---

# 00 — PURPOSE

Cette phase transforme l’architecture technique définie précédemment en **expérience utilisateur concrète**.

Le système ne doit pas être pensé comme une simple page web proposant des forfaits Wi-Fi.

Il s’agit d'une expérience transactionnelle complète dans laquelle un utilisateur doit pouvoir :

1. se connecter au réseau Wi-Fi Déo Gracias ;
2. comprendre immédiatement comment obtenir l’accès ;
3. utiliser un ticket physique existant ;
4. acheter un accès directement depuis le portail ;
5. choisir une offre ;
6. choisir son moyen de paiement ;
7. effectuer le paiement ;
8. attendre la confirmation fiable de la transaction ;
9. recevoir ou récupérer son accès ;
10. se connecter au réseau ;
11. comprendre l’état de son accès ;
12. récupérer une solution lorsqu’un problème survient.

L’expérience doit également couvrir le **côté administration**, notamment pour la gestion des offres, tickets, transactions, paiements, incidents et opérations de la boutique.

Le système doit donc être conçu autour de deux grandes expériences :

```text
CLIENT
   ↓
Comprendre
   ↓
Choisir
   ↓
Payer / entrer un ticket
   ↓
Être authentifié
   ↓
Accéder à Internet
   ↓
Être informé de l'état de son accès


ADMINISTRATION DÉO GRACIAS
   ↓
Superviser
   ↓
Vendre
   ↓
Contrôler les paiements
   ↓
Gérer les tickets
   ↓
Suivre les incidents
   ↓
Administrer les données
```

---

# 01 — UX PHILOSOPHY

## 01.1 — L'expérience avant l'interface

L'interface n'est qu'un moyen.

L'objectif n'est pas de créer un portail visuellement impressionnant, mais un système dans lequel le client comprend rapidement :

> **Comment avoir Internet maintenant ?**

Cette règle est particulièrement importante ici parce que l'utilisateur arrive dans un contexte contraint :

* il est connecté au Wi-Fi ;
* Internet général n'est pas encore accessible ;
* il est probablement sur smartphone ;
* il souhaite généralement obtenir Internet rapidement ;
* il ne doit pas avoir à comprendre la technologie derrière le système.

Le principe UX est donc :

```text
COMPRENDRE
   ↓
CHOISIR
   ↓
AGIR
   ↓
ÊTRE CONFIRMÉ
   ↓
ACCÉDER
```

---

# 02 — PRINCIPES UX FONDAMENTAUX

## 02.1 — Clarté immédiate

Le client doit comprendre dès le premier écran :

* qu'il est connecté au Wi-Fi Déo Gracias ;
* qu'il doit disposer d'un ticket ou acheter une offre ;
* quelles offres sont disponibles ;
* quelle action effectuer.

Cette exigence découle directement du principe de **clarity as a feature** du système UX de référence : l'utilisateur doit savoir ce qu'il voit, pourquoi il le voit, ce qu'il peut faire et ce qui vient de se produire. 

---

## 02.2 — Mobile first

Le portail captif est avant tout une expérience mobile.

La majorité des clients utiliseront probablement :

* smartphone Android ;
* navigateur mobile ;
* écran relativement petit ;
* connexion parfois lente ;
* interaction tactile.

Le design ne doit donc pas être :

```text
Desktop
↓
réduction automatique
↓
Mobile
```

mais :

```text
Mobile
↓
Tablet
↓
Desktop
```

Le responsive doit être considéré comme un changement d'expérience, pas uniquement comme une réduction des dimensions. 

---

# 03 — OBJECTIF PRINCIPAL DU CLIENT

L'objectif principal du client est extrêmement simple :

> **Obtenir une connexion Internet fonctionnelle.**

Tout ce qui ne contribue pas directement ou indirectement à cet objectif doit être secondaire.

La hiérarchie fonctionnelle est donc :

```text
1. Connexion / accès
2. Achat
3. Authentification
4. Confirmation
5. Informations sur l'offre
6. Informations commerciales secondaires
```

Les informations comme :

* autres activités de Déo Gracias ;
* vente de chaussures ;
* vente de tissus ;
* services Mobile Money ;
* informations commerciales diverses ;

peuvent exister mais ne doivent jamais prendre le dessus sur l'objectif Wi-Fi.

---

# 04 — INFORMATION ARCHITECTURE

L'expérience publique doit rester extrêmement simple.

Architecture recommandée :

```text
PORTAIL D'ACCUEIL
│
├── Se connecter avec un ticket
│
├── Acheter un accès
│
├── Nos offres
│
├── Aide
│
└── Informations Déo Gracias
```

Selon les contraintes du portail captif, certaines de ces sections peuvent être fusionnées.

L'objectif n'est pas de multiplier les pages.

---

# 05 — PAGE D'ACCUEIL DU PORTAIL CAPTIF

## 05.1 — Rôle

Cette page est le point d'entrée principal lorsqu'un client se connecte au SSID.

Elle doit répondre immédiatement à :

> « Je suis arrivé ici, qu'est-ce que je dois faire ? »

---

## 05.2 — Hiérarchie recommandée

```text
LOGO / IDENTITÉ DÉO GRACIAS
        ↓
Wi-Fi Déo Gracias
        ↓
Message court
        ↓
[ J'AI UN TICKET ]
        ↓
[ ACHETER UN ACCÈS ]
        ↓
Offres disponibles
        ↓
Aide / Contact
```

---

# 06 — CLIENT AVEC TICKET

Le premier parcours historique du système reste parfaitement valide.

Le client dispose déjà d'un ticket physique.

## Journey

```text
Connexion au Wi-Fi
        ↓
Captive Portal
        ↓
"J'ai un ticket"
        ↓
Saisie du code
        ↓
Validation
        ↓
Vérification serveur
        ↓
Authentification MikroTik
        ↓
Accès Internet
```

---

## 06.1 — Écran de saisie

Le champ doit expliquer clairement ce qu'il attend.

Exemple :

> **Code du ticket**

Sous le champ :

> Entrez le code indiqué sur votre ticket Déo Gracias.

Bouton :

> **Se connecter**

---

## 06.2 — Ticket valide

Le système doit confirmer clairement :

> **Connexion réussie**

Puis éventuellement :

> Votre accès est maintenant actif.

L'utilisateur doit être redirigé vers Internet ou vers la destination demandée.

---

## 06.3 — Ticket invalide

Ne jamais afficher :

> `HTTP 401`

ou :

> `Authentication failed`

Le système doit traduire l'erreur technique en information utilisateur.

Exemple :

> **Ticket invalide**
> Vérifiez le code saisi et réessayez.

---

## 06.4 — Ticket déjà utilisé

Message :

> **Ce ticket n'est plus disponible.**
> Si vous pensez qu'il s'agit d'une erreur, contactez Déo Gracias.

---

## 06.5 — Ticket expiré

Message :

> **Votre ticket a expiré.**
> Achetez un nouveau forfait pour continuer à utiliser Internet.

CTA :

> **Voir les offres**

---

# 07 — CLIENT SANS TICKET

C'est le nouveau parcours stratégique.

Le client arrive sans ticket physique.

Journey :

```text
Connexion Wi-Fi
       ↓
Portail
       ↓
"Acheter un accès"
       ↓
Choix du forfait
       ↓
Choix du moyen de paiement
       ↓
Création de transaction
       ↓
Paiement
       ↓
Confirmation serveur
       ↓
Attribution du ticket
       ↓
Affichage du ticket
       ↓
Connexion
       ↓
Internet
```

---

# 08 — ÉCRAN DES OFFRES

Les offres doivent être présentées de manière immédiatement compréhensible.

La grille tarifaire actuellement affichée sur le portail constitue la référence fonctionnelle fournie pour les offres :

| Offre     |       Prix | Validité |
| --------- | ---------: | -------: |
| 5H        |   100 FCFA |      24H |
| 12H       |   200 FCFA |      24H |
| 24H       |   300 FCFA |      48H |
| 72H       |   500 FCFA |  5 jours |
| 1 semaine | 1 000 FCFA | 10 jours |
| 1 mois    | 4 000 FCFA | 40 jours |

**Important :** cette spécification UX ne doit pas inventer de nouvelles offres ni modifier ces valeurs. Les offres doivent être récupérées depuis la configuration métier de la plateforme.

---

# 09 — STRUCTURE D'UNE CARTE D'OFFRE

Chaque offre doit présenter au minimum :

```text
DURÉE D'ACCÈS
PRIX
VALIDITÉ
CTA
```

Exemple :

```text
┌─────────────────────────┐
│                         │
│          5H             │
│                         │
│       100 FCFA          │
│                         │
│   Validité : 24H        │
│                         │
│      [ Acheter ]        │
│                         │
└─────────────────────────┘
```

Le prix doit être particulièrement visible.

---

# 10 — ÉVITER LA CONFUSION ENTRE DURÉE ET VALIDITÉ

C'est un point UX critique.

Le client doit pouvoir distinguer :

### Durée d'accès

> **5 heures**

de :

### Validité du ticket

> **24 heures**

Ces informations ne doivent pas être fusionnées.

Le client doit comprendre que :

```text
5H ≠ validité 24H
```

et que :

```text
12H ≠ validité 24H
```

etc.

La formulation exacte devra être validée avec le comportement réel du profil MikroTik lors de l'implémentation.

---

# 11 — SÉLECTION D'UNE OFFRE

Lorsqu'un client sélectionne une offre :

```text
Offre sélectionnée
       ↓
Résumé de commande
       ↓
Prix total
       ↓
Moyens de paiement
```

Le prix ne doit jamais être fourni par le navigateur comme une donnée faisant autorité.

L'interface peut afficher le prix, mais le backend doit recalculer ou valider la commande.

---

# 12 — RÉSUMÉ AVANT PAIEMENT

Avant de lancer le paiement, afficher :

```text
Votre achat

Forfait : 24H
Prix : 300 FCFA
Validité : 48H

Moyen de paiement :
[ MTN Mobile Money ]
[ Moov Money ]
[ Celtiis Money ]

[ Continuer ]
```

Objectif :

> permettre au client de vérifier ce qu'il est sur le point de payer.

---

# 13 — CHOIX DU MOYEN DE PAIEMENT

Le système doit supporter les opérateurs retenus lors de la Phase 2.

À ce niveau, l'expérience ne doit pas exposer la complexité de l'agrégateur.

Le client voit :

```text
MTN
Moov
Celtiis
```

et non :

```text
Payment Provider API
Aggregator
Webhook
Settlement
Callback
```

---

# 14 — PRINCIPE PAYMENT UX

Le système doit distinguer trois états.

```text
PAIEMENT INITIÉ
       ↓
PAIEMENT CONFIRMÉ
       ↓
ACCÈS DÉLIVRÉ
```

Ces trois événements ne doivent jamais être présentés comme un seul événement technique.

---

# 15 — PAIEMENT INITIÉ

Après l'action de paiement :

> **Paiement en cours…**

Message :

> Nous attendons la confirmation de votre opérateur.

Ne pas afficher immédiatement :

> Paiement réussi.

Le système ne doit pas considérer la simple initiation comme une preuve de paiement.

---

# 16 — ÉTAT D'ATTENTE DE CONFIRMATION

Écran :

```text
Paiement en cours

Nous vérifions votre paiement.
Ne fermez pas cette page.

[ Vérifier l'état ]
```

Selon le comportement du provider, le système peut :

* attendre un webhook ;
* effectuer une récupération d'état ;
* maintenir la page ouverte ;
* actualiser automatiquement le statut.

Le client ne doit jamais être obligé de comprendre ces mécanismes.

---

# 17 — PAIEMENT CONFIRMÉ

Lorsque le backend reçoit et valide réellement la confirmation :

```text
✓ Paiement confirmé
```

Puis :

```text
Préparation de votre accès...
```

Cette deuxième étape est importante.

Elle évite de créer une fausse impression selon laquelle :

> paiement confirmé = ticket déjà disponible.

---

# 18 — ATTRIBUTION DU TICKET

Le backend doit ensuite attribuer le ticket prévu par l'architecture.

Le client voit :

> **Votre accès est prêt.**

Puis :

```text
Votre code Wi-Fi

XXXXXXXX

[ Se connecter ]
```

La présentation exacte dépendra de la stratégie retenue en Phase 3 :

* ticket pré-généré ;
* allocation d'un ticket disponible ;
* création dynamique d'un utilisateur MikroTik.

L'UX reste néanmoins identique :

```text
Paiement confirmé
↓
Accès préparé
↓
Identifiant/code disponible
```

---

# 19 — AFFICHAGE DU TICKET

Si un code est délivré, l'écran doit permettre :

* de le voir ;
* de le copier ;
* éventuellement de l'utiliser automatiquement ;
* de comprendre sa durée ;
* de comprendre sa validité.

Exemple :

```text
ACCÈS WIFI DÉO GRACIAS

Code
XXXXXXX

Forfait
24H

Validité
48H

[ Se connecter maintenant ]
```

---

# 20 — NE PAS EXPOSER PLUS D'INFORMATIONS QUE NÉCESSAIRE

Le client n'a pas besoin de voir :

* identifiant interne de transaction ;
* ID du webhook ;
* ID du paiement chez l'agrégateur ;
* ID du ticket en base ;
* identifiant MikroTik ;
* informations de synchronisation.

Ces données sont réservées à l'administration et au système technique.

---

# 21 — CONNEXION AUTOMATIQUE

Si techniquement possible et suffisamment fiable, le système pourra proposer :

> **Se connecter maintenant**

Cela peut déclencher le parcours d'authentification correspondant.

Mais l'expérience doit prévoir un fallback :

> **Vous pouvez également utiliser ce code dans le champ "Ticket Wi-Fi".**

Ainsi, une défaillance de l'automatisation ne bloque pas le client ayant déjà payé.

---

# 22 — CAS CRITIQUE : PAIEMENT CONFIRMÉ MAIS ACCÈS NON ENCORE DÉLIVRÉ

C'est l'un des parcours les plus importants du système.

Situation :

```text
Client
  ↓
Paiement
  ↓
Argent débité
  ↓
Paiement confirmé
  ↓
Problème allocation ticket
```

Il serait catastrophique d'afficher simplement :

> Erreur.

Le client vient potentiellement d'être débité.

---

## 22.1 — UX recommandée

Afficher :

> **Paiement confirmé**

Puis :

> Votre paiement a bien été confirmé.
> Nous préparons actuellement votre accès Wi-Fi.

Puis :

> **Votre accès n'est pas encore disponible.**

Et surtout :

> **Ne payez pas une deuxième fois.**

CTA :

> **Actualiser**

et éventuellement :

> **Contacter Déo Gracias**

---

# 23 — PROTECTION CONTRE LE DOUBLE PAIEMENT

Le parcours doit explicitement empêcher une réaction naturelle du client :

> « Ça ne marche pas, je vais repayer. »

Message :

> **Ne relancez pas un nouveau paiement tant que nous vérifions cette transaction.**

C'est une décision UX directement liée à la fiabilité backend.

---

# 24 — PAIEMENT ÉCHOUÉ

Exemple :

> **Le paiement n'a pas abouti.**

Puis :

> Aucun accès Wi-Fi n'a été délivré pour cette transaction.

CTA :

> **Réessayer**

et :

> **Choisir un autre moyen de paiement**

---

# 25 — PAIEMENT ANNULÉ

Exemple :

> **Paiement annulé**

> La transaction n'a pas été finalisée.

CTA :

> **Réessayer**

---

# 26 — PAIEMENT EXPIRÉ / TIMEOUT

Si le système attend une confirmation trop longtemps :

> **La confirmation prend plus de temps que prévu.**

Puis :

> Votre paiement peut encore être en cours de traitement. Vérifiez votre compte avant de recommencer.

Cette formulation est importante parce qu'un timeout applicatif ne signifie pas nécessairement que le paiement financier n'existe pas.

---

# 27 — WEBHOOK EN RETARD

Le client ne doit jamais voir le terme « webhook ».

À la place :

> **Nous n'avons pas encore reçu la confirmation de votre paiement.**

Puis :

> Nous continuons à vérifier automatiquement.

---

# 28 — PAIEMENT CONFIRMÉ MAIS MIKROTIK INDISPONIBLE

Cas :

```text
Paiement
   ↓
Confirmation
   ↓
Backend
   ↓
MikroTik inaccessible
```

L'UX doit protéger le client.

Message :

> **Paiement confirmé**

> Votre paiement est enregistré. Le service Wi-Fi rencontre actuellement un problème technique.

Ne jamais demander :

> « Payez encore. »

Le système doit conserver la transaction et permettre sa résolution.

---

# 29 — INTERNET INDISPONIBLE

Il faut distinguer :

### Portail accessible

mais

### Internet non disponible.

Message possible :

> **Le service Internet est temporairement indisponible.**

Puis :

> Votre accès est enregistré. Nous travaillons au rétablissement du service.

Cette distinction permettra également à l'administration de différencier :

* problème de paiement ;
* problème d'authentification ;
* problème réseau ;
* problème MikroTik ;
* problème d'allocation.

---

# 30 — PERTE DE CONNEXION PENDANT LE PAIEMENT

Situation :

```text
Client
 ↓
Paiement
 ↓
Connexion interrompue
```

Le client peut revenir sur le portail.

Il doit pouvoir retrouver son état si une transaction est toujours associée à son parcours/session.

L'interface doit proposer :

> **Vous avez une transaction en cours ?**

avec :

> **Vérifier mon paiement**

Cette fonctionnalité devra être conçue avec une sécurité suffisante pour ne pas permettre à n'importe quel utilisateur de consulter les transactions d'un autre.

---

# 31 — CLIENT QUI REVIENT APRÈS UN PAIEMENT

Le système doit reconnaître les situations où :

```text
Paiement confirmé
+
Ticket déjà délivré
```

et éviter de générer une deuxième attribution.

Il doit afficher :

> **Votre achat est déjà confirmé.**

Puis :

> **Votre code Wi-Fi : XXXXXXX**

ou :

> **Votre accès est déjà actif.**

---

# 32 — ÉTATS UX GLOBAUX

Chaque écran transactionnel doit posséder au minimum les états suivants :

```text
IDLE
↓
LOADING
↓
SUCCESS
↓
ERROR
↓
RETRY
```

Pour les paiements :

```text
CREATED
↓
PENDING
↓
CONFIRMED
↓
FULFILLED
```

avec les branches :

```text
FAILED
CANCELLED
EXPIRED
REQUIRES_ATTENTION
```

Les états Loading, Success, Error, Empty, Disabled et Offline/Unavailable doivent être explicitement conçus plutôt que laissés aux comportements par défaut. 

---

# 33 — ERROR DESIGN

Les erreurs doivent être :

* compréhensibles ;
* localisées ;
* actionnables ;
* non culpabilisantes.

C'est exactement le principe défini dans le référentiel UX du projet. 

Structure recommandée :

```text
QUE S'EST-IL PASSÉ ?
        ↓
QUE DOIS-JE FAIRE ?
        ↓
PUIS-JE RÉESSAYER ?
```

Exemple :

> **Impossible de vérifier le paiement**

> Nous rencontrons un problème temporaire lors de la vérification.

> Votre compte n'a pas été débité par cette vérification.

> [ Réessayer ]

---

# 34 — CONTACT ET ASSISTANCE

Le portail doit fournir un moyen simple de contacter Déo Gracias.

Le contact WhatsApp/téléphone actuellement affiché sur le portail peut servir de canal opérationnel, mais les coordonnées devront être administrables plutôt que codées en dur dans l'application finale.

CTA :

> **Besoin d'aide ?**

Puis :

```text
WhatsApp
Appel
```

---

# 35 — PARCOURS COMPLET : CLIENT AVEC TICKET

```text
┌──────────────────────────┐
│ Connexion Wi-Fi          │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ Captive Portal            │
└────────────┬─────────────┘
             ↓
      [ J'ai un ticket ]
             ↓
┌──────────────────────────┐
│ Saisie du code            │
└────────────┬─────────────┘
             ↓
┌──────────────────────────┐
│ Vérification              │
└────────────┬─────────────┘
             ↓
        ┌────┴────┐
        │         │
      VALIDE    INVALIDE
        │         │
        ↓         ↓
   Connexion    Erreur
        │
        ↓
     INTERNET
```

---

# 36 — PARCOURS COMPLET : ACHAT EN LIGNE

```text
Connexion Wi-Fi
      ↓
Captive Portal
      ↓
Acheter un accès
      ↓
Choix offre
      ↓
Résumé
      ↓
Choix opérateur
      ↓
Paiement
      ↓
Attente confirmation
      ↓
┌───────────────┐
│ Confirmation  │
└───────┬───────┘
        ↓
Attribution accès
        ↓
Ticket / identifiants
        ↓
Connexion
        ↓
Internet
```

---

# 37 — PARCOURS : PAIEMENT ÉCHOUÉ

```text
Choix offre
    ↓
Paiement
    ↓
Échec
    ↓
Message clair
    ↓
┌─────────────────────────┐
│ Réessayer               │
│ Changer de moyen        │
│ Retour aux offres       │
└─────────────────────────┘
```

---

# 38 — PARCOURS : PAIEMENT CONFIRMÉ + PROBLÈME D'ACCÈS

```text
Paiement
   ↓
Confirmation
   ↓
Allocation
   ↓
Erreur
   ↓
"Paiement confirmé"
   ↓
"Accès en préparation"
   ↓
Actualisation automatique
   ↓
        ┌──────────────┐
        │ Accès trouvé │
        └──────┬───────┘
               ↓
           Connexion
```

Si le problème persiste :

```text
Assistance Déo Gracias
```

---

# 39 — PARCOURS : CLIENT DÉJÀ CONNECTÉ

Une fois authentifié, le client n'a plus besoin de refaire l'ensemble du processus.

Il peut éventuellement accéder à une page d'état :

```text
Connexion active

Forfait : 24H
Temps restant : ...
Expiration : ...

[ Se déconnecter ]
```

La faisabilité exacte de l'affichage du temps restant dépendra des données réellement exposées par MikroTik et de l'architecture définie en Phase 3.

---

# 40 — PARCOURS D'EXPIRATION

Lorsqu'un accès arrive à expiration :

```text
Accès actif
    ↓
Expiration
    ↓
Déconnexion MikroTik
    ↓
Captive Portal
    ↓
"Votre accès a expiré"
    ↓
[ Acheter un nouvel accès ]
```

L'expérience doit rendre le prochain geste évident.

---

# 41 — ADMINISTRATION DÉO GRACIAS

L'administration est une deuxième expérience complète.

L'objectif n'est pas simplement :

> afficher une base de données.

L'administration doit permettre à la boutique de comprendre :

> **Combien ai-je vendu ? Quels paiements sont confirmés ? Quels tickets sont disponibles ? Y a-t-il un problème ?**

---

# 42 — DASHBOARD ADMIN

Le dashboard doit privilégier les informations opérationnelles.

Exemple :

```text
DÉO GRACIAS
Administration

Aujourd'hui

Ventes
████████

Paiements confirmés
████████

Tickets disponibles
████████

Transactions en attente
██

Incidents
█
```

---

# 43 — INFORMATIONS PRIORITAIRES

L'administratrice doit pouvoir voir rapidement :

### Ventes

* montant ;
* nombre de ventes ;
* répartition par offre.

### Paiements

* confirmés ;
* en attente ;
* échoués ;
* annulés ;
* nécessitant intervention.

### Accès

* tickets disponibles ;
* tickets attribués ;
* tickets utilisés ;
* tickets expirés.

### Système

* MikroTik disponible ou non ;
* problème de synchronisation ;
* incident en cours.

---

# 44 — ADMIN : GESTION DES OFFRES

L'administrateur doit pouvoir consulter :

```text
5H       100 FCFA
12H      200 FCFA
24H      300 FCFA
72H      500 FCFA
1 Sem    1000 FCFA
1 Mois   4000 FCFA
```

Mais l'interface doit distinguer :

* prix ;
* durée d'accès ;
* validité ;
* statut ;
* configuration MikroTik correspondante.

Toute modification d'une offre doit être considérée comme une opération sensible.

---

# 45 — ADMIN : GESTION DES TICKETS

Vue recommandée :

```text
Ticket
Offre
État
Créé
Réservé
Vendu
Utilisé
Expiration
Transaction associée
```

États conceptuels :

```text
AVAILABLE
   ↓
RESERVED
   ↓
SOLD
   ↓
USED
```

avec éventuellement :

```text
EXPIRED
CANCELLED
REFUNDED
```

L'utilisateur final ne doit pas nécessairement voir ces états techniques.

---

# 46 — ADMIN : TRANSACTIONS

Chaque transaction doit permettre de comprendre :

```text
Transaction
Client / référence
Offre
Montant
Opérateur
Statut paiement
Statut accès
Ticket attribué
Date
```

Point important :

### Statut paiement

et

### Statut accès

doivent être séparés.

Exemple :

```text
Paiement : CONFIRMED
Accès : PENDING
```

Cette séparation est essentielle pour traiter les incidents.

---

# 47 — ADMIN : FILE DES INCIDENTS

Une transaction anormale doit être identifiable.

Exemple :

```text
⚠ Paiement confirmé
   Accès non délivré

Transaction #...
300 FCFA
MTN
```

Action :

> **Résoudre**

ou :

> **Examiner**

---

# 48 — ADMIN : ÉTATS CRITIQUES

L'administration doit distinguer :

### Vert

```text
Paiement confirmé
Accès délivré
```

### Attention

```text
Paiement confirmé
Accès en attente
```

### Erreur

```text
Paiement confirmé
MikroTik indisponible
```

### Suspicion

```text
Transaction incohérente
Webhook non conforme
```

La couleur ne doit cependant jamais être le seul moyen de transmettre l'information.

---

# 49 — ADMIN : RECHERCHE

Recherche par :

* référence transaction ;
* ticket ;
* offre ;
* période ;
* opérateur ;
* statut.

Il ne faut pas afficher inutilement les données sensibles.

---

# 50 — ADMIN : DÉTAIL D'UNE TRANSACTION

Exemple :

```text
Transaction

Montant
300 FCFA

Offre
24H

Opérateur
MTN

Paiement
✓ Confirmé

Accès
✓ Délivré

Ticket
XXXXXXX

Créée
14/09/2026 22:...

Confirmée
14/09/2026 22:...

Délivrée
14/09/2026 22:...
```

Pour les problèmes :

```text
Paiement
✓ Confirmé

Accès
⚠ En attente

Dernière tentative
...

Erreur
...
```

---

# 51 — ADMIN : JOURNAL DES ÉVÉNEMENTS

Pour les opérations critiques, le système doit garder une trace.

Exemples :

```text
Transaction créée
Paiement initié
Webhook reçu
Paiement confirmé
Ticket réservé
Ticket attribué
Utilisateur MikroTik créé/modifié
Accès délivré
```

Cette information est principalement destinée à l'administration et au diagnostic.

---

# 52 — UX DE SÉCURITÉ

La sécurité doit être invisible pour le client honnête mais extrêmement stricte pour le système.

Le client ne doit jamais pouvoir :

```text
modifier le prix
modifier l'offre
déclarer lui-même un paiement réussi
choisir arbitrairement un ticket
déclarer une transaction confirmée
```

Le frontend ne doit faire que :

```text
demander
↓
afficher
↓
attendre
```

Le backend doit :

```text
valider
↓
confirmer
↓
attribuer
↓
journaliser
```

---

# 53 — UX CONTRE LA FRAUDE

Le client ne doit jamais voir :

> « Nous vous faisons confiance, vous avez payé. »

Le système doit considérer :

```text
Utilisateur
≠
Preuve de paiement
```

La preuve doit venir de la chaîne de paiement autorisée.

---

# 54 — WEBHOOK : UX INVISIBLE

Le webhook est une opération backend.

Il ne doit jamais devenir une interaction utilisateur.

Le client ne doit pas voir :

> Webhook received.

Il doit voir :

> **Paiement confirmé**

ou :

> **Nous attendons encore la confirmation de votre paiement.**

---

# 55 — UX DE FIABILITÉ

Le système doit toujours répondre à quatre questions :

### 1. Que s'est-il passé ?

Exemple :

> Votre paiement a été confirmé.

### 2. Où en est le système ?

> Votre accès est en cours de préparation.

### 3. Que dois-je faire ?

> Attendez quelques secondes ou actualisez.

### 4. Dois-je repayer ?

> **Non. Ne recommencez pas le paiement.**

Cette dernière information est particulièrement importante dans les situations ambiguës.

---

# 56 — DESIGN DES ÉTATS

Le système de design doit prévoir les états :

```text
Default
Hover
Focus
Pressed
Disabled
Loading
Success
Error
Warning
Empty
Offline
Unavailable
```

Le Design System de référence impose justement la conception explicite de ces états plutôt que leur apparition accidentelle pendant l'implémentation. 

---

# 57 — FORMULAIRES

Les formulaires doivent avoir :

* labels ;
* états ;
* feedback ;
* erreurs ;
* validation ;
* focus visible.

Les placeholders ne doivent pas remplacer les labels. 

---

# 58 — ACCESSIBILITÉ

Même si l'expérience est principalement mobile, le système doit respecter des bases d'accessibilité :

* contraste suffisant ;
* labels explicites ;
* focus visible ;
* HTML sémantique ;
* boutons compréhensibles ;
* états d'erreur lisibles ;
* navigation clavier pour l'administration ;
* support de `prefers-reduced-motion`.

Ces principes font partie du Design System de référence du projet. 

---

# 59 — MOTION

Le portail n'a pas besoin d'animations lourdes.

Les animations doivent principalement servir à :

* indiquer une transition ;
* montrer qu'une action est en cours ;
* confirmer une réussite ;
* attirer l'attention sur un changement d'état.

Exemple :

```text
Paiement
   ↓
Loading
   ↓
Confirmation
```

Le mouvement sert ici de feedback, pas de décoration.

Le principe général du Design System reste :

```text
PURPOSE
↓
CONTENT
↓
HIERARCHY
↓
LAYOUT
↓
VISUAL
↓
INTERACTION
↓
MOTION
```



---

# 60 — PERFORMANCE UX

Le portail captif doit être particulièrement léger.

Le client peut :

* avoir une connexion très faible ;
* être sur un téléphone peu puissant ;
* être dans une situation où Internet général n'est justement pas encore accessible.

Donc :

> **le portail ne doit pas dépendre d'une expérience web lourde.**

Priorités :

```text
HTML
↓
CSS
↓
JS minimal nécessaire
↓
Assets optimisés
```

Les effets visuels lourds ne doivent jamais ralentir l'accès au formulaire de connexion ou au paiement.

---

# 61 — ARCHITECTURE UX DES ÉCRANS

### Public

```text
01 — Captive Portal
02 — Ticket Login
03 — Offers
04 — Order Summary
05 — Payment Method
06 — Payment Pending
07 — Payment Success
08 — Access Delivery
09 — Connection Success
10 — Payment Error
11 — Access Error
12 — Help
```

### Administration

```text
A01 — Login
A02 — Dashboard
A03 — Transactions
A04 — Transaction Detail
A05 — Tickets
A06 — Offers
A07 — Sales
A08 — Incidents
A09 — System Status
A10 — Settings
A11 — Audit Log
```

---

# 62 — MATRICE DES PARCOURS

| Parcours      | Déclencheur              | Objectif               | Succès                   |
| ------------- | ------------------------ | ---------------------- | ------------------------ |
| Ticket        | Client possède ticket    | Accéder à Internet     | Authentification réussie |
| Achat         | Client sans ticket       | Acheter accès          | Paiement + accès         |
| Paiement      | Client sélectionne offre | Régler achat           | Paiement confirmé        |
| Attente       | Confirmation retardée    | Éviter double paiement | Confirmation reçue       |
| Échec         | Paiement refusé          | Informer / réessayer   | Nouvelle tentative       |
| Accès retardé | Paiement confirmé        | Délivrer accès         | Ticket disponible        |
| Réseau        | MikroTik indisponible    | Préserver transaction  | Résolution ultérieure    |
| Expiration    | Accès terminé            | Informer               | Nouvel achat             |
| Assistance    | Incident                 | Obtenir aide           | Contact boutique         |
| Admin         | Gestion quotidienne      | Superviser             | Action contrôlée         |

---

# 63 — CUSTOMER JOURNEY GLOBAL

```text
                 CLIENT
                   │
                   ▼
          Connexion au Wi-Fi
                   │
                   ▼
            Captive Portal
                   │
           ┌───────┴────────┐
           │                │
           ▼                ▼
       J'ai un ticket    Acheter
           │                │
           ▼                ▼
       Code ticket       Offre
           │                │
           ▼                ▼
     Validation         Paiement
           │                │
           │          ┌─────┴─────┐
           │          │           │
           │          ▼           ▼
           │       Confirmé     Échec
           │          │           │
           │          ▼           └──→ Réessayer
           │       Accès
           │          │
           └──────────┤
                      ▼
                Authentification
                      │
                      ▼
                   INTERNET
```

---

# 64 — CUSTOMER JOURNEY MAP

| Étape        | Action client        | Besoin                | Risque UX               | Réponse système       |
| ------------ | -------------------- | --------------------- | ----------------------- | --------------------- |
| Connexion    | Se connecte au Wi-Fi | Comprendre            | Portail peu clair       | Accueil immédiat      |
| Accueil      | Cherche une solution | Choisir               | Trop d'informations     | Deux CTA principaux   |
| Ticket       | Entre son code       | Accéder               | Code invalide           | Erreur claire         |
| Offre        | Compare              | Comprendre prix/durée | Confusion               | Cartes simples        |
| Paiement     | Choisit opérateur    | Payer                 | Mauvais choix           | Résumé avant paiement |
| Confirmation | Attend               | Savoir si payé        | Double paiement         | État Pending          |
| Attribution  | Attend accès         | Recevoir son accès    | Backend retardé         | État explicite        |
| Connexion    | Utilise accès        | Internet              | Authentification échoue | Fallback              |
| Utilisation  | Navigue              | Stabilité             | Déconnexion             | Information           |
| Expiration   | Perd accès           | Comprendre            | Surprise                | Message + achat       |

---

# 65 — PRINCIPLE DE CONTINUITÉ

Un parcours transactionnel ne doit pas être pensé comme plusieurs pages indépendantes.

Il doit être vécu comme une seule opération :

```text
Je veux Internet
       ↓
Je choisis
       ↓
Je paie
       ↓
Je suis confirmé
       ↓
Je reçois mon accès
       ↓
Je me connecte
```

Même si techniquement plusieurs services interviennent :

```text
Frontend
Backend
Aggregator
Mobile Money
Database
Ticket system
MikroTik
Hotspot
```

l'utilisateur doit percevoir :

> **un seul système cohérent.**

---

# 66 — RÈGLE FONDAMENTALE : LE CLIENT NE DOIT PAS COMPRENDRE L'ARCHITECTURE

Le client ne doit jamais avoir besoin de savoir qu'il existe :

```text
Frontend
API
Database
Webhook
Aggregator
MikroTik
RouterOS
Ticket inventory
```

Il doit uniquement percevoir :

```text
Déo Gracias Wi-Fi
```

---

# 67 — COHÉRENCE AVEC L'IDENTITÉ DÉO GRACIAS

Le système ne doit plus employer « Téo Graciel 7G » comme nom principal.

L'identité commerciale de référence est :

> **Déo Gracias Wi-Fi Zone**

Les anciens contenus doivent être traités comme du contenu historique ou existant à migrer, et non comme une identité à reproduire automatiquement.

---

# 68 — CONTENU COMMERCIAL SECONDAIRE

Les autres activités de Déo Gracias peuvent être présentées :

```text
Nos autres services

• Services Mobile Money
• Vente de chaussures
• Vente de tissus
```

Mais elles restent secondaires par rapport au parcours Wi-Fi.

Le portail n'est pas d'abord une vitrine commerciale générale.

Il est :

> **un point d'accès au service Wi-Fi.**

---

# 69 — MICROCOPY PRINCIPALE

Le langage doit être :

* simple ;
* direct ;
* rassurant ;
* localement compréhensible ;
* non technique.

### À privilégier

> Acheter un accès

> J'ai un ticket

> Paiement en cours

> Paiement confirmé

> Votre accès est prêt

> Réessayer

> Besoin d'aide ?

### À éviter

> Execute transaction

> Callback received

> Authentication exception

> Payment gateway error

> API unavailable

---

# 70 — RÈGLE « UNE ACTION PRINCIPALE »

Chaque écran critique doit avoir une action principale clairement identifiable.

Exemple :

### Écran paiement

```text
[ Payer ]
```

### Paiement en attente

```text
[ Vérifier l'état ]
```

### Paiement confirmé

```text
[ Obtenir mon accès ]
```

### Ticket invalide

```text
[ Réessayer ]
```

Cette règle réduit la charge cognitive.

---

# 71 — PRÉVENTION DES ERREURS

Le système doit prévenir autant que possible :

* double clic sur paiement ;
* double soumission ;
* mauvais format de ticket ;
* sélection accidentelle d'une autre offre ;
* double paiement ;
* fermeture accidentelle pendant une transaction ;
* réutilisation d'un ticket.

Les boutons transactionnels doivent passer par :

```text
Normal
↓
Processing
↓
Disabled
```

pendant l'opération.

---

# 72 — NE JAMAIS BLOQUER L'UTILISATEUR SANS EXPLICATION

Mauvais :

> Erreur.

Bon :

> Nous ne pouvons pas encore confirmer votre paiement.

Encore meilleur :

> Votre paiement peut toujours être en cours. Ne payez pas une deuxième fois. Nous continuons à vérifier.

---

# 73 — ÉTAT « UNKNOWN »

Un état particulièrement important est :

```text
UNKNOWN
```

Exemple :

```text
Paiement lancé
↓
Réponse indisponible
↓
Statut inconnu
```

Le système ne doit pas transformer automatiquement :

```text
UNKNOWN → FAILED
```

car le paiement peut avoir été effectué.

UX :

> **Nous vérifions encore votre paiement.**

---

# 74 — PRINCIPLE DE RÉCONCILIATION

L'UX doit toujours correspondre à l'état réel du backend.

Exemple :

```text
Frontend : Paiement réussi
Backend : PENDING
```

est interdit.

Le frontend ne doit jamais afficher un succès définitif sans confirmation de l'autorité backend.

---

# 75 — ADMINISTRATION : EXPÉRIENCE DE CONFIANCE

L'administration doit permettre à la responsable de la boutique de répondre rapidement à :

> « Le client a-t-il réellement payé ? »

> « Quel ticket lui a été donné ? »

> « Le ticket a-t-il été utilisé ? »

> « Pourquoi Internet ne fonctionne-t-il pas ? »

> « Que dois-je faire maintenant ? »

Le dashboard doit donc être conçu pour le **diagnostic opérationnel**, pas seulement pour les statistiques.

---

# 76 — PRINCIPLE D'OBSERVABILITÉ UX

Chaque opération importante doit être traçable.

Exemple :

```text
Client
 ↓
Commande #123
 ↓
300 FCFA
 ↓
MTN
 ↓
Paiement confirmé
 ↓
Ticket #XYZ
 ↓
MikroTik
 ↓
Accès délivré
```

L'administratrice doit pouvoir suivre cette chaîne.

---

# 77 — DESIGN SYSTEM À APPLIQUER

L'expérience devra utiliser le Design System du projet comme fondation plutôt que créer arbitrairement un nouveau langage visuel.

Le système de référence impose notamment :

* hiérarchie claire ;
* composants réutilisables ;
* états ;
* responsive ;
* accessibilité ;
* motion cohérente ;
* contenu réel ;
* error states ;
* loading states. 

La sophistication visuelle ne doit jamais prendre le dessus sur la fonction.

---

# 78 — UX QUALITY GATE

Avant validation d'un écran :

```text
[ ] L'objectif de l'écran est évident
[ ] L'action principale est claire
[ ] Le contenu est compréhensible
[ ] Les informations importantes sont prioritaires
[ ] Le mobile est correctement traité
[ ] Le loading est prévu
[ ] Le succès est prévu
[ ] L'erreur est prévue
[ ] Le cas offline/unavailable est prévu lorsque nécessaire
[ ] Aucun message technique n'est exposé inutilement
[ ] Les formulaires ont des labels
[ ] Le focus est visible
[ ] Les boutons ne peuvent pas provoquer facilement un double envoi
[ ] Les états transactionnels sont explicites
[ ] Le client sait quoi faire ensuite
```

---

# 79 — UX SECURITY GATE

Pour chaque parcours financier :

```text
[ ] Le prix affiché est cohérent avec le backend
[ ] Le client ne peut pas déclarer lui-même un paiement réussi
[ ] Le succès dépend d'une confirmation fiable
[ ] Le double paiement est prévenu
[ ] Le ticket n'est attribué qu'après confirmation
[ ] Une transaction pending peut être retrouvée
[ ] Une transaction inconnue n'est pas automatiquement considérée comme échouée
[ ] Le ticket ne peut pas être arbitrairement choisi
[ ] Les informations sensibles ne sont pas affichées
[ ] Les erreurs ne révèlent pas d'informations techniques critiques
```

---

# 80 — UX PERFORMANCE GATE

```text
[ ] Chargement rapide
[ ] Assets optimisés
[ ] JavaScript minimal
[ ] Pas de dépendance inutile
[ ] Fonctionnement correct sur mobile
[ ] Fonctionnement sur connexion faible
[ ] Pas d'animation bloquante
[ ] Le parcours paiement reste utilisable
[ ] Le portail ne dépend pas d'éléments lourds
```

---

# 81 — UX TESTING PLAN

Avant développement final, les parcours devront être testés indépendamment.

## Test 1 — Ticket valide

```text
Connexion
→ Ticket
→ Validation
→ Internet
```

## Test 2 — Ticket invalide

```text
Connexion
→ Mauvais ticket
→ Erreur
→ Réessai
```

## Test 3 — Achat réussi

```text
Offre
→ Paiement
→ Confirmation
→ Ticket
→ Connexion
```

## Test 4 — Paiement refusé

```text
Offre
→ Paiement
→ Échec
→ Réessai
```

## Test 5 — Paiement retardé

```text
Paiement
→ Pending
→ Confirmation ultérieure
→ Accès
```

## Test 6 — Paiement confirmé / accès retardé

```text
Paiement confirmé
→ Allocation impossible
→ Client informé
→ Résolution
```

## Test 7 — MikroTik indisponible

```text
Paiement
→ Confirmation
→ MikroTik indisponible
→ Transaction conservée
```

## Test 8 — Double clic

```text
Client
→ Clique deux fois
→ Une seule transaction valide
```

## Test 9 — Reconnexion après interruption

```text
Paiement
→ Connexion perdue
→ Retour portail
→ récupération de l'état
```

---

# 82 — CRITÈRES DE RÉUSSITE UX

La Phase 4 sera considérée comme réussie lorsque nous pourrons répondre précisément à toutes ces questions :

### Client

* Que voit-il en arrivant ?
* Comment sait-il qu'il peut utiliser un ticket ?
* Comment achète-t-il sans ticket ?
* Comment choisit-il son offre ?
* Comment choisit-il MTN/Moov/Celtiis ?
* Comment sait-il que le paiement est réellement confirmé ?
* Que se passe-t-il si le paiement échoue ?
* Que se passe-t-il si la confirmation est retardée ?
* Que se passe-t-il si l'argent est débité mais que l'accès n'est pas immédiatement disponible ?
* Comment récupère-t-il son ticket ?
* Comment se connecte-t-il ?
* Que voit-il lorsque son accès expire ?
* Comment obtient-il de l'aide ?

### Administration

* Comment la boutique voit-elle les ventes ?
* Comment retrouve-t-elle une transaction ?
* Comment sait-elle qu'un paiement est réellement confirmé ?
* Comment voit-elle un accès non délivré ?
* Comment consulte-t-elle les tickets ?
* Comment identifie-t-elle un incident MikroTik ?
* Comment suit-elle les transactions problématiques ?
* Comment sait-elle ce qui nécessite son intervention ?

---

# 83 — RÈGLE D'OR DU PROJET

L'expérience complète doit pouvoir être résumée ainsi :

> **Je me connecte au Wi-Fi Déo Gracias → je choisis mon moyen d'accès → je paie ou j'entre mon ticket → le système vérifie → mon accès est délivré → MikroTik m'autorise → j'ai Internet.**

Et en cas de problème :

> **Le système m'explique précisément où en est mon opération et ne me pousse jamais à payer une deuxième fois sans raison.**

---

# 84 — ARTICULATION AVEC LES PHASES PRÉCÉDENTES

La Phase 4 ne remplace aucune phase précédente.

Elle transforme leurs décisions en expérience.

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
PHASE 4
UX & Customer Journeys
   ↓
PHASE 5
Data & Backend
   ↓
PHASE 6
MikroTik Integration
   ↓
PHASE 7
Web Application
   ↓
PHASE 8
Admin
   ↓
PHASE 9
Security & Testing
   ↓
PHASE 10
Deployment & Operations
```

---

# 85 — DÉCISIONS À NE PAS PRENDRE PENDANT LA PHASE 4

La Phase 4 ne doit pas encore décider :

* du code frontend ;
* du framework exact ;
* de la structure exacte des tables SQL ;
* des endpoints API définitifs ;
* de la méthode technique exacte de communication MikroTik ;
* des secrets ;
* de l'implémentation des webhooks ;
* de la configuration RouterOS ;
* de la stratégie DevOps détaillée.

Ces décisions appartiennent aux phases techniques correspondantes.

L'UX définit **ce que l'utilisateur doit pouvoir faire et ce qu'il doit percevoir**, tandis que les phases suivantes définiront précisément comment le système réalise ces objectifs.

---

# 86 — LIVRABLE FINAL DE LA PHASE 4

Le présent document constitue la base de référence UX du système.

Il définit :

### Expérience client

* portail captif ;
* ticket existant ;
* achat ;
* offres ;
* paiement ;
* MTN ;
* Moov ;
* Celtiis ;
* attente ;
* confirmation ;
* ticket délivré ;
* connexion ;
* expiration ;
* erreurs ;
* incidents ;
* assistance.

### Expérience transactionnelle

* initiation ;
* pending ;
* confirmation ;
* allocation ;
* fulfillment ;
* échec ;
* timeout ;
* statut inconnu ;
* récupération.

### Expérience administration

* dashboard ;
* ventes ;
* paiements ;
* tickets ;
* incidents ;
* supervision ;
* audit ;
* recherche.

### Qualité

* mobile-first ;
* accessibilité ;
* responsive ;
* performance ;
* états ;
* erreurs ;
* sécurité UX ;
* prévention du double paiement.

---

# 87 — CHECKPOINT DE FIN DE PHASE 4

Avant de passer à la conception de la donnée et du backend, nous devons disposer d'une vision suffisamment précise pour que l'équipe technique puisse répondre à :

> **« Quel doit être le comportement du système pour chaque situation possible vécue par le client ou l'administratrice ? »**

À ce stade, nous avons donc défini non seulement le **happy path**, mais également les parcours critiques :

```text
✓ Ticket valide
✓ Ticket invalide
✓ Ticket expiré
✓ Achat réussi
✓ Paiement échoué
✓ Paiement annulé
✓ Paiement en attente
✓ Paiement confirmé
✓ Paiement confirmé + accès retardé
✓ MikroTik indisponible
✓ Perte de connexion
✓ Retour après paiement
✓ Risque de double paiement
✓ Expiration d'accès
✓ Assistance
✓ Supervision administrative
```

C'est particulièrement important pour ce projet : **la qualité du système ne sera pas déterminée uniquement par la réussite du parcours normal, mais par la manière dont il se comporte lorsque paiement, réseau, ticket et MikroTik ne sont plus parfaitement synchronisés.**

Le référentiel UX du projet rappelle justement qu'une expérience robuste doit être pensée pour les différents comportements utilisateurs et pour les états non idéaux, et pas uniquement pour l'état nominal. 

---

# 88 — PROCHAINE PHASE

## **PHASE 5 — DATA & BACKEND SYSTEM**

La prochaine phase devra transformer ces parcours en **modèle métier et système de données**.

Nous définirons précisément :

```text
Users
       ↓
Orders
       ↓
Payment Transactions
       ↓
Payment Events
       ↓
Offers
       ↓
Ticket Inventory
       ↓
Ticket Allocation
       ↓
MikroTik Access
       ↓
Access Sessions
       ↓
Incidents
       ↓
Audit Logs
```

et surtout les **machines à états**, relations, contraintes d'intégrité, règles d'idempotence, transactions, permissions, événements et mécanismes de récupération permettant de garantir qu'un paiement confirmé ne puisse pas être perdu, qu'un ticket ne puisse pas être attribué deux fois et qu'un client ne puisse pas fabriquer lui-même la preuve d'un paiement.

**Phase 4 — UX & Customer Journeys : terminée au niveau de la spécification.**
**Prochaine étape : Phase 5 — Data & Backend System.**
