# ANALYSE DU PORTAIL LEGACY (`hotspot DEOGRACIAS`) — base de conception IMP-28

> **Implementation** : IMP-04 (livrable distant). Source : archive `docs/infrastructure/portal-legacy/hotspot-DEOGRACIAS/` (16/09/2026).
> **Thème** : Mikhmon UI Light (crédit laksa19.github.io dans login.html).

## 1. Cartographie des pages

| Fichier | Rôle | Points clés |
|---|---|---|
| `login.html` (8,5 Ko) | Saisie du code | 2 formulaires `action=$(link-login-only)` : (a) CHAP — champ caché `sendin` rempli par `md5.js` (username+password+challenge), champs `username`,`password`,`dst`,`popup` ; (b) repli PAP — `username`,`password` seuls. Lien « trial MAC » : `$(link-login-only)?dst=$(link-orig-esc)&username=T-$(mac-esc)` |
| `alogin.html` | Post-login | redirection `./login` (curieux : renvoie vers login — flux réel piloté par le proxy hotspot) |
| `status.html` | Statut session | variables `$(username)`, uptime/limit ; **référence `./detail.html` qui N'EXISTE PAS** (lien mort legacy) |
| `logout.html`, `error.html`, `redirect.html`, `radvert.html` | standards hotspot | error.html consomme `errors.txt`/`errors-en.txt` (libellés FR/EN) |
| `md5.js` (7 Ko) | MD5 pour CHAP | à conserver tel quel si le futur portail garde le CHAP |
| `mikhmon-ui-light.css` (11,5 Ko) | thème | chargé via `css/mikhmon-ui-light.css` |
| `background.css` (**554 Ko**) | fond = JPEG encodé base64 dans le CSS | poids anormal pour une page captive (chargement local, mais lent sur vieux téléphones) — à remplacer par un fichier image séparé en IMP-28 |
| `css/`, `img/` | assets RÉFÉRENCÉS (`css/*.css`, `img/favicon.png`, `img/logo.png`) | téléchargement complet = GUIDE-04 étape 1 |
| `logo.png`, `favicon.png`, `favicon.ico` | identité visuelle | logo = actif de marque Déo Gracias à réutiliser (IMP-25/26) |

## 2. Flux d'authentification observé

```
Client non auth → requête HTTP → redirect proxy hotspot (ports 64873/64874)
  → login.html servi sous deogracias.bj (dns-name, local only)
  → saisie code → POST $(link-login-only) (CHAP md5 ou PAP)
  → On-Login du profil (conversion comment + journal mikhmon)
  → alogin.html → navigation libérée (hs-auth)
  → status.html consultable pendant la session
```

## 3. Défauts legacy consignés (à corriger ou assumer en IMP-28/38)

1. `detail.html` référencé mais absent (lien mort).
2. `background.css` 554 Ko base64 (perf).
3. PAP en repli = mot de passe en clair sur le LAN captif (accepté phase 1, documenté modèle de menace IMP-35).
4. Lien trial MAC `T-$(mac-esc)` présent dans le markup = entrée d'essai par MAC (comportement à confirmer : existe-t-il des users `T-…` ? échantillons R2 : non vus) — à tester/neutraliser en IMP-38 si abus.
5. Aucune intégration paiement évidemment : c'est LE vide que la plateforme comble (IMP-26/27).

## 4. Contraints pour le futur portail (IMP-25–28)

- Conserver le contrat `$(link-login-only)` + CHAP md5.js pendant la cohabitation (le portail legacy et le futur doivent pouvoir coexister jusqu'à IMP-38) — OU bascule franche en une fois avec rollback = restauration du dossier `hotspot DEOGRACIAS` (archivé, donc réversible).
- Walled garden : vide aujourd'hui ; tout besoin pré-login (ex. page paiement hébergée) devra passer par l'analyse du dry-run GUIDE-04 (notamment le comportement HTTPS observé).
- Identité visuelle : réutiliser logo.png ; le fond photo peut être allégé.
