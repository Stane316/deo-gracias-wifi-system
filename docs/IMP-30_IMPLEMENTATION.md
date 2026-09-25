# IMP-30 — Overview + santé

## Statut

`CODE-FIRST — implémentation locale en attente de commit/push et CI GitHub`.

IMP-30 complète la vue `/admin` sans faire du frontend une source de vérité : les KPI,
les ventes par plan, l'inventaire, l'activité et la santé système viennent du backend.

## Périmètre réalisé

- `sales_count` et chiffre d'affaires confirmés du jour depuis les données persistées ;
- ventes confirmées regroupées par offre ;
- inventaire global et alertes de stock basées sur `AVAILABLE + RELEASED` ;
- activité récente issue de l'audit et des incidents ;
- dernière synchronisation, état, volumes pending/success/failed et dernière erreur ;
- incidents ouverts ;
- heartbeat authentifié du Connector ;
- état honnête du Connector :
  - `ONLINE` si heartbeat reçu depuis au plus 2 minutes ;
  - `UNKNOWN` entre 2 et 5 minutes ou sans heartbeat ;
  - `OFFLINE` au-delà de 5 minutes ;
- version du Connector et métadonnées RouterOS si elles sont communiquées ;
- réponse mobile lisible avec CA, ventes, tickets, incidents et état système.

## Contrat backend

### Dashboard

`GET /api/admin/dashboard` retourne notamment :

- `today.sales_count` ;
- `today.revenue_fcfa` ;
- `sales_by_offer` ;
- `inventory` et `inventory.low_stock` ;
- `recent_activity` ;
- `system.connector_state` ;
- `system.connector_last_contact_at` ;
- `system.sync_state`, `last_sync_at`, `last_sync_state`, `last_sync_error` ;
- compteurs de synchronisation et `incidents_open`.

### Heartbeat

`POST /api/connector/heartbeat` exige le token Connector et un body strict :

```json
{
  "connector_id": "connector-calavi-01",
  "version": "0.1.0",
  "router_model": "RB951Ui-2HnD",
  "routeros_version": "6.49.17"
}
```

Le heartbeat ne crée aucune écriture MikroTik. Il enregistre seulement le dernier signal
authentifié côté backend.

## Migration

- `supabase/migrations/0013_connector_heartbeats.sql`
- `supabase/down/0013_connector_heartbeats.sql`

La table est réservée au backend `service_role`; aucune lecture directe n'est exposée aux
rôles public ou authenticated.

## Vérification des six questions de `docs/09_ADMIN_DASHBOARD.md` §108

| Question | Réponse code-first |
|---|---|
| Combien ai-je vendu aujourd'hui ? | `today.sales_count` |
| Combien ai-je encaissé ? | `today.revenue_fcfa` sur paiements `CONFIRMED` |
| Quels plans se vendent ? | `sales_by_offer` |
| Combien de tickets numériques restent ? | `inventory.available` et alertes par offre |
| Y a-t-il un problème ? | incidents ouverts, stock bas, sync ERROR et activité |
| Le système fonctionne-t-il ? | Connector heartbeat + état de synchronisation |

## Hors preuve / différé

- aucun heartbeat d'un Connector réel n'a été exécuté dans cette session ;
- aucune connexion RouterOS réelle, écriture MikroTik ou validation physique du portail ;
- la configuration externe Supabase reste une action manuelle de Stane ;
- le Connector reste `UNKNOWN` tant qu'il ne publie pas un heartbeat authentifié.

Ces points restent dans `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md` et ne sont pas présentés
comme réalisés.
