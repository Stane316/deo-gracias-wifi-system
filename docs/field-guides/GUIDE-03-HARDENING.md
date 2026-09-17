# GUIDE-03 — Durcissement du routeur + compte `dg-connector` préparatoire + SNTP (premières écritures)

> **Implementation** : IMP-03
> **Équipement** : RB951Ui-2HnD — RouterOS 6.49.17 — `192.168.88.254`
> **Durée estimée** : 25–35 minutes
> **Prérequis ABSOLUS** : IMP-02 clos = sauvegardes v1 en 3 copies vérifiées (fait) ; propriétaire SUR SITE avec le poste `192.168.88.240` ; **deux mots de passe neufs préparés à l'avance** (admin routeur + nouvelle sauvegarde), longs (16+ car.), notés hors ligne — JAMAIS dans le chat, JAMAIS dans un fichier du PC.
> **Objectif** : fermer les surfaces d'attaque héritées (services ouverts sur WAN, mot de passe admin connu d'un tiers), fiabiliser l'horloge (fondement des expirations), réduire l'usure flash, documenter l'exemption legacy, et préparer le terrain du compte technique `dg-connector` (création effective en IMP-21, groupe créé ici).
> **Garantie** : chaque écriture de ce guide est réversible (section RETOUR ARRIÈRE) et couverte par la sauvegarde.

---

## 0. RÈGLES ABSOLUES

1. **Gardez TOUJOURS une session WinBox ouverte** (session A) jusqu'à la fin de l'étape 7. Toute nouvelle connexion se teste dans une session B séparée.
2. Exécutez les commandes **dans l'ordre**, une par une, en vérifiant l'absence de message d'erreur après chacune.
3. **Aucun reboot** pendant le guide.
4. Si une commande échoue : STOP sur cette étape, notez l'erreur, passez à la section RETOUR ARRIÈRE pour cette étape uniquement, puis contactez-moi avant de continuer.
5. Si vous êtes enfermé dehors (impossible depuis le LAN si vous suivez l'ordre) : la session A ouverte permet de tout annuler ; en dernier recours, restauration via WinBox → System → Restore (sauvegarde v2/v1).
6. Ne modifiez RIEN d'autre (pas de « tant qu'on y est »).

---

## ÉTAPE 0 — Remédiation INC-01 : nouvelle sauvegarde binaire (10 min)

**OBJECTIF** : remplacer la sauvegarde dont le mot de passe a fuité dans le chat.

### 0.1 Créer la v2

```
/system backup save name=dg-full-2026-09-16-v2 password=NOUVEAU_MDP_SAULEGARDE
```

### 0.2 Télécharger, vérifier, copier

1. WinBox → Files : glissez `dg-full-2026-09-16-v2.backup` dans `DG-BACKUP-2026-09-16` (PC).
2. PowerShell : `Get-FileHash dg-full-2026-09-16-v2.backup -Algorithm SHA256` → notez l'empreinte dans `CHECKSUMS.txt` (ajout manuel).
3. Copiez le fichier v2 sur USB + cloud (zip protégé si cloud).

### 0.3 Détruire la v1 (partout)

```
/file remove dg-full-2026-09-16.backup
```

Puis sur PC : supprimez `dg-full-2026-09-16.backup` du dossier PC, de la clé USB et du cloud (remplacé par la v2). Videz la corbeille.

**ENVOIE-MOI** : « v2 créée, 3 copies, v1 détruite partout » + empreinte SHA256 de la v2. **JAMAIS le mot de passe.**

---

## ÉTAPE 0bis — Compléter l'archive portail (read-only, 5 min)

1. WinBox → Files → dossier `hotspot DEOGRACIAS` : téléchargez **`favicon.ico`** (903 o).
2. Ouvrez les sous-dossiers **`css/`** et **`img/`** : téléchargez TOUS les fichiers qu'ils contiennent dans `DG-BACKUP-2026-09-16/portail-hotspot-DEOGRACIAS/css/` et `.../img/`.
3. **ENVOIE-MOI** ces fichiers (pièces jointes au prochain message) + la liste des noms téléchargés.

---

## ÉTAPE 1 — Mot de passe admin (le plus important : connu d'un tiers)

### 1.1 Changer le mot de passe (session A reste ouverte)

```
/user set password=NOUVEAU_MDP_ADMIN [find where name="admin"]
```

### 1.2 Tester AVANT de continuer

1. Ouvrez une **nouvelle** fenêtre WinBox (session B) → connectez-vous avec le NOUVEAU mot de passe.
2. **SI échec** : retournez en session A, section RETOUR ARRIÈRE étape 1, contactez-moi.
3. **SI succès** : fermez la session B, gardez A, continuez.

**ENVOIE-MOI** : « mot de passe admin changé et re-testé ». **JAMAIS le mot de passe.**

---

## ÉTAPE 2 — Services : fermer et restreindre

**OBJECTIF** : telnet/ftp/www (WebFig) sont inutiles à l'exploitation réelle et ouverts sur le WAN double-NAT ; ssh/api/api-ssl/winbox doivent être joignables **uniquement depuis le LAN** (192.168.88.0/24), ce qui suffit au poste du propriétaire et au futur Connector.

### 2.1 Désactiver telnet

```
/ip service set disabled=yes [find where name="telnet"]
```

### 2.2 Désactiver ftp

```
/ip service set disabled=yes [find where name="ftp"]
```

### 2.3 Désactiver www (WebFig — NE touche PAS au portail captif, servi par le proxy hotspot)

```
/ip service set disabled=yes [find where name="www"]
```

### 2.4 Restreindre ssh au LAN

```
/ip service set address=192.168.88.0/24 [find where name="ssh"]
```

### 2.5 Restreindre api au LAN (port 8728 — futur Connector)

```
/ip service set address=192.168.88.0/24 [find where name="api"]
```

### 2.6 Restreindre api-ssl au LAN

```
/ip service set address=192.168.88.0/24 [find where name="api-ssl"]
```

### 2.7 Restreindre winbox au LAN

```
/ip service set address=192.168.88.0/24 [find where name="winbox"]
```

**OBSERVER** : après 2.7, la session A reste active ; ouvrez une session B depuis le PC (LAN) pour confirmer que WinBox répond encore, puis continuez.

---

## ÉTAPE 3 — Horloge fiable (SNTP)

**OBJECTIF** : les expirations (commentaires-date + moniteurs) dépendent de l'horloge ; sans RTC secourue ni NTP, toute coupure de courant la fauxonne.

### 3.1 Activer le client NTP en unicast via DNS

```
/system ntp client set enabled=yes mode=unicast server-dns-names=0.africa.pool.ntp.org
```

**SI erreur** (`server-dns-names` refusé en unicast ou autre) : utilisez le repli :

```
/system ntp client set enabled=yes mode=unicast primary-ntp=197.157.72.4
```

(et notez « repli IP » dans votre retour)

### 3.2 Vérifier

```
/system ntp client print
```

```
/system clock print
```

**OBSERVER** : `enabled: yes` ; heure identique à votre téléphone à ±1 min. Re-vérifiez l'heure 10 minutes plus tard (dérive < 2 s attendue).

---

## ÉTAPE 4 — Journalisation : stopper l'usure flash du topic hotspot

**OBJECTIF** : la règle `hotspot → disk` (info+debug) écrit en continu sur la flash 128 Mo. Passage en mémoire : les logs hotspot restent consultables en live, sans usure.

### 4.1 Identifier le numéro de la règle

```
/system logging print
```

**OBSERVER** : le numéro (`#`) de la règle dont les topics contiennent `hotspot` (c'était `4` à l'audit — VÉRIFIEZ, pas de copier-collez aveugle).

### 4.2 Passer en mémoire (remplacez N par le numéro vu)

```
/system logging set action=memory numbers=N
```

---

## ÉTAPE 5 — Documentation de l'exemption legacy + identité

### 5.1 Commenter le binding bypassé (traçabilité, aucune modification de comportement)

```
/ip hotspot ip-binding set comment="Exemption legacy admin externe - origine inconnue, documentee IMP-03, a statuer IMP-35" [find where address=192.168.88.200]
```

### 5.2 Nommer le routeur (cosmétique, utile en exploitation multi-équipements)

```
/system identity set name=DEOGRACIAS-RB951
```

**OBSERVER** : l'invite du terminal devient `[admin@DEOGRACIAS-RB951] >`.

---

## ÉTAPE 6 — Désactiver le user hotspot devinable `admin`

**OBJECTIF** : la table des tickets contient un user nommé `admin` (profil `default`, sans limite) : nom devinable = porte d'entrée gratuite. Il n'est pas en session active (vérifié à l'audit et en R2). Désactivation RÉVERSIBLE.

### 6.1 Confirmer qu'il n'est pas actif

```
/ip hotspot active print where user="admin"
```

**SI une session apparaît** : STOP, notez, contactez-moi (ne désactivez pas).

### 6.2 Désactiver

```
/ip hotspot user set disabled=yes [find where name="admin"]
```

**NOTEZ** (décision propriétaire à prendre plus tard, IMP-35) : les 4 users `Admin-free` (accès gratuits legacy, dont votre poste) sont CONSERVÉS tels quels aujourd'hui ; nous les documenterons et vous déciderez de leur sort à la mise en service de la plateforme.

---

## ÉTAPE 7 — Batterie de vérification (read-only + tests humains)

### 7.1 Sorties à me renvoyer

```
/ip service print
```

```
/system ntp client print
```

```
/system clock print
```

```
/system logging print
```

```
/ip hotspot active print count-only
```

```
/ip hotspot user print count-only where disabled=yes
```

**ATTENDU** : telnet/ftp/www en `X` ; ssh/api/api-ssl/winbox avec `address=192.168.88.0/24` ; ntp enabled ; logging hotspot en memory ; active ≥ 1 (le service tourne) ; disabled = 1 (le user admin).

### 7.2 Tests humains (critiques)

1. **Portail captif** : avec un téléphone NON connecté, rejoignez le Wi-Fi → la page de login Mikhmon doit s'afficher → connectez-vous avec un ticket valide (le vôtre) → Internet OK + page de statut OK.
2. **WinBox** : nouvelle session depuis le PC → OK (LAN autorisé).
3. **Telnet fermé** : sur le PC, invite de commandes : `telnet 192.168.88.254` → doit répondre « connexion refusée » (ou commande absente : dans ce cas `Test-NetConnection 192.168.88.254 -Port 23` → `TcpTestSucceeded : False`).
4. **WebFig fermé** : navigateur sur le PC : `http://192.168.88.254` → refusé/rien (le portail captif, lui, passe par le Wi-Fi — test 1).
5. **Clients en cours** : aucun client connecté ne doit avoir été coupé par ces opérations (comparez le nombre de sessions actives avant/après : variation normale uniquement due aux expirations naturelles).

**ENVOIE-MOI** : les 6 sorties de 7.1 + le résultat des 5 tests (OK/KO chacun).

---

## ÉTAPE 8 — Retour final

1. « v2 créée, 3 copies, v1 détruite partout » + SHA256 v2.
2. Fichiers portail complémentaires (0bis) + liste.
3. « mot de passe admin changé et re-testé ».
4. Sorties 7.1 + résultats 7.2.
5. Heure réelle de fin + toute anomalie observée.

---

## RETOUR ARRIÈRE (une commande par étape, si nécessaire)

| Étape | Commande d'annulation |
|---|---|
| 1 | `/user set password=ANCIEN_MDP [find where name="admin"]` (l'ancien est compromis : ne l'utilisez que pour reprendre la main, puis re-changez) |
| 2.1–2.3 | `/ip service set disabled=no [find where name="telnet"]` (idem ftp, www) |
| 2.4–2.7 | `/ip service set address=0.0.0.0/0 [find where name="ssh"]` (idem api, api-ssl, winbox) |
| 3 | `/system ntp client set enabled=no` |
| 4 | `/system logging set action=disk numbers=N` (N = numéro de la règle hotspot vu en 4.1) |
| 5.1 | `/ip hotspot ip-binding set comment="" [find where address=192.168.88.200]` |
| 5.2 | `/system identity set name=MikroTik` |
| 6 | `/ip hotspot user set disabled=no [find where name="admin"]` |
| Tout | WinBox → System → Restore → `dg-full-2026-09-16-v2.backup` (+ mot de passe v2) |

---

## NOTE : compte `dg-connector`

Le **groupe** et le **compte** techniques du Connector seront créés en **IMP-21/IMP-23** (quand le code du Connector existera pour tester les permissions réelles — P6). Le présent guide prépare le terrain : API restreinte au LAN (2.5) = périmètre exact du futur Connector ; sauvegardes à jour ; mot de passe admin sain. Aucune création de compte aujourd'hui = aucune surface nouvelle inutile.
