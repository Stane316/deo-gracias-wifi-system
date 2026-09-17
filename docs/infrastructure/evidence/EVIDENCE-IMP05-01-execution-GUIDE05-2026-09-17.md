# EVIDENCE-IMP05-01 — Exécution GUIDE-05 (17/09/2026 ~08h) : INC-02 clos, onduleur conforme, OD-1 tranché, INC-03

> **Implementation** : IMP-05 — exécution partielle ; clôture « sans hôte » documentée ci-dessous.
> **Photos** : `docs/infrastructure/evidence/photos/PHYS-2026-09-17-01.jpg … -07.jpg` (box Huawei arrière, ONT fibre, planche vouchers [121]–[200], RB951 arrière, captures tests WG ×2, injecteur PoE Mercury).

## 1. Étape 0 — INC-02 : ✅ CLOS

- Tests humains exécutés avec preuves écran :
  - `http://example.com` en non-authentifié → **page « Example Domain » réelle** (walled garden HTTP fonctionnel), bandeau OS « Aucune connexion Internet » présent (détection captive normale).
  - `bing.com` en non-authentifié → **« Ce site est inaccessible — ERR_CONNECTION_CLOSED »** : le navigateur moderne tente HTTPS d'abord ; le hotspot ferme la connexion sans redirection portail visible.
    → **Conclusion produit pour IMP-28/38** : la découverte du portail par les OS modernes passe par leurs sondes HTTP de détection captive (pas par la saisie URL HTTPS) ; toute future page pré-login (paiement hébergé) devra être en **HTTP walled garden** ou accepter ce comportement HTTPS. Le test `https://example.com` n'a pas été rapporté verbatim (non bloquant : le comportement HTTPS général est établi par le cas bing).
  - Garden **vidé** après tests (confirmation propriétaire ; print vide).
- **IMP-04 : 🟢 CLOS** (P1 affichages prix toujours manquant → reporté, non bloquant, repris visite suivante / IMP-08).

## 2. Étape 4 — Test onduleur (variant A) : ✅ CONFORME

- « Même après coupure, routeur, box, switch et boîtiers restent alimentés et fonctionnent parfaitement » ; chronométrages sans anomalie ; **N avant = N après** (zéro client coupé).
- **Périmètre onduleur confirmé par le propriétaire : TOUS les équipements** (box, ONT, RB951, relais, boîtiers) sont sur le Mercury Maverick 650 VA.
- Conséquence : la résilience électrique du site est réelle ; le variant B (épuisement) n'a pas été nécessaire ; autonomie exacte non mesurée (à faire un jour hors production, runbook IMP-35).

## 3. Étape 1 — Inventaire physique corrigé (photos 01–04, 07)

| Élément | Identification | Détail |
|---|---|---|
| ONT fibre | boîtier blanc + connecteur SC/APC vert (étiquette laser) | entrée fibre du site |
| Box opérateur | Huawei « HomeBoard » | = le 192.168.100.1 (double NAT) ; ports LAN jaunes, 1 câble vers RB951 |
| RB951Ui-2HnD | photo arrière | ports 1 (box), 2 et 3 (injecteurs/relais) occupés ; **ports 4 et 5 LIBRES** = prise directe possible d'un futur hôte |
| « Switch Mercury » | **CORRECTION : injecteur PoE Mercury** (DC / POE / LAN 10/100) | alimente les relais extérieurs en PoE ; il n'existe PAS de switch séparé |
| Relais/AP extérieurs | alimentés via injecteurs PoE | le « second Huawei à antennes » de la photo B du 16/09 = AP/relais (non central) |
| Vouchers physiques | planche imprimée **[121]–[200]**, offre 100 F | format : `DEOGRACIAS [n°] / Kode Voucher <code> / 24h 5h cfa 100.00` → validité 24 h, accès 5 h, 100 F = **Grille A confirmée sur support physique** ; stock physique unused existant |

## 4. INCIDENT INC-03 — codes vouchers neufs exposés en photo

- La planche [121]–[200] montre **~80 codes vierges lisibles** (fmnv765, rker547, …) ; la photo transite par l'historique de conversation.
- Risque réel : faible (codes utilisables uniquement sur le Wi-Fi du site ; historique privé) mais non nul.
- Options soumises au propriétaire (décision à recorder) : (a) assumer le risque et vendre la planche telle quelle ; (b) la considérer compromise : ne pas la vendre, régénérer/remplacer ces ~80 users à la prochaine visite (écritures = après sauvegarde, déjà le cas) ; (c) vendre seulement après rotation des codes concernés.
- Recommandation agent : (a) acceptable si l'historique reste privé ; (b) si la planche devait circuler physiquement/impressions partagées.

## 5. OD-1 — décision finale et conséquence plan

- Décision propriétaire : **E intérim (PC personnel), budget zéro** — MAIS contrainte révélée : **le PC unique accompagne le propriétaire à Calavi** → E intérim **IMPOSSIBLE** sur site.
- Aucune machine de récupération sur place (A écarté par inventaire) ; aucun achat (B/C/D écartés par budget).
- **Conséquence : aucun hôte Connector n'existera avant la prochaine fenêtre physique.** IMP-05 steps 2/3 (provisioning/heartbeat/SSH) = SANS OBJET ce tour ; les erreurs Windows rencontrées (Add-Content C:\ refusé = droits admin requis ; chemin « Fonctionnalités facultatives » introuvable) deviennent sans objet pour l'hébergement — notes techniques conservées : écrire le log dans `%USERPROFILE%` et installer OpenSSH serveur via PowerShell admin `Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0`.
- **IMP-05 : 🟡 CLOS « sans hôte »** — périmètre exécutable fait (INC-02, inventaire, onduleur) ; provisioning reporté à la prochaine fenêtre physique ou à un micro-achat ultérieur.
- **Adaptation de plan soumise à validation** (voir conversation) : bascule immédiate sur le volet distant IMP-07→ (monorepo, CI, schéma, backend, frontend, admin, paiement sandbox) depuis Calavi ; le stock Mikmon IMP-06, l'install Connector (IMP-23) et les tests captifs réels (IMP-38) attendent la prochaine fenêtre ; le Connector (IMP-21/22) reste développable et testable contre des fixtures masquées issues des dumps dg-* détenus par le propriétaire.

## 6. Statut

| IMP | Statut |
|---|---|
| 01–03 | 🟢 CLOS |
| 04 | 🟢 CLOS (P1 prix reporté, non bloquant) |
| 05 | 🟡 CLOS « sans hôte » : INC-02 ✅, onduleur ✅, inventaire ✅ ; provisioning reporté (OD-1 = aucun hôte avant prochaine fenêtre) |
| 06 | ⚪ à replanifier (fenêtre suivante ou génération backend ultérieure) |
| 07→ | ⚪ en attente de validation de l'ordre adapté |
