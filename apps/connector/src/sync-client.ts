/**
 * IMP-21 — Client HTTP du contrat Connector (blueprint §5) : consomme la file
 * `mikrotik_sync` via `POST /connector/sync/claim` + `POST /connector/sync/:id/result`.
 *
 * Le transport est injectable (interface `SyncTransport`) : en dry-run/tests on
 * branche un faux transport ; en W2 on utilisera le transport HTTP réel vers le
 * backend (auth par CONNECTOR_TOKEN, blueprint §7).
 */
import type { DryRunConnector } from './dry-run.js';

export interface ClaimedOp {
  id: string;
  operation: string;
  payload: Record<string, unknown>;
  state: string;
  attempts: number;
}

export type ResultBody =
  | { success: true; result?: Record<string, unknown> }
  | { success: false; error: { code: string; message: string } };

export interface SyncTransport {
  claim(workerId: string): Promise<ClaimedOp | null>;
  reportResult(opId: string, body: ResultBody): Promise<void>;
}

/** Transport HTTP réel (fetch natif Node ≥ 18). Aucun secret loggé. */
export class HttpSyncTransport implements SyncTransport {
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

  async claim(workerId: string): Promise<ClaimedOp | null> {
    const res = await fetch(`${this.baseUrl}/connector/sync/claim`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ worker_id: workerId }),
    });
    if (res.status === 204) return null;
    if (!res.ok) throw new Error(`claim échoué : HTTP ${res.status}`);
    const body = (await res.json()) as Record<string, unknown>;
    return {
      id: String(body['id']),
      operation: String(body['operation']),
      payload: (body['payload'] ?? {}) as Record<string, unknown>,
      state: String(body['state']),
      attempts: Number(body['attempts'] ?? 0),
    };
  }

  async reportResult(opId: string, body: ResultBody): Promise<void> {
    const res = await fetch(`${this.baseUrl}/connector/sync/${encodeURIComponent(opId)}/result`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`reportResult échoué : HTTP ${res.status}`);
  }
}

export interface ConsumeOnceOutcome {
  claimed: boolean;
  opId: string | null;
  /** `success` : résolu en succès ; `retry` : échec reporté (RETRY/BLOCKED en base). */
  outcome: 'success' | 'retry' | null;
}

/**
 * Réclame UNE opération, l'applique au DryRunConnector, reporte le résultat.
 * Retourne `claimed: false` si la file est vide (204).
 */
export async function consumeOnce(
  transport: SyncTransport,
  router: DryRunConnector,
  workerId: string,
): Promise<ConsumeOnceOutcome> {
  const op = await transport.claim(workerId);
  if (!op) return { claimed: false, opId: null, outcome: null };

  const applied = router.dispatch(op.operation, op.payload);
  const body: ResultBody = applied.ok
    ? { success: true, ...(applied.detail ? { result: applied.detail } : {}) }
    : { success: false, error: { code: applied.code ?? 'unknown', message: applied.message ?? 'échec sans détail' } };
  await transport.reportResult(op.id, body);
  return { claimed: true, opId: op.id, outcome: applied.ok ? 'success' : 'retry' };
}

/** Vide la file jusqu'à épuisement (ou `maxOps`). Utile en dry-run local. */
export async function drainQueue(
  transport: SyncTransport,
  router: DryRunConnector,
  workerId: string,
  maxOps = 1000,
): Promise<{ processed: number; success: number; retry: number }> {
  let processed = 0;
  let success = 0;
  let retry = 0;
  for (let i = 0; i < maxOps; i++) {
    const step = await consumeOnce(transport, router, workerId);
    if (!step.claimed) break;
    processed += 1;
    if (step.outcome === 'success') success += 1;
    else retry += 1;
  }
  return { processed, success, retry };
}
