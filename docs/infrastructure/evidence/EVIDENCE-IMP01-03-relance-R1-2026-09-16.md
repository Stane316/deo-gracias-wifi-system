# EVIDENCE-IMP01-03 — Relance R1 (16/09/2026 ~16h10–16h40) : bruts masqués + conclusions révisées

> **Implementation** : IMP-01 (clôture) — complété par la micro-sonde R2 intégrée à GUIDE-02 (IMP-02).
> **Sources** : sorties R1 du propriétaire + 17 fichiers portail joints (archivés dans `docs/infrastructure/portal-legacy/`).
> **Masquage** : noms d'utilisateurs hotspot conservés uniquement quand nécessaires à la démonstration technique, abrégés ailleurs ; MAC masquées ; aucun mot de passe présent dans les sorties reçues.

---

## 1. SORTIES R1 (extraits masqués)

### R1.1 — Liste complète des profils (9 profils)

```
default, 5-HEURES, 12-HEURES, 24-HEURES, 72-HEURES, 1-SEMAINE, 1-MOIS, Admin-free, 1-HEURE
```

> Correction doc 07 §12 : le profil 50 F s'appelle **`1-HEURE`** (singulier), pas `1-HEURES`.
> Chaque profil commercial porte un On-Login inline identique au schéma E1/E2, aux prix/validités près :
> `5-HEURES → remc,100,24h` · `12-HEURES → remc,200,24h` · `24-HEURES → remc,300,48h` · `72-HEURES → remc,500,5d` · `1-SEMAINE → remc,1000,10d` · `1-MOIS → remc,4000,40d` · `1-HEURE → remc,50,1h` · `Admin-free → ",,0,,,noexp"`.
> **Alignement Grille A parfait** (accès/validité) : 100F=5h/24h · 200F=12h/24h · 300F=24h/48h · 500F=72h/5j · 1000F=1sem/10j · 4000F=1mois/40j.

### R1.2 — session-timeout / rate-limit par profil

```
default    | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
5-HEURES   | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
12-HEURES  | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
24-HEURES  | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
72-HEURES  | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
1-SEMAINE  | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
1-MOIS     | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
Admin-free | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
1-HEURE    | session-timeout= | rate-limit= | shared-users=1 | idle-timeout=none | keepalive=2m
```

> **Aucun session-timeout, aucun rate-limit dans les profils.** La durée d'accès ne vient PAS des profils → elle vient du `limit-uptime` posé par utilisateur à la génération (voir §3). Aucun bridage débit n'existe aujourd'hui (information produit pour IMP-26 : les futures offres pourront en introduire, ou reproduire l'absence).

### R1.3 — html-directory / dns-name

```
hotspot DEOGRACIAS
deogracias.bj
```

> **P5 CLOS définitif** : le portail ACTIF est le dossier **`hotspot DEOGRACIAS`** (thème Mikhmon, fichiers joints) ; le dossier `hotspot` (défaut RouterOS) est présent mais inutilisé. `dns-name` confirmé, usage local seul (réponse humaine : non joignable depuis Internet).

### R1.4 — Les 7 schedulers : MONITEURS D'EXPIRATION

```
 #  NAME       START-DATE     INTERVAL  RUN-COUNT  COMMENTAIRE
 0  5-HEURES   sep/22/2025    2m36s     5146       ;;; Monitor Profile 5-HEURES
 1  12-HEURES  sep/22/2025    2m41s     4986       ;;; Monitor Profile 12-HEURES
 2  24-HEURES  sep/22/2025    2m29s     5387       ;;; Monitor Profile 24-HEURES
 3  72-HEURES  sep/22/2025    2m22s     5652       ;;; Monitor Profile 72-HEURES
 4  1-SEMAINE  sep/22/2025    2m25s     5534       ;;; Monitor Profile 1-SEMAINE
 5  1-MOIS     sep/22/2025    2m53s     4640       ;;; Monitor Profile 1-MOIS
 6  1-HEURE    apr/10/2026    2m24s     5574       ;;; Monitor Profile 1-HEURE
```

Contenu (identique pour les 6 premiers, variante pour 1-HEURE) : toutes les ~2,5 min, pour chaque utilisateur du profil, lit le commentaire ; si format date (`sep/17/2026 09:09:49`, `/` en positions 3 et 6 ; pour 1-HEURE : `2026-04-10 …`, `-` en 4 et 7) et date+heure dépassées → **`/ip hotspot user remove` + `/ip hotspot active remove`**.

> **Mécanisme de validité identifié** : les tickets expirés sont **SUPPRIMÉS** (pas désactivés) par ces moniteurs. C'est la pièce manquante du tableau : disabled=0 s'explique, et 7852 ventes − 4155 utilisateurs ≈ 3697 tickets supprimés à expiration.
> **Aucun scheduler de reboot** → IMP-05 (test coupure) DÉBLOQUÉ.
> Granularité d'application : ~2,5 min (un ticket expiré peut survivre ≤ 2,5 min).
> ⚠️ Deux formats de date coexistent dans les commentaires selon la famille de profil → le parseur de réconciliation (IMP-24) devra gérer les deux.

### R1.5 — Journal des ventes

```
/system script print count-only                      → 7852
/system script print count-only where comment=mikhmon → 7852
```

### R1.7 / R1.8 — Queue et DHCP client

```
/queue simple print  → 1 entrée DYNAMIQUE hs-<hotspot1> (max-limit=0/0) : créée par le hotspot, rien de custom
/ip dhcp-client print → ether1, bound, 192.168.100.7/24 (confirme N5 : WAN dynamique)
```

### R1.10 — Sessions actives (2e capture, ~16h26, masqué)

```
0  ;;; sep/16/2026 19:17:05   a25***  192.168.88.150  mac-cookie  uptime=57m59s   left=4h5m33s   (total ≈ 5h03m)
1  ;;; vc-***                 fwts*** 192.168.88.183  http-chap   uptime=48m17s   left=4h11m43s  (total = 5h00m00s)
2  ;;; sep/17/2026 09:45:11   sdgt*** 192.168.88.187  mac-cookie  uptime=6m57s    left=1h10m27s  (total = 1h17m24s)
3  ;;; sep/17/2026 11:11:21   tize*** 192.168.88.196  mac-cookie  uptime=1h46m31s left=1h8m53s   (total = 2h55m24s)
4  ;;; vc-***                 vpfm*** 192.168.88.235  http-chap   uptime=1h12m23s left=3h47m37s  (total = 5h00m00s)
5  ;;; vc-***-09.22.25-       dyfi*** 192.168.88.240  mac-cookie  uptime=1h43m25s left= (vide)
```

> Le total uptime+left de la session 3 est **identique aux deux captures** (2h55m24s) → le décompte est continu par session, pas réinitialisé. Les totaux varient par utilisateur (5h pile pour premiers logins 100 F ; restes inférieurs pour re-logins mac-cookie) → cohérent avec un **compteur cumulatif par utilisateur** (`limit-uptime`), déjà partiellement consommé lors des reconnexions.
> **Cas dyfi*** (poste du propriétaire, 192.168.88.240) : commentaire encore `vc-500-09.22.25-` (voucher de sep/2025 !), aucun time-left → **ticket zombie** : ni converti par l'On-Login, ni supprimé par le moniteur (commentaire sans format date), ni limité (pas de limit-uptime apparent) → accès gratuit illimité. Preuve vivante de la fuite bord identifiée en analyse §3 (ALERTE A1 révisée ci-dessous).

### R1.6 / R1.11 — Échecs de sonde (syntaxe)

```
:foreach … get $u last-logged-out   → "input does not match any value of value-name" (propriété inexistante → sonde avortée)
/ip hotspot user print limit=10     → "expected end of command"
/ip hotspot user print where disabled=no limit=10 → en-tête seul collé
```

> La propriété invalide était `last-logged-out`. Le statut de `limit-uptime` reste donc à confirmer proprement → **sonde R2 intégrée à GUIDE-02** (2 commandes read-only).

### Réponses humaines (R1.12)

1. **Toute la configuration (binding bypassé inclus) est l'œuvre d'un administrateur réseau externe** ; le propriétaire a hérité des identifiants et veut récupérer/reprendre ce travail. → le principe de préservation est encore plus central ; le binding `192.168.88.200` reste documenté, décision en IMP-03 avec le propriétaire.
2. SSID « ZONE C » : vestige — il n'existe plus qu'**un seul point d'accès** aujourd'hui.
3. `deogracias.bj` : **local uniquement** (pas de résolution Internet) — simple nom de portail captif.
4. Poste d'audit `192.168.88.240` = **poste de secours confirmé** pour IMP-02/IMP-03.

### Fichiers portail joints (17) — archivés repo

`login.html (8 520 o)`, `alogin.html`, `rlogin.html`, `status.html`, `logout.html`, `error.html`, `redirect.html`, `radvert.html`, `md5.js`, `mikhmon-ui-light.css`, `background.css (554 Ko, image base64)`, `logo.png`, `favicon.png`, `errors.txt`, `errors-en.txt`, `README.md` (readme du thème), → proviennent du dossier **`hotspot DEOGRACIAS`** (tailles différentes du listing `/hotspot`).

---

## 2. CONCLUSIONS RÉVISÉES (remplacent analyse §3 là où indiqué)

### Mécanisme d'expiration — version finale (3 couches)

```
COUCHE 1 — DURÉE D'ACCÈS (cumulative) : limit-uptime posé par utilisateur à la génération
             (Mikhmon) = 5h/12h/24h/72h/1sem/1mois. Compteur cumulatif RouterOS :
             les reconnexions mac-cookie ne redonnent PAS de temps. [confirmation finale : sonde R2]
COUCHE 2 — VALIDITÉ (fenêtre d'activation+usage) : date d'expiration écrite en commentaire
             par l'On-Login au 1er login ; 7 schedulers moniteurs (≈2,5 min) SUPPRIMENT
             user + session active dès la date dépassée.
COUCHE 3 — JOURNAL : entrée /system script comment=mikhmon par 1er login (7852 à ce jour).
```

### ALERTE A1 — RÉVISÉE (rétrogradée de « élevée » à « moyenne, bord connu »)

Le système existant est commercialement cohérent (cumul + validité). Restent deux fuites bord documentées :
- **tickets zombies** (commentaire jamais converti, ex. dyfi*** : ni moniteur ni limite ne s'appliquent) ;
- **granularité moniteur ~2,5 min** (négligeable).
La plateforme (IMP-11/18/19) devra : (a) générer des tickets dont le commentaire est compatible avec l'On-Login (`vc`/`up`/vide) ou faire valider une extension du script ; (b) prévoir une réconciliation qui détecte les zombies (IMP-24).

### Statut des points P (final)

| Point | Statut |
|---|---|
| P1 RADIUS | ✅ CLOS (inchangé) |
| P2 4 000 F | ✅ CLOS (inchangé) |
| P3 5 000 F | ✅ CLOS (inchangé) |
| P4 profils/shared-users/expiration | ✅ **CLOS** — shared-users=1 partout ; pas de session-timeout/rate-limit de profil ; expiration = limit-uptime (cumul) + moniteurs de validité (suppression) ; micro-confirmation limit-uptime = sonde R2 (IMP-02) |
| P5 fichiers portail | ✅ **CLOS** — dossier actif `hotspot DEOGRACIAS`, 17 fichiers archivés au repo ; `/hotspot` défaut inutilisé |
| P6 permissions Connector | 🟡 données collectées (test = IMP-03/21) |

### Impacts mis à jour pour les IMP suivants

- **IMP-06/18** : génération digitale = users avec `limit-uptime` = durée offerte + commentaire `vc-…` compatible ; stock proportionnel (N4) inchangé.
- **IMP-11** : enum profils = noms exacts (`1-HEURE` singulier) ; validités = 24h/24h/48h/5d/10d/40d ; deux formats de date de commentaire à parser.
- **IMP-24** : réconciliation = commentaires + moniteurs + journal mikhmon ; détection zombies.
- **IMP-35** : runbook de restauration à écrire à partir des sauvegardes IMP-02.
- **IMP-08** : corrections doc : `1-HEURE`, dossier portail `hotspot DEOGRACIAS`, mécanisme 3 couches, WAN dynamique, dns-name local.

**IMP-01 : 🟢 CLOS** (sous réserve de la sonde R2, embarquée dans IMP-02).
