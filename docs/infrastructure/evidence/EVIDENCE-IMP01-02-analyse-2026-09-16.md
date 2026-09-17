# EVIDENCE-IMP01-02 — Analyse de l'audit MikroTik du 16/09/2026

> **Implementation** : IMP-01 (étape 2/2)
> **Sources** : `EVIDENCE-IMP01-01-audit-brut-2026-09-16.md` (sorties masquées) recoupées avec les docs validés (02, 07 notamment).
> **Verdict global** : l'infrastructure est **conforme à la documentation validée sur tous les points structurants** (topologie, mangle, NAT/filter, walled garden vide, mécanisme Mikmon). Trois découvertes majeures : (1) le mécanisme d'expiration réel est le **`session-timeout` des profils + cookies MAC 3 jours**, sans jamais désactiver les tickets ; (2) le profil hotspot a **`use-radius=yes` sans serveur RADIUS** (résidu inoffensif mais à documenter) ; (3) **tous les services d'administration sont ouverts sans restriction** (connu, cible IMP-03). Aucune action corrective n'a été appliquée (audit 100 % read-only).

---

## 1. CONFORMITÉ À LA DOCUMENTATION VALIDÉE

| Élément documenté | Source | Observé le 16/09/2026 | Verdict |
|---|---|---|---|
| RB951Ui-2HnD, RouterOS 6.49.17 | doc 07 | `board-name: RB951Ui-2HnD`, `version: 6.49.17 (stable)` | ✅ CONFORME |
| LAN 192.168.88.254/24 | doc 07 | adresse sur bridge `DEOGRACIAS` | ✅ CONFORME |
| WAN 192.168.100.7/24, gateway 192.168.100.1 (double NAT) | doc 07 | présent, **mais flag `D` (dynamique/DHCP)** | ⚠️ ÉCART MINEUR (N5) |
| Hotspot `hotspot1` sur le Wi-Fi | doc 07 | hotspot1 sur le **bridge** `DEOGRACIAS` (wlan1 + ether2-5 esclaves) | ✅ CONFORME (précisé) |
| Mangle change-ttl postrouting new-ttl=1 out=DEOGRACIAS passthrough=no | doc 07 §34 | identique, règle unique | ✅ CONFORME |
| NAT/filter = outillage hotspot uniquement | doc 07 §33 | uniquement des règles dynamiques hotspot | ✅ CONFORME |
| Walled Garden vide | doc 07 §31 | vide (hostnames ET IP) | ✅ CONFORME |
| Script On-Login présent, à préserver | doc 07 §25-26 | présent, **inline dans chaque profil** (pas dans /system script) | ✅ CONFORME (localisation précisée) |
| Commentaire utilisateur utilisé par le script | doc 07 §24 | confirmé : `vc-*` avant 1er login → date d'expiration après | ✅ CONFORME |
| Journal de vente `comment=mikhmon` dans /system script | doc 07 §25.9 | confirmé : format `date-\|-heure-\|-user-\|-prix-\|-ip-\|-mac-\|-validité-\|-profil-\|-voucher` | ✅ CONFORME (format exact établi) |
| Services telnet/ftp/www/ssh/api/winbox/api-ssl présents | doc 07 §36 | tous activés, **sans restriction d'adresse** ; www-ssl désactivé | ✅ CONFORME (gravité précisée) |
| Profils commerciaux 5-HEURES…1-SEMAINE | doc 07 §12 | confirmés par les compteurs F2 | ✅ CONFORME |
| Grille A : 4000 F = 1 mois / 40 j de validité | décision propriétaire | profil `1-MOIS`, `remc,4000,40d`, interval=40d | ✅ CONFORME |

---

## 2. CLÔTURE DES POINTS OUVERTS (doc 07 §69)

### P1 — RADIUS : ✅ CLOS

- `/radius` : **aucune entrée**. `/user aaa` : `use-radius: no`. Paquet `user-manager` : **absent**.
- Le profil hotspot `hsprof1` porte `use-radius=yes`, `radius-accounting=yes`, `radius-interim-update=received` : **configuration résiduelle sans effet** (faute de serveur déclaré, RouterOS authentifie en local).
- **Conclusion** : authentification 100 % locale. Aucun serveur RADIUS à intégrer. Le Connector (IMP-21) n'aura qu'à parler à l'API RouterOS.
- **Décision induite** : ne PAS toucher à `use-radius` (principe de préservation) ; le documenter comme résidu. Un nettoyage éventuel ne sera décidé qu'après IMP-02 (sauvegardes) et seulement s'il apporte un bénéfice démontré.

### P2 — Mapping 4 000 F : ✅ CLOS

- Profil : **`1-MOIS`**. Prix dans le On-Login : `4000`. Validité : `40d`. 198 utilisateurs existants.
- Conforme Grille A (4 000 F = 1 mois d'accès / 40 jours de validité).
- Le mapping officiel des 6 offres est donc complet : `5-HEURES`(100F), `12-HEURES`(200F), `24-HEURES`(300F), `72-HEURES`(500F), `1-SEMAINE`(1000F), `1-MOIS`(4000F).

### P3 — Mapping 5 000 F : ✅ CLOS (sans objet)

- Aucun profil 5 000 F, aucune offre 5 000 F dans la Grille A officielle. Le profil `1-HEURES` (50 F, doc 07 §12) existe côté routeur mais a **0 utilisateur** → offre legacy hors Grille A. À traiter dans l'alignement documentaire (IMP-08) : soit réactivation décidée par le propriétaire, soit mention « legacy ».

### P4 — Profils / shared-users : 🟡 QUASI CLOS (reste 1 donnée)

- `shared-users=1` confirmé sur `default`, `5-HEURES`, `1-MOIS` (les seuls profils dont le détail a pu être collé).
- Mécanisme d'expiration : `limit-uptime` **écarté** (aucun utilisateur n'en porte) ; les schedulers temporaires du On-Login **ne servent qu'à calculer la date** (créés puis supprimés dans la foulée) ; reste à lire `session-timeout` et `rate-limit` de chaque profil → **relance R1.1/R1.2** (5 min).
- Indication forte : deux sessions actives du profil 5 h totalisent exactement `uptime + session-time-left = 5h00m00s` → le `session-timeout` de profil est bien le mécanisme d'application de la durée d'accès.

### P5 — Fichiers portail : 🟡 QUASI CLOS (reste le contenu)

- Localisation : dossier **`/hotspot`** (21 entrées), structure MikroTik standard personnalisée (style.css 4 Ko, 2 icônes SVG, api.json 311 o, login.html 4,4 Ko).
- Anomalie d'affichage à lever : `html-directory=hotspot DEOGRACIAS` (artefact probable) → **R1.3**.
- Contenu des HTML/CSS/JS non encore récupéré → **R1.9** (glisser-déposer WinBox).
- Découverte associée : `dns-name="deogracias.bj"` sur le profil hotspot (voir N6).

### P6 — Permissions Connector : 🟡 DONNÉES COLLECTÉES (test = IMP-03/IMP-21)

- Groupes disponibles : `read` / `write` / `full` (détail des policies capturé).
- Aucun compte technique n'existe encore ; un seul compte `admin` (full).
- Le groupe `read` inclut `reboot` et `sensitive` — trop large pour le Connector en lecture seule stricte ; un **groupe personnalisé `dg-connector`** sera créé en IMP-03 (écriture → après sauvegardes IMP-02). P6 reste ouvert jusqu'au test réel des permissions (conforme à sa définition).

---

## 3. MÉCANISME D'EXPIRATION DES TICKETS — RECONSTITUTION

```
Génération Mikmon (ou future génération backend)
    → utilisateur hotspot, profil = offre, password = code,
      comment = "vc-<prix>-<mm.dd.aa>-"   (voucher non utilisé)
    → PAS de limit-uptime, PAS de scheduler permanent, PAS de désactivation planifiée

Premier login du client (http-chap/http-pap)
    → On-Login du profil (inline) :
       1. lit le commentaire ; agit seulement s'il commence par "vc"/"up" ou est vide
          (= protection : un ticket déjà activé n'est pas ré-initialisé)
       2. crée un scheduler TEMPORAIRE (interval = validité : 24h pour 100F, 40d pour 4000F)
          uniquement pour CALCULER la date d'expiration (next-run), puis le SUPPRIME
       3. réécrit le commentaire utilisateur = "<date expiration> <heure>"
       4. ajoute une entrée /system script comment="mikhmon" = journal de vente
          (date|heure|user|prix|ip|mac|validité|profil|voucher d'origine)
    → le profil applique session-timeout (= durée d'accès : 5h, 12h, … à confirmer R1)

Fin de session
    → déconnexion à l'épuisement du session-timeout (observé : 5h00m00s pile)
    → MAIS : add-mac-cookie=yes + mac-cookie-timeout=3d + login-by=…mac-cookie
       → le client est ré-authentifié SANS mot de passe pendant 3 jours (observé sur 2 sessions actives)
    → aucun utilisateur n'est jamais désactivé (0 disabled sur 4155)
    → la « validité » (24h/40d) n'est écrite que dans le commentaire : RIEN ne l'applique
```

### Constat produit majeur (ALERTE A1 — à valider par test en IMP-38)

Tel que configuré, un ticket semble donner **une session de X heures, renouvelable gratuitement par reconnexion automatique (mac-cookie) pendant 3 jours**, la date de validité inscrite en commentaire n'étant appliquée par aucun mécanisme. Deux sessions observées contredisent partiellement ce tableau (totaux de 4h41m et 2h55m au lieu de 5h) → la sémantique exacte (session unique vs re-comptage) doit être :
1. complétée par R1 (session-timeout par profil + détail des 7 schedulers),
2. **vérifiée par un test terrain réel** (un ticket de test, déconnexion/reconnexion) — ce test est une ÉCRITURE de fait (consommation d'un ticket) : il n'aura lieu qu'après IMP-02 et avec votre accord explicite.

**Impact backend (IMP-11/IMP-18/IMP-19)** : la plateforme ne pourra PAS déléguer l'expiration au routeur tel quel. Deux voies (choix à valider en IMP-11, ADR) :
- **(a) reproduire le comportement Mikmon à l'identique** (session-timeout de profil + commentaire), la plateforme gérant la validité/le désactivage côté base + Connector ;
- **(b) durcir côté routeur** (limit-uptime par utilisateur généré = durée achetée, compteur cumulatif infalsifiable) — écart assumé vs l'existant, à faire valider par le propriétaire.
La voie (b) est plus saine commercialement et techniquement (le cumulatif survit aux reconnexions), mais elle modifie le comportement perçu par les clients actuels → décision propriétaire obligatoire.

---

## 4. DÉCOUVERTES ET ÉCARTS (numérotés, exploités par les IMP suivants)

| N° | Découverte | Gravité | Exploitation |
|---|---|---|---|
| N1 | `use-radius=yes` résiduel sur hsprof1, sans serveur RADIUS | Information | Documenté (P1 clos). Ne pas toucher sans décision |
| N2 | SNTP désactivé + horloge non secourue (fichiers datés jan/1970) ; horloge actuellement correcte | **Élevée** | Toute coupure de courant fausse l'heure → dates d'expiration fausses. IMP-03 : activer SNTP (écriture, après IMP-02). IMP-05 : vérifier l'heure après le test de coupure |
| N3 | 4155 utilisateurs, **0 désactivé** ; validité non appliquée ; voir ALERTE A1 | **Élevée (produit)** | Test terrain post-IMP-02 ; décision (a)/(b) en IMP-11 |
| N4 | Répartition du stock historique : 56 % de 100 F (2311), 15 % de 500 F (622), 12 % de 300 F (503), 7 % de 200 F (299), 5 % de 4000 F (198), 4 % de 1000 F (164) | Information | OD-5 : remplacer le défaut « 150/plan » par un stock proportionnel (proposition chiffrée en IMP-06) |
| N5 | Adresse WAN `192.168.100.7` en **dynamique** (DHCP client) | Moyenne | Le Connector ne doit JAMAIS compter sur une IP WAN fixe (il est sur le LAN de toute façon). R1.8 confirme le dhcp-client |
| N6 | `dns-name="deogracias.bj"` sur le profil hotspot | Moyenne | Le portail est servi sur ce nom. Interagit avec OD-2 (nom de domaine), le HTTPS et les tests captifs IMP-28/IMP-38. Vérifier si ce domaine existe/est enregistré |
| N7 | 1 ip-binding bypassé : `192.168.88.200` (MAC 80:AF:CA:…) exemptée d'authentification permanente | Moyenne | Exception de sécurité à documenter ; identifier le propriétaire du device (R1.12) ; décision de maintien/suppression en IMP-03 |
| N8 | SSID `DEOGRACIAS WIFI ZONE C` (suffixe « C ») | Information | Existe-t-il d'autres zones/AP (A, B) ? Question propriétaire |
| N9 | Totaux uptime+time-left incohérents entre sessions (5h pile ×2, 4h42m, 2h55m) | Moyenne | R1.6/R1.10 (re-capture) + test terrain ; alimente A1 |
| N10 | **7 schedulers** présents, contenu inconnu | **Élevée (si reboot périodique)** | R1.4 obligatoire avant IMP-05 (coupure de courant) |
| N11 | 1 queue simple inconnue | Faible | R1.7 |
| N12 | Logging `hotspot` info+debug → disque (flash 128 Mo, usure) | Faible | IMP-03 : réduire à info, ou vers memory ; surveillance `write-sect-total` |
| N13 | 58 utilisateurs hors profils commerciaux connus (4155 − 4097) | Faible | R1.1 donnera la liste complète des profils (Admin-free, default…) |
| N14 | Wi-Fi ouvert (normal), `login-by` inclut `http-pap` (mots de passe en clair sur le LAN captif) | Faible | Accepté pour un hotspot voucher ; documenté dans le modèle de menace (IMP-35) |
| N15 | Ressources saines : RAM libre 90,7/128 MiB, disque libre 104/128 MiB, CPU 10 %, uptime 9 j | Information | Marge OK pour le stock IMP-06 (~900 users) ; surveiller la croissance du journal /system script |

---

## 5. DONNÉES FONDATEURS POUR LES IMP SUIVANTS

- **IMP-02 (sauvegardes)** : sauvegarder en priorité : `/export` complet (config), binaire `system backup`, dossier `/hotspot` (21 fichiers), liste des 4155 utilisateurs (`print` paginé ou export file), journal `/system script` (ventes), les 7 schedulers. Le volume est faible (< 2 Mo) → la sauvegarde tient sur une clé/PC.
- **IMP-03 (durcissement)** : fermer telnet/ftp/www (ou restreindre au LAN), restreindre ssh/api/winbox/api-ssl à `192.168.88.0/24`, activer SNTP, créer le groupe `dg-connector` + compte dédié, traiter le binding bypassé N7, réduire le logging disque N12. TOUT après IMP-02.
- **IMP-04 (Grille A + portail)** : les 6 profils sont confirmés ; `rate-limit` réel par profil à intégrer à la page offres (R1.2) ; fichiers portail à récupérer (R1.9) ; dry-run walled garden sur portail vide confirmé possible (vide = rien à casser).
- **IMP-06 (stock)** : quantités proportionnelles à N4 ; format de nom utilisateur : 7 caractères alphanumériques minuscules observés (`hna***`, `rdk***`…) ; le code voucher `vc-*` d'origine est préservé dans le commentaire jusqu'au premier login → la génération digitale devra choisir un préfixe de commentaire distinct (ex. `dg-`) **compatible avec le test `$ucode = "vc" or "up" or ""` du On-Login** : un commentaire `dg-*` ne serait PAS reconnu par le script → la date d'expiration ne serait pas calculée. Point critique de conception pour IMP-18/IMP-19 : soit réutiliser le préfixe `vc`, soit étendre le script (écriture → décision propriétaire).
- **IMP-11 (schéma DB)** : enum des profils = noms exacts du routeur ; validités (24h/40d…) extraites des On-Login ; le journal de vente mikhmon fournit l'historique des ventes depuis sep/2025 (format de parsing établi).
- **IMP-21/24 (Connector)** : API classique port 8728 ouverte ; 128 Mo RAM → client léger obligatoire ; la réconciliation pourra s'appuyer sur : commentaires utilisateurs (expiration), journal /system script (ventes), hotspot active (sessions).

---

## 6. CE QUI RESTE À COLLECTER (relance R1 — voir GUIDE-01-ADDENDUM-R1.md)

1. R1.1 Liste complète des profils (table simple)
2. R1.2 `session-timeout` / `rate-limit` / `shared-users` / `idle-timeout` de CHAQUE profil (one-liner compact, anti-troncature)
3. R1.3 `/ip hotspot profile print` (lever l'anomalie `html-directory`)
4. R1.4 Détail des 7 schedulers (**bloquant IMP-05**)
5. R1.5 Nombre total d'entrées `/system script` (journal des ventes)
6. R1.6 Propriétés d'un utilisateur actif connu (limite, mot de passe masqué)
7. R1.7 La queue simple inconnue
8. R1.8 `/ip dhcp-client print` (confirmer N5)
9. R1.9 **Téléchargement WinBox des fichiers portail** (bloquant IMP-04)
10. R1.10 Re-capture `/ip hotspot active print detail` (N9)
11. R1.11 Échantillon de 10 utilisateurs (table simple, format des noms/commentaires)
12. R1.12 Question humaine : à qui appartient le device bypassé 192.168.88.200 ? Existe-t-il d'autres « zones » Wi-Fi (N8) ?

**R1 est entièrement read-only et prend ~10 minutes + 5 minutes de glisser-déposer WinBox. À faire avant de quitter le site.**
