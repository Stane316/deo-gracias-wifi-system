# `08_WEB_APPLICATION.md`

````markdown
# 08 — WEB APPLICATION

**Projet :** Déo Gracias — Wi-Fi Access & Online Payment System  
**Phase :** 7 — Web Application  
**Document :** `08_WEB_APPLICATION.md`  
**Statut :** SPECIFICATION OFFICIELLE  
**Version :** 1.0  
**Date :** 15 septembre 2026  
**Dépendances principales :**
- `01_PRODUCT_REQUIREMENTS`
- `02_EXISTING_INFRASTRUCTURE`
- `03_PAYMENT_RESEARCH`
- `04_ARCHITECTURE`
- `05_DATA_MODEL`
- `06_UX_SPECIFICATION`
- `07_MIKROTIK_INTEGRATION`

---

# 00 — DOCUMENT CONTROL

## 00.1 — Purpose

Ce document définit la conception fonctionnelle, UX, technique et
architecturale de l'application Web publique du système Déo Gracias.

Il constitue le contrat de référence pour la construction de :

- l'interface publique ;
- la consultation des offres ;
- la création de commandes ;
- l'initiation du paiement ;
- le suivi du paiement ;
- la récupération du ticket ;
- la gestion des états d'erreur ;
- la communication avec le backend ;
- l'intégration future avec le système HotSpot.

Ce document ne définit pas l'intégralité :

- du backend métier ;
- du Connector MikroTik ;
- du dashboard administrateur ;
- de la configuration réseau ;
- de la logique interne du prestataire de paiement.

Ces éléments sont traités dans leurs documents respectifs.

---

# 01 — OBJECTIF DE LA PHASE 7

La Phase 7 doit permettre de construire une expérience permettant à
un client connecté au Wi-Fi Déo Gracias de :

1. comprendre immédiatement le service ;
2. consulter les offres disponibles ;
3. choisir une durée ;
4. lancer un achat ;
5. effectuer un paiement en ligne ;
6. attendre une confirmation fiable ;
7. recevoir son ticket numérique ;
8. comprendre comment utiliser le ticket ;
9. récupérer son ticket si nécessaire ;
10. comprendre clairement les erreurs ;
11. recommencer une opération sans risque de double paiement.

Le système doit être utilisable principalement depuis un smartphone.

---

# 02 — POSITIONNEMENT DU WEB APPLICATION

L'application Web n'est pas un simple site vitrine.

Elle constitue l'interface transactionnelle du service Wi-Fi.

Elle doit donc combiner :

```text
SERVICE
+
UX
+
COMMERCE
+
PAYMENT
+
TICKET DELIVERY
+
NETWORK HANDOFF
````

Le parcours principal est :

```text
CONNECT TO WI-FI
      ↓
CAPTIVE PORTAL
      ↓
WEB APPLICATION
      ↓
CHOOSE PLAN
      ↓
CREATE ORDER
      ↓
PAY
      ↓
PAYMENT CONFIRMED
      ↓
ALLOCATE TICKET
      ↓
DISPLAY TICKET
      ↓
LOGIN TO HOTSPOT
```

---

# 03 — PRINCIPES FONDAMENTAUX

## 03.1 — User first

La technologie ne doit pas dicter l'expérience.

La séquence de conception est :

```text
USER
↓
INTENT
↓
JOURNEY
↓
CONTENT
↓
INTERACTION
↓
DESIGN
↓
TECHNOLOGY
```

L'application doit d'abord permettre au client de comprendre et
d'agir.

---

# 04 — CLARITY BEFORE COMPLEXITY

Le client doit comprendre rapidement :

* où il se trouve ;
* quelles offres existent ;
* combien elles coûtent ;
* combien de temps elles durent ;
* quelle action effectuer ;
* si son paiement est en cours ;
* si son paiement a réussi ;
* où récupérer son ticket.

La sophistication visuelle ne doit jamais masquer ces informations.

---

# 05 — MOBILE-FIRST

Le produit est principalement destiné à des clients connectés
depuis leur téléphone.

La conception doit donc commencer par :

```text
MOBILE
↓
SMALL SCREEN
↓
TOUCH
↓
LOW BANDWIDTH
↓
FAST ACTION
```

Le desktop constitue une adaptation secondaire.

---

# 06 — CONTEXTE RÉSEAU PARTICULIER

L'application peut être ouverte depuis un environnement HotSpot.

Il faut donc considérer :

* réseau captif ;
* connectivité partielle ;
* DNS redirection ;
* navigateur mobile ;
* débit potentiellement limité ;
* interruption réseau ;
* retour depuis une page de paiement ;
* expiration de session HotSpot.

L'application ne doit pas supposer que l'utilisateur possède une
connexion Internet parfaitement stable.

---

# 07 — RESPONSIVE EXPERIENCE

Le responsive n'est pas uniquement une réduction de taille.

Selon la largeur :

* les cartes peuvent changer de disposition ;
* la navigation peut se simplifier ;
* les boutons peuvent devenir pleine largeur ;
* les informations peuvent être regroupées ;
* certaines animations peuvent être réduites ;
* certains effets décoratifs peuvent être supprimés.

Le comportement mobile doit rester une expérience complète.

---

# 08 — NIVEAU D'EXPÉRIENCE

Le produit doit prioriser :

```text
LEVEL 1 — FUNCTIONAL
        ↓
LEVEL 2 — REFINED
        ↓
LEVEL 3 — EXPRESSIVE
```

L'expérience ne doit pas commencer directement par des effets
complexes ou une immersion excessive.

La fonctionnalité et la confiance doivent être établies avant
d'ajouter des effets avancés.

---

# 09 — OBJECTIFS UX

L'expérience doit permettre au client de :

### Comprendre

> « Je peux acheter du temps de connexion Wi-Fi ici. »

### Comparer

> « Je vois clairement combien coûte chaque formule. »

### Décider

> « Je sais quelle formule correspond à mon besoin. »

### Payer

> « Je comprends comment effectuer le paiement. »

### Vérifier

> « Je sais si mon paiement a été confirmé. »

### Recevoir

> « Je peux récupérer mon ticket. »

### Utiliser

> « Je sais quoi faire avec le ticket. »

---

# 10 — OFFRES COMMERCIALES

Les offres commerciales officielles sont :

|       Prix | Durée     |
| ---------: | --------- |
|   100 FCFA | 5 heures  |
|   200 FCFA | 12 heures |
|   300 FCFA | 24 heures |
|   500 FCFA | 48 heures |
| 1 000 FCFA | 5 jours   |
| 4 000 FCFA | 10 jours  |
| 5 000 FCFA | 40 jours  |

Ces valeurs constituent les offres commerciales de référence.

---

# 11 — SOURCE DE VÉRITÉ DES PRIX

Le frontend ne doit jamais constituer la source de vérité des prix.

Architecture :

```text
DATABASE
   ↓
BACKEND
   ↓
API
   ↓
FRONTEND
```

Le frontend affiche les données fournies par le backend.

Il ne doit pas décider :

```text
price = 500
```

ou :

```text
duration = 48h
```

comme règle métier autonome.

---

# 12 — PLAN OBJECT

Chaque plan exposé à l'utilisateur doit conceptuellement contenir :

```text
id
code
name
price_xof
duration_seconds
display_order
active
metadata
```

Le frontend utilise notamment :

```text
name
price_xof
duration
display_order
```

Les données internes inutiles au client ne doivent pas être exposées.

---

# 13 — PAGE / ÉCRAN PRINCIPAL

Le point d'entrée public doit permettre de comprendre immédiatement :

```text
DÉO GRACIAS
Wi-Fi Access
```

puis :

```text
Choisissez votre formule
```

avec les offres disponibles.

La page doit privilégier :

* prix ;
* durée ;
* bénéfice immédiat ;
* CTA ;
* moyen de paiement accepté lorsque pertinent.

---

# 14 — PLAN CARDS

Chaque offre peut être représentée par une carte.

Structure recommandée :

```text
┌──────────────────────────┐
│ 5 HEURES                 │
│                          │
│ 100 FCFA                 │
│                          │
│ Accès Wi-Fi pendant 5h   │
│                          │
│ [ Acheter ]              │
└──────────────────────────┘
```

La carte doit permettre une comparaison rapide.

---

# 15 — HIÉRARCHIE DES OFFRES

L'interface peut mettre en avant une offre particulière uniquement
si une règle commerciale claire existe.

Ne pas inventer automatiquement :

```text
BEST VALUE
POPULAR
RECOMMENDED
```

sans validation métier.

---

# 16 — CTA

Les CTA doivent exprimer l'action.

Exemples :

```text
Acheter
Choisir cette formule
Continuer
Payer
Voir mon ticket
```

Éviter les CTA vagues :

```text
Cliquez ici
OK
Go
Submit
```

---

# 17 — CHECKOUT

Après sélection d'une offre, l'utilisateur arrive dans une étape
de confirmation.

Contenu minimum :

```text
Formule sélectionnée
Prix
Durée
Moyen de paiement
Action de paiement
```

Exemple :

```text
Votre formule

24 HEURES
300 FCFA

[ Continuer vers le paiement ]
```

---

# 18 — ORDER CREATION

Lorsqu'un utilisateur choisit une offre :

```text
FRONTEND
   ↓
CREATE ORDER
   ↓
BACKEND
```

Le backend crée la commande.

Le frontend ne doit pas créer directement :

* ticket ;
* paiement confirmé ;
* état vendu.

---

# 19 — ORDER IDENTIFIER

Chaque commande doit avoir :

```text
internal order id
+
public order reference
```

Le client ne doit pas nécessairement voir l'identifiant interne.

La référence publique peut être utilisée pour :

* support ;
* récupération ;
* diagnostic ;
* suivi.

---

# 20 — ORDER STATE

Le frontend doit pouvoir représenter au minimum :

```text
CREATED
PAYMENT_PENDING
PAID
TICKET_ALLOCATED
DELIVERED
FAILED
EXPIRED
CANCELLED
```

Flux nominal :

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

---

# 21 — PAYMENT INITIATION

Le frontend demande au backend d'initier le paiement.

```text
FRONTEND
   ↓
POST /orders
   ↓
ORDER CREATED
   ↓
POST /payments
   ↓
PAYMENT INITIATED
```

Le backend communique ensuite avec le prestataire de paiement.

---

# 22 — PAYMENT PROVIDER ABSTRACTION

Le frontend ne doit pas dépendre directement de l'API interne
du prestataire.

Architecture :

```text
FRONTEND
   ↓
BACKEND
   ↓
PAYMENT SERVICE
   ↓
PAYMENT PROVIDER
```

Cela permet de remplacer ou compléter le prestataire plus tard.

Le fournisseur actuellement privilégié par la recherche est FedaPay,
mais son onboarding et ses paramètres de production doivent être
confirmés avant mise en production.

---

# 23 — PAYMENT STATUS

Le frontend ne doit jamais considérer :

```text
payment initiated
```

comme :

```text
payment successful
```

États :

```text
INITIATED
PENDING
APPROVED
DECLINED
CANCELLED
REFUNDED
```

---

# 24 — PAYMENT CONFIRMATION

La confirmation doit venir du backend.

Architecture :

```text
PAYMENT PROVIDER
      ↓
WEBHOOK
      ↓
BACKEND
      ↓
VERIFY
      ↓
UPDATE PAYMENT
      ↓
UPDATE ORDER
```

Le frontend peut ensuite consulter l'état du backend.

---

# 25 — WEBHOOK

Le frontend ne doit jamais recevoir ou traiter directement le webhook
du prestataire.

Le webhook est une opération backend.

Le backend doit notamment gérer :

* signature ;
* événement dupliqué ;
* événement invalide ;
* événement tardif ;
* retry ;
* incohérence de montant ;
* mauvaise référence de commande.

---

# 26 — PAYMENT AMOUNT VALIDATION

Le backend doit vérifier :

```text
provider amount
==
order amount
```

Il doit également vérifier :

```text
provider reference
↔
internal order
```

Le frontend ne peut pas modifier le montant après création de
commande.

---

# 27 — DOUBLE PAYMENT PROTECTION

Le système doit éviter qu'un utilisateur paie deux fois pour une
même commande en raison :

* d'un double clic ;
* d'un refresh ;
* d'une mauvaise connexion ;
* d'un retour navigateur ;
* d'un webhook répété.

---

# 28 — IDEMPOTENCY

Les opérations sensibles doivent utiliser des mécanismes
d'idempotence.

Notamment :

```text
create order
initiate payment
payment webhook
ticket allocation
ticket delivery
```

Deux traitements identiques ne doivent pas créer deux ventes.

---

# 29 — PAYMENT PENDING SCREEN

Lorsque le paiement n'est pas encore confirmé :

```text
Paiement en cours...

Nous vérifions votre paiement.
Ne fermez pas cette page.
```

Le système doit éviter d'afficher :

```text
Paiement réussi
```

avant confirmation backend.

---

# 30 — POLLING

Le frontend peut consulter périodiquement le statut de la commande
si nécessaire.

Exemple :

```text
GET /orders/{public_reference}/status
```

Le polling doit :

* être limité ;
* utiliser un intervalle raisonnable ;
* s'arrêter lorsque l'état final est atteint ;
* éviter les requêtes infinies.

---

# 31 — PAYMENT SUCCESS

Une fois le paiement confirmé :

```text
PAYMENT = APPROVED
ORDER = PAID
```

puis :

```text
TICKET ALLOCATION
```

Le frontend ne doit pas supposer que le ticket est déjà disponible.

---

# 32 — CRITICAL DISTINCTION

Le système distingue :

```text
PAYMENT SUCCESS
```

de :

```text
TICKET DELIVERY SUCCESS
```

Ainsi :

```text
PAID
≠
DELIVERED
```

Cette distinction est fondamentale.

---

# 33 — TICKET ALLOCATION

Après confirmation du paiement :

```text
PAID
 ↓
FIND AVAILABLE DIGITAL TICKET
 ↓
RESERVE
 ↓
ASSIGN
 ↓
DELIVER
```

Le ticket doit provenir du stock :

```text
DIGITAL
```

uniquement.

---

# 34 — TICKET INVENTORY

Le frontend ne gère pas directement l'inventaire.

Le backend sélectionne un ticket :

```text
destination = DIGITAL
state = AVAILABLE
plan_id = purchased_plan
```

---

# 35 — PHYSICAL TICKET PROTECTION

Le système ne doit jamais attribuer automatiquement un ticket marqué :

```text
PHYSICAL
```

à une commande numérique.

---

# 36 — TICKET STATES

Le ticket peut suivre :

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

# 37 — TICKET DELIVERY

Le ticket numérique doit être présenté de manière extrêmement claire.

Exemple :

```text
Votre accès Wi-Fi est prêt

FORMULE
24 HEURES

IDENTIFIANT
abc123

MOT DE PASSE
abc123

[ Copier ]

Connectez-vous au portail Wi-Fi
avec ces identifiants.
```

Puis :

```text
Référence commande
DG-XXXXXX
```

---

# 38 — USERNAME / PASSWORD

Dans le système actuel :

```text
username = password
```

Le frontend doit donc pouvoir afficher les deux valeurs séparément
pour rester compatible avec le modèle HotSpot.

Même si elles sont identiques aujourd'hui, le frontend ne doit pas
architecturalement supposer qu'elles seront toujours identiques.

---

# 39 — TICKET SECURITY

Le ticket est une donnée sensible.

Il ne doit pas être exposé :

* dans les logs frontend ;
* dans les URLs inutilement ;
* dans les analytics ;
* dans les messages publics ;
* dans des paramètres GET lorsqu'ils peuvent être évités.

---

# 40 — TICKET RETRIEVAL

Le système doit prévoir la possibilité de récupérer le ticket après
une perte accidentelle de la page.

Cette fonctionnalité peut utiliser :

```text
order reference
+
temporary access token
```

ou un mécanisme équivalent.

Elle ne doit pas permettre de récupérer arbitrairement les tickets
d'autres clients.

---

# 41 — TICKET DISPLAY SECURITY

Une page ticket doit être accessible uniquement à la personne
possédant un moyen d'accès valide à la commande.

Le simple fait de connaître un identifiant séquentiel ne doit pas
permettre d'accéder au ticket.

---

# 42 — NETWORK HANDOFF

Le Web Application ne doit pas essayer de contrôler directement
la session HotSpot.

Le rôle du Web Application est :

```text
EXPLAIN
+
SELL
+
DELIVER CREDENTIALS
```

Le rôle du MikroTik est :

```text
AUTHENTICATE
+
ENFORCE ACCESS
+
EXPIRE ACCESS
```

---

# 43 — LOGIN TO HOTSPOT

Le parcours final peut être :

```text
BUY
 ↓
RECEIVE TICKET
 ↓
RETURN TO HOTSPOT LOGIN
 ↓
ENTER USERNAME
 ↓
ENTER PASSWORD
 ↓
CONNECT
```

L'autologin automatique n'est pas obligatoire dans le MVP.

---

# 44 — AUTO-LOGIN

L'autologin est considéré comme une évolution future.

Il pourrait nécessiter :

* intégration plus profonde avec le HotSpot ;
* tokenisation ;
* redirection contrôlée ;
* mécanisme sécurisé de handoff.

Le MVP privilégie le ticket explicite.

---

# 45 — CAPTIVE PORTAL COMPATIBILITY

L'application doit fonctionner correctement lorsqu'elle est ouverte
depuis un portail captif.

Il faut éviter de dépendre de fonctionnalités nécessitant une
connectivité Internet complète avant authentification.

---

# 46 — WALLED GARDEN

Le Walled Garden MikroTik est actuellement vide.

La Phase 7 devra produire la liste exacte des ressources nécessaires
au fonctionnement avant authentification.

Principe :

```text
ONLY REQUIRED DOMAINS
```

et non :

```text
ALLOW EVERYTHING
```

---

# 47 — RESSOURCES PUBLIQUES

Avant authentification HotSpot, le système doit déterminer précisément
quels éléments sont indispensables :

* domaine de l'application ;
* API publique nécessaire ;
* fournisseur de paiement si nécessaire ;
* assets essentiels ;
* mécanismes de vérification.

Aucune ouverture réseau inutile ne doit être introduite.

---

# 48 — ARCHITECTURE FRONTEND

Architecture conceptuelle :

```text
WEB APP
│
├── App Shell
│
├── Public Pages
│
├── Plan Catalog
│
├── Checkout
│
├── Payment Status
│
├── Ticket
│
└── Error / Recovery
```

---

# 49 — FRONTEND / BACKEND SEPARATION

Le frontend est responsable de :

* affichage ;
* interaction ;
* validation UX ;
* navigation ;
* présentation des états.

Le backend est responsable de :

* règles métier ;
* prix ;
* commandes ;
* paiement ;
* inventaire ;
* ticket ;
* sécurité ;
* autorisation.

---

# 50 — FRONTEND NEVER TRUSTED

Toute donnée provenant du navigateur doit être considérée comme
non fiable.

Exemples :

```text
price
plan_id
order_id
ticket_id
payment status
customer state
```

Le backend doit revalider les données importantes.

---

# 51 — API CONTRACT

L'application doit communiquer avec le backend via une API claire.

Exemples conceptuels :

```text
GET  /api/plans
POST /api/orders
GET  /api/orders/{reference}
POST /api/orders/{reference}/payment
GET  /api/orders/{reference}/status
GET  /api/orders/{reference}/ticket
```

Les routes définitives seront établies avec le backend.

---

# 52 — GET PLANS

```text
GET /api/plans
```

Retourne uniquement les offres :

```text
active = true
```

Le backend doit appliquer :

```text
display_order
```

pour déterminer l'ordre d'affichage.

---

# 53 — CREATE ORDER

```text
POST /api/orders
```

Entrée conceptuelle :

```json
{
  "plan_id": "..."
}
```

Le backend :

1. vérifie que le plan existe ;
2. vérifie qu'il est actif ;
3. récupère le prix réel ;
4. crée la commande ;
5. crée le snapshot commercial ;
6. retourne une référence publique.

---

# 54 — PRICE SNAPSHOT

La commande doit conserver le prix au moment de l'achat.

Exemple :

```text
order.price_xof = 500
order.duration_seconds = 172800
```

Ainsi, une modification future du plan ne modifie pas rétroactivement
une commande existante.

---

# 55 — PAYMENT ENDPOINT

Conceptuellement :

```text
POST /api/orders/{reference}/payment
```

Le backend :

1. vérifie la commande ;
2. vérifie son état ;
3. récupère son montant ;
4. vérifie l'idempotency key ;
5. crée/initie le paiement ;
6. retourne les informations nécessaires au frontend.

---

# 56 — ORDER STATUS

```text
GET /api/orders/{reference}/status
```

Réponse conceptuelle :

```json
{
  "order_status": "PAYMENT_PENDING",
  "payment_status": "PENDING",
  "ticket_available": false
}
```

Les données sensibles ne doivent pas être exposées.

---

# 57 — TICKET ENDPOINT

```text
GET /api/orders/{reference}/ticket
```

Ce endpoint ne doit retourner le ticket que si :

```text
order is authorized
AND
payment is confirmed
AND
ticket is assigned
```

---

# 58 — HTTP STATUS CODES

L'API doit utiliser des codes HTTP cohérents.

Exemples :

```text
200 OK
201 Created
400 Bad Request
401 Unauthorized
403 Forbidden
404 Not Found
409 Conflict
422 Unprocessable Entity
429 Too Many Requests
500 Internal Server Error
503 Service Unavailable
```

---

# 59 — ERROR FORMAT

Les erreurs backend doivent avoir une structure exploitable.

Exemple :

```json
{
  "error": {
    "code": "PAYMENT_PENDING",
    "message": "Votre paiement est encore en cours de vérification.",
    "retryable": true
  }
}
```

Le frontend ne doit pas afficher directement une stack trace.

---

# 60 — USER-FACING ERROR MESSAGES

Les messages techniques doivent être traduits en messages utiles.

Éviter :

```text
500 Internal Server Error
```

Préférer :

```text
Le service rencontre momentanément un problème.
Votre paiement n'est pas considéré comme perdu.
Réessayez dans quelques instants.
```

---

# 61 — ERROR CATEGORIES

Le système doit distinguer :

```text
NETWORK_ERROR
PAYMENT_PENDING
PAYMENT_DECLINED
PAYMENT_CANCELLED
ORDER_EXPIRED
TICKET_UNAVAILABLE
TICKET_ALLOCATION_FAILED
SERVICE_UNAVAILABLE
UNKNOWN_ERROR
```

---

# 62 — ERROR RECOVERY

Chaque erreur importante doit répondre à :

```text
WHAT HAPPENED?
WHAT SHOULD I DO?
IS MY MONEY SAFE?
CAN I RETRY?
```

Exemple :

```text
Paiement confirmé

Nous avons bien reçu votre paiement,
mais votre accès n'est pas encore prêt.

Votre commande est conservée.
Vous n'avez pas besoin de payer à nouveau.

[ Vérifier mon accès ]
```

---

# 63 — DOUBLE-CLICK PROTECTION

Pendant une opération critique :

```text
[ Payer ]
```

devient :

```text
[ Paiement en cours... ]
```

et l'action doit être temporairement désactivée.

Cela réduit les risques de doubles requêtes.

---

# 64 — LOADING STATES

Les états de chargement doivent être prévus pour :

```text
loading plans
creating order
initiating payment
checking payment
allocating ticket
loading ticket
```

Ils doivent fournir un feedback visible.

---

# 65 — EMPTY STATES

Exemple :

```text
Aucune formule n'est actuellement disponible.

Veuillez réessayer plus tard.
```

Le frontend ne doit pas afficher une page cassée si l'API retourne
zéro offre.

---

# 66 — OFFLINE / CONNECTIVITY STATE

Lorsque le navigateur perd la connexion :

```text
Connexion interrompue

Nous ne pouvons pas vérifier votre commande pour le moment.
Votre paiement n'est pas automatiquement considéré comme échoué.

[ Réessayer ]
```

---

# 67 — PAYMENT RETRY

Un paiement échoué peut être relancé lorsque cela est autorisé.

Mais :

```text
PAID
```

ne doit jamais être relancé comme un nouveau paiement sans raison
métier explicite.

---

# 68 — ORDER EXPIRATION

Une commande en attente peut expirer.

Exemple :

```text
CREATED
↓
PAYMENT_PENDING
↓
EXPIRED
```

L'utilisateur doit voir :

```text
Cette commande a expiré.
Vous pouvez recommencer un nouvel achat.
```

---

# 69 — PAYMENT CONFIRMED / TICKET DELAY

Cas critique :

```text
PAYMENT = APPROVED
TICKET = NOT YET DELIVERED
```

Interface :

```text
Paiement confirmé

Nous préparons votre accès Wi-Fi.

Ne payez pas une deuxième fois.

[ Vérifier ]
```

---

# 70 — INVENTORY EMPTY

Si aucun ticket numérique n'est disponible :

```text
TICKET_UNAVAILABLE
```

Le système doit éviter de confirmer une nouvelle vente si le stock
nécessaire n'est pas disponible, sauf si une stratégie métier
explicite existe.

---

# 71 — INVENTORY RACE CONDITION

Deux utilisateurs peuvent essayer d'acheter le dernier ticket
simultanément.

La protection doit être faite au backend.

Le frontend ne peut pas résoudre ce problème.

Architecture :

```text
CLIENT A ─┐
          ├──► DATABASE TRANSACTION
CLIENT B ─┘
              ↓
         ONE TICKET ONLY
```

---

# 72 — CUSTOMER DATA MINIMIZATION

Le MVP ne doit demander que les informations nécessaires.

Il n'est pas nécessaire de demander :

* nom complet ;
* adresse ;
* date de naissance ;
* données inutiles ;

pour acheter un ticket Wi-Fi, sauf obligation métier ou réglementaire
explicitement établie.

---

# 73 — CUSTOMER IDENTIFICATION

Le système peut utiliser une identité temporaire de session ou une
référence pseudonyme.

Un numéro de téléphone peut être envisagé si nécessaire au paiement
ou à la récupération, mais il ne doit pas être demandé sans raison.

---

# 74 — PRIVACY

Les données client doivent être minimisées.

Le système ne doit pas collecter des données simplement parce qu'elles
sont techniquement disponibles.

---

# 75 — FRONTEND SECURITY

Le frontend doit :

* éviter d'exposer les secrets ;
* ne jamais contenir de clé privée ;
* ne jamais contenir de credentials MikroTik ;
* ne jamais contenir de secrets de paiement backend ;
* éviter de stocker inutilement des tickets ;
* limiter les informations dans les URLs.

---

# 76 — XSS

Les données provenant :

* du backend ;
* des paramètres ;
* des erreurs ;
* des métadonnées ;

doivent être traitées comme non fiables lorsqu'elles sont injectées
dans l'interface.

---

# 77 — CSRF

Le mécanisme de protection dépendra de l'architecture d'authentification
du backend.

Toute opération sensible doit disposer d'une protection adaptée.

---

# 78 — RATE LIMITING

Le backend doit limiter notamment :

```text
order creation
payment initiation
status polling
ticket retrieval
```

pour empêcher l'abus.

Le frontend ne doit pas être considéré comme une protection.

---

# 79 — BOT / ABUSE PROTECTION

Une protection progressive peut être ajoutée si nécessaire.

Elle ne doit cependant pas créer une friction disproportionnée pour
un client légitime connecté au Wi-Fi.

---

# 80 — ACCESSIBILITY

L'application doit respecter au minimum :

```text
semantic HTML
keyboard navigation
visible focus
accessible labels
sufficient contrast
touch-friendly controls
non-color-only feedback
reduced motion
```

Les fonctionnalités essentielles ne doivent jamais dépendre
uniquement du hover.

---

# 81 — FORM ACCESSIBILITY

Chaque champ doit avoir :

```text
label
input
validation
error state
```

Les erreurs doivent être associées au champ concerné lorsque
pertinent.

---

# 82 — TOUCH TARGETS

Les éléments interactifs doivent être suffisamment grands pour une
utilisation tactile confortable.

---

# 83 — MOTION

Les animations peuvent servir :

* feedback ;
* transition ;
* hiérarchie ;
* identité.

Elles ne doivent pas ralentir inutilement le paiement.

Le principe est :

```text
FUNCTION
↓
FEEDBACK
↓
MOTION
```

et non :

```text
MOTION
↓
WAIT
↓
USER
```

---

# 84 — REDUCED MOTION

Si :

```text
prefers-reduced-motion: reduce
```

est actif :

* réduire les transitions ;
* supprimer les mouvements décoratifs inutiles ;
* conserver les informations essentielles ;
* ne pas bloquer l'action.

---

# 85 — PERFORMANCE

La performance est particulièrement importante car l'utilisateur
peut être connecté à un réseau limité.

Priorités :

```text
FAST INITIAL LOAD
+
SMALL ASSETS
+
MINIMAL JAVASCRIPT
+
OPTIMIZED IMAGES
+
NO UNNECESSARY REQUESTS
```

---

# 86 — CAPTIVE NETWORK PERFORMANCE

L'application doit rester utilisable avec :

* faible débit ;
* latence ;
* pertes de paquets ;
* chargement lent ;
* interruptions temporaires.

Les effets lourds ne doivent pas être prioritaires sur le parcours
transactionnel.

---

# 87 — ASSETS

Éviter de charger :

* vidéos lourdes ;
* modèles 3D lourds ;
* bibliothèques inutilisées ;
* images non optimisées ;

avant que l'utilisateur puisse accéder à la fonction principale.

---

# 88 — JAVASCRIPT

Le JavaScript doit être chargé et exécuté de manière raisonnable.

Le produit doit conserver un minimum de robustesse même en cas de
chargement partiel.

---

# 89 — ANALYTICS

Les événements analytiques éventuels doivent être conçus sans
exposer :

* ticket ;
* mot de passe ;
* données de paiement ;
* données personnelles inutiles.

Événements possibles :

```text
PLAN_VIEWED
PLAN_SELECTED
ORDER_CREATED
PAYMENT_STARTED
PAYMENT_CONFIRMED
PAYMENT_FAILED
TICKET_DELIVERED
```

---

# 90 — OBSERVABILITY

Les erreurs doivent pouvoir être corrélées à une commande grâce à une
référence non sensible.

Exemple :

```text
DG-20260915-AB12
```

Les logs frontend ne doivent pas contenir les credentials du ticket.

---

# 91 — TECHNOLOGIE FRONTEND

Le choix technologique doit privilégier :

* simplicité ;
* maintenabilité ;
* performance ;
* responsive ;
* disponibilité de l'écosystème ;
* facilité de déploiement.

L'architecture doit permettre une séparation claire entre :

```text
UI
STATE
API
DOMAIN LOGIC
```

---

# 92 — ARCHITECTURE LOGIQUE FRONTEND

Structure conceptuelle :

```text
src/
│
├── app/
│
├── components/
│
├── features/
│   ├── plans/
│   ├── orders/
│   ├── payments/
│   └── tickets/
│
├── services/
│
├── api/
│
├── hooks/
│
├── state/
│
├── utils/
│
└── styles/
```

La structure exacte dépendra du stack final.

---

# 93 — DOMAIN SEPARATION

Les fonctionnalités doivent rester séparées :

```text
PLANS
ORDERS
PAYMENTS
TICKETS
```

Un composant de paiement ne doit pas contenir toute la logique
d'inventaire des tickets.

---

# 94 — STATE MANAGEMENT

L'état local et l'état serveur doivent être distingués.

### Local

```text
selected plan
UI state
modal
form state
loading state
```

### Server

```text
plans
order
payment status
ticket
```

Les données serveur ne doivent pas être considérées comme vérité
permanente dans le navigateur.

---

# 95 — CACHE

Le cache peut être utilisé pour les offres publiques.

Mais les informations transactionnelles doivent être fraîches.

Notamment :

```text
payment status
ticket state
order state
```

---

# 96 — NAVIGATION

Le parcours doit rester simple :

```text
OFFERS
 ↓
CHECKOUT
 ↓
PAYMENT
 ↓
STATUS
 ↓
TICKET
```

Éviter une navigation complexe pendant le paiement.

---

# 97 — BROWSER BACK BUTTON

Le système doit gérer le bouton retour du navigateur.

Exemples :

* retour depuis checkout ;
* retour depuis paiement ;
* retour depuis ticket.

Un retour navigateur ne doit pas déclencher automatiquement un nouveau
paiement.

---

# 98 — PAGE REFRESH

Un refresh ne doit pas :

* créer une nouvelle commande automatiquement ;
* générer un nouveau paiement ;
* consommer un deuxième ticket.

Le statut doit être récupérable depuis le backend.

---

# 99 — PUBLIC ORDER RECOVERY

La récupération d'une commande doit être contrôlée.

Un simple :

```text
/order/123
```

ne doit pas révéler les données sensibles de cette commande.

---

# 100 — TICKET PAGE

La page ticket constitue une étape critique.

Elle doit :

* afficher clairement les credentials ;
* permettre de copier ;
* expliquer comment les utiliser ;
* afficher la formule ;
* afficher la durée ;
* afficher la référence ;
* fournir un moyen de revenir au portail.

---

# 101 — COPY ACTION

Bouton :

```text
Copier
```

Après action :

```text
Copié
```

Le feedback doit être immédiat.

---

# 102 — TICKET INSTRUCTIONS

Instructions minimales :

```text
1. Connectez-vous au Wi-Fi Déo Gracias.
2. Ouvrez le portail captif.
3. Entrez votre identifiant.
4. Entrez votre mot de passe.
5. Validez.
```

Le contenu exact pourra être adapté à l'expérience réelle du HotSpot.

---

# 103 — TRUST & REASSURANCE

Le parcours de paiement doit rassurer sans surcharger.

Exemples d'informations utiles :

```text
Prix
Durée
Montant total
Statut du paiement
Référence commande
```

Éviter les longs textes inutiles au moment de payer.

---

# 104 — COMMERCIAL TRANSPARENCY

Avant paiement, l'utilisateur doit pouvoir voir clairement :

```text
FORMULE
DURÉE
PRIX
```

Il ne doit pas découvrir le prix final après le paiement.

---

# 105 — PAYMENT CONFIDENCE

Après paiement :

```text
Paiement confirmé
```

doit être affiché uniquement après validation backend.

Le système ne doit pas utiliser uniquement le retour visuel du
prestataire de paiement comme preuve définitive.

---

# 106 — TRANSACTIONAL STATES MATRIX

| État                  | Interface           |
| --------------------- | ------------------- |
| Plans loading         | Loader              |
| Plans loaded          | Catalogue           |
| No plans              | Empty state         |
| Order creating        | Loading             |
| Payment pending       | Pending             |
| Payment approved      | Confirmation        |
| Payment declined      | Error + retry       |
| Payment cancelled     | Cancelled + retry   |
| Ticket allocating     | Preparing           |
| Ticket delivered      | Ticket              |
| Ticket unavailable    | Recovery            |
| Connector unavailable | Delayed / recovery  |
| Backend unavailable   | Service unavailable |
| Network offline       | Offline             |
| Order expired         | Expired             |

---

# 107 — CRITICAL USER JOURNEYS

## Journey A — Existing ticket

```text
CONNECT
↓
CAPTIVE PORTAL
↓
ENTER TICKET
↓
HOTSPOT AUTH
↓
INTERNET
```

Ce parcours existant doit rester fonctionnel.

---

## Journey B — New digital purchase

```text
CONNECT
↓
PORTAL
↓
OFFERS
↓
SELECT PLAN
↓
CHECKOUT
↓
PAYMENT
↓
PAYMENT CONFIRMED
↓
TICKET ALLOCATED
↓
TICKET DISPLAYED
↓
HOTSPOT LOGIN
```

---

## Journey C — Payment pending

```text
SELECT
↓
PAY
↓
PENDING
↓
CHECK
↓
CONFIRMED
↓
TICKET
```

---

## Journey D — Payment declined

```text
SELECT
↓
PAY
↓
DECLINED
↓
EXPLANATION
↓
RETRY
```

---

## Journey E — Payment confirmed / ticket delayed

```text
PAY
↓
CONFIRMED
↓
TICKET DELAY
↓
NO SECOND PAYMENT
↓
RETRY / RECOVERY
↓
TICKET
```

---

## Journey F — Network interruption

```text
PAYMENT
↓
NETWORK LOST
↓
UNKNOWN CLIENT STATE
↓
RECONNECT
↓
CHECK ORDER STATUS
↓
RECOVER
```

---

# 108 — STATE MACHINE GLOBAL

Le parcours global est :

```text
                    ┌──────────────┐
                    │   BROWSING   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ PLAN SELECTED│
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ ORDER CREATED│
                    └──────┬───────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ PAYMENT PENDING  │
                  └────────┬─────────┘
                           │
                ┌──────────┼──────────┐
                │          │          │
                ▼          ▼          ▼
             DECLINED   APPROVED   CANCELLED
                │          │
                │          ▼
                │    ┌──────────────┐
                │    │ TICKET       │
                │    │ ALLOCATION   │
                │    └──────┬───────┘
                │           │
                │      ┌────┴────┐
                │      │         │
                │      ▼         ▼
                │   DELIVERED   FAILED
                │      │         │
                │      ▼         ▼
                │    TICKET    INCIDENT
                │
                ▼
             RETRY
```

---

# 109 — ORDER / PAYMENT / TICKET INDEPENDENCE

Les trois domaines doivent rester distincts.

```text
ORDER
  │
  ├── PAYMENT
  │
  └── TICKET
```

Un paiement peut être :

```text
APPROVED
```

alors que :

```text
TICKET = PENDING
```

Le modèle doit pouvoir représenter cet état.

---

# 110 — BACKEND AUTHORITY

Le frontend doit toujours considérer le backend comme autorité
pour :

```text
plan price
plan availability
order state
payment state
ticket allocation
ticket availability
```

---

# 111 — MIKROTIK AUTHORITY

Le frontend ne communique pas directement avec MikroTik.

Architecture interdite :

```text
BROWSER
↓
MIKROTIK API
```

Architecture obligatoire :

```text
BROWSER
↓
BACKEND
↓
CONNECTOR
↓
MIKROTIK
```

---

# 112 — NO MIKROTIK CREDENTIALS IN FRONTEND

Aucun :

```text
MikroTik username
MikroTik password
API secret
Router IP
```

ne doit être embarqué dans le JavaScript public.

---

# 113 — DEPLOYMENT

L'application Web publique doit être déployable indépendamment
du MikroTik.

Architecture :

```text
                    INTERNET
                       │
                       ▼
                ┌────────────┐
                │ WEB APP    │
                └─────┬──────┘
                      │
                      ▼
                ┌────────────┐
                │ BACKEND    │
                └─────┬──────┘
                      │
            ┌─────────┴─────────┐
            ▼                   ▼
       PAYMENT PROVIDER    CONNECTOR
                                │
                                ▼
                            MIKROTIK
```

---

# 114 — ENVIRONMENTS

Le projet doit distinguer :

```text
DEVELOPMENT
STAGING
PRODUCTION
```

Les credentials et données ne doivent pas être mélangés.

---

# 115 — PAYMENT TESTING

Le développement doit utiliser le sandbox lorsque disponible.

Aucun test automatisé ne doit débiter accidentellement un compte
réel.

---

# 116 — MIKROTIK TESTING

Les tests d'intégration réseau doivent être réalisés avec une
stratégie contrôlée.

Le Web Application ne doit pas être connecté directement au routeur
de production pendant les premières étapes de développement.

---

# 117 — VERSIONING

Toute modification majeure du contrat API doit être documentée.

Exemple :

```text
/api/v1/
```

si cette stratégie est retenue.

---

# 118 — API DOCUMENTATION

Les endpoints devront être documentés avec :

* méthode ;
* URL ;
* paramètres ;
* body ;
* réponses ;
* erreurs ;
* auth ;
* idempotence ;
* rate limit ;
* exemples.

---

# 119 — TESTING STRATEGY

La Phase 7 devra prévoir :

## Unit tests

Pour :

* logique de présentation ;
* formatage ;
* validation ;
* state transitions.

## Integration tests

Pour :

* API ;
* commandes ;
* paiement simulé ;
* ticket delivery.

## E2E

Pour :

```text
select plan
→ create order
→ payment
→ confirmation
→ ticket
```

---

# 120 — CRITICAL E2E SCENARIOS

Au minimum :

### Test 1

Paiement réussi → ticket livré.

### Test 2

Paiement refusé → aucun ticket consommé.

### Test 3

Paiement annulé → aucun ticket consommé.

### Test 4

Paiement confirmé → ticket temporairement indisponible.

### Test 5

Double webhook → une seule commande payée.

### Test 6

Double clic paiement → une seule opération.

### Test 7

Refresh pendant paiement → état conservé.

### Test 8

Perte réseau → récupération possible.

### Test 9

Deux clients → même dernier ticket → un seul gagne.

### Test 10

Ticket physique → jamais attribué au digital.

---

# 121 — DESIGN SYSTEM APPLICATION

Le Web Application doit appliquer les principes du Design System :

```text
hierarchy
spacing
typography
semantic colors
components
states
responsive
accessibility
motion
```

Les composants doivent être cohérents.

---

# 122 — COMPONENT INVENTORY

Le MVP doit prévoir au minimum :

```text
AppShell
Header
PlanCard
PlanGrid
Price
Duration
PrimaryButton
SecondaryButton
OrderSummary
PaymentStatus
LoadingState
ErrorState
EmptyState
SuccessState
TicketCard
CredentialField
CopyButton
Alert
Toast
RetryAction
```

Les composants exacts peuvent évoluer après la conception UX.

---

# 123 — DESIGN TOKENS

Les décisions visuelles importantes doivent être centralisées.

Exemples :

```text
colors
spacing
radius
typography
shadows
breakpoints
motion
z-index
```

Éviter les valeurs arbitraires répétées.

---

# 124 — SEMANTIC COLORS

Les couleurs doivent avoir des rôles.

Exemple :

```text
primary
success
warning
error
info
surface
text
muted
disabled
```

La couleur ne doit pas être le seul moyen de communiquer un état.

---

# 125 — BUTTON STATES

Chaque bouton important doit prévoir :

```text
default
hover
focus
active
loading
disabled
```

---

# 126 — INPUT STATES

Chaque champ doit prévoir :

```text
default
focus
filled
error
disabled
success when useful
```

---

# 127 — VISUAL LANGUAGE

L'identité visuelle de Déo Gracias doit être définie dans la
Phase UX/Design et ne doit pas être inventée arbitrairement par
l'agent de développement.

L'agent doit implémenter les spécifications validées.

---

# 128 — NO TEMPLATE DESIGN

L'application ne doit pas être construite à partir d'un template
générique qui impose sa propre hiérarchie.

Le design doit découler du service et du contexte d'utilisation.

---

# 129 — NO UNNECESSARY 3D

La 3D, le WebGL, les particules ou les effets lourds ne sont pas
obligatoires.

Ils ne doivent être ajoutés que s'ils apportent une valeur réelle
à l'expérience.

Priorité :

```text
USABILITY
>
PERFORMANCE
>
TRUST
>
VISUAL EXPRESSION
```

---

# 130 — PROGRESSIVE ENHANCEMENT

L'expérience principale doit fonctionner sans dépendre d'un effet
visuel avancé.

Exemple :

```text
WITHOUT MOTION
→ usable

WITHOUT 3D
→ usable

WITHOUT DECORATION
→ usable
```

---

# 131 — SEO

Le Web Application n'est pas principalement un site SEO.

Les pages publiques pertinentes peuvent néanmoins disposer de :

* title ;
* description ;
* metadata ;
* semantic HTML ;
* URLs propres.

Le SEO ne doit pas compliquer le parcours transactionnel.

---

# 132 — INTERNATIONALIZATION

La langue principale du produit est à définir selon la stratégie
commerciale.

L'architecture doit néanmoins éviter de rendre une future
internationalisation impossible.

---

# 133 — CURRENCY

La monnaie commerciale actuelle est :

```text
XOF
```

Les prix doivent être affichés clairement en :

```text
FCFA
```

---

# 134 — TIME DISPLAY

Les durées commerciales doivent être affichées de manière
compréhensible :

```text
5 heures
12 heures
24 heures
48 heures
5 jours
10 jours
40 jours
```

Éviter d'exposer :

```text
172800 seconds
```

au client.

---

# 135 — BUSINESS RULES NOT IN FRONTEND

Les règles suivantes ne doivent pas être codées uniquement dans
l'interface :

```text
price
duration
inventory availability
payment success
ticket assignment
refund state
```

---

# 136 — SECURITY BOUNDARY

```text
┌────────────────────────────────────────────┐
│ PUBLIC / UNTRUSTED                         │
│                                            │
│ Browser                                    │
│ Frontend                                   │
│ Client input                               │
└──────────────────────┬─────────────────────┘
                       │
                       │ API
                       ▼
┌────────────────────────────────────────────┐
│ TRUSTED APPLICATION                        │
│                                            │
│ Backend                                    │
│ Database                                   │
│ Payment integration                        │
│ Ticket inventory                            │
└──────────────────────┬─────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────┐
│ PRIVATE INFRASTRUCTURE                     │
│                                            │
│ Connector                                  │
│ MikroTik                                   │
└────────────────────────────────────────────┘
```

---

# 137 — FAILURE PHILOSOPHY

Une erreur technique ne doit pas devenir une erreur commerciale.

Exemple :

```text
CONNECTOR DOWN
```

ne signifie pas :

```text
PAYMENT FAILED
```

Et :

```text
FRONTEND ERROR
```

ne signifie pas :

```text
ORDER LOST
```

Les états métier doivent être persistants côté backend.

---

# 138 — MONEY SAFETY PRINCIPLE

Toute erreur pendant ou après le paiement doit répondre à une règle :

> **Ne jamais demander un deuxième paiement simplement parce que
> l'application n'a pas réussi à afficher ou livrer immédiatement
> le résultat du premier paiement.**

---

# 139 — RECOVERY PRIORITY

En cas de problème :

```text
1. Preserve payment state
2. Preserve order state
3. Preserve ticket inventory
4. Create incident if necessary
5. Retry safely
6. Inform user
```

---

# 140 — SUPPORT REFERENCE

Chaque transaction doit disposer d'une référence permettant à
l'administration future de retrouver :

```text
order
payment
ticket
incident
```

sans exposer ces informations au public.

---

# 141 — ADMIN BOUNDARY

Le dashboard destiné à la mère n'appartient pas à cette phase.

La Phase 7 fournit uniquement les interfaces nécessaires au client.

La Phase 8 traitera :

```text
ADMIN
STOCK
ORDERS
PAYMENTS
TICKETS
INCIDENTS
CONNECTOR
REPORTING
```

---

# 142 — CONNECTOR BOUNDARY

Le Connector n'est pas une partie du frontend.

Le frontend ne doit jamais :

```text
call MikroTik API
```

ou :

```text
send RouterOS commands
```

---

# 143 — MIKROTIK BOUNDARY

Le Web Application ne doit pas :

* modifier les profils ;
* modifier le firewall ;
* modifier le NAT ;
* modifier le DHCP ;
* modifier le DNS ;
* modifier le script On-Login.

Ces opérations appartiennent à l'intégration réseau.

---

# 144 — MVP SCOPE

Le MVP Web Application comprend :

```text
[✓] Public landing / portal
[✓] Plan catalog
[✓] Plan selection
[✓] Order creation
[✓] Checkout
[✓] Payment initiation
[✓] Payment status
[✓] Payment confirmation
[✓] Digital ticket allocation
[✓] Ticket display
[✓] Ticket copy
[✓] Recovery state
[✓] Error handling
[✓] Responsive
[✓] Accessibility baseline
[✓] Security baseline
[✓] Performance baseline
```

---

# 145 — MVP EXCLUSIONS

Le MVP n'inclut pas nécessairement :

```text
[ ] Automatic HotSpot login
[ ] Dynamic MikroTik user creation
[ ] Customer account system
[ ] Loyalty system
[ ] Promotions engine
[ ] Subscription system
[ ] Complex analytics dashboard
[ ] Multi-business support
[ ] Advanced CRM
[ ] Full admin dashboard
[ ] RADIUS redesign
```

Ces fonctionnalités pourront être étudiées ultérieurement.

---

# 146 — PHASE 7 TASKS

La Phase 7 doit être exécutée dans l'ordre suivant.

## TASK 01 — Application UX architecture

Définir :

* pages ;
* parcours ;
* navigation ;
* états ;
* transitions ;
* erreurs.

---

## TASK 02 — Visual system application

Définir :

* couleurs ;
* typographie ;
* spacing ;
* cards ;
* buttons ;
* forms ;
* status components.

---

## TASK 03 — Frontend architecture

Définir :

* stack ;
* structure ;
* routing ;
* state management ;
* API layer ;
* environment configuration.

---

## TASK 04 — API contract

Définir précisément :

* endpoints ;
* request ;
* response ;
* error format ;
* authentication ;
* idempotency ;
* rate limiting.

---

## TASK 05 — Plan catalog

Implémenter :

```text
GET plans
↓
display
↓
select
```

---

## TASK 06 — Order flow

Implémenter :

```text
plan
↓
order
↓
checkout
```

---

## TASK 07 — Payment flow

Implémenter :

```text
initiation
↓
pending
↓
confirmation
↓
failure
```

---

## TASK 08 — Ticket flow

Implémenter :

```text
paid
↓
allocation
↓
delivery
↓
display
```

---

## TASK 09 — Recovery

Implémenter :

* refresh ;
* retry ;
* network failure ;
* pending payment ;
* delayed ticket ;
* expired order.

---

## TASK 10 — Security

Vérifier :

* secrets ;
* validation ;
* rate limits ;
* XSS ;
* authorization ;
* ticket exposure ;
* error leakage.

---

## TASK 11 — Performance

Vérifier :

* bundle ;
* images ;
* requests ;
* loading ;
* mobile network ;
* caching.

---

## TASK 12 — E2E

Valider tous les parcours critiques.

---

# 147 — PHASE 7 QUALITY GATES

La phase ne doit pas passer directement de :

```text
DESIGN
↓
CODE
```

Elle doit utiliser :

```text
GATE 01
UX

↓

GATE 02
VISUAL DESIGN

↓

GATE 03
API CONTRACT

↓

GATE 04
FRONTEND IMPLEMENTATION

↓

GATE 05
PAYMENT INTEGRATION

↓

GATE 06
TICKET DELIVERY

↓

GATE 07
SECURITY

↓

GATE 08
PERFORMANCE

↓

GATE 09
E2E

↓

GATE 10
PRODUCTION READINESS
```

---

# 148 — ACCEPTANCE CRITERIA

La Phase 7 sera considérée comme terminée lorsque :

## Functional

```text
[ ] Plans loaded from backend
[ ] Correct prices displayed
[ ] Correct durations displayed
[ ] Plan selection works
[ ] Order creation works
[ ] Payment initiation works
[ ] Payment confirmation works
[ ] Ticket allocation works
[ ] Ticket displayed
[ ] Ticket copy works
[ ] Recovery works
```

## Reliability

```text
[ ] Duplicate payment prevented
[ ] Duplicate webhook handled
[ ] Ticket collision prevented
[ ] Refresh safe
[ ] Network failure recoverable
[ ] Payment/ticket states separated
```

## Security

```text
[ ] No MikroTik credentials in frontend
[ ] No payment secrets in frontend
[ ] Ticket protected
[ ] API input validated
[ ] Rate limiting active
[ ] Sensitive errors hidden
```

## UX

```text
[ ] Main action immediately understandable
[ ] Prices obvious
[ ] Duration obvious
[ ] Payment state obvious
[ ] Ticket state obvious
[ ] Errors actionable
[ ] Recovery understandable
```

## Accessibility

```text
[ ] Semantic HTML
[ ] Keyboard navigation
[ ] Visible focus
[ ] Labels
[ ] Contrast
[ ] Touch-friendly controls
[ ] Reduced motion
```

## Performance

```text
[ ] Mobile-first performance validated
[ ] Assets optimized
[ ] No unnecessary heavy dependencies
[ ] Critical path optimized
[ ] Loading states implemented
```

---

# 149 — AGENT DEVELOPMENT CONTRACT

L'agent de développement doit considérer ce document comme une
spécification.

Il ne doit pas inventer de nouvelles règles métier.

Lorsqu'une information manque :

```text
STOP
↓
IDENTIFY UNKNOWN
↓
DOCUMENT
↓
ASK / PROPOSE DECISION
↓
CONTINUE AFTER VALIDATION
```

Il ne doit pas modifier silencieusement :

* les prix ;
* les durées ;
* les états ;
* le modèle de ticket ;
* le fonctionnement HotSpot.

---

# 150 — AGENT IMPLEMENTATION RULE

L'agent doit suivre :

```text
UNDERSTAND
↓
PLAN
↓
ARCHITECT
↓
IMPLEMENT
↓
TEST
↓
VERIFY
↓
DOCUMENT
```

et non :

```text
PROMPT
↓
GENERATE EVERYTHING
```

---

# 151 — NO SCOPE CREEP

Pendant l'implémentation de la Phase 7, l'agent ne doit pas ajouter
spontanément :

* dashboard admin ;
* CRM ;
* système de fidélité ;
* abonnement ;
* création dynamique MikroTik ;
* refonte du HotSpot ;
* RADIUS ;
* nouvelles offres ;
* nouvelles règles commerciales.

Toute nouvelle fonctionnalité importante doit être traitée comme
une décision séparée.

---

# 152 — UNKNOWN MANAGEMENT

Les éléments encore non résolus de la Phase 6 restent explicitement
ouverts :

```text
RADIUS details
4000 FCFA MikroTik mapping
5000 FCFA MikroTik mapping
exact profile configuration
HotSpot portal files
Connector write permissions
```

La Web Application ne doit pas inventer leur réponse.

---

# 153 — PHASE 7 DEPENDENCIES

La réalisation complète nécessite notamment :

```text
DATABASE
BACKEND API
PAYMENT PROVIDER
DIGITAL TICKET INVENTORY
```

Le frontend peut toutefois être développé avec des mocks/stubs
pendant la construction initiale.

---

# 154 — MOCK MODE

Pour permettre le développement parallèle :

```text
MOCK PLANS
MOCK ORDER
MOCK PAYMENT
MOCK TICKET
```

peuvent être utilisés temporairement.

Mais les mocks doivent être clairement séparés de la production.

---

# 155 — PRODUCTION MODE

En production :

```text
REAL DATABASE
REAL PAYMENT PROVIDER
REAL DIGITAL INVENTORY
REAL BACKEND
```

Aucune donnée mockée ne doit rester active.

---

# 156 — ENVIRONMENT VARIABLES

Les secrets et URLs dépendant de l'environnement doivent être
configurés via l'environnement.

Exemples conceptuels :

```text
API_BASE_URL
PUBLIC_APP_URL
PAYMENT_PUBLIC_CONFIGURATION
ENVIRONMENT
```

Aucun secret backend ne doit être exposé au bundle frontend.

---

# 157 — DEPLOYMENT CHECKLIST

Avant production :

```text
[ ] Production API configured
[ ] Production database configured
[ ] Payment production credentials configured
[ ] CORS configured
[ ] HTTPS active
[ ] Environment variables verified
[ ] Error monitoring configured
[ ] Rate limits configured
[ ] Ticket inventory loaded
[ ] Public domain configured
[ ] Walled Garden requirements validated
[ ] Mobile test completed
[ ] E2E payment test completed
```

---

# 158 — ROLLBACK

Une version frontend défectueuse doit pouvoir être remplacée
rapidement par la dernière version stable.

Le déploiement doit donc conserver :

```text
CURRENT
+
PREVIOUS STABLE
```

lorsque l'infrastructure de déploiement le permet.

---

# 159 — DATA SAFETY

Le frontend ne doit pas supprimer de données métier.

Toute suppression importante doit être effectuée côté backend avec
les règles appropriées.

---

# 160 — LOGGING RULE

Ne jamais logger :

```text
ticket password
payment secret
API secret
full sensitive payload
```

Les logs doivent utiliser des identifiants techniques non sensibles.

---

# 161 — SUPPORTABILITY

Chaque écran transactionnel doit permettre de retrouver une référence
de commande lorsque cela est pertinent.

Exemple :

```text
Commande : DG-XXXXXX
```

Cela facilite le support sans exposer les données sensibles.

---

# 162 — UX PRINCIPLE

Le client ne doit jamais être obligé de comprendre :

```text
MikroTik
RouterOS
API
Connector
Webhook
Database
```

pour utiliser le service.

Le système technique doit rester invisible autant que possible.

---

# 163 — TECHNICAL TRANSPARENCY

L'interface doit expliquer les conséquences métier, pas les détails
techniques.

Mauvais :

```text
Connector synchronization failed.
```

Bon :

```text
Votre paiement a été confirmé.
Nous préparons votre accès Wi-Fi.
```

---

# 164 — TRUST PRINCIPLE

Dans une application de paiement, la confiance est une fonctionnalité.

Le produit doit toujours rendre visible :

```text
WHAT YOU CHOSE
WHAT YOU PAY
WHAT HAPPENED
WHAT YOU RECEIVED
WHAT TO DO NEXT
```

---

# 165 — EXPERIENCE PRINCIPLE

Le système suit :

```text
CLARITY
↓
CONFIDENCE
↓
ACTION
↓
FEEDBACK
↓
RECOVERY
```

Une interface spectaculaire mais ambiguë est considérée comme
inférieure à une interface simple mais fiable.

---

# 166 — FINAL ARCHITECTURE

Architecture globale retenue :

```text
                         CUSTOMER
                            │
                            ▼
                     ┌─────────────┐
                     │   MOBILE    │
                     │   BROWSER   │
                     └──────┬──────┘
                            │
                            ▼
                     ┌─────────────┐
                     │ WEB APP     │
                     │             │
                     │ Plans       │
                     │ Checkout    │
                     │ Payment UI  │
                     │ Ticket UI   │
                     └──────┬──────┘
                            │
                         HTTPS
                            │
                            ▼
                  ┌─────────────────────┐
                  │      BACKEND        │
                  │                     │
                  │ Plans               │
                  │ Orders              │
                  │ Payments            │
                  │ Tickets             │
                  │ Inventory           │
                  │ Incidents           │
                  └──────┬───────┬──────┘
                         │       │
                         │       │
                         ▼       ▼
                 ┌──────────┐  ┌─────────────┐
                 │ PAYMENT  │  │  CONNECTOR  │
                 │ PROVIDER │  │    LOCAL    │
                 └──────────┘  └──────┬──────┘
                                      │
                                  RouterOS API
                                      │
                                      ▼
                                ┌────────────┐
                                │  MIKROTIK  │
                                │            │
                                │  HotSpot   │
                                └────────────┘
```

---

# 167 — RESPONSIBILITY MATRIX

| Fonction             | Frontend | Backend | Payment Provider |      Connector | MikroTik |
| -------------------- | -------: | ------: | ---------------: | -------------: | -------: |
| Afficher offres      |        ✓ |       ✓ |                  |                |          |
| Définir prix         |          |       ✓ |                  |                |          |
| Créer commande       |          |       ✓ |                  |                |          |
| Initier paiement     |        ✓ |       ✓ |                ✓ |                |          |
| Confirmer paiement   |          |       ✓ |                ✓ |                |          |
| Gérer inventaire     |          |       ✓ |                  |                |          |
| Allouer ticket       |          |       ✓ |                  | éventuellement |          |
| Afficher ticket      |        ✓ |       ✓ |                  |                |          |
| Authentifier HotSpot |          |         |                  |                |        ✓ |
| Expirer accès        |          |         |                  |                |        ✓ |
| Lire MikroTik        |          |         |                  |              ✓ |        ✓ |
| Modifier MikroTik    |          |         |                  |              ✓ |        ✓ |
| Afficher erreur      |        ✓ |       ✓ |                  |                |          |
| Gestion réseau       |          |         |                  |                |        ✓ |

---

# 168 — NON-RESPONSIBILITIES

Le Web Application n'est pas responsable de :

```text
DHCP
DNS
NAT
Firewall
HotSpot enforcement
Router configuration
MikroTik credentials
MikroTik backups
MikroTik API exposure
```

---

# 169 — BUSINESS TRUTH

Le Web Application obtient les règles commerciales du backend.

```text
DATABASE
   ↓
BACKEND
   ↓
WEB APP
```

Jamais :

```text
MIKROTIK
↓
WEB APP
```

pour déterminer le prix.

---

# 170 — NETWORK TRUTH

Le Web Application ne détermine pas si un utilisateur est réellement
autorisé à accéder au réseau.

Cette responsabilité appartient au HotSpot.

```text
WEB APP
→ delivers credentials

MIKROTIK
→ enforces access
```

---

# 171 — PAYMENT TRUTH

Le navigateur n'est pas une autorité de paiement.

```text
PAYMENT PROVIDER
        ↓
BACKEND VERIFICATION
        ↓
PAYMENT STATE
```

---

# 172 — TICKET TRUTH

Le navigateur n'est pas une autorité d'inventaire.

```text
DATABASE
   ↓
BACKEND
   ↓
TICKET ASSIGNMENT
   ↓
FRONTEND DISPLAY
```

---

# 173 — SECURITY MODEL

La chaîne de confiance est :

```text
UNTRUSTED
Browser
   ↓
API validation
   ↓
TRUSTED Backend
   ↓
Database / Payment
   ↓
Controlled Connector
   ↓
Private MikroTik
```

---

# 174 — FINAL RULES

Les règles suivantes sont absolues pour la Phase 7 :

```text
NEVER trust frontend pricing.
NEVER trust frontend payment state.
NEVER expose MikroTik credentials.
NEVER call MikroTik directly from browser.
NEVER expose payment secrets.
NEVER assign physical tickets to digital orders.
NEVER deliver an unconfirmed payment ticket.
NEVER consume two tickets for one order.
NEVER ask for a second payment because of an internal delivery error.
NEVER expose ticket credentials unnecessarily.
NEVER modify network configuration from the Web Application.
```

Et :

```text
ALWAYS validate server-side.
ALWAYS preserve transaction state.
ALWAYS separate order/payment/ticket states.
ALWAYS handle failures explicitly.
ALWAYS provide recovery.
ALWAYS prioritize mobile usability.
ALWAYS preserve accessibility.
ALWAYS protect sensitive data.
ALWAYS keep the technical infrastructure behind the application boundary.
```

---

# 175 — PHASE 7 CLOSURE CRITERIA

La Phase 7 sera officiellement clôturée lorsque :

```text
[ ] UX specification implemented
[ ] Visual system implemented
[ ] API contract implemented
[ ] Plan catalog operational
[ ] Order flow operational
[ ] Payment flow operational
[ ] Payment confirmation operational
[ ] Digital ticket allocation operational
[ ] Ticket display operational
[ ] Recovery operational
[ ] Security baseline validated
[ ] Accessibility validated
[ ] Responsive validated
[ ] Performance validated
[ ] E2E validated
[ ] Production deployment validated
```

---

# 176 — NEXT PHASE

Après validation complète de la Phase 7 :

# PHASE 8 — ADMIN DASHBOARD

La Phase 8 aura pour objectif de construire l'interface
d'administration destinée à la gestion opérationnelle de Déo Gracias.

Elle couvrira notamment :

```text
Dashboard
↓
Orders
↓
Payments
↓
Digital Ticket Inventory
↓
Physical Ticket Inventory
↓
Ticket Batches
↓
Incidents
↓
Connector Status
↓
MikroTik Monitoring
↓
Business Operations
```

Le dashboard devra permettre à la mère de gérer le système sans avoir
à comprendre MikroTik, RouterOS, API ou infrastructure logicielle.

---

# 177 — FINAL PHASE 7 PRINCIPLE

> **The customer should experience a simple Wi-Fi purchase,
> while the system handles the complexity underneath.**

La complexité doit rester dans :

```text
Backend
Payment Integration
Inventory
Connector
MikroTik
```

et non être transférée au client.

---

# 178 — DOCUMENT STATUS

**Phase 7 — Web Application : SPECIFICATION READY**

Le présent document constitue la référence pour la conception et
l'implémentation de l'application Web publique.

Toute modification importante doit être documentée et validée avant
d'être intégrée au produit.

````

## Décision de structure

Avec ce document, notre chaîne documentaire devient maintenant cohérente :

```text
00  PROJECT CONTEXT
01  PRODUCT REQUIREMENTS
02  EXISTING INFRASTRUCTURE
03  PAYMENT RESEARCH
04  ARCHITECTURE
05  DATA MODEL
06  UX SPECIFICATION
07  MIKROTIK INTEGRATION
08  WEB APPLICATION
09  ADMIN DASHBOARD
...
````

Et surtout, **la Phase 7 ne mélange pas les responsabilités** :

```text
                    CLIENT
                      │
                      ▼
              ┌──────────────┐
              │  WEB APP     │
              │   PHASE 7    │
              └──────┬───────┘
                     │
                     ▼
              ┌──────────────┐
              │   BACKEND    │
              │ Business     │
              │ Payments     │
              │ Orders       │
              │ Inventory    │
              └──────┬───────┘
                     │
          ┌──────────┴──────────┐
          ▼                     ▼
   PAYMENT PROVIDER         CONNECTOR
                                │
                                ▼
                            MIKROTIK
```

La conséquence importante est que **l'agent qui développera le frontend ne devra jamais improviser la logique métier** : il consomme les offres du backend, crée des commandes, déclenche le flux de paiement et affiche les états retournés. Il ne décide ni du prix, ni de la réussite du paiement, ni du ticket à distribuer.

### Phase 7 est donc maintenant spécifiée.

**Prochaine phase logique : Phase 8 — Admin Dashboard**, mais avant de l'attaquer, la prochaine action de travail devrait être de **valider ce document `08_WEB_APPLICATION.md`**, puis seulement passer à sa mise en œuvre/au document suivant.
