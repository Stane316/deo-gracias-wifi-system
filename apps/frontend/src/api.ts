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
  try {
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
  } catch {
    // L'UI traite status 0 comme panne réseau ; aucune exception brute ne casse l'écran admin.
    return { status: 0, ok: false, body: null };
  }
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

export interface AdminPage<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface AdminOrderSummary {
  id: string;
  phone: string;
  state: string;
  offer_id: string;
  price_fcfa: number;
  payment_state: string | null;
  ticket_state: string | null;
  created_at: string;
  updated_at: string;
}

export interface AdminPaymentSummary {
  id: string;
  order_id: string;
  phone: string;
  provider: string;
  provider_ref: string | null;
  amount_fcfa: number;
  state: string;
  confirmed_at: string | null;
  created_at: string;
}

export interface AdminOrderDetail extends AdminOrderSummary {
  payment: AdminPaymentSummary | null;
  ticket: AdminTicketSummary | null;
}

export interface AdminTicketSummary {
  id: string;
  batch_id: string;
  offer_id: string;
  source: string;
  db_state: string;
  router_state: string;
  order_id: string | null;
  code_prefix_hint: string | null;
  sold_at: string | null;
  activation_deadline: string | null;
}

export interface AdminBatchSummary {
  id: string;
  source: string;
  quantity: number;
  generated_at: string;
  created_at: string;
  notes: string | null;
}

export interface AdminAuditSummary {
  id: string;
  actor: string;
  action: string;
  entity: string;
  entity_id: string | null;
  at: string;
}

export interface AdminIncidentSummary {
  id: string;
  type: string;
  severity: string;
  state: string;
  details: Record<string, unknown>;
  opened_at: string;
  closed_at: string | null;
  created_at: string;
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
  /** Admin : session limitée à l’onglet ; jamais de token durable en localStorage. */
  adminToken(): string | null {
    return sessionStorage.getItem('dg.admin.token');
  },
  setAdminToken(token: string | null): void {
    if (token) sessionStorage.setItem('dg.admin.token', token);
    else sessionStorage.removeItem('dg.admin.token');
  },
};
