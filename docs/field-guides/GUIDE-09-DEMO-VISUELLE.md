# GUIDE-09 — Démo visuelle locale (IMP-25)

> **Objectif** : voir et manipuler la plateforme complète sur votre PC —
> interface client (commande → paiement → ticket) et console d'administration
> (tableau de bord, tickets, réconciliation), branchées sur le backend réel et
> Postgres.
>
> **Statut** : IMP-25 livré. Paiement et connexion admin en **mode DEV**
> (variables explicites, jamais actives en production). Production = Supabase
> Auth + FedaPay réels (aucun changement de code, seulement les variables).

---

## 1. Prérequis

| Prérequis | Vérification |
|---|---|
| Node.js ≥ 20 | `node --version` |
| PostgreSQL local migré | `bash tools/db-migrate.sh up` (11 migrations) |
| Dépendances installées | `npm install` à la racine |

## 2. Variables d'environnement (mode démo)

Créez/copiez `.env` à la racine (jamais dans Git) :

```env
DATABASE_URL=postgres://postgres:VOTRE_MOT_DE_PASSE@127.0.0.1:5432/postgres
AUTH_DEV_MODE=1
DEV_ADMIN_TOKEN=choisissez-un-jeton-long-aleatoire
PAYMENT_DEV_MODE=1
CONNECTOR_TOKEN=choisissez-un-autre-jeton
```

| Variable | Rôle en démo | En production |
|---|---|---|
| `AUTH_DEV_MODE=1` | le code OTP client est affiché (pas de SMS) | absent (SMS ou OTP Supabase) |
| `DEV_ADMIN_TOKEN` | connexion admin par jeton statique | absent — Supabase Auth (rôle ADMIN) |
| `PAYMENT_DEV_MODE=1` | paiement simulé approuvable d'un clic | absent — FedaPay réel (webhook signé) |
| `CONNECTOR_TOKEN` | routes `/connector` actives | idem (valeur forte) |

Garde-fous codés en dur : le jeton admin DEV n'est actif **que si Supabase
n'est PAS configuré** ; le paiement DEV n'est actif **que si aucune clé
FedaPay n'est définie** ; `POST /webhooks/dev-approve` n'approuve **que** les
paiements au préfixe `DEV-`.

## 3. Lancer la démo

Deux terminaux :

```bash
# Terminal 1 — API (port 3001 par défaut ; PORT/HOST modifiables)
npm run start -w @dg/backend

# Terminal 2 — Interface (Vite, port 5173)
npm run dev -w @dg/frontend
```

Ouvrez **http://localhost:5173**.

> Variante production locale : `npm run build -w @dg/frontend` puis servir le
> dossier `apps/frontend/dist` derrière n'importe quel reverse proxy qui relaie
> `/api` vers le backend (le frontend n'appelle que des chemins relatifs).

## 4. Parcours client (onglet « Espace client »)

1. **Connexion** : entrez un numéro (ex. `0197250099`) → « Recevoir le code » :
   le code OTP s'affiche (mode DEV) et se pré-remplit → « Valider ».
2. **Offres** : les 6 offres de la Grille A s'affichent (prix servis par le
   backend, jamais recalculés côté navigateur — doc 10 §10.3).
3. **Commande** : cliquez une offre → la commande est créée (clé
   d'idempotence automatique) → « Payer ».
4. **Paiement** : référence `DEV-…` créée → « Simuler l'approbation » :
   c'est exactement le même chemin serveur que le webhook FedaPay réel
   (confirmation → allocation atomique → livraison).
5. **Ticket** : l'état passe à `DELIVERED` et « Mes tickets » affiche le
   ticket (préfixe du code seulement — jamais le code complet à l'écran, D2).

## 5. Console d'administration (onglet « Administration »)

Entrez le `DEV_ADMIN_TOKEN` :

- **Tableau de bord** (IMP-17) : revenu/commandes/paiements/tickets du jour,
  état système, inventaire.
- **Tickets** : statistiques détaillées par état/offre.
- **Réconciliation** (IMP-24) : runs `reconciliation_runs` (statut, attendu,
  vu, violations, anomalies) + alertes ouvertes avec bouton **Acquitter**.

Pour alimenter la vue depuis le « routeur » (dry-run) :

```bash
curl -X POST http://localhost:3001/connector/inventory/report \
  -H "Authorization: Bearer $CONNECTOR_TOKEN" -H 'content-type: application/json' \
  -d '{"router_total_seen":2,"status":"MISMATCH","violations":["ticket_paye_absent:1"],
       "anomalies":[{"kind":"ticket_paye_absent","detail":"name=dgxxxxxx comment=vc-001-09.24.26-"}],
       "by_profile":{"5-HEURES":1},"admin_free_seen":0,"journal_sales":0}'
```

## 6. Vérifications rapides

| Vérification | Commande | Attendu |
|---|---|---|
| API prête | `curl localhost:3001/readyz` | `{"status":"ready"}` |
| Offres | `curl localhost:3001/offers` | 6 offres Grille A |
| Jeton admin | `curl -H "Authorization: Bearer $DEV_ADMIN_TOKEN" localhost:3001/admin/me` | `role: ADMIN` |
| Tests complets | `npm test` (avec `DATABASE_URL`) | 265/265 |

## 7. Limites connues de la démo

- Pas de SMS réel : l'OTP est affiché (décision budget nul, IMP-13).
- Le « routeur » est simulé (DryRunConnector) jusqu'au W2 ; la vue
  réconciliation montre des rapports produits par le Connector (réels en W2).
- Les données créées en démo restent dans votre base locale (téléphones
  `0197…`, clés `dg-demo-…`) ; la base de production Supabase n'est jamais
  touchée par ce guide.
