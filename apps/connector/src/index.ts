/**
 * IMP-21 — @dg/connector : contrat Connector Phase 1 (dry-run sur fixtures).
 *
 * Périmètre : parsing read-only des captures `/ip hotspot user` (contrat
 * Mikmon §4), routeur simulé en mémoire (DryRunConnector, AUCUNE écriture
 * routeur réelle avant W2 — §4.5), et client de la file `mikrotik_sync`
 * (`/connector/sync/claim` + `/connector/sync/:id/result`, blueprint §5).
 */
export { extractVoucherComment, parseHotspotUsers } from './hotspot-parser.js';
export type { HotspotUserRecord, VoucherComment } from './hotspot-parser.js';
export { DryRunConnector, KNOWN_PROFILES } from './dry-run.js';
export type { RouterOpResult } from './dry-run.js';
export { consumeOnce, drainQueue, HttpSyncTransport } from './sync-client.js';
export type { ClaimedOp, ConsumeOnceOutcome, ResultBody, SyncTransport } from './sync-client.js';
export {
  HOTSPOT_USERS_DETAIL_FIXTURE,
  HOTSPOT_USERS_TABULAR_FIXTURE,
  seedLegacyInventory,
} from './fixtures/hotspot-users.fixture.js';
