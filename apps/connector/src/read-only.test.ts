import { describe, expect, it } from 'vitest';
import { HOTSPOT_USERS_TABULAR_FIXTURE } from './fixtures/hotspot-users.fixture.js';
import { HOTSPOT_ACTIVE_FIXTURE, MIKHMON_JOURNAL_FIXTURE } from './fixtures/readonly.fixture.js';
import { ReadOnlyConnectorV0 } from './read-only.js';

describe('IMP-22 — ReadOnlyConnectorV0 (contrat §4.5)', () => {
  const build = (): ReadOnlyConnectorV0 =>
    new ReadOnlyConnectorV0({
      usersText: HOTSPOT_USERS_TABULAR_FIXTURE,
      activeText: HOTSPOT_ACTIVE_FIXTURE,
      journalText: MIKHMON_JOURNAL_FIXTURE,
    });

  it('agrège les trois sources read-only', () => {
    const seen = build().collect();
    expect(seen.users).toHaveLength(5);
    expect(seen.active).toHaveLength(3);
    expect(seen.journal).toHaveLength(3);
  });

  it('copies défensives : muter collect() ne touche pas l\u0027état interne', () => {
    const connector = build();
    const first = connector.collect();
    first.users.push({ name: 'intrus', profile: 'X', comment: null, limitUptime: null, disabled: false });
    first.active.length = 0;
    const second = connector.collect();
    expect(second.users).toHaveLength(5);
    expect(second.active).toHaveLength(3);
  });

  it('strictement read-only : seule méthode publique = collect', () => {
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(build())).filter((m) => m !== 'constructor');
    expect(methods).toEqual(['collect']);
  });
});
