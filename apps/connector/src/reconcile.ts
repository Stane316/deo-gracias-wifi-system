/**
 * IMP-22 — Réconciliation READ-ONLY (contrat Mikmon §4.4) : compare l'état lu
 * sur le routeur (v0 : fixtures dry-run) avec l'attendu côté plateforme, SANS
 * aucune écriture routeur.
 *
 * Détections §4.4 :
 * - `comment_vide` : user hotspot sans comment (hors Admin-free, inventaire à
 *   figer en IMP-35 — compté à part, décision D13) ;
 * - `session_vc_active` : session live dont le comment est encore `vc-…`
 *   (conversion On-Login ratée) ;
 * - `ticket_paye_absent` : voucher digital attendu (file `mikrotik_sync`
 *   SUCCESS) absent ou désactivé côté routeur ;
 * - `ticket_inconnu` : user porteur d'un comment `vc-…` inconnu de la
 *   plateforme (ni digital attendu, ni empreinte legacy `sha256(name)`) ;
 * - `uptime_incoherent` : session dont uptime + session-time-left s'écarte du
 *   limit-uptime du profil au-delà de la tolérance (§4.2).
 */
import { createHash } from 'node:crypto';
import { extractVoucherComment, type HotspotUserRecord } from './hotspot-parser.js';
import {
  parseLimitUptime,
  type HotspotActiveRecord,
  type MikhmonJournalEntry,
} from './readonly-parsers.js';

export interface ExpectedDigitalVoucher {
  name: string;
  profile: string;
  comment: string;
}

/** Attendu plateforme (route `GET /connector/inventory/expected`, IMP-22). */
export interface PlatformExpected {
  digitalVouchers: ExpectedDigitalVoucher[];
  /** Empreintes sha256 des codes legacy (association par username = code, 0010). */
  legacyCodeHashes: string[];
}

export interface RouterObserved {
  users: HotspotUserRecord[];
  active: HotspotActiveRecord[];
  journal: MikhmonJournalEntry[];
}

export type ReadOnlyAnomalyKind =
  | 'comment_vide'
  | 'session_vc_active'
  | 'ticket_paye_absent'
  | 'ticket_inconnu'
  | 'uptime_incoherent';

export interface ReadOnlyAnomaly {
  kind: ReadOnlyAnomalyKind;
  detail: string;
}

export interface ReconcileReadOnlyReport {
  routerTotalSeen: number;
  byProfile: Record<string, number>;
  adminFreeSeen: number;
  journalSales: number;
  anomalies: ReadOnlyAnomaly[];
  violations: string[];
  status: 'OK' | 'MISMATCH';
}

/** Tolérance sur la cohérence uptime + time-left vs limit-uptime (§4.2). */
export const UPTIME_TOLERANCE_S = 60;

export function reconcileReadOnly(expected: PlatformExpected, observed: RouterObserved): ReconcileReadOnlyReport {
  const anomalies: ReadOnlyAnomaly[] = [];
  const legacy = new Set(expected.legacyCodeHashes);
  const digitalByName = new Map(expected.digitalVouchers.map((v) => [v.name, v]));

  const byProfile: Record<string, number> = {};
  let adminFreeSeen = 0;
  for (const user of observed.users) {
    if (user.profile === 'Admin-free') {
      adminFreeSeen += 1;
      continue;
    }
    byProfile[user.profile] = (byProfile[user.profile] ?? 0) + 1;
    const isVoucher = extractVoucherComment(user.comment) != null;
    if (!isVoucher && (user.comment == null || user.comment === '')) {
      anomalies.push({ kind: 'comment_vide', detail: `user=${user.name} profile=${user.profile}` });
    }
    if (isVoucher && !digitalByName.has(user.name) && !legacy.has(sha256(user.name))) {
      anomalies.push({ kind: 'ticket_inconnu', detail: `user=${user.name} comment=${user.comment ?? ''}` });
    }
  }

  const observedByName = new Map(observed.users.map((u) => [u.name, u]));
  for (const voucher of expected.digitalVouchers) {
    const seen = observedByName.get(voucher.name);
    if (!seen || seen.disabled) {
      anomalies.push({
        kind: 'ticket_paye_absent',
        detail: `name=${voucher.name} comment=${voucher.comment}`,
      });
    }
  }

  const limitByUser = new Map(observed.users.map((u) => [u.name, parseLimitUptime(u.limitUptime)]));
  for (const session of observed.active) {
    if (session.comment != null && session.comment.startsWith('vc-')) {
      anomalies.push({ kind: 'session_vc_active', detail: `user=${session.user} comment=${session.comment}` });
    }
    const limit = limitByUser.get(session.user);
    if (limit != null && session.sessionTimeLeftS != null) {
      const total = session.uptimeS + session.sessionTimeLeftS;
      if (Math.abs(total - limit) > UPTIME_TOLERANCE_S) {
        anomalies.push({
          kind: 'uptime_incoherent',
          detail: `user=${session.user} uptime+left=${total}s limit=${limit}s`,
        });
      }
    }
  }

  const counts = new Map<ReadOnlyAnomalyKind, number>();
  for (const a of anomalies) counts.set(a.kind, (counts.get(a.kind) ?? 0) + 1);
  const violations = [...counts.entries()].map(([kind, n]) => `${kind}:${n}`);

  return {
    routerTotalSeen: observed.users.length,
    byProfile,
    adminFreeSeen,
    journalSales: observed.journal.length,
    anomalies,
    violations,
    status: anomalies.length === 0 ? 'OK' : 'MISMATCH',
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
