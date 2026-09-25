/**
 * IMP-26 / UX 6 (D-UX6a) — coffre-fort du code client, chiffré au repos.
 *
 * Philosophie 0004/INC-01/INC-04 inchangée : JAMAIS de code CLAIR en base.
 * Le coffre ne stocke qu'un sceau AES-256-GCM (iv+tag+ct, base64) produit au
 * moment où le code clair existe (création de lot backend). La lecture passe
 * exclusivement par GET /tickets/:id/code : session client du téléphone
 * payeur + ticket SOLD + journalisation audit_logs.
 *
 * Stock Mikmon manuel (codes importés hashés) : pas de sceau => code jamais
 * révélable en ligne (message humain dédié).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/** Accepte toute phrase secrète ; dérivation sha256 => clé 32 octets. */
export function deriveVaultKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

/** Scelle un code clair : base64(iv ‖ tag ‖ ct). */
export function sealCode(key: Buffer, code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

/** Ouvre un sceau ; null si altéré, mauvaise clé ou format invalide. */
export function openCode(key: Buffer, sealed: string): string | null {
  try {
    const buf = Buffer.from(sealed, 'base64');
    if (buf.length < 29) return null; // iv 12 + tag 16 + au moins 1 octet
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
