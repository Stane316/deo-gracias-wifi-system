import { describe, expect, it } from 'vitest';
import {
  decodeLength,
  encodeLength,
  encodeSentence,
  parseSentence,
  replyWordsToReply,
} from './routeros-protocol.js';

describe('IMP-23 — longueurs RouterOS (schéma variable)', () => {
  it('vecteurs connus (wiki MikroTik)', () => {
    expect([...encodeLength(0)]).toEqual([0x00]);
    expect([...encodeLength(1)]).toEqual([0x01]);
    expect([...encodeLength(127)]).toEqual([0x7f]);
    expect([...encodeLength(128)]).toEqual([0x80, 0x80]);
    expect([...encodeLength(255)]).toEqual([0x80, 0xff]);
    expect([...encodeLength(256)]).toEqual([0x81, 0x00]);
    expect([...encodeLength(16383)]).toEqual([0xbf, 0xff]);
    expect([...encodeLength(16384)]).toEqual([0xc0, 0x40, 0x00]);
  });

  it('round-trip 0..70000 + buffer incomplet => null', () => {
    for (const value of [0, 1, 127, 128, 255, 256, 16383, 16384, 70000, 2097151, 2097152]) {
      const encoded = encodeLength(value);
      expect(decodeLength(encoded)?.value).toBe(value);
    }
    expect(decodeLength(Buffer.from([0xc0]))).toBeNull(); // 3 octets attendus
    expect(decodeLength(Buffer.from([]))).toBeNull();
  });
});

describe('IMP-23 — phrases : encode/parse round-trip', () => {
  it('phrase complète => mots identiques ; incomplet => null', () => {
    const encoded = encodeSentence(['/ip/hotspot/user/add', '=name=dg1a2b3c', '=comment=vc-100-09.24.26-']);
    const parsed = parseSentence(encoded);
    expect(parsed?.words).toEqual(['/ip/hotspot/user/add', '=name=dg1a2b3c', '=comment=vc-100-09.24.26-']);
    expect(parsed?.consumed).toBe(encoded.length);
    expect(parseSentence(encoded.subarray(0, encoded.length - 1))).toBeNull();
  });

  it('deux phrases concaténées dans un même buffer', () => {
    const buffer = Buffer.concat([encodeSentence(['!re', '=name=a']), encodeSentence(['!done'])]);
    const first = parseSentence(buffer);
    expect(first?.words).toEqual(['!re', '=name=a']);
    const second = parseSentence(buffer, first?.consumed ?? 0);
    expect(second?.words).toEqual(['!done']);
  });

  it('replyWordsToReply : tag + attributs', () => {
    const reply = replyWordsToReply(['!done', '=ret=*A1']);
    expect(reply.tag).toBe('!done');
    expect(reply.attrs.get('ret')).toBe('*A1');
  });
});
