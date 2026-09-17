# REGISTRE SÉCURITÉ — 7 alertes Dependabot (17/09/2026)

> **Contexte** : après le push des commits IMP-07/IMP-08, GitHub Dependabot a ouvert 7 alertes
> sur `package-lock.json` (capture propriétaire du 17/09/2026 11:59). Mission de reprise
> Prompt Maître 02 : analyser, corriger, tester, documenter.
> **Sources de vérité** : capture propriétaire (numéros d'alerte + sévérités), `npm audit --json`
> exécuté localement le 17/09/2026 (GHSA, ranges, correctifs), `npm ls` post-fix.
> Aucune version, CVE ou GHSA n'a été deviné : tout provient du registre npm ou de la capture.

## 1. Registre des 7 alertes

| # GitHub | GHSA | Sévérité GitHub | Paquet vulnérable | Range vulnérable | Origine | Chemin de dépendance | Correctif |
|---|---|---|---|---|---|---|---|
| #3 | GHSA-5xrq-8626-4rwp | **Critical** | vitest | < 3.2.6 | **directe** (devDep racine) | vitest | vitest ≥ 3.2.6 (et ≥ 4.1.11 retenu) |
| #4 | GHSA-fx2h-pf6j-xcff | **High** | vite | ≤ 6.4.2 | transitive | vitest 2.1.9 → vite 5.4.21 | vite ≥ 6.4.3 (obtenu : 8.3.0) |
| #2 | GHSA-4w7w-66w2-5vf9 | Moderate | vite | ≤ 6.4.1 | transitive | vitest → vite | vite ≥ 6.4.2 (obtenu : 8.3.0) |
| #7 | GHSA-82fw-gwwq-j7x9 | Moderate | vitest | ≥ 2.1.0 < 4.1.11 | **directe** | vitest 2.1.9 | vitest ≥ 4.1.11 |
| #6 | GHSA-82fw-gwwq-j7x9 | Moderate | @vitest/mocker | ≥ 2.1.0 < 4.1.11 | transitive | vitest → @vitest/mocker 2.1.9 | @vitest/mocker ≥ 4.1.11 |
| #5 | GHSA-v6wh-96g9-6wx3 | Moderate | launch-editor (via vite) | vite ≤ 6.4.2 | transitive | vitest → vite | vite ≥ 6.4.3 (obtenu : 8.3.0) |
| #1 | GHSA-67mh-4wv8-2f99 | Moderate | esbuild | ≤ 0.24.2 | transitive | vitest → vite → esbuild 0.21.5 | esbuild ≥ 0.24.3 (chaîne vite 8.3.0) |

**Correspondance 7 alertes ↔ 6 GHSA** : #7 et #6 sont le même advisory GHSA-82fw-gwwq-j7x9,
compté deux fois par GitHub (paquet direct `vitest` + paquet transitive `@vitest/mocker`).
`npm audit` local compte 5 entrées de vulnérabilité (vitest, @vitest/mocker, vite, vite-node,
esbuild) couvrant ces 6 GHSA.

**Titres exacts (registre npm)** :
- GHSA-5xrq-8626-4rwp : « When Vitest UI server is listening, arbitrary file can be read and executed »
- GHSA-fx2h-pf6j-xcff : « vite: `server.fs.deny` bypass on Windows alternate paths »
- GHSA-4w7w-66w2-5vf9 : « Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling »
- GHSA-82fw-gwwq-j7x9 : « Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock »
- GHSA-v6wh-96g9-6wx3 : « launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows »
- GHSA-67mh-4wv8-2f99 : « esbuild enables any website to send any requests to the development server and read the response »

**Note launch-editor (#5)** : la chaîne `launch-editor` n'a **jamais existé** dans notre
`package-lock.json` (0 occurrence vérifiée par grep avant et après correctif). L'advisory est
rattaché par le registre à `vite ≤ 6.4.2` (chaîne de dépendance interne de vite analysée par
l'advisory DB). Le passage à vite 8.3.0 sort du range vulnérable ; si l'alerte #5 restait
ouverte après push, son chemin de dépendance exact serait à lire sur GitHub (action propriétaire).

## 2. Analyse avant correction

- **État avant** : vitest 2.1.9 (direct, `^2.1.9`), vite 5.4.21, @vitest/mocker 2.1.9,
  esbuild 0.21.5, vite-node 2.1.9 — Node v20.20.2, npm 10.8.2.
- **Correctif unique proposé par le registre** : `vitest@4.1.11` (isSemVerMajor = true).
  Aucune branche corrective n'existe en 2.x pour GHSA-82fw (patch minimal = 4.1.11) ;
  GHSA-5xrq est patché dès 3.2.6 mais resterait couvert par GHSA-82fw en 3.x.
- **Expositions réelles** : toutes ces vulnérabilités concernent des outils de
  **développement/test** (serveur UI vitest, serveur dev vite, esbuild dev server). Aucune
  n'affecte le code de production livré. Risque réel = environnement de développement et CI.
  Correction néanmoins obligatoire : CI exécute vitest, et le principe « ne pas réduire la
  sécurité pour faire disparaître une alerte » impose le vrai patch.
- **Analyse de régression du saut majeur 2 → 4** :
  - usage réel de vitest : 4 fichiers de test (`apps/{backend,connector,frontend}/src/index.test.ts`,
    `packages/shared/src/offers.test.ts`), imports limités à `describe/expect/it` (API stable en v4) ;
  - **aucun fichier de configuration vitest** dans le repo ; scripts = `vitest run` ;
  - aucune dépendance de production n'utilise vitest/vite ;
  - Node 20.20.2 compatible avec vitest 4 (engines ^20 || ^22 || >=24) ;
  - preuves exigées après install : `npm audit` = 0, typecheck 4/4, tests 8/8.
- **Méthodes écartées** : `npm audit fix --force` (boîte noire), suppression/régénération
  manuelle du lock, `overrides` masquant l'alerte sans patch, remplacement de vitest par un
  autre runner (changement architectural non justifié).

## 3. Correction appliquée

```bash
npm install -D vitest@^4.1.11     # racine du monorepo, seul changement de manifeste
```

Fichiers touchés : `package.json` (devDependencies vitest `^2.1.9` → `^4.1.11`) et
`package-lock.json` (régénéré par npm : vitest 4.1.11, @vitest/mocker 4.1.11, vite 8.3.0,
disparition de vite-node 2.x et esbuild 0.21.5 de la chaîne vulnérable).

## 4. Preuves post-correction (17/09/2026, workspace agent)

| Contrôle | Commande | Résultat |
|---|---|---|
| Audit dépendances | `npm audit` | **found 0 vulnerabilities** |
| Arbre résolu | `npm ls vitest vite esbuild @vitest/mocker vite-node` | vitest@4.1.11 → @vitest/mocker@4.1.11 → vite@8.3.0 |
| Typecheck | `npm run typecheck` | 4/4 workspaces OK |
| Tests | `npm test` | 4/4 workspaces, **8/8 tests passants** (backend 1, connector 1, frontend 1, shared 5) sous vitest v4.1.11 |
| launch-editor | `grep -c launch-editor package-lock.json` | 0 (avant et après) |

## 5. État GitHub

**Correction locale vérifiée, mais fermeture des alertes GitHub non confirmée.**
Le push est réalisé par le propriétaire (workflow Option 2). Après push, Dependabot re-analyse
`package-lock.json` (délai observé : ~30 min lors de l'ouverture) ; les 7 alertes doivent
passer Closed/Fixed. Si #5 (launch-editor) restait ouverte, lire son chemin de dépendance
sur la page de l'alerte et le rapporter à l'agent avant toute action.

## 6. Limites restantes

- Aucune : les 6 GHSA sortent tous des ranges vulnérables avec l'arbre résolu ci-dessus.
- Vigilance continue : CI gitleaks + `npm audit` à ajouter comme job dédié lors d'IMP-09+
  (proposition, hors périmètre de cette mission).
