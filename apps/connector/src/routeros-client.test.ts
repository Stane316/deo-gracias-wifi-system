import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyQueueOp } from './routeros-gateway.js';
import { RouterOsApiClient, RouterOsApiError } from './routeros-client.js';
import { StubRouterOsServer } from './testing/stub-routeros.js';

describe('IMP-23 — client RouterOS API vs stub protocolaire', () => {
  let stub: StubRouterOsServer;
  let port: number;

  beforeAll(async () => {
    stub = new StubRouterOsServer();
    port = await stub.listen();
  });
  afterAll(async () => {
    await stub.close();
  });

  const connect = async (): Promise<RouterOsApiClient> => {
    const client = new RouterOsApiClient({
      host: '127.0.0.1',
      port,
      user: 'dg-connector',
      password: 'stub-pass',
    });
    await client.connect();
    return client;
  };

  it('login clair OK ; mauvais mot de passe => RouterOsApiError', async () => {
    const client = await connect();
    client.close();
    const bad = new RouterOsApiClient({ host: '127.0.0.1', port, user: 'dg-connector', password: 'nope' });
    await expect(bad.connect()).rejects.toBeInstanceOf(RouterOsApiError);
  });

  it('add/print/set/remove via le protocole binaire', async () => {
    const client = await connect();
    const id = await client.addHotspotUser({ name: 'dg1a2b3c', password: 'abcd1234', profile: '24-HEURES', comment: 'vc-100-09.24.26-' });
    expect(id).toMatch(/^\*/);

    const users = await client.printHotspotUsers();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ name: 'dg1a2b3c', profile: '24-HEURES', comment: 'vc-100-09.24.26-', disabled: false });

    const found = await client.findHotspotUserId('dg1a2b3c');
    expect(found).toBe(id);
    await client.setHotspotUserDisabled(id, true);
    const after = await client.printHotspotUsers();
    expect(after[0]?.disabled).toBe(true);

    await client.removeHotspotUser(id);
    expect(await client.printHotspotUsers()).toHaveLength(0);
    client.close();
  });

  it('doublon => trap ; panne temporaire => RouterOsApiError', async () => {
    const client = await connect();
    await client.addHotspotUser({ name: 'dg1a2b3c', password: 'x', profile: '5-HEURES', comment: 'vc-101-09.24.26-' });
    await expect(
      client.addHotspotUser({ name: 'dg1a2b3c', password: 'y', profile: '5-HEURES', comment: 'vc-102-09.24.26-' }),
    ).rejects.toMatchObject({ trapMessage: 'failure: already have such user' });
    stub.failNextWrite = true;
    await expect(
      client.addHotspotUser({ name: 'dg9z8y7x', password: 'z', profile: '5-HEURES', comment: 'vc-103-09.24.26-' }),
    ).rejects.toBeInstanceOf(RouterOsApiError);
    client.close();
  });

  it('login challenge (schéma md5) accepté par le stub', async () => {
    stub.requireChallenge = true;
    const client = new RouterOsApiClient({ host: '127.0.0.1', port, user: 'dg-connector', password: 'stub-pass' });
    try {
      // Login clair d'abord refusé en mode challenge => bascule challenge.
      await client.connect();
    } finally {
      client.close();
      stub.requireChallenge = false;
    }
  });

  it('probePermissions (P6) : lecture+écriture sur stub ; écriture refusée si trap', async () => {
    const client = await connect();
    const ok = await client.probePermissions();
    expect(ok).toMatchObject({ read: true, write: true });
    stub.failNextWrite = true;
    const degraded = await client.probePermissions();
    expect(degraded.read).toBe(true);
    expect(degraded.write).toBe(false);
    expect(degraded.detail).toContain('write:');
    client.close();
  });
});

describe('IMP-23 — gateway file mikrotik_sync -> RouterOS', () => {
  let stub: StubRouterOsServer;
  let port: number;
  let client: RouterOsApiClient;

  beforeAll(async () => {
    stub = new StubRouterOsServer();
    port = await stub.listen();
    client = new RouterOsApiClient({ host: '127.0.0.1', port, user: 'dg-connector', password: 'stub-pass' });
    await client.connect();
  });
  afterAll(async () => {
    client.close();
    await stub.close();
  });

  it('create_ticket => user créé sur le "routeur"', async () => {
    const res = await applyQueueOp(client, 'create_ticket', {
      name: 'dg2b3c4d',
      password: 'efgh5678',
      profile: '5-HEURES',
      limit_uptime: '05:00:00',
      comment: 'vc-104-09.24.26-',
    });
    expect(res.ok).toBe(true);
    expect(res.detail).toMatchObject({ applied: 'create_ticket', name: 'dg2b3c4d' });
    expect(stub.users.size).toBe(1);
  });

  it('disable_ticket => disabled=yes ; user absent => user_not_found', async () => {
    const res = await applyQueueOp(client, 'disable_ticket', { name: 'dg2b3c4d' });
    expect(res.ok).toBe(true);
    expect([...stub.users.values()][0]?.disabled).toBe('yes');
    const missing = await applyQueueOp(client, 'disable_ticket', { name: 'inexistant' });
    expect(missing).toMatchObject({ ok: false, code: 'user_not_found' });
  });

  it('refresh_inventory => compteur ; payload incomplet => invalid_payload', async () => {
    const res = await applyQueueOp(client, 'refresh_inventory', {});
    expect(res).toMatchObject({ ok: true, detail: { user_count: 1 } });
    const bad = await applyQueueOp(client, 'create_ticket', { name: 'dg3c4d5e' });
    expect(bad).toMatchObject({ ok: false, code: 'invalid_payload' });
  });
});
