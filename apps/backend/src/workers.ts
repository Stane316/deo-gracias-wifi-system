/**
 * IMP-20 — Workers / jobs in-process (blueprint §6, Phase 1 à coût nul).
 *
 * Trois jobs, périodes injectables (tests) :
 * - `order-expiry` (cron 1 min) : commandes `PAYMENT_PENDING` au-delà du TTL
 *   => EXPIRED + leurs paiements `PENDING` => EXPIRED (transitions 0009) ;
 *   tickets `RESERVED` bloqués au-delà du TTL => RELEASED puis AVAILABLE.
 * - `webhook-sweeper` (cron 5 min) : rattrape les webhooks FedaPay perdus en
 *   interrogeant l'API par `provider_ref` (doc 06 §22, blueprint §6) ;
 *   approved => confirmPayment, declined/canceled => failPayment.
 * - `reconciler` (Phase 1 : simulation) : cohérence interne plateforme
 *   (tickets vendus ↔ commandes) ; le volet routeur réel arrive en IMP-24.
 *   Alimente `reconciliation_runs` + `alerts` (garde-fou INC-03).
 *
 * Décision signalée D11 : TTL commandes 30 min, RESERVED 15 min ; ordonnanceur
 * setInterval zéro dépendance (le blueprint citait @fastify/cron à titre
 * indicatif — mêmes sémantiques, surface d'approvisionnement réduite).
 *
 * IMP-21 — quatrième job : `sync-requeue` (60 s), volet défensif du
 * sync-dispatcher : les opérations PROCESSING au verrou perdu (Connector
 * arrêté, crash) repassent en RETRY immédiatement (FAILED->RETRY, transitions
 * 0009 ; attempts non incrémenté). Le retry/backoff applicatif (claim/result)
 * vit dans les routes Connector (D12).
 */
import type { PaymentProvider } from './fedapay.js';
import type { BackendRepo } from './repo.js';

export const DEFAULT_ORDER_TTL_MS = 30 * 60_000;      // 30 min (D11)
export const DEFAULT_RESERVED_TTL_MS = 15 * 60_000;   // 15 min (D11, défensif)
export const DEFAULT_SWEEP_MIN_AGE_MS = 5 * 60_000;   // cron 5 min (blueprint §6)
export const DEFAULT_INTERVALS = {
  orderExpiryMs: 60_000,   // cron 1 min (blueprint §6)
  sweepMs: 300_000,        // cron 5 min
  reconcileMs: 3_600_000,  // cron 1 h (simulation Phase 1)
  syncRequeueMs: 60_000,   // IMP-21 : verrous perdus de la file mikrotik_sync
  connectorOfflineMs: 60_000, // IMP-33 : détection CONNECTOR_OFFLINE (doc 09 §117-D)
} as const;

/** IMP-21 — au-delà, un PROCESSING est considéré verrou perdu (D12). */
export const DEFAULT_SYNC_STUCK_MS = 10 * 60_000;

export interface ExpiryReport {
  ordersExpired: string[];
  paymentsExpired: number;
  ticketsReleased: string[];
  /** IMP-19 : tickets SOLD dont la fenêtre d'activation est close. */
  ticketsExpired: string[];
}

/** order-expiry : TTL sur PAYMENT_PENDING + libération des RESERVED bloqués. */
export async function runOrderExpiry(
  repo: BackendRepo,
  now: Date,
  opts?: { orderTtlMs?: number; reservedTtlMs?: number },
): Promise<ExpiryReport> {
  const orderTtl = opts?.orderTtlMs ?? DEFAULT_ORDER_TTL_MS;
  const reservedTtl = opts?.reservedTtlMs ?? DEFAULT_RESERVED_TTL_MS;
  const orders = await repo.expireStaleOrders(new Date(now.getTime() - orderTtl));
  const tickets = await repo.releaseStaleReservedTickets(new Date(now.getTime() - reservedTtl));
  // IMP-19 : double garde-fou validité — tickets SOLD à échéance dépassée (contrat §3.6).
  const ticketsExpired = await repo.expireOverdueTickets(now);
  return { ordersExpired: orders.orderIds, paymentsExpired: orders.paymentsExpired, ticketsReleased: tickets, ticketsExpired };
}

/** webhook-sweeper : rattrapage FedaPay des paiements ouverts trop anciens. */
export async function runWebhookSweeper(
  repo: BackendRepo,
  provider: PaymentProvider | undefined,
  now: Date,
  minAgeMs: number = DEFAULT_SWEEP_MIN_AGE_MS,
): Promise<number> {
  if (!provider?.getTransactionStatus) return 0; // sans clés : honnêtement inactif
  const candidates = await repo.getOpenPaymentsWithRefOlderThan(new Date(now.getTime() - minAgeMs));
  let swept = 0;
  for (const payment of candidates) {
    if (!payment.providerRef) continue;
    const status = await provider.getTransactionStatus(payment.providerRef);
    if (status === 'approved') {
      if ((await repo.confirmPayment(payment.id)) === 'confirmed') swept += 1;
    } else if (status === 'declined' || status === 'canceled') {
      const outcome = await repo.failPayment(payment.id, {
        payment: status === 'declined' ? 'FAILED' : 'CANCELLED',
        order: status === 'declined' ? 'FAILED' : 'CANCELLED',
      });
      if (outcome === 'failed') swept += 1;
    }
    // 'pending' | 'unknown' : on attend le webhook ou le prochain passage.
  }
  return swept;
}

export interface ReconciliationReport {
  runId: string;
  status: 'OK' | 'MISMATCH';
  violations: string[];
}

/** reconciler Phase 1 : cohérence interne plateforme (routeur = IMP-24). */
export async function runReconciliationSim(repo: BackendRepo): Promise<ReconciliationReport> {
  const snapshot = await repo.getReconciliationSnapshot();
  const violations: string[] = [];
  if (snapshot.soldWithoutOrder > 0) violations.push(`sold_without_order:${snapshot.soldWithoutOrder}`);
  if (snapshot.deliveredWithoutTicket > 0) violations.push(`delivered_without_ticket:${snapshot.deliveredWithoutTicket}`);
  const status: 'OK' | 'MISMATCH' = violations.length === 0 ? 'OK' : 'MISMATCH';
  const runId = await repo.insertReconciliationRun({
    routerTotalExpected: snapshot.totalTickets,
    routerTotalSeen: null, // routeur non connecté en Phase 1 (IMP-24)
    diff: {
      mode: 'simulation_phase1',
      note: 'volet routeur reporté à IMP-24 ; cohérence interne plateforme seulement',
      tickets_by_state: snapshot.byState,
      violations,
    },
    status,
  });
  if (status === 'MISMATCH') {
    await repo.raiseAlert({
      rule: 'reconciliation_mismatch',
      severity: 'CRITICAL',
      payload: { run_id: runId, violations },
    });
  }
  return { runId, status, violations };
}

/** IMP-21 — requeue des opérations PROCESSING au verrou perdu (FAILED->RETRY). */
export async function runSyncRequeue(
  repo: BackendRepo,
  now: Date,
  stuckMs: number = DEFAULT_SYNC_STUCK_MS,
): Promise<string[]> {
  return repo.requeueStuckSyncOps(new Date(now.getTime() - stuckMs), now);
}

/**
 * IMP-33 — détection idempotente du Connector hors ligne (doc 09 §117-D) :
 * OFFLINE → incident CONNECTOR_OFFLINE ; revenu → auto-résolution (system).
 */
export async function runConnectorOfflineDetection(
  repo: BackendRepo,
  now: Date,
): Promise<{ opened: number; resolved: number }> {
  return repo.runConnectorOfflineDetection('system', now);
}

export interface WorkersTickReport extends ExpiryReport {
  swept: number;
  requeued: number;
  reconciliation: ReconciliationReport | null;
  /** IMP-33 — incidents CONNECTOR_OFFLINE ouverts/résolus au dernier passage. */
  connectorOffline: { opened: number; resolved: number };
}

export interface StartWorkersOptions {
  provider?: PaymentProvider;
  intervals?: Partial<Record<keyof typeof DEFAULT_INTERVALS, number>>;
  now?: () => Date;
  onTick?: (report: WorkersTickReport) => void;
  onError?: (err: unknown, job: string) => void;
}

export interface WorkersHandle {
  /** Exécute les trois jobs une fois (tests + démarrage). */
  tickAll(now?: Date): Promise<WorkersTickReport>;
  stop(): void;
}

/** Démarre les crons in-process ; `stop()` idempotent (appelé au close Fastify). */
export function startWorkers(repo: BackendRepo, opts: StartWorkersOptions = {}): WorkersHandle {
  const intervals = { ...DEFAULT_INTERVALS, ...opts.intervals };
  const now = opts.now ?? (() => new Date());
  const report = (err: unknown, job: string): void => opts.onError?.(err, job);

  const tickAll = async (when: Date = now()): Promise<WorkersTickReport> => {
    const expiry = await runOrderExpiry(repo, when);
    const swept = await runWebhookSweeper(repo, opts.provider, when);
    const requeuedOps = await runSyncRequeue(repo, when);
    const reconciliation = await runReconciliationSim(repo);
    const connectorOffline = await runConnectorOfflineDetection(repo, when);
    return { ...expiry, swept, requeued: requeuedOps.length, reconciliation, connectorOffline };
  };

  const timers: Array<ReturnType<typeof setInterval>> = [
    setInterval(() => {
      runOrderExpiry(repo, now())
        .then((r) => opts.onTick?.({ ...r, swept: 0, requeued: 0, reconciliation: null, connectorOffline: { opened: 0, resolved: 0 } }))
        .catch((err: unknown) => report(err, 'order-expiry'));
    }, intervals.orderExpiryMs),
    setInterval(() => {
      runWebhookSweeper(repo, opts.provider, now())
        .then((swept) => opts.onTick?.({ ordersExpired: [], paymentsExpired: 0, ticketsReleased: [], ticketsExpired: [], swept, requeued: 0, reconciliation: null, connectorOffline: { opened: 0, resolved: 0 } }))
        .catch((err: unknown) => report(err, 'webhook-sweeper'));
    }, intervals.sweepMs),
    setInterval(() => {
      runReconciliationSim(repo)
        .then((reconciliation) =>
          opts.onTick?.({ ordersExpired: [], paymentsExpired: 0, ticketsReleased: [], ticketsExpired: [], swept: 0, requeued: 0, reconciliation, connectorOffline: { opened: 0, resolved: 0 } }))
        .catch((err: unknown) => report(err, 'reconciler'));
    }, intervals.reconcileMs),
    setInterval(() => {
      runSyncRequeue(repo, now())
        .then((ids) => opts.onTick?.({ ordersExpired: [], paymentsExpired: 0, ticketsReleased: [], ticketsExpired: [], swept: 0, requeued: ids.length, reconciliation: null, connectorOffline: { opened: 0, resolved: 0 } }))
        .catch((err: unknown) => report(err, 'sync-requeue'));
    }, intervals.syncRequeueMs),
    setInterval(() => {
      runConnectorOfflineDetection(repo, now())
        .then((connectorOffline) => opts.onTick?.({ ordersExpired: [], paymentsExpired: 0, ticketsReleased: [], ticketsExpired: [], swept: 0, requeued: 0, reconciliation: null, connectorOffline }))
        .catch((err: unknown) => report(err, 'connector-offline'));
    }, intervals.connectorOfflineMs),
  ];
  for (const t of timers) t.unref?.();

  return {
    tickAll,
    stop(): void {
      for (const t of timers) clearInterval(t);
    },
  };
}
