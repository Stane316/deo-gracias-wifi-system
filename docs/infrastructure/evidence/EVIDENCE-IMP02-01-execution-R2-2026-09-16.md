# EVIDENCE-IMP02-01 — Exécution GUIDE-02 (16/09/2026 ~17h–18h) : bruts R2, checksums, incident INC-01

> **Implementation** : IMP-02 (clôture) + sonde R2 (clôture technique IMP-01)
> **Déroulé** : GUIDE-02 exécuté scrupuleusement par le propriétaire sur site : 7 artefacts `dg-*` créés, téléchargés, SHA256 calculés, 3 copies (PC + USB + cloud) vérifiées, dumps `dg-users-*`/`dg-sales-*` supprimés du routeur (confirmé par les deux `/file remove` sans erreur).
> **Masquage** : aucun mot de passe de ticket reçu ; commentaires voucher abrégés là où non nécessaires.

---

## 1. INCIDENT INC-01 — mot de passe de sauvegarde exposé

**Fait** : le retour terminal du propriétaire contient la commande `/system backup save name=dg-full-2026-09-16 password=<MOT_DE_PASSE_EN_CLAIR>` (le mot de passe apparaît dans l'historique de conversation, contrairement à la règle 3 du GUIDE-02).
**Impact** : la sauvegarde binaire v1 (routeur + 3 copies) est déchiffrable par toute personne ayant accès à cet historique.
**Remédiation** (ÉTAPE 0 du GUIDE-03) : nouvelle sauvegarde `dg-full-2026-09-16-v2.backup` avec nouveau mot de passe (jamais transmis), re-vérification 3 copies, suppression de la v1 partout. Le mot de passe compromis est considéré comme public : ne jamais le réutiliser.
**Le mot de passe compromis N'EST PAS recopié dans ce fichier ni dans aucun fichier du dépôt.**

---

## 2. SORTIES R2 (sonde de clôture IMP-01)

### 4.1 — limit-uptime de 4 utilisateurs actifs

```
dyfi8698 | limit-uptime=         | profile=Admin-free | comment=vc-***-**-**.**.**-
tize696  | limit-uptime=05:00:00 | profile=5-HEURES   | comment=sep/17/2026 11:11:21
sdgt552  | limit-uptime=05:00:00 | profile=5-HEURES   | comment=sep/17/2026 09:45:11
pe5a3cr  | limit-uptime=12:00:00 | profile=12-HEURES  | comment=sep/16/2026 18:33:29
```

### 4.2 — Échantillon des 10 premiers utilisateurs

```
default-trial | (profil vide)  | counters and limits for trial users | lu=
admin         | default        |                                     | lu=
yyyv4294      | Admin-free     | vc-***-**-**.**.**-                 | lu=
dyfi8698      | Admin-free     | vc-***-**-**.**.**-                 | lu=
fksx9876      | Admin-free     | vc-***-**-**.**.**-                 | lu=
ygwc7835      | Admin-free     | vc-***-**-**.**.**-                 | lu=
bprc5243      | 12-HEURES      | vc-***-**-**.**.**-                 | lu=12:00:00
efza3589      | 12-HEURES      | vc-***-**-**.**.**-                 | lu=12:00:00
zdgc6945      | 12-HEURES      | vc-***-**-**.**.**-                 | lu=12:00:00
ddhw5878      | 24-HEURES      | vc-***-**-**.**.**-                 | lu=1d00:00:00
```

### 4.3 — Contenu du dossier portail actif (20 entrées)

```
hotspot DEOGRACIAS/            directory      sep/22/2025
  c… .css  11.5KiB  (mikhmon-ui-light.css)      nov/24/2025
  e… .html   898    (error.html)                nov/24/2025
  e… .txt  3615 / 3688 (errors.txt, errors-en.txt)
  f… .ico   903     (favicon.ico)   ← ABSENT de l'archive repo
  i… .png  2516    (favicon.png)                nov/24/2025
  i… .png  30.8KiB (logo.png)                   nov/24/2025
  l… .html 8.3KiB  (login.html)                 nov/24/2025
  l… .html 2504    (logout.html)
  m… .js   7.0KiB  (md5.js)
  r… .html 1509 / 318 / 850 (radvert, redirect, rlogin)
  R… .md   1381    (README.md thème)
  s… .html 4152    (status.html)
  a… .html 1135    (alogin.html)
  c… .css  541.3KiB (background.css)
  css/  directory  sep/22/2025   ← contenu NON archivé
  img/  directory  sep/22/2025   ← contenu NON archivé
```

---

## 3. CHECKSUMS REÇUS (SHA256, chemins tronqués au collage — consignés tels quels)

```
890D427C1A550CB5BD988B57EC39BA8F9F9AFDDC3EBC1F28BF4FA2560095D630
8D5FE2B650D372A63A0C9D2DC36C2CA8C77C9B971757EF999BFF7A73A3DC7276
630FE5A0B9CEBB426B998985311F1C5802E2AA650A9EFF042890BB70E0C3044C
20297D2DB8DD70BACFE6FCB77287BE0BAFEE34BC97BA906C2B33599D1757D514
F85BC9D7FD1A22ACC3229CD8152BBF9E18B1F0A06ABA0D7D624DA029703F8C7E
06AD5612408A15E5D0B98F40275E71A6CF59D7D9364800239333D9C2603480E2
EBF14A15B957CF7C739F6B4768C60A0DFF56594AADD9FC6660B911B1A2B08F33
```

> 7 empreintes = 7 artefacts `dg-*`. Les chemins ont été coupés par le collage ; l'association fichier↔empreinte reste détenue par le propriétaire dans `CHECKSUMS.txt` (copie PC/USB/cloud). À ré-expédier en entier si nécessaire (non sensible).

---

## 4. CONCLUSIONS

### 4.1 Mécanisme d'expiration — DÉFINITIVEMENT CONFIRMÉ (3 couches, IMP-01 clos)

- `limit-uptime` **posé à la génération** (vouchers neufs déjà porteurs : 12:00:00, 1d00:00:00) = durée d'accès cumulative par offre.
- Commentaire-date + 7 moniteurs (~2,5 min) = validité, par suppression.
- Journal mikhmon = traçabilité des ventes.
- Les totaux de session « non ronds » = temps cumulé déjà consommé lors de reconnexions mac-cookie. Aucun regalage gratuit : le comportement commercial existant est sain.

### 4.2 Reclassement de l'ALERTE A1 → comportement legacy documenté

- `dyfi8698` (poste du propriétaire) et 3 autres users = profil **`Admin-free`** (`noexp`, pas de limit-uptime) : accès gratuits illimités **volontaires** créés par l'admin externe, pas une fuite du mécanisme.
- Anomalie résiduelle conservée : ces users Admin-free portent des commentaires `vc-…` jamais convertis (l'On-Login d'Admin-free ne convertit rien) — sans effet puisque le profil ignore l'expiration.
- La plateforme (IMP-18/24) devra : reproduire limit-uptime+commentaire pour les tickets digitaux, et réconcilier/distinguer les Admin-free legacy.

### 4.3 Découvertes nouvelles pour IMP-03

- **User hotspot `admin`** (profil `default`, sans limite) présent dans la table des tickets → compte devinable à désactiver (GUIDE-03 étape 6).
- `default-trial` : entrée système de comptage trial — ne pas toucher.
- Services encore ouverts sans restriction (confirmé J4) + mot de passe admin hérité de l'admin externe → **changement du mot de passe admin = priorité n°1 du GUIDE-03**.

### 4.4 Lacunes d'archive portail (mineures, comblées par GUIDE-03 étape 0bis)

`favicon.ico` + contenus `css/` et `img/` du dossier `hotspot DEOGRACIAS`.

### 4.5 Statut

| IMP | Statut |
|---|---|
| IMP-01 | 🟢 **CLOS définitif** (R2 confirmé) |
| IMP-02 | 🟢 **CLOS** sous réserve remédiation INC-01 (= GUIDE-03 étape 0) |
