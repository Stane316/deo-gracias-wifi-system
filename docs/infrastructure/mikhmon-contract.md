# CONTRAT MIKMON — Spécification d'interopérabilité plateforme ↔ mécanisme legacy

> **Implementation** : IMP-04 (livrable distant) — source : EVIDENCE-IMP01-01/02/03, EVIDENCE-IMP02-01 (audit + R1 + R2 du 16/09/2026).
> **Statut** : référence normative pour IMP-11 (schéma), IMP-18 (stock/batches), IMP-19 (allocation), IMP-24 (réconciliation Connector), IMP-38 (bascule).
> **Principe** : le routeur reste la source de vérité de l'accès pendant toute la phase 1 ; la plateforme génère des tickets **indistinguables dans leur mécanique** des tickets Mikmon, mais distinguables dans leur identité (préfixe de nom) pour la réconciliation.

---

## 1. Les 5 objets du mécanisme legacy

| Objet | Où | Rôle |
|---|---|---|
| Ticket | `/ip hotspot user` | name (code), password (code saisi), profile (offre), limit-uptime (durée d'accès cumulative), comment (état), disabled (toujours no) |
| Offre | `/ip hotspot user profile` | 9 profils : 6 commerciaux Grille A + `1-HEURE` (legacy 50 F) + `Admin-free` (gratuit illimité) + `default` ; On-Login inline par profil |
| État | champ `comment` | `vc-<nnn>-<mm.dd.yy>-` = vierge ; `<mon>/<DD>/<YYYY> <HH:MM:SS>` = activé (date d'expiration de validité) ; vide = anomalie |
| Moniteurs | `/system scheduler` (7) | toutes ~2,5 min : suppriment user+session si comment-date dépassé (format `mon/DD/YYYY` ; famille 1-HEURE : `YYYY-MM-DD`) |
| Journal | `/system script` (comment=mikhmon) | une entrée par 1er login : name = `date-|-heure-|-user-|-prix-|-ip-|-mac-|-validité-|-profil-|-comment_origine`, owner=`moisAAAA`, source=date |

## 2. Cycle de vie d'un ticket (machine à états)

```
GENERE (Mikmon ou plateforme)
   name=<code>, password=<code>, profile=<offre>, limit-uptime=<durée offre>, comment="vc-…"
        │  (jamais désactivé ; aucun scheduler propre)
        ▼
VIERGE ── premier login (http-chap/http-pap/mac-cookie) ──▶ ACTIF
        │   On-Login : convertit comment en date d'expiration (login+validité)
        │            + écrit l'entrée journal mikhmon
        │   limit-uptime décompte CUMULATIF (reconnexions mac-cookie 3 j : pas de temps neuf)
        ▼
ACTIF ── (a) limit-uptime épuisé → déconnexion, reliquat nul
      ── (b) comment-date dépassée → moniteur SUPPRIME user+session (granularité ~2,5 min)
      ── (c) les deux : le premier arrivé
        ▼
EXPIRE-SUPPRIME (trace uniquement dans le journal mikhmon)

ÉTATS MARGINAUX :
  ZOMBIE : comment non converti (ex. profil Admin-free, ou échec de conversion) → ni moniteur ni
           expiration de validité ne s'appliquent ; si limit-uptime vide → accès illimité (cas
           observé : users Admin-free du parc legacy — comportement VOULU par l'admin externe)
  ADMIN-FREE : profil sans On-Login effectif (",,0,,,noexp") → volontairement hors mécanisme
```

## 3. Règles de génération pour les tickets DIGITAUX (IMP-18/19)

1. **profile** = nom exact du routeur (`5-HEURES`, `12-HEURES`, `24-HEURES`, `72-HEURES`, `1-SEMAINE`, `1-MOIS`).
2. **limit-uptime** = durée d'accès Grille A : 05:00:00 / 12:00:00 / 1d00:00:00 / 3d00:00:00 / 7d00:00:00 / 40d00:00:00 (format observé `5h`→`05:00:00`, `24h`→`1d00:00:00`).
3. **comment** = `vc-<seq>-<mm.dd.yy>-` (préfixe `vc` OBLIGATOIRE : c'est le test d'entrée de l'On-Login `$ucode = "vc" or "up" or ""`). `<seq>` = numéro de batch digital (séquence propre plateforme, 3+ chiffres) — permet de distinguer stock digital vs Mikmon sans toucher au script.
   → **DÉCISION PROPRIÉTAIRE à confirmer en IMP-18** : réutiliser le préfixe `vc` (zéro modification routeur, recommandé) OU étendre l'On-Login (écriture routeur = risque, non recommandé en phase 1).
4. **name** = convention plateforme distinguable : `dg` + 6 caractères [a-z0-9] (ex. `dgk4t9qz` = 8 car., dans la fourchette observée 7–8 car.) ; password = code client affiché (format IMP-19, sans caractères ambigus).
5. **Interdits ABSOLUS** : modifier profils/On-Login/moniteurs ; désactiver au lieu de laisser supprimer ; réécrire le comment d'un ticket ACTIF ; créer des users sans limit-uptime hors profil Admin-free documenté ; dépasser ~200 créations/lot sans observation RAM (128 Mo).
6. **Validité** = durée avant premier login : la plateforme doit AUSSI refuser l'activation d'un ticket dont la fenêtre de vente est close côté base (le routeur, lui, ne l'applique qu'après conversion du comment) — double garde-fou IMP-19.

## 4. Règles de lecture / réconciliation (IMP-24, Connector read-only)

Sources et champs à lire périodiquement :
1. `/ip hotspot user` (name, profile, comment, limit-uptime, disabled) → état courant VIERGE/ACTIF + expiration.
2. `/ip hotspot active` (user, uptime, session-time-left, login-by) → sessions live ; cohérence limit-uptime − cumul.
3. `/system script where comment=mikhmon` → journal des activations (parser `-|-` ; gérer les 2 formats de date : `mon/DD/YYYY` et `YYYY-MM-DD` famille 1-HEURE).
4. Détections d'anomalie à alerter : comment vide ; comment `vc-…` sur session active (conversion ratée) ; users Admin-free non inventoriés ; écart base↔routeur (ticket payé absent, ticket inconnu présent).
5. Aucune écriture Connector avant IMP-24 validé + décision propriétaire ; le Connector v0 (IMP-22) est strictement read-only.

## 5. Table de correspondance Grille A ↔ routeur (norme)

| Offre | Prix | Profil | limit-uptime | Validité (interval On-Login/moniteur) |
|---|---|---|---|---|
| 5 h | 100 F | 5-HEURES | 05:00:00 | 24 h |
| 12 h | 200 F | 12-HEURES | 12:00:00 | 24 h |
| 24 h | 300 F | 24-HEURES | 1d00:00:00 | 48 h |
| 72 h | 500 F | 72-HEURES | 3d00:00:00 | 5 j |
| 1 semaine | 1 000 F | 1-SEMAINE | 7d00:00:00 | 10 j |
| 1 mois | 4 000 F | 1-MOIS | 40d00:00:00 | 40 j |
| (legacy) 1 h | 50 F | 1-HEURE | 01:00:00 | 1 h — HORS Grille A, à statuer (IMP-08/35) |
| (legacy) gratuit | 0 | Admin-free | aucun | aucune — inventaire à figer (IMP-35) |

> Aucun rate-limit n'existe sur aucun profil (R1.2) : le bridage débit n'est pas une promesse commerciale actuelle ; toute introduction future = décision produit explicite (IMP-26).
