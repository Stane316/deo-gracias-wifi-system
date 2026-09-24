/**
 * IMP-23 — Protocole binaire de l'API classique RouterOS (doc 07 §37 : le
 * Connector utilise l'API classique, JAMAIS le REST — non garanti en 6.49).
 * Zéro dépendance (node:net/node:tls/node:crypto seulement).
 *
 * Trame : mots préfixés par leur longueur encodée (schéma variable du wiki
 * MikroTik), fin de phrase = mot vide. Réponses : `!re` (ligne), `!done`,
 * `!trap` (erreur), `!fatal`.
 */

/** Encode une longueur selon le schéma RouterOS (1 à 5 octets). */
export function encodeLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x4000) {
    return Buffer.from([(length >> 8) | 0x80, length & 0xff]);
  }
  if (length < 0x200000) {
    return Buffer.from([(length >> 16) | 0xc0, (length >> 8) & 0xff, length & 0xff]);
  }
  if (length < 0x10000000) {
    return Buffer.from([
      (length >> 24) | 0xe0,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }
  const head = Buffer.alloc(5);
  head[0] = 0xf0;
  head.writeUInt32BE(length, 1);
  return head;
}

export interface DecodedLength {
  value: number;
  bytes: number;
}

/** Décode une longueur ; null si le buffer est encore incomplet. */
export function decodeLength(buffer: Buffer, offset = 0): DecodedLength | null {
  const first = buffer[offset];
  if (first === undefined) return null;
  if (first < 0x80) return { value: first, bytes: 1 };
  if (first < 0xc0) {
    if (buffer.length < offset + 2) return null;
    return { value: (((first & 0x7f) << 8) | (buffer[offset + 1] ?? 0)), bytes: 2 };
  }
  if (first < 0xe0) {
    if (buffer.length < offset + 3) return null;
    return {
      value: (((first & 0x3f) << 16) | ((buffer[offset + 1] ?? 0) << 8) | (buffer[offset + 2] ?? 0)),
      bytes: 3,
    };
  }
  if (first < 0xf0) {
    if (buffer.length < offset + 4) return null;
    return {
      value: (
        ((first & 0x1f) << 24) |
        ((buffer[offset + 1] ?? 0) << 16) |
        ((buffer[offset + 2] ?? 0) << 8) |
        (buffer[offset + 3] ?? 0)
      ),
      bytes: 4,
    };
  }
  if (buffer.length < offset + 5) return null;
  return { value: buffer.readUInt32BE(offset + 1), bytes: 5 };
}

/** Encode un mot (préfixe longueur + octets UTF-8). */
export function encodeWord(word: string): Buffer {
  const body = Buffer.from(word, 'utf8');
  return Buffer.concat([encodeLength(body.length), body]);
}

/** Encode une phrase complète (mots + mot vide terminal). */
export function encodeSentence(words: string[]): Buffer {
  return Buffer.concat([...words.map(encodeWord), Buffer.from([0])]);
}

export interface ParsedSentence {
  words: string[];
  consumed: number;
}

/** Tente de parser une phrase ; null si le buffer est incomplet. */
export function parseSentence(buffer: Buffer, offset = 0): ParsedSentence | null {
  const words: string[] = [];
  let pos = offset;
  for (;;) {
    const len = decodeLength(buffer, pos);
    if (len === null) return null;
    pos += len.bytes;
    if (buffer.length < pos + len.value) return null;
    if (len.value === 0) {
      return { words, consumed: pos - offset };
    }
    words.push(buffer.toString('utf8', pos, pos + len.value));
    pos += len.value;
  }
}

/** Réponse logique d'une phrase routerOS. */
export interface RouterOsReply {
  /** `!re` | `!done` | `!trap` | `!fatal` */
  tag: string;
  /** Attributs `=name=value` de la phrase. */
  attrs: Map<string, string>;
}

export function replyWordsToReply(words: string[]): RouterOsReply {
  const tag = words[0] ?? '';
  const attrs = new Map<string, string>();
  for (const word of words.slice(1)) {
    if (word.startsWith('=')) {
      const eq = word.indexOf('=', 1);
      if (eq > 0) attrs.set(word.slice(1, eq), word.slice(eq + 1));
    }
  }
  return { tag, attrs };
}
