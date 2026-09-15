# PHASE 2 — ÉTUDE ET CHOIX DE LA SOLUTION DE PAIEMENT

**Projet : Déo Gracias WiFi Zone — Wi-Fi Access & Payment System**
**Version : 1.0**
**Date : 14 septembre 2026**
**Statut : Phase terminée — décision d’architecture provisoire établie**

---

# 1. Objectif de la phase

Cette phase a pour objectif de déterminer **comment le futur système de Déo Gracias recevra les paiements électroniques** avant de commencer la conception technique de la plateforme.

Le problème n'est pas simplement :

> « Quel moyen de paiement mettre sur le site ? »

Le véritable problème est :

> **Quelle infrastructure de paiement permettra à un client connecté au Wi-Fi Déo Gracias de payer une offre, de confirmer automatiquement le paiement, puis de déclencher de manière fiable la délivrance de son accès Wi-Fi ?**

La solution retenue doit donc être évaluée selon plusieurs dimensions :

1. disponibilité au Bénin ;
2. MTN / Moov / Celtiis ;
3. API exploitable ;
4. paiement depuis un téléphone ;
5. confirmation automatique ;
6. webhooks ou mécanisme équivalent ;
7. règlement vers le compte de la boutique ;
8. frais ;
9. pertinence pour les petits montants ;
10. délai de disponibilité des fonds ;
11. sécurité ;
12. fiabilité ;
13. simplicité d'intégration ;
14. possibilité d'évolution.

---

# 2. Contraintes spécifiques de Déo Gracias

La Phase 1 nous impose déjà un certain nombre de contraintes.

L'infrastructure actuelle est :

```text
Internet
   │
   ▼
Huawei HG8145V6
   │
   ▼
MikroTik RB951Ui-2HnD
RouterOS 6.49.17
   │
   ▼
Hotspot Déo Gracias
192.168.88.200
   │
   ▼
Client Wi-Fi
```

Le MikroTik possède notamment :

```text
192.168.88.254/24
192.168.100.7/24
```

Le Hotspot est :

```text
hotspot1
Address : 192.168.88.200
To Address : 192.168.88.200
```

Et surtout :

> **Le Walled Garden actuel est vide.**

Cela aura une conséquence importante pour la Phase 3 : nous devrons concevoir explicitement le mécanisme permettant à un client non authentifié d'accéder aux services nécessaires au paiement.

---

# 3. Les offres à supporter

La grille affichée actuellement sur le portail captif constitue désormais **la source de vérité fonctionnelle pour les offres**.

| Offre     |       Prix |  Validité |
| --------- | ---------: | --------: |
| 5 heures  |   100 FCFA | 24 heures |
| 12 heures |   200 FCFA | 24 heures |
| 24 heures |   300 FCFA | 48 heures |
| 72 heures |   500 FCFA |   5 jours |
| 1 semaine | 1 000 FCFA |  10 jours |
| 1 mois    | 4 000 FCFA |  40 jours |

Important :

**durée d'accès ≠ durée de validité du ticket.**

Exemple :

```text
100 FCFA
    │
    ├── Temps d'accès : 5 heures
    │
    └── Validité du ticket : 24 heures
```

Cette distinction devra être conservée dans notre futur modèle de données.

---

# 4. Critères de sélection

J'établis maintenant la grille de décision.

### Critères critiques

| Critère                   | Importance        |
| ------------------------- | ----------------- |
| Paiement au Bénin         | 🔴 Critique       |
| MTN                       | 🔴 Critique       |
| Moov                      | 🔴 Critique       |
| Celtiis                   | 🟠 Très important |
| API                       | 🔴 Critique       |
| Confirmation automatique  | 🔴 Critique       |
| Webhook/IPN               | 🔴 Critique       |
| Sécurité                  | 🔴 Critique       |
| Faible coût               | 🔴 Critique       |
| Petits paiements 100 FCFA | 🔴 Critique       |
| Reversement mobile money  | 🔴 Critique       |
| Simplicité                | 🟠 Important      |
| Évolutivité               | 🟠 Important      |
| Sandbox/test              | 🟠 Important      |

---

# 5. Option A — API MTN Mobile Money directe

MTN Bénin propose officiellement une **API MoMo destinée aux marchands**, permettant l'intégration du paiement Mobile Money dans un site ou une application. ([MTN Bénin][1])

Le produit de paiement en ligne MTN indique actuellement :

* API gratuite ;
* intégration possible dans une application/site ;
* commission annoncée de **1,7 %** du montant collecté ;
* compte accepteur ;
* possibilité de recevoir les fonds via l'infrastructure MoMo Business. ([MTN Bénin][2])

MTN indique également que son API MoMo est destinée aux marchands et dispose d'un environnement développeur/API. ([MTN Momo][3])

### Coût sur nos offres

À 1,7 % :

|    Prix | Frais théoriques |
| ------: | ---------------: |
|   100 F |           1,70 F |
|   200 F |           3,40 F |
|   300 F |           5,10 F |
|   500 F |           8,50 F |
| 1 000 F |             17 F |
| 4 000 F |             68 F |

C'est excellent du point de vue du coût.

### Mais problème

Cette solution est essentiellement :

```text
Client
  ↓
MTN Mobile Money
  ↓
MTN API
  ↓
Compte accepteur Déo Gracias
```

Elle ne règle pas directement :

```text
Moov
Celtiis
```

Il faudrait donc développer/maintenir plusieurs intégrations si nous voulons supporter plusieurs opérateurs.

Autre point important : MTN demande un véritable dossier partenaire/marchand, comprenant notamment registre de commerce, IFU, preuve d'adresse, pièces d'identité et RIB pour le service de paiement général. ([MTN Bénin][2])

### Verdict

**Très intéressant techniquement et financièrement, mais trop limité comme solution unique si nous voulons un système multi-opérateur.**

---

# 6. Option B — Moov Money direct

Moov Bénin propose officiellement le **paiement marchand Moov Money**.

Un commerçant peut disposer d'une SIM/compte marchand et recevoir des paiements directement. ([Moov Africa][4])

Moov distingue également clairement :

* comptes particuliers ;
* comptes entreprises ;
* comptes marchands ;
* paiement marchand. ([Moov Africa][5])

### Problème

Dans les sources officielles publiques que nous avons examinées, nous n'avons pas trouvé une documentation développeur publique équivalente à l'API MTN permettant de conclure aujourd'hui :

> « Nous pouvons directement construire notre backend autour d'une API Moov Money publique avec webhooks documentés. »

Cela **ne signifie pas que Moov ne possède aucune interface technique**.

Cela signifie seulement :

> **Nous ne devons pas supposer son existence ou son accessibilité sans confirmation commerciale/technique de Moov.**

### Verdict

**À conserver comme option future ou intégration directe potentielle, mais pas comme fondation de notre architecture à ce stade.**

---

# 7. Option C — Celtiis Cash direct

Celtiis propose officiellement **Celtiis Cash**, avec :

* paiement de biens/services ;
* paiement marchand ;
* QR Code ;
* transactions Mobile Money. ([Celtiis][6])

Celtiis présente également des tarifs particuliers très faibles pour certains usages, mais ces tarifs ne doivent pas être confondus avec les frais d'une API marchande destinée à notre plateforme.

### Problème

Comme pour Moov :

> Nous n'avons pas trouvé dans les sources officielles publiques consultées une API développeur Celtiis suffisamment documentée pour pouvoir construire notre architecture dessus avec confiance.

### Verdict

**À supporter côté client si un agrégateur le permet, plutôt que d'en faire immédiatement une intégration directe.**

---

# 8. Option D — FedaPay

C'est ici que l'étude devient particulièrement intéressante.

FedaPay supporte actuellement au Bénin :

* MTN ;
* Moov ;
* Celtiis ;
* BMO ;
* Coris Money ;
* Visa/Mastercard. ([FedaPay][7])

Et surtout, les trois opérateurs qui nous intéressent :

> **MTN + Moov + Celtiis**

sont disponibles en mode **sans redirection** dans la documentation FedaPay. ([FedaPay][7])

Cela correspond beaucoup mieux à notre besoin.

---

## 8.1 Tarification

FedaPay affiche actuellement pour le Bénin :

| Moyen       |  Frais |
| ----------- | -----: |
| MTN Bénin   | 1,80 % |
| Moov Bénin  | 1,80 % |
| Celtiis     | 1,80 % |
| BMO         |    4 % |
| Coris Money |    4 % |
| Mastercard  | 3,60 % |
| Visa        | 3,60 % |

([Fedapay][8])

Pour nos offres :

|   Offre | Frais 1,8 % |
| ------: | ----------: |
|   100 F |      1,80 F |
|   200 F |      3,60 F |
|   300 F |      5,40 F |
|   500 F |         9 F |
| 1 000 F |        18 F |
| 4 000 F |        72 F |

La différence avec MTN direct est donc minime :

```text
MTN direct : 1,70 %
FedaPay    : 1,80 %
Différence : 0,10 point
```

Sur 100 FCFA :

```text
0,10 % = 0,10 FCFA
```

La différence économique est donc quasiment insignifiante à ce niveau.

---

# 9. FedaPay : gestion des événements

C'est probablement le point le plus important pour notre projet.

FedaPay dispose :

* d'une API REST ;
* d'événements ;
* de logs ;
* de webhooks ;
* de statuts de transaction ;
* d'un environnement sandbox/live. ([FedaPay][9])

Les transactions peuvent notamment évoluer vers :

```text
pending
approved
declined
canceled
refunded
transferred
```

([FedaPay][10])

C'est exactement ce qu'il nous faut pour éviter une erreur fondamentale :

> **« Le client a vu une page disant que le paiement est terminé, donc on lui donne Internet. »**

Non.

Notre backend devra considérer le paiement comme valide uniquement lorsque l'autorité de paiement confirme réellement la transaction.

---

# 10. Webhooks : point critique

FedaPay permet d'envoyer des événements à notre backend via webhook.

La documentation actuelle précise notamment :

* notification HTTP POST ;
* réponse 2xx attendue ;
* mécanisme de retry ;
* jusqu'à 9 nouvelles tentatives selon les cas ;
* possibilité de redelivery ;
* vérification de signature ;
* protection contre les replay attacks ;
* nécessité de gérer les événements dupliqués. ([FedaPay][10])

C'est **parfaitement aligné avec notre architecture de paiement**.

Nous pourrons donc avoir :

```text
Client
   │
   │ paiement
   ▼
FedaPay
   │
   │ transaction.approved
   ▼
Backend Déo Gracias
   │
   ├── vérifie l'événement
   ├── vérifie la transaction
   ├── verrouille l'opération
   ├── attribue le ticket
   └── déclenche la délivrance
```

---

# 11. Reversement FedaPay

FedaPay indique actuellement que le solde peut être récupéré vers un compte Mobile Money ou bancaire.

La tarification publiée indique :

> **0 FCFA pour la récupération par Mobile Money**, avec réserve concernant d'éventuels frais inter-réseaux. ([Fedapay][8])

La documentation de configuration indique cependant actuellement des comptes Mobile Money pris en charge pour les versements, notamment MTN Bénin et Moov Bénin. ([FedaPay][11])

Il y a donc une nuance importante :

### Ce que nous savons

```text
Encaissement
MTN + Moov + Celtiis
        ↓
FedaPay
```

### Ce qui doit encore être contractuellement vérifié

```text
FedaPay
   ↓
Compte MTN de Déo Gracias
ou
Compte Moov de Déo Gracias
ou
Compte Celtiis de Déo Gracias
```

En particulier, **je ne considérerai pas le reversement Celtiis comme garanti tant que FedaPay ne l'aura pas confirmé pour le compte réel que nous ouvrirons.**

---

# 12. Condition importante : compte professionnel

C'est un point que nous devons prendre très au sérieux.

FedaPay indique actuellement que les marchands béninois doivent, selon leur statut, disposer notamment d'un cadre légal et d'un compte bancaire ou Mobile Money professionnel au nom correspondant au marchand. Pour une entreprise individuelle/prestataire, un IFU professionnel et un compte professionnel sont notamment mentionnés. ([Fedapay][12])

FedaPay demande également des éléments KYC/KYB pour valider les comptes. ([FEDAPAY][13])

Donc :

> **Nous ne devons pas construire le projet autour de l'idée qu'un numéro Mobile Money personnel de la maman pourra automatiquement recevoir les paiements API.**

Il faudra d'abord déterminer quel statut possède réellement Déo Gracias et quel compte marchand/professionnel peut être ouvert.

---

# 13. Option E — KKiaPay

KKiaPay est également intéressant.

Sa tarification publiée propose une intégration Mobile Money autour de **1,5 %** dans certaines formules, mais la formule d'intégration affiche également un abonnement mensuel pouvant atteindre **9 900 FCFA HT/mois** selon l'offre. ([Kkiapay][14])

KKiaPay offre aussi :

* reversement Mobile Money ;
* reversement bancaire ;
* dashboard ;
* intégration API ;
* support ;
* paiement Mobile Money. ([Kkiapay][14])

### Problème

Pour notre activité :

```text
100 F
200 F
300 F
500 F
```

un abonnement mensuel fixe de l'ordre de 9 900 FCFA devient une charge importante.

Exemple :

Si Déo Gracias réalisait seulement 20 000 FCFA de ventes numériques par mois, un abonnement de 9 900 FCFA représenterait presque **50 % du chiffre d'affaires numérique** avant même les commissions.

### Verdict

**Très intéressant techniquement, mais économiquement disproportionné pour le démarrage de Déo Gracias.**

---

# 14. Option F — CinetPay

CinetPay supporte actuellement au Bénin au moins :

* MTN Money ;
* Moov Money.

Sa page tarifaire affiche **2,2 %** pour ces moyens de paiement. ([CinetPay][15])

Donc :

|   Offre |  2,2 % |
| ------: | -----: |
|   100 F | 2,20 F |
|   200 F | 4,40 F |
|   300 F | 6,60 F |
|   500 F |   11 F |
| 1 000 F |   22 F |
| 4 000 F |   88 F |

Mais il y a un problème plus important.

Les conditions CinetPay indiquent que les fonds encaissés sont crédités sur le solde marchand et que le reversement peut avoir un délai allant jusqu'à plusieurs jours ; les conditions publiées mentionnent notamment un délai maximal de huit jours pour certaines opérations. ([CinetPay][16])

Cela ne correspond pas idéalement à notre besoin de trésorerie simple et fréquente pour une petite activité locale.

### Verdict

**Possible, mais inférieur à FedaPay pour notre cas.**

---

# 15. Option G — PayDunya

PayDunya est techniquement intéressant.

Il supporte au Bénin :

* MTN ;
* Moov ;
* Celtiis. ([PayDunya][17])

Il possède également :

* SoftPay ;
* WebPay ;
* API ;
* IPN ;
* paiements sans passer nécessairement par une interface PayDunya ;
* déboursements vers MTN Bénin, Moov Bénin et Celtiis Cash. ([PayDunya][17])

Techniquement, c'est donc un concurrent sérieux.

### Mais problème économique majeur

Les conditions actuellement publiées par PayDunya indiquent un **forfait mensuel de gestion de compte de 20 000 FCFA**, avec possibilité de suspension dans certaines conditions. ([PayDunya][18])

Pour Déo Gracias au démarrage, ce coût fixe est trop important.

### Verdict

**Techniquement viable, économiquement peu adapté à notre phase de lancement.**

---

# 16. Comparaison globale

Voici maintenant la vraie matrice de décision.

| Solution       | MTN | Moov |                                       Celtiis | API | Webhook/IPN |                  Frais annoncés |      Reversement | Verdict |
| -------------- | --: | ---: | --------------------------------------------: | --: | ----------: | ------------------------------: | ---------------: | ------- |
| MTN direct     |   ✅ |    ❌ |                                             ❌ |   ✅ |       ✅/API |                       **1,7 %** | Compte accepteur | 🟢      |
| Moov direct    |   ❌ |    ✅ |                                             ❌ |  ⚠️ |          ⚠️ |                     À confirmer |         Marchand | 🟠      |
| Celtiis direct |   ❌ |    ❌ |                                             ✅ |  ⚠️ |          ⚠️ |                     À confirmer |         Marchand | 🟠      |
| FedaPay        |   ✅ |    ✅ |                                             ✅ |   ✅ |           ✅ |                       **1,8 %** |      MM / banque | 🟢🟢    |
| KKiaPay        |  ✅* |   ✅* |                                   selon offre |   ✅ |           ✅ | ~1,5 % + abonnement selon offre |                ✅ | 🟠      |
| CinetPay       |   ✅ |    ✅ | ❌/non retenu dans l'offre tarifaire consultée |   ✅ |           ✅ |                       **2,2 %** |              Oui | 🟠      |
| PayDunya       |   ✅ |    ✅ |                                             ✅ |   ✅ |         IPN |                        variable |                ✅ | 🟠      |

* Les modalités exactes dépendent de l'offre/pays et devront être confirmées avant sélection.

---

# 17. Analyse spécifique du paiement à 100 FCFA

C'est un point central de notre projet.

Prenons l'offre :

```text
5 heures
100 FCFA
```

### MTN direct

```text
100 F
- 1,70 F
= 98,30 F
```

### FedaPay

```text
100 F
- 1,80 F
= 98,20 F
```

### CinetPay

```text
100 F
- 2,20 F
= 97,80 F
```

La différence entre MTN direct et FedaPay est seulement :

```text
0,10 FCFA
```

par transaction.

Donc sacrifier :

```text
MTN
```

pour obtenir :

```text
MTN + Moov + Celtiis
```

avec seulement **0,1 point de pourcentage supplémentaire** est économiquement très raisonnable.

---

# 18. Décision de Phase 2

## 🥇 Solution recommandée : FedaPay

À ce stade du projet, **FedaPay devient notre candidat principal**.

Pas parce que c'est simplement « facile ».

Mais parce qu'il répond simultanément aux besoins structurants du projet :

```text
                 DÉO GRACIAS
                      │
                      ▼
                 ┌─────────┐
                 │ FedaPay │
                 └────┬────┘
                      │
          ┌───────────┼───────────┐
          ▼           ▼           ▼
        MTN          Moov       Celtiis
```

avec :

* 3 opérateurs principaux ;
* API ;
* sandbox ;
* transactions ;
* statuts ;
* webhooks ;
* signature ;
* gestion des événements ;
* logs ;
* reversement ;
* coût faible ;
* pas d'abonnement mensuel annoncé sur la tarification publique. ([Fedapay][8])

---

# 19. Mais attention : décision ≠ activation immédiate

Nous ne devons **pas encore créer le compte de production et commencer l'intégration**.

La décision actuelle est :

> **FedaPay = solution de paiement de référence pour l'architecture du projet.**

Mais avant la production, nous devrons valider :

### Validation commerciale

* statut exact de Déo Gracias ;
* possibilité d'utiliser un compte professionnel ;
* compte Mobile Money professionnel disponible ;
* MTN ;
* Moov ;
* Celtiis ;
* modalités de reversement ;
* délai réel de reversement ;
* frais réellement appliqués ;
* éventuels frais minimums ;
* éventuelles limites de transaction.

### Validation technique

* sandbox ;
* création transaction ;
* paiement ;
* webhook ;
* signature ;
* récupération du statut ;
* idempotence ;
* timeout ;
* transaction abandonnée ;
* paiement confirmé mais webhook retardé ;
* paiement confirmé mais serveur indisponible.

---

# 20. Architecture de paiement que la Phase 2 impose

Une conséquence importante de cette étude est que **le paiement ne doit jamais être directement connecté au MikroTik**.

Nous devons avoir un backend central.

```text
                    CLIENT
                       │
                       ▼
              Portail Déo Gracias
                       │
                       ▼
                  BACKEND
                       │
                       ▼
                   FedaPay
                       │
              ┌────────┼────────┐
              ▼        ▼        ▼
             MTN      Moov    Celtiis
                       │
                       │
                 confirmation
                       │
                       ▼
                  WEBHOOK
                       │
                       ▼
                  BACKEND
                       │
                       ▼
              Ticket / accès Wi-Fi
                       │
                       ▼
                   MikroTik
```

Cette séparation sera fondamentale.

---

# 21. Règle absolue du futur système

Nous devons maintenant formaliser cette règle :

> **Le navigateur du client ne décide jamais qu'un paiement est réussi.**

Le navigateur peut dire :

```text
« J'ai terminé mon paiement. »
```

Mais notre backend doit répondre :

```text
« Je vais vérifier. »
```

Puis :

```text
FedaPay
   ↓
approved
   ↓
Backend vérifie
   ↓
Transaction correcte
   ↓
Ticket attribuable
   ↓
Ticket délivré
```

Seulement à ce moment-là :

> **le système peut considérer la commande comme payée.**

---

# 22. Conséquence sur les tickets

La Phase 1 nous a appris que les tickets actuels ont essentiellement :

```text
Name
Password
Profile
Uptime
Bytes In
Bytes Out
Comment
```

avec :

```text
Name = Password
```

et des profils :

```text
5-HEURES
12-HEURES
24-HEURES
72-HEURES
1-SEMAINE
1-MOIS
```

La Phase 2 confirme donc que le futur paiement devra **déclencher une logique de réservation/allocation de ticket**, plutôt que simplement envoyer une information au MikroTik.

Nous pourrons avoir conceptuellement :

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

Cette décision sera approfondie en **Phase 5 — Data & Backend**.

---

# 23. Ce que nous ne décidons PAS encore

Important : cette phase ne tranche pas encore définitivement :

### ❌ Comment le ticket sera créé

Deux possibilités restent ouvertes :

```text
A — Ticket pré-généré
Mikhmon
   ↓
Inventaire
   ↓
Paiement
   ↓
Attribution
```

ou :

```text
B — Création dynamique
Paiement
   ↓
Backend
   ↓
API MikroTik
   ↓
Création utilisateur
```

La Phase 1 nous a permis de comprendre le système existant, mais la décision finale dépendra de la manière dont nous voulons intégrer MikroTik.

### ❌ La méthode exacte d'accès après paiement

Elle sera définie dans les phases suivantes.

### ❌ La technologie backend

Pas encore.

### ❌ La base de données

Pas encore.

### ❌ L'hébergement

Pas encore.

---

# 24. Risques identifiés par la Phase 2

| Risque                                    | Niveau | Réponse                           |
| ----------------------------------------- | ------ | --------------------------------- |
| Paiement confirmé mais ticket non délivré | 🔴     | Transaction + allocation atomique |
| Webhook reçu deux fois                    | 🔴     | Idempotence                       |
| Faux webhook                              | 🔴     | Vérification signature            |
| Client modifie le prix                    | 🔴     | Prix déterminé côté backend       |
| Client modifie le profil                  | 🔴     | Offre déterminée côté backend     |
| Paiement abandonné                        | 🟠     | Timeout                           |
| FedaPay indisponible                      | 🟠     | États `pending`                   |
| MikroTik indisponible                     | 🔴     | File/retry + état intermédiaire   |
| Ticket déjà utilisé                       | 🔴     | verrouillage                      |
| Ticket exposé                             | 🔴     | jamais afficher avant paiement    |
| Compte personnel incompatible             | 🔴     | compte marchand/pro à valider     |
| Frais trop élevés sur petits montants     | 🟠     | FedaPay 1,8 % jugé acceptable     |
| Dépendance à un seul opérateur            | 🔴     | FedaPay multi-opérateur           |

---

# 25. Décision finale de la Phase 2

### Solution principale

> 🥇 **FedaPay — candidat de référence pour l'intégration de paiement Déo Gracias.**

### Solution de secours / optimisation

> 🥈 **MTN MoMo API directe**, particulièrement intéressante si Déo Gracias souhaite ultérieurement optimiser les frais et accepte de fonctionner principalement/uniquement avec MTN.

### Solutions secondaires

> 🥉 **KKiaPay / CinetPay / PayDunya** restent des alternatives, mais présentent actuellement des compromis moins favorables pour notre contexte : abonnement, frais, couverture opérateur ou délais de reversement.

---

# 26. Architecture de décision

La stratégie que je recommande donc est :

```text
                    PHASE 2
                       │
                       ▼
                ┌────────────┐
                │  FedaPay   │
                └─────┬──────┘
                      │
             ┌────────┼────────┐
             ▼        ▼        ▼
            MTN      MOOV    CELTIIS
             │        │        │
             └────────┼────────┘
                      │
                      ▼
                  BACKEND
                      │
                      ▼
              LOGIQUE COMMANDE
                      │
                      ▼
               LOGIQUE TICKET
                      │
                      ▼
                  MIKROTIK
```

Et surtout :

> **Le système de paiement devient une couche indépendante du MikroTik.**

C'est beaucoup plus propre, sécurisé et évolutif.

---

# 27. Livrable final de Phase 2

**Document : `03_PAYMENT_RESEARCH.md`**

Structure définitive :

```text
03_PAYMENT_RESEARCH.md

1. Objectif
2. Contexte Déo Gracias
3. Contraintes
4. Critères de sélection
5. MTN MoMo Direct
6. Moov Money Direct
7. Celtiis Cash Direct
8. FedaPay
9. KKiaPay
10. CinetPay
11. PayDunya
12. Comparaison
13. Analyse des frais
14. Analyse du paiement 100 FCFA
15. Reversement
16. KYC / compte marchand
17. Webhooks et confirmation
18. Risques
19. Architecture de paiement
20. Décision
21. Points à valider avant production
22. Contraintes imposées à la Phase 3
```

---

# 28. État du projet après cette phase

### Phase 0 — Cadrage

**✅ Terminée**

### Phase 1 — Reverse engineering infrastructure

**✅ Terminée**

Nous connaissons désormais notamment :

```text
Huawei HG8145V6
        ↓
MikroTik RB951Ui-2HnD
        ↓
RouterOS 6.49.17
        ↓
Hotspot1
        ↓
192.168.88.200
        ↓
Tickets / profils
```

et :

```text
Walled Garden = VIDE
```

### Phase 2 — Paiement

**✅ Terminée**

Décision de référence :

> **FedaPay + MTN/Moov/Celtiis**

avec **MTN direct comme option stratégique de secours/optimisation**.

---

# 29. Phase suivante

## **PHASE 3 — ARCHITECTURE CIBLE DU SYSTÈME**

C'est maintenant que nous allons assembler les deux mondes que nous avons étudiés :

```text
                 INTERNET
                    │
             ┌──────▼──────┐
             │   PAIEMENT  │
             │   FedaPay   │
             └──────┬──────┘
                    │
                    ▼
CLIENT ───► PORTAIL ───► BACKEND
  │                     │
  │                     ▼
  │                  TICKETS
  │                     │
  └──────────────► MIKROTIK
                         │
                         ▼
                      INTERNET
```

La **Phase 3** devra déterminer précisément l'architecture technique complète : frontend, backend, base de données, paiement, gestion des tickets, communication avec MikroTik, walled garden, administration de Déo Gracias, sécurité et flux de bout en bout.

[1]: https://www.mtn.bj/momo/developpeurs/momo-api/?utm_source=chatgpt.com "MoMo API | MTN Bénin"
[2]: https://www.mtn.bj/momo/business/paiement-general/?utm_source=chatgpt.com "Paiement général | MTN Bénin"
[3]: https://momo.mtn.com/api/?utm_source=chatgpt.com "API – momo.mtn.com"
[4]: https://www.moov-africa.bj/paiement-marchand/?utm_source=chatgpt.com "Paiement marchand – MOOV AFRICA BENIN"
[5]: https://www.moov-africa.bj/moov-money/?utm_source=chatgpt.com "Moov money – MOOV AFRICA BENIN"
[6]: https://celtiis.bj/celtiis-cash?utm_source=chatgpt.com "Celtiis : 100% Moi"
[7]: https://docs.fedapay.com/payment-methods/fr/payment-methods-fr?utm_source=chatgpt.com "Méthodes de Paiement avec FedaPay - FedaPay"
[8]: https://www.fedapay.com/pricing?utm_source=chatgpt.com "FEDAPAY"
[9]: https://docs.fedapay.com/api-reference/introduction-fr?utm_source=chatgpt.com "Introduction à l’API FedaPay - FedaPay"
[10]: https://docs.fedapay.com/integration-api/en/webhooks-en?utm_source=chatgpt.com "Webhooks and Events - FedaPay"
[11]: https://docs.fedapay.com/dashboard/fr/business-fr?utm_source=chatgpt.com "Paramètres d'entreprise - FedaPay"
[12]: https://www.fedapay.com/general-terms-of-use?utm_source=chatgpt.com "FEDAPAY"
[13]: https://support.fedapay.com/portal/fr/kb/articles/pourquoi-doit-on-fournir-certains-documents?utm_source=chatgpt.com "Pourquoi doit-on fournir certains documents ?"
[14]: https://kkiapay.me/tarifs/?utm_source=chatgpt.com "Tarifs - kkiapay - Agrégateur de paiement par mobile money, carte bancaire et Wave en Afrique de l'Ouest Francophone"
[15]: https://cinetpay.com/index.php/pricing?utm_source=chatgpt.com "Facturation - CinetPay"
[16]: https://cinetpay.com/legal/cgu-services?utm_source=chatgpt.com "Conditions générales d'utilisation des services CinetPay - CinetPay"
[17]: https://developers.paydunya.com/doc/FR/api_softpay_index?utm_source=chatgpt.com "SoftPay | PayDunya Documentation"
[18]: https://paydunya.com/terms-of-service?utm_source=chatgpt.com "Conditions générales d'utilisation | PayDunya | PayDunya"
