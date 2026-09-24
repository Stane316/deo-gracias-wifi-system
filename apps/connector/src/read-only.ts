/**
 * IMP-22 — Connector v0 STRICTEMENT READ-ONLY (contrat Mikmon §4.5).
 *
 * Agrège les trois sources de lecture (§4.1-4.3) sans AUCUNE méthode
 * d'écriture : le type lui-même interdit d'écrire vers le routeur. Les
 * écritures plateforme (reconciliation_runs, alerts) vivent côté backend
 * (route `POST /connector/inventory/report`).
 */
import { parseHotspotUsers } from './hotspot-parser.js';
import { parseHotspotActive, parseMikhmonJournal } from './readonly-parsers.js';
import type { RouterObserved } from './reconcile.js';

export interface ReadOnlySources {
  usersText?: string;
  activeText?: string;
  journalText?: string;
}

export class ReadOnlyConnectorV0 {
  private readonly observed: RouterObserved;

  constructor(sources: ReadOnlySources = {}) {
    this.observed = {
      users: sources.usersText ? parseHotspotUsers(sources.usersText) : [],
      active: sources.activeText ? parseHotspotActive(sources.activeText) : [],
      journal: sources.journalText ? parseMikhmonJournal(sources.journalText) : [],
    };
  }

  /** Instantané lu (copies défensives). */
  collect(): RouterObserved {
    return {
      users: this.observed.users.map((u) => ({ ...u })),
      active: this.observed.active.map((a) => ({ ...a })),
      journal: this.observed.journal.map((j) => ({ ...j })),
    };
  }
}
