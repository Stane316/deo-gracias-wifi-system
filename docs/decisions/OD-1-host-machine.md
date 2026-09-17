# OD-1 — Machine hôte du Connector : aide à la décision (fenêtre physique)

> **Statut** : **CLOS au 17/09/2026** — décision : aucun hôte avant la prochaine fenêtre physique (E intérim impossible : le PC unique suit le propriétaire ; budget zéro ; pas de machine de récupération sur site). Voie « remote-first » validée (voir `DECISIONS-2026-09-17.md` D1/D3). Emplacement W2 retenu : zone onduleur, LAN via ports 4/5 libres du RB951.
> **Enjeu** : le Connector (IMP-21→24) est le seul pont entre la plateforme cloud et le routeur LAN. Sans hôte sur place, tout le volet remote (IMP-23+) attend la prochaine visite → retard de go-live. Les IMP-07→21 (backend/frontend) peuvent cependant avancer sans lui.

## 1. Contraintes techniques de l'hôte

1. **Sur le LAN 192.168.88.0/24** (Ethernet de préférence ; l'API du routeur est désormais restreinte au LAN — GUIDE-03).
2. **Node.js 20** (x86_64 ou arm64) + ~512 Mo RAM + ~10 Go disque.
3. **24/7** : démarrage auto au retour de courant (BIOS « AC power recovery » ou équivalent), pas de session utilisateur requise (service systemd/pm2).
4. **Consommation faible** (le site paie l'électricité ; coupures fréquentes → sur onduleur si disponible).
5. **Gestion à distance** : SSH sortant + healthcheck (IMP-11 stack) ; pas de besoin d'entrée entrante (le Connector appelle le backend, jamais l'inverse).
6. Emplacement : près du routeur, aéré, hors atteinte des clients.

## 2. Matrice des options

| Option | Coût estimé (FCFA, Cotonou) | 24/7 | Robustesse coupures | Node 20 | Verdict |
|---|---|---|---|---|---|
| **A. Machine de récupération déjà sur place** (vieux PC/portable oubliés) | 0 | moyenne (PC desktop OK si AC-recovery) | moyenne | oui si x86 récent (2012+) | ✅ à vérifier EN PREMIER (inventaire photos P5/P6 + test) |
| **B. Mini-PC occasion** (Dell OptiPlex Micro / HP EliteDesk / Lenovo Tiny, i3/i5 6e-8e gen, 8 Go, SSD) | 60 000–120 000 | excellente (10–15 W, AC-recovery standard) | bonne (SSD, redémarrage auto) | oui | ✅✅ **RECOMMANDÉE** si achat possible pendant la fenêtre |
| **C. Raspberry Pi 4/5 (4 Go) + alim officielle + boot SSD USB** | 45 000–90 000 (kit) | bonne | dépend de l'alim (qualité !) et du SSD (pas de SD) | oui (arm64) | ✅ repli si B introuvable ; EXIGER alim officielle + SSD |
| **D. Mini-PC neuf N100** | 150 000–250 000 | excellente | excellente | oui | ⚠️ sur-dimensionné pour le budget |
| **E. PC personnel du propriétaire (192.168.88.240)** | 0 | NON (éteint la nuit / emporté) | — | oui | ⚠️ **INTÉRIM UNIQUEMENT** : héberger les tests IMP-23/24 pendant les heures d'ouverture, en attendant B/C |
| **F. Box opérateur / routeur additionnel** | 0 | — | — | non | ❌ impossible |

**Recommandation de l'agent** : **B** (mini-PC occasion) en choix principal, **C** en repli, **A** si l'inventaire révèle une machine viable, **E** en intérim de test seulement. Critère de bascule B→C : disponibilité/price chez 2 fournisseurs de Cotonou appelés pendant la fenêtre.

## 3. Checklist de vérification SUR SITE (30 min, dont appels)

- [ ] **Inventaire physique** : toute machine inutilisée sur le site ? (photos P5) — âge, RAM, disque, démarre-t-elle ?
- [ ] **Coupures** : fréquence habituelle (questions au gérant/à votre mère) ? onduleur ou onduleur-rack présent ? (photo P4) — conditionne l'option E et le besoin onduleur pour B/C.
- [ ] **Emplacement** : coin/étagère près du routeur avec prise électrique + aération (photo P5).
- [ ] **Port LAN libre** : switch ou box avec port disponible pour l'hôte (photo P6) ; sinon prévoir un switch 5 ports (~5 000–10 000 F).
- [ ] **Appels fournisseurs** (2–3 à Cotonou : boutiques info d'occasion Ganhi/Dantokpa) : disponibilité + prix mini-PC occasion i3/i5 8 Go SSD ; disponibilité + prix kit Pi 4/5 alim officielle + SSD USB 120 Go.
- [ ] **Budget** : enveloppe décidée par vous (repère : B ≈ 60–120 kF, C ≈ 45–90 kF, + onduleur éventuel 30–60 kF).
- [ ] **Décision** : A / B / C / D + intérim E oui/non → me la communiquer dans le retour GUIDE-04 ; j'adapterai IMP-05 (provisioning) en conséquence.
- [ ] **Si achat** : garder ticket de caisse + note du modèle exact (CPU, RAM, disque) dans le retour ; ne PAS l'installer vous-même (IMP-05 le fera avec le guide dédié).

## 4. Conséquence si aucune décision pendant la fenêtre

IMP-05/23/24 (provisioning + install Connector) glissent à la prochaine visite physique ; le plan continue sur IMP-07→21 (backend, frontend, paiement sandbox) depuis Calavi ; go-live (IMP-39) retardé d'autant. **Coût du retard estimé : plusieurs semaines** — d'où l'intérêt de trancher maintenant, même pour l'option E+E-intérim.
