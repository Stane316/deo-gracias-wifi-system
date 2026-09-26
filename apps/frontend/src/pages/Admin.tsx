import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { appRoute, replaceBrowserPath } from '../admin-route.js';
import {
  api,
  storage,
  type AdminAuditSummary,
  type AdminBatchSummary,
  type AdminIncidentDetail,
  type AdminIncidentSummary,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type AdminPage,
  type AdminPaymentSummary,
  type AdminTicketSummary,
  type Offer,
  type ReconciliationView,
  type TicketImportPreview,
  type TicketStatsView,
  type TicketStockReconciliation,
} from '../api.js';
import { backendUnreachableMessage, formatDateTime, formatFcfa, problemDetail } from '../format.js';
import {
  browserSupabaseConfig,
  readAdminSession,
  SupabaseAuthClient,
  writeAdminSession,
  type SupabaseSession,
} from '../supabase-auth.js';

interface DashboardPayload {
  generated_at: string;
  timezone: string;
  today: { revenue_fcfa: number; orders_count: number; sales_count: number; payments_confirmed: number; tickets_delivered: number };
  sales_by_offer: Array<{ offer_id: string; sales_count: number; revenue_fcfa: number }>;
  inventory: {
    available: number;
    reserved: number;
    sold: number;
    expired: number;
    low_stock: Array<{ offer_id: string; available: number }>;
  };
  recent_activity: Array<{
    id: string;
    kind: string;
    action: string;
    actor: string;
    entity: string;
    entity_id: string | null;
    state: string | null;
    occurred_at: string;
  }>;
  system: {
    connector_state: string;
    connector_id: string | null;
    connector_last_contact_at: string | null;
    connector_version: string | null;
    router_model: string | null;
    routeros_version: string | null;
    sync_state: string;
    last_sync_at: string | null;
    last_sync_state: string | null;
    last_sync_error: string | null;
    sync_pending: number;
    sync_failed: number;
    sync_success: number;
    incidents_open: number;
  };
}

interface BatchExportLine {
  router_name: string;
  code: string;
  comment: string;
}

interface BatchCreateResponse {
  batch: { id: string; offer_id: string; quantity: number; generated_at: string };
  code_export: BatchExportLine[];
  export_warning: string;
}

type AdminTab = 'dashboard' | 'orders' | 'payments' | 'tickets' | 'batches' | 'incidents' | 'audit' | 'reconciliation';

const ADMIN_FILTERS: Partial<Record<AdminTab, { label: string; values: string[] }>> = {
  orders: { label: 'État commande', values: ['CREATED', 'PAYMENT_PENDING', 'PAID', 'TICKET_ALLOCATED', 'DELIVERED', 'FAILED', 'CANCELLED', 'EXPIRED'] },
  payments: { label: 'État paiement', values: ['CREATED', 'INITIATED', 'PENDING', 'CONFIRMED', 'FAILED', 'CANCELLED', 'EXPIRED', 'REFUNDED'] },
  tickets: { label: 'État ticket', values: ['AVAILABLE', 'RESERVED', 'RELEASED', 'SOLD', 'USED', 'EXPIRED'] },
  batches: { label: 'Source', values: ['backend', 'mikmon-manual'] },
  incidents: { label: 'État incident', values: ['OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED', 'REOPENED', 'CLOSED'] },
};

const supabaseConfig = browserSupabaseConfig();
const supabaseAuth = supabaseConfig ? new SupabaseAuthClient(supabaseConfig) : null;

function pageItems<T>(page: AdminPage<T> | null): T[] {
  return page?.items ?? [];
}

function stateBadge(value: string | null): ReactNode {
  return <span className="badge">{value ?? '—'}</span>;
}

/**
 * IMP-27 — Dashboard Admin complet.
 *
 * L'interface ne reconstruit aucun KPI et ne décide aucune autorisation :
 * les routes `/admin/*` restent l'autorité serveur.
 */
export function Admin() {
  const [tokenInput, setTokenInput] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [supabaseSession, setSupabaseSession] = useState<SupabaseSession | null>(() => readAdminSession());
  const [connected, setConnected] = useState(false);
  const [adminRole, setAdminRole] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [stats, setStats] = useState<TicketStatsView | null>(null);
  const [recon, setRecon] = useState<ReconciliationView | null>(null);
  const [stockRecon, setStockRecon] = useState<TicketStockReconciliation | null>(null);
  const [orders, setOrders] = useState<AdminPage<AdminOrderSummary> | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<AdminOrderDetail | null>(null);
  const [payments, setPayments] = useState<AdminPage<AdminPaymentSummary> | null>(null);
  const [tickets, setTickets] = useState<AdminPage<AdminTicketSummary> | null>(null);
  const [batches, setBatches] = useState<AdminPage<AdminBatchSummary> | null>(null);
  const [incidents, setIncidents] = useState<AdminPage<AdminIncidentSummary> | null>(null);
  const [audits, setAudits] = useState<AdminPage<AdminAuditSummary> | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [paymentStateFilter, setPaymentStateFilter] = useState('');
  const [ticketStateFilter, setTicketStateFilter] = useState('');
  const [destinationFilter, setDestinationFilter] = useState('');
  const [offerFilter, setOfferFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [pageOffset, setPageOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchOffer, setBatchOffer] = useState('');
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [batchExport, setBatchExport] = useState<BatchCreateResponse | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [ackPending, setAckPending] = useState<string | null>(null);
  const [correctionAction, setCorrectionAction] = useState<'REVIEW_PAYMENT' | 'REVIEW_ALLOCATION' | 'REVIEW_DELIVERY'>('REVIEW_PAYMENT');
  const [correctionReason, setCorrectionReason] = useState('');
  const [correctionPending, setCorrectionPending] = useState(false);
  const [correctionMessage, setCorrectionMessage] = useState<string | null>(null);
  // IMP-32 — révélation contrôlée d'un code (doc 09 §20) : raison obligatoire,
  // code affiché une seule fois, jamais persisté côté navigateur.
  const [revealTarget, setRevealTarget] = useState<AdminTicketSummary | null>(null);
  const [revealReason, setRevealReason] = useState('');
  const [revealResult, setRevealResult] = useState<{ ok: boolean; code?: string; message: string } | null>(null);
  const [revealPending, setRevealPending] = useState(false);
  // IMP-32 — import de codes : preview → validation → import transactionnel (§33-34).
  const [importOffer, setImportOffer] = useState('');
  const [importDestination, setImportDestination] = useState<'DIGITAL' | 'PHYSICAL'>('DIGITAL');
  const [importCodes, setImportCodes] = useState('');
  const [importNotes, setImportNotes] = useState('');
  const [importPreview, setImportPreview] = useState<TicketImportPreview | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importPending, setImportPending] = useState(false);
  // IMP-33 — fiche incident + actions de récupération (doc 09 §44-46) :
  // raison obligatoire, Idempotency-Key sur le retry, anti-double-clic.
  const [selectedIncident, setSelectedIncident] = useState<AdminIncidentDetail | null>(null);
  const [incidentReason, setIncidentReason] = useState('');
  const [incidentPending, setIncidentPending] = useState(false);
  const [incidentMessage, setIncidentMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const usesSupabase = supabaseAuth !== null;
  const token = usesSupabase ? (supabaseSession?.access_token ?? null) : storage.adminToken();

  const clearAuth = useCallback(() => {
    if (usesSupabase) {
      writeAdminSession(null);
      setSupabaseSession(null);
    } else {
      storage.setAdminToken(null);
    }
    setConnected(false);
    setAdminRole(null);
    setCorrectionMessage(null);
    replaceBrowserPath('/admin/login');
  }, [usesSupabase]);

  useEffect(() => {
    const current = appRoute(window.location.pathname, window.location.hash);
    if (connected && current === 'admin-login') replaceBrowserPath('/admin');
    if (!connected && current === 'admin') replaceBrowserPath('/admin/login');
  }, [connected]);

  const check = useCallback(async () => {
    if (!token) {
      setConnected(false);
      return;
    }
    let res = await api<{ sub: string; role: string }>('/admin/me', { token });
    if (!res.ok && res.status === 401 && supabaseAuth && supabaseSession?.refresh_token) {
      try {
        const refreshed = await supabaseAuth.refreshSession(supabaseSession.refresh_token);
        writeAdminSession(refreshed);
        setSupabaseSession(refreshed);
        res = await api<{ sub: string; role: string }>('/admin/me', { token: refreshed.access_token });
      } catch {
        clearAuth();
        return;
      }
    }
    if (res.ok && res.body) {
      setAdminRole(res.body.role);
      setConnected(true);
    } else clearAuth();
  }, [clearAuth, supabaseSession?.refresh_token, token]);

  useEffect(() => { void check(); }, [check]);

  useEffect(() => {
    if (!supabaseAuth || !supabaseSession) return;
    const expiresAt = supabaseSession.expires_at ?? Math.floor(Date.now() / 1000) + supabaseSession.expires_in;
    const delay = Math.max(1000, expiresAt * 1000 - Date.now() - 60_000);
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          const refreshed = await supabaseAuth.refreshSession(supabaseSession.refresh_token);
          writeAdminSession(refreshed);
          setSupabaseSession(refreshed);
        } catch {
          clearAuth();
        }
      })();
    }, delay);
    return () => window.clearTimeout(timer);
  }, [clearAuth, supabaseSession]);

  useEffect(() => {
    void api<Offer[]>('/offers').then((res) => {
      if (res.ok && res.body) {
        setOffers(res.body);
        setBatchOffer((current) => current || res.body?.[0]?.id || '');
      }
    });
  }, []);

  const listUrl = (path: string): string => {
    const params = new URLSearchParams({ limit: '25', offset: String(pageOffset) });
    if (search.trim()) params.set('search', search.trim());
    if (stateFilter.trim()) params.set('state', stateFilter.trim());
    // IMP-32 — filtre de destination (lot DIGITAL/PHYSICAL, doc 09 §28).
    if ((tab === 'tickets' || tab === 'batches') && destinationFilter.trim()) params.set('destination', destinationFilter.trim());
    if (tab === 'orders' && offerFilter.trim()) params.set('offer_id', offerFilter.trim());
    if (tab === 'orders' && paymentStateFilter.trim()) params.set('payment_state', paymentStateFilter.trim());
    if (tab === 'orders' && ticketStateFilter.trim()) params.set('ticket_state', ticketStateFilter.trim());
    if (fromDate) params.set('from', `${fromDate}T00:00:00.000Z`);
    if (toDate) {
      const exclusiveTo = new Date(`${toDate}T00:00:00.000Z`);
      exclusiveTo.setUTCDate(exclusiveTo.getUTCDate() + 1);
      params.set('to', exclusiveTo.toISOString());
    }
    return `${path}?${params.toString()}`;
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (tab === 'dashboard') {
        const res = await api<DashboardPayload>('/admin/dashboard', { token });
        if (res.ok && res.body) setDashboard(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      } else if (tab === 'orders') {
        const res = await api<AdminPage<AdminOrderSummary>>(listUrl('/admin/orders'), { token });
        if (res.ok && res.body) setOrders(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      } else if (tab === 'payments') {
        const res = await api<AdminPage<AdminPaymentSummary>>(listUrl('/admin/payments'), { token });
        if (res.ok && res.body) setPayments(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      } else if (tab === 'tickets') {
        const [statsRes, listRes] = await Promise.all([
          api<TicketStatsView>('/admin/tickets/stats', { token }),
          api<AdminPage<AdminTicketSummary>>(listUrl('/admin/tickets'), { token }),
        ]);
        if (statsRes.ok && statsRes.body) setStats(statsRes.body);
        if (listRes.ok && listRes.body) setTickets(listRes.body);
        if (!statsRes.ok || !listRes.ok) {
          const failed = !statsRes.ok ? statsRes : listRes;
          setError(backendUnreachableMessage(failed.status, failed.body) ?? problemDetail(failed.body));
        }
      } else if (tab === 'batches') {
        const res = await api<AdminPage<AdminBatchSummary>>(listUrl('/admin/batches'), { token });
        if (res.ok && res.body) setBatches(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      } else if (tab === 'incidents') {
        const res = await api<AdminPage<AdminIncidentSummary>>(listUrl('/admin/incidents'), { token });
        if (res.ok && res.body) setIncidents(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      } else if (tab === 'audit') {
        const res = await api<AdminPage<AdminAuditSummary>>(listUrl('/admin/audit-logs'), { token });
        if (res.ok && res.body) setAudits(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      } else {
        // IMP-32 — réconciliation routeur (runs/alertes) + stock vs manifeste IMP-06.
        const [res, stockRes] = await Promise.all([
          api<ReconciliationView>('/admin/reconciliation', { token }),
          api<TicketStockReconciliation>('/admin/tickets/reconciliation', { token }),
        ]);
        if (res.ok && res.body) setRecon(res.body);
        if (stockRes.ok && stockRes.body) setStockRecon(stockRes.body);
        if (!res.ok) setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      }
    } finally {
      setLoading(false);
    }
  }, [destinationFilter, fromDate, offerFilter, pageOffset, paymentStateFilter, search, stateFilter, tab, ticketStateFilter, toDate, token]);

  useEffect(() => { setPageOffset(0); setStateFilter(''); setPaymentStateFilter(''); setTicketStateFilter(''); setDestinationFilter(''); setOfferFilter(''); setFromDate(''); setToDate(''); setRevealTarget(null); setRevealResult(null); setImportPreview(null); setImportResult(null); setImportError(null); }, [tab]);
  useEffect(() => { setPageOffset(0); }, [destinationFilter, fromDate, offerFilter, paymentStateFilter, search, stateFilter, ticketStateFilter, toDate]);
  useEffect(() => { if (connected) void load(); }, [connected, load]);

  const login = async () => {
    setAuthError(null);
    if (supabaseAuth) {
      try {
        const session = await supabaseAuth.signInWithPassword(email.trim(), password);
        writeAdminSession(session);
        setSupabaseSession(session);
        setPassword('');
      } catch {
        setAuthError('Adresse e-mail ou mot de passe invalide.');
      }
      return;
    }
    storage.setAdminToken(tokenInput.trim());
    const res = await api<{ sub: string; role: string }>('/admin/me', { token: tokenInput.trim() });
    if (res.ok) { setAdminRole(res.body?.role ?? null); setConnected(true); setTokenInput(''); }
    else { storage.setAdminToken(null); setAuthError(problemDetail(res.body)); }
  };

  const logout = async () => {
    if (supabaseAuth && token) await supabaseAuth.signOut(token);
    clearAuth();
  };

  const ack = async (alertId: string) => {
    if (ackPending) return;
    setAckPending(alertId);
    try {
      const res = await api(`/admin/alerts/${alertId}/ack`, { method: 'POST', token });
      if (!res.ok) setError(problemDetail(res.body));
      await load();
    } finally {
      setAckPending(null);
    }
  };

  const openOrder = async (id: string) => {
    const res = await api<AdminOrderDetail>(`/admin/orders/${id}`, { token });
    if (res.ok && res.body) setSelectedOrder(res.body);
    else setError(problemDetail(res.body));
  };

  const requestCorrection = async () => {
    if (!selectedOrder || correctionPending || correctionReason.trim().length < 20) {
      setCorrectionMessage('La raison doit contenir au moins 20 caractères.');
      return;
    }
    setCorrectionPending(true);
    setCorrectionMessage(null);
    try {
      const res = await api(`/admin/orders/${selectedOrder.id}/correction-requests`, {
        method: 'POST', token,
        headers: { 'Idempotency-Key': `admin-correction-${globalThis.crypto.randomUUID()}` },
        body: { requested_action: correctionAction, reason: correctionReason.trim() },
      });
      if (res.ok) {
        setCorrectionMessage('Demande enregistrée pour revue SUPER_ADMIN. Aucun état de paiement n’a été modifié.');
        setCorrectionReason('');
      } else setCorrectionMessage(problemDetail(res.body));
    } finally {
      setCorrectionPending(false);
    }
  };

  const openActivity = (entity: string, entityId: string | null) => {
    if (!entityId) return;
    if (entity === 'orders') {
      setTab('orders');
      void openOrder(entityId);
    } else if (entity === 'payments') {
      setTab('payments');
      setSearch(entityId);
    } else if (entity === 'incidents') {
      setTab('incidents');
      setSearch(entityId);
    } else if (entity === 'mikrotik_sync') {
      setTab('reconciliation');
    } else {
      setTab('audit');
      setSearch(entityId);
    }
  };

  const createBatch = async () => {
    if (batchSubmitting) return;
    setBatchError(null);
    setBatchExport(null);
    const quantity = Number(batchQuantity);
    if (!batchOffer || !Number.isInteger(quantity) || quantity < 1 || quantity > 200) {
      setBatchError('Choisissez une offre et une quantité entre 1 et 200.');
      return;
    }
    setBatchSubmitting(true);
    try {
      const res = await api<BatchCreateResponse>('/admin/batches', {
        method: 'POST', token,
        body: { offer_id: batchOffer, quantity },
      });
      if (res.ok && res.body) {
        setBatchExport(res.body);
        await load();
      } else {
        setBatchError(problemDetail(res.body));
      }
    } finally {
      setBatchSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // IMP-32 — révélation contrôlée d'un code (doc 09 §20)
  // ---------------------------------------------------------------------------
  const openReveal = (ticket: AdminTicketSummary) => {
    setRevealTarget(ticket);
    setRevealReason('');
    setRevealResult(null);
  };

  const submitReveal = async () => {
    if (!revealTarget || revealPending || revealReason.trim().length < 20) return;
    setRevealPending(true);
    setRevealResult(null);
    try {
      const res = await api<{ ticket_id: string; code: string; destination: string; db_state: string; message: string }>(
        `/admin/tickets/${revealTarget.id}/reveal`,
        { method: 'POST', token, body: { reason: revealReason.trim() } },
      );
      if (res.ok && res.body) setRevealResult({ ok: true, code: res.body.code, message: res.body.message });
      else setRevealResult({ ok: false, message: problemDetail(res.body) ?? `Échec de la révélation (HTTP ${res.status}).` });
    } finally {
      setRevealPending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // IMP-33 — incidents & récupération (doc 09 §43-46)
  // ---------------------------------------------------------------------------
  const openIncident = async (id: string) => {
    setSelectedIncident(null);
    setIncidentReason('');
    setIncidentMessage(null);
    const res = await api<AdminIncidentDetail>(`/admin/incidents/${id}`, { token });
    if (res.ok && res.body) setSelectedIncident(res.body);
    else setIncidentMessage({ ok: false, text: problemDetail(res.body) ?? `Incident introuvable (HTTP ${res.status}).` });
  };

  const closeIncidentDetail = () => {
    setSelectedIncident(null);
    setIncidentReason('');
    setIncidentMessage(null);
  };

  const submitIncidentAction = async (action: 'acknowledge' | 'investigate' | 'retry' | 'resolve' | 'reopen') => {
    if (!selectedIncident || incidentPending || incidentReason.trim().length < 20) return;
    setIncidentPending(true);
    setIncidentMessage(null);
    try {
      const headers: Record<string, string> = {};
      if (action === 'retry') headers['Idempotency-Key'] = `incident-retry-${globalThis.crypto.randomUUID()}`;
      const res = await api<Record<string, unknown>>(
        `/admin/incidents/${selectedIncident.id}/${action}`,
        { method: 'POST', token, headers, body: { reason: incidentReason.trim(), idempotency_key: headers['Idempotency-Key'] ?? '' } },
      );
      if (res.ok && res.body) {
        const state = typeof res.body.state === 'string' ? res.body.state : selectedIncident.state;
        const retry = res.body.retry as { outcome?: string } | undefined;
        const retryText = retry?.outcome ? ` — récupération : ${retry.outcome}` : '';
        setIncidentMessage({ ok: true, text: `Action « ${action} » appliquée. Nouvel état : ${state}.${retryText}` });
        const refreshed = await api<AdminIncidentDetail>(`/admin/incidents/${selectedIncident.id}`, { token });
        if (refreshed.ok && refreshed.body) setSelectedIncident(refreshed.body);
        const listRes = await api<AdminPage<AdminIncidentSummary>>(listUrl('/admin/incidents'), { token });
        if (listRes.ok && listRes.body) setIncidents(listRes.body);
      } else {
        setIncidentMessage({ ok: false, text: problemDetail(res.body) ?? `Échec de l'action (HTTP ${res.status}).` });
      }
    } finally {
      setIncidentPending(false);
    }
  };

  // ---------------------------------------------------------------------------
  // IMP-32 — import de codes : preview → validation → transaction (§33-34)
  // ---------------------------------------------------------------------------
  const parseImportCodes = (): string[] =>
    importCodes.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);

  const previewImport = async () => {
    const codes = parseImportCodes();
    if (!importOffer || codes.length === 0) {
      setImportError('Choisissez une offre et au moins un code (un par ligne).');
      return;
    }
    if (codes.length > 200) {
      setImportError(`200 codes maximum par import (${codes.length} saisis).`);
      return;
    }
    setImportError(null);
    setImportResult(null);
    setImportPreview(null);
    const res = await api<TicketImportPreview>('/admin/tickets/import/preview', {
      method: 'POST', token,
      body: {
        offer_id: importOffer, destination: importDestination, codes,
        ...(importNotes.trim() ? { notes: importNotes.trim() } : {}),
      },
    });
    if (res.ok && res.body) setImportPreview(res.body);
    else setImportError(problemDetail(res.body) ?? `Échec de la prévisualisation (HTTP ${res.status}).`);
  };

  const confirmImport = async () => {
    // Anti-double-clic + idempotence : clé fraîche par tentative de confirmation.
    if (importPending || !importPreview?.can_import) return;
    const codes = parseImportCodes();
    if (!importOffer || codes.length === 0) return;
    setImportPending(true);
    setImportError(null);
    setImportResult(null);
    try {
      const res = await api<{ batch_id: string | null; created: boolean; imported: number; rejected: number; import_performed: boolean; message: string }>(
        '/admin/tickets/import',
        {
          method: 'POST', token,
          headers: { 'Idempotency-Key': `admin-import-${globalThis.crypto.randomUUID()}` },
          body: {
            offer_id: importOffer, destination: importDestination, codes,
            ...(importNotes.trim() ? { notes: importNotes.trim() } : {}),
          },
        },
      );
      if (res.ok && res.body) {
        setImportResult(res.body.message);
        setImportPreview(null);
        setImportCodes('');
        await load();
      } else setImportError(problemDetail(res.body) ?? `Échec de l'import (HTTP ${res.status}).`);
    } finally {
      setImportPending(false);
    }
  };

  if (!connected) {
    return (
      <section className="card narrow">
        <h2>{usesSupabase ? 'Connexion administrateur' : 'Connexion admin — démo locale'}</h2>
        <p className="hint">
          {usesSupabase
            ? 'Utilisez le compte Supabase autorisé. Le rôle est vérifié par le serveur.'
            : <>Mode local uniquement : entrez le jeton <code>DEV_ADMIN_TOKEN</code> du backend. En production, cette connexion est remplacée par Supabase Auth.</>}
        </p>
        <form className="stack" onSubmit={(event) => { event.preventDefault(); void login(); }}>
          {usesSupabase ? (
            <>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Adresse e-mail" aria-label="Adresse e-mail administrateur" autoComplete="username" />
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mot de passe" aria-label="Mot de passe administrateur" autoComplete="current-password" />
              <button className="btn" type="submit" disabled={email.trim().length === 0 || password.length === 0}>Connexion</button>
            </>
          ) : (
            <>
              <input type="password" value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Jeton admin local" aria-label="Jeton admin local" autoComplete="off" />
              <button className="btn" type="submit" disabled={tokenInput.length === 0}>Connexion</button>
            </>
          )}
          {authError ? <p className="err" role="alert">{authError}</p> : null}
        </form>
      </section>
    );
  }

  const tabs: Array<[AdminTab, string]> = [
    ['dashboard', 'Vue générale'], ['orders', 'Commandes'], ['payments', 'Paiements'], ['tickets', 'Tickets'],
    ['batches', 'Lots'], ['incidents', 'Incidents'], ['audit', 'Audit'], ['reconciliation', 'Réconciliation'],
  ];

  const filter = ADMIN_FILTERS[tab];

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar" aria-label="Navigation administration">
        <div className="admin-sidebar-heading">
          <span className="admin-kicker">Espace privé</span>
          <strong>Administration</strong>
        </div>
        <nav className="admin-nav" aria-label="Sections admin">
          {tabs.map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? 'active' : ''}
              aria-current={tab === id ? 'page' : undefined}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="ghost admin-logout" onClick={() => void logout()}>Déconnexion</button>
      </aside>
      <section className="admin-main">
        {error ? <p className="err" role="alert">{error}</p> : null}
        {loading ? <p className="hint" role="status">Chargement des données…</p> : null}

        {tab !== 'dashboard' && tab !== 'reconciliation' ? (
          <div className="card admin-toolbar">
            <input value={search} onChange={(e) => { setPageOffset(0); setSearch(e.target.value); }} placeholder="Rechercher…" aria-label="Rechercher dans la liste" />
            {filter ? (
              <label className="admin-filter">
                <span>{filter.label}</span>
                <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} aria-label={filter.label}>
                  <option value="">Tous</option>
                  {filter.values.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
            ) : null}
            {(tab === 'tickets' || tab === 'batches') ? (
              <label className="admin-filter"><span>Destination</span><select value={destinationFilter} onChange={(e) => setDestinationFilter(e.target.value)} aria-label="Filtrer par destination"><option value="">Toutes</option><option value="DIGITAL">DIGITAL</option><option value="PHYSICAL">PHYSICAL</option></select></label>
            ) : null}
            {tab === 'orders' ? (
              <>
                <label className="admin-filter"><span>Offre</span><select value={offerFilter} onChange={(e) => setOfferFilter(e.target.value)} aria-label="Filtrer par offre"><option value="">Toutes</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.id}</option>)}</select></label>
                <label className="admin-filter"><span>Paiement lié</span><select value={paymentStateFilter} onChange={(e) => setPaymentStateFilter(e.target.value)} aria-label="État paiement lié"><option value="">Tous</option>{ADMIN_FILTERS.payments?.values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
                <label className="admin-filter"><span>Ticket lié</span><select value={ticketStateFilter} onChange={(e) => setTicketStateFilter(e.target.value)} aria-label="État ticket lié"><option value="">Tous</option>{ADMIN_FILTERS.tickets?.values.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
              </>
            ) : null}
            <label className="admin-filter"><span>Du</span><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} aria-label="Date de début" /></label>
            <label className="admin-filter"><span>Au</span><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} aria-label="Date de fin" /></label>
            <button className="btn small" onClick={() => void load()}>Actualiser</button>
          </div>
        ) : null}

      {tab === 'dashboard' && dashboard ? (
        <>
          <div className="grid">
            <section className="card">
              <h2>Aujourd’hui ({dashboard.timezone})</h2>
              <div className="kpis">
                <div className="kpi"><span className="kpi-value">{formatFcfa(dashboard.today.revenue_fcfa)}</span><span>CA encaissé</span></div>
                <div className="kpi"><span className="kpi-value">{dashboard.today.sales_count}</span><span>Ventes</span></div>
                <div className="kpi"><span className="kpi-value">{dashboard.today.payments_confirmed}</span><span>Paiements confirmés</span></div>
                <div className="kpi"><span className="kpi-value">{dashboard.today.tickets_delivered}</span><span>Tickets livrés</span></div>
              </div>
              <h3 className="admin-subheading">Plans vendus aujourd’hui</h3>
              {dashboard.sales_by_offer.length === 0 ? <p className="hint">Aucune vente confirmée.</p> : (
                <ul className="admin-compact-list">
                  {dashboard.sales_by_offer.map((sale) => <li key={sale.offer_id}><span>{sale.offer_id}</span><strong>{sale.sales_count} · {formatFcfa(sale.revenue_fcfa)}</strong></li>)}
                </ul>
              )}
            </section>
            <section className="card">
              <h2>Inventaire</h2>
              <ul className="kv">
                <li><span>Disponibles</span><strong>{dashboard.inventory.available}</strong></li>
                <li><span>Réservés</span><strong>{dashboard.inventory.reserved}</strong></li>
                <li><span>Vendus / utilisés</span><strong>{dashboard.inventory.sold}</strong></li>
                <li><span>Expirés</span><strong>{dashboard.inventory.expired}</strong></li>
              </ul>
              <h3 className="admin-subheading">Alertes de stock</h3>
              {dashboard.inventory.low_stock.length === 0 ? <p className="ok">Stock au-dessus du seuil.</p> : (
                <ul className="admin-alert-list">{dashboard.inventory.low_stock.map((entry) => <li key={entry.offer_id}><strong>{entry.offer_id}</strong><span>{entry.available} restant(s)</span></li>)}</ul>
              )}
            </section>
            <section className="card">
              <h2>Système</h2>
              <ul className="kv">
                <li><span>Connector</span><strong className={`status-${dashboard.system.connector_state.toLowerCase()}`}>{dashboard.system.connector_state}</strong></li>
                <li><span>Dernier contact</span><strong>{dashboard.system.connector_last_contact_at ? formatDateTime(dashboard.system.connector_last_contact_at) : 'Aucun heartbeat'}</strong></li>
                <li><span>Version Connector</span><strong>{dashboard.system.connector_version ?? '—'}</strong></li>
                <li><span>Routeur</span><strong>{dashboard.system.router_model ?? 'Non communiqué'}</strong></li>
                <li><span>Synchronisation</span><strong className={`status-${dashboard.system.sync_state.toLowerCase()}`}>{dashboard.system.sync_state}</strong></li>
                <li><span>Dernière sync</span><strong>{dashboard.system.last_sync_at ? formatDateTime(dashboard.system.last_sync_at) : 'Aucune'}</strong></li>
                <li><span>Opérations en attente</span><strong>{dashboard.system.sync_pending}</strong></li>
                <li><span>Échecs</span><strong>{dashboard.system.sync_failed}</strong></li>
                <li><span>Incidents ouverts</span><strong>{dashboard.system.incidents_open}</strong></li>
              </ul>
              {dashboard.system.last_sync_error ? <p className="err">Dernière erreur : {dashboard.system.last_sync_error}</p> : null}
              <p className="hint">Généré le {formatDateTime(dashboard.generated_at)}</p>
            </section>
          </div>
          <section className="card admin-activity-card">
            <h2>Activité récente</h2>
            {dashboard.recent_activity.length === 0 ? <p className="hint">Aucune activité récente.</p> : (
              <ul className="admin-activity-list">
                {dashboard.recent_activity.map((event) => <li key={`${event.id}-${event.occurred_at}`}><span className="badge">{event.kind}</span>{event.entity_id ? <button className="activity-link" onClick={() => openActivity(event.entity, event.entity_id)}>{event.action} · {event.entity} · {event.entity_id.slice(0, 8)}…{event.state ? ` · ${event.state}` : ''}</button> : <span>{event.action} · {event.entity}{event.state ? ` · ${event.state}` : ''}</span>}<time dateTime={event.occurred_at}>{formatDateTime(event.occurred_at)}</time></li>)}
              </ul>
            )}
          </section>
        </>
      ) : null}

      {tab === 'orders' ? <section className="card"><h2>Commandes ({orders?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Commande</th><th>Numéro</th><th>Offre</th><th>Montant</th><th>Commande</th><th>Paiement</th><th>Ticket</th><th>Créée</th><th></th></tr></thead>
        <tbody>{pageItems(orders).map((o) => <tr key={o.id}><td><code>{o.id.slice(0, 8)}…</code></td><td>{o.phone}</td><td>{o.offer_id}</td><td>{formatFcfa(o.price_fcfa)}</td><td>{stateBadge(o.state)}</td><td>{stateBadge(o.payment_state)}</td><td>{stateBadge(o.ticket_state)}</td><td>{formatDateTime(o.created_at)}</td><td><button className="btn small" onClick={() => void openOrder(o.id)}>Détail</button></td></tr>)}</tbody>
      </AdminTable>{orders && orders.items.length === 0 ? <p className="hint">Aucune commande trouvée.</p> : null}<AdminPager page={orders} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {selectedOrder ? (
        <section className="card order-detail">
          <h2>Détail commande <code>{selectedOrder.id}</code></h2>
          <div className="kv">
            <div><span>Client</span><strong>{selectedOrder.phone}</strong></div>
            <div><span>Offre</span><strong>{selectedOrder.offer_id} — {formatFcfa(selectedOrder.price_fcfa)}</strong></div>
            <div><span>Commande</span><strong>{stateBadge(selectedOrder.state)}</strong></div>
          </div>
          <div className="grid">
            <div><h3>Paiement lié</h3>{selectedOrder.payment ? <p><code>{selectedOrder.payment.id}</code> · {selectedOrder.payment.provider} · {formatFcfa(selectedOrder.payment.amount_fcfa)} · {stateBadge(selectedOrder.payment.state)}<br /><span className="hint">Référence provider : {selectedOrder.payment.provider_ref ?? '—'}</span></p> : <p className="hint">Aucun paiement lié.</p>}</div>
            <div><h3>Ticket lié</h3>{selectedOrder.ticket ? <p><code>{selectedOrder.ticket.id}</code> · DB {stateBadge(selectedOrder.ticket.db_state)} · routeur {stateBadge(selectedOrder.ticket.router_state)} · préfixe {selectedOrder.ticket.code_prefix_hint ?? '—'}</p> : <p className="hint">Aucun ticket lié.</p>}</div>
          </div>
          <h3>Chronologie reconstruite</h3>
          {selectedOrder.timeline.length === 0 ? <p className="hint">Aucun événement observable.</p> : <ol className="admin-timeline">{selectedOrder.timeline.map((event) => <li key={event.id}><span className="badge">{event.action}</span><span>{event.from_state ?? '—'} → {event.to_state ?? '—'}</span><small>{event.actor} · {formatDateTime(event.at)}</small></li>)}</ol>}
          <p className="hint">Aucun secret de ticket, token, mot de passe, signature webhook ou credential MikroTik n’est affiché.</p>
          {adminRole === 'SUPER_ADMIN' ? <div className="correction-box"><h3>Correction exceptionnelle</h3><p className="hint">Cette demande est auditée et ne modifie jamais directement le paiement. Une raison détaillée est obligatoire.</p><div className="admin-filter-row"><select value={correctionAction} onChange={(e) => setCorrectionAction(e.target.value as typeof correctionAction)} aria-label="Action de correction"><option value="REVIEW_PAYMENT">Revoir le paiement</option><option value="REVIEW_ALLOCATION">Revoir l’allocation</option><option value="REVIEW_DELIVERY">Revoir la délivrance</option></select><textarea value={correctionReason} onChange={(e) => setCorrectionReason(e.target.value)} minLength={20} maxLength={1000} placeholder="Raison opérationnelle (20 caractères minimum)" aria-label="Raison de la correction" /><button className="btn small" onClick={() => void requestCorrection()} disabled={correctionPending}>{correctionPending ? 'Enregistrement…' : 'Soumettre pour revue'}</button></div>{correctionMessage ? <p className="hint" role="status">{correctionMessage}</p> : null}</div> : null}
          <button className="ghost" onClick={() => setSelectedOrder(null)}>Fermer le détail</button>
        </section>
      ) : null}
      {tab === 'payments' ? <section className="card"><h2>Paiements ({payments?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Paiement</th><th>Commande</th><th>Numéro</th><th>Montant</th><th>État</th><th>Provider</th><th>Créé</th></tr></thead>
        <tbody>{pageItems(payments).map((p) => <tr key={p.id}><td><code>{p.id.slice(0, 8)}…</code></td><td><code>{p.order_id.slice(0, 8)}…</code></td><td>{p.phone}</td><td>{formatFcfa(p.amount_fcfa)}</td><td>{stateBadge(p.state)}</td><td>{p.provider}</td><td>{formatDateTime(p.created_at)}</td></tr>)}</tbody>
      </AdminTable>{payments && payments.items.length === 0 ? <p className="hint">Aucun paiement trouvé.</p> : null}<AdminPager page={payments} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {tab === 'tickets' ? <div className="grid">
        <section className="card"><h2>Inventaire par offre</h2>
          {stats ? (
            <>
              <AdminTable>
                <thead><tr><th>Offre</th><th>Prix</th><th>Dispo</th><th>Réservés</th><th>Stale</th><th>Vendus</th><th>Expirés</th><th>Total</th></tr></thead>
                <tbody>{stats.offers.map((o) => <tr key={o.offer_id}><td>{o.offer_id}</td><td>{formatFcfa(o.price_fcfa)}</td><td>{o.available}</td><td>{o.reserved}</td><td>{o.reserved_stale > 0 ? <strong className="count-stale" title="Réservations au-delà du TTL de 15 min (libérées par le worker)">{o.reserved_stale}</strong> : '0'}</td><td>{o.sold}</td><td>{o.expired}</td><td>{o.total}</td></tr>)}</tbody>
              </AdminTable>
              <h3 className="admin-subheading">Stock par plan × destination</h3>
              <AdminTable>
                <thead><tr><th>Offre</th><th>Destination</th><th>Dispo</th><th>Réservés</th><th>Stale</th><th>Vendus</th><th>Expirés</th><th>Total</th></tr></thead>
                <tbody>{stats.by_destination.map((d) => <tr key={`${d.offer_id}-${d.destination}`}><td>{d.offer_id}</td><td><span className={`badge dest-badge ${d.destination === 'PHYSICAL' ? 'dest-physical' : 'dest-digital'}`}>{d.destination}</span></td><td>{d.available}</td><td>{d.reserved}</td><td>{d.reserved_stale > 0 ? <strong className="count-stale">{d.reserved_stale}</strong> : '0'}</td><td>{d.sold}</td><td>{d.expired}</td><td>{d.total}</td></tr>)}</tbody>
              </AdminTable>
            </>
          ) : <p className="hint">Chargement de l’inventaire…</p>}
        </section>
        <section className="card"><h2>Tickets ({tickets?.total ?? 0})</h2><AdminTable>
          <thead><tr><th>Ticket</th><th>Offre</th><th>Destination</th><th>État</th><th>Routeur</th><th>Préfixe</th><th>Révéler</th><th>Vendu le</th></tr></thead>
          <tbody>{pageItems(tickets).map((t) => <tr key={t.id}><td><code>{t.id.slice(0, 8)}…</code></td><td>{t.offer_id}</td><td><span className={`badge dest-badge ${t.destination === 'PHYSICAL' ? 'dest-physical' : 'dest-digital'}`}>{t.destination}</span></td><td>{stateBadge(t.db_state)}</td><td>{stateBadge(t.router_state)}</td><td>{t.code_prefix_hint ?? '—'}</td><td>{t.revealable ? <button className="btn small ghost" onClick={() => openReveal(t)} title="Révélation contrôlée, audité, raison obligatoire">Révéler</button> : <span className="hint" title="Lot sans sceau coffre : le code figure sur le voucher papier">—</span>}</td><td>{t.sold_at ? formatDateTime(t.sold_at) : '—'}</td></tr>)}</tbody>
        </AdminTable>{tickets && tickets.items.length === 0 ? <p className="hint">Aucun ticket trouvé.</p> : null}<AdminPager page={tickets} offset={pageOffset} onOffsetChange={setPageOffset} /></section>
      </div> : null}

      {revealTarget ? (
        <section className="card reveal-box">
          <h2>Révélation contrôlée — ticket {revealTarget.id.slice(0, 8)}…</h2>
          <p className="hint">
            Opération réservée au besoin réel (doc 09 §20) : chaque révélation est auditée (acteur, raison, état du ticket).
            Le code n’est affiché qu’une fois ici, jamais journalisé ni conservé par l’interface.
          </p>
          {revealResult?.ok ? (
            <div className="code-box">
              <span className="code-label">Code du ticket ({revealTarget.destination})</span>
              <span className="code-value">{revealResult.code}</span>
              <p className="hint" role="status">{revealResult.message}</p>
            </div>
          ) : (
            <div className="stack">
              <textarea
                value={revealReason}
                onChange={(e) => setRevealReason(e.target.value)}
                minLength={20}
                maxLength={1000}
                placeholder="Raison opérationnelle (20 caractères minimum) : pourquoi ce code doit-il être révélé ?"
                aria-label="Raison de la révélation"
              />
              <div>
                <button className="btn" onClick={() => void submitReveal()} disabled={revealPending || revealReason.trim().length < 20}>
                  {revealPending ? 'Révélation…' : 'Révéler le code'}
                </button>
              </div>
              {revealResult && !revealResult.ok ? <p className="err" role="alert">{revealResult.message}</p> : null}
            </div>
          )}
          <div className="stack">
            <button className="ghost" onClick={() => { setRevealTarget(null); setRevealResult(null); setRevealReason(''); }}>Fermer</button>
          </div>
        </section>
      ) : null}

      {tab === 'batches' ? <div className="grid">
        <section className="card"><h2>Créer un lot digital</h2><p className="hint">Les codes ne sont affichés qu’à cette création. Archivez-les immédiatement dans le coffre prévu.</p><div className="stack">
          <select value={batchOffer} onChange={(e) => setBatchOffer(e.target.value)} aria-label="Offre du lot"><option value="" disabled>Choisir une offre</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.id} — {formatFcfa(o.priceFcfa)}</option>)}</select>
          <input type="number" min="1" max="200" value={batchQuantity} onChange={(e) => setBatchQuantity(e.target.value)} aria-label="Quantité du lot" />
          <button className="btn" onClick={() => void createBatch()} disabled={batchOffer.length === 0 || batchSubmitting}>{batchSubmitting ? 'Création…' : 'Créer le lot'}</button>
          {batchError ? <p className="err" role="alert">{batchError}</p> : null}
        </div></section>
        <section className="card"><h2>Lots ({batches?.total ?? 0})</h2><AdminTable>
          <thead><tr><th>Lot</th><th>Source</th><th>Destination</th><th>Offre</th><th>Qté</th><th>Dispo</th><th>Rés.</th><th>Stale</th><th>Vendus</th><th>Util.</th><th>Exp.</th><th>Lib.</th><th>Généré le</th><th>Notes</th></tr></thead>
          <tbody>{pageItems(batches).map((b) => <tr key={b.id} title={b.notes ?? undefined}><td><code>{b.id.slice(0, 8)}…</code></td><td>{b.source}</td><td><span className={`badge dest-badge ${b.destination === 'PHYSICAL' ? 'dest-physical' : 'dest-digital'}`}>{b.destination}</span></td><td>{b.offer_id ?? '—'}</td><td>{b.quantity}</td><td>{b.available_count}</td><td>{b.reserved_count}</td><td>{b.reserved_stale_count > 0 ? <strong className="count-stale" title="Réservations au-delà du TTL de 15 min">{b.reserved_stale_count}</strong> : '0'}</td><td>{b.sold_count}</td><td>{b.used_count}</td><td>{b.expired_count}</td><td>{b.released_count}</td><td>{formatDateTime(b.generated_at)}</td><td>{b.notes ? <span title={b.notes}>{b.notes.length > 18 ? `${b.notes.slice(0, 18)}…` : b.notes}</span> : '—'}</td></tr>)}</tbody>
        </AdminTable>{batches && batches.items.length === 0 ? <p className="hint">Aucun lot trouvé.</p> : null}<AdminPager page={batches} offset={pageOffset} onOffsetChange={setPageOffset} /></section>
        <section className="card"><h2>Importer un lot de codes</h2>
          <p className="hint">
            Flux obligatoire : prévisualisation → validation → import transactionnel. Aucun import partiel silencieux :
            la moindre ligne invalide signifie que rien n’est écrit, et le résultat l’annonce explicitement (doc 09 §33-34).
          </p>
          <div className="stack">
            <select value={importOffer} onChange={(e) => { setImportOffer(e.target.value); setImportPreview(null); }} aria-label="Offre du lot importé">
              <option value="" disabled>Choisir une offre</option>
              {offers.map((o) => <option key={o.id} value={o.id}>{o.id} — {formatFcfa(o.priceFcfa)}</option>)}
            </select>
            <select value={importDestination} onChange={(e) => { setImportDestination(e.target.value as 'DIGITAL' | 'PHYSICAL'); setImportPreview(null); }} aria-label="Destination du lot importé">
              <option value="DIGITAL">DIGITAL — vendable en ligne (scellé coffre)</option>
              <option value="PHYSICAL">PHYSICAL — voucher papier (jamais alloué à une vente digitale)</option>
            </select>
            <textarea
              className="import-codes"
              rows={6}
              value={importCodes}
              onChange={(e) => { setImportCodes(e.target.value); setImportPreview(null); }}
              placeholder={'Un code par ligne, 8 caractères [0-9a-z], 1 à 200 codes\nex. : a1b2c3d4\ne5f6g7h8'}
              aria-label="Codes à importer, un par ligne"
            />
            <input value={importNotes} onChange={(e) => { setImportNotes(e.target.value); setImportPreview(null); }} maxLength={200} placeholder="Notes internes du lot (optionnel, 200 car. max)" aria-label="Notes internes du lot" />
            <div className="admin-filter-row">
              <button className="btn small" onClick={() => void previewImport()} disabled={importPending}>{importPending ? '…' : 'Prévisualiser'}</button>
              <button className="btn" onClick={() => void confirmImport()} disabled={importPending || !importPreview?.can_import}>{importPending ? 'Import en cours…' : 'Confirmer l’import'}</button>
            </div>
            {importError ? <p className="err" role="alert">{importError}</p> : null}
            {importResult ? <p className="ok" role="status">{importResult}</p> : null}
          </div>
          {importPreview ? (
            <div className="import-preview">
              <p className={importPreview.can_import ? 'ok' : 'err'} role="status">
                {importPreview.analyzed} analysée(s) · {importPreview.valid} valide(s) · {importPreview.invalid} invalide(s) — {importPreview.can_import ? 'import possible' : 'import non possible'}
              </p>
              {importPreview.invalid > 0 ? (
                <AdminTable>
                  <thead><tr><th>Ligne</th><th>Préfixe</th><th>Motif de rejet</th></tr></thead>
                  <tbody>{importPreview.rows.filter((r) => !r.valid).map((r) => <tr key={r.line}><td>{r.line}</td><td><code>{r.code_hint}</code></td><td>{r.reason ?? '—'}</td></tr>)}</tbody>
                </AdminTable>
              ) : null}
            </div>
          ) : null}
        </section>
        {batchExport ? <section className="card"><h2>Export ponctuel du lot</h2><p className="hint">{batchExport.export_warning}</p><details open><summary>{batchExport.code_export.length} codes à archiver</summary><pre>{batchExport.code_export.map((line) => `${line.router_name}\t${line.code}\t${line.comment}`).join('\n')}</pre></details></section> : null}
      </div> : null}

      {tab === 'incidents' ? <div>
        <section className="card"><h2>Incidents ({incidents?.total ?? 0})</h2><AdminTable>
          <thead><tr><th>Type</th><th>Gravité</th><th>État</th><th>Commande</th><th>Erreur technique</th><th>Tentatives</th><th>Ouvert le</th><th>Fermé le</th><th>Fiche</th></tr></thead>
          <tbody>{pageItems(incidents).map((i) => (
            <tr key={i.id}>
              <td><code>{i.type}</code></td>
              <td>{stateBadge(i.severity)}</td>
              <td>{stateBadge(i.state)}</td>
              <td>{i.order_id ? <code>{i.order_id.slice(0, 8)}…</code> : '—'}</td>
              <td>{i.error ? <span title={i.error}>{i.error.length > 60 ? `${i.error.slice(0, 60)}…` : i.error}</span> : '—'}</td>
              <td>{i.attempts}</td>
              <td>{formatDateTime(i.opened_at)}</td>
              <td>{i.closed_at ? formatDateTime(i.closed_at) : '—'}</td>
              <td><button className="btn small ghost" onClick={() => void openIncident(i.id)}>Ouvrir</button></td>
            </tr>
          ))}</tbody>
        </AdminTable>{incidents && incidents.items.length === 0 ? <p className="hint">Aucun incident trouvé.</p> : null}<AdminPager page={incidents} offset={pageOffset} onOffsetChange={setPageOffset} /></section>

        {selectedIncident ? (
          <section className="card incident-detail">
            <div className="incident-detail-head">
              <h2>Incident <code>{selectedIncident.id.slice(0, 8)}…</code></h2>
              <button className="btn small ghost" onClick={closeIncidentDetail}>Fermer</button>
            </div>
            <p className="incident-badges">{stateBadge(selectedIncident.severity)} {stateBadge(selectedIncident.state)} <code>{selectedIncident.type}</code></p>
            <dl className="incident-fiche">
              <div><dt>Commande</dt><dd>{selectedIncident.order ? <>{selectedIncident.order.phone} · {selectedIncident.order.offer_id} · {stateBadge(selectedIncident.order.state)}</> : '—'}</dd></div>
              <div><dt>Paiement</dt><dd>{selectedIncident.payment ? <><code>{selectedIncident.payment.id.slice(0, 8)}…</code> · {stateBadge(selectedIncident.payment.state)}</> : '—'}</dd></div>
              <div><dt>Ticket</dt><dd>{selectedIncident.ticket ? <><code>{selectedIncident.ticket.id.slice(0, 8)}…</code> · {stateBadge(selectedIncident.ticket.state)}</> : '—'}</dd></div>
              <div><dt>Connector</dt><dd>{selectedIncident.connector_id ?? '—'}</dd></div>
              <div><dt>Erreur technique</dt><dd><code>{selectedIncident.error ?? '—'}</code></dd></div>
              <div><dt>Action recommandée</dt><dd>{selectedIncident.recommended_action ?? '—'}</dd></div>
              <div><dt>Ouvert le</dt><dd>{formatDateTime(selectedIncident.opened_at)}</dd></div>
              <div><dt>Reconnu le</dt><dd>{selectedIncident.acknowledged_at ? `${formatDateTime(selectedIncident.acknowledged_at)} (par ${selectedIncident.acknowledged_by ?? '—'})` : '—'}</dd></div>
              <div><dt>Fermé le</dt><dd>{selectedIncident.closed_at ? `${formatDateTime(selectedIncident.closed_at)} — ${selectedIncident.close_reason ?? ''}` : '—'}</dd></div>
              <div><dt>Tentatives</dt><dd>{selectedIncident.attempts}{selectedIncident.last_attempt_at ? ` (dernière le ${formatDateTime(selectedIncident.last_attempt_at)})` : ''}{selectedIncident.reopened_count > 0 ? ` · réouvert ${selectedIncident.reopened_count}×` : ''}</dd></div>
            </dl>
            <h3>Historique</h3>
            <ol className="incident-history">
              {selectedIncident.history.length === 0 ? <li className="hint">Aucune transition auditée.</li> : null}
              {selectedIncident.history.map((h, index) => (
                <li key={`${h.action}-${index}`}>
                  <code>{h.action}</code> par {h.actor} — {formatDateTime(h.at)}
                  {h.after && typeof h.after['to'] === 'string' ? <span> → {String(h.after['to'])}</span> : null}
                </li>
              ))}
            </ol>
            <h3>Actions</h3>
            <p className="hint">Raison obligatoire (20 à 1000 caractères), auditée. Aucune action ne contourne les invariants : jamais de nouveau paiement, jamais d’écriture routeur directe (le resync est un requeue en base).</p>
            <div className="incident-actions">
              {selectedIncident.state === 'OPEN' || selectedIncident.state === 'REOPENED' ? <button className="btn small" disabled={incidentPending || incidentReason.trim().length < 20} onClick={() => void submitIncidentAction('acknowledge')}>Reconnaître</button> : null}
              {(selectedIncident.state === 'OPEN' || selectedIncident.state === 'ACKNOWLEDGED' || selectedIncident.state === 'REOPENED') && (selectedIncident.type === 'TICKET_ALLOCATION_ERROR' || selectedIncident.type === 'MIKROTIK_SYNC_ERROR')
                ? <button className="btn small" disabled={incidentPending || incidentReason.trim().length < 20} onClick={() => void submitIncidentAction('retry')} title={selectedIncident.type === 'MIKROTIK_SYNC_ERROR' ? 'Resync : les opérations échouées repassent en attente (base uniquement)' : 'Re-joue l’allocation du ticket de la commande'}>Retry {selectedIncident.type === 'MIKROTIK_SYNC_ERROR' ? 'resync' : 'allocation'}</button> : null}
              {selectedIncident.state === 'OPEN' || selectedIncident.state === 'ACKNOWLEDGED' || selectedIncident.state === 'REOPENED' ? <button className="btn small" disabled={incidentPending || incidentReason.trim().length < 20} onClick={() => void submitIncidentAction('investigate')}>Investiguer</button> : null}
              {selectedIncident.state !== 'RESOLVED' && selectedIncident.state !== 'CLOSED' ? <button className="btn small" disabled={incidentPending || incidentReason.trim().length < 20} onClick={() => void submitIncidentAction('resolve')}>Marquer résolu</button> : null}
              {selectedIncident.state === 'RESOLVED' || selectedIncident.state === 'CLOSED' ? <button className="btn small" disabled={incidentPending || incidentReason.trim().length < 20} onClick={() => void submitIncidentAction('reopen')}>Rouvrir</button> : null}
            </div>
            <label className="admin-filter incident-reason"><span>Raison de l’action</span>
              <textarea value={incidentReason} onChange={(e) => setIncidentReason(e.target.value)} rows={3} placeholder="Raison détaillée (20 caractères minimum) — sera auditée" aria-label="Raison de l’action incident" />
            </label>
            {incidentMessage ? <p className={incidentMessage.ok ? 'hint ok' : 'hint error'} role="status">{incidentMessage.text}</p> : null}
          </section>
        ) : null}
      </div> : null}

      {tab === 'audit' ? <section className="card"><h2>Journal d’audit ({audits?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Entité</th><th>Identifiant</th></tr></thead>
        <tbody>{pageItems(audits).map((a) => <tr key={a.id}><td>{formatDateTime(a.at)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.entity}</td><td>{a.entity_id ? <code>{a.entity_id.slice(0, 8)}…</code> : '—'}</td></tr>)}</tbody>
      </AdminTable>{audits && audits.items.length === 0 ? <p className="hint">Aucun événement d’audit trouvé.</p> : null}<AdminPager page={audits} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {tab === 'reconciliation' && recon ? <div className="grid">
        {stockRecon ? (
          <section className="card">
            <h2>Stock vs manifeste IMP-06</h2>
            <p className={stockRecon.ok ? 'ok' : 'err'} role="status">
              {stockRecon.actual_total} / {stockRecon.expected_total} tickets ({stockRecon.manifest_id}) — {stockRecon.ok ? 'conforme' : 'DIVERGENCE'}
            </p>
            <AdminTable>
              <thead><tr><th>Lot</th><th>Offre</th><th>Attendu</th><th>Constaté</th><th>Statut</th></tr></thead>
              <tbody>{stockRecon.items.map((i) => <tr key={i.batch_note}><td>{i.batch_note}</td><td>{i.offer_id}</td><td>{i.expected}</td><td>{i.actual}</td><td><span className={`badge stock-${i.status.toLowerCase()}`}>{i.status}</span></td></tr>)}</tbody>
            </AdminTable>
          </section>
        ) : null}
        <section className="card"><h2>Alertes ouvertes ({recon.open_alerts.length})</h2>{recon.open_alerts.length === 0 ? <p className="ok">Aucune alerte de réconciliation ouverte.</p> : <AdminTable><thead><tr><th>Règle</th><th>Sévérité</th><th>Créée le</th><th>Action</th></tr></thead><tbody>{recon.open_alerts.map((a) => <tr key={a.id}><td>{a.rule}</td><td>{stateBadge(a.severity)}</td><td>{formatDateTime(a.created_at)}</td><td><button className="btn small" onClick={() => void ack(a.id)} disabled={ackPending !== null}>{ackPending === a.id ? 'Acquittement…' : 'Acquitter'}</button></td></tr>)}</tbody></AdminTable>}</section>
        <section className="card"><h2>Runs ({recon.runs.length})</h2>{recon.runs.length === 0 ? <p className="hint">Aucun run enregistré.</p> : <AdminTable><thead><tr><th>Début</th><th>Statut</th><th>Attendu</th><th>Vu</th><th>Violations</th><th>Anomalies</th></tr></thead><tbody>{recon.runs.map((r) => <tr key={r.id}><td>{formatDateTime(r.started_at)}</td><td>{stateBadge(r.status)}</td><td>{r.router_total_expected ?? '—'}</td><td>{r.router_total_seen ?? '—'}</td><td>{r.violations.length > 0 ? r.violations.join(', ') : '—'}</td><td>{r.anomalies_count}</td></tr>)}</tbody></AdminTable>}</section>
      </div> : null}
      </section>
    </div>
  );
}

function AdminTable({ children }: { children: ReactNode }) {
  return <div className="table-wrap"><table className="table">{children}</table></div>;
}

function AdminPager<T>({ page, offset, onOffsetChange }: { page: AdminPage<T> | null; offset: number; onOffsetChange: (offset: number) => void }) {
  if (!page || page.total <= page.limit) return null;
  const first = page.total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + page.items.length, page.total);
  return <div className="admin-pager"><span>{first}–{last} sur {page.total}</span><button className="ghost small" disabled={offset === 0} onClick={() => onOffsetChange(Math.max(0, offset - page.limit))}>Précédent</button><button className="ghost small" disabled={offset + page.limit >= page.total} onClick={() => onOffsetChange(offset + page.limit)}>Suivant</button></div>;
}
