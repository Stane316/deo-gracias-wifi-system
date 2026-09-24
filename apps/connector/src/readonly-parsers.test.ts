import { describe, expect, it } from 'vitest';
import { HOTSPOT_ACTIVE_FIXTURE, MIKHMON_JOURNAL_FIXTURE } from './fixtures/readonly.fixture.js';
import {
  normalizeRouterOsDate,
  parseHotspotActive,
  parseLimitUptime,
  parseMikhmonJournal,
  parseRouterOsDuration,
} from './readonly-parsers.js';

describe('IMP-22 — durées et dates RouterOS', () => {
  it('parseRouterOsDuration : h/m/s combinés', () => {
    expect(parseRouterOsDuration('4h11m6s')).toBe(4 * 3600 + 11 * 60 + 6);
    expect(parseRouterOsDuration('30m48s')).toBe(30 * 60 + 48);
    expect(parseRouterOsDuration('45s')).toBe(45);
    expect(parseRouterOsDuration(null)).toBe(0);
  });
  it('parseLimitUptime : hh:mm:ss et Ndhh:mm:ss (contrat §5)', () => {
    expect(parseLimitUptime('05:00:00')).toBe(5 * 3600);
    expect(parseLimitUptime('1d00:00:00')).toBe(86_400);
    expect(parseLimitUptime('40d00:00:00')).toBe(40 * 86_400);
    expect(parseLimitUptime(null)).toBeNull();
  });
  it('normalizeRouterOsDate : mon/DD/YYYY et YYYY-MM-DD (§4.3)', () => {
    expect(normalizeRouterOsDate('sep/17/2026')).toBe('2026-09-17');
    expect(normalizeRouterOsDate('2026-09-17')).toBe('2026-09-17');
    expect(normalizeRouterOsDate('nimporte/quoi')).toBeNull();
  });
});

describe('IMP-22 — parseHotspotActive (format §D4)', () => {
  it('sessions : user, uptime/left en secondes, comment ;;; (vc ou échéance)', () => {
    const active = parseHotspotActive(HOTSPOT_ACTIVE_FIXTURE);
    expect(active).toHaveLength(3);
    const s0 = active.find((a) => a.user === 'cli001');
    expect(s0).toMatchObject({
      server: 'hotspot1',
      loginBy: 'mac-cookie',
      comment: 'sep/17/2026 09:09:49',
      uptimeS: 4 * 3600 + 11 * 60 + 6,
      sessionTimeLeftS: 48 * 60 + 54,
    });
    const s1 = active.find((a) => a.user === 'cli002');
    expect(s1?.comment).toBe('vc-002-09.16.26-'); // conversion ratée => détectable
  });
});

describe('IMP-22 — parseMikhmonJournal (séparateur -|-, §4.3/E2)', () => {
  it('extrait date normalisée, user, prix, profil ; deux formats de date', () => {
    const entries = parseMikhmonJournal(MIKHMON_JOURNAL_FIXTURE);
    expect(entries).toHaveLength(3);
    const e0 = entries.find((e) => e.user === 'cli001');
    expect(e0).toMatchObject({
      date: '2026-09-16',
      time: '09:02:11',
      priceFcfa: 100,
      profile: '5-HEURES',
      comment: 'vc-001-09.16.26-',
      owner: 'sep2026',
    });
    const e2 = entries.find((e) => e.user === 'old001');
    expect(e2).toMatchObject({ date: '2026-09-15', priceFcfa: 50, profile: '1-HEURE' });
  });
});
