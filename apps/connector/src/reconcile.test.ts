import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { seedLegacyInventory } from './fixtures/hotspot-users.fixture.js';
import { HOTSPOT_ACTIVE_FIXTURE, MIKHMON_JOURNAL_FIXTURE } from './fixtures/readonly.fixture.js';
import { parseHotspotActive, parseMikhmonJournal } from './readonly-parsers.js';
import { reconcileReadOnly, type PlatformExpected, type RouterObserved } from './reconcile.js';

const sha = (v: string): string => createHash('sha256').update(v).digest('hex');

function baseObserved(): RouterObserved {
  return {
    users: seedLegacyInventory(),
    active: parseHotspotActive(HOTSPOT_ACTIVE_FIXTURE),
    journal: parseMikhmonJournal(MIKHMON_JOURNAL_FIXTURE),
  };
}

describe('IMP-22 — reconcileReadOnly (contrat §4.4)', () => {
  it('base saine : OK, totaux, admin-free compté à part (D13)', () => {
    const observed = baseObserved();
    // Sans la session vc (anomalie testée par ailleurs) :
    observed.active = observed.active.filter((a) => a.user === 'cli001');
    const expected: PlatformExpected = {
      digitalVouchers: [],
      legacyCodeHashes: ['cli001', 'cli002', 'cli003', 'cli004'].map(sha),
    };
    const report = reconcileReadOnly(expected, observed);
    expect(report.status).toBe('OK');
    expect(report.routerTotalSeen).toBe(5);
    expect(report.adminFreeSeen).toBe(1);
    expect(report.journalSales).toBe(3);
    expect(report.byProfile).toMatchObject({ '5-HEURES': 1, '24-HEURES': 1, '72-HEURES': 1, '1-MOIS': 1 });
    expect(report.anomalies).toEqual([]);
  });

  it('détecte les 5 familles d\u0027anomalies §4.4', () => {
    const observed = baseObserved();
    // user au comment vide (hors Admin-free) + voucher inconnu + session vc (cli002).
    observed.users.push({ name: 'sanscmt1', profile: '24-HEURES', comment: '', limitUptime: '1d', disabled: false });
    observed.users.push({ name: 'dg9qqqqq', profile: '5-HEURES', comment: 'vc-999-01.01.26-', limitUptime: '05:00:00', disabled: false });
    // session incohérente : uptime+left 2h vs limit 5h.
    observed.active.push({
      user: 'dg9qqqqq', server: 'hotspot1', address: null, macAddress: null, loginBy: 'http-chap',
      uptimeS: 3600, sessionTimeLeftS: 3600, comment: 'sep/17/2026 12:00:00',
    });
    const expected: PlatformExpected = {
      digitalVouchers: [{ name: 'dg1a2b3c', profile: '24-HEURES', comment: 'vc-100-09.24.26-' }], // absent du routeur
      legacyCodeHashes: ['cli001', 'cli002', 'cli003', 'cli004'].map(sha),
    };
    const report = reconcileReadOnly(expected, observed);
    expect(report.status).toBe('MISMATCH');
    const kinds = report.anomalies.map((a) => a.kind).sort();
    expect(kinds).toEqual(
      ['comment_vide', 'session_vc_active', 'ticket_inconnu', 'ticket_paye_absent', 'uptime_incoherent'].sort(),
    );
    expect(report.violations).toContain('ticket_paye_absent:1');
    expect(report.violations).toContain('session_vc_active:1');
  });

  it('voucher digital désactivé côté routeur => ticket_paye_absent', () => {
    const observed = baseObserved();
    const cli002 = observed.users.find((u) => u.name === 'cli002');
    if (cli002) cli002.disabled = true;
    const expected: PlatformExpected = {
      digitalVouchers: [{ name: 'cli002', profile: '24-HEURES', comment: 'vc-002-09.16.26-' }],
      legacyCodeHashes: [],
    };
    const report = reconcileReadOnly(expected, observed);
    expect(report.anomalies.map((a) => a.kind)).toContain('ticket_paye_absent');
  });
});
