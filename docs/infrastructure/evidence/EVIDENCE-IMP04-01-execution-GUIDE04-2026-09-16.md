# EVIDENCE-IMP04-01 — Exécution GUIDE-04 (16/09/2026 ~19h) : R3, INC-02, photos physiques

> **Implementation** : IMP-04 (volet terrain) — exécution partielle, clos sous réserve étape 0 du GUIDE-05.

## 1. Correctifs R3

### 1.1 NTP : ✅ FONCTIONNEL (avec anomalie de parsing consignable)

- La commande `set mode=unicast server-dns-names=…` a affiché `expected end of command (line 1 column 24)` **mais l'état résultant est correct et vérifié** :
  ```
  enabled: yes | mode: unicast | server-dns-names: 0.africa.pool.ntp.org
  active-server: 196.10.54.58 | last-update-before: 1m34s520ms | last-adjustment: 914us
  ```
  → synchronisation active sur un serveur NTP africain (196.10.54.58), dérive corrigée à la microseconde. Les deux tentatives de repli `primary-ntp=` ont correctement échoué sans effet (aucun dommage).
- Hypothèse consignée : artefact de collage terminal (retour à la ligne dans la commande), l'application ayant eu lieu sur une exécution antérieure ou partielle. **Sans impact : l'état final est celui voulu et prouvé par active-server/last-update.**

### 1.2 User hotspot `admin` : ✅ désactivé — `count-only where disabled=yes` = **1** (garde-fou session vide respecté).

## 2. INCIDENT INC-02 — entrée walled garden non supprimable par `find`

- Entrée de test créée : `hotspot1 dst-host=example.com action=allow` ✅.
- **Deux tentatives** `/ip hotspot walled-garden remove [find where dst-host=example.com]` → **sans effet** (l'entrée reste visible au print). Cause probable : artefact de collage (crochets coupés par le retour à la ligne) ou particularité du find sur dst-host.
- **État courant au 16/09 ~19h15 : walled garden NON vide (1 entrée allow example.com)** → écart à la norme « garden vide jusqu'à IMP-38 ». Impact réel : un client non authentifié peut joindre example.com (domaine neutre) ; aucun autre hôte n'est ouvert.
- **Remédiation = ÉTAPE 0 du GUIDE-05** : (a) profiter de l'entrée présente pour exécuter ENFIN les 4 tests humains du dry-run (jamais rapportés), (b) suppression **par numéro** (`remove 0`) ou via WinBox GUI, (c) print de contrôle vide.
- Les tests humains R4 (http/https example.com vs bing.com en non-authentifié) restent donc **à produire** — valeur intacte pour IMP-28/38.

## 3. Fichiers portail : archive COMPLÈTE

- Junctions reçus : `favicon.png`, `logo.png`, `background.css`, `mikhmon-ui-light.css` = **contenus de `img/` et `css/`**.
- **Preuve hash** : md5 identiques deux à deux avec les copies racine déjà archivées (`15b7f3e8…`, `fececd80…`, `fcbb6ed0…`, `29051f7e…`) → les sous-dossiers sont des duplicats exacts ; l'archive repo couvrait déjà tout.
- **favicon.ico (903 o) : ABANDONNÉ** — format `.ico` refusé par l'upload chat ; **non référencé par aucune page** (login.html pointe `img/favicon.png`) → sans impact fonctionnel ni patrimonial. Décision consignée.

## 4. Photographies physiques reçues (2) — analyse

Archivées : `docs/infrastructure/evidence/photos/PHYS-2026-09-16-A.jpg` et `-B.jpg`.

| Observation | Photo | Conséquences |
|---|---|---|
| **Onduleur Mercury MAVERICK 650 (650 VA)** posé sur une chaise bois, prise murale dédiée, câbles volants | A | Le site dispose d'une secours électrique : à inclure au périmètre IMP-05 (quoi est branché dessus ? autonomie ?) ; amélioration rangement/fixation à recommander au runbook IMP-35 ; le test de coupure IMP-05 devient un test **onduleur** (mesure d'autonomie) plutôt qu'une coupure sèche |
| Multiprise murale 5 prises + interrupteur ; box Huawei « HomeBoard » (ONT/routeur opérateur = le 192.168.100.1) ; **switch Mercury 5 ports** ; second routeur/AP Huawei à antennes ; 2 boîtiers blancs (injecteurs/alims) ; câblage Ethernet orange/vert/jaune non gainé | B | Topologie physique confirmée : box opérateur → switch → RB951 (hors champ) + AP ; ports libres du switch Mercury à compter sur site (P6, étape 1 GUIDE-05) ; le « second Huawei » = probablement l'AP/Wi-Fi de la box ou un AP additionnel — à identifier (question retour) ; emplacement candidat Connector = zone onduleur/multiprise (photo A) |
| Absences au retour : P1 (affichages prix), P2 (vouchers physiques), P5/P6 dédiées | — | Reprogrammées dans le retour GUIDE-05 (propriétaire encore sur site pour IMP-05) |

## 5. Statut

| IMP | Statut |
|---|---|
| IMP-03 | 🟢 **CLOS** (R3 vérifié : NTP sync active + user admin désactivé ; services/logging/identity/tests déjà vérifiés) |
| IMP-04 | 🟡 clos sous réserve : INC-02 (tests humains WG + suppression par numéro = GUIDE-05 ét. 0) + photos P1/P2 |
