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
  createOrderBodySchema,
  idempotencyKeySchema,
  orderIdParamsSchema,
  problem,
  type OrderView,
} from './schemas.js';
import { buildPlanSnapshot, type BackendRepo, type OrderRecord } from './repo.js';

export interface BuildAppOptions {
  repo: BackendRepo;
  logger?: boolean;
  /** Rate-limit par IP (règle transverse blueprint §5). Défaut : 100 req/min. */
  rateLimit?: { max: number; timeWindow?: string };
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

  return app;
}
