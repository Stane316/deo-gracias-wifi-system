import { describe, expect, it } from 'vitest';
import {
  POLL_MAX_DELAY_MS,
  POLL_TIMEOUT_MS,
  pollTimedOut,
  nextPollDelayMs,
} from './polling.js';

describe('IMP-27 — reconciliation checkout bornée', () => {
  it('applique un backoff croissant plafonné', () => {
    expect(nextPollDelayMs(0)).toBe(1_000);
    expect(nextPollDelayMs(1)).toBe(2_000);
    expect(nextPollDelayMs(2)).toBe(4_000);
    expect(nextPollDelayMs(4)).toBe(POLL_MAX_DELAY_MS);
    expect(nextPollDelayMs(40)).toBe(POLL_MAX_DELAY_MS);
  });

  it('ne considère pas le timeout comme un échec de paiement', () => {
    const started = 10_000;
    expect(pollTimedOut(started, started + POLL_TIMEOUT_MS - 1)).toBe(false);
    expect(pollTimedOut(started, started + POLL_TIMEOUT_MS)).toBe(true);
  });
});
