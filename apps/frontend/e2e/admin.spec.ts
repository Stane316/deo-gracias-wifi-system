import { expect, test, type Page, type Route } from '@playwright/test';

const PAGE = { items: [], total: 0, limit: 25, offset: 0 };

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function mockAdminApi(page: Page, onRequest?: (url: URL) => void) {
  await page.route('**/api/offers', (route) => json(route, []));
  await page.route('**/api/admin/me', (route) => json(route, { sub: 'e2e-admin', role: 'ADMIN', email: 'admin@dg.bj' }));
  await page.route('**/api/admin/dashboard', (route) => json(route, {
    generated_at: '2026-09-25T12:00:00.000Z', timezone: 'Africa/Porto-Novo',
    today: { revenue_fcfa: 0, orders_count: 0, payments_confirmed: 0, tickets_delivered: 0 },
    inventory: { available: 0, reserved: 0, sold: 0, expired: 0, low_stock: [] },
    system: { connector_state: 'UNKNOWN', sync_state: 'UNKNOWN', incidents_open: 0 },
  }));
  await page.route('**/api/admin/orders*', (route) => {
    onRequest?.(new URL(route.request().url()));
    return json(route, PAGE);
  });
}

test.describe('IMP-29 — route admin, shell et filtres serveur', () => {
  test('accès direct sans session revient à /admin/login sans donnée admin', async ({ page }) => {
    await mockAdminApi(page);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: 'Connexion admin — démo locale' })).toBeVisible();
    await expect(page.getByText('Vue générale')).not.toBeVisible();
  });

  test('connexion locale contrôlée ouvre le shell /admin, filtre côté serveur et logout', async ({ page }) => {
    let lastOrdersUrl: URL | undefined;
    await mockAdminApi(page, (url) => { lastOrdersUrl = url; });
    await page.goto('/admin/login');
    await page.getByLabel('Jeton admin local').fill('e2e-local-token');
    await page.getByRole('button', { name: 'Connexion' }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByRole('navigation', { name: 'Sections admin' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Vue générale' })).toHaveAttribute('aria-current', 'page');

    await page.getByRole('button', { name: 'Commandes' }).click();
    await page.getByLabel('État commande').selectOption('PAID');
    await expect.poll(() => lastOrdersUrl?.searchParams.get('state')).toBe('PAID');
    await expect(lastOrdersUrl?.searchParams.get('limit')).toBe('25');
    await expect(page.getByText('Aucune commande trouvée.')).toBeVisible();

    await page.getByRole('button', { name: 'Déconnexion' }).click();
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByLabel('Jeton admin local')).toBeVisible();
  });
});
