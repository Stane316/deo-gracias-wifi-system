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

/** IMP-27 — pagination et filtres des listes admin ; bornes côté serveur. */
export const adminListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  search: z.string().trim().max(100).optional(),
  state: z.string().trim().max(40).optional(),
}).strict();

export const adminIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

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

/** IMP-21 — claim d'une opération de la file (contrat Connector, blueprint §5). */
export const connectorClaimBodySchema = z.object({
  worker_id: z.string().trim().min(1).max(120),
}).strict();

/** IMP-21 — résultat d'une opération réclamée : succès (result optionnel) OU
 * échec (error obligatoire). La politique retry/backoff est côté serveur (D12). */
export const connectorResultBodySchema = z
  .object({
    success: z.boolean(),
    result: z.record(z.unknown()).optional(),
    error: z
      .object({ code: z.string().trim().min(1).max(80), message: z.string().trim().min(1).max(500) })
      .strict()
      .optional(),
  })
  .strict()
  .refine((b) => b.success === true || b.error != null, {
    message: 'en échec, le champ error (code + message) est obligatoire',
  })
  .refine((b) => b.success !== true || b.error == null, {
    message: 'en succès, le champ error doit être absent',
  });

/** IMP-22 — rapport de lecture read-only posté par le Connector v0 : alimente
 * `reconciliation_runs` (routeur vu, §4) ; jamais de code clair, jamais
 * d'écriture routeur. */
/** IMP-25 — démo locale : corps de POST /webhooks/dev-approve (mode DEV uniquement). */
export const devApproveBodySchema = z
  .object({ payment_id: z.string().uuid() })
  .strict();

export const connectorInventoryReportSchema = z
  .object({
    router_total_seen: z.number().int().min(0),
    status: z.enum(['OK', 'MISMATCH']),
    violations: z.array(z.string().max(200)).max(50),
    anomalies: z
      .array(
        z
          .object({
            kind: z.enum(['comment_vide', 'session_vc_active', 'ticket_paye_absent', 'ticket_inconnu', 'uptime_incoherent']),
            detail: z.string().max(500),
          })
          .strict(),
      )
      .max(200),
    by_profile: z.record(z.number().int().min(0)),
    admin_free_seen: z.number().int().min(0),
    journal_sales: z.number().int().min(0),
  })
  .strict();

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
