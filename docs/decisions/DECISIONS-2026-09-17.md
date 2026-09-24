# DÉCISIONS DU 17/09/2026 (propriétaire, via validation formelle)

> Contexte : fin de la fenêtre physique ; aucun hôte Connector disponible (OD-1 : E intérim impossible — le PC unique suit le propriétaire à Calavi ; budget zéro) ; plan master à 40 IMPs dont la numérotation reste STABLE.

## D1 — Ordre adapté « remote-first » : VALIDÉ (option A)

- **Séquence DISTANTE (depuis Calavi, démarrable immédiatement)** :
  IMP-07 → 08 → 09 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 25 → 26 → 27 → 28 → 29 → 30 → 31 → 32 → 33 → 34 → 35 → 36 → 37
  (le Connector est CODÉ et testé en IMP-21/22 contre des fixtures masquées issues des dumps `dg-*` détenus par le propriétaire ; aucun accès routeur requis).
- **LOT FENÊTRE PHYSIQUE SUIVANTE (W2)** : IMP-06 (stock Mikmon), IMP-23 (install Connector sur l'hôte qui existera alors : achat micro ou machine trouvée), IMP-24 (réconciliation en conditions réelles), IMP-38 (walled garden production + tests captifs réels), IMP-39 (go-live progressif avec achat réel 100 F), IMP-40 (ops + passation).
- Conséquence acceptée : le go-live attend la prochaine fenêtre physique ; dépense nulle d'ici là.
- L'option « achat ultérieur en cours de route » reste ouverte : un mini-guide d'install réintégrera l'hôte sans restructurer la numérotation.

## D2 — INC-03 (planche vouchers [121]–[200] exposée en photo) : RISQUE ASSUMÉ (option a)

- La planche est vendue telle quelle ; aucune écriture routeur ; aucune rotation.
- Justification acceptée : codes utilisables uniquement sur le Wi-Fi du site ; historique de conversation privé.
- Garde-fou : la réconciliation IMP-24 alertera sur toute activation anormale (activations multiples d'un même code, activations hors plage horaire du site).

## D3 — OD-1 clôture : AUCUN HÔTE avant W2

- Provisioning IMP-05 steps 2/3 reporté à W2 ; périmètre déjà fait (INC-02, inventaire, test onduleur) acquis.
- Emplacement candidat retenu pour W2 : zone onduleur/multiprise (photos PHYS-2026-09-16-A/B) ; prise LAN directe disponible sur **ports 4 ou 5 du RB951**.

## D4 — Reports non bloquants consignés

- P1 (photos des affichages de prix clients) → W2.
- Test `https://example.com` verbatim manquant → comportement HTTPS général déjà établi (ERR_CONNECTION_CLOSED) ; sans action.
- Autonomie exacte de l'onduleur non mesurée (variant A seul exécuté) → runbook IMP-35, hors production.

## D5 — Avancement d'IMP-06 avant IMP-07 (instruction propriétaire du 17/09)

- Le propriétaire ordonne : « faisons entièrement le IMP 06 et ensuite tu as mon feu vert pour le IMP 07 ».
- D1 est donc amendé : IMP-06 redevient exécutable immédiatement **si et seulement si** le propriétaire est encore sur site avec l'appareil hébergeant Mikhmon (LAN requis : API restreinte à 192.168.88.0/24 depuis IMP-03). Sinon : retour automatique à D1 (IMP-06 → W2) et démarrage IMP-07.
- Feu vert IMP-07 donné conditionnellement à la clôture d'IMP-06 (rapport + checklist fournis).

## Effets normatifs

- Le tableau de statut master suit désormais l'ordre D1 ; toute implémentation de W2 exécutée avant son tour exige une nouvelle validation.
- IMP-06 ne sera PAS exécuté avant IMP-37 (contrairement au plan initial) : le stock de tickets digitaux sera en réalité généré par le backend (IMP-18/19) via le Connector après IMP-23 ; la génération Mikmon manuelle de W2 ne servira que de stock de secours/transition, quantités recalibrées à ce moment (N4).

## D6/D7 — Seed du stock Mikmon en base (IMP-16, 23/09/2026) : APPLIQUÉ

- **D6 — Empreintes non salées** : `code_hash = sha256(code)` sans sel (précédent D2,
  INC-03/INC-04) : les codes ne sont valides que sur le site physique de Déo Gracias ;
  un préfixe indicatif de 2 caractères (`code_prefix_hint`) est stocké pour le support.
- **D7 — Stock seedé protégé des tests** : les tests d'intégration ne consomment JAMAIS
  l'inventaire réel (parking AVAILABLE→RESERVED pendant les suites IMP-14/15, restauration
  après ; le bloc IMP-16 restaure le ticket qu'il alloue). Migration idempotente (UUID fixes
  + ON CONFLICT), rollback documenté (échoue naturellement si un ticket seedé est déjà vendu).
- **ARBITRÉ (23/09/2026, propriétaire)** : `SECURITY DEFINER` (blueprint §3.3) = **Option A,
  statu quo Phase 1** — le backend garde `service_role` côté serveur, la logique d'allocation
  reste en TypeScript (19 tests d'intégration réels). Bascule vers une fonction DEFINER à
  revisiter au déploiement Supabase hébergé (Phase 2), via migration dédiée.

## D8/D9 — Génération digitale des tickets (IMP-18, 24/09/2026) : APPLIQUÉ, **CONFIRMÉ par le propriétaire (24/09)**

- **D8 — Préfixe `vc` conservé (contrat Mikmon §3.3)** : les lots digitaux réutilisent le
  comment `vc-<seq>-<mm.dd.yy>-` sans AUCUNE écriture routeur (profils/On-Login/moniteurs
  intouchés). L'alternative « étendre l'On-Login » est exclue en phase 1 par les interdits
  du contrat §3.5. **Confirmation propriétaire demandée** avant la première synchro réelle.
- **D9 — Cycle de vie du code clair** : affiché UNE seule fois à la génération (réponse de
  `POST /admin/batches`, à archiver au coffre) ; la base ne stocke que `sha256(code)` (0004,
  INC-01/INC-04) ; le clair ne subsiste ensuite que dans `mikrotik_sync.payload`, jusqu'au
  succès de la synchro routeur, où il devra être purgé (IMP-21/24). La séquence digitale
  (`settings.backend_batch_seq`, à partir de 100) est lisible par anon (catalogue public
  0007) : information de sensibilité mineure, acceptée en phase 1.

## D10 — Fenêtres de validité des tickets (IMP-19, 24/09/2026) : APPLIQUÉ

- **Ticket vendu** : échéance d'activation = `sold_at` + `validity_hours` de l'offre (Grille A) ;
  dépassée ⇒ `EXPIRED` via `expireOverdueTickets` (transition 0011, auditée). Empêche qu'un
  ticket payé « dorme » des mois puis obtienne une période complète gratuite au 1er login
  (le routeur seul ne l'applique qu'après conversion du comment, contrat §3.6).
- **Ticket vierge** : AUCUNE échéance pré-vente — le contrat ne fixe pas de fenêtre numérique
  avant 1er login et le stock Mikmon du 17/09 est un inventaire réel en circulation ; toute
  fenêtre courte le gelerait. Fermeture de la fenêtre de vente = bascule IMP-38.

## D11 — Paramètres des workers (IMP-20, 24/09/2026) : APPLIQUÉ

- **TTL commande** : 30 minutes en `PAYMENT_PENDING` => `EXPIRED` (paiements
  `PENDING` associés expirés dans le même tick). Au-delà, le paiement FedaPay
  éventuel est refusé naturellement (`confirmPayment` exige `PAYMENT_PENDING`).
- **TTL réservation** : 15 minutes en `RESERVED` sans vente => `RELEASED` puis
  `AVAILABLE` (le stock redevient vendable ; défensif, la réservation n'étant
  pas encore exposée côté client en phase 1).
- **Webhook-sweeper** : min-age 5 min (un paiement ouvert de moins de 5 min
  attend son webhook normal ; au-delà, interrogation FedaPay par `provider_ref`).
- **Ordonnanceur** : `setInterval` in-process (zéro dépendance). Le blueprint
  citait `@fastify/cron` à titre indicatif — mêmes sémantiques pour 3 crons
  fixes, surface d'approvisionnement et de sécurité réduite (budget nul).
- **Reconciler** : simulation Phase 1 (cohérence interne plateforme, runs dans
  `reconciliation_runs`, alerte CRITICAL en cas de MISMATCH — garde-fou INC-03) ;
  le volet routeur réel est reporté à IMP-24 (pas de Connector avant W2).
