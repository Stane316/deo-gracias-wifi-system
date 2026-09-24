/**
 * IMP-21 — Contrat Connector : parsing des sorties read-only du routeur.
 *
 * Sources (contrat Mikmon §4) : `/ip hotspot user` (état courant des vouchers).
 * Deux formats RouterOS 6.49 supportés (vus dans EVIDENCE-IMP01 §D) :
 * - `print` tabulaire : ligne d'en-tête `#  NAME PROFILE ...` puis une ligne
 *   par user, séparateurs multi-espaces, COMMENT en dernière colonne ;
 * - `print detail` : blocs `key="value"` (ou `key=value`) par user, drapeau
 *   (`X`) devant les entrées désactivées.
 *
 * Le parseur est pur et tolérant : lignes vides ignorées, champs absents => null.
 * Les captures réelles du 16/09 sont masquées (EVIDENCE-IMP01 §masquage) : les
 * fixtures de test sont donc SYNTHÉTIQUES, conformes aux formats observés.
 */

/** User hotspot tel que lu sur le routeur (jamais de secret ici). */
export interface HotspotUserRecord {
  /** Id interne RouterOS (`*ABC…`), présent en mode detail. */
  routerId?: string;
  name: string;
  profile: string;
  comment: string | null;
  limitUptime: string | null;
  disabled: boolean;
}

const DETAIL_TOKEN = /([a-z][a-z0-9-]*)=("(?:[^"\\]|\\.)*"|\S*)/g;

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return value;
}

function fromDetailTokens(rest: string, disabledFlag: boolean): HotspotUserRecord | null {
  const fields = new Map<string, string>();
  for (const match of rest.matchAll(DETAIL_TOKEN)) {
    fields.set(match[1] ?? '', unquote(match[2] ?? ''));
  }
  const name = fields.get('name');
  if (!name) return null;
  const routerId = rest.match(/\*(?:[A-Z0-9]+)/)?.[0];
  return {
    ...(routerId ? { routerId } : {}),
    name,
    profile: fields.get('profile') ?? 'default',
    comment: fields.has('comment') ? fields.get('comment') ?? null : null,
    limitUptime: fields.get('limit-uptime') ?? null,
    disabled: disabledFlag || fields.get('disabled') === 'yes',
  };
}

/** Ligne tabulaire : cells alignées sur `columns` ; la dernière colonne
 * absorbe le reste de la ligne (comment pouvant contenir des espaces). */
function parseTabularRow(rest: string, columns: string[], disabledFlag: boolean): HotspotUserRecord | null {
  if (columns.length === 0) return null;
  const cells = rest.split(/\s{2,}/).map((c) => c.trim());
  const valueFor = (col: string): string | null => {
    const idx = columns.indexOf(col);
    if (idx < 0) return null;
    if (idx === columns.length - 1) {
      const tail = cells.slice(idx).join('  ').trim();
      return tail === '' ? null : tail;
    }
    const v = cells[idx];
    return v === undefined || v === '' ? null : v;
  };
  const name = valueFor('NAME');
  if (!name) return null;
  return {
    name,
    profile: valueFor('PROFILE') ?? 'default',
    comment: valueFor('COMMENT'),
    limitUptime: valueFor('LIMIT-UPTIME'),
    disabled: disabledFlag,
  };
}

/** Parse une sortie `/ip hotspot user print` ou `print detail`. */
export function parseHotspotUsers(text: string): HotspotUserRecord[] {
  const out: HotspotUserRecord[] = [];
  let columns: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('Flags:')) continue;
    const header = trimmed.match(/^#\s{2,}(.*)$/);
    if (header) {
      columns = (header[1] ?? '').trim().split(/\s+/).map((c) => c.toUpperCase());
      continue;
    }
    const entry = line.match(/^\s*(\d+)\s+([A-Z]+)?\s*(.*)$/);
    if (!entry) continue;
    const disabledFlag = (entry[2] ?? '').includes('X');
    const rest = (entry[3] ?? '').trim();
    if (rest.includes('=')) {
      const rec = fromDetailTokens(rest, disabledFlag);
      if (rec) out.push(rec);
    } else if (columns.length > 0) {
      const rec = parseTabularRow(rest, columns, disabledFlag);
      if (rec) out.push(rec);
    }
  }
  return out;
}

/** Comment voucher Mikmon (contrat §3/§4) : `vc-<seq>-<mm.dd.yy>-`. */
export interface VoucherComment {
  seq: number;
  date: string;
}

export function extractVoucherComment(comment: string | null): VoucherComment | null {
  if (!comment) return null;
  const m = comment.match(/^vc-(\d{3,})-(\d{2}\.\d{2}\.\d{2})-$/);
  if (!m) return null;
  return { seq: Number(m[1]), date: m[2] ?? '' };
}
