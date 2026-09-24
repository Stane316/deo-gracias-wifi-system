import { describe, expect, it } from 'vitest';
import {
  consumeOnce,
  DryRunConnector,
  drainQueue,
  extractVoucherComment,
  HttpSyncTransport,
  parseHotspotUsers,
  seedLegacyInventory,
} from './index.js';

describe('IMP-21 — surface publique @dg/connector', () => {
  it('exporte parser, dry-run et client de file', () => {
    expect(typeof parseHotspotUsers).toBe('function');
    expect(typeof extractVoucherComment).toBe('function');
    expect(typeof DryRunConnector).toBe('function');
    expect(typeof consumeOnce).toBe('function');
    expect(typeof drainQueue).toBe('function');
    expect(typeof HttpSyncTransport).toBe('function');
    expect(seedLegacyInventory()).toHaveLength(5);
  });
});
