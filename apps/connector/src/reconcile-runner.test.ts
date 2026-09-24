import { describe, expect, it } from 'vitest';
import { DryRunConnector } from './dry-run.js';
import {
  observedFromDryRun,
  runReconciliationOnce,
  type InventoryReportBody,
  type InventoryTransport,
} from './reconcile-runner.js';
import type { PlatformExpected } from './reconcile.js';

class FakeTransport implements InventoryTransport {
  reportSent: InventoryReportBody | null = null;
  failExpected = false;

  constructor(private readonly expected: PlatformExpected) {}

  async fetchExpected(): Promise<PlatformExpected> {
    if (this.failExpected) throw new Error('backend injoignable');
    return this.expected;
  }

  async sendReport(body: InventoryReportBody): Promise<{ runId: string; status: 'OK' | 'MISMATCH' }> {
    this.reportSent = body;
    return { runId: 'run-fake-1', status: body.status };
  }
}

const VOUCHER = { name: 'dg1a2b3c', profile: '5-HEURES', comment: 'vc-001-09.24.26-' };

describe('IMP-24 — runner de réconciliation read-only', () => {
  it('état cohérent : voucher attendu présent sur le routeur => OK persisté', async () => {
    const router = new DryRunConnector([
      { name: VOUCHER.name, profile: VOUCHER.profile, comment: VOUCHER.comment, limitUptime: '5h', disabled: false },
    ]);
    const transport = new FakeTransport({ digitalVouchers: [VOUCHER], legacyCodeHashes: [] });

    const outcome = await runReconciliationOnce(transport, observedFromDryRun(router));

    expect(outcome.status).toBe('OK');
    expect(outcome.report.anomalies).toHaveLength(0);
    expect(outcome.runId).toBe('run-fake-1');
    expect(transport.reportSent).toMatchObject({
      router_total_seen: 1,
      status: 'OK',
      by_profile: { '5-HEURES': 1 },
      admin_free_seen: 0,
      journal_sales: 0,
    });
  });

  it('voucher désactivé côté routeur => MISMATCH ticket_paye_absent rapporté', async () => {
    const router = new DryRunConnector([
      { name: VOUCHER.name, profile: VOUCHER.profile, comment: VOUCHER.comment, limitUptime: '5h', disabled: true },
    ]);
    const transport = new FakeTransport({ digitalVouchers: [VOUCHER], legacyCodeHashes: [] });

    const outcome = await runReconciliationOnce(transport, observedFromDryRun(router));

    expect(outcome.status).toBe('MISMATCH');
    expect(outcome.report.violations.join(',')).toContain('ticket_paye_absent');
    expect(transport.reportSent?.anomalies.some((a) => a.kind === 'ticket_paye_absent')).toBe(true);
    expect(transport.reportSent?.violations).toEqual(outcome.report.violations);
  });

  it('observé issu du DryRunConnector après application de la file (create_ticket)', async () => {
    const router = new DryRunConnector();
    const applied = router.dispatch('create_ticket', {
      name: VOUCHER.name,
      profile: VOUCHER.profile,
      limit_uptime: '5h',
      comment: VOUCHER.comment,
    });
    expect(applied.ok).toBe(true);

    const transport = new FakeTransport({ digitalVouchers: [VOUCHER], legacyCodeHashes: [] });
    const outcome = await runReconciliationOnce(transport, observedFromDryRun(router));
    expect(outcome.status).toBe('OK');
    expect(transport.reportSent?.router_total_seen).toBe(1);
  });

  it('backend injoignable : le runner lève (pas de rapport fantôme)', async () => {
    const transport = new FakeTransport({ digitalVouchers: [], legacyCodeHashes: [] });
    transport.failExpected = true;
    await expect(
      runReconciliationOnce(transport, { users: [], active: [], journal: [] }),
    ).rejects.toThrow('backend injoignable');
    expect(transport.reportSent).toBeNull();
  });
});
