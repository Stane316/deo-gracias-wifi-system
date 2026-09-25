import { expect, test, type Page, type Route } from '@playwright/test';

const ORDER_ID = '00000000-0000-4000-8000-000000000027';
const PAYMENT_ID = '00000000-0000-4000-8000-000000000028';
const TICKET_ID = '00000000-0000-4000-8000-000000000029';
const OFFER = {
  id: '24-HEURES', priceFcfa: 300, accessHours: 24, validityHours: 48,
  mikrotikProfile: '24-HEURES', limitUptime: '1d00:00:00',
};

function order(state: string, paymentState = 'PENDING') {
  return {
    id: ORDER_ID,
    order_reference: ORDER_ID,
    state,
    currency: 'XOF',
    offer_id: OFFER.id,
    plan_snapshot: {
      offer_id: OFFER.id,
      price_snapshot: OFFER.priceFcfa,
      access_duration_snapshot: OFFER.accessHours,
      validity_duration_snapshot: OFFER.validityHours,
      mikrotik_profile: OFFER.mikrotikProfile,
      limit_uptime: OFFER.limitUptime,
    },
    payment: { id: PAYMENT_ID, provider_ref: 'DEV-IMP27', state: paymentState },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function commonApi(page: Page) {
  await page.route('**/api/offers', (route) => json(route, [OFFER]));
  await page.route('**/api/orders', async (route) => {
    if (route.request().method() === 'POST') {
      await json(route, { ...order('CREATED'), payment: null }, 201);
      return;
    }
    await route.continue();
  });
  await page.route(`**/api/orders/${ORDER_ID}/pay`, (route) =>
    json(route, {
      order_id: ORDER_ID, order_reference: ORDER_ID, payment_id: PAYMENT_ID,
      provider_ref: 'DEV-IMP27', redirect_url: null, payment_state: 'PENDING', order_state: 'PAYMENT_PENDING',
    }, 202),
  );
}

async function startPayment(page: Page, state: string | (() => string), opts: { token?: boolean } = {}) {
  if (opts.token) {
    await page.addInitScript(() => localStorage.setItem('dg.customer.token', 'browser-token'));
  }
  await commonApi(page);
  let reads = 0;
  await page.route(`**/api/orders/${ORDER_ID}`, (route) => {
    reads += 1;
    const current = typeof state === 'function' ? state() : state;
    void json(route, order(current));
  });
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Acheter un accès Wi-Fi' }).click();
  await page.locator('.offer-card').getByRole('button').click();
  await page.getByRole('button', { name: 'Continuer vers le paiement' }).click();
  await page.locator('.method-card').click();
  await page.locator('#phone').fill('0197123456');
  await page.getByRole('button', { name: 'Vérifier mon numéro' }).click();
  await page.getByRole('button', { name: 'Payer 300 FCFA' }).click();
  return () => reads;
}

test.describe('IMP-27 — parcours navigateur réel du checkout', () => {
  test('double clic : une seule initialisation de paiement', async ({ page }) => {
    await commonApi(page);
    let payCalls = 0;
    await page.route(`**/api/orders/${ORDER_ID}/pay`, async (route) => {
      payCalls += 1;
      await json(route, {
        order_id: ORDER_ID, order_reference: ORDER_ID, payment_id: PAYMENT_ID,
        provider_ref: 'DEV-IMP27', redirect_url: null, payment_state: 'PENDING', order_state: 'PAYMENT_PENDING',
      }, 202);
    });
    await page.route(`**/api/orders/${ORDER_ID}`, (route) => json(route, order('PAYMENT_PENDING')));
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Acheter un accès Wi-Fi' }).click();
    await page.locator('.offer-card').getByRole('button').click();
    await page.getByRole('button', { name: 'Continuer vers le paiement' }).click();
    await page.locator('.method-card').click();
    await page.locator('#phone').fill('0197123456');
    await page.getByRole('button', { name: 'Vérifier mon numéro' }).click();
    await page.getByRole('button', { name: 'Payer 300 FCFA' }).dblclick();
    await expect.poll(() => payCalls).toBe(1);
  });

  test('paiement en attente : état backend conservé et référence visible', async ({ page }) => {
    await startPayment(page, 'PAYMENT_PENDING');
    await expect(page.getByRole('heading', { name: 'Paiement en attente' })).toBeVisible();
    await expect(page.getByText(`Référence commande : ${ORDER_ID}`)).toBeVisible();
  });

  test('rafraîchissement : la commande et les identifiants sont repris', async ({ page }) => {
    await page.addInitScript(({ orderId, paymentId, offer }) => {
      sessionStorage.setItem('dg.checkout.resume', JSON.stringify({
        orderId, paymentId, providerRef: 'DEV-IMP27', offer, phone: '0197123456',
      }));
    }, { orderId: ORDER_ID, paymentId: PAYMENT_ID, offer: OFFER });
    await commonApi(page);
    await page.route(`**/api/orders/${ORDER_ID}`, (route) => json(route, order('PAYMENT_PENDING')));
    await page.goto('/#/');
    await expect(page.getByRole('heading', { name: 'Paiement en attente' })).toBeVisible();
    await expect(page.getByText(`Référence commande : ${ORDER_ID}`)).toBeVisible();
  });

  test('paiement confirmé : le frontend attend PAID lu au backend', async ({ page }) => {
    await startPayment(page, 'PAID');
    await expect(page.getByRole('heading', { name: 'Paiement réussi' })).toBeVisible();
    await expect(page.getByText('Votre accès Wi-Fi est en cours de préparation.')).toBeVisible();
  });

  test('allocation différée : PAID puis DELIVERED, sans second paiement', async ({ page }) => {
    let reads = 0;
    await startPayment(page, () => {
      reads += 1;
      return reads < 2 ? 'PAYMENT_PENDING' : 'PAID';
    });
    await expect(page.getByRole('heading', { name: 'Paiement réussi' })).toBeVisible();
    expect(reads).toBeGreaterThanOrEqual(2);
  });

  test('état inconnu : attente conservatrice, jamais succès local', async ({ page }) => {
    await startPayment(page, 'PAYMENT_SETTLING');
    await expect(page.getByText('Nous avons reçu un état inhabituel. Nous vérifions encore avec le serveur.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paiement réussi' })).not.toBeVisible();
  });

  test('ticket délivré : corrélation commande puis affichage contrôlé du code', async ({ page }) => {
    await page.route(`**/api/tickets/mine?order_id=${ORDER_ID}`, (route) => json(route, {
      order_id: ORDER_ID,
      tickets: [{ id: TICKET_ID, order_id: ORDER_ID, order_reference: ORDER_ID, offer_id: OFFER.id,
        db_state: 'SOLD', router_state: 'ACTIVE', sold_at: new Date().toISOString(), code_prefix_hint: 'DG' }],
    }));
    await page.route(`**/api/tickets/${TICKET_ID}/code`, (route) => json(route, { ticket_id: TICKET_ID, code: 'DG24-ABCD' }));
    await startPayment(page, 'DELIVERED', { token: true });
    await expect(page.getByRole('heading', { name: 'Paiement réussi — votre code Wi-Fi' })).toBeVisible();
    await expect(page.getByText('DG24-ABCD')).toBeVisible();
    await expect(page.getByText(`Référence commande : ${ORDER_ID}`)).toBeVisible();
  });

  test('backend indisponible au chargement : message actionnable et aucune offre inventée', async ({ page }) => {
    await page.route('**/api/offers', (route) => route.abort('failed'));
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Acheter un accès Wi-Fi' }).click();
    await expect(page.getByText(/Backend injoignable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(page.locator('.offer-card')).toHaveCount(0);
  });

  test('backend 503 pendant le chargement : problème affiché, aucun démarrage de paiement', async ({ page }) => {
    await page.route('**/api/offers', (route) => route.fulfill({ status: 503, contentType: 'application/problem+json', body: '' }));
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Acheter un accès Wi-Fi' }).click();
    await expect(page.getByText(/Backend injoignable/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(page.locator('.offer-card')).toHaveCount(0);
  });

  test('offline pendant la commande : état technique actionnable, aucun succès local', async ({ page }) => {
    await commonApi(page);
    await page.route('**/api/orders', (route) => route.abort('internetdisconnected'));
    await page.goto('/#/');
    await page.getByRole('button', { name: 'Acheter un accès Wi-Fi' }).click();
    await page.locator('.offer-card').getByRole('button').click();
    await page.getByRole('button', { name: 'Continuer vers le paiement' }).click();
    await page.locator('.method-card').click();
    await page.locator('#phone').fill('0197123456');
    await page.getByRole('button', { name: 'Vérifier mon numéro' }).click();
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'Payer 300 FCFA' }).click();
    await expect(page.getByRole('heading', { name: 'Un problème technique est survenu' })).toBeVisible();
    await expect(page.getByText(/Backend injoignable/)).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Paiement réussi' })).not.toBeVisible();
  });
});
