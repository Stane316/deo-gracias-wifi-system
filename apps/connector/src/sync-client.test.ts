import { describe, expect, it } from 'vitest';
import { DryRunConnector } from './dry-run.js';
import { consumeOnce, drainQueue, type ClaimedOp, type ResultBody, type SyncTransport } from './sync-client.js';

/** File en mémoire pour tester le client sans HTTP. */
class FakeQueue implements SyncTransport {
  pending: ClaimedOp[] = [];
  results: Array<{ opId: string; body: ResultBody }> = [];
  async claim(_workerId: string): Promise<ClaimedOp | null> {
    const next = this.pending.shift();
    return next ?? null;
  }
  async reportResult(opId: string, body: ResultBody): Promise<void> {
    this.results.push({ opId, body });
  }
}

const createOp = (name: string): ClaimedOp => ({
  id: `op-${name}`,
  operation: 'create_ticket',
  payload: {
    name,
    password: 'abcd1234',
    profile: '24-HEURES',
    limit_uptime: '1d00:00:00',
    comment: 'vc-100-09.24.26-',
  },
  state: 'PENDING',
  attempts: 0,
});

describe('IMP-21 — consumeOnce (contrat claim/result, blueprint §5)', () => {
  it('file vide => claimed:false, aucun report', async () => {
    const queue = new FakeQueue();
    const router = new DryRunConnector();
    const step = await consumeOnce(queue, router, 'dry-run');
    expect(step).toEqual({ claimed: false, opId: null, outcome: null });
    expect(queue.results).toHaveLength(0);
  });

  it('opération valide => claimée, appliquée, reportée en succès', async () => {
    const queue = new FakeQueue();
    queue.pending.push(createOp('dg1a2b3c'));
    const router = new DryRunConnector();
    const step = await consumeOnce(queue, router, 'dry-run');
    expect(step).toMatchObject({ claimed: true, opId: 'op-dg1a2b3c', outcome: 'success' });
    expect(queue.results).toHaveLength(1);
    expect(queue.results[0]?.body).toMatchObject({ success: true });
    expect(router.inventory().find((u) => u.name === 'dg1a2b3c')).toBeDefined();
  });

  it('échec routeur simulé => reporté success:false avec code/message', async () => {
    const queue = new FakeQueue();
    queue.pending.push(createOp('dg1a2b3c'));
    const router = new DryRunConnector();
    router.failNext(1, 'router_timeout', 'timeout simulé');
    const step = await consumeOnce(queue, router, 'dry-run');
    expect(step.outcome).toBe('retry');
    expect(queue.results[0]?.body).toMatchObject({ success: false, error: { code: 'router_timeout' } });
  });
});

describe('IMP-21 — drainQueue', () => {
  it('vide la file et compte succès/retry', async () => {
    const queue = new FakeQueue();
    queue.pending.push(createOp('dg1a2b3c'), createOp('dg2b3c4d'), {
      ...createOp('dgMAUVAIS'),
      operation: 'create_ticket',
    });
    const router = new DryRunConnector();
    const summary = await drainQueue(queue, router, 'dry-run');
    expect(summary.processed).toBe(3);
    expect(summary.success).toBe(2);
    expect(summary.retry).toBe(1); // dgMAUVAIS : name invalide
    expect(queue.pending).toHaveLength(0);
  });
});
