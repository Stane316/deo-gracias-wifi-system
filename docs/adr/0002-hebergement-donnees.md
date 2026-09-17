# ADR 0002 — Hébergement, données et observabilité

- **Statut** : accepté (17/09/2026) — cohérent avec la validation propriétaire « Supabase confirmé » et le refus des défauts par habitude.
- **Contexte** : backend avec **workers persistants** (file d'ordres, webhook FedaPay avec retries, jobs de réconciliation Connector) + frontend statique +Connector sortant depuis le LAN du site (double NAT, aucune entrée entrante possible). Budget minimal, exploitation par un propriétaire non technique depuis Calavi.
- **Décision** :
  1. **Base de données : Supabase (Postgres, région EU)** — validé par le propriétaire ; RLS + migrations SQL suivies dans `supabase/migrations` (IMP-10/11).
  2. **Backend : Railway** (processus persistants, cron/schedulers natifs) — **Vercel/Netlify écartés pour le backend** car serverless : incompatibles avec workers persistants et connexions sortantes maintenues vers le Connector. Repli : Render.
  3. **Frontend : Cloudflare Pages** (statique, edge, gratuit généreux). Repli : Netlify.
  4. **DNS : Cloudflare** (gestion du domaine futur OD-2, TLS automatique).
  5. **Observabilité** : Sentry (erreurs), UptimeRobot (dispo externe), Healthchecks.io (preuves de vie des workers et du heartbeat Connector) — mise en place IMP-13/35.
  6. **Connector** : aucune exposition entrante ; il établit une connexion sortante authentifiée vers le backend (WebSocket/HTTPS) — compatible double NAT et avec l'API RouterOS restreinte au LAN (IMP-03).
- **Alternatives écartées** : VPS auto-géré (charge d'exploitation incompatible avec un propriétaire non technique) ; hébergement local au site (électricité/UPS insuffisants pour du public, double NAT).
- **Conséquences** : coûts mensuels faibles et prévisibles ; chaque couche a un repli nommé ; le jour du go-live, aucune brique ne dépend d'un accès entrant vers le Bénin.
