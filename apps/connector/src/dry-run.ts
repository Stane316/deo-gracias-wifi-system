/**
 * IMP-21 — Connector DRY-RUN (blueprint : « dry-run sur fixtures »).
 *
 * Le DryRunConnector joue le rôle du routeur RB951 en mémoire : il reçoit les
 * opérations de la file `mikrotik_sync` (payloads produits par IMP-18) et les
 * applique à un inventaire hotspot fictif, avec les validations du contrat
 * Mikmon §3/§5. AUCUNE écriture routeur réelle avant W2 (contrat §4.5).
 *
 * Injection d'échecs (`failNext`) pour tester le retry/backoff côté backend.
 */
import { OFFERS } from '../../../packages/shared/src/index.js';
import { extractVoucherComment, type HotspotUserRecord } from './hotspot-parser.js';

/** Profils connus du routeur : Grille A + legacy (contrat Mikmon §5). */
export const KNOWN_PROFILES: readonly string[] = [
  ...OFFERS.map((o) => o.mikrotikProfile),
  '1-HEURE',      // legacy hors Grille A (à statuer IMP-35)
  'Admin-free',   // accès gratuit (inventaire à figer IMP-35)
  'default',
];

export interface RouterOpResult {
  ok: boolean;
  /** Code d'erreur stable (échec) — alimente `result.error.code` en base. */
  code: string | null;
  message: string | null;
  /** Détail applicatif (succès) — alimente `result` en base. */
  detail: Record<string, unknown> | null;
}

const ROUTER_NAME_RE = /^dg[a-z0-9]{6}$/;

export class DryRunConnector {
  private users = new Map<string, HotspotUserRecord>();
  private failuresLeft = 0;
  private failureCode = 'router_unreachable';
  private failureMessage = 'dry-run : échec injecté';

  constructor(seed: HotspotUserRecord[] = []) {
    for (const user of seed) this.users.set(user.name, user);
  }

  /** Injecte N échecs consécutifs (consommés par les prochaines opérations). */
  failNext(times: number, code = 'router_unreachable', message = 'dry-run : échec injecté'): void {
    this.failuresLeft = Math.max(0, times);
    this.failureCode = code;
    this.failureMessage = message;
  }

  /** Inventaire courant (équivalent `/ip hotspot user print detail`). */
  inventory(): HotspotUserRecord[] {
    return [...this.users.values()].map((u) => ({ ...u }));
  }

  /** Applique une opération de la file. Ne lève jamais : le résultat porte l'erreur. */
  dispatch(operation: string, payload: Record<string, unknown>): RouterOpResult {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      return { ok: false, code: this.failureCode, message: this.failureMessage, detail: null };
    }
    switch (operation) {
      case 'create_ticket':
        return this.applyCreateTicket(payload);
      case 'disable_ticket':
        return this.applyDisableTicket(payload);
      case 'read_status':
      case 'refresh_inventory':
        return this.applyInventoryRead();
      default:
        return { ok: false, code: 'unsupported_operation', message: `opération inconnue : ${operation}`, detail: null };
    }
  }

  private applyCreateTicket(payload: Record<string, unknown>): RouterOpResult {
    const name = typeof payload['name'] === 'string' ? payload['name'] : null;
    const profile = typeof payload['profile'] === 'string' ? payload['profile'] : null;
    const limitUptime = typeof payload['limit_uptime'] === 'string' ? payload['limit_uptime'] : null;
    const comment = typeof payload['comment'] === 'string' ? payload['comment'] : null;
    if (!name || !ROUTER_NAME_RE.test(name)) {
      return { ok: false, code: 'invalid_name', message: 'name attendu : dg + 6 caractères [a-z0-9] (contrat §3.2)', detail: null };
    }
    if (!profile || !KNOWN_PROFILES.includes(profile)) {
      return { ok: false, code: 'invalid_profile', message: `profil inconnu : ${String(profile)} (contrat §5)`, detail: null };
    }
    if (!limitUptime || limitUptime.length === 0) {
      return { ok: false, code: 'invalid_limit_uptime', message: 'limit-uptime requis (contrat §3.4)', detail: null };
    }
    if (!extractVoucherComment(comment)) {
      return { ok: false, code: 'invalid_comment', message: 'comment attendu : vc-<seq>-<mm.dd.yy>- (contrat §3.3)', detail: null };
    }
    if (this.users.has(name)) {
      return { ok: false, code: 'duplicate_user', message: `user déjà présent sur le routeur : ${name}`, detail: null };
    }
    this.users.set(name, { name, profile, comment, limitUptime, disabled: false });
    return {
      ok: true,
      code: null,
      message: null,
      detail: { applied: 'create_ticket', router: 'dry-run', name, profile, comment },
    };
  }

  private applyDisableTicket(payload: Record<string, unknown>): RouterOpResult {
    const name = typeof payload['name'] === 'string' ? payload['name'] : null;
    if (!name) {
      return { ok: false, code: 'invalid_name', message: 'name requis pour disable_ticket', detail: null };
    }
    const user = this.users.get(name);
    if (!user) {
      return { ok: false, code: 'user_not_found', message: `user absent du routeur : ${name}`, detail: null };
    }
    this.users.set(name, { ...user, disabled: true });
    return { ok: true, code: null, message: null, detail: { applied: 'disable_ticket', router: 'dry-run', name } };
  }

  private applyInventoryRead(): RouterOpResult {
    const users = this.inventory();
    const vouchers = users
      .map((u) => ({ name: u.name, voucher: extractVoucherComment(u.comment), disabled: u.disabled }))
      .filter((u) => u.voucher != null);
    const anomalies = users
      .filter((u) => u.comment === null || u.comment === '')
      .map((u) => ({ name: u.name, anomaly: 'comment_vide' }));
    return {
      ok: true,
      code: null,
      message: null,
      detail: { user_count: users.length, voucher_count: vouchers.length, anomalies },
    };
  }
}
