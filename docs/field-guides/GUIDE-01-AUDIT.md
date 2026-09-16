# GUIDE-01 — Audit MikroTik READ-ONLY (fenêtre physique)

> **Implementation** : IMP-01
> **Équipement cible** : RB951Ui-2HnD — RouterOS 6.49.17 — `192.168.88.254` (LAN)
> **Durée estimée** : 45 à 60 minutes
> **Risque** : NUL si les règles ci-dessous sont respectées (aucune écriture, aucune commande destructive)
> **Objectif** : clôturer P1 (RADIUS), P2 (profil 4 000 F), P4 (profils / shared-users), P5 (fichiers portail), caractériser le mécanisme d'expiration des tickets, documenter la convention de commentaire `mikhmon`, et préparer le durcissement (IMP-03) et le stock numérique (IMP-06).

---

## 0. RÈGLES ABSOLUES (à lire avant de commencer)

1. **Aucune modification.** N'exécutez QUE les commandes listées dans ce guide. Toutes sont read-only (`print`, `find`, `count-only`).
2. **Pas de redémarrage**, pas de déconnexion des clients, pas de suppression, pas de renommage.
3. **Si une commande renvoie une erreur** (`unknown command`, `no such item`…) : copiez l'erreur telle quelle, notez le numéro de la commande (ex. `D3`), et passez à la suivante. Ne cherchez pas à « corriger » la commande vous-même.
4. **Si une commande demande une confirmation** (`[y/N]`, `dangerous!`…) : répondez **N** ou faites `Ctrl+C`, notez-le, passez à la suite.
5. **Masquage obligatoire** avant envoi : tout ce qui ressemble à un mot de passe, une clé Wi-Fi, un secret RADIUS, un token → remplacez la valeur par `[MASQUE]`. Ne m'envoyez JAMAIS de mot de passe en clair.
6. Utilisez **un seul terminal** WinBox (ou SSH) dédié à l'audit. Ne touchez pas aux fenêtres de configuration.
7. L'audit peut être fait **pendant que des clients sont connectés** — aucune commande ne les affecte.

### Comment me renvoyer les résultats

- Dans WinBox : menu latéral → **New Terminal** (ou SSH sur `192.168.88.254`).
- Après chaque commande, sélectionnez la sortie dans le terminal (clic + glisser), `Ctrl+C`, collez dans un fichier texte.
- **Étiquetez chaque sortie avec son numéro** : `A1`, `A2`, `B1`… comme dans ce guide.
- Un seul gros fichier texte (ou plusieurs messages) me suffit. Les sorties longues sont normales : envoyez-les en entier.
- Astuce RouterOS : dans le terminal WinBox, la sortie défile ; si une sortie est très longue, préférez `Ctrl+A` puis copie depuis le menu, ou exécutez la commande depuis **SSH** (la sélection y est plus simple).

---

## SECTION A — Identité, version, ressources, horloge

### A1 — Identité du routeur

**OBJECTIF** : confirmer l'identité exacte de l'équipement audité.

**COMMANDE** :

```
/system identity print
```

**OBSERVER** : le nom du routeur.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** : doit correspondre au routeur Déo Gracias. Toute autre identité = erreur de cible, arrêtez l'audit.

### A2 — Version et ressources

**OBJECTIF** : confirmer RouterOS 6.49.17, l'architecture, la mémoire et l'uptime — contraint le choix des outils du Connector (IMP-21).

**COMMANDE** :

```
/system resource print
```

**OBSERVER** : `version`, `free-memory`, `total-memory`, `cpu-load`, `uptime`, `board-name`, `architecture-name`.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** :
- Version ≠ 6.49.17 → me le signaler immédiatement (la doc serait fausse, impact sur tout le plan).
- `free-memory` très bas (< 20 Mo) → le routeur est sous tension mémoire ; à noter pour IMP-05.

### A3 — Paquets installés (dont RADIUS)

**OBJECTIF** : savoir si le paquet `user-manager`, `security`, etc. sont installés — éclaire P1.

**COMMANDE** :

```
/system package print
```

**OBSERVER** : liste des paquets et leurs versions ; présence de `user-manager`, `ntp`, `security`, `advanced-tools`.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** :
- **SI `user-manager` est présent et enabled** → une piste RADIUS locale existe ; la section I devient prioritaire.
- **SI absent** → le RADIUS (s'il existe) pointe vers un serveur externe ou n'existe pas.

### A4 — Horloge et fuseau (CRITIQUE pour l'expiration)

**OBJECTIF** : le mécanisme d'expiration (schedulers, dates dans les commentaires mikhmon) dépend de l'heure du routeur. Une horloge fausse = expirations fausses.

**COMMANDE** :

```
/system clock print
```

**OBSERVER** : `time`, `date`, `time-zone-name`, `gmt-offset`.

**ENVOIE-MOI** : la sortie complète **+ l'heure réelle à laquelle vous l'exécutez** (votre téléphone suffit).

**INTERPRÉTATION** :
- **SI date/heure correctes** → les dates d'expiration des tickets sont fiables.
- **SI horloge décalée** → ALERTE : tous les calculs d'expiration actuels sont faux ; à corriger en IMP-03 (avec sauvegarde préalable IMP-02), et l'analyse des commentaires mikhmon devra en tenir compte.

### A5 — SNTP (optionnel)

**OBJECTIF** : savoir si l'heure est synchronisée automatiquement.

**COMMANDE** :

```
/system ntp client print
```

**OBSERVER** : `mode`, `primary-ntp`, `status`.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** : **SI la commande n'existe pas** (erreur) → indiquez « A5 : commande inconnue », c'est normal sur certaines versions ; l'heure dépend alors d'une pile interne non synchronisée (voir A4).

---

## SECTION B — Interfaces et Wi-Fi

### B1 — Interfaces

**OBJECTIF** : confirmer la topologie physique (ether1 WAN, pont LAN, hotspot1 sur le Wi-Fi).

**COMMANDE** :

```
/interface print
```

**OBSERVER** : noms, types, état (`R` running), commentaires. Repérez l'interface nommée `DEOGRACIAS` (utilisée par le mangle) et les `wlan`.

**ENVOIE-MOI** : la sortie complète.

### B2 — Détail Wi-Fi (MASQUER la clé)

**OBJECTIF** : confirmer SSID, canal, sécurité — nécessaire pour les tests captifs ultérieurs (IMP-04, IMP-38).

**COMMANDES** :

```
/interface wireless print
```

```
/interface wireless security-profiles print
```

**OBSERVER** : `ssid`, `band`, `channel`, `mode`, `security-profile` ; dans les profils de sécurité : `mode` (dynamic keys ?), `wpa2-psk` présent ?

**ENVOIE-MOI** : les deux sorties, avec **toute clé/PSK remplacée par `[MASQUE]`**.

**INTERPRÉTATION** :
- **SI SSID ≠ celui attendu** → me le signaler (un second AP ou une box opérateur pourrait diffuser).

---

## SECTION C — Adressage, routage, DNS, DHCP, pools

### C1 — Adresses IP

**COMMANDE** :

```
/ip address print
```

**OBSERVER** : `192.168.88.254/24` (LAN) et `192.168.100.7/24` (WAN) attendus ; interfaces associées ; réseaux supplémentaires éventuels.

**ENVOIE-MOI** : la sortie complète.

### C2 — Routes

**COMMANDE** :

```
/ip route print
```

**OBSERVER** : route par défaut `0.0.0.0/0 → 192.168.100.1` ; distance ; routes statiques éventuelles.

**ENVOIE-MOI** : la sortie complète.

### C3 — DNS

**COMMANDE** :

```
/ip dns print
```

**OBSERVER** : `servers`, `allow-remote-requests`, `cache-size`. Le redirect DNS du portail captif en dépend.

**ENVOIE-MOI** : la sortie complète.

### C4 — Pools d'adresses

**OBJECTIF** : cartographier les pools (hotspot, DHCP) — nécessaire au schéma de base de données et au Connector.

**COMMANDE** :

```
/ip pool print
```

**OBSERVER** : noms (attendu : `hs-pool-*`), plages, `next-pool`.

**ENVOIE-MOI** : la sortie complète.

### C5 — Serveur DHCP et baux

**COMMANDES** :

```
/ip dhcp-server print
```

```
/ip dhcp-server lease print
```

**OBSERVER** : serveur(s) DHCP actif(s), interface, pool associé ; baux statiques éventuels (équipements fixes).

**ENVOIE-MOI** : les deux sorties complètes.

---

## SECTION D — HotSpot : serveur, état, walled garden

### D1 — Serveur HotSpot

**OBJECTIF** : configuration exacte du serveur hotspot1.

**COMMANDE** :

```
/ip hotspot print detail
```

**OBSERVER** : `name` (hotspot1), `interface`, `address-pool`, `profile`, `disabled`, `idle-timeout`, `keepalive-timeout`, `login-timeout`, addresses.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** : `login-timeout` et `idle-timeout` participent au comportement d'expiration des sessions (distinct de la durée commerciale du ticket).

### D2 — Profil serveur HotSpot

**OBJECTIF** : le `hotspot profile` contient le `html-directory` (→ P5) et le `rate-limit` par défaut.

**COMMANDE** :

```
/ip hotspot profile print detail
```

**OBSERVER** : `name`, `html-directory` (attendu : `hotspot`), `rate-limit`, `login-by`, `use-radius`.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** :
- **SI `use-radius=yes`** → P1 confirmé côté HotSpot ; la section I devient critique.
- **SI `use-radius=no`** → le RADIUS n'est pas utilisé par le hotspot ; P1 probablement clos en « non utilisé ».

### D3 — Walled Garden (P5 / préparation IMP-04 et IMP-38)

**OBJECTIF** : confirmer que le walled garden est VIDE (état documenté) avant tout ajout futur.

**COMMANDES** :

```
/ip hotspot walled-garden print
```

```
/ip hotspot walled-garden ip print
```

**OBSERVER** : entrées éventuelles (attendu : aucune).

**ENVOIE-MOI** : les deux sorties (même vides — envoyez la ligne d'en-tête ou « vide »).

**INTERPRÉTATION** :
- **SI des entrées existent** → divergence avec la doc 07 §31 ; listez-les précisément, elles conditionnent ce qui est accessible sans authentification.

### D4 — Sessions actives

**OBJECTIF** : voir la forme réelle des données de session que le Connector exploitera (doc 07 §27).

**COMMANDE** :

```
/ip hotspot active print detail
```

**OBSERVER** : `user`, `address`, `mac-address`, `uptime`, `session-timeout`, `idle-timeout`, `login-by`, `radius`.

**ENVOIE-MOI** : la sortie complète. **SI plus de 20 sessions** : envoyez `detail` pour les 5 premières + `/ip hotspot active print count-only`.

### D5 — Hosts HotSpot (volume seulement)

**OBJECTIF** : dimensionner la table des hosts sans aspirer des milliers de lignes.

**COMMANDES** :

```
/ip hotspot host print count-only
```

```
/ip hotspot host print limit=10
```

**ENVOIE-MOI** : le nombre total + l'échantillon de 10.

### D6 — IP bindings (exemptions éventuelles)

**OBJECTIF** : détecter des machines exemptées d'authentification (bypass, `to-address`).

**COMMANDE** :

```
/ip hotspot ip-binding print
```

**ENVOIE-MOI** : la sortie complète (ou « vide »).

**INTERPRÉTATION** : **SI des bindings existent** → chaque binding est une exception de sécurité à documenter (impact IMP-35).

---

## SECTION E — Profils utilisateurs HotSpot (P2 + P4 — CŒUR DE L'AUDIT)

### E1 — Liste complète détaillée des profils

**OBJECTIF** : P4 — vérifier TOUS les paramètres de TOUS les profils avant toute automatisation d'écriture ; P2 — identifier le profil 4 000 F (1 mois).

**COMMANDE** :

```
/ip hotspot user profile print detail
```

**OBSERVER** pour CHAQUE profil : `name`, `idle-timeout`, `keepalive-timeout`, `status-autorefresh`, `shared-users`, `rate-limit` (rx/tx, burst), `session-timeout`, `on-login`, `on-logout`, `address-list`, `incoming-filter`, `outgoing-filter`, `advertised`, `open-status-chat`, `mac-cookie-timeout`, `transparent-proxy`.

**ENVOIE-MOI** : la sortie complète, sans coupure. C'est la sortie la plus importante de l'audit.

**INTERPRÉTATION** :
- Profils commerciaux attendus : `1-HEURES` (50 F), `5-HEURES` (100 F), `12-HEURES` (200 F), `24-HEURES` (300 F), `72-HEURES` (500 F), `1-SEMAINE` (1 000 F), + le profil 4 000 F à identifier (P2, probablement `1-MOIS`), + `Admin-free`, `default`.
- **`session-timeout`** : c'est le candidat n°1 du mécanisme d'expiration commerciale (durée d'accès). Comparez-le à la Grille A : 5 h / 12 h / 24 h / 72 h / 1 sem / 1 mois.
- **`shared-users`** : nombre de connexions simultanées autorisées par ticket. Valeur critique pour le produit (un ticket partagé = manque à gagner).
- **`rate-limit`** : le bridage réel par offre — alimentera la page offres du futur site (IMP-26) et la Grille A officielle.
- **`on-login`** : si un script est référencé ici, c'est LE mécanisme d'expiration à caractériser (section H).

### E2 — Vérification ciblée du profil 4 000 F (P2)

**OBJECTIF** : confirmer le nom exact du profil mensuel.

**COMMANDE** :

```
/ip hotspot user profile print where name~"MOIS"
```

**OBSERVER** : existence et nom exact (`1-MOIS` ? `30-JOURS` ? autre ?).

**ENVOIE-MOI** : la sortie (ou « aucune correspondance »).

**SI la commande `where` est refusée** : utilisez `/ip hotspot user profile print` et recopiez-moi simplement la liste des noms.

**INTERPRÉTATION** : le nom retenu deviendra la référence de l'offre 4 000 F dans la base de données (IMP-11) et le stock (IMP-06).

---

## SECTION F — Utilisateurs HotSpot (tickets) : volume, échantillons, convention mikhmon

> La table des utilisateurs peut contenir des centaines de lignes. On mesure d'abord, on échantillonne ensuite.

### F1 — Volume total

**COMMANDES** :

```
/ip hotspot user print count-only
```

```
/ip hotspot user print count-only where disabled=yes
```

**ENVOIE-MOI** : les deux nombres.

**INTERPRÉTATION** : donne l'ordre de grandeur du stock historique et la proportion de tickets désactivés (expirés/consommés ?).

### F2 — Volume par profil commercial

**OBJECTIF** : répartition du stock existant par offre — référence directe pour IMP-06 (quantités à générer) et IMP-11 (seeds).

**COMMANDES** (une par profil ; adaptez les noms à ceux trouvés en E1) :

```
/ip hotspot user print count-only where profile="1-HEURES"
```

```
/ip hotspot user print count-only where profile="5-HEURES"
```

```
/ip hotspot user print count-only where profile="12-HEURES"
```

```
/ip hotspot user print count-only where profile="24-HEURES"
```

```
/ip hotspot user print count-only where profile="72-HEURES"
```

```
/ip hotspot user print count-only where profile="1-SEMAINE"
```

```
/ip hotspot user print count-only where profile="1-MOIS"
```

**ENVOIE-MOI** : les 7 nombres (indiquez « commande refusée » si `where` ne passe pas ; dans ce cas, faites `/ip hotspot user print` et envoyez la sortie entière).

### F3 — Échantillon détaillé (convention de nommage + commentaires)

**OBJECTIF** : caractériser la forme des noms d'utilisateurs (codes tickets) et la convention de commentaire écrite par le script On-Login (doc 07 §24-26).

**COMMANDES** :

```
/ip hotspot user print detail limit=10
```

```
/ip hotspot user print detail where comment~"mikhmon" limit=5
```

**OBSERVER** : structure du `name` (longueur, préfixe, chiffres ?), `password` (affiché masqué normalement), `profile`, `limit-uptime`, `limit-bytes-in/out`, `comment`, `disabled`, `last-logged-out`.

**ENVOIE-MOI** : les sorties complètes. **MASQUEZ** les champs `password` s'ils apparaissent en clair.

**INTERPRÉTATION** :
- **SI `limit-uptime` est renseigné** → c'est peut-être LUI le mécanisme d'expiration (et non le scheduler). Regardez la section H avec cet indice.
- Le format du `comment` révèle la date d'expiration calculée par le script → c'est la « mémoire » du ticket côté routeur. Sa structure exacte conditionne la réconciliation Connector (IMP-24).
- La convention de nommage conditionne le format des codes de la future plateforme (IMP-19) : on doit pouvoir distinguer un ticket digital d'un ticket Mikmon.

### F4 — Utilisateurs en `limit-uptime` : distribution (optionnel mais utile)

**COMMANDE** :

```
/ip hotspot user print where limit-uptime!="0s" limit=10
```

**ENVOIE-MOI** : la sortie (ou « vide » / « commande refusée »).

---

## SECTION G — Fichiers du routeur et fichiers portail (P5)

### G1 — Inventaire des fichiers

**OBJECTIF** : P5 — localiser les fichiers HTML personnalisés du HotSpot.

**COMMANDE** :

```
/file print
```

**OBSERVER** : dossiers (`hotspot`, `skins`…), fichiers `.html`, `.jpg`, `.rsc`, tailles, dates de création.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** :
- Le dossier pointé par `html-directory` (D2) doit apparaître ici.
- **SI un fichier `.rsc` inattendu existe** (hors scripts système) → notez-le : ce pourrait être un script de démarrage personnalisé.

### G2 — Contenu du dossier portail

**COMMANDE** (remplacez `hotspot` par la valeur exacte trouvée en D2/G1) :

```
/file print where name~"hotspot"
```

**ENVOIE-MOI** : la sortie complète.

### G3 — Récupération des fichiers HTML (depuis WinBox, sans commande)

**OBJECTIF** : disposer des fichiers réels du portail pour IMP-04 (fichiers portail) et IMP-28 (page captive).

**PROCÉDURE** (lecture seule — un simple téléchargement ne modifie rien) :

1. WinBox → menu **Files**.
2. Ouvrez le dossier `hotspot` (ou celui trouvé en D2).
3. Glissez-déposez sur votre bureau : `login.html`, `alogin.html`, `status.html`, `logout.html`, `error.html`, `rlogin.html` (ceux qui existent), ainsi que le fichier de style (`.css`) et la feuille de config éventuelle.
4. Envoyez-moi ces fichiers (ou copiez-collez leur contenu texte dans un fichier `.txt`).

**SI le dossier contient un sous-dossier `images`** : envoyez seulement la liste des noms (pas les images).

**INTERPRÉTATION** : je comparerai le portail réel aux maquettes de la doc 08 ; l'écart déterminera ce qui est réutilisable tel quel en IMP-04.

### G4 — Script de démarrage automatique (le cas échéant)

**COMMANDE** :

```
/system script print where owner="system"
```

```
/system scheduler print where start-date=jan/01/1970
```

**ENVOIE-MOI** : les sorties (ou « vide »).

**INTERPRÉTATION** : détecte un script lancé au boot (pattern Mikmon courant). **SI présent** → son contenu doit être examiné avant tout redémarrage du routeur (IMP-05 : test de coupure de courant !).

---

## SECTION H — Mécanisme d'expiration des tickets (CŒUR DE L'AUDIT)

### H1 — Scripts système : inventaire

**COMMANDE** :

```
/system script print
```

**OBSERVER** : noms, `owner`, `last-started`, `run-count`, policies. Repérez le script On-Login (et les entrées créées par lui avec `comment = mikhmon`).

**ENVOIE-MOI** : la sortie complète. **SI la liste dépasse ~50 lignes** : envoyez les 30 premières + le nombre total (`/system script print count-only`).

### H2 — Source du script On-Login

**OBJECTIF** : comprendre EXACTEMENT comment la durée du ticket est appliquée (session-timeout ? scheduler temporaire ? limit-uptime ?).

**COMMANDE** :

```
/system script print detail where name~"login"
```

**SI aucun résultat** : reprenez les noms vus en H1 et affichez simplement tous les scripts en détail :

```
/system script print detail
```

et envoyez-moi l'ensemble (ou les scripts dont le nom/commentaire évoque login, mikhmon, expire).

> ⚠️ N'utilisez **jamais** `/system script export` : cette commande écrit un fichier sur le routeur. L'audit est 100 % `print`.

**ENVOIE-MOI** : le code source complet des scripts concernés.

**INTERPRÉTATION** : je reconstruirai le cycle de vie exact du ticket (login → commentaire → scheduler → expiration → déconnexion). C'est LA donnée fondatrice de IMP-18 (batches/stock) et IMP-24 (réconciliation).

### H3 — Variables d'environnement des scripts

**COMMANDE** :

```
/system script environment print
```

**ENVOIE-MOI** : la sortie complète (ou « vide »).

### H4 — Schedulers actifs

**OBJECTIF** : voir les schedulers temporaires créés par le script On-Login (doc 07 §25.5) et tout scheduler permanent (sauvegardes, reboots…).

**COMMANDES** :

```
/system scheduler print count-only
```

```
/system scheduler print detail limit=30
```

**OBSERVER** : `name`, `start-time`, `interval`, `on-event` (extrait), `policy`, `next-run`.

**ENVOIE-MOI** : le nombre total + l'échantillon détaillé.

**INTERPRÉTATION** :
- **SI des schedulers au nom de ticket/utilisateur existent** → confirmation du mécanisme « expiration par scheduler temporaire ». Leur volume doit rester maîtrisé (128 Mo de RAM).
- **SI un scheduler de reboot périodique existe** → ALERTE : à documenter absolument avant IMP-05 (coupure de courant) et avant tout déploiement du Connector.

### H5 — Preuve terrain du mécanisme (observation, pas de test actif)

**OBJECTIF** : recouper le mécanisme supposé avec un cas réel.

**PROCÉDURE** : prenez UN utilisateur actuellement connecté (vu en D4) et affichez sa fiche :

```
/ip hotspot user print detail where name="LE_NOM_VU_EN_D4"
```

(remplacez `LE_NOM_VU_EN_D4` par un nom réel de session active ; mettez-le entre guillemets)

**ENVOIE-MOI** : la sortie (mot de passe masqué).

**INTERPRÉTATION** : croiser `limit-uptime`, `profile` (→ session-timeout vu en E1) et commentaire mikhmon nous dira lequel des trois gouverne réellement l'expiration.

---

## SECTION I — RADIUS (P1)

### I1 — Configuration RADIUS

**COMMANDE** :

```
/radius print detail
```

**OBSERVER** : entrées éventuelles : `service` (hotspot ?), `address`, `secret`, `timeout`.

**ENVOIE-MOI** : la sortie complète avec **`secret` remplacé par `[MASQUE]`** — ou « vide » s'il n'y a aucune entrée.

### I2 — AAA local

**COMMANDE** :

```
/user aaa print
```

**OBSERVER** : `use-radius` (yes/no), `default-group`, `accounting`, `interim-update`.

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** :
- **SI `/radius` vide ET `use-radius=no` ET D2 `use-radius=no`** → P1 CLOS : « aucun RADIUS en service, authentification 100 % locale ».
- **SI un serveur RADIUS est configuré** → P1 reste ouvert : adresse et service concernés à documenter ; le Connector devra en tenir compte (IMP-21).

---

## SECTION J — Comptes, groupes et services (préparation IMP-03 durcissement + P6)

### J1 — Utilisateurs du routeur

**COMMANDE** :

```
/user print
```

**OBSERVER** : comptes (`admin` + autres ?), `group`, `last-logged-in`, `address` (restriction IP éventuelle).

**ENVOIE-MOI** : la sortie complète (les mots de passe ne s'affichent normalement pas en v6 ; **SI** une valeur sensible apparaît → `[MASQUE]`).

### J2 — Groupes et politiques

**COMMANDE** :

```
/user group print detail
```

**OBSERVER** : groupes existants et leurs `policy` — prépare la création du compte `dg-connector` avec les permissions minimales (P6, IMP-03).

**ENVOIE-MOI** : la sortie complète.

### J3 — Sessions utilisateur actives

**COMMANDE** :

```
/user active print
```

**ENVOIE-MOI** : la sortie complète.

### J4 — Services réseau exposés

**OBJECTIF** : état exact avant durcissement (IMP-03). Doc 07 §36 indique telnet/ftp/www présents.

**COMMANDE** :

```
/ip service print
```

**OBSERVER** : pour chaque service : `port`, `address` (restriction ?), enabled/disabled (préfixe `X` ou `I` dans la liste).

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** : chaque service non restreint (`address` vide) et activé est une surface d'attaque à fermer en IMP-03 — mais UNIQUEMENT après les sauvegardes IMP-02.

### J5 — Journalisation

**COMMANDE** :

```
/system logging print
```

**ENVOIE-MOI** : la sortie complète.

---

## SECTION K — Pare-feu : filter, NAT, mangle

### K1 — Mangle (vérification de la règle change-ttl)

**OBJECTIF** : confirmer que la règle documentée (doc 07 §34) est intacte : postrouting, change-ttl, new-ttl=1, out-interface=DEOGRACIAS, passthrough=no.

**COMMANDE** :

```
/ip firewall mangle print detail
```

**ENVOIE-MOI** : la sortie complète.

**INTERPRÉTATION** :
- **SI la règle est absente ou différente** → ALERTE : le partage de connexion par les clients pourrait être possible/limité différemment ; impact produit immédiat à documenter.

### K2 — NAT

**COMMANDE** :

```
/ip firewall nat print
```

**OBSERVER** : chaînes hotspot (`hs-unauth`, `hs-auth`, redirects DNS/HTTP/HTTPS), masquerade. Les règles dynamiques (`D`) sont normales.

**ENVOIE-MOI** : la sortie complète. **SI plus de 60 lignes** : `/ip firewall nat print count-only` + les règles NON dynamiques seulement (`/ip firewall nat print where !dynamic`).

### K3 — Filter

**COMMANDE** :

```
/ip firewall filter print
```

**ENVOIE-MOI** : idem K2 (count-only + non dynamiques si très long).

---

## SECTION L — Files d'attente (QoS) et divers

### L1 — Queues simples

**OBJECTIF** : Mikmon/Mikhmon crée parfois une queue par utilisateur ; un volume important alourdit le routeur.

**COMMANDES** :

```
/queue simple print count-only
```

```
/queue simple print limit=10
```

```
/queue tree print
```

**ENVOIE-MOI** : les sorties (ou « vide »).

### L2 — ARP / voisinage (optionnel)

**COMMANDE** :

```
/ip arp print count-only
```

**ENVOIE-MOI** : le nombre.

---

## SECTION M — Récapitulatif à me renvoyer

Avant de quitter le site, vérifiez que vous avez bien :

| N° | Donnée | Fait ? |
|---|---|---|
| A1–A5 | Identité, version, paquets, horloge, SNTP | ☐ |
| B1–B2 | Interfaces, Wi-Fi (clé masquée) | ☐ |
| C1–C5 | IP, routes, DNS, pools, DHCP | ☐ |
| D1–D6 | Hotspot serveur, profil, walled garden, sessions, hosts, bindings | ☐ |
| E1–E2 | **Profils détaillés (P4) + profil 4 000 F (P2)** | ☐ |
| F1–F4 | Volumes tickets, répartition par profil, échantillons, commentaires mikhmon | ☐ |
| G1–G4 | **Fichiers portail (P5)** + fichiers HTML téléchargés | ☐ |
| H1–H5 | **Mécanisme d'expiration** (scripts, schedulers, cas réel) | ☐ |
| I1–I2 | **RADIUS (P1)** | ☐ |
| J1–J5 | Comptes, groupes, services, logs | ☐ |
| K1–K3 | Mangle change-ttl, NAT, filter | ☐ |
| L1–L2 | Queues, ARP | ☐ |

**Priorité absolue si le temps manque** : E1 → H1/H2/H4 → G1/G3 → D2/D3 → I1 → F1/F2 → A2/A4 → le reste.

---

## SECTION N — Ce que je ferai de vos retours

1. Interprétation complète point par point (P1–P6, expiration, conventions).
2. Consignation masquée dans `docs/infrastructure/evidence/` (créé à ce moment-là).
3. Mise à jour du statut des points P1, P2, P4, P5 dans le tableau de suivi maître.
4. Rapport fichier-par-fichier + checklist + commandes Git exactes.
5. Alimentation directe de : IMP-02 (ce qu'il faut sauvegarder en priorité), IMP-03 (durcissement + compte `dg-connector`), IMP-04 (portail + Grille A), IMP-06 (stock : quantités observées en F2), IMP-11 (schéma DB : profils réels), IMP-18 (batches : convention mikhmon).

## SECTION O — Rappel : rien d'autre sur le routeur

- Ne changez rien « au passage », même minime.
- Ne débranchez rien.
- Si vous observez une anomalie (LED, coupure, comportement bizarre d'un client) : notez l'heure exacte et le symptôme, et dites-le-moi — n'intervenez pas.
- La prochaine étape sur le routeur est **IMP-02 (sauvegardes complètes)** — c'est elle qui autorisera ensuite toute écriture.
