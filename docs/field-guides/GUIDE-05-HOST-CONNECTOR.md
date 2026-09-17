# GUIDE-05 — Hôte Connector : fermeture INC-02, provisioning, agent de supervision, test onduleur/coupure

> **Implementation** : IMP-05
> **Durée estimée** : 60–90 min (dont test onduleur) — à faire pendant la fenêtre physique
> **Prérequis** : IMP-03 clos ; IMP-04 quasi clos ; propriétaire sur site ; décision OD-1 à confirmer en étape 1 (si aucune machine achetée/disponible : branche INTÉRIM = votre PC 192.168.88.240, qui reste sur site).
> **Règles** : session WinBox conservée pendant l'étape 0 ; aucune modification du routeur hors étape 0 ; le test de coupure (étape 4) se fait à heure de faible affluence avec votre accord explicite sur le variant choisi.

---

## ÉTAPE 0 — Fermeture INC-02 : tests walled garden PUIS suppression par numéro (10 min)

L'entrée `example.com` est TOUJOURS active (suppression par `find` inefficace). On en profite pour faire enfin les tests humains, puis on supprime **par numéro**.

### 0.1 Tests humains (téléphone Wi-Fi rejoint, NON authentifié au portail)

1. `http://example.com` → notez verbatim ce qui s'affiche (page réelle ? portail ? erreur ?).
2. `https://example.com` → notez verbatim (page réelle ? alerte certificat ? portail ?).
3. `http://bing.com` → attendu : redirection portail captif.
4. Authentifiez-vous avec un ticket valide → navigation libre OK.

### 0.2 Suppression par numéro

```
/ip hotspot walled-garden print
```

(repérez le NUMÉRO `#` de l'entrée example.com — probablement `0`)

```
/ip hotspot walled-garden remove 0
```

(adaptez le numéro si différent)

```
/ip hotspot walled-garden print
```

**ATTENDU** : sortie VIDE. **SI l'entrée survit encore** : WinBox → IP → Hotspot → Walled Garden → clic droit sur la ligne → Remove ; re-vérifiez par print. Ne quittez pas le site avant d'avoir un garden vide.

---

## ÉTAPE 1 — OD-1 : décision finale + inventaire physique (15 min)

### 1.1 Décision (rappel matrice du doc `docs/decisions/OD-1-host-machine.md`)

Confirmez dans le retour : **A** (machine de récupération trouvée sur place : marque/modèle/RAM/disque) / **B** (mini-PC occasion acheté : ticket + specs) / **C** (kit Pi acheté : specs) / **E int érim** (votre PC, en attendant un achat ultérieur).

### 1.2 Inventaire à documenter (photos + notes)

1. **Qu'est-ce qui est branché sur l'onduleur Mercury 650 ?** (routeur ? box ? switch ?) — suivez les câbles, notez.
2. **Switch Mercury** : nombre de ports, nombre de ports LIBRES (photo gros plan P6).
3. **Le second routeur Huawei à antennes** (photo B) : c'est quoi ? (AP de la box ? AP séparé ? éteint/allumé ?) — regardez ses LED et son étiquette modèle.
4. Emplacement retenu pour l'hôte Connector : près onduleur/multiprise (photo A) — photo P5 de l'emplacement exact dégagé.
5. Photos manquantes du GUIDE-04 : **P1 affichages de prix clients**, **P2 vouchers physiques** (vierge + utilisé).

---

## ÉTAPE 2 — Mise en place physique de l'hôte (10 min)

1. Placez la machine à l'emplacement P5 (posé stable, aéré, hors atteinte clients, hors sol si possible).
2. **Alimentation : sur la multiprise murale OU sur l'onduleur** selon ce que vous aurez noté en 1.2.1 — règle : l'hôte Connector doit être sur le MÊME secours que le routeur (sinon le Connector meurt avant lui en coupure). Si l'onduleur n'a plus de prise libre : multiprise → onduleur.
3. Câble Ethernet neuf de l'hôte vers un **port libre du switch Mercury** (pas vers la box, pas vers le routeur directement).
4. Allumez ; vérifiez l'IP obtenue par DHCP dans `192.168.88.1-253` (notez-la ; idéalement fixez-la plus tard via bail statique — IMP-23, pas aujourd'hui).
5. Si mini-PC/PC : BIOS → option **« AC Power Recovery / After Power Loss = ON »** (redémarrage auto au retour du courant). Notez si l'option existe ou pas. Sous Windows int érim : notez « démarrage auto NON garanti » (acceptable en intérim, runbook = la mère démarre le PC chaque matin).

---

## ÉTAPE 3 — Provisioning logiciel minimal (20 min)

Objectif : machine prête à recevoir le Connector (IMP-21/23) : Node 20 + SSH + heartbeat. RIEN d'autre (pas de code applicatif aujourd'hui).

### 3.1 Node.js 20

- **Windows** : installeur MSI LTS 20.x depuis nodejs.org (le PC a Internet). Vérifiez : `node -v` → `v20.x`.
- **Linux (mini-PC)** : `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs` (Debian/Ubuntu) ; vérifiez `node -v`.
- **Pi (arm64)** : idem Linux.

### 3.2 SSH serveur

- **Windows** : Paramètres → Applications → Fonctionnalités facultatives → Ajouter « Serveur OpenSSH » ; puis Services → « OpenSSH SSH Server » → démarrage Automatique + Démarrer. Test : `Test-NetConnection localhost -Port 22` → `TcpTestSucceeded : True`, puis `ssh localhost` (acceptez la clé, connectez-vous avec votre compte).
- **Linux** : `sudo apt-get install -y openssh-server && sudo systemctl enable --now ssh` ; test `ssh localhost`.

### 3.3 Agent heartbeat (journal de vie local, 5 min + au boot)

- **Linux** : créez `/usr/local/bin/dg-heartbeat.sh` :
  ```
  #!/bin/sh
  echo "$(date -u +%FT%TZ) host-up load=$(cat /proc/loadavg | cut -d' ' -f1)" >> /var/log/dg-heartbeat.log
  ```
  `sudo chmod +x /usr/local/bin/dg-heartbeat.sh` ; cron : `sudo crontab -e` → lignes :
  ```
  */5 * * * * /usr/local/bin/dg-heartbeat.sh
  @reboot /usr/local/bin/dg-heartbeat.sh
  ```
- **Windows (int érim)** : Planificateur de tâches → tâche « DG-Heartbeat » : déclencheurs « au démarrage » + « toutes les 5 minutes » ; action : `powershell -Command "Add-Content -Path C:\dg-heartbeat.log -Value ((Get-Date).ToUniversalTime().ToString('o') + ' host-up')"` .

**VÉRIFIER** : attendez 6 min, montrez les dernières lignes du log (`tail /var/log/dg-heartbeat.log` ou `Get-Content C:\dg-heartbeat.log -Tail 3`).

---

## ÉTAPE 4 — Test onduleur / coupure (20–30 min, heure creuse, accord explicite)

**Variant A — preuve batterie, ZÉRO coupure client (recommandé, toujours)** :
1. `/ip hotspot active print count-only` → notez N.
2. Débranchez l'entrée murale de l'onduleur ; chronométrez ; vérifiez que routeur+box+switch restent alimentés (LED).
3. À **10 minutes** (ou avant si l'onduleur faiblit : bip/LED) : rebranchez. Notez : autonomie observée, état des LED pendant, N' après test (clients non coupés).
4. `/system clock print` vs téléphone (NTP doit rester juste) ; `/ip hotspot active print count-only` comparé à N.

**Variant B — coupure totale et récupération (UNIQUEMENT à la fermeture, avec votre OK)** :
1. Débranchez l'onduleur ET attendez l'épuisement batterie (routeur s'éteint) ; notez l'autonomie totale.
2. Rebranchez ; chronométrez la séquence : box UP → routeur UP (LED) → hotspot joignable (téléphone : portail s'affiche) → horloge juste (`/system clock print` vs téléphone, attendu < 3 min grâce au NTP) → hôte Connector redémarre SEUL (BIOS AC-recovery) ou notez « manuel » → `node -v`/ssh/heartbeat de nouveau OK.
3. Notez chaque horodatage.

**ENVOIE-MOI** : variant exécuté + tous les chronométrages + N/N' + toute anomalie (ex. horloge fausse après retour = ALERTE, le NTP devait corriger).

---

## ÉTAPE 5 — Retour final (message unique)

1. Étape 0 : verbatims des 4 tests WG + print final VIDE.
2. OD-1 : décision (A/B/C/E) + specs machine (CPU/RAM/disque/OS) + photo ticket si achat.
3. Inventaire 1.2 : branchement onduleur, ports switch libres, identité du second Huawei, photos P5/P6/P1/P2.
4. Étape 2 : IP DHCP de l'hôte + présence/absence option AC-recovery.
5. Étape 3 : `node -v`, résultat test SSH, extrait heartbeat (3 lignes).
6. Étape 4 : variant + chronométrages + N/N'.
7. Heure de fin + anomalies.

---

## RETOUR ARRIÈRE / LIMITES

- Étape 0 : si garden impossible à vider → me contacter AVANT de quitter le site (WinBox GUI en dernier recours).
- Int érim E : limitations assumées (pas de 24/7 garanti, pas d'AC-recovery) ; le swap vers la machine définitive se fera à son arrivée via un mini-guide dédié (impacts : IP, heartbeat, ssh — 30 min).
- Aucun retour arrière nécessaire pour 2/3/4 (provisioning additif) ; en cas de machine défectueuse : retour case achat (B/C) ou int érim E.
