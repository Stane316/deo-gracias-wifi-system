# GUIDE-04 — Correctifs R3 + dry-run Walled Garden + preuves photo Grille A (fenêtre physique)

> **Implementation** : IMP-04 (volet terrain) + remédiation des deux écritures d'IMP-03 non appliquées
> **Durée estimée** : 30–40 min (dont photos)
> **Prérequis** : GUIDE-03 fait (services/ logging/ identity OK, tests humains OK) ; sauvegarde v2 en 3 copies ; propriétaire sur site.
> **Règles** : mêmes règles absolues que GUIDE-03 (session WinBox conservée, une commande à la fois, aucune autre modification, aucun reboot). Le dry-run walled garden est la seule écriture « fonctionnelle » du guide : elle est ajoutée puis RETIRÉE dans la même séance.

---

## ÉTAPE 0 — Correctifs R3 (les 2 écritures d'IMP-03 qui n'ont pas pris)

### 0.1 — NTP : passer réellement en unicast avec un serveur

**CONSTAT** : `/system ntp client print` montre `enabled: yes` mais `mode: broadcast` et `server-dns-names:` vide → aucune synchronisation réelle.

**COMMANDE** :

```
/system ntp client set mode=unicast server-dns-names=0.africa.pool.ntp.org
```

**VÉRIFIER** :

```
/system ntp client print
```

**ATTENDU** : `mode: unicast` et `server-dns-names: 0.africa.pool.ntp.org`.
**SI le mode reste broadcast ou le nom vide** : repli IP — sur le PC : `nslookup 0.africa.pool.ntp.org` → notez une IP répondue, puis :

```
/system ntp client set mode=unicast primary-ntp=IP_OBTENUE
```

et re-vérifiez avec `/system ntp client print` (attendu `primary-ntp: IP`). Notez dans le retour quelle variante a pris (« dns-names » ou « repli IP »).

**CONTRÔLE FINAL** : `/system clock print` maintenant, puis encore dans 10 minutes, comparés à votre téléphone (écart < 2 s).

### 0.2 — User hotspot `admin` : désactivation non appliquée

**CONSTAT** : `count-only where disabled=yes` = 0 → l'étape 6.2 d'IMP-03 n'a pas pris.

**COMMANDES** :

```
/ip hotspot active print where user="admin"
```

(si une session apparaît : STOP et me contacter)

```
/ip hotspot user set disabled=yes [find where name="admin"]
```

```
/ip hotspot user print count-only where disabled=yes
```

**ATTENDU** : `1`.

### 0.3 — Rappels de retours manquants d'IMP-03 (à confirmer dans votre message, sans aucun secret)

- [ ] « backup v2 créée, 3 copies, v1 détruite partout » + empreinte SHA256 de la v2 (si pas déjà fait)
- [ ] « mot de passe admin changé et re-testé en session B » (si pas déjà fait)
- [ ] fichiers 0bis (favicon.ico, css/, img/) — voir étape 1 ci-dessous

---

## ÉTAPE 1 — Compléter l'archive portail (read-only, 5 min)

**POURQUOI** : le portail réel charge `css/mikhmon-ui-light.css`, `css/background.css`, `img/favicon.png`, `img/logo.png` : les sous-dossiers contiennent les assets RÉFÉRENCÉS ; sans eux l'archive est incomplète (IMP-28).

1. WinBox → Files → `hotspot DEOGRACIAS` → ouvrez `css/` : téléchargez TOUS les fichiers.
2. Ouvrez `img/` : téléchargez TOUS les fichiers.
3. Téléchargez `favicon.ico` (racine du dossier).
4. **JOIGNEZ-LES à votre message de retour** (pièces jointes) + listez les noms.

---

## ÉTAPE 2 — Dry-run Walled Garden (écritures temporaires, 10 min)

**OBJECTIF** : vérifier en conditions réelles ce qu'un client NON authentifié peut atteindre si on ouvre une entrée walled garden — fondation des futurs besoins (page de paiement hébergée, vérifications OTP, healthchecks du portail). Risque R4 du plan.

### 2.1 État initial (doit être vide)

```
/ip hotspot walled-garden print
```

### 2.2 Ajouter l'entrée de test

```
/ip hotspot walled-garden add server=hotspot1 dst-host=example.com action=allow
```

### 2.3 Tests humains (téléphone NON connecté au portail, Wi-Fi rejoint, aucun login)

1. `http://example.com` → **attendu : la page example.com s'affiche SANS portail captif**.
2. `https://example.com` → notez exactement ce qui se passe (page réelle ? erreur certificat ? redirection portail ?) — information CRITIQUE pour IMP-28/38.
3. `http://bing.com` → **attendu : redirection portail captif** (le reste reste muré).
4. Connectez-vous normalement avec un ticket valide → navigation libre OK (aucun effet de bord).

### 2.4 Preuve de comptage

```
/ip hotspot walled-garden print
```

**OBSERVER** : la colonne HITS de l'entrée example.com (> 0 après les tests). Envoyez la sortie.

### 2.5 Retrait (obligatoire, même si les tests échouent)

```
/ip hotspot walled-garden remove [find where dst-host=example.com]
```

```
/ip hotspot walled-garden print
```

**ATTENDU** : vide de nouveau. **Le walled garden de production reste VIDE jusqu'à IMP-38.**

---

## ÉTAPE 3 — Preuves photo (10–15 min, aucune commande)

Photographiez (net, lisible, sans reflet) :

| Réf | Sujet | Usage |
|---|---|---|
| P1 | TOUT affichage de prix visible des clients (panneaux, feuilles, mur peint) — chaque face | Preuve Grille A / écarts à corriger (IMP-08, signalétique) |
| P2 | Un voucher physique Mikmon vierge + un utilisé (recto/verso, code lisible sur UN seul exemplaire) | Format du stock physique (IMP-06/18) |
| P3 | Installation routeur complète (routeur, câbles, switch/box éventuels, étiquettes) | Runbook IMP-35, IMP-05 |
| P4 | Alimentation : prise, multiprise, onduleur/onduleur-rack s'il existe, état des câbles | IMP-05 (coupures), OD-1 |
| P5 | L'emplacement physique候选 pour la machine Connector (étagère/coin près du routeur) + aération | OD-1, IMP-05 |
| P6 | Ports LAN libres disponibles (switch ou box) pour brancher le Connector | OD-1, IMP-05 |

**ENVOIE-MOI** les photos en pièces jointes (je les archiverai normalisées dans `docs/infrastructure/evidence/photos/`). Si un sujet n'existe pas (ex. pas d'onduleur), dites-le explicitement.

---

## ÉTAPE 4 — Retour final (message unique)

1. R3 : variante NTP qui a pris + 2 lectures d'horloge (t0/t+10min) + `disabled=yes count = 1`.
2. Confirmations manquantes d'IMP-03 (liste 0.3).
3. Fichiers css/ img/ favicon.ico (joints) + noms.
4. Walled garden : résultats des 4 tests humains (verbatim pour le test https), sortie HITS, sortie post-retrait (vide).
5. Photos P1–P6 (ou absences explicites).
6. Heure réelle de fin + anomalies.

---

## RETOUR ARRIÈRE

| Étape | Annulation |
|---|---|
| 0.1 | `/system ntp client set mode=broadcast` (état antérieur) ou `enabled=no` |
| 0.2 | `/ip hotspot user set disabled=no [find where name="admin"]` |
| 2.x | `/ip hotspot walled-garden remove [find where dst-host=example.com]` (déjà prévu en 2.5) ; en ultime recours tout vider : le garden était vide avant ce guide |

