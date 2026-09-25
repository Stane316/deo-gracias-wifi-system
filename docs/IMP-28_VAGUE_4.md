# IMP-28 — Vague 4 — captif, états dégradés et Walled Garden

Statut : **PARTIAL — CODE COMPLETE / EXTERNAL DEPENDENCIES DEFERRED — NO-GO MikroTik**.

La validation locale des comportements réseau est produite. La liste Walled Garden de production reste volontairement **vide** : aucun hostname public frontend/API réel n'est fourni dans le repository et le portail captif réel n'est pas accessible depuis cet environnement. Aucune écriture MikroTik n'a été exécutée.

## PROBLÈME

Avant toute ouverture réseau pré-authentification, il faut démontrer :

1. le comportement frontend lorsque le navigateur est offline ;
2. le comportement lorsque l'API est arrêtée ou répond en `5xx` ;
3. les hostnames réellement utilisés par le frontend, l'API et FedaPay ;
4. le fonctionnement du portail captif existant ;
5. qu'aucune ouverture Walled Garden ne repose sur un domaine inventé, un wildcard ou un endpoint de test.

## CAUSE

- Le frontend actuel utilise des chemins relatifs `/api/*`, pas un domaine API codé en dur.
- Le proxy Vite local relaie vers `http://127.0.0.1:3000`; ce hostname est uniquement un mécanisme de développement et ne doit jamais entrer dans le Walled Garden.
- Le checkout FedaPay reçoit une `redirect_url` dynamiquement ; le domaine de redirection réel n'est pas prouvé par le code ni par un paiement sandbox exécuté.
- Le repository ne contient pas de hostname public de déploiement frontend/API.
- Le portail captif est un équipement physique ; aucune session téléphone/MikroTik n'est disponible dans cet environnement.

## IMPACT

Une ouverture trop large pourrait donner un accès Internet avant authentification, exposer une API interne, casser le portail HTTPS ou rendre le paiement dépendant d'un domaine FedaPay non confirmé.

## SOLUTION

### 1. Comportements offline et backend indisponible

Contrat observé et testé :

| Situation | Comportement attendu | Preuve |
|---|---|---|
| navigateur offline / `fetch` rejeté | `status = 0`, message actionnable, aucune exception brute | `apps/frontend/src/api.test.ts` |
| API `503` sans corps | message « Backend injoignable », bouton « Réessayer », aucune offre inventée | Playwright IMP-28 |
| API `5xx` avec problème RFC 7807 | affichage du `detail` backend, pas de succès local | `format.ts` + tests existants |
| POST `/orders` indisponible | état technique, aucun paiement confirmé | orchestration `Checkout.tsx` |
| polling indisponible | attente conservatrice après trois erreurs, aucun second paiement | `polling.ts` + tests IMP-27 |
| rafraîchissement après panne | reprise par `sessionStorage` puis relecture backend ; jamais de confirmation locale | IMP-27 |

Il n'y a volontairement **pas de mode achat offline**, pas de prix en cache autoritaire et pas de délivrance hors connexion. Une reconnexion doit relire l'état backend.

### 2. Inventaire des domaines réellement utilisés

| Flux | Cible prouvée par le code | Statut IMP-28 |
|---|---|---|
| navigateur → API | `/api/*` relatif à l'origine courante | confirmé ; aucun hostname public disponible |
| proxy Vite local | `http://127.0.0.1:<BACKEND_PORT>` | local uniquement, interdit dans WG |
| backend → FedaPay sandbox | `https://sandbox-api.fedapay.com/v1` | confirmé statiquement ; pas de transaction sandbox exécutée ici |
| backend → FedaPay live | `https://api.fedapay.com/v1` | code prévu, environnement live non autorisé dans cette vague |
| transaction FedaPay | `POST /transactions`, puis `/transactions/{id}/token` et GET de statut | confirmé statiquement |
| FedaPay → webhook | URL publique du backend, encore inconnue | à fournir par Stane ; ce n'est pas une cible WG navigateur |
| frontend public | `window.location.origin` via chemins relatifs | hostname de déploiement non fourni |
| API publique séparée | aucune URL absolue dans le frontend | pas de cible à autoriser |
| Supabase navigateur | `VITE_SUPABASE_URL` seulement si configurée | aucune valeur publique de déploiement vérifiable dans ce workspace |
| portail legacy | `deogracias.bj` est mentionné comme dns-name local dans l'analyse legacy | observation historique, non validée comme cible publique |

Le stub de test `https://pay.fedapay.com/x` n'est **pas** une preuve d'un domaine FedaPay réel et ne doit pas être ajouté à la liste.

### 3. Liste Walled Garden — décision avant écriture

Décision actuelle :

```text
WALLED GARDEN DE PRODUCTION = VIDE
WALLED GARDEN IP LIST       = VIDE
```

Aucune entrée ne doit être ajoutée tant que les éléments suivants ne sont pas prouvés :

- hostname public exact du frontend ;
- hostname API si le navigateur appelle une origine distincte — actuellement le contrat est same-origin `/api/*` ;
- hostname exact de la page de paiement FedaPay renvoyée par une transaction sandbox contrôlée ;
- éventuel hostname d'authentification réellement requis avant login ;
- résolution DNS et comportement HTTP/HTTPS observés depuis un téléphone non authentifié.

Candidats futurs, **non autorisés à ce stade** :

```text
frontend_public_host       # si le portail paiement est servi hors routeur
api_public_host            # seulement si l'API n'est pas same-origin
fedapay_checkout_host      # valeur exacte capturée depuis redirect_url sandbox
supabase_auth_host         # seulement si un flux pré-authentification le requiert
```

Interdits :

```text
*.fedapay.com
*.supabase.co
example.com
localhost / 127.0.0.1
IP privées ou wildcard non justifiés
CDN non observé
ouverture Internet générale
```

Les webhooks FedaPay sont serveur-à-serveur et ne constituent pas une autorisation captive destinée au client.

### 4. Test du portail captif — protocole read-only

Le test physique est bloqué ici par l'absence d'accès au MikroTik et au Wi-Fi réel. Stane doit exécuter, sans modifier la configuration :

```routeros
/ip hotspot print detail
/ip hotspot profile print detail
/ip hotspot walled-garden print detail
/ip hotspot walled-garden ip-list print detail
/ip dns print
/ip dns static print
/ip firewall nat print detail
```

Sur un téléphone **non authentifié** :

1. rejoindre le SSID Déo Gracias ;
2. ouvrir une URL HTTP de test et enregistrer la redirection exacte vers le portail ;
3. ouvrir la même cible en HTTPS et enregistrer le comportement verbatim ;
4. vérifier l'accès à l'URL locale du portail et le chargement de tous les assets ;
5. tenter un voucher invalide : aucun accès ne doit être accordé ;
6. utiliser un voucher de test valide : vérifier `alogin`, navigation, `status` et `logout` ;
7. vérifier qu'une nouvelle requête HTTP/HTTPS ne boucle pas sur le portail après authentification ;
8. conserver les sorties RouterOS et captures avec horodatage.

Les tests `example.com` du GUIDE-04 sont un ancien dry-run historique. Ils ne doivent pas être réintroduits comme ouverture de production.

### 5. Gate avant toute écriture MikroTik

État actuel : **NO-GO**.

Aucune commande suivante ne doit être exécutée pour IMP-28 avant validation documentée :

```routeros
/ip hotspot walled-garden add
/ip hotspot walled-garden set
/ip hotspot walled-garden remove
/ip hotspot walled-garden ip-list add
/ip firewall nat add
```

La prochaine décision doit contenir :

- URLs frontend/API réellement déployées ;
- environnement FedaPay utilisé ;
- `redirect_url` sandbox observée et hostname extrait ;
- sortie initiale Walled Garden ;
- résultats HTTP/HTTPS du téléphone non authentifié ;
- preuve login valide/invalide, status et logout ;
- liste minimale proposée, ou confirmation que le garden reste vide.

## FICHIERS

- `apps/frontend/src/api.ts` — origine relative et conversion des pannes réseau en `status 0`.
- `apps/frontend/src/format.ts` — messages backend indisponible.
- `apps/frontend/src/checkout/Checkout.tsx` — états d'erreur, attente et reprise.
- `apps/frontend/src/checkout/polling.ts` — reconciliation bornée issue d'IMP-27.
- `apps/frontend/src/api.test.ts` — tests offline, `503` et origine `/api`.
- `apps/frontend/e2e/checkout.spec.ts` — deux scénarios navigateur backend indisponible.
- `apps/frontend/vite.config.ts` — proxy local uniquement.
- `apps/backend/src/fedapay.ts` — endpoints sandbox/live réellement codés.
- `docs/field-guides/GUIDE-04-R3-WG-GRIDA.md` — protocole physique historique, à exécuter sans écriture pour cette vague.
- `docs/infrastructure/portal-legacy-analysis.md` — comportement et défauts du portail legacy.
- `docs/IMP-28_VAGUE_4.md` — présent résultat, inventaire et gate no-write.

## TEST

- `npm run typecheck` : vert.
- `npm test` : vert — backend `158 passed`, frontend `39 passed`, connector `46 passed`, shared `45 passed`; les 49 tests PostgreSQL sont ignorés sans `DATABASE_URL`.
- `npm run build` : vert.
- Playwright : **10 passed** — les 7 scénarios IMP-27 plus backend offline au chargement, backend `503` au chargement et offline pendant la commande.
- Vérification statique des domaines : frontend en `/api/*` relatif ; proxy local `127.0.0.1` non production ; FedaPay sandbox/live limité aux URLs présentes dans `fedapay.ts` ; aucune URL publique frontend/API disponible dans le repository.
- CI GitHub du commit `7d6bd0df05313f828bdc0b455a43e851c536a45b` : **4/4 checks verts** — Gitleaks, Typecheck + tests, migrations PostgreSQL 16 et migrations PostgreSQL 17.
- Test captif MikroTik réel : **NON EXÉCUTÉ**, accès physique absent.
- Écriture MikroTik : **AUCUNE**.

## RÉSULTAT

La Vague 4 est **complète côté code/tests et documentée**. Elle reste `PARTIAL` au niveau global parce que les dépendances externes — domaine public réel, redirect FedaPay sandbox, portail captif physique et MikroTik — sont explicitement différées. Le Walled Garden reste vide et aucune écriture MikroTik n'a été exécutée.
