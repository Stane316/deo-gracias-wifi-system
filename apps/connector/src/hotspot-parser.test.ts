import { describe, expect, it } from 'vitest';
import { extractVoucherComment, parseHotspotUsers } from './hotspot-parser.js';
import {
  HOTSPOT_USERS_DETAIL_FIXTURE,
  HOTSPOT_USERS_TABULAR_FIXTURE,
  seedLegacyInventory,
} from './fixtures/hotspot-users.fixture.js';

describe('IMP-21 — parseHotspotUsers (contrat Mikmon §4)', () => {
  it('format tabulaire : names, profils, comments vc-…, drapeau X => disabled', () => {
    const users = parseHotspotUsers(HOTSPOT_USERS_TABULAR_FIXTURE);
    expect(users).toHaveLength(5);
    const cli001 = users.find((u) => u.name === 'cli001');
    expect(cli001).toMatchObject({ profile: '5-HEURES', comment: 'vc-001-09.16.26-', disabled: false });
    const cli003 = users.find((u) => u.name === 'cli003');
    expect(cli003?.disabled).toBe(true); // drapeau X
    const admin = users.find((u) => u.name === 'admin-free-1');
    expect(admin).toMatchObject({ profile: 'Admin-free', comment: null });
  });

  it('format detail : key="value", limit-uptime, disabled=yes/no', () => {
    const users = parseHotspotUsers(HOTSPOT_USERS_DETAIL_FIXTURE);
    expect(users).toHaveLength(5);
    const cli002 = users.find((u) => u.name === 'cli002');
    expect(cli002).toMatchObject({ profile: '24-HEURES', limitUptime: '1d', comment: 'vc-002-09.16.26-' });
    const cli003 = users.find((u) => u.name === 'cli003');
    expect(cli003?.disabled).toBe(true);
    const admin = users.find((u) => u.name === 'admin-free-1');
    expect(admin).toMatchObject({ profile: 'Admin-free', limitUptime: null, comment: null });
  });

  it('tolérance : lignes vides / Flags ignorées, entrée sans name rejetée', () => {
    expect(parseHotspotUsers('')).toEqual([]);
    expect(parseHotspotUsers('Flags: X - disabled\n\n')).toEqual([]);
    const detailSansName = parseHotspotUsers(' 0    profile="5-HEURES" comment="vc-999-01.01.26-"');
    expect(detailSansName).toEqual([]);
  });
});

describe('IMP-21 — extractVoucherComment', () => {
  it('reconnaît vc-<seq>-<mm.dd.yy>-', () => {
    expect(extractVoucherComment('vc-101-09.17.26-')).toEqual({ seq: 101, date: '09.17.26' });
    expect(extractVoucherComment('vc-7-01.02.26-')).toBeNull(); // seq < 3 chiffres
  });
  it('rejette comments vides / non vouchers (anomalies §4.4)', () => {
    expect(extractVoucherComment(null)).toBeNull();
    expect(extractVoucherComment('')).toBeNull();
    expect(extractVoucherComment('autre chose')).toBeNull();
  });
});

describe('IMP-21 — seedLegacyInventory', () => {
  it('sert 5 users legacy (fixtures synthétiques documentées)', () => {
    const inv = seedLegacyInventory();
    expect(inv).toHaveLength(5);
    expect(inv.filter((u) => extractVoucherComment(u.comment) != null)).toHaveLength(4);
  });
});
