# GUIDE-02 — Sauvegardes complètes du routeur (fenêtre physique)

> **Implementation** : IMP-02
> **Équipement** : RB951Ui-2HnD — RouterOS 6.49.17 — `192.168.88.254`
> **Durée estimée** : 30–40 minutes
> **Prérequis** : IMP-01 clos (audit lu et interprété) ; poste de secours `192.168.88.240` disponible ; une clé USB vide ; un accès cloud (Drive/Dropbox) ; **un mot de passe de sauvegarde choisi à l'avance** (12+ caractères, noté sur papier ou gestionnaire de mots de passe — JAMAIS dans un fichier du PC ni dans le dépôt Git).
> **Objectif** : produire un jeu de sauvegardes vérifié, en 3 copies, autorisant toute opération d'écriture future (IMP-03 et suivantes) et la restauration complète du routeur.
> **Écritures AUTORISÉES par ce guide** : création des fichiers `dg-*` de sauvegarde sur le routeur (étape 1), leur suppression après vérification (étape 6). **RIEN D'AUTRE** : aucune modification de configuration, aucun reboot.

---

## 0. RÈGLES ABSOLUES

1. N'exécutez QUE les commandes listées. Toute commande non listée = interdite.
2. Si une commande échoue : copiez l'erreur, notez la référence (ex. `1.3`), passez à la suivante — sauf aux étapes 1.1/1.2 où un échec = **STOP et m'avertir** (pas de sauvegarde = pas d'écriture future).
3. Les fichiers `dg-users-*` et `dg-sales-*` contiennent des **mots de passe de tickets en clair** : ce sont des secrets. Ils ne doivent JAMAIS être collés dans le chat, envoyés par mail non chiffré, ni commités dans Git. Ils vivent sur le PC + USB + cloud, point final.
4. Le mot de passe de la sauvegarde binaire (.backup) est **critique** : sans lui, pas de restauration. Le conserver hors ligne.
5. Pendant toute l'opération, le routeur continue de servir les clients : les commandes de sauvegarde ne coupent personne.

---

## ÉTAPE 0 — Préparation du poste (5 min, aucun risque)

1. Créez sur le bureau le dossier `DG-BACKUP-2026-09-16`.
2. Dedans, créez le sous-dossier `portail-hotspot-DEOGRACIAS` et copiez-y les 16 fichiers portail déjà téléchargés (ceux envoyés pour l'audit) — double protection.
3. Insérez la clé USB ; vérifiez qu'elle apparaît dans l'explorateur.
4. Ouvrez WinBox, connectez-vous en `admin@192.168.88.254`, ouvrez **New Terminal**.
5. Notez l'heure réelle de début (téléphone).

---

## ÉTAPE 1 — Création des artefacts de sauvegarde SUR le routeur (écritures autorisées)

### 1.1 — Sauvegarde binaire complète (chiffrée par mot de passe)

**OBJECTIF** : point de restauration intégral (config + utilisateurs + scripts + schedulers + fichiers), restorable via WinBox → System → Restore.

**COMMANDE** (remplacez `VOTRE_MOT_DE_PASSE` — sans espaces) :

```
/system backup save name=dg-full-2026-09-16 password=VOTRE_MOT_DE_PASSE
```

**OBSERVER** : retour sans erreur ; le fichier `dg-full-2026-09-16.backup` apparaît dans WinBox → Files.

**SI erreur de syntaxe sur `password=`** : exécutez `/system backup save name=dg-full-2026-09-16` (sans mot de passe) et traitez le fichier comme **secret absolu** (il contiendra tout, non chiffré) — notez « 1.1 sans password » dans votre retour.

**SI échec total** : **STOP**, envoyez-moi l'erreur. Ne continuez pas.

### 1.2 — Export texte de la configuration

**OBJECTIF** : version lisible et diffable de toute la config (profils, On-Login, moniteurs, firewall…) — référence pour IMP-03/IMP-08 et comparaison future.

**COMMANDE** :

```
/export file=dg-export-2026-09-16.rsc
```

**OBSERVER** : fichier `dg-export-2026-09-16.rsc` dans Files. **SI échec** : STOP et m'avertir.

### 1.3 — Dump des utilisateurs hotspot (tickets vivants)

**OBJECTIF** : photographie des ~4 155 tickets non expirés (codes, profils, commentaires/expiration, limit-uptime) — servira à la migration du stock vivant (IMP-18) et à la réconciliation (IMP-24). **Contient les mots de passe des tickets → secret.**

**COMMANDE** :

```
/ip hotspot user print detail file=dg-users-2026-09-16.txt
```

**OBSERVER** : fichier créé ; taille attendue ~0,8–1,5 Mo.

### 1.4 — Dump du journal des ventes mikhmon

**OBJECTIF** : les 7 852 entrées `/system script` (historique des ventes depuis sep/2025) — source de l'historique commercial et de la réconciliation. **Contient MAC/IP des clients → sensible.**

**COMMANDE** :

```
/system script print detail file=dg-sales-2026-09-16.txt
```

### 1.5 — Dump des schedulers (moniteurs d'expiration)

**COMMANDE** :

```
/system scheduler print detail file=dg-sched-2026-09-16.txt
```

### 1.6 — Dump des profils hotspot (On-Login inclus)

**COMMANDE** :

```
/ip hotspot user profile print detail file=dg-profiles-2026-09-16.txt
```

### 1.7 — Inventaire des fichiers du routeur

**COMMANDE** :

```
/file print file=dg-filelist-2026-09-16.txt
```

**ENVOIE-MOI (étape 1)** : rien pour l'instant — juste la confirmation que les 7 fichiers `dg-*` existent dans WinBox → Files (copie d'écran facultative).

---

## ÉTAPE 2 — Téléchargement sur le poste (10 min)

1. WinBox → **Files**.
2. Glissez-déposez sur le bureau, dans `DG-BACKUP-2026-09-16`, les 7 fichiers :
   `dg-full-2026-09-16.backup`, `dg-export-2026-09-16.rsc`, `dg-users-2026-09-16.txt`, `dg-sales-2026-09-16.txt`, `dg-sched-2026-09-16.txt`, `dg-profiles-2026-09-16.txt`, `dg-filelist-2026-09-16.txt`.
3. Vérifiez dans l'explorateur que les 7 fichiers sont présents et de taille > 0. Notez les tailles exactes (clic droit → propriétés).
4. Ouvrez `dg-export-2026-09-16.rsc` avec le Bloc-notes : la 1re ligne doit ressembler à `# sep/16/2026 16:xx:xx by RouterOS 6.49.17`. **SI le fichier est vide ou illisible** : STOP et m'avertir.
5. Ouvrez `dg-users-2026-09-16.txt` : comptez approximativement (Barre d'état du Bloc-notes ou PowerShell `(Get-Content dg-users-2026-09-16.txt).Count`) → attendu ~4 000–9 000 lignes. Notez le nombre.

---

## ÉTAPE 3 — Compléter le portail (5 min)

1. Dans WinBox → Files, ouvrez le dossier **`hotspot DEOGRACIAS`**.
2. Comparez visuellement au contenu déjà archivé (16 fichiers). **S'il manque des fichiers** (ex. sous-dossiers, `css/`, images supplémentaires) : glissez-déposez-les dans `DG-BACKUP-2026-09-16/portail-hotspot-DEOGRACIAS`.
3. Facultatif (recommandé) : téléchargez aussi le dossier `/hotspot` par défaut (21 fichiers) dans `DG-BACKUP-2026-09-16/portail-hotspot-defaut/` — sécurité supplémentaire, coût nul.
4. Notez dans votre retour : liste des fichiers ajoutés (ou « rien de nouveau »).

---

## ÉTAPE 4 — Sonde R2 (read-only, 3 min) — clôture technique d'IMP-01

**OBJECTIF** : confirmer proprement le `limit-uptime` par utilisateur (mécanisme de durée d'accès cumulative) et capturer un échantillon de tickets, sans les erreurs de syntaxe de R1.

### 4.1 — limit-uptime de 4 utilisateurs actifs

**COMMANDE** (remplacez les 4 noms par des noms VUS dans `/ip hotspot active print` au moment où vous exécutez ; un par ligne `:put`) :

```
:foreach u in=[/ip hotspot user find where name="NOM_ACTIF_1"] do={:put ("NOM_ACTIF_1 | limit-uptime=".[/ip hotspot user get $u limit-uptime]." | profile=".[/ip hotspot user get $u profile]." | comment=".[/ip hotspot user get $u comment])}
```

Répétez pour `NOM_ACTIF_2`, `NOM_ACTIF_3`, `NOM_ACTIF_4` (choisissez si possible : un login `http-chap` récent, un login `mac-cookie`, et le cas échéant un zombie au commentaire `vc-…` ancien).

**ENVOIE-MOI** : les 4 lignes produites (masquez le commentaire s'il révèle un code complet `vc-xxx-xx.xx.xx`).

**INTERPRÉTATION** :
- **SI `limit-uptime` = 5h/12h/… selon le profil** → mécanisme cumulatif **confirmé** ; IMP-01 définitivement clos ; la génération digitale (IMP-18) posera ce même champ.
- **SI `limit-uptime` vide/0 partout** → me le dire explicitement : la durée viendrait d'ailleurs et je rouvrirai l'analyse avant IMP-03.

### 4.2 — Échantillon de 10 tickets (format des noms/commentaires)

**COMMANDE** :

```
:foreach u in=([:pick [/ip hotspot user find] 0 10]) do={:put ([/ip hotspot user get $u name]." | ".[/ip hotspot user get $u profile]." | ".[/ip hotspot user get $u comment]." | lu=".[/ip hotspot user get $u limit-uptime])}
```

**ENVOIE-MOI** : les 10 lignes, **codes/words de passe non demandés** (la commande ne les lit pas) ; masquez les commentaires `vc-…` complets (gardez le préfixe + la date).

### 4.3 — Listing complet du dossier portail actif

**COMMANDE** :

```
/file print where name~"DEOGRACIAS"
```

**ENVOIE-MOI** : la sortie (vérifie la complétude de l'archivage repo).

---

## ÉTAPE 5 — Vérification et 3 copies (10 min, le cœur de la fiabilité)

1. **Empreintes** : dans PowerShell, depuis le dossier `DG-BACKUP-2026-09-16` :

```
Get-ChildItem -File | Get-FileHash -Algorithm SHA256 | Format-Table Hash, Path -AutoSize | Out-File -Encoding utf8 CHECKSUMS.txt
```

2. Ouvrez `CHECKSUMS.txt` : 7+ lignes avec empreintes de 64 caractères hexadécimaux.
3. **Copie 2** : copiez tout le dossier `DG-BACKUP-2026-09-16` vers la **clé USB**. Éjectez proprement.
4. **Copie 3** : téléversez le dossier (ou un zip **avec mot de passe**) vers votre **cloud** (Drive/Dropbox). Le zip protégé est obligatoire pour les fichiers `dg-users-*`/`dg-sales-*`/`.backup`.
5. **Vérification croisée** : rouvrez le dossier USB, comparez visuellement tailles et nombre de fichiers avec le PC.
6. Notez dans votre retour : « 3 copies vérifiées : PC + USB + cloud » + le contenu de `CHECKSUMS.txt` (**les empreintes ne sont pas sensibles**, envoyez-les) + tailles des 7 fichiers + nombre de lignes de `dg-users-*`.

---

## ÉTAPE 6 — Nettoyage du routeur (écritures autorisées, après vérification)

**OBJECTIF** : retirer du routeur les deux dumps en clair (mots de passe de tickets sur la flash) — ils sont maintenant en 3 copies vérifiées.

**COMMANDES** (uniquement après le « 3 copies vérifiées » de l'étape 5) :

```
/file remove dg-users-2026-09-16.txt
```

```
/file remove dg-sales-2026-09-16.txt
```

**CONSERVER sur le routeur** (jusqu'à IMP-03) : `dg-full-2026-09-16.backup`, `dg-export-2026-09-16.rsc`, `dg-sched-*`, `dg-profiles-*`, `dg-filelist-*` (petits, non critiques, utiles en cas de pépin immédiat).

---

## ÉTAPE 7 — Ce que vous m'envoyez (retour final)

1. Confirmation « étape 1 : 7 fichiers dg-* créés » (+ note si 1.1 sans password).
2. Tailles des 7 fichiers + nombre de lignes de `dg-users-2026-09-16.txt`.
3. `CHECKSUMS.txt` (empreintes SHA256).
4. « 3 copies vérifiées : PC + USB + cloud ».
5. Sorties R2 : 4.1 (4 lignes), 4.2 (10 lignes masquées), 4.3.
6. Étape 3 : fichiers portail ajoutés ou « rien de nouveau ».
7. Confirmation étape 6 : 2 dumps supprimés du routeur.
8. Heure réelle de fin.

**NE M'ENVOYEZ JAMAIS** : le `.backup`, le dump users, le dump sales, le mot de passe de sauvegarde.

---

## MÉMO RESTAURATION (ne PAS exécuter aujourd'hui — référence future IMP-35)

- **Restauration binaire** : WinBox → System → Restore → choisir `dg-full-2026-09-16.backup` → saisir le mot de passe → le routeur redémarre avec l'état sauvegardé. Unique méthode qui restaure TOUT (y compris mots de passe des tickets).
- **Ré-import texte** (partiel, avancé) : `/import file=dg-export-2026-09-16.rsc` — ne restaure PAS les secrets ; réservé à des scénarios de reconstruction assistée.
- En cas de perte totale du routeur : un RB951Ui-2HnD de remplacement + le `.backup` + son mot de passe = retour à l'état du 16/09/2026 en < 30 min.
