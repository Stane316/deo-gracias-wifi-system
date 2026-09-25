import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { appRoute, replaceBrowserPath } from '../admin-route.js';
import {
  api,
  storage,
  type AdminAuditSummary,
  type AdminBatchSummary,
  type AdminIncidentSummary,
  type AdminOrderDetail,
  type AdminOrderSummary,
  type AdminPage,
  type AdminPaymentSummary,
  type AdminTicketSummary,
  type Offer,
  type ReconciliationView,
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
  today: { revenue_fcfa: number; orders_count: number; payments_confirmed: number; tickets_delivered: number };
  inventory: Record<string, unknown>;
  system: { connector_state: string; sync_state: Record<string, unknown>; incidents_open: number };
}

interface TicketsStats {
  total?: number;
  by_state?: Record<string, number>;
  [key: string]: unknown;
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
  incidents: { label: 'État incident', values: ['OPEN', 'INVESTIGATING', 'RESOLVED'] },
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
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<AdminTab>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [stats, setStats] = useState<TicketsStats | null>(null);
  const [recon, setRecon] = useState<ReconciliationView | null>(null);
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
  const [pageOffset, setPageOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [batchOffer, setBatchOffer] = useState('');
  const [batchQuantity, setBatchQuantity] = useState('1');
  const [batchExport, setBatchExport] = useState<BatchCreateResponse | null>(null);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batchSubmitting, setBatchSubmitting] = useState(false);
  const [ackPending, setAckPending] = useState<string | null>(null);

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
    if (res.ok) setConnected(true);
    else clearAuth();
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
          api<TicketsStats>('/admin/tickets/stats', { token }),
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
        const res = await api<ReconciliationView>('/admin/reconciliation', { token });
        if (res.ok && res.body) setRecon(res.body);
        else setError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
      }
    } finally {
      setLoading(false);
    }
  }, [pageOffset, search, stateFilter, tab, token]);

  useEffect(() => { setPageOffset(0); setStateFilter(''); }, [tab]);
  useEffect(() => { setPageOffset(0); }, [search, stateFilter]);
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
    if (res.ok) { setConnected(true); setTokenInput(''); }
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
            <button className="btn small" onClick={() => void load()}>Actualiser</button>
          </div>
        ) : null}

      {tab === 'dashboard' && dashboard ? (
        <div className="grid">
          <section className="card">
            <h2>Aujourd’hui ({dashboard.timezone})</h2>
            <div className="kpis">
              <div className="kpi"><span className="kpi-value">{formatFcfa(dashboard.today.revenue_fcfa)}</span><span>Revenu</span></div>
              <div className="kpi"><span className="kpi-value">{dashboard.today.orders_count}</span><span>Commandes</span></div>
              <div className="kpi"><span className="kpi-value">{dashboard.today.payments_confirmed}</span><span>Paiements confirmés</span></div>
              <div className="kpi"><span className="kpi-value">{dashboard.today.tickets_delivered}</span><span>Tickets livrés</span></div>
            </div>
          </section>
          <section className="card">
            <h2>Système</h2>
            <ul className="kv">
              <li><span>Connector</span><strong>{dashboard.system.connector_state}</strong></li>
              <li><span>Synchronisation</span><strong>{JSON.stringify(dashboard.system.sync_state)}</strong></li>
              <li><span>Incidents ouverts</span><strong>{dashboard.system.incidents_open}</strong></li>
              <li><span>Généré le</span><strong>{formatDateTime(dashboard.generated_at)}</strong></li>
            </ul>
            <details><summary>Inventaire (détail)</summary><pre>{JSON.stringify(dashboard.inventory, null, 2)}</pre></details>
          </section>
        </div>
      ) : null}

      {tab === 'orders' ? <section className="card"><h2>Commandes ({orders?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Commande</th><th>Numéro</th><th>Offre</th><th>Montant</th><th>Commande</th><th>Paiement</th><th>Ticket</th><th>Créée</th><th></th></tr></thead>
        <tbody>{pageItems(orders).map((o) => <tr key={o.id}><td><code>{o.id.slice(0, 8)}…</code></td><td>{o.phone}</td><td>{o.offer_id}</td><td>{formatFcfa(o.price_fcfa)}</td><td>{stateBadge(o.state)}</td><td>{stateBadge(o.payment_state)}</td><td>{stateBadge(o.ticket_state)}</td><td>{formatDateTime(o.created_at)}</td><td><button className="btn small" onClick={() => void openOrder(o.id)}>Détail</button></td></tr>)}</tbody>
      </AdminTable>{orders && orders.items.length === 0 ? <p className="hint">Aucune commande trouvée.</p> : null}<AdminPager page={orders} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {selectedOrder ? <section className="card order-detail"><h2>Détail commande <code>{selectedOrder.id}</code></h2><div className="kv"><div><span>Client</span><strong>{selectedOrder.phone}</strong></div><div><span>Offre</span><strong>{selectedOrder.offer_id} — {formatFcfa(selectedOrder.price_fcfa)}</strong></div><div><span>Commande</span><strong>{stateBadge(selectedOrder.state)}</strong></div></div><div className="grid"><div><h3>Paiement lié</h3>{selectedOrder.payment ? <p><code>{selectedOrder.payment.id}</code> · {selectedOrder.payment.provider} · {formatFcfa(selectedOrder.payment.amount_fcfa)} · {stateBadge(selectedOrder.payment.state)}</p> : <p className="hint">Aucun paiement lié.</p>}</div><div><h3>Ticket lié</h3>{selectedOrder.ticket ? <p><code>{selectedOrder.ticket.id}</code> · DB {stateBadge(selectedOrder.ticket.db_state)} · routeur {stateBadge(selectedOrder.ticket.router_state)} · préfixe {selectedOrder.ticket.code_prefix_hint ?? '—'}</p> : <p className="hint">Aucun ticket lié.</p>}</div></div><button className="ghost" onClick={() => setSelectedOrder(null)}>Fermer le détail</button></section> : null}

      {tab === 'payments' ? <section className="card"><h2>Paiements ({payments?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Paiement</th><th>Commande</th><th>Numéro</th><th>Montant</th><th>État</th><th>Provider</th><th>Créé</th></tr></thead>
        <tbody>{pageItems(payments).map((p) => <tr key={p.id}><td><code>{p.id.slice(0, 8)}…</code></td><td><code>{p.order_id.slice(0, 8)}…</code></td><td>{p.phone}</td><td>{formatFcfa(p.amount_fcfa)}</td><td>{stateBadge(p.state)}</td><td>{p.provider}</td><td>{formatDateTime(p.created_at)}</td></tr>)}</tbody>
      </AdminTable>{payments && payments.items.length === 0 ? <p className="hint">Aucun paiement trouvé.</p> : null}<AdminPager page={payments} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {tab === 'tickets' ? <div className="grid">
        <section className="card"><h2>Inventaire par offre</h2><pre>{JSON.stringify(stats, null, 2)}</pre></section>
        <section className="card"><h2>Tickets ({tickets?.total ?? 0})</h2><AdminTable>
          <thead><tr><th>Ticket</th><th>Offre</th><th>Source</th><th>État</th><th>Routeur</th><th>Préfixe</th><th>Vendu le</th></tr></thead>
          <tbody>{pageItems(tickets).map((t) => <tr key={t.id}><td><code>{t.id.slice(0, 8)}…</code></td><td>{t.offer_id}</td><td>{t.source}</td><td>{stateBadge(t.db_state)}</td><td>{stateBadge(t.router_state)}</td><td>{t.code_prefix_hint ?? '—'}</td><td>{t.sold_at ? formatDateTime(t.sold_at) : '—'}</td></tr>)}</tbody>
        </AdminTable>{tickets && tickets.items.length === 0 ? <p className="hint">Aucun ticket trouvé.</p> : null}<AdminPager page={tickets} offset={pageOffset} onOffsetChange={setPageOffset} /></section>
      </div> : null}

      {tab === 'batches' ? <div className="grid">
        <section className="card"><h2>Créer un lot digital</h2><p className="hint">Les codes ne sont affichés qu’à cette création. Archivez-les immédiatement dans le coffre prévu.</p><div className="stack">
          <select value={batchOffer} onChange={(e) => setBatchOffer(e.target.value)} aria-label="Offre du lot"><option value="" disabled>Choisir une offre</option>{offers.map((o) => <option key={o.id} value={o.id}>{o.id} — {formatFcfa(o.priceFcfa)}</option>)}</select>
          <input type="number" min="1" max="200" value={batchQuantity} onChange={(e) => setBatchQuantity(e.target.value)} aria-label="Quantité du lot" />
          <button className="btn" onClick={() => void createBatch()} disabled={batchOffer.length === 0 || batchSubmitting}>{batchSubmitting ? 'Création…' : 'Créer le lot'}</button>
          {batchError ? <p className="err" role="alert">{batchError}</p> : null}
        </div></section>
        <section className="card"><h2>Lots ({batches?.total ?? 0})</h2><AdminTable>
          <thead><tr><th>Lot</th><th>Source</th><th>Quantité</th><th>Généré le</th><th>Notes</th></tr></thead>
          <tbody>{pageItems(batches).map((b) => <tr key={b.id}><td><code>{b.id.slice(0, 8)}…</code></td><td>{b.source}</td><td>{b.quantity}</td><td>{formatDateTime(b.generated_at)}</td><td>{b.notes ?? '—'}</td></tr>)}</tbody>
        </AdminTable>{batches && batches.items.length === 0 ? <p className="hint">Aucun lot trouvé.</p> : null}<AdminPager page={batches} offset={pageOffset} onOffsetChange={setPageOffset} /></section>
        {batchExport ? <section className="card"><h2>Export ponctuel du lot</h2><p className="hint">{batchExport.export_warning}</p><details open><summary>{batchExport.code_export.length} codes à archiver</summary><pre>{batchExport.code_export.map((line) => `${line.router_name}\t${line.code}\t${line.comment}`).join('\n')}</pre></details></section> : null}
      </div> : null}

      {tab === 'incidents' ? <section className="card"><h2>Incidents ({incidents?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Type</th><th>Sévérité</th><th>État</th><th>Détails sûrs</th><th>Ouvert le</th><th>Fermé le</th></tr></thead>
        <tbody>{pageItems(incidents).map((i) => <tr key={i.id}><td>{i.type}</td><td>{stateBadge(i.severity)}</td><td>{stateBadge(i.state)}</td><td><code>{JSON.stringify(i.details)}</code></td><td>{formatDateTime(i.opened_at)}</td><td>{i.closed_at ? formatDateTime(i.closed_at) : '—'}</td></tr>)}</tbody>
      </AdminTable>{incidents && incidents.items.length === 0 ? <p className="hint">Aucun incident trouvé.</p> : null}<AdminPager page={incidents} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {tab === 'audit' ? <section className="card"><h2>Journal d’audit ({audits?.total ?? 0})</h2><AdminTable>
        <thead><tr><th>Date</th><th>Acteur</th><th>Action</th><th>Entité</th><th>Identifiant</th></tr></thead>
        <tbody>{pageItems(audits).map((a) => <tr key={a.id}><td>{formatDateTime(a.at)}</td><td>{a.actor}</td><td>{a.action}</td><td>{a.entity}</td><td>{a.entity_id ? <code>{a.entity_id.slice(0, 8)}…</code> : '—'}</td></tr>)}</tbody>
      </AdminTable>{audits && audits.items.length === 0 ? <p className="hint">Aucun événement d’audit trouvé.</p> : null}<AdminPager page={audits} offset={pageOffset} onOffsetChange={setPageOffset} /></section> : null}

      {tab === 'reconciliation' && recon ? <div className="grid">
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
