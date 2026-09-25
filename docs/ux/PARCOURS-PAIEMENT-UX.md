# Refonte UX du parcours de paiement — Déo Gracias Wi-Fi (IMP-26)

Statut : **UX 1 livrée (architecture)** — chaque étape suivante (UX 2→8) attend un feu vert.

## 1. Analyse de l'existant (avant toute modification, §38)

### 1.1 Parcours actuel (`apps/frontend/src/pages/Accueil.tsx`)
Quatre cartes **simultanées** : 1. Connexion (OTP) · 2. Offres · 3. Commande & paiement · 4. Mes tickets.
Flux réel : connexion OTP → clic offre = **création immédiate de commande** → bouton « Payer X FCFA »
→ `POST /orders/:id/pay` → en DEV : bouton « Simuler l'approbation » → DELIVERED « 🎉 ».

### 1.2 Capacités backend RÉELLES (rien n'est inventé)
| Capacité | Route | Notes |
|---|---|---|
| Catalogue | `GET /offers` | prix/durées depuis `plans` actifs (§34 OK) |
| Commande | `POST /orders` | `Idempotency-Key` obligatoire ; montant = snapshot serveur (§11 OK) |
| Statut commande | `GET /orders/:id` | permet le **polling** (non utilisé aujourd'hui) |
| Init paiement | `POST /orders/:id/pay` | `{payment_id, provider_ref, redirect_url}` ; **rejeu idempotent** (`replay:true`) |
| Confirmation | webhook FedaPay signé / `POST /webhooks/dev-approve` (DEV) | seule preuve de paiement (§16 OK) |
| Tickets | `GET /tickets/mine` | **jamais le code complet** (secret vendu) — préfixe seulement |
| Auth client | OTP téléphone (DEV : code retourné) | |

### 1.3 Ruptures UX identifiées
1. Tout visible en même temps → « où suis-je ? » sans réponse ; mobile illisible (§26/27).
2. Connexion exigée **avant** de voir les prix (friction d'entrée, §06).
3. Clic offre = commande créée **sans confirmation** (§09/10) ; erreur de choix = commande orpheline.
4. `redirect_url` FedaPay **retourné mais jamais utilisé** → en production le checkout ne s'ouvrirait pas.
5. Pas d'écrans processing / pending / failed (§17-22) : « paiement en attente » brut + bouton DEV visible d'un vrai client.
6. Double clic sur offre = 2 clés d'idempotence différentes → 2 commandes possibles (§25).
7. États techniques exposés (`order.state` brut en majuscules) au lieu de messages humains (§14/21).
8. Code Wi-Fi non restitué côté client (décision sécurité) → UX 6 devra trancher l'affichage
   (décision **D-UX6** ci-dessous, à valider avec vous).

### 1.4 Continuité visuelle (§04/29)
Tokens existants à réutiliser (styles.css) : fond `#f3f4f5`, panneaux blancs, en-têtes de carte
**jaunes** `#ffc107`, CTA **verts** `#4dbd74`, liens/titres **bleus** `#20a8d8`, footer **cyan**,
rouge `#f86c6b`, rayons 3-5 px, ombres légères, typo système 14 px. Aucun nouveau token créé en UX 1.

## 2. Mini-architecture UX (§39)

```
ENTRY → CHOIX DU FORFAIT → CONFIRMATION → MOYEN DE PAIEMENT → NUMÉRO →
RÉCAPITULATIF → PAIEMENT → TRAITEMENT → SUCCÈS / ERREUR / ATTENTE → CODE WI-FI
```

| Étape | Objectif utilisateur | Information principale | CTA principal | États | Données |
|---|---|---|---|---|---|
| ENTRY | Choisir sa voie | « Acheter un accès » vs « J'ai déjà un code » | **Acheter un accès Wi-Fi** | backend injoignable | — |
| PLAN_SELECTION | Répondre « quel forfait ? » | prix + durée associés (§33) | **Choisir 100 FCFA** (dyn.) | chargement offres, erreur | `GET /offers` |
| PLAN_CONFIRMATION | Éviter l'erreur de choix | « Vous allez payer X pour Y d'accès » | **Continuer vers le paiement** ; secondaire « Modifier mon choix » | — | offre sélectionnée, clé idempotence générée ici |
| PAYMENT_METHOD | « Comment payer ? » | Mobile Money via FedaPay (seul moyen configuré ; opérateur choisi sur la page sécurisée) | **Payer avec Mobile Money** | 503 paiement non configuré | config provider |
| PHONE_INPUT | « Quel numéro ? » | format attendu + validation humaine (§14) | **Vérifier mon numéro** | VALIDATION_ERROR | numéro conservé |
| PAYMENT_CONFIRMATION | Confiance avant paiement | récapitulatif complet + total | **Payer X FCFA** (dyn., §15) ; anti double clic (§25) | — | offre+méthode+numéro |
| PAYMENT_PROCESSING | Comprendre l'attente | « Ne fermez pas cette page » + montant + n° masqué | (aucun — verrouillé) | double clic ignoré | `POST /orders` puis `/pay` (idempotence) |
| PAYMENT_PENDING | Ne pas croire à un échec | « Nous continuons de vérifier » | **Vérifier à nouveau** (polling `GET /orders/:id`) | jamais « échoué » sans preuve (§18) | order.state |
| PAYMENT_FAILED | Comprendre + rebondir | message humain selon type (§22) | **Réessayer le paiement** / **Modifier le moyen** | refusé vs annulé vs technique | — |
| PAYMENT_SUCCESS | Confiance immédiate | « Paiement réussi » + prix/durée | auto → livraison | — | webhook confirmé |
| TICKET_DELIVERY | §23 : confirmé mais pas prêt | « Votre accès est en cours de préparation » | **Vérifier à nouveau** | DELAYED/RECOVERY | polling |
| TICKET_SUCCESS | Utiliser son accès | code mis en avant + copiable + instructions | **Copier mon code** | récupération expliquée selon capacité réelle | `GET /tickets/mine` |

## 3. Décisions à valider (non inventées, impact backend)
- **D-UX4** : l'étape « moyen de paiement » présente Mobile Money (FedaPay) comme choix unique
  agrégé ; les opérateurs (MTN/Moov/Celtiis) se choisissent sur la page sécurisée du provider.
  Alternative (à valider) : boutons MTN/Moov/Celtiis purement informationnels menant au même checkout.
- **D-UX6** : le backend ne restitue **jamais** le code complet aujourd'hui. Deux options :
  (a) afficher le code complet une seule fois à la livraison (nouvelle route authentifiée,
  traçée, avec fenêtre de visibilité) ; (b) rester au préfixe + instructions portail captif.
  Tranché avec vous en UX 6.

## 4. Fichiers concernés par la refonte (UX 1→8)
- `apps/frontend/src/checkout/machine.ts` + `machine.test.ts` — **UX 1 (livré)**.
- `apps/frontend/src/pages/Accueil.tsx` — remplacé progressivement par `checkout/Checkout.tsx` (UX 2→6).
- `apps/frontend/src/styles.css` — extensions tokens existants uniquement (UX 7/8).
- `apps/frontend/src/api.ts` — inchangé (contrats suffisants).
- Backend : inchangé en UX 1 ; éventuelle route code-complet uniquement si D-UX6(a) validé (UX 6).
