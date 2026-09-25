# GUIDE-11 — Préparation W2/P6 : FedaPay réel + auth admin Supabase

> Statut au 25/09/2026 : **préparation locale livrée ; aucun secret, aucune
> migration distante et aucun paiement réel exécuté par l'agent**.
>
> Décisions validées :
> - FedaPay : **sandbox contrôlée, puis passage live sur feu vert explicite** ;
> - admin : **Supabase Auth email + mot de passe** ;
> - URL backend publique HTTPS : **pas encore disponible**.

## 1. Ce qui est déjà dans le code

### FedaPay

- `apps/backend/src/fedapay.ts` utilise `https://sandbox-api.fedapay.com/v1` en
  sandbox et `https://api.fedapay.com/v1` en live.
- La clé secrète reste côté backend.
- `POST /orders/:id/pay` crée la transaction à partir du snapshot de prix
  serveur et retourne le lien sécurisé FedaPay.
- `POST /webhooks/fedapay` lit le corps JSON brut, vérifie
  `X-FEDAPAY-SIGNATURE`, contrôle la tolérance temporelle, la devise XOF, le
  montant et déduplique l'événement avant de confirmer la commande.
- Le frontend ne confirme jamais le paiement : seul le webhook signé fait foi.

### Auth admin

- `apps/backend/src/auth.ts` vérifie le Bearer token via
  `SUPABASE_URL/auth/v1/user`.
- Le rôle est lu dans `app_metadata.role`.
- Seuls `ADMIN` et `SUPER_ADMIN` sont autorisés.
- Chaque accès accepté ou refusé est audité par le backend.
- `apps/frontend/src/supabase-auth.ts` fournit maintenant la connexion
  email/mot de passe et le renouvellement de session ; le rôle n'est jamais
  décidé par le navigateur.

## 2. Variables d'environnement

### Backend — jamais dans le frontend

```dotenv
APP_ENV=local                         # local | test | staging | production
DATABASE_URL=postgres://...
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_ANON_KEY=<clé publique>
FEDAPAY_ENVIRONMENT=sandbox           # live seulement après validation
FEDAPAY_SECRET_KEY=<secret FedaPay>
FEDAPAY_WEBHOOK_SECRET=<secret endpoint webhook>
TICKET_VAULT_KEY=<phrase longue>
```

### Variables publiques Vite

```dotenv
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<clé publique>
```

Ne jamais mettre dans `VITE_*` : `FEDAPAY_SECRET_KEY`,
`FEDAPAY_WEBHOOK_SECRET`, `DATABASE_URL`, `TICKET_VAULT_KEY`,
`DEV_ADMIN_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY` ou toute clé secrète.

### Modes DEV

```dotenv
AUTH_DEV_MODE=1
PAYMENT_DEV_MODE=1
DEV_ADMIN_TOKEN=<local uniquement>
```

Ces variables restent réservées à `APP_ENV=local` ou `APP_ENV=test`.
`APP_ENV=staging` et `APP_ENV=production` les refusent. En production, le
backend refuse également de démarrer si l'une des variables critiques manque,
si FedaPay n'est pas en `live`, ou si `DEV_ADMIN_TOKEN` est présent.

Le contrôle est dans `apps/backend/src/runtime-config.ts` et est exécuté avant
la création du pool PostgreSQL dans `server.ts`. `APP_ENV` et `DATABASE_URL`
sont obligatoires ; les flags `AUTH_DEV_MODE`, `PAYMENT_DEV_MODE`, `PORT` et
`WORKERS` refusent les valeurs ambiguës. Les erreurs 5xx génériques ne renvoient
pas le message interne brut, et le diagnostic PostgreSQL ne journalise que la
cible réseau protocole/hôte/port, jamais l'URI complète.

## 3. Configurer Supabase Auth — GUI propriétaire

Aucune de ces actions ne doit être automatisée par l'agent sur le projet distant.

1. Dashboard Supabase → **Authentication → Providers → Email**.
2. Activer le fournisseur Email et choisir la politique de confirmation adaptée
   au compte admin.
3. Créer ou inviter le compte administrateur.
4. Dashboard → **Authentication → Users** → ouvrir le compte → **App metadata**.
5. Poser exactement :

```json
{"role":"SUPER_ADMIN"}
```

6. Ne pas poser ce rôle dans `user_metadata` : ce champ est modifiable par
   l'utilisateur et ne constitue pas une autorité d'autorisation.
7. Pour le navigateur, recopier seulement `Project URL` et la clé publique dans
   `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`.
8. Tester la connexion sur `#/admin`. Le backend doit répondre `200` à
   `GET /admin/me` pour un compte autorisé et `403` pour un compte sans rôle.

La MFA peut ensuite être activée dans Supabase pour le compte principal ; elle
ne doit pas être simulée dans l'application.

## 4. Configurer FedaPay — d'abord sandbox

Dans le Dashboard FedaPay :

1. utiliser le compte **sandbox/test** et récupérer la clé secrète sandbox ;
2. créer un endpoint webhook HTTPS uniquement lorsque le backend public existe ;
3. écouter au minimum `transaction.approved`, `transaction.declined` et
   `transaction.canceled` ;
4. récupérer le secret propre à cet endpoint ;
5. placer les deux secrets dans l'environnement backend, jamais dans le dépôt ;
6. utiliser `FEDAPAY_ENVIRONMENT=sandbox`.

URL applicative attendue :

```text
POST https://<backend-public>/webhooks/fedapay
```

Tant que l'URL publique HTTPS n'existe pas, le test réel du webhook FedaPay est
**bloqué** : un serveur local `127.0.0.1` ne peut pas recevoir le webhook distant.

## 5. Séquence de validation sandbox

### Préconditions

- base Supabase ou Postgres de test migrée, migration 0012 comprise ;
- offres et stock de test disponibles ;
- backend exposé par une URL HTTPS de test ;
- endpoint FedaPay configuré avec le secret correspondant ;
- `APP_ENV=staging` ou environnement contrôlé sans modes DEV ;
- aucun secret imprimé dans le terminal ou ajouté à Git.

### Scénario nominal

1. `GET /offers` retourne les prix issus du backend.
2. Créer une commande avec une `Idempotency-Key` unique.
3. Appeler `POST /orders/:id/pay`.
4. Vérifier que la réponse contient un `redirect_url` FedaPay et que le
   navigateur n'appelle pas directement l'API FedaPay avec une clé secrète.
5. Effectuer un paiement sandbox autorisé par FedaPay.
6. Vérifier la réception du webhook signé.
7. Vérifier dans la base : événement enregistré, paiement `CONFIRMED`, commande
   avancée, ticket livré.
8. Rejouer exactement le webhook : la réponse doit rester idempotente et ne pas
   créer un deuxième ticket.
9. Envoyer un webhook avec signature, montant ou devise incorrects : aucune
   confirmation ne doit être créée.
10. Vérifier `audit_logs` et les logs applicatifs sans secret.

Le test doit être documenté avec : identifiant de transaction FedaPay sandbox,
identifiant de commande, identifiant de l'événement webhook, résultat du rejeu
et résultat du contrôle de montant. Ne pas publier de données personnelles.

## 6. Passage live — feu vert séparé obligatoire

Le passage live est une opération distincte de la préparation du code.

Avant toute clé live :

- compte marchand et vérifications FedaPay validés par le propriétaire ;
- URL backend publique HTTPS stable ;
- webhook live configuré et secret live différent du sandbox ;
- sauvegarde et procédure de rollback vérifiées ;
- stock de production distingué du stock de test ;
- compte admin Supabase testé ;
- fenêtre de test et plafond de dépense approuvés ;
- aucun mode DEV actif.

Bascule uniquement par variables d'environnement, puis redémarrage contrôlé :

```dotenv
APP_ENV=production
FEDAPAY_ENVIRONMENT=live
FEDAPAY_SECRET_KEY=<clé live, hors dépôt>
FEDAPAY_WEBHOOK_SECRET=<secret webhook live, hors dépôt>
AUTH_DEV_MODE=0
PAYMENT_DEV_MODE=0
```

Le premier achat live doit être une transaction contrôlée, au montant et au
compte convenus par le propriétaire. Après confirmation, vérifier le paiement,
le ticket, la livraison, l'audit et le rapprochement avant toute ouverture.

## 7. Tests locaux livrés

```bash
cd deo-gracias-wifi-system
npm install --no-audit --no-fund
npm run typecheck
npm test
```

Les tests ajoutés couvrent :

- configuration complète/incomplète et interdiction des modes DEV ;
- connexion Supabase email/mot de passe ;
- renouvellement de session ;
- transformation d'un refus Supabase en message générique.

Ces tests sont des tests de contrat locaux. Ils ne prouvent pas l'accès à votre
compte Supabase ni la réception d'un webhook FedaPay tant que les configurations
GUI et l'URL publique n'ont pas été réalisées.

## 8. Rollback opérationnel

En cas d'anomalie :

1. arrêter les nouvelles ventes en retirant temporairement la disponibilité des
   offres ou via la procédure d'exploitation validée ;
2. conserver les commandes et événements, ne pas supprimer les preuves ;
3. remettre l'environnement FedaPay contrôlé précédent ;
4. vérifier les paiements déjà approuvés dans le Dashboard FedaPay ;
5. relancer la réconciliation et documenter l'incident ;
6. ne jamais transformer manuellement une commande en `PAID` depuis le frontend.

L'agent s'arrête après la préparation W2/P6. **IMP-27 commencera uniquement
après validation de cette préparation et, séparément, après le test sandbox.**
