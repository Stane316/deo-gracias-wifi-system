/**
 * IMP-22 — Connector v0 STRICTEMENT READ-ONLY (contrat Mikmon §4) : parsing de
 * `/ip hotspot active` (sessions live, §4.2) et du journal d'activation Mikhmon
 * (`/system script` comment="mikhmon", séparateur `-|-`, §4.3).
 *
 * Formats observés sur le RB951 (EVIDENCE-IMP01 §D4/§E2) :
 * - active : blocs detail précédés d'une ligne `;;; <comment user>` qui porte
 *   soit le code voucher (`vc-…`) avant 1er login, soit l'échéance calculée
 *   après login (`sep/17/2026 09:09:49`) ; cohérence §4.2 : uptime +
 *   session-time-left = limit-uptime du profil.
 * - journal : name = `date-|-time-|-user-|-prix-|-address-|-mac-|-durée-|-
 *   profil-|-offre-|-comment`, owner = mois+année, source = date.
 *
 * Deux formats de date gérés (§4.3) : `mon/DD/YYYY` (ex. `sep/17/2026`) et
 * `YYYY-MM-DD` (famille 1-HEURE).
 */

export interface HotspotActiveRecord {
  user: string;
  server: string | null;
  address: string | null;
  macAddress: string | null;
  loginBy: string | null;
  uptimeS: number;
  sessionTimeLeftS: number | null;
  /** Comment user vu par la session : `vc-…` (avant 1er login) ou échéance. */
  comment: string | null;
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** `sep/17/2026` | `2026-09-17` => ISO `2026-09-17` ; null si non reconnu. */
export function normalizeRouterOsDate(value: string): string | null {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return value;
  const us = value.match(/^([a-z]{3})\/(\d{1,2})\/(\d{4})$/i);
  if (us) {
    const month = MONTHS[(us[1] ?? '').toLowerCase()];
    const day = Number(us[2]);
    const year = Number(us[3]);
    if (month && day >= 1 && day <= 31) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return null;
}

/** `1d00:00:00`, `05:00:00`, `40d00:00:00` (limit-uptime contrat §5) => secondes. */
export function parseLimitUptime(value: string | null): number | null {
  if (!value) return null;
  const m = value.match(/^(?:(\d+)d)?(\d{1,2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1] ?? 0) * 86_400 + Number(m[2] ?? 0) * 3_600 + Number(m[3] ?? 0) * 60 + Number(m[4] ?? 0);
}

/** `4h11m6s`, `30m48s`, `2h37m32s`, `45s` => secondes. */
export function parseRouterOsDuration(value: string | null): number {
  if (!value) return 0;
  const m = value.match(/^(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || value === '') return 0;
  return (
    Number(m[1] ?? 0) * 86_400 +
    Number(m[2] ?? 0) * 3_600 +
    Number(m[3] ?? 0) * 60 +
    Number(m[4] ?? 0)
  );
}

const DETAIL_TOKEN = /([a-z][a-z0-9-]*)=("(?:[^"\\]|\\.)*"|\S*)/g;

function unquote(value: string): string {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    return value.slice(1, -1);
  }
  return value;
}

/** Parse `/ip hotspot active print detail` (format EVIDENCE-IMP01 §D4).
 * Entrée = `<n> ;;; <comment user>` puis lignes key=value repliées ; le
 * comment porte soit `vc-…` (avant 1er login) soit l'échéance après login. */
export function parseHotspotActive(text: string): HotspotActiveRecord[] {
  const out: HotspotActiveRecord[] = [];
  let current: { fields: Map<string, string>; comment: string | null } | null = null;
  const collect = (source: string, target: Map<string, string>): void => {
    for (const match of source.matchAll(DETAIL_TOKEN)) {
      target.set(match[1] ?? '', unquote(match[2] ?? ''));
    }
  };
  const flush = (): void => {
    if (!current) return;
    const user = current.fields.get('user');
    if (user) {
      out.push({
        user,
        server: current.fields.get('server') ?? null,
        address: current.fields.get('address') ?? null,
        macAddress: current.fields.get('mac-address') ?? null,
        loginBy: current.fields.get('login-by') ?? null,
        uptimeS: parseRouterOsDuration(current.fields.get('uptime') ?? null),
        sessionTimeLeftS: current.fields.has('session-time-left')
          ? parseRouterOsDuration(current.fields.get('session-time-left') ?? null)
          : null,
        comment: current.comment,
      });
    }
    current = null;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('Flags:')) continue;
    const entry = line.match(/^(\d+)\s+(.*)$/);
    if (entry) {
      flush();
      const rest = (entry[2] ?? '').trim();
      const semi = rest.match(/^;;;\s*(.*)$/);
      current = { fields: new Map(), comment: semi ? (semi[1] ?? '').trim() || null : null };
      if (!semi) collect(rest, current.fields);
      continue;
    }
    if (current) collect(line, current.fields);
  }
  flush();
  return out;
}

/** Ligne du journal d'activation Mikhmon (script comment="mikhmon", §4.3/E2). */
export interface MikhmonJournalEntry {
  /** Date ISO normalisée (`mon/DD/YYYY` ou `YYYY-MM-DD` accepté). */
  date: string | null;
  time: string | null;
  user: string;
  priceFcfa: number | null;
  address: string | null;
  mac: string | null;
  duration: string | null;
  profile: string | null;
  offer: string | null;
  comment: string | null;
  owner: string | null;
}

/** Parse une sortie `/system script print` filtrée comment="mikhmon".
 * Entrées potentiellement repliées sur plusieurs lignes : découpage sur les
 * débuts d'entrée (`<n> name="…"`). */
export function parseMikhmonJournal(text: string): MikhmonJournalEntry[] {
  const chunks = text.split(/(?=\n?\s*\d+\s+name=")/);
  const out: MikhmonJournalEntry[] = [];
  for (const chunk of chunks) {
    if (!chunk.includes('comment="mikhmon"')) continue;
    const nameMatch = chunk.match(/name="([^"]+)"/);
    if (!nameMatch) continue;
    const owner = chunk.match(/owner="([^"]*)"/)?.[1] ?? null;
    const parts = (nameMatch[1] ?? '').split('-|-');
    if (parts.length < 3) continue;
    out.push({
      date: normalizeRouterOsDate(parts[0] ?? ''),
      time: parts[1] ?? null,
      user: parts[2] ?? '',
      priceFcfa: parts[3] != null && parts[3] !== '' ? Number(parts[3]) : null,
      address: parts[4] ?? null,
      mac: parts[5] ?? null,
      duration: parts[6] ?? null,
      profile: parts[7] ?? null,
      offer: parts[8] ?? null,
      comment: parts[9] ?? null,
      owner,
    });
  }
  return out;
}
