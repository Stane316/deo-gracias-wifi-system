/**
 * IMP-12 — Application Fastify : catalogue + commandes + sondes (blueprint §5).
 * Routes livrées : GET /healthz, GET /readyz, GET /offers,
 * POST /orders (Idempotency-Key), GET /orders/:id.
 * Erreurs au format RFC 7807 (application/problem+json).
 * Les routes paiements/tickets/admin/connector arrivent en IMP-13→21.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import { canOrderTransition, type OrderState } from '@dg/shared';
import {
  FEDAPAY_SIGNATURE_HEADER,
  parseWebhookEvent,
  verifyWebhookSignature,
  type PaymentProvider,
} from './fedapay.js';
import {
  ADMIN_ROLES,
  bearerToken,
  OtpStore,
  SessionStore,
  type AuthIdentity,
  type AuthVerifier,
  type OtpConfig,
} from './auth.js';
import {
  authPhoneRequestSchema,
  authPhoneVerifySchema,
  adminIdParamsSchema,
  adminListQuerySchema,
  connectorClaimBodySchema,
  connectorHeartbeatBodySchema,
  connectorInventoryReportSchema,
  devApproveBodySchema,
  connectorResultBodySchema,
  createBatchBodySchema,
  createOrderBodySchema,
  idempotencyKeySchema,
  normalizePhone,
  orderIdParamsSchema,
  phoneSchema,
  problem,
  ticketMineQuerySchema,
  type OrderView,
} from './schemas.js';
import { buildPlanSnapshot, type AdminListOptions, type BackendRepo, type OrderRecord, type PaymentRecord, type SyncOpRecord } from './repo.js';
import { allocateAndDeliver } from './tickets.js';
import { buildDashboardPayload, startOfBusinessDay } from './admin.js';
import { startWorkers, type StartWorkersOptions } from './workers.js';
import { explainPgConnectionError } from './pg-diag.js';
import { openCode } from './ticketvault.js';

export interface BuildAppOptions {
  repo: BackendRepo;
  logger?: boolean;
  /** Rate-limit par IP (règle transverse blueprint §5). Défaut : 100 req/min. */
  rateLimit?: { max: number; timeWindow?: string };
  /** IMP-25.6 — URL visée, pour des messages de panne qui nomment l'hôte exact. */
  databaseUrl?: string | undefined;
  /** IMP-26 UX6 (D-UX6a) — clé du coffre chiffré des codes clients ; absente => révélation désactivée. */
  ticketVaultKey?: Buffer;
  /** IMP-13 — auth clients (phone OTP) + admin (Supabase Auth + rôle). */
  auth?: {
    /** Vérificateur de JWT Supabase ; absent => routes admin 503 (non configuré). */
    verifier?: AuthVerifier;
    /** true = AUTH_DEV_MODE : le code OTP est retourné dans la réponse (local/CI). */
    devMode?: boolean;
    otp?: Partial<OtpConfig>;
    sessions?: { ttlMs?: number; now?: () => number };
    /** Limites durcies par route (défaut : request 5/30min, verify 10/min). */
    rateLimits?: { requestMax?: number; verifyMax?: number };
  };
  /** IMP-14 — paiement FedaPay : provider (init) + secret webhook (signature). */
  payment?: {
    provider?: PaymentProvider;
    webhookSecret?: string;
    /** Tolérance anti-replay en secondes (défaut 300, SDK officiel). */
    toleranceS?: number;
    /** Horloge injectable (tests). */
    nowS?: () => number;
    /** IMP-25 — true = démo locale : monte POST /webhooks/dev-approve. Jamais en prod. */
    devMode?: boolean;
  };
  /** IMP-21 — contrat Connector (blueprint §5) : token long-lived dédié ;
   * absent => routes /connector 503 (non configuré). D12 : 3 tentatives,
   * backoff 1 min / 5 min / 15 min, puis BLOCKED + alerte WARNING. */
  connector?: {
    token?: string;
    maxAttempts?: number;
    backoffMs?: number[];
  };
  /** IMP-20 — workers in-process (order-expiry 1 min, webhook-sweeper 5 min,
   * reconciler simulé 1 h ; blueprint §6, D11). Désactivables via WORKERS=off. */
  workers?: {
    enabled?: boolean;
    /** Périodes injectables (tests) ; défauts = DEFAULT_INTERVALS. */
    intervals?: StartWorkersOptions['intervals'];
  };
}

/** IMP-21 — politique retry/backoff du Connector (D12, doc 06 §36) :
 * 3 tentatives au total ; backoff exponentiel 1 min / 5 min / 15 min ;
 * au-delà => BLOCKED + alerte WARNING `sync_blocked`. */
export const SYNC_MAX_ATTEMPTS = 3;
export const SYNC_BACKOFF_MS: number[] = [60_000, 300_000, 900_000];

/** Vue d'une opération de la file pour le Connector. Le payload `create_ticket`
 * contient le code clair : c'est par construction le rôle de cette file
 * (IMP-18), jusqu'à la synchro routeur (purge W2). */
export function toSyncOpView(op: SyncOpRecord): Record<string, unknown> {
  return {
    id: op.id,
    operation: op.operation,
    payload: op.payload,
    state: op.state,
    attempts: op.attempts,
    created_at: op.createdAt.toISOString(),
  };
}

function toOrderView(o: OrderRecord, offerId: string, payment: PaymentRecord | null = null): OrderView {
  return {
    id: o.id,
    order_reference: o.id,
    state: o.state,
    currency: o.currency,
    offer_id: offerId,
    plan_snapshot: o.planSnapshot,
    // Identifiants non secrets nécessaires à la reprise ; aucun code de ticket
    // ni payload provider ne sort de cette vue publique.
    payment: payment
      ? { id: payment.id, provider_ref: payment.providerRef, state: payment.state }
      : null,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

function paymentConflictView(order: OrderRecord, payment: PaymentRecord | null, title: string, detail: string): Record<string, unknown> {
  return {
    ...problem(409, title, detail),
    order_id: order.id,
    order_reference: order.id,
    payment_id: payment?.id ?? null,
    provider_ref: payment?.providerRef ?? null,
    payment_state: payment?.state ?? null,
    order_state: order.state,
  };
}

/** Seul un code technique non sensible peut entrer dans les logs génériques. */
function errorCodeOf(err: unknown): string | undefined {
  if (!err || typeof err !== 'object') return undefined;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' && code.length > 0 ? code : undefined;
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const { repo } = opts;

  await app.register(rateLimit, {
    max: opts.rateLimit?.max ?? 100,
    timeWindow: opts.rateLimit?.timeWindow ?? '1 minute',
  });

  // Toute erreur (validation zod incluse) => RFC 7807. Les erreurs 5xx ne
  // renvoient ni ne journalisent le message brut, qui peut contenir SQL, URI ou secret.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) {
      app.log.error({ error_code: errorCodeOf(err) }, 'Erreur interne non exposée');
    }
    const detail = status >= 500 ? 'Une erreur interne est survenue.' : err.message;
    void reply
      .status(status)
      .type('application/problem+json')
      .send(problem(status, status >= 500 ? 'Erreur interne' : err.message, detail));
  });
  app.setNotFoundHandler((_req, reply) => {
    void reply
      .status(404)
      .type('application/problem+json')
      .send(problem(404, 'Route introuvable', 'La route demandée n’existe pas.'));
  });

  app.get('/healthz', async () => ({ status: 'ok', app: 'dg-backend' }));

  app.get('/readyz', async (_req, reply) => {
    try {
      await repo.ping();
      // IMP-25.3 — diagnostic schéma : base joignable mais non migrée = pas prêt.
      const health = await repo.getSchemaHealth();
      if (health.missing.length > 0) {
        return reply
          .status(503)
          .type('application/problem+json')
          .send(problem(503, 'Base non migrée',
            `Tables manquantes : ${health.missing.join(', ')}. Appliquez les 13 migrations dans l'ordre (GUIDE-10 §4) sur la base pointée par DATABASE_URL.`));
      }
      return { status: 'ready', schema_migrated: true };
    } catch (err) {
      // IMP-25.5 — panne de connexion traduite en consigne actionnable.
      return reply
        .status(503)
        .type('application/problem+json')
        .send(problem(503, 'Base indisponible',
          explainPgConnectionError(err, opts.databaseUrl) ?? 'La base de données ne répond pas.'));
    }
  });

  // Catalogue : servi depuis `plans` actifs (blueprint §5) — la parité avec la
  // Grille A (packages/shared OFFERS) est verrouillée par test d'intégration + seed-sync.
  app.get('/offers', async (_req, reply) => {
    // IMP-25.3 — message actionnable au lieu d'une erreur SQL brute si la base
    // pointée par DATABASE_URL n'a pas reçu les migrations.
    let plans;
    try {
      const health = await repo.getSchemaHealth();
      if (health.missing.length > 0) {
        return reply
          .status(503)
          .type('application/problem+json')
          .send(problem(503, 'Base non migrée',
            `La base pointée par DATABASE_URL ne contient pas le schéma (manque : ${health.missing.slice(0, 5).join(', ')}…). Suivez GUIDE-10 §4 : appliquez 0001→0013 sur CETTE base, ou corrigez DATABASE_URL.`));
      }
      plans = await repo.listActivePlans();
    } catch (err) {
      // IMP-25.5 — jamais d'erreur brute (ENOTFOUND etc.) exposée au portail.
      return reply
        .status(503)
        .type('application/problem+json')
        .send(problem(503, 'Base injoignable',
          explainPgConnectionError(err, opts.databaseUrl) ?? 'La base de données ne répond pas (GUIDE-10 §11).'));
    }
    return plans.map((p) => ({
      id: p.offerId,
      priceFcfa: p.priceFcfa,
      accessHours: p.accessHours,
      validityHours: p.validityHours,
      mikrotikProfile: p.mikrotikProfile,
      limitUptime: p.limitUptime,
      version: p.version,
    }));
  });

  app.post('/orders', async (req, reply) => {
    const keyRaw = req.headers['idempotency-key'];
    const keyParsed = idempotencyKeySchema.safeParse(keyRaw);
    if (!keyParsed.success) {
      return reply
        .status(400)
        .type('application/problem+json')
        .send(
          problem(
            400,
            'En-tête Idempotency-Key invalide',
            'Idempotency-Key est obligatoire (8 à 200 caractères).',
          ),
        );
    }
    // .strict() : toute clé inconnue (ex. prix fourni par le client) => 400 (doc 10 §10.3).
    const bodyParsed = createOrderBodySchema.safeParse(req.body);
    if (!bodyParsed.success) {
      const detail = bodyParsed.error.issues
        .map((i) => `${i.path.join('.') || '(body)'}: ${i.message}`)
        .join(' | ');
      return reply
        .status(400)
        .type('application/problem+json')
        .send(problem(400, 'Payload invalide', detail));
    }
    const { offer_id: offerId, customer_phone: phone } = bodyParsed.data;

    const plan = await repo.getActivePlanByOffer(offerId);
    if (!plan) {
      return reply
        .status(404)
        .type('application/problem+json')
        .send(problem(404, 'Offre introuvable', `Aucun plan actif pour l'offre ${offerId}.`));
    }

    const customerId = await repo.findOrCreateCustomer(phone);
    const { order, created } = await repo.createOrder({
      customerId,
      planId: plan.planId,
      planSnapshot: buildPlanSnapshot(plan),
      idempotencyKey: keyParsed.data,
    });
    const payment = await repo.getLatestPaymentForOrder(order.id);
    return reply.status(created ? 201 : 200).send(toOrderView(order, offerId, payment));
  });

  app.get('/orders/:id', async (req, reply) => {
    const parsed = orderIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply
        .status(400)
        .type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'id doit être un UUID.'));
    }
    const order = await repo.getOrderById(parsed.data.id);
    if (!order) {
      return reply
        .status(404)
        .type('application/problem+json')
        .send(problem(404, 'Commande introuvable', `Aucune commande avec l'id ${parsed.data.id}.`));
    }
    const offerId = String(order.planSnapshot['offer_id'] ?? '');
    const payment = await repo.getLatestPaymentForOrder(order.id);
    return toOrderView(order, offerId, payment);
  });

  // ---------------------------------------------------------------------------
  // IMP-26 UX 6 (D-UX6a) — révélation auditée du code client : session client
  // du téléphone payeur + ticket SOLD/USED + sceau du coffre + audit_logs.
  // ---------------------------------------------------------------------------
  app.get('/tickets/:id/code', async (req, reply) => {
    const parsed = orderIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'id doit être un UUID.'));
    }
    const customerId = await resolveCustomerId(req);
    if (!customerId) {
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const ticket = await repo.getTicketForReveal(parsed.data.id);
    if (!ticket) {
      return reply.status(404).type('application/problem+json')
        .send(problem(404, 'Ticket introuvable', 'Aucun ticket avec cet identifiant.'));
    }
    if (!ticket.orderId) {
      return reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Ce ticket n’est rattaché à aucune commande.'));
    }
    const order = await repo.getOrderById(ticket.orderId);
    if (!order || order.customerId !== customerId) {
      return reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Ce ticket n’a pas été acheté avec ce numéro.'));
    }
    if (ticket.dbState !== 'SOLD' && ticket.dbState !== 'USED') {
      return reply.status(409).type('application/problem+json')
        .send(problem(409, 'Code non disponible', 'Ce ticket n’est pas (encore) vendu : rien à afficher.'));
    }
    if (!opts.ticketVaultKey) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Affichage non configuré', 'TICKET_VAULT_KEY absente : la consultation des codes est désactivée.'));
    }
    if (!ticket.codeCipher) {
      return reply.status(409).type('application/problem+json')
        .send(problem(409, 'Code non affichable en ligne',
          'Ce code provient d’un stock physique importé : il figure sur votre voucher papier.'));
    }
    const code = openCode(opts.ticketVaultKey, ticket.codeCipher);
    if (!code) {
      return reply.status(500).type('application/problem+json')
        .send(problem(500, 'Coffre illisible', 'Le sceau de ce code ne correspond pas à la clé du coffre.'));
    }
    await repo.logAudit({
      actor: `customer:${customerId}`,
      action: 'ticket_code_revealed',
      entity: 'tickets',
      entityId: ticket.id,
    });
    return { ticket_id: ticket.id, code };
  });

  // ---------------------------------------------------------------------------
  // IMP-14 — Paiements : POST /orders/:id/pay (init FedaPay) + webhook signé
  // Doc 06 §17 : seule la confirmation serveur (webhook) vaut preuve de paiement.
  // ---------------------------------------------------------------------------
  const payCfg = opts.payment;
  const provider = payCfg?.provider;

  app.post('/orders/:id/pay', async (req, reply) => {
    const parsed = orderIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'id doit être un UUID.'));
    }
    const order = await repo.getOrderById(parsed.data.id);
    if (!order) {
      return reply.status(404).type('application/problem+json')
        .send(problem(404, 'Commande introuvable', `Aucune commande avec l'id ${parsed.data.id}.`));
    }
    if (!provider) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Paiement non configuré', 'FEDAPAY_SECRET_KEY absente (blueprint §7).'));
    }
    const state = order.state as OrderState;
    const amount = order.planSnapshot['price_snapshot'];
    if (typeof amount !== 'number' || !Number.isInteger(amount)) {
      return reply.status(500).type('application/problem+json')
        .send(problem(500, 'Snapshot invalide', 'price_snapshot manquant dans la commande.'));
    }
    if (state === 'PAID' || state === 'TICKET_ALLOCATED' || state === 'DELIVERED') {
      const latest = await repo.getLatestPaymentForOrder(order.id);
      // 409 est volontairement récupérable : une autre fenêtre/relance a
      // déjà fait avancer la commande. Le frontend rattache ces identifiants
      // puis relit l'état backend ; il ne confirme rien lui-même.
      return reply.status(409).type('application/problem+json')
        .send(paymentConflictView(order, latest, 'Commande déjà payée', `État courant : ${state}.`));
    }
    const open = await repo.getOpenPaymentForOrder(order.id);
    if (state === 'PAYMENT_PENDING' && open) {
      // Rejeu : on ne rappelle JAMAIS le prestataire pour rien (idempotence).
      return reply.status(200).send({
        order_id: order.id,
        order_reference: order.id,
        payment_id: open.id,
        provider_ref: open.providerRef,
        payment_state: open.state,
        order_state: order.state,
        replay: true,
      });
    }
    if (!canOrderTransition(state, 'PAYMENT_PENDING')) {
      const latest = await repo.getLatestPaymentForOrder(order.id);
      return reply.status(409).type('application/problem+json')
        .send(paymentConflictView(order, latest, 'Commande non payable', `État courant : ${state}.`));
    }
    const customer = await repo.getCustomerById(order.customerId);
    if (!customer) {
      return reply.status(500).type('application/problem+json')
        .send(problem(500, 'Client introuvable', 'La commande référence un client inexistant.'));
    }
    const payment = open && open.state === 'CREATED' ? open : await repo.createPayment(order.id, amount);
    const offerId = String(order.planSnapshot['offer_id'] ?? 'Wi-Fi');
    let checkout;
    try {
      checkout = await provider.createCheckout({
        orderId: order.id,
        paymentId: payment.id,
        amountFcfa: amount,
        phone: customer.phone,
        description: `Deo Gracias Wi-Fi — ${offerId} — commande ${order.id}`,
      });
    } catch (err) {
      app.log.error({ error_code: errorCodeOf(err) }, 'FedaPay createCheckout échoué');
      return reply.status(502).type('application/problem+json')
        .send(problem(502, 'Prestataire injoignable', 'FedaPay n’a pas accepté la transaction ; réessayez.'));
    }
    const marked = await repo.markPaymentAwaitingResult(payment.id, checkout.providerRef);
    if (marked === 'illegal') {
      const current = await repo.getLatestPaymentForOrder(order.id);
      return reply.status(409).type('application/problem+json')
        .send(paymentConflictView(order, current, 'Transition refusée', 'Le paiement ou la commande a changé d’état entre-temps.'));
    }
    return reply.status(202).send({
      order_id: order.id,
      order_reference: order.id,
      payment_id: payment.id,
      provider_ref: checkout.providerRef,
      redirect_url: checkout.redirectUrl,
      payment_state: 'PENDING',
      order_state: 'PAYMENT_PENDING',
    });
  });

  // Webhook : scope encapsulé pour parser le corps en STRING BRUT (exigence de la
  // vérification de signature — SDK officiel FedaPay : raw body + X-FEDAPAY-SIGNATURE).
  await app.register(async (scope) => {
    scope.addContentTypeParser(
      'application/json',
      { parseAs: 'string' },
      (_req, body, done) => {
        done(null, body);
      },
    );
    scope.post(
      '/webhooks/fedapay',
      { config: { rateLimit: { max: 600, timeWindow: 60 * 1000 } } },
      async (req, reply) => {
        const secret = payCfg?.webhookSecret;
        if (!secret) {
          return reply.status(503).type('application/problem+json')
            .send(problem(503, 'Webhook non configuré', 'FEDAPAY_WEBHOOK_SECRET absente (blueprint §7).'));
        }
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? '');
        const check = verifyWebhookSignature(raw, req.headers[FEDAPAY_SIGNATURE_HEADER], secret, {
          ...(payCfg?.toleranceS !== undefined ? { toleranceS: payCfg.toleranceS } : {}),
          ...(payCfg?.nowS ? { nowS: payCfg.nowS() } : {}),
        });
        const safeJson = (text: string): unknown => {
          try { return JSON.parse(text) as unknown; } catch { return null; }
        };
        if (!check.valid) {
          // Journal brut AVANT rejet (doc 06 §22 : raw event stored), sans confiance.
          const lenient = parseWebhookEvent(safeJson(raw));
          if (lenient) {
            try {
              await repo.insertPaymentEvent({
                paymentId: null,
                providerEventId: `fedapay:${lenient.eventId}:unsigned`,
                payload: safeJson(raw),
                signatureOk: false,
              });
            } catch { /* le rejet 400 prime sur l'échec de journalisation */ }
          }
          return reply.status(400).type('application/problem+json')
            .send(problem(400, 'Signature invalide', check.reason));
        }
        const json = safeJson(raw);
        const event = parseWebhookEvent(json);
        if (!event) {
          return reply.status(400).type('application/problem+json')
            .send(problem(400, 'Payload invalide', 'Événement FedaPay illisible (id/name manquants).'));
        }
        // Localisation du paiement : custom_metadata.payment_id d'abord, reference ensuite.
        let payment = event.metadataPaymentId ? await repo.getPaymentById(event.metadataPaymentId) : null;
        if (!payment && event.reference) payment = await repo.getPaymentByProviderRef(event.reference);

        const inserted = await repo.insertPaymentEvent({
          paymentId: payment?.id ?? null,
          providerEventId: `fedapay:${event.eventId}`,
          payload: json,
          signatureOk: true,
        });
        if (!inserted) return reply.status(200).send({ duplicate: true, event_id: event.eventId });

        switch (event.eventName) {
          case 'transaction.approved': {
            if (!payment) return reply.status(200).send({ ignored: 'payment_introuvable', event_id: event.eventId });
            const currencyOk = event.currencyIso === null || event.currencyIso === 'XOF';
            if (!currencyOk || event.amount === null || event.amount !== payment.amountFcfa) {
              // Doc 06 §23 : montant/divise divergents => on ne confirme JAMAIS.
              await repo.logAudit({
                actor: 'system',
                action: 'payment_amount_mismatch',
                entity: 'payments',
                entityId: payment.id,
              });
              return reply.status(200).send({ ignored: 'montant_divergent', event_id: event.eventId });
            }
            const res = await repo.confirmPayment(payment.id);
            if (res !== 'confirmed') {
              return reply.status(200).send({ ignored: 'transition_illegale', event_id: event.eventId });
            }
            // IMP-15 (doc 06 §90 étapes 11-15) : paiement confirmé => allocation
            // atomique du ticket puis livraison. Échec de stock = le paiement
            // CONFIRMÉ est préservé, l'ordre reste PAID (invariant 6, §88 retry).
            const delivery = await allocateAndDeliver(repo, payment.orderId, app.log);
            return reply.status(200).send({
              processed: 'confirmed',
              event_id: event.eventId,
              payment_id: payment.id,
              order_state: delivery.orderState,
              delivery: delivery.status,
            });
          }
          case 'transaction.declined':
          case 'transaction.canceled': {
            if (!payment) return reply.status(200).send({ ignored: 'payment_introuvable', event_id: event.eventId });
            const to =
              event.eventName === 'transaction.declined'
                ? { payment: 'FAILED' as const, order: 'FAILED' as const }
                : { payment: 'CANCELLED' as const, order: 'CANCELLED' as const };
            const res = await repo.failPayment(payment.id, to);
            return reply.status(200).send(
              res === 'failed'
                ? { processed: event.eventName === 'transaction.declined' ? 'failed' : 'canceled', event_id: event.eventId }
                : { ignored: 'transition_illegale', event_id: event.eventId },
            );
          }
          default:
            return reply.status(200).send({ ignored: 'evenement_non_gere', event_id: event.eventId, name: event.eventName });
        }
      },
    );
  });

  // IMP-25 — DÉMO LOCALE : approbation simulée d'un paiement DEV (jamais en
  // production : route montée seulement si payment.devMode, activé par
  // PAYMENT_DEV_MODE=1 SANS FEDAPAY_SECRET_KEY). Réutilise exactement le chemin
  // « confirmé => allocation => livraison » du webhook réel.
  if (payCfg?.devMode) {
    app.post('/webhooks/dev-approve', async (req, reply) => {
      const parsed = devApproveBodySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).type('application/problem+json')
          .send(problem(400, 'Body invalide', 'payment_id (UUID) requis.'));
      }
      const payment = await repo.getPaymentById(parsed.data.payment_id);
      if (!payment) {
        return reply.status(404).type('application/problem+json')
          .send(problem(404, 'Paiement introuvable', 'Aucun paiement avec cet id.'));
      }
      // Garde-fou : seuls les paiements du provider DEV sont approuvables ici.
      if (payment.providerRef == null || !payment.providerRef.startsWith('DEV-')) {
        return reply.status(409).type('application/problem+json')
          .send(problem(409, 'Paiement non-DEV', 'Cette route n’approuve que les paiements de démonstration.'));
      }
      const res = await repo.confirmPayment(payment.id);
      if (res !== 'confirmed') {
        return reply.status(200).send({ ignored: 'transition_illegale', payment_id: payment.id });
      }
      const delivery = await allocateAndDeliver(repo, payment.orderId, app.log);
      await repo.logAudit({ actor: 'system', action: 'dev_payment_approved', entity: 'payments', entityId: payment.id });
      return reply.status(200).send({
        processed: 'confirmed',
        payment_id: payment.id,
        order_state: delivery.orderState,
        delivery: delivery.status,
      });
    });
  }

  // ---------------------------------------------------------------------------
  // IMP-15 — Tickets : GET /tickets/mine (client) + POST /admin/orders/:id/allocate
  // (retry admin, matrice de récupération doc 06 §88). JAMAIS de code en clair :
  // la base ne stocke que code_hash (0004) — la réponse expose l'empreinte info
  // (préfixe/état) uniquement.
  // ---------------------------------------------------------------------------
  const resolveCustomerId = async (req: FastifyRequest): Promise<string | null> => {
    const token = bearerToken(req);
    if (!token) return null;
    const session = sessions.get(token);
    if (session) return session.customerId;
    if (verifier) {
      const identity = await verifier.verify(token);
      if (identity) {
        const phoneParsed = identity.phone ? phoneSchema.safeParse(identity.phone) : null;
        if (phoneParsed?.success) {
          const customerId = await repo.findOrCreateCustomer(phoneParsed.data);
          await repo.linkCustomerAuth(customerId, identity.sub);
          return customerId;
        }
      }
    }
    return null;
  };

  app.get('/tickets/mine', async (req, reply) => {
    const query = ticketMineQuerySchema.safeParse(req.query);
    if (!query.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'order_id doit être un UUID.'));
    }
    const customerId = await resolveCustomerId(req);
    if (!customerId) {
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const tickets = await repo.getSoldTicketsForCustomer(customerId);
    const correlated = query.data.order_id
      ? tickets.filter((ticket) => ticket.orderId === query.data.order_id)
      : tickets;
    return {
      customer_id: customerId,
      ...(query.data.order_id ? { order_id: query.data.order_id } : {}),
      tickets: correlated.map((t) => ({
        id: t.id,
        // Le serveur filtre déjà sur l'ordre demandé ; le client ne choisit
        // jamais un ticket d'une autre commande parmi ceux du même téléphone.
        order_id: t.orderId,
        order_reference: t.orderId,
        offer_id: t.offerId,
        db_state: t.dbState,
        router_state: t.routerState,
        sold_at: t.soldAt,
        code_prefix_hint: t.codePrefixHint,
      })),
    };
  });

  app.post('/admin/orders/:id/allocate', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    const actor = identity ? `admin:${identity.sub}` : 'anonymous';
    if (!identity || !identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({
        actor,
        action: 'admin_auth_denied',
        entity: 'auth',
        ...(identity ? { entityId: identity.sub } : {}),
      });
      return reply.status(identity ? 403 : 401).type('application/problem+json')
        .send(problem(identity ? 403 : 401, identity ? 'Accès refusé' : 'Authentification échouée',
          identity ? 'Rôle administrateur requis.' : GENERIC_401));
    }
    const parsed = orderIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'id doit être un UUID.'));
    }
    const order = await repo.getOrderById(parsed.data.id);
    if (!order) {
      return reply.status(404).type('application/problem+json')
        .send(problem(404, 'Commande introuvable', `Aucune commande avec l'id ${parsed.data.id}.`));
    }
    const outcome = await allocateAndDeliver(repo, order.id, app.log);
    await repo.logAudit({
      actor,
      action: `admin_allocate_${outcome.status}`,
      entity: 'orders',
      entityId: order.id,
    });
    return reply.status(200).send(outcome);
  });

  // ---------------------------------------------------------------------------
  // IMP-13 — Auth clients (phone OTP) + admin (Supabase Auth + rôle)
  // ---------------------------------------------------------------------------
  const authCfg = opts.auth;
  const devMode = authCfg?.devMode ?? false;
  const verifier = authCfg?.verifier;
  const otp = new OtpStore(authCfg?.otp);
  const sessions = new SessionStore(authCfg?.sessions);
  const GENERIC_401 = 'Jeton ou code invalide/expiré.';

  app.post(
    '/auth/phone/request',
    { config: { rateLimit: { max: authCfg?.rateLimits?.requestMax ?? 5, timeWindow: 30 * 60 * 1000 } } },
    async (req, reply) => {
      if (!devMode) {
        // Aucun canal SMS en Phase 1 (budget nul) : réponse honnête, jamais de faux « envoyé ».
        return reply
          .status(503)
          .type('application/problem+json')
          .send(problem(503, 'Canal SMS non configuré', 'AUTH_DEV_MODE absent et aucun fournisseur SMS décidé (décision propriétaire attendue).'));
      }
      const parsed = authPhoneRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).type('application/problem+json')
          .send(problem(400, 'Payload invalide', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ')));
      }
      const { outcome, code } = otp.request(parsed.data.phone);
      if (outcome === 'rate_limited') {
        return reply.status(429).type('application/problem+json')
          .send(problem(429, 'Trop de demandes', 'Maximum 3 codes par 30 minutes pour ce numéro.'));
      }
      return reply.status(202).send({ status: 'requested', dev_code: code });
    },
  );

  app.post(
    '/auth/phone/verify',
    { config: { rateLimit: { max: authCfg?.rateLimits?.verifyMax ?? 10, timeWindow: 60 * 1000 } } },
    async (req, reply) => {
      if (!devMode) {
        return reply.status(503).type('application/problem+json')
          .send(problem(503, 'Canal SMS non configuré', 'AUTH_DEV_MODE absent et aucun fournisseur SMS décidé (décision propriétaire attendue).'));
      }
      const parsed = authPhoneVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).type('application/problem+json')
          .send(problem(400, 'Payload invalide', parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' | ')));
      }
      const { phone, code } = parsed.data;
      if (otp.verify(phone, code) !== 'ok') {
        // Message générique unique (doc 09 §7) : pas de distinction code faux/expiré/épuisé.
        return reply.status(401).type('application/problem+json')
          .send(problem(401, 'Authentification échouée', GENERIC_401));
      }
      const customerId = await repo.findOrCreateCustomer(phone);
      const session = sessions.create(customerId, phone);
      return reply.status(200).send({
        token: session.token,
        customer_id: customerId,
        phone,
        expires_at: new Date(session.expiresAt).toISOString(),
      });
    },
  );

  app.post('/auth/logout', async (req, reply) => {
    const token = bearerToken(req);
    if (token) sessions.revoke(token);
    return reply.status(204).send();
  });

  app.get('/auth/me', async (req, reply) => {
    const token = bearerToken(req);
    if (!token) {
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification requise', GENERIC_401));
    }
    const session = sessions.get(token);
    if (session) {
      return { auth: 'phone-session', customer_id: session.customerId, phone: session.phone };
    }
    if (verifier) {
      const identity = await verifier.verify(token);
      if (identity) {
        const phoneParsed = identity.phone ? phoneSchema.safeParse(identity.phone) : null;
        const phone = phoneParsed?.success ? phoneParsed.data : null;
        if (phone) {
          const customerId = await repo.findOrCreateCustomer(phone);
          await repo.linkCustomerAuth(customerId, identity.sub);
          return { auth: 'supabase', auth_user_id: identity.sub, customer_id: customerId, phone };
        }
        return { auth: 'supabase', auth_user_id: identity.sub, email: identity.email };
      }
    }
    return reply.status(401).type('application/problem+json')
      .send(problem(401, 'Authentification échouée', GENERIC_401));
  });

  app.get('/admin/me', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    if (!identity) {
      await repo.logAudit({ actor: 'anonymous', action: 'admin_auth_denied', entity: 'auth' });
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const actor = `admin:${identity.sub}`;
    if (!identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({ actor, action: 'admin_auth_denied', entity: 'auth', entityId: identity.sub });
      return reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Rôle administrateur requis.'));
    }
    await repo.logAudit({ actor, action: 'admin_auth_ok', entity: 'auth', entityId: identity.sub });
    return { sub: identity.sub, role: identity.role, email: identity.email };
  });

  // IMP-17 — Dashboard admin : chiffres depuis données persistées (doc 09 §13),
  // jamais reconstruits côté frontend.
  app.get('/admin/dashboard', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    if (!identity) {
      await repo.logAudit({ actor: 'anonymous', action: 'admin_auth_denied', entity: 'auth' });
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const actor = `admin:${identity.sub}`;
    if (!identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({ actor, action: 'admin_auth_denied', entity: 'auth', entityId: identity.sub });
      return reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Rôle administrateur requis.'));
    }
    const now = new Date();
    const since = startOfBusinessDay(now);
    const stats = await repo.getAdminDashboardStats(since);
    const plans = await repo.listActivePlans();
    const offerIds = Array.from(new Set(plans.map((pl) => pl.offerId)));
    return buildDashboardPayload(stats, offerIds, now);
  });

  // IMP-17 — Inventaire détaillé par offre (doc 09 §12.1 Inventaire).
  app.get('/admin/tickets/stats', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    if (!identity) {
      await repo.logAudit({ actor: 'anonymous', action: 'admin_auth_denied', entity: 'auth' });
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const actor = `admin:${identity.sub}`;
    if (!identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({ actor, action: 'admin_auth_denied', entity: 'auth', entityId: identity.sub });
      return reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Rôle administrateur requis.'));
    }
    const rows = await repo.getTicketsStatsByOffer();
    const offers = rows.map((r) => {
      const states = r.states;
      const available = (states['AVAILABLE'] ?? 0) + (states['RELEASED'] ?? 0);
      const reserved = states['RESERVED'] ?? 0;
      const sold = (states['SOLD'] ?? 0) + (states['USED'] ?? 0);
      const expired = Object.entries(states)
        .filter(([k]) => !['AVAILABLE', 'RELEASED', 'RESERVED', 'SOLD', 'USED'].includes(k))
        .reduce((acc, [, v]) => acc + v, 0);
      return {
        offer_id: r.offerId,
        price_fcfa: r.priceFcfa,
        available,
        reserved,
        sold,
        expired,
        total: available + reserved + sold + expired,
      };
    });
    const totals = offers.reduce(
      (acc, o) => ({
        available: acc.available + o.available,
        reserved: acc.reserved + o.reserved,
        sold: acc.sold + o.sold,
        expired: acc.expired + o.expired,
        total: acc.total + o.total,
      }),
      { available: 0, reserved: 0, sold: 0, expired: 0, total: 0 },
    );
    return { offers, totals };
  });

  // IMP-17 — Reconnaissance d'une alerte (doc 09 §4.E). Idempotent : re-ack => 200.
  app.post('/admin/alerts/:id/ack', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    const actor = identity ? `admin:${identity.sub}` : 'anonymous';
    if (!identity || !identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({
        actor,
        action: 'admin_auth_denied',
        entity: 'auth',
        ...(identity ? { entityId: identity.sub } : {}),
      });
      return reply.status(identity ? 403 : 401).type('application/problem+json')
        .send(problem(identity ? 403 : 401, identity ? 'Accès refusé' : 'Authentification échouée',
          identity ? 'Rôle administrateur requis.' : GENERIC_401));
    }
    const parsed = orderIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'id doit être un UUID.'));
    }
    const result = await repo.acknowledgeAlert(parsed.data.id);
    if (!result) {
      await repo.logAudit({ actor, action: 'admin_alert_ack_notfound', entity: 'alerts', entityId: parsed.data.id });
      return reply.status(404).type('application/problem+json')
        .send(problem(404, 'Alerte introuvable', `Aucune alerte avec l'id ${parsed.data.id}.`));
    }
    await repo.logAudit({
      actor,
      action: result.alreadyAcknowledged ? 'admin_alert_ack_noop' : 'admin_alert_ack',
      entity: 'alerts',
      entityId: result.id,
    });
    return {
      id: result.id,
      rule: result.rule,
      severity: result.severity,
      acknowledged_at: result.acknowledgedAt.toISOString(),
      already_acknowledged: result.alreadyAcknowledged,
    };
  });

  // IMP-18 — génération d'un lot de tickets digitaux par le backend (contrat
  // Mikmon §3) : batch + tickets hashés + ordres create_ticket en file
  // mikrotik_sync, en UNE transaction. Les codes clairs sont retournés UNE
  // SEULE fois (affichage voucher), la base ne garde que sha256 (0004).
  app.post('/admin/batches', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    const actor = identity ? `admin:${identity.sub}` : 'anonymous';
    if (!identity || !identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({
        actor,
        action: 'admin_auth_denied',
        entity: 'auth',
        ...(identity ? { entityId: identity.sub } : {}),
      });
      return reply.status(identity ? 403 : 401).type('application/problem+json')
        .send(problem(identity ? 403 : 401, identity ? 'Accès refusé' : 'Authentification échouée',
          identity ? 'Rôle administrateur requis.' : GENERIC_401));
    }
    const parsed = createBatchBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const q = (req.body as { quantity?: unknown } | null)?.quantity;
      const detail = typeof q === 'number' && (!Number.isInteger(q) || q < 1 || q > 200)
        ? 'quantity doit être un entier entre 1 et 200 (contrat Mikmon §3.5 : ~200 créations/lot max, RAM 128 Mo).'
        : 'offer_id doit être une offre de la Grille A, quantity un entier 1..200.';
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Corps invalide', detail));
    }
    const plan = await repo.getActivePlanByOffer(parsed.data.offer_id);
    if (!plan) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Offre sans plan actif', `Aucun plan actif pour l'offre ${parsed.data.offer_id}.`));
    }
    const batch = await repo.createBackendBatch({
      offerId: parsed.data.offer_id,
      quantity: parsed.data.quantity,
      ...(opts.ticketVaultKey ? { vaultKey: opts.ticketVaultKey } : {}),
    });
    await repo.logAudit({
      actor,
      action: 'admin_batch_created',
      entity: 'ticket_batches',
      entityId: batch.batchId,
    });
    return reply.status(201).send({
      batch: {
        id: batch.batchId,
        seq: batch.seq,
        offer_id: batch.offerId,
        quantity: batch.quantity,
        generated_at: batch.generatedAt.toISOString(),
      },
      code_export: batch.specs.map((spec) => ({
        router_name: spec.routerName,
        code: spec.clientCode,
        comment: spec.mikrotikComment,
      })),
      export_warning: 'Codes en clair : affichage UNIQUE. Archiver immédiatement au coffre (PDF/chiffré) ; la base ne conserve que les empreintes sha256.',
    });
  });

  // IMP-21 — routes Connector (blueprint §5) : claim / result sur la file
  // mikrotik_sync, auth par token long-lived dédié (CONNECTOR_TOKEN, blueprint §7).
  const connectorToken = opts.connector?.token;
  const connectorMaxAttempts = opts.connector?.maxAttempts ?? SYNC_MAX_ATTEMPTS;
  const connectorBackoff = opts.connector?.backoffMs ?? SYNC_BACKOFF_MS;

  const connectorAuthOk = async (req: FastifyRequest, reply: FastifyReply): Promise<boolean> => {
    if (!connectorToken) {
      await reply.status(503).type('application/problem+json')
        .send(problem(503, 'Connector non configuré', 'CONNECTOR_TOKEN absent (blueprint §7).'));
      return false;
    }
    const token = bearerToken(req);
    const provided = token ? createHash('sha256').update(token).digest() : null;
    const expected = createHash('sha256').update(connectorToken).digest();
    if (!provided || !timingSafeEqual(provided, expected)) {
      await repo.logAudit({ actor: 'connector', action: 'connector_auth_denied', entity: 'auth' });
      await reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', 'Token Connector invalide.'));
      return false;
    }
    return true;
  };

  // IMP-30 — heartbeat explicite : l'absence de heartbeat conserve UNKNOWN.
  app.post('/connector/heartbeat', async (req, reply) => {
    if (!(await connectorAuthOk(req, reply))) return;
    const parsed = connectorHeartbeatBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Body invalide', parsed.error.issues.map((i) => i.message).join(' ; ')));
    }
    await repo.recordConnectorHeartbeat({
      connectorId: parsed.data.connector_id,
      ...(parsed.data.version ? { version: parsed.data.version } : {}),
      ...(parsed.data.router_model ? { routerModel: parsed.data.router_model } : {}),
      ...(parsed.data.routeros_version ? { routerosVersion: parsed.data.routeros_version } : {}),
    });
    await repo.logAudit({ actor: 'connector', action: 'connector_heartbeat', entity: 'connector_heartbeats', entityId: parsed.data.connector_id });
    return reply.status(200).send({ ok: true, received_at: new Date().toISOString() });
  });

  app.post('/connector/sync/claim', async (req, reply) => {
    if (!(await connectorAuthOk(req, reply))) return;
    const parsed = connectorClaimBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Body invalide', parsed.error.issues.map((i) => i.message).join(' ; ')));
    }
    const op = await repo.claimSyncOp(parsed.data.worker_id, new Date());
    if (!op) return reply.status(204).send();
    return reply.status(200).send(toSyncOpView(op));
  });

  app.post('/connector/sync/:id/result', async (req, reply) => {
    if (!(await connectorAuthOk(req, reply))) return;
    const params = orderIdParamsSchema.safeParse(req.params);
    if (!params.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètre invalide', 'id doit être un UUID.'));
    }
    const parsed = connectorResultBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Body invalide', parsed.error.issues.map((i) => i.message).join(' ; ')));
    }
    const op = await repo.getSyncOpById(params.data.id);
    if (!op) {
      return reply.status(404).type('application/problem+json')
        .send(problem(404, 'Opération introuvable', 'Aucune opération de synchronisation avec cet id.'));
    }
    if (op.state !== 'PROCESSING') {
      return reply.status(409).type('application/problem+json')
        .send(problem(409, 'État incompatible', `Opération en état ${op.state} ; seul PROCESSING est résoluble.`));
    }
    const now = new Date();
    if (parsed.data.success) {
      const outcome = await repo.resolveSyncOp(op.id, { kind: 'success', ...(parsed.data.result ? { result: parsed.data.result } : {}) }, now);
      // INC-04 / engagement IMP-18 : le code clair ne survit pas au succès.
      if (op.operation === 'create_ticket') await repo.purgeSyncPayloadSecret(op.id);
      await repo.logAudit({ actor: 'connector', action: 'connector_sync_success', entity: 'mikrotik_sync', entityId: op.id });
      return reply.status(200).send({ state: outcome.state, attempts: outcome.attempts });
    }
    const error = parsed.data.error as { code: string; message: string };
    const nextRetryAt = op.attempts >= connectorMaxAttempts
      ? null
      : new Date(now.getTime() + (connectorBackoff[Math.min(op.attempts - 1, connectorBackoff.length - 1)] ?? SYNC_BACKOFF_MS[0] ?? 60_000));
    const outcome = await repo.resolveSyncOp(op.id, { kind: 'failure', error, nextRetryAt }, now);
    if (outcome.state === 'BLOCKED') {
      await repo.raiseAlert({
        rule: 'sync_blocked',
        severity: 'WARNING',
        payload: { op_id: op.id, operation: op.operation, attempts: op.attempts, error },
      });
      await repo.logAudit({ actor: 'connector', action: 'connector_sync_blocked', entity: 'mikrotik_sync', entityId: op.id });
    } else {
      await repo.logAudit({ actor: 'connector', action: 'connector_sync_failed', entity: 'mikrotik_sync', entityId: op.id });
    }
    return reply.status(200).send({
      state: outcome.state,
      attempts: outcome.attempts,
      ...(nextRetryAt ? { next_retry_at: nextRetryAt.toISOString() } : {}),
    });
  });

  // IMP-22 — inventaire attendu plateforme (contrat §4) : vouchers digitaux
  // synchronisés + empreintes legacy (jamais de code clair, D13).
  app.get('/connector/inventory/expected', async (req, reply) => {
    if (!(await connectorAuthOk(req, reply))) return;
    const expected = await repo.getConnectorExpectedInventory();
    return reply.status(200).send({
      digital_vouchers: expected.digitalVouchers,
      legacy_code_hashes: expected.legacyCodeHashes,
    });
  });

  // IMP-22 — rapport de lecture read-only : trace dans reconciliation_runs
  // (router_total_seen rempli) + alerte WARNING si MISMATCH (garde-fou INC-03).
  app.post('/connector/inventory/report', async (req, reply) => {
    if (!(await connectorAuthOk(req, reply))) return;
    const parsed = connectorInventoryReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Body invalide', parsed.error.issues.map((i) => i.message).join(' ; ')));
    }
    const body = parsed.data;
    const expected = await repo.getConnectorExpectedInventory();
    const runId = await repo.insertReconciliationRun({
      routerTotalExpected: expected.digitalVouchers.length + expected.legacyCodeHashes.length,
      routerTotalSeen: body.router_total_seen,
      diff: {
        mode: 'readonly_v0',
        status_source: 'connector',
        violations: body.violations,
        anomalies: body.anomalies,
        by_profile: body.by_profile,
        admin_free_seen: body.admin_free_seen,
        journal_sales: body.journal_sales,
      },
      status: body.status,
    });
    if (body.status === 'MISMATCH') {
      await repo.raiseAlert({
        rule: 'router_readonly_mismatch',
        severity: 'WARNING',
        payload: { run_id: runId, violations: body.violations, anomalies: body.anomalies.length },
      });
    }
    await repo.logAudit({ actor: 'connector', action: 'connector_inventory_report', entity: 'reconciliation_runs', entityId: runId });
    return reply.status(201).send({ run_id: runId, status: body.status });
  });

  // IMP-24 — vue admin de la réconciliation (contrat §4.4, INC-03) : runs
  // persistés par le rapport Connector + alertes non acquittées.
  app.get('/admin/reconciliation', async (req, reply) => {
    if (!verifier) {
      return reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    if (!identity) {
      await repo.logAudit({ actor: 'anonymous', action: 'admin_auth_denied', entity: 'auth' });
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const actor = `admin:${identity.sub}`;
    if (!identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({ actor, action: 'admin_auth_denied', entity: 'auth', entityId: identity.sub });
      return reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Rôle administrateur requis.'));
    }
    const [runs, openAlerts] = await Promise.all([
      repo.listReconciliationRuns(20),
      repo.listOpenReconciliationAlerts(50),
    ]);
    return {
      runs: runs.map((r) => ({
        id: r.id,
        started_at: r.startedAt,
        finished_at: r.finishedAt,
        router_total_expected: r.routerTotalExpected,
        router_total_seen: r.routerTotalSeen,
        status: r.status,
        mode: (r.diff?.['mode'] as string | undefined) ?? null,
        violations: (r.diff?.['violations'] as string[] | undefined) ?? [],
        anomalies_count: Array.isArray(r.diff?.['anomalies']) ? (r.diff['anomalies'] as unknown[]).length : 0,
      })),
      open_alerts: openAlerts.map((a) => ({
        id: a.id,
        rule: a.rule,
        severity: a.severity,
        created_at: a.createdAt,
        run_id: (a.payload['run_id'] as string | undefined) ?? null,
      })),
    };
  });

  // ---------------------------------------------------------------------------
  // IMP-27 — listes opérationnelles du Dashboard Admin.
  // Toutes sont paginées, authentifiées côté serveur et sans secret de ticket,
  // payload webhook ou détail de synchronisation sensible.
  // ---------------------------------------------------------------------------
  const requireAdminImp27 = async (req: FastifyRequest, reply: FastifyReply): Promise<AuthIdentity | null> => {
    if (!verifier) {
      await reply.status(503).type('application/problem+json')
        .send(problem(503, 'Auth admin non configurée', 'SUPABASE_URL et SUPABASE_ANON_KEY sont requises (blueprint §7).'));
      return null;
    }
    const token = bearerToken(req);
    const identity = token ? await verifier.verify(token) : null;
    if (!identity) {
      await repo.logAudit({ actor: 'anonymous', action: 'admin_auth_denied', entity: 'auth' });
      await reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
      return null;
    }
    if (!identity.role || !ADMIN_ROLES.includes(identity.role)) {
      await repo.logAudit({ actor: `admin:${identity.sub}`, action: 'admin_auth_denied', entity: 'auth', entityId: identity.sub });
      await reply.status(403).type('application/problem+json')
        .send(problem(403, 'Accès refusé', 'Rôle administrateur requis.'));
      return null;
    }
    return identity;
  };

  const parseAdminListOptions = (req: FastifyRequest, reply: FastifyReply): AdminListOptions | null => {
    const parsed = adminListQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      void reply.status(400).type('application/problem+json')
        .send(problem(400, 'Paramètres invalides', 'La pagination ou le filtre demandé est invalide.'));
      return null;
    }
    return {
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      ...(parsed.data.search ? { search: parsed.data.search } : {}),
      ...(parsed.data.state ? { state: parsed.data.state } : {}),
    };
  };

  app.get('/admin/system/status', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const now = new Date();
    const stats = await repo.getAdminDashboardStats(startOfBusinessDay(now));
    const plans = await repo.listActivePlans();
    const payload = buildDashboardPayload(stats, Array.from(new Set(plans.map((plan) => plan.offerId))), now);
    return {
      generated_at: payload.generated_at,
      timezone: payload.timezone,
      connector_state: payload.system.connector_state,
      connector_id: payload.system.connector_id,
      connector_last_contact_at: payload.system.connector_last_contact_at,
      connector_version: payload.system.connector_version,
      router_model: payload.system.router_model,
      routeros_version: payload.system.routeros_version,
      sync_state: payload.system.sync_state,
      last_sync_at: payload.system.last_sync_at,
      last_sync_state: payload.system.last_sync_state,
      last_sync_error: payload.system.last_sync_error,
      sync_pending: payload.system.sync_pending,
      sync_failed: payload.system.sync_failed,
      sync_success: payload.system.sync_success,
      incidents_open: payload.system.incidents_open,
    };
  });

  app.get('/admin/orders/:id', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const parsed = adminIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).type('application/problem+json')
        .send(problem(400, 'Identifiant invalide', 'L’identifiant de commande doit être un UUID.'));
    }
    const order = await repo.getAdminOrderById(parsed.data.id);
    if (!order) {
      return reply.status(404).type('application/problem+json')
        .send(problem(404, 'Commande introuvable', 'Aucune commande ne correspond à cet identifiant.'));
    }
    return {
      id: order.id, phone: order.phone, state: order.state, offer_id: order.offerId, price_fcfa: order.priceFcfa,
      payment_state: order.paymentState, ticket_state: order.ticketState, created_at: order.createdAt, updated_at: order.updatedAt,
      payment: order.payment ? {
        id: order.payment.id, order_id: order.payment.orderId, provider: order.payment.provider,
        provider_ref: order.payment.providerRef, amount_fcfa: order.payment.amountFcfa, state: order.payment.state,
        confirmed_at: order.payment.confirmedAt, created_at: order.payment.createdAt,
      } : null,
      ticket: order.ticket ? {
        id: order.ticket.id, batch_id: order.ticket.batchId, offer_id: order.ticket.offerId, source: order.ticket.source,
        db_state: order.ticket.dbState, router_state: order.ticket.routerState, order_id: order.ticket.orderId,
        code_prefix_hint: order.ticket.codePrefixHint, sold_at: order.ticket.soldAt, activation_deadline: order.ticket.activationDeadline,
      } : null,
    };
  });

  app.get('/admin/orders', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const options = parseAdminListOptions(req, reply);
    if (!options) return;
    const page = await repo.listAdminOrders(options);
    return {
      items: page.items.map((o) => ({
        id: o.id, phone: o.phone, state: o.state, offer_id: o.offerId, price_fcfa: o.priceFcfa,
        payment_state: o.paymentState, ticket_state: o.ticketState, created_at: o.createdAt, updated_at: o.updatedAt,
      })),
      total: page.total, limit: page.limit, offset: page.offset,
    };
  });

  app.get('/admin/payments', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const options = parseAdminListOptions(req, reply);
    if (!options) return;
    const page = await repo.listAdminPayments(options);
    return {
      items: page.items.map((p) => ({
        id: p.id, order_id: p.orderId, phone: p.phone, provider: p.provider, provider_ref: p.providerRef,
        amount_fcfa: p.amountFcfa, state: p.state, confirmed_at: p.confirmedAt, created_at: p.createdAt,
      })),
      total: page.total, limit: page.limit, offset: page.offset,
    };
  });

  app.get('/admin/tickets', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const options = parseAdminListOptions(req, reply);
    if (!options) return;
    const page = await repo.listAdminTickets(options);
    return {
      items: page.items.map((t) => ({
        id: t.id, batch_id: t.batchId, offer_id: t.offerId, source: t.source, db_state: t.dbState,
        router_state: t.routerState, order_id: t.orderId, code_prefix_hint: t.codePrefixHint,
        sold_at: t.soldAt, activation_deadline: t.activationDeadline,
      })),
      total: page.total, limit: page.limit, offset: page.offset,
    };
  });

  app.get('/admin/batches', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const options = parseAdminListOptions(req, reply);
    if (!options) return;
    const page = await repo.listAdminBatches(options);
    return {
      items: page.items.map((b) => ({
        id: b.id, source: b.source, quantity: b.quantity, generated_at: b.generatedAt,
        created_at: b.createdAt, notes: b.notes,
      })),
      total: page.total, limit: page.limit, offset: page.offset,
    };
  });

  app.get('/admin/audit-logs', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const options = parseAdminListOptions(req, reply);
    if (!options) return;
    const page = await repo.listAdminAuditLogs(options);
    return {
      items: page.items.map((a) => ({
        id: a.id, actor: a.actor, action: a.action, entity: a.entity,
        entity_id: a.entityId, at: a.at,
      })),
      total: page.total, limit: page.limit, offset: page.offset,
    };
  });

  app.get('/admin/incidents', async (req, reply) => {
    if (!await requireAdminImp27(req, reply)) return;
    const options = parseAdminListOptions(req, reply);
    if (!options) return;
    const page = await repo.listAdminIncidents(options);
    return {
      items: page.items.map((i) => ({
        id: i.id, type: i.type, severity: i.severity, state: i.state,
        opened_at: i.openedAt, closed_at: i.closedAt, created_at: i.createdAt,
      })),
      total: page.total, limit: page.limit, offset: page.offset,
    };
  });

  // IMP-20 — workers in-process (blueprint §6, D11) : order-expiry,
  // webhook-sweeper (si provider FedaPay configuré), reconciler simulé.
  if (opts.workers?.enabled) {
    const handle = startWorkers(opts.repo, {
      ...(opts.payment?.provider ? { provider: opts.payment.provider } : {}),
      ...(opts.workers.intervals ? { intervals: opts.workers.intervals } : {}),
    });
    app.addHook('onClose', async () => {
      handle.stop();
    });
    app.log.info('IMP-20/21 workers démarrés : order-expiry(60s) webhook-sweeper(300s) reconciler-sim(3600s) sync-requeue(60s)');
  }

  return app;
}
