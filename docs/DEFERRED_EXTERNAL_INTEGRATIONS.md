# Deferred External Integrations

> Politique active : le code, les tests locaux, les mocks, les fixtures et la documentation sont réalisés dès qu'ils sont indépendants. Les validations physiques et les configurations externes restent différées jusqu'à la phase finale d'intégration.

## Statut global

```text
CODE / TESTS LOCAUX / CI       : priorité immédiate
MIKROTIK RÉEL                  : DEFERRED
PORTAIL CAPTIF RÉEL           : DEFERRED
FEDAPAY SANDBOX/LIVE RÉEL     : DEFERRED
SUPABASE DISTANT / PRODUCTION : DEFERRED
```

Aucune configuration externe ne doit être considérée comme exécutée parce qu'un guide ou un adapter existe dans le repository.

---

## MikroTik

### À faire plus tard

- configuration réelle du routeur ;
- modification HotSpot ;
- Walled Garden et Walled Garden IP List ;
- firewall, NAT et DNS ;
- profils et utilisateurs techniques ;
- connexion de l'API RouterOS réelle ;
- Connector connecté au routeur ;
- synchronisation, réconciliation et écritures de tickets ;
- backup/restore physique et test de coupure.

### Pourquoi différé

Stane ne souhaite pas utiliser maintenant l'accès physique et l'accès RouterOS réel. La Vague 4 doit donc produire les contrats, adapters, dry-runs, fixtures et gates sans écrire sur le routeur.

### Implémentations concernées

```text
IMP-04, IMP-05, IMP-23, IMP-24, IMP-28, IMP-33, IMP-38, IMP-39, IMP-40
```

### Ce qui est disponible maintenant

- client RouterOS abstrait et tests de protocole ;
- Connector read-only/dry-run ;
- file de synchronisation et états ;
- rapports de réconciliation sur fixtures ;
- protocole Walled Garden read-only ;
- décision IMP-28 : Walled Garden de production vide tant que les domaines et preuves ne sont pas confirmés.

### Prérequis de validation finale

- accès au routeur réel ;
- export et backup vérifiés ;
- utilisateur technique et permissions validés ;
- plan de rollback ;
- liste de domaines confirmée ;
- fenêtre d'intervention approuvée par Stane ;
- tests captifs et réconciliation réels.

### Validation finale

```text
À exécuter uniquement pendant la phase finale :
AUDIT → BACKUP → lecture read-only → écriture minimale → test → rollback/retest → validation Stane
```

---

## Captive Portal

### À faire plus tard

- téléphone connecté au Wi-Fi réel ;
- redirection captive HTTP/HTTPS ;
- comportement DNS captif ;
- chargement des assets du portail ;
- authentification HotSpot ;
- voucher invalide/valide ;
- `alogin`, `status`, `logout` ;
- navigation avant et après authentification ;
- test avec Walled Garden réellement configuré.

### Pourquoi différé

Le portail dépend du MikroTik, du réseau local et d'un téléphone de test. Ces éléments ne sont pas accessibles pendant la phase code-first.

### Implémentations concernées

```text
IMP-04, IMP-05, IMP-25, IMP-26, IMP-28, IMP-38, IMP-39
```

### Ce qui est disponible maintenant

- archive legacy conservée ;
- analyse des pages, assets et défauts documentée ;
- tests frontend simulés offline/backend indisponible ;
- protocole de test captif read-only ;
- aucune modification du portail réel.

### Prérequis de validation finale

- SSID et HotSpot réels accessibles ;
- voucher de test invalide et valide ;
- téléphone non authentifié ;
- captures et sorties RouterOS horodatées ;
- résultat HTTP/HTTPS verbatim ;
- confirmation du domaine captive DNS.

### Validation finale

Le résultat doit être documenté avant toute entrée Walled Garden :

```text
redirection → assets → erreur → login valide → status → logout → navigation
```

---

## FedaPay

### À faire plus tard

- configuration du compte marchand ;
- KYC/KYB ;
- clés sandbox/live gérées par Stane ;
- webhook HTTPS public ;
- transaction sandbox réellement exécutée ;
- validation des moyens de paiement ;
- paiement réel ;
- reversement ;
- remboursement ;
- vérification des URLs de checkout réellement utilisées.

### Pourquoi différé

L'accès au compte marchand et aux clés FedaPay est volontairement différé. Le code doit rester testable avec l'interface `PaymentProvider`, des providers de test et des événements webhook contrôlés.

### Implémentations concernées

```text
IMP-14, IMP-20, IMP-25, IMP-27, IMP-28, IMP-35, IMP-36, IMP-39
```

### Ce qui est disponible maintenant

- `PaymentProvider` abstrait ;
- adapter `FedaPayClient` sandbox/live ;
- endpoints codés : transactions, token checkout et statut ;
- validation HMAC du webhook ;
- idempotence et fixtures ;
- tests sans réseau réel ;
- distinction explicite mock/simulation versus intégration réelle.

### Prérequis de validation finale

- compte marchand validé ;
- environnement sandbox d'abord ;
- `redirect_url` observée et hostname confirmé ;
- secret webhook configuré ;
- endpoint backend public ;
- transaction de test contrôlée ;
- accord explicite avant live ;
- aucune transaction réelle non validée.

### Validation finale

```text
sandbox contrôlée → webhook signé → allocation/délivrance → reconciliation → go/no-go live
```

---

## Supabase et services cloud

### À faire plus tard

- configuration Supabase distante ;
- Auth email/mot de passe admin en environnement réel ;
- JWT, rôles, RLS et refresh/logout sur projet distant ;
- `VITE_SUPABASE_URL` et clés publiques du déploiement ;
- connexion PostgreSQL distante ;
- validation backups/restore et observabilité.

### Pourquoi différé

Les actions sur le projet Supabase distant sont manuelles et appartiennent à Stane. Les tests locaux et PostgreSQL de CI restent la preuve disponible maintenant.

### Implémentations concernées

```text
IMP-13, IMP-25, IMP-29, IMP-30, IMP-31, IMP-32, IMP-33, IMP-35, IMP-37
```

### Validation finale

Les migrations, RLS, Auth, variables et données doivent être validés sur le projet distant après backup et avant le déploiement production.

---

## Règle de distinction

```text
GUIDE CRÉÉ                         ≠ CONFIGURATION EXÉCUTÉE
ADAPTER RÉEL CODÉ                 ≠ SERVICE EXTERNE VALIDÉ
MOCK / FIXTURE / DRY-RUN          ≠ PRODUCTION
TEST POSTGRES CI                  ≠ SUPABASE DISTANT
URL FedaPay codée                 ≠ redirect_url réellement observée
```

## Phase finale d'intégration

Ordre indicatif à recalculer avec les dépendances réelles :

```text
AUDIT GLOBAL
→ GUIDES ET PRÉREQUIS
→ BACKUPS
→ SUPABASE DISTANT
→ MIKROTIK READ-ONLY
→ PORTAIL CAPTIF
→ FEDAPAY SANDBOX
→ CONNECTOR
→ TESTS RÉELS
→ CORRECTIONS
→ RETEST
→ PRODUCTION
→ GO-LIVE
```

Aucune étape de cette séquence n'est exécutée automatiquement par le code-first workspace.
