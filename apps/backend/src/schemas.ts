/**
 * IMP-12 — Schémas zod de l'API catalogue/commandes.
 * Règle transverse (blueprint §5) : zod sur tous les payloads.
 * Règle critique (doc 10 §10.3) : le montant est calculé côté serveur —
 * le body de création de commande est STRICT (.strict()) : toute clé inconnue
 * (ex. `price_fcfa` fournie par le client) est rejetée en 400.
 */
import { OFFERS, type OfferId } from '@dg/shared';
import { z } from 'zod';

const OFFER_IDS = OFFERS.map((o) => o.id) as [OfferId, ...OfferId[]];

/** IMP-18 — génération d'un lot de tickets digitaux (contrat Mikmon §3.5 : ≤ 200/lot). */
export const createBatchBodySchema = z.object({
  offer_id: z.enum(OFFER_IDS),
  quantity: z.number().int().min(1).max(200),
}).strict();

/**
 * Téléphone Bénin (identification minimale, doc 06 §06) : 10 chiffres commençant
 * par 01 (plan de numérotation national), préfixe international +229 toléré et
 * normalisé. Décision IMP-12 signalée au propriétaire (doc 06 ne fixe pas de format).
 */
/** Normalisation : +22901XXXXXXXX => 01XXXXXXXX (format national, doc 06 §06). */
export function normalizePhone(value: string): string {
  return value.startsWith('+229') ? value.slice(4) : value;
}

export const phoneSchema = z
  .string()
  .trim()
  .regex(/^(?:\+229)?01[0-9]{8}$/, 'numéro Bénin attendu : 01XXXXXXXX (ou +22901XXXXXXXX)')
  .transform(normalizePhone);

/** IMP-13 — OTP client (phone). Code à 6 chiffres, body strict. */
export const authPhoneRequestSchema = z.object({ phone: phoneSchema }).strict();

export const authPhoneVerifySchema = z
  .object({ phone: phoneSchema, code: z.string().regex(/^[0-9]{6}$/, 'code à 6 chiffres attendu') })
  .strict();

export const createOrderBodySchema = z
  .object({
    offer_id: z.enum(OFFER_IDS),
    customer_phone: phoneSchema,
  })
  .strict();

export type CreateOrderBody = z.input<typeof createOrderBodySchema>;
export type CreateOrderInput = z.output<typeof createOrderBodySchema>;

/** Idempotency-Key (doc 06 §21, blueprint §5) : obligatoire sur POST /orders. */
export const idempotencyKeySchema = z.string().trim().min(8).max(200);

export const orderIdParamsSchema = z.object({ id: z.string().uuid() });

/** Vue publique d'une commande (jamais de secret, pas de phone — doc 06 §05). */
export interface OrderView {
  id: string;
  state: string;
  currency: string;
  offer_id: string;
  plan_snapshot: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/** Erreur RFC 7807 (blueprint §5). */
export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  detail: string;
}

export function problem(status: number, title: string, detail: string): ProblemDetail {
  return { type: 'about:blank', title, status, detail };
}
