import { useCallback, useEffect, useState } from 'react';
import { api, storage, type TicketView } from '../api.js';
import { problemDetail } from '../format.js';

/**
 * UX 2 — « Retrouver mes tickets » : connexion OTP + liste des tickets,
 * repris sans perte de fonctionnalité depuis l'ancien Accueil (IMP-25).
 */
export function MyTickets() {
  const [phone, setPhone] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [authState, setAuthState] = useState<'anon' | 'otp-requested' | 'connected'>('anon');
  const [authError, setAuthError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tickets, setTickets] = useState<TicketView[]>([]);

  useEffect(() => {
    if (storage.customerToken()) setAuthState('connected');
  }, []);

  const refreshTickets = useCallback(async () => {
    const res = await api<{ tickets: TicketView[] }>('/tickets/mine', { token: storage.customerToken() });
    if (res.ok && res.body) setTickets(res.body.tickets);
  }, []);

  useEffect(() => {
    if (authState === 'connected') void refreshTickets();
  }, [authState, refreshTickets]);

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
      if (res.body?.dev_code) setOtpCode(res.body.dev_code); // AUTH_DEV_MODE
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
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api('/auth/logout', { method: 'POST', token: storage.customerToken() });
    storage.setCustomerToken(null);
    setAuthState('anon');
    setTickets([]);
  };

  if (authState === 'connected') {
    return (
      <div className="stack">
        <p className="ok">Connecté : {phone}</p>
        {tickets.length === 0 ? (
          <p className="hint">Aucun ticket pour l’instant.</p>
        ) : (
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
        <button className="btn ghost" onClick={() => void logout()} disabled={busy}>Se déconnecter</button>
      </div>
    );
  }

  if (authState === 'otp-requested') {
    return (
      <div className="stack">
        <p>Code OTP reçu (mode DEV : pré-rempli automatiquement) :</p>
        <input value={otpCode} onChange={(e) => setOtpCode(e.target.value)} maxLength={6} aria-label="Code OTP" inputMode="numeric" />
        <button className="btn" onClick={() => void verifyOtp()} disabled={busy || otpCode.length < 4}>
          Vérifier mon code
        </button>
        {authError ? <p className="err">{authError}</p> : null}
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="hint">Connectez-vous avec le numéro utilisé lors de l’achat.</p>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="Téléphone (ex. 0197123456)"
        aria-label="Téléphone"
        inputMode="tel"
      />
      <button className="btn" onClick={() => void requestOtp()} disabled={busy || phone.length < 8}>
        Recevoir le code
      </button>
      {authError ? <p className="err">{authError}</p> : null}
    </div>
  );
}
