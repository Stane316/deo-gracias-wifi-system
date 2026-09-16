# GUIDE-01 — ADDENDUM R1 : compléments read-only (10–15 min)

> **Contexte** : l'audit du 16/09/2026 est exploitable, mais 4 commandes ont échoué (syntaxe `limit` refusée sans `where` sur RouterOS 6.49.17), 2 sorties ont été tronquées, et l'étape G3 (téléchargement des fichiers portail) n'a pas été faite.
> **Mêmes règles absolues que GUIDE-01** : uniquement les commandes ci-dessous, toutes read-only ; aucune confirmation `y` ; masquage des mots de passe/clés avant envoi ; si erreur → copier l'erreur et passer à la suite.
> **Priorité si le temps manque** : R1.2 → R1.4 → R1.9 → R1.1 → le reste.

---

### R1.1 — Liste complète des profils utilisateurs (table simple, sans détail)

**OBJECTIF** : connaître TOUS les profils existants (y compris `Admin-free`, `default`, `1-HEURES`…) et lever N13.

**COMMANDE** :

```
/ip hotspot user profile print
```

**ENVOIE-MOI** : la sortie complète (table courte, aucun risque de troncature).

---

### R1.2 — Paramètres clés de chaque profil (LA commande la plus importante)

**OBJECTIF** : lire `session-timeout` (mécanisme d'expiration réel), `rate-limit` (bridage par offre), `shared-users`, `idle-timeout` de chaque profil — sans la sortie gigantesque du `print detail` (qui a tronqué E1).

**COMMANDE** (bloc entier à coller d'un coup dans le terminal ; c'est du read-only : `find` + `get` + `:put`) :

```
:foreach p in=[/ip hotspot user profile find] do={:put ([/ip hotspot user profile get $p name]." | session-timeout=".[/ip hotspot user profile get $p session-timeout]." | rate-limit=".[/ip hotspot user profile get $p rate-limit]." | shared-users=".[/ip hotspot user profile get $p shared-users]." | idle-timeout=".[/ip hotspot user profile get $p idle-timeout]." | keepalive=".[/ip hotspot user profile get $p keepalive-timeout])}
```

**OBSERVER** : une ligne par profil.

**ENVOIE-MOI** : toutes les lignes.

**INTERPRÉTATION** :
- **SI `session-timeout` = 5h/12h/24h/72h/1w/40d selon le profil** → le mécanisme d'expiration est pleinement confirmé (durée d'accès = session-timeout).
- **SI `session-timeout=none` partout** → le mécanisme est ailleurs (les 7 schedulers ? R1.4 devient critique) ; me le dire explicitement.
- **SI la commande produit une erreur** : envoyez l'erreur, puis faites simplement pour chaque profil vu en R1.1 : `/ip hotspot user profile print where name="5-HEURES"` (sans `detail` — la table inclut-elle les colonnes utiles ; sinon `print detail where name="5-HEURES"` profil par profil).

---

### R1.3 — Profil serveur hotspot (lever l'anomalie html-directory)

**OBJECTIF** : vérifier si `html-directory` vaut `hotspot` ou `hotspot DEOGRACIAS`, et confirmer `dns-name`.

**COMMANDE** :

```
:put [/ip hotspot profile get hsprof1 html-directory]
```

```
:put [/ip hotspot profile get hsprof1 dns-name]
```

**ENVOIE-MOI** : les deux lignes affichées.

---

### R1.4 — Les 7 schedulers (BLOQUANT pour IMP-05)

**OBJECTIF** : identifier les 7 schedulers — notamment détecter un éventuel reboot/maintenance périodique avant tout test de coupure de courant.

**COMMANDES** :

```
/system scheduler print
```

Puis, pour le détail (7 entrées seulement, pas besoin de `limit`) :

```
/system scheduler print detail
```

**SI la sortie `detail` est trop longue à copier** : envoyez au minimum la table simple + pour chaque scheduler son `on-event` via :

```
:foreach s in=[/system scheduler find] do={:put ([/system scheduler get $s name]." | interval=".[/system scheduler get $s interval]." | next=".[/system scheduler get $s next-run]." | event=".[/system scheduler get $s on-event])}
```

**ENVOIE-MOI** : tout.

**INTERPRÉTATION** : **SI un scheduler contient `reboot`** → ALERTE rouge avant IMP-05. **SI ce sont des reliquats de sessions (noms = noms d'utilisateurs)** → le On-Login les a laissés (échec du `remove`) ; à documenter.

---

### R1.5 — Taille du journal des ventes

**OBJECTIF** : mesurer le journal `/system script` (comment=mikhmon) — historique des ventes depuis sep/2025, source de réconciliation (IMP-24).

**COMMANDES** :

```
/system script print count-only
```

```
/system script print count-only where comment="mikhmon"
```

**SI la 2e échoue** :

```
/system script print count-only where comment~"mikhmon"
```

**ENVOIE-MOI** : les nombres.

---

### R1.6 — Propriétés d'un utilisateur actif réel

**OBJECTIF** : vérifier sur un cas réel l'absence de `limit-uptime`, l'état du commentaire et le profil (recoupe N9/A1).

**COMMANDE** (remplacez `hnan239` par un nom VU dans `/ip hotspot active print`, entre guillemets) :

```
:foreach u in=[/ip hotspot user find where name="hnan239"] do={:put ("name=".[/ip hotspot user get $u name]." | profile=".[/ip hotspot user get $u profile]." | limit-uptime=".[/ip hotspot user get $u limit-uptime]." | disabled=".[/ip hotspot user get $u disabled]." | comment=".[/ip hotspot user get $u comment]." | last-logged-out=".[/ip hotspot user get $u last-logged-out])}
```

**ENVOIE-MOI** : la ligne produite. Ne m'envoyez PAS la propriété `password` (elle n'est pas demandée par la commande).

---

### R1.7 — La queue simple inconnue

**COMMANDE** :

```
/queue simple print
```

**SI 1 seule entrée** : envoyez aussi son détail :

```
/queue simple print detail
```

**ENVOIE-MOI** : la sortie.

---

### R1.8 — DHCP client WAN

**OBJECTIF** : confirmer que l'adresse WAN 192.168.100.7 vient d'un DHCP client (N5).

**COMMANDE** :

```
/ip dhcp-client print
```

**ENVOIE-MOI** : la sortie.

---

### R1.9 — Téléchargement des fichiers portail (BLOQUANT pour IMP-04)

**OBJECTIF** : récupérer le contenu réel du portail captif (P5, étape G3 non faite).

**PROCÉDURE WinBox (lecture seule)** :

1. WinBox → menu **Files**.
2. Double-cliquez le dossier `hotspot` (ou celui confirmé en R1.3).
3. Glissez-déposez sur le bureau de votre PC, un par un :
   - `login.html`, `alogin.html`, `rlogin.html`, `status.html`, `logout.html`, `error.html`, `redirect.html`, `radvert.html`
   - `api.json`, `md5.js`, `errors.txt`
   - le dossier `css` (contient `style.css`)
   - le dossier `xml` (contient `alogin.html`, `WISPAccessGatewayParam.xsd`)
   - `favicon.ico` et le dossier `img` (2 petits SVG) — facultatif
4. Envoyez-moi le tout (fichiers joints, ou contenu copié-collé dans un `.txt` à défaut).

**SI le glisser-déposer ne fonctionne pas** : alternative SSH depuis un PC (lecture seule) :

```
scp -P 22 admin@192.168.88.254:hotspot/login.html .
```

(répéter par fichier) — ou ouvrez chaque fichier dans WinBox Files et copiez le contenu.

---

### R1.10 — Re-capture des sessions actives

**OBJECTIF** : recouper N9 (totaux uptime + session-time-left incohérents).

**COMMANDE** :

```
/ip hotspot active print detail
```

**ENVOIE-MOI** : la sortie complète, en notant **l'heure exacte** (votre téléphone) au moment de la commande.

---

### R1.11 — Échantillon de 10 utilisateurs (table simple)

**OBJECTIF** : format des noms de tickets et des commentaires (convention de génération Mikmon), sans afficher les mots de passe.

**COMMANDE** :

```
/ip hotspot user print limit=10
```

**SI échec de syntaxe** :

```
/ip hotspot user print where disabled=no limit=10
```

**ENVOIE-MOI** : la table (colonnes NAME / PROFILE / COMMENT éventuelle). **MASQUEZ** toute colonne PASSWORD si elle apparaît.

---

### R1.12 — Questions humaines (pas de commande)

1. Le device exempté d'authentification (`192.168.88.200`, binding bypassé) : à qui appartient-il ? (caisse ? téléphone du gérant ? caméra ?) — doit-il rester exempté ?
2. Le SSID s'appelle « DEOGRACIAS WIFI ZONE C » : existe-t-il d'autres zones (A, B) ou d'autres points d'accès ?
3. Le nom `deogracias.bj` (dns-name du portail) : ce domaine est-il enregistré/possédé par vous ? Est-il censé fonctionner sur Internet ou seulement en local ?
4. Confirmez-vous que le poste utilisé pour l'audit (`192.168.88.240`) sera aussi le poste de secours pour les opérations IMP-02/IMP-03 ?

---

## Récapitulatif R1

| N° | Objet | Fait ? |
|---|---|---|
| R1.1 | Liste des profils | ☐ |
| R1.2 | session-timeout / rate-limit par profil ⭐ | ☐ |
| R1.3 | html-directory / dns-name | ☐ |
| R1.4 | 7 schedulers ⭐ (bloquant IMP-05) | ☐ |
| R1.5 | Taille journal des ventes | ☐ |
| R1.6 | Propriétés d'un user actif | ☐ |
| R1.7 | Queue simple | ☐ |
| R1.8 | DHCP client WAN | ☐ |
| R1.9 | Fichiers portail ⭐ (bloquant IMP-04) | ☐ |
| R1.10 | Sessions actives (2e capture) | ☐ |
| R1.11 | Échantillon 10 users | ☐ |
| R1.12 | 4 questions humaines | ☐ |
