# Décision — Gel d’IMP-28 et gate d’ouverture d’IMP-29

Date : 2026-09-25

Statut : **APPROUVÉ POUR GEL DOCUMENTAIRE**

Périmètre : code-first, documentation et pilotage uniquement

## PROBLÈME

IMP-28 est complète côté code, tests et CI, mais ses validations physiques et externes restent différées. Après le push documentaire, il faut empêcher toute extension silencieuse d’IMP-28 et tout démarrage implicite d’IMP-29.

## CAUSE

Le code indépendant est disponible, tandis que les preuves suivantes ne sont pas accessibles ou autorisées dans cette phase :

- domaine public frontend/API confirmé ;
- redirect FedaPay sandbox réellement observée ;
- téléphone non authentifié sur le Wi-Fi réel ;
- routeur MikroTik et HotSpot réels ;
- compte, webhook et transactions FedaPay réels ;
- projet Supabase distant contrôlé.

## IMPACT

Sans gel explicite, une modification de domaine, de Walled Garden, de portail ou de paiement pourrait être interprétée comme une validation de production. Une implémentation IMP-29 pourrait également commencer avant l’audit du workspace et l’accord de Stane.

## DÉCISION

### 1. IMP-28 est gelée

```text
IMP-28 : FROZEN — PARTIAL / CODE COMPLETE / EXTERNAL DEPENDENCIES DEFERRED
```

Le gel signifie :

- aucun nouveau périmètre fonctionnel dans IMP-28 ;
- aucune écriture MikroTik, firewall, NAT, DNS ou Walled Garden ;
- aucun test captif physique présenté comme réalisé ;
- aucun paiement FedaPay réel ou test live ;
- aucune ouverture de domaine non observé ;
- aucune suppression ou réécriture du protocole no-write ;
- les mocks, fixtures et dry-runs restent explicitement non production.

Une correction critique de sécurité, de CI ou de régression reste possible uniquement si elle est documentée séparément et ne réouvre pas le périmètre fonctionnel sans décision explicite.

### 2. Les dépendances externes restent différées

La référence est :

```text
docs/DEFERRED_EXTERNAL_INTEGRATIONS.md
```

Elle reste la source de vérité pour MikroTik, portail captif, FedaPay et Supabase distant.

### 3. IMP-29 reste en attente

```text
IMP-29 : GATE PENDING — NO IMPLEMENTATION STARTED
```

Le prochain travail autorisé avant implémentation est uniquement un audit de reprise :

- vérifier le commit GitHub courant ;
- vérifier l’état local et les modifications non commitées ;
- distinguer les fondations admin déjà présentes du périmètre canonique IMP-29 ;
- confirmer les critères d’acceptation et les tests attendus ;
- obtenir le feu vert explicite de Stane.

## PREUVE DU GEL

```text
GitHub main : 7bb18db397325eb61b9640793055cea6d81ff558
CI          : 4/4 checks verts
IMP-27      : DONE
IMP-28      : FROZEN — CODE COMPLETE / EXTERNAL DEFERRED
IMP-29      : GATE PENDING
MikroTik    : aucune écriture
Portail     : aucun test physique
FedaPay    : aucun paiement réel
```

## FICHIERS DE RÉFÉRENCE

- `docs/IMPLEMENTATION_MASTER_PLAN.md`
- `docs/IMP-28_VAGUE_4.md`
- `docs/DEFERRED_EXTERNAL_INTEGRATIONS.md`
- `docs/decisions/DECISION-2026-09-25-IMP-28-FREEZE.md`

## PROCHAINE ÉTAPE AUTORISABLE

Attendre le feu vert explicite de Stane. Après ce feu vert seulement, lancer l’audit de reprise d’IMP-29 ; ne pas commencer l’implémentation avant la fin de cet audit.
