import { describe, expect, it } from 'vitest';
import { DryRunConnector, KNOWN_PROFILES } from './dry-run.js';
import { seedLegacyInventory } from './fixtures/hotspot-users.fixture.js';

const validPayload = {
  ticket_id: '0e5b1c2a-0000-4000-8000-000000000001',
  batch_seq: 100,
  name: 'dg1a2b3c',
  password: 'abcd1234',
  profile: '24-HEURES',
  limit_uptime: '1d00:00:00',
  comment: 'vc-100-09.24.26-',
};

describe('IMP-21 — DryRunConnector : create_ticket (contrat §3)', () => {
  it('payload valide => user ajouté à l\u0027inventaire, ok', () => {
    const router = new DryRunConnector(seedLegacyInventory());
    const res = router.dispatch('create_ticket', validPayload);
    expect(res.ok).toBe(true);
    const created = router.inventory().find((u) => u.name === 'dg1a2b3c');
    expect(created).toMatchObject({ profile: '24-HEURES', comment: 'vc-100-09.24.26-', disabled: false });
  });

  it('rejets contrat : name, profile, limit-uptime, comment', () => {
    const router = new DryRunConnector();
    expect(router.dispatch('create_ticket', { ...validPayload, name: 'VC-MAUVAIS' }).code).toBe('invalid_name');
    expect(router.dispatch('create_ticket', { ...validPayload, profile: '9-HEURES' }).code).toBe('invalid_profile');
    expect(router.dispatch('create_ticket', { ...validPayload, limit_uptime: '' }).code).toBe('invalid_limit_uptime');
    expect(router.dispatch('create_ticket', { ...validPayload, comment: 'pas-un-voucher' }).code).toBe('invalid_comment');
  });

  it('doublon refusé ; échec injecté consommé avant application', () => {
    const router = new DryRunConnector();
    expect(router.dispatch('create_ticket', validPayload).ok).toBe(true);
    expect(router.dispatch('create_ticket', validPayload).code).toBe('duplicate_user');

    router.failNext(1, 'router_timeout', 'timeout simulé');
    const failed = router.dispatch('create_ticket', { ...validPayload, name: 'dg9z8y7x' });
    expect(failed).toMatchObject({ ok: false, code: 'router_timeout', message: 'timeout simulé' });
    // L'échec injecté est consommé : l'opération suivante passe.
    expect(router.dispatch('create_ticket', { ...validPayload, name: 'dg9z8y7x' }).ok).toBe(true);
  });
});

describe('IMP-21 — DryRunConnector : disable / lecture / inconnu', () => {
  it('disable_ticket : désactive un user présent, erreur sinon', () => {
    const router = new DryRunConnector(seedLegacyInventory());
    expect(router.dispatch('disable_ticket', { name: 'cli001' }).ok).toBe(true);
    expect(router.inventory().find((u) => u.name === 'cli001')?.disabled).toBe(true);
    expect(router.dispatch('disable_ticket', { name: 'inexistant' }).code).toBe('user_not_found');
    expect(router.dispatch('disable_ticket', {}).code).toBe('invalid_name');
  });

  it('read_status / refresh_inventory : compteurs + anomalie comment vide', () => {
    const router = new DryRunConnector(seedLegacyInventory());
    const res = router.dispatch('refresh_inventory', {});
    expect(res.ok).toBe(true);
    expect(res.detail).toMatchObject({ user_count: 5, voucher_count: 4 });
    expect(res.detail?.['anomalies']).toEqual([{ name: 'admin-free-1', anomaly: 'comment_vide' }]);
    expect(router.dispatch('read_status', {}).ok).toBe(true);
  });

  it('opération inconnue : refus honnête (pas de throw)', () => {
    const router = new DryRunConnector();
    expect(router.dispatch('format_disk', {})).toMatchObject({ ok: false, code: 'unsupported_operation' });
  });

  it('KNOWN_PROFILES : Grille A complète + legacy', () => {
    expect(KNOWN_PROFILES).toContain('5-HEURES');
    expect(KNOWN_PROFILES).toContain('1-MOIS');
    expect(KNOWN_PROFILES).toContain('Admin-free');
    expect(KNOWN_PROFILES).not.toContain('5000-FCFA');
  });
});
