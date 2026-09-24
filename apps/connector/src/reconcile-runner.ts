/**
 * IMP-24 — Runner de réconciliation READ-ONLY de bout en bout (contrat §4.4,
 * garde-fou INC-03) : attendu plateforme (backend) + observé routeur (v0 :
 * DryRunConnector ; W2 : RouterOsApiClient) => reconcileReadOnly => rapport au
 * backend qui persiste `reconciliation_runs` + alertes. AUCUNE écriture vers le
 * routeur : la branche écriture reste interdite avant décision IMP-25+ (contrat §4.5).
 *
 * Le transport est injectable (`InventoryTransport`) : en tests on branche un
 * adaptateur `app.inject` ; en W2, `HttpInventoryTransport` (fetch natif,
 * auth CONNECTOR_TOKEN blueprint §7).
 */
import type { HotspotUserRecord } from './hotspot-parser.js';
import type { HotspotActiveRecord, MikhmonJournalEntry } from './readonly-parsers.js';
import { reconcileReadOnly, type PlatformExpected, type ReconcileReadOnlyReport } from './reconcile.js';
import type { DryRunConnector } from './dry-run.js';
import type { RouterOsApiClient } from './routeros-client.js';

/** Observé routeur : users obligatoires ; sessions actives / journal en W2. */
export interface ObservedSource {
  users: HotspotUserRecord[];
  active?: HotspotActiveRecord[];
  journal?: MikhmonJournalEntry[];
}

/** Corps de `POST /connector/inventory/report` (schemas.ts, strict). */
export interface InventoryReportBody {
  router_total_seen: number;
  status: 'OK' | 'MISMATCH';
  violations: string[];
  anomalies: Array<{ kind: string; detail: string }>;
  by_profile: Record<string, number>;
  admin_free_seen: number;
  journal_sales: number;
}

export interface InventoryTransport {
  fetchExpected(): Promise<PlatformExpected>;
  sendReport(body: InventoryReportBody): Promise<{ runId: string; status: 'OK' | 'MISMATCH' }>;
}

/** Transport HTTP réel (fetch natif Node ≥ 18). Aucun secret loggé. */
export class HttpInventoryTransport implements InventoryTransport {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private headers(): Record<string, string> {
    return {
      'content-type': 'application/json',
      authorization: `Bearer ${this.token}`,
    };
  }

  async fetchExpected(): Promise<PlatformExpected> {
    const res = await fetch(`${this.baseUrl}/connector/inventory/expected`, {
      method: 'GET',
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`fetchExpected échoué : HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    return {
      digitalVouchers: ((body['digital_vouchers'] ?? []) as Array<Record<string, unknown>>).map((v) => ({
        name: String(v['name']),
        profile: String(v['profile']),
        comment: String(v['comment']),
      })),
      legacyCodeHashes: (body['legacy_code_hashes'] ?? []) as string[],
    };
  }

  async sendReport(body: InventoryReportBody): Promise<{ runId: string; status: 'OK' | 'MISMATCH' }> {
    const res = await fetch(`${this.baseUrl}/connector/inventory/report`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (res.status !== 201) throw new Error(`sendReport échoué : HTTP ${res.status}`);
    const created = (await res.json()) as Record<string, unknown>;
    return { runId: String(created['run_id']), status: created['status'] === 'MISMATCH' ? 'MISMATCH' : 'OK' };
  }
}

/** v0 (avant W2) : l'observé vient du DryRunConnector en mémoire. */
export function observedFromDryRun(router: DryRunConnector): ObservedSource {
  return { users: router.inventory(), active: [], journal: [] };
}

/** W2 : l'observé vient de l'API classique RouterOS (IMP-23, lecture seule). */
export async function observedFromRouterOs(client: RouterOsApiClient): Promise<ObservedSource> {
  return { users: await client.printHotspotUsers(), active: [], journal: [] };
}

export interface ReconciliationOutcome {
  runId: string;
  status: 'OK' | 'MISMATCH';
  report: ReconcileReadOnlyReport;
}

/**
 * Un cycle complet : attendu -> divergence -> rapport persisté côté backend.
 * Lève si le backend est injoignable ; ne lève jamais sur un MISMATCH
 * (c'est un résultat métier, porté par `status`).
 */
export async function runReconciliationOnce(
  transport: InventoryTransport,
  observed: ObservedSource,
): Promise<ReconciliationOutcome> {
  const expected = await transport.fetchExpected();
  const report = reconcileReadOnly(expected, {
    users: observed.users,
    active: observed.active ?? [],
    journal: observed.journal ?? [],
  });
  const { runId, status } = await transport.sendReport({
    router_total_seen: report.routerTotalSeen,
    status: report.status,
    violations: report.violations,
    anomalies: report.anomalies,
    by_profile: report.byProfile,
    admin_free_seen: report.adminFreeSeen,
    journal_sales: report.journalSales,
  });
  return { runId, status, report };
}
