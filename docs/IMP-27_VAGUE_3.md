# IMP-27 — Vague 3 — contrat et preuve de reprise

Statut : **DONE — CODE ET CI VALIDÉS**. La Vague 3 est stabilisée avec PostgreSQL réel, webhook/état backend contrôlé, stock, navigateur et CI GitHub verts. Les intégrations de production externes (FedaPay réel, MikroTik et portail captif) restent différées et sont suivies séparément.

## PROBLÈME

Une reprise de checkout pouvait perdre l’`orderId`, les identifiants de paiement et la corrélation du ticket. Le chemin HTTP `409` quittait le flux sans rattacher la commande. Le polling fixe ne bornait pas correctement l’attente et un ticket pouvait être choisi par offre plutôt que par commande.

## CAUSE

- `Checkout.tsx` gardait l’identifiant paiement hors de la machine et ne persistait que `{ orderId, offer, phone }`.
- `POST /orders/:id/pay` ne renvoyait pas les identifiants dans les `409` récupérables.
- `GET /orders/:id` ne renvoyait pas le dernier paiement nécessaire à une reprise après rafraîchissement.
- `CodeDelivery.tsx` choisissait un ticket vendu correspondant à l’offre, sans contrainte `order_id`.
- Le polling utilisait un intervalle fixe de 2,5 s et une bascule temporelle locale.

## IMPACT

Risque de seconde tentative de paiement, écran bloqué ou état impossible à réconcilier après rafraîchissement, et affichage d’un ticket qui n’était pas strictement celui de la commande en cours.

## SOLUTION

### Contrat backend/frontend

- `GET /orders/:id` expose `id`, `order_reference` — égal à l’UUID de commande — et `payment: { id, provider_ref, state } | null`.
- `POST /orders/:id/pay` expose `order_id`, `order_reference`, `payment_id`, `provider_ref` sur `202`, `200 replay` et `409` récupérable.
- Le `409` ne confirme rien côté navigateur : le frontend rattache les identifiants puis relit `GET /orders/:id`.
- Les états `PAID`, `TICKET_ALLOCATED` et `DELIVERED` sont lus du backend. Le frontend ne fabrique jamais un succès de paiement.
- `GET /tickets/mine?order_id=<uuid>` exige le token client et filtre côté serveur sur la commande. Chaque ticket renvoie `order_id` et `order_reference`; la révélation reste `GET /tickets/:id/code`, authentifiée et auditée.
- Le contrat de récupération retenu est donc **token client + référence/`order_id`**, uniquement sur les routes existantes et confirmées par les tests. Aucun nouvel endpoint générique de récupération par référence seule n’est inventé.

### Reconciliation bornée

`apps/frontend/src/checkout/polling.ts` définit et teste :

- lecture immédiate ;
- backoff `1 s → 2 s → 4 s → 8 s → 12 s`, plafond `12 s` ;
- timeout à `120 s` ;
- arrêt après trois erreurs réseau consécutives ;
- bouton « Vérifier à nouveau » qui relance une lecture backend sans relancer le paiement ;
- état backend inconnu présenté comme attente réconciliable, jamais comme échec ou succès.

La confirmation serveur reste la combinaison webhook/provider → persistance backend → lecture `GET /orders/:id`. L’allocation/livraison reste dans `allocateAndDeliver` et ne peut pas être déclenchée par une décision locale du navigateur.

### Anti-double-clic et persistance

- La machine verrouille `LAUNCH_PAYMENT` pendant `PAYMENT_PROCESSING`.
- `Checkout.tsx` ajoute un verrou de lancement synchrone pour couvrir deux clics avant le prochain rendu React.
- `sessionStorage` persiste `orderId`, `paymentId`, `providerRef`, offre issue du snapshot backend et téléphone.
- Une reprise reconstruit le prix et les durées depuis le snapshot backend, jamais depuis une valeur tarifaire inventée dans le navigateur.

## FICHIERS

- `apps/backend/src/app.ts` — contrat de commande/paiement, `409` récupérable, paiement courant, tickets corrélés.
- `apps/backend/src/repo.ts` et `apps/backend/src/fake-repo.ts` — lecture du dernier paiement.
- `apps/backend/src/schemas.ts` — query `order_id` et vue publique enrichie sans secret.
- `apps/frontend/src/api.ts` — types de contrat.
- `apps/frontend/src/checkout/Checkout.tsx` — reprise, `409`, persistance, polling/backoff, référence visible.
- `apps/frontend/src/checkout/machine.ts` — identifiants, état inconnu, reprise et reconciliation.
- `apps/frontend/src/checkout/polling.ts` — politique bornée.
- `apps/frontend/src/checkout/CodeDelivery.tsx` et `MyTickets.tsx` — sélection et affichage corrélés.
- `apps/frontend/e2e/checkout.spec.ts` — sept scénarios navigateur Playwright.
- `apps/frontend/playwright.config.ts` — exécution e2e sur le serveur Vite.

## TEST

- `npm run typecheck` : vert.
- `npm test` sans base : vert — backend `158 passed` + `49 skipped`, frontend `37 passed`, connector `46 passed`, shared `45 passed`.
- `PATH=/tmp/imp27-pg/root/usr/lib/postgresql/17/bin:$PATH DATABASE_URL=postgresql://user@127.0.0.1:5433/postgres npm test` : vert sur PostgreSQL **17.11** — backend `207 passed` dont les **49** tests PostgreSQL réels, frontend `37 passed`, connector `46 passed`, shared `45 passed`. Les migrations `0012` sont appliquées sans modification.
- `npm run build` : vert.
- Tests backend IMP-27 : `pay.test.ts` couvre `409` + identifiants persistants ; `tickets.test.ts` couvre le filtre strict commande → ticket.
- Tests frontend IMP-27 : machine, états inconnus et backoff borné.
- Playwright : `LD_LIBRARY_PATH=/tmp/imp27-browser-libs/usr/lib/x86_64-linux-gnu npm run test:e2e -w @dg/frontend` : **7 passed** (double clic, attente, rafraîchissement, confirmation backend, allocation différée, état inconnu, ticket délivré). Le runtime Chromium a été complété temporairement hors repository ; aucune bibliothèque système ni artefact e2e n’est ajouté au dépôt.

## Quality Gate UX — à démontrer avant clôture

- [x] double clic : garde machine + verrou de lancement ;
- [x] paiement en attente : message non terminal et référence visible ;
- [x] rafraîchissement : reprise par `orderId` + identifiants ;
- [x] état inconnu : attente conservatrice ;
- [x] timeout/erreur réseau : message actionnable, aucun second paiement ;
- [x] allocation différée : `PAID` reste une préparation, pas une délivrance fictive ;
- [x] référence de commande affichée dans les états de paiement/délivrance ;
- [x] ticket filtré par commande et token ;
- [x] démonstration navigateur effectivement exécutée dans un environnement Chromium fonctionnel (7/7) ;
- [x] démonstration PostgreSQL 17.11 avec webhook signé/état confirmé, allocation atomique, délivrance, récupération corrélée et révélation auditée du code (207 tests backend verts).

La preuve locale de la chaîne est produite et la stabilisation est validée par le commit GitHub `2b90f0ee` avec CI verte. IMP-27 est donc **DONE** dans le périmètre code/tests contrôlé. Les validations FedaPay production, MikroTik, portail captif et autres opérations physiques ne font pas partie de cette clôture ; elles restent différées dans `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`.
