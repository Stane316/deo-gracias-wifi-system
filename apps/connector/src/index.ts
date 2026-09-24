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
export {
  normalizeRouterOsDate,
  parseHotspotActive,
  parseLimitUptime,
  parseMikhmonJournal,
  parseRouterOsDuration,
} from './readonly-parsers.js';
export type { HotspotActiveRecord, MikhmonJournalEntry } from './readonly-parsers.js';
export { reconcileReadOnly, UPTIME_TOLERANCE_S } from './reconcile.js';
export type {
  ExpectedDigitalVoucher,
  PlatformExpected,
  ReadOnlyAnomaly,
  ReadOnlyAnomalyKind,
  ReconcileReadOnlyReport,
  RouterObserved,
} from './reconcile.js';
export { ReadOnlyConnectorV0 } from './read-only.js';
export type { ReadOnlySources } from './read-only.js';
export { HOTSPOT_ACTIVE_FIXTURE, MIKHMON_JOURNAL_FIXTURE } from './fixtures/readonly.fixture.js';
export {
  decodeLength,
  encodeLength,
  encodeSentence,
  encodeWord,
  parseSentence,
  replyWordsToReply,
} from './routeros-protocol.js';
export type { DecodedLength, ParsedSentence, RouterOsReply } from './routeros-protocol.js';
export { RouterOsApiClient, RouterOsApiError } from './routeros-client.js';
export type { RouterOsConnectOptions } from './routeros-client.js';
export { applyQueueOp } from './routeros-gateway.js';
export { StubRouterOsServer } from './testing/stub-routeros.js';
