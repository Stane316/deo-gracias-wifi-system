/**
 * IMP-14 — Intégration FedaPay (sandbox/live) : init de paiement + vérification
 * de signature webhook. AUCUNE supposition : contrat vérifié sur la documentation
 * officielle (docs.fedapay.com, pages « Webhooks et Evénements », « Create a
 * transaction », « Get the payment link ») et sur le source du SDK officiel
 * fedapay-node 1.2.5 (Webhook.ts : WebhookSignature).
 *
 * Signature webhook (source SDK officiel) :
 *   header  : X-FEDAPAY-SIGNATURE = `t=<unix_seconds>,s=<hmac_sha256_hex>`
 *   signée  : `${t}.${rawBody}` avec le secret du point de terminaison (wh_…)
 *   tolérance par défaut : 300 s (anti-replay, doc officielle)
 * Implémentée à la main (≈ SDK) pour rester sans dépendance supplémentaire,
 * en TypeScript strict, avec comparaison à temps constant.
 *
 * Doc 06 §17 : le frontend n'est JAMAIS une preuve de paiement — seule la
 * confirmation serveur (webhook signé) fait foi. Doc 06 §20-21 : idempotence
 * par identifiant d'événement unique.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const FEDAPAY_SIGNATURE_HEADER = 'x-fedapay-signature';
const SIGNATURE_SCHEME = 's'; // SDK officiel : WebhookSignature.EXPECTED_SCHEME = 's'
const DEFAULT_TOLERANCE_S = 300; // SDK officiel : Webhook.DEFAULT_TOLERANCE

export function computeWebhookSignature(
  rawBody: string,
  secret: string,
  timestamp: number,
): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
}

/** Équivalent du generateTestHeaderString du SDK officiel — pour tests/mocks signés. */
export function generateTestHeaderString(opts: {
  payload: string;
  secret: string;
  timestamp?: number;
  scheme?: string;
}): string {
  const timestamp = opts.timestamp ?? Math.floor(Date.now() / 1000);
  const scheme = opts.scheme ?? SIGNATURE_SCHEME;
  const signature = computeWebhookSignature(opts.payload, opts.secret, timestamp);
  return [`t=${timestamp}`, `${scheme}=${signature}`].join(',');
}

export type WebhookVerifyResult =
  | { valid: true; timestamp: number }
  | { valid: false; reason: string };

export function verifyWebhookSignature(
  rawBody: string,
  header: unknown,
  secret: string,
  opts?: { toleranceS?: number; nowS?: number },
): WebhookVerifyResult {
  if (typeof header !== 'string' || header.trim() === '') {
    return { valid: false, reason: 'en-tête de signature absent' };
  }
  let timestamp = -1;
  const signatures: string[] = [];
  for (const item of header.split(',')) {
    const eq = item.indexOf('=');
    if (eq < 0) continue;
    const k = item.slice(0, eq).trim();
    const v = item.slice(eq + 1).trim();
    if (k === 't') timestamp = parseInt(v, 10);
    if (k === SIGNATURE_SCHEME) signatures.push(v);
  }
  if (!Number.isFinite(timestamp) || timestamp < 0) {
    return { valid: false, reason: 'horodatage illisible dans l’en-tête' };
  }
  if (signatures.length === 0) {
    return { valid: false, reason: 'aucune signature au format attendu' };
  }
  const expected = Buffer.from(computeWebhookSignature(rawBody, secret, timestamp), 'utf8');
  const matched = signatures.some((sig) => {
    const provided = Buffer.from(sig, 'utf8');
    return provided.length === expected.length && timingSafeEqual(provided, expected);
  });
  if (!matched) return { valid: false, reason: 'signature invalide' };
  const toleranceS = opts?.toleranceS ?? DEFAULT_TOLERANCE_S;
  const nowS = opts?.nowS ?? Math.floor(Date.now() / 1000);
  if (toleranceS > 0 && nowS - timestamp > toleranceS) {
    return { valid: false, reason: 'horodatage hors tolérance (rejet anti-replay)' };
  }
  return { valid: true, timestamp };
}

/** Événement webhook normalisé (doc : `name` dans les exemples, `type` dans l'API events). */
export interface FedaPayWebhookEvent {
  eventId: string;
  eventName: string;
  /** entity = objet transaction : { id, reference, amount, status, custom_metadata… }. */
  reference: string | null;
  transactionId: string | null;
  amount: number | null;
  status: string | null;
  /** Devise de la transaction (doc 06 §23 : cohérence devise vérifiée). */
  currencyIso: string | null;
  metadataPaymentId: string | null;
  raw: Record<string, unknown>;
}

export function parseWebhookEvent(payload: unknown): FedaPayWebhookEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const p = payload as Record<string, unknown>;
  const idRaw = p['id'] ?? p['object_id'];
  if (idRaw === undefined || idRaw === null) return null;
  const nameRaw = p['name'] ?? p['type'];
  if (typeof nameRaw !== 'string' || nameRaw === '') return null;
  const entity =
    typeof p['entity'] === 'object' && p['entity'] !== null
      ? (p['entity'] as Record<string, unknown>)
      : {};
  const meta =
    typeof entity['custom_metadata'] === 'object' && entity['custom_metadata'] !== null
      ? (entity['custom_metadata'] as Record<string, unknown>)
      : {};
  const ref = entity['reference'];
  const txId = entity['id'];
  const amount = entity['amount'];
  const status = entity['status'];
  const metaPaymentId = meta['payment_id'];
  const currencyRaw = entity['currency'];
  let currencyIso: string | null = null;
  if (typeof currencyRaw === 'string') currencyIso = currencyRaw;
  else if (typeof currencyRaw === 'object' && currencyRaw !== null) {
    const iso = (currencyRaw as Record<string, unknown>)['iso'];
    if (typeof iso === 'string') currencyIso = iso;
  }
  return {
    eventId: String(idRaw),
    eventName: nameRaw,
    reference: typeof ref === 'string' ? ref : ref !== undefined ? String(ref) : null,
    transactionId: txId !== undefined && txId !== null ? String(txId) : null,
    amount: typeof amount === 'number' && Number.isInteger(amount) ? amount : null,
    status: typeof status === 'string' ? status : null,
    currencyIso,
    metadataPaymentId: typeof metaPaymentId === 'string' ? metaPaymentId : null,
    raw: p,
  };
}

// ---------------------------------------------------------------------------
// Init de paiement (REST v1, Bearer secret key — doc officielle « Collects »)
// ---------------------------------------------------------------------------

export interface CheckoutInput {
  orderId: string;
  paymentId: string;
  amountFcfa: number;
  /** Téléphone national normalisé 01XXXXXXXX (IMP-12/13). */
  phone: string;
  description: string;
}

export interface CheckoutResult {
  providerRef: string;
  redirectUrl: string | null;
}

/** Abstraction du prestataire : le réel (FedaPayClient) et les fakes de test. */
export interface PaymentProvider {
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
}

export interface FedaPayClientOptions {
  secretKey: string;
  environment?: 'sandbox' | 'live';
  /** Injectable pour tests (défaut : fetch global). */
  fetchImpl?: typeof fetch;
}

export class FedaPayClient implements PaymentProvider {
  private readonly baseUrl: string;
  private readonly doFetch: typeof fetch;

  constructor(private readonly opts: FedaPayClientOptions) {
    this.baseUrl =
      opts.environment === 'live' ? 'https://api.fedapay.com/v1' : 'https://sandbox-api.fedapay.com/v1';
    this.doFetch = opts.fetchImpl ?? fetch;
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    // POST /v1/transactions — réponse 201 : { id, reference, amount, status, … }
    const createRes = await this.doFetch(`${this.baseUrl}/transactions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.opts.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        description: input.description,
        amount: input.amountFcfa,
        currency: { iso: 'XOF' },
        customer: {
          phone_number: {
            // E.164 Bénin : +229 suivi du numéro national à 10 chiffres (01…).
            number: `+229${input.phone}`,
            country: 'bj',
          },
        },
        custom_metadata: { order_id: input.orderId, payment_id: input.paymentId },
      }),
    });
    if (!createRes.ok) {
      throw new Error(`FedaPay create transaction: HTTP ${createRes.status}`);
    }
    const created = (await createRes.json()) as Record<string, unknown>;
    const tx = this.extractTransaction(created);
    if (!tx) throw new Error('FedaPay create transaction: réponse inattendue');
    const reference = tx['reference'];
    if (typeof reference !== 'string' || reference === '') {
      throw new Error('FedaPay create transaction: référence absente');
    }

    // POST /v1/transactions/{id}/token — réponse 200 : { token, url }
    let redirectUrl: string | null = null;
    const txId = tx['id'];
    if (txId !== undefined && txId !== null) {
      const tokenRes = await this.doFetch(`${this.baseUrl}/transactions/${String(txId)}/token`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.opts.secretKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (tokenRes.ok) {
        const tokenBody = (await tokenRes.json()) as Record<string, unknown>;
        const url = tokenBody['url'] ?? (tokenBody['data'] as Record<string, unknown> | undefined)?.['url'];
        if (typeof url === 'string') redirectUrl = url;
      }
      // Échec du token = non bloquant : la transaction existe, le webhook reste
      // la seule preuve de paiement (doc 06 §17).
    }
    return { providerRef: reference, redirectUrl };
  }

  /** Accepte la réponse plate (OpenAPI actuel) et l'ancienne forme {data:{transaction}}. */
  private extractTransaction(body: Record<string, unknown>): Record<string, unknown> | null {
    if (typeof body['reference'] === 'string') return body;
    const data = body['data'];
    if (typeof data === 'object' && data !== null) {
      const tx = (data as Record<string, unknown>)['transaction'];
      if (typeof tx === 'object' && tx !== null) return tx as Record<string, unknown>;
    }
    return null;
  }
}
