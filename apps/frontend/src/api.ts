/**
 * IMP-25 — Client API de la démo : UNIQUEMENT des chemins relatifs (/api/…),
 * relayés par le proxy Vite vers le backend (jamais de localhost côté navigateur).
 */

export interface ApiResponse<T> {
  status: number;
  ok: boolean;
  body: T | null;
}

export async function api<T>(
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; token?: string | null; headers?: Record<string, string> } = {},
): Promise<ApiResponse<T>> {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.token) headers['authorization'] = `Bearer ${options.token}`;
  const res = await fetch(`/api${path}`, {
    method: options.method ?? 'GET',
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
    headers,
  });
  const text = await res.text();
  let body: T | null = null;
  if (text.length > 0) {
    try {
      body = JSON.parse(text) as T;
    } catch {
      body = null;
    }
  }
  return { status: res.status, ok: res.ok, body };
}

export interface Offer {
  id: string;
  priceFcfa: number;
  accessHours: number;
  validityHours: number;
  mikrotikProfile: string;
  limitUptime: string;
}

export interface OrderView {
  id: string;
  state: string;
  offer_id?: string;
  price_fcfa?: number;
  created_at?: string;
}

export interface TicketView {
  id: string;
  offer_id: string | null;
  db_state: string;
  router_state: string;
  sold_at: string | null;
  code_prefix_hint: string | null;
}

export interface ReconciliationView {
  runs: Array<{
    id: string;
    started_at: string;
    finished_at: string | null;
    router_total_expected: number | null;
    router_total_seen: number | null;
    status: 'RUNNING' | 'OK' | 'MISMATCH';
    mode: string | null;
    violations: string[];
    anomalies_count: number;
  }>;
  open_alerts: Array<{
    id: string;
    rule: string;
    severity: string;
    created_at: string;
    run_id: string | null;
  }>;
}

export const storage = {
  customerToken(): string | null {
    return localStorage.getItem('dg.customer.token');
  },
  setCustomerToken(token: string | null): void {
    if (token) localStorage.setItem('dg.customer.token', token);
    else localStorage.removeItem('dg.customer.token');
  },
  adminToken(): string | null {
    return localStorage.getItem('dg.admin.token');
  },
  setAdminToken(token: string | null): void {
    if (token) localStorage.setItem('dg.admin.token', token);
    else localStorage.removeItem('dg.admin.token');
  },
};
