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
- **En attente d'arbitrage propriétaire** : l'empaquetage `SECURITY DEFINER` des fonctions
  d'allocation (blueprint §3.3) — exposé structuré au rapport IMP-16 ; ne pas implémenter
  avant décision.
