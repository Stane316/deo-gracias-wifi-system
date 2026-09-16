# portal-legacy — Portail captif actuel (figé au 16/09/2026)

**Provenance** : dossier **`hotspot DEOGRACIAS`** du routeur RB951Ui-2HnD (`html-directory` du profil hotspot `hsprof1`), téléchargé par le propriétaire via WinBox Files le 16/09/2026 (audit IMP-01, relance R1 / étape G3).

**Contenu** : `hotspot-DEOGRACIAS/` — les 16 fichiers du portail ACTIF (thème Mikhmon UI light) :
`login.html` (page de saisie du code), `alogin.html` (post-login), `rlogin.html`, `status.html`, `logout.html`, `error.html`, `redirect.html`, `radvert.html`, `md5.js` (CHAP), `mikhmon-ui-light.css`, `background.css` (fond image encodé base64, 554 Ko), `logo.png`, `favicon.png`, `errors.txt` / `errors-en.txt` (libellés d'erreurs), `README.md` (readme du thème Mikhmon).

**À savoir** :
- Le dossier RouterOS par défaut `/hotspot` existe aussi mais est **inutilisé** (le profil pointe sur `hotspot DEOGRACIAS`).
- Le portail est servi sous le nom local `deogracias.bj` (`dns-name`), non résolu depuis Internet.
- Cet archivage est une **photographie de référence** : toute modification future du portail devra partir d'ici et être tracée (IMP-04, IMP-28).
- Fichiers non secrets (aucun identifiant, aucun code) — archivage au dépôt autorisé.
