/**
 * UX 4 — validation du numéro côté client, ALIGNÉE sur le backend
 * (apps/backend/src/schemas.ts : ^(?:\+229)?01[0-9]{8}$), avec des messages
 * humains (§14) — jamais de code technique type INVALID_PHONE_FORMAT.
 */

export type PhoneCheck =
  | { ok: true; normalized: string }
  | { ok: false; message: string };

/** Nettoie la saisie (espaces, points, tirets) puis valide. */
export function validateCustomerPhone(raw: string): PhoneCheck {
  const cleaned = raw.replace(/[\s.-]/g, '');
  if (cleaned.length === 0) {
    return { ok: false, message: 'Entrez votre numéro de téléphone.' };
  }
  if (!/^(?:\+229)?01[0-9]{8}$/.test(cleaned)) {
    return {
      ok: false,
      message: 'Numéro incorrect. Vérifiez les chiffres saisis : 10 chiffres commençant par 01 (ex. 0197123456).',
    };
  }
  // même normalisation que le backend (normalizePhone)
  const normalized = cleaned.startsWith('+229') ? cleaned.slice(4) : cleaned;
  return { ok: true, normalized };
}
