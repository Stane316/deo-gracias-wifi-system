import { useCallback, useEffect, useState } from 'react';
import { api, storage, type Offer, type OrderView, type TicketView } from '../api.js';
import { formatFcfa, formatHours, problemDetail } from '../format.js';

/**
 * IMP-25 — Parcours client de la démo : connexion OTP (mode DEV), choix
 * d'offre, commande, paiement simulé, ticket livré. Tout passe par /api/…
 */
export function Accueil() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersError, setOffersError] = useState<string | null>(null);

  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [authState, setAuthState] = useState<'anon' | 'otp-requested' | 'connected'>('anon');
  const [authError, setAuthError] = useState<string | null>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [order, setOrder] = useState<OrderView | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [providerRef, setProviderRef] = useState<string | null>(null);
  const [flowError, setFlowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<TicketView[]>([]);

  useEffect(() => {
    void (async () => {
      const res = await api<Offer[]>('/offers');
      if (res.ok && res.body) setOffers(res.body);
      else setOffersError(problemDetail(res.body));
      if (storage.customerToken()) setAuthState('connected');
    })();
  }, []);

  const refreshTickets = useCallback(async () => {
    const res = await api<{ tickets: TicketView[] }>('/tickets/mine', { token: storage.customerToken() });
    if (res.ok && res.body) setTickets(res.body.tickets);
  }, []);

  const requestOtp = async () => {
    setAuthError(null);
    setBusy(true);
    try {
      const res = await api<{ status: string; dev_code?: string }>('/auth/phone/request', {
        method: 'POST',
        body: { phone },
      });
      if (!res.ok) { setAuthError(problemDetail(res.body)); return; }
      setAuthState('otp-requested');
      if (res.body?.dev_code) setOtpCode(res.body.dev_code); // AUTH_DEV_MODE : code retourné
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setAuthError(null);
    setBusy(true);
    try {
      const res = await api<{ token: string }>('/auth/phone/verify', {
        method: 'POST',
        body: { phone, code: otpCode },
      });
      if (!res.ok || !res.body) { setAuthError(problemDetail(res.body)); return; }
      storage.setCustomerToken(res.body.token);
      setAuthState('connected');
      await refreshTickets();
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST', token: storage.customerToken() });
    storage.setCustomerToken(null);
    setAuthState('anon');
    setTickets([]);
    setOrder(null);
  };

  const createOrder = async (offerId: string) => {
    setFlowError(null);
    setBusy(true);
    try {
      const res = await api<OrderView>('/orders', {
        method: 'POST',
        body: { offer_id: offerId, customer_phone: phone },
        token: storage.customerToken(),
        headers: { 'idempotency-key': `dg-demo-${crypto.randomUUID()}` },
      });
      if (!res.ok || !res.body) { setFlowError(problemDetail(res.body)); return; }
      setSelected(offerId);
      setOrder(res.body);
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    if (!order) return;
    setFlowError(null);
    setBusy(true);
    try {
      const res = await api<{ payment_id: string; provider_ref: string; redirect_url: string }>(
        `/orders/${order.id}/pay`,
        { method: 'POST' },
      );
      if (!res.ok || !res.body) { setFlowError(problemDetail(res.body)); return; }
      setPaymentId(res.body.payment_id);
      setProviderRef(res.body.provider_ref);
    } finally {
      setBusy(false);
    }
  };

  const approveDev = async () => {
    if (!paymentId || !order) return;
    setFlowError(null);
    setBusy(true);
    try {
      const res = await api<{ processed?: string; ignored?: string }>('/webhooks/dev-approve', {
        method: 'POST',
        body: { payment_id: paymentId },
      });
      if (!res.ok) { setFlowError(problemDetail(res.body)); return; }
      const after = await api<OrderView>(`/orders/${order.id}`);
      if (after.ok && after.body) setOrder(after.body);
      await refreshTickets();
    } finally {
      setBusy(false);
    }
  };

  const offer = offers.find((o) => o.id === selected) ?? null;

  return (
    <div className="grid">
      <section className="card">
        <h2>1. Connexion</h2>
        {authState === 'connected' ? (
          <div>
            <p className="ok">Connecté : {phone}</p>
            <button className="btn ghost" onClick={() => void logout()} disabled={busy}>Se déconnecter</button>
          </div>
        ) : authState === 'otp-requested' ? (
          <div className="stack">
            <p>Code OTP (mode DEV : pré-rempli automatiquement) :</p>
            <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} aria-label="Code OTP" />
            <button className="btn" onClick={() => void verifyOtp()} disabled={busy || otpCode.length < 4}>Valider</button>
            {authError ? <p className="err">{authError}</p> : null}
          </div>
        ) : (
          <div className="stack">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Téléphone (ex. 0197123456)"
              aria-label="Téléphone"
            />
            <button className="btn" onClick={() => void requestOtp()} disabled={busy || phone.length < 8}>
              Recevoir le code
            </button>
            {authError ? <p className="err">{authError}</p> : null}
          </div>
        )}
      </section>

      <section className="card">
        <h2>2. Offres (Grille A)</h2>
        {offersError ? <p className="err">{offersError}</p> : null}
        <div className="offers">
          {offers.map((o) => (
            <button
              key={o.id}
              className={`offer ${selected === o.id ? 'selected' : ''}`}
              onClick={() => void (authState === 'connected' ? createOrder(o.id) : undefined)}
              disabled={authState !== 'connected' || busy}
            >
              <span className="offer-name">{o.id}</span>
              <span className="offer-price">{formatFcfa(o.priceFcfa)}</span>
              <span className="offer-meta">accès {formatHours(o.accessHours)} · validité {formatHours(o.validityHours)}</span>
            </button>
          ))}
        </div>
        {authState !== 'connected' ? <p className="hint">Connectez-vous pour commander.</p> : null}
      </section>

      <section className="card">
        <h2>3. Commande &amp; paiement</h2>
        {!order ? <p className="hint">Choisissez une offre ci-dessus.</p> : (
          <div className="stack">
            <p>
              Commande <code>{order.id.slice(0, 8)}…</code> — {offer?.id ?? ''} — état{' '}
              <strong className={`state state-${order.state}`}>{order.state}</strong>
            </p>
            {!paymentId ? (
              <button className="btn" onClick={() => void pay()} disabled={busy}>Payer {offer ? formatFcfa(offer.priceFcfa) : ''}</button>
            ) : order.state === 'DELIVERED' ? (
              <p className="ok">Paiement confirmé, ticket livré 🎉</p>
            ) : (
              <div className="stack">
                <p>Paiement <code>{providerRef ?? ''}</code> en attente.</p>
                <button className="btn" onClick={() => void approveDev()} disabled={busy}>
                  Simuler l’approbation (mode DEV)
                </button>
              </div>
            )}
            {flowError ? <p className="err">{flowError}</p> : null}
          </div>
        )}
      </section>

      <section className="card">
        <h2>4. Mes tickets</h2>
        {tickets.length === 0 ? <p className="hint">Aucun ticket pour l’instant.</p> : (
          <table className="table">
            <thead>
              <tr><th>Offre</th><th>État base</th><th>État routeur</th><th>Préfixe code</th><th>Vendu le</th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td>{t.offer_id ?? '—'}</td>
                  <td>{t.db_state}</td>
                  <td>{t.router_state}</td>
                  <td>{t.code_prefix_hint ?? '—'}</td>
                  <td>{t.sold_at ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
