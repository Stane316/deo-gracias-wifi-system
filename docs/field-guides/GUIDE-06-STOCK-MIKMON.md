# GUIDE-06 — Génération du stock digital de tickets via Mikhmon (Windows) + export sécurisé

> **Implementation** : IMP-06 (avancé avant IMP-07 par décision D5)
> **Durée estimée** : 45–60 min
> **Paramètres validés (17/09)** : quantités proportionnelles **660** = 5-HEURES 300 · 12-HEURES 60 · 24-HEURES 100 · 72-HEURES 120 · 1-SEMAINE 40 · 1-MOIS 40 ; **aucune impression** (stock digital seul) ; Mikhmon sur PC Windows ; propriétaire sur site.
> **Prérequis** : sauvegarde v2 existante (3 copies) ; WinBox ouvert ; Mikhmon Windows lancé avec sa session connectée au routeur (API restreinte au LAN — vous êtes sur le LAN, OK) ; terminal WinBox ouvert en parallèle.
> **Règles** : aucune autre modification routeur ; le dump exporté contient les mots de passe des tickets = SECRET (jamais au chat, jamais Git, 3 copies chiffrées si cloud) ; si une génération échoue ou produit des valeurs non conformes : STOP et me contacter avant toute correction manuelle.
> **Statut (23/09/2026)** : génération exécutée et validée le 17/09 ; le stock de 660 tickets est seedé en base par la migration `0010` (IMP-16) — empreintes sha256 seulement, codes jamais en base ni en Git (PDF du coffre = unique source).

---

## ÉTAPE 1 — État avant génération (read-only, 5 min)

### 1.1 Compteurs initiaux

```
/ip hotspot user print count-only
```

Puis, par profil :

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

**ENVOIE-MOI** (ou notez pour l'étape 3) : les 7 nombres.

### 1.2 Ressources

```
/system resource print
```

**OBSERVER** : `free-memory` (attendu > 80 MiB) — notez-la.

---

## ÉTAPE 2 — Générations Mikhmon (6 rounds, 25–35 min)

Pour CHAQUE profil, dans l'ordre du tableau :

| Round | Profil Mikhmon | Quantité |
|---|---|---|
| 1 | 5-HEURES | 300 |
| 2 | 12-HEURES | 60 |
| 3 | 24-HEURES | 100 |
| 4 | 72-HEURES | 120 |
| 5 | 1-SEMAINE | 40 |
| 6 | 1-MOIS | 40 |

Procédure Mikhmon Windows (libellés possibles selon version : menu **Hotspot → Generate / Vouchers → Generate / Users → Generate**) :

1. Ouvrez l'écran de génération de vouchers/utilisateurs.
2. Sélectionnez le **profile** exact (ex. `5-HEURES`), **nombre d'utilisateurs** = quantité du round, longueur de nom laissée au défaut Mikhmon (7–8 caractères observés).
3. Lancez la génération ; attendez la fin (barre/confirmation). **SI un round de 300 semble bloqué > 2 min** : annulez, refaites en 3 × 100.
4. Ne touchez à AUCUN autre réglage Mikhmon (pas de modification de profils, pas d'édition de users existants).
5. Notez l'heure de fin de chaque round.

**Après chaque round**, vérification immédiate au terminal :

```
/ip hotspot user print count-only where profile="LE_PROFIL_DU_ROUND"
```

**ATTENDU** : compteur initial + quantité du round. **SI écart** : STOP, notez, contactez-moi.

---

## ÉTAPE 3 — Contrôle de conformité au contrat Mikmon (read-only, 10 min)

Pour CHAQUE profil généré, prenez un utilisateur neuf du batch et vérifiez les 3 champs du contrat :

```
:foreach u in=([:pick [/ip hotspot user find where profile="5-HEURES"] -1]) do={:put ([/ip hotspot user get $u name]." | lu=".[/ip hotspot user get $u limit-uptime]." | comment=".[/ip hotspot user get $u comment])}
```

(adaptez le profil ; `[:pick … -1]` = le DERNIER créé = un neuf du batch)

**ATTENDU par profil** :

| Profil | limit-uptime attendu | comment attendu |
|---|---|---|
| 5-HEURES | 05:00:00 | `vc-<n>-09.17.26-` |
| 12-HEURES | 12:00:00 | `vc-<n>-09.17.26-` |
| 24-HEURES | 1d00:00:00 | `vc-<n>-09.17.26-` |
| 72-HEURES | 3d00:00:00 | `vc-<n>-09.17.26-` |
| 1-SEMAINE | 7d00:00:00 | `vc-<n>-09.17.26-` |
| 1-MOIS | 40d00:00:00 | `vc-<n>-09.17.26-` |

**ENVOIE-MOI** les 6 lignes produites (masquez le code : gardez `vc-` + les 3 premiers chiffres du n + la date).
**SI un limit-uptime est vide ou faux** : STOP général, ne générez plus rien, contactez-moi (rollback possible, voir plus bas).

---

## ÉTAPE 4 — Export sécurisé du stock (écritures autorisées : fichier dump puis suppression, 10 min)

### 4.1 Dump complet (contient les codes = SECRET)

```
/ip hotspot user print detail file=dg-stock-2026-09-17.txt
```

### 4.2 Téléchargement + empreinte + 3 copies

1. WinBox → Files : glissez `dg-stock-2026-09-17.txt` dans `DG-BACKUP-2026-09-16` (renommez le dossier mentalement « coffre » : il contient désormais stocks + sauvegardes).
2. PowerShell : `Get-FileHash dg-stock-2026-09-17.txt -Algorithm SHA256` → notez dans CHECKSUMS.txt.
3. Copiez sur USB + cloud (zip protégé par mot de passe pour le cloud).
4. Vérifiez le nombre de lignes (~4 815 attendues : 4 155 + 660).

### 4.3 Suppression du dump du routeur

```
/file remove dg-stock-2026-09-17.txt
```

---

## ÉTAPE 5 — Retour final (message unique)

1. Compteurs étape 1 (7 nombres) + free-memory.
2. Par round : heure de fin + compteur post-round.
3. Les 6 lignes de conformité étape 3 (codes masqués).
4. SHA256 du dump + nombre de lignes + « 3 copies vérifiées » + confirmation suppression routeur.
5. Anomalies éventuelles (rounds refaits en chunks, erreurs Mikhmon…).
6. Heure réelle de fin.

**NE M'ENVOYEZ JAMAIS** le contenu du dump ni les codes complets.

---

## RETOUR ARRIÈRE (uniquement sur mon instruction)

Suppression ciblée du stock généré aujourd'hui (les comments des batches du jour contiennent `09.17.26` ; aucun ticket antérieur ni activé ne porte cette chaîne) :

```
/ip hotspot user remove [find where comment~"09.17.26"]
```

Puis contrôle : `/ip hotspot user print count-only` = compteur initial étape 1.
