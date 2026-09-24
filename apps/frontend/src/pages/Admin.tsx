import { useCallback, useEffect, useState } from 'react';
import { api, storage, type ReconciliationView } from '../api.js';
import { formatDateTime, formatFcfa, problemDetail } from '../format.js';

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

/**
 * IMP-25 — Console d'administration de la démo : tableau de bord (IMP-17),
 * stats tickets, réconciliation (IMP-24) avec acquittement des alertes.
 * Auth : jeton DEV_ADMIN_TOKEN en mode démo (Supabase Auth en production).
 */
export function Admin() {
  const [tokenInput, setTokenInput] = useState('');
  const [connected, setConnected] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [tab, setTab] = useState<'dashboard' | 'tickets' | 'reconciliation'>('dashboard');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [stats, setStats] = useState<TicketsStats | null>(null);
  const [recon, setRecon] = useState<ReconciliationView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token = storage.adminToken();

  const check = useCallback(async () => {
    if (!token) return;
    const res = await api<{ sub: string; role: string }>('/admin/me', { token });
    if (res.ok) setConnected(true);
    else {
      storage.setAdminToken(null);
      setConnected(false);
    }
  }, [token]);

  useEffect(() => { void check(); }, [check]);

  const load = useCallback(async () => {
    setError(null);
    if (tab === 'dashboard') {
      const res = await api<DashboardPayload>('/admin/dashboard', { token: storage.adminToken() });
      if (res.ok && res.body) setDashboard(res.body);
      else setError(problemDetail(res.body));
    } else if (tab === 'tickets') {
      const res = await api<TicketsStats>('/admin/tickets/stats', { token: storage.adminToken() });
      if (res.ok && res.body) setStats(res.body);
      else setError(problemDetail(res.body));
    } else {
      const res = await api<ReconciliationView>('/admin/reconciliation', { token: storage.adminToken() });
      if (res.ok && res.body) setRecon(res.body);
      else setError(problemDetail(res.body));
    }
  }, [tab]);

  useEffect(() => { if (connected) void load(); }, [connected, load]);

  const login = async () => {
    setAuthError(null);
    storage.setAdminToken(tokenInput.trim());
    const res = await api<{ sub: string; role: string }>('/admin/me', { token: tokenInput.trim() });
    if (res.ok) { setConnected(true); setTokenInput(''); }
    else { storage.setAdminToken(null); setAuthError(problemDetail(res.body)); }
  };

  const ack = async (alertId: string) => {
    await api(`/admin/alerts/${alertId}/ack`, { method: 'POST', token: storage.adminToken() });
    await load();
  };

  if (!connected) {
    return (
      <section className="card narrow">
        <h2>Connexion admin</h2>
        <p className="hint">
          Mode démo : entrez le jeton <code>DEV_ADMIN_TOKEN</code> du backend
          (en production : compte Supabase avec rôle ADMIN).
        </p>
        <div className="stack">
          <input
            type="password"
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder="Jeton admin"
            aria-label="Jeton admin"
          />
          <button className="btn" onClick={() => void login()} disabled={tokenInput.length === 0}>Connexion</button>
          {authError ? <p className="err">{authError}</p> : null}
        </div>
      </section>
    );
  }

  return (
    <div>
      <div className="tabs">
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}>Tableau de bord</button>
        <button className={tab === 'tickets' ? 'active' : ''} onClick={() => setTab('tickets')}>Tickets</button>
        <button className={tab === 'reconciliation' ? 'active' : ''} onClick={() => setTab('reconciliation')}>Réconciliation</button>
        <button className="ghost right" onClick={() => { storage.setAdminToken(null); setConnected(false); }}>Déconnexion</button>
      </div>
      {error ? <p className="err">{error}</p> : null}

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
              <li><span>Incidents ouverts</span><strong>{dashboard.system.incidents_open}</strong></li>
              <li><span>Généré le</span><strong>{formatDateTime(dashboard.generated_at)}</strong></li>
            </ul>
            <details><summary>Inventaire (détail)</summary><pre>{JSON.stringify(dashboard.inventory, null, 2)}</pre></details>
          </section>
        </div>
      ) : null}

      {tab === 'tickets' && stats ? (
        <section className="card">
          <h2>Statistiques tickets</h2>
          <pre>{JSON.stringify(stats, null, 2)}</pre>
        </section>
      ) : null}

      {tab === 'reconciliation' && recon ? (
        <div className="grid">
          <section className="card">
            <h2>Alertes ouvertes ({recon.open_alerts.length})</h2>
            {recon.open_alerts.length === 0 ? <p className="ok">Aucune alerte de réconciliation ouverte.</p> : (
              <table className="table">
                <thead><tr><th>Règle</th><th>Sévérité</th><th>Créée le</th><th>Action</th></tr></thead>
                <tbody>
                  {recon.open_alerts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.rule}</td>
                      <td><span className={`badge sev-${a.severity}`}>{a.severity}</span></td>
                      <td>{formatDateTime(a.created_at)}</td>
                      <td><button className="btn small" onClick={() => void ack(a.id)}>Acquitter</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
          <section className="card">
            <h2>Runs de réconciliation ({recon.runs.length})</h2>
            {recon.runs.length === 0 ? <p className="hint">Aucun run enregistré.</p> : (
              <table className="table">
                <thead>
                  <tr><th>Début</th><th>Statut</th><th>Attendu</th><th>Vu</th><th>Violations</th><th>Anomalies</th></tr>
                </thead>
                <tbody>
                  {recon.runs.map((r) => (
                    <tr key={r.id}>
                      <td>{formatDateTime(r.started_at)}</td>
                      <td><span className={`badge run-${r.status}`}>{r.status}</span></td>
                      <td>{r.router_total_expected ?? '—'}</td>
                      <td>{r.router_total_seen ?? '—'}</td>
                      <td>{r.violations.length > 0 ? r.violations.join(', ') : '—'}</td>
                      <td>{r.anomalies_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
