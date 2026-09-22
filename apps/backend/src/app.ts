/**
 * IMP-12 — Application Fastify : catalogue + commandes + sondes (blueprint §5).
 * Routes livrées : GET /healthz, GET /readyz, GET /offers,
 * POST /orders (Idempotency-Key), GET /orders/:id.
 * Erreurs au format RFC 7807 (application/problem+json).
 * Les routes paiements/tickets/admin/connector arrivent en IMP-13→21.
 */
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
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

  return app;
}
