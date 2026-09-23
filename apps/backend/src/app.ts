/**
 * IMP-12 — Application Fastify : catalogue + commandes + sondes (blueprint §5).
 * Routes livrées : GET /healthz, GET /readyz, GET /offers,
 * POST /orders (Idempotency-Key), GET /orders/:id.
 * Erreurs au format RFC 7807 (application/problem+json).
 * Les routes paiements/tickets/admin/connector arrivent en IMP-13→21.
 */
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyRequest } from 'fastify';
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
  type AuthVerifier,
  type OtpConfig,
} from './auth.js';
import {
  authPhoneRequestSchema,
  authPhoneVerifySchema,
  createOrderBodySchema,
  idempotencyKeySchema,
  normalizePhone,
  orderIdParamsSchema,
  phoneSchema,
  problem,
  type OrderView,
} from './schemas.js';
import { buildPlanSnapshot, type BackendRepo, type OrderRecord } from './repo.js';
import { allocateAndDeliver } from './tickets.js';
import { buildDashboardPayload, startOfBusinessDay } from './admin.js';

export interface BuildAppOptions {
  repo: BackendRepo;
  logger?: boolean;
  /** Rate-limit par IP (règle transverse blueprint §5). Défaut : 100 req/min. */
  rateLimit?: { max: number; timeWindow?: string };
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
  };
}

function toOrderView(o: OrderRecord, offerId: string): OrderView {
  return {
    id: o.id,
    state: o.state,
    currency: o.currency,
    offer_id: offerId,
    plan_snapshot: o.planSnapshot,
    created_at: o.createdAt.toISOString(),
    updated_at: o.updatedAt.toISOString(),
  };
}

export async function buildApp(opts: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false });
  const { repo } = opts;

  await app.register(rateLimit, {
    max: opts.rateLimit?.max ?? 100,
    timeWindow: opts.rateLimit?.timeWindow ?? '1 minute',
  });

  // Toute erreur (validation zod incluse) => RFC 7807.
  app.setErrorHandler((err: FastifyError, _req, reply) => {
    const status = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) app.log.error(err);
    void reply
      .status(status)
      .type('application/problem+json')
      .send(problem(status, status >= 500 ? 'Erreur interne' : err.message, err.message));
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
      return { status: 'ready' };
    } catch {
      return reply
        .status(503)
        .type('application/problem+json')
        .send(problem(503, 'Base indisponible', 'La base de données ne répond pas.'));
    }
  });

  // Catalogue : servi depuis `plans` actifs (blueprint §5) — la parité avec la
  // Grille A (packages/shared OFFERS) est verrouillée par test d'intégration + seed-sync.
  app.get('/offers', async () => {
    const plans = await repo.listActivePlans();
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
    return reply.status(created ? 201 : 200).send(toOrderView(order, offerId));
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
    return toOrderView(order, offerId);
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
      return reply.status(409).type('application/problem+json')
        .send(problem(409, 'Commande déjà payée', `État courant : ${state}.`));
    }
    const open = await repo.getOpenPaymentForOrder(order.id);
    if (state === 'PAYMENT_PENDING' && open) {
      // Rejeu : on ne rappelle JAMAIS le prestataire pour rien (idempotence).
      return reply.status(200).send({
        payment_id: open.id,
        provider_ref: open.providerRef,
        payment_state: open.state,
        order_state: order.state,
        replay: true,
      });
    }
    if (!canOrderTransition(state, 'PAYMENT_PENDING')) {
      return reply.status(409).type('application/problem+json')
        .send(problem(409, 'Commande non payable', `État courant : ${state}.`));
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
      app.log.error({ err }, 'FedaPay createCheckout échoué');
      return reply.status(502).type('application/problem+json')
        .send(problem(502, 'Prestataire injoignable', 'FedaPay n’a pas accepté la transaction ; réessayez.'));
    }
    const marked = await repo.markPaymentAwaitingResult(payment.id, checkout.providerRef);
    if (marked === 'illegal') {
      return reply.status(409).type('application/problem+json')
        .send(problem(409, 'Transition refusée', 'Le paiement ou la commande a changé d’état entre-temps.'));
    }
    return reply.status(202).send({
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
    const customerId = await resolveCustomerId(req);
    if (!customerId) {
      return reply.status(401).type('application/problem+json')
        .send(problem(401, 'Authentification échouée', GENERIC_401));
    }
    const tickets = await repo.getSoldTicketsForCustomer(customerId);
    return {
      customer_id: customerId,
      tickets: tickets.map((t) => ({
        id: t.id,
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

  return app;
}
