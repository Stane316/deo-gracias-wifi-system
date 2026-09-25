import { useCallback, useEffect, useState } from 'react';
import { api, storage, type Offer, type TicketView } from '../api.js';
import { problemDetail } from '../format.js';

/**
 * IMP-26 UX 6 (D-UX6a) — livraison du code à l'acheteur :
 * session OTP du téléphone payeur (si pas déjà connecté) puis révélation
 * auditée via GET /tickets/:id/code. Le code est mono-usage : l'afficher à
 * son acheteur est le but même de la vente.
 */
export function CodeDelivery({ phone, offer }: { phone: string; offer: Offer | null }) {
  const [phase, setPhase] = useState<'need-auth' | 'loading' | 'code' | 'error'>('loading');
  const [otp, setOtp] = useState('');
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reveal = useCallback(async () => {
    setPhase('loading');
    setMessage(null);
    const mine = await api<{ tickets: TicketView[] }>('/tickets/mine', { token: storage.customerToken() });
    if (!mine.ok || !mine.body) {
      setMessage(problemDetail(mine.body));
      setPhase('error');
      return;
    }
    const ticket = mine.body.tickets.find(
      (t) => (t.db_state === 'SOLD' || t.db_state === 'USED') && (offer ? t.offer_id === offer.id : true),
    );
    if (!ticket) {
      setMessage('Votre accès est en cours de préparation. Vérifiez à nouveau dans un instant.');
      setPhase('error');
      return;
    }
    const res = await api<{ code: string }>(`/tickets/${ticket.id}/code`, { token: storage.customerToken() });
    if (res.ok && res.body) {
      setCode(res.body.code);
      setPhase('code');
      return;
    }
    setMessage(problemDetail(res.body));
    setPhase('error');
  }, [offer]);

  useEffect(() => {
    if (storage.customerToken()) void reveal();
    else setPhase('need-auth');
  }, [reveal]);

  const requestOtp = async () => {
    setBusy(true);
    const res = await api<{ status: string; dev_code?: string }>('/auth/phone/request', {
      method: 'POST',
      body: { phone },
    });
    if (res.ok) {
      setOtpRequested(true);
      if (res.body?.dev_code) setOtp(res.body.dev_code);
    } else {
      setMessage(problemDetail(res.body));
      setPhase('error');
    }
    setBusy(false);
  };

  const verifyOtp = async () => {
    setBusy(true);
    const res = await api<{ token: string }>('/auth/phone/verify', {
      method: 'POST',
      body: { phone, code: otp },
    });
    if (res.ok && res.body) {
      storage.setCustomerToken(res.body.token);
      await reveal();
    } else {
      setMessage(problemDetail(res.body));
      setPhase('error');
    }
    setBusy(false);
  };

  const copy = async () => {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
      setMessage('Copie automatique indisponible : recopiez le code manuellement.');
    }
  };

  if (phase === 'need-auth') {
    return (
      <div className="stack">
        <p className="hint">Pour recevoir votre code, confirmez le numéro ayant servi à l’achat :</p>
        <p className="ok">{phone}</p>
        {!otpRequested ? (
          <button className="btn big" onClick={() => void requestOtp()} disabled={busy}>
            Recevoir le code de confirmation
          </button>
        ) : (
          <div className="stack">
            <input value={otp} onChange={(e) => setOtp(e.target.value)} maxLength={6} inputMode="numeric" aria-label="Code de confirmation" />
            <button className="btn big" onClick={() => void verifyOtp()} disabled={busy || otp.length < 4}>
              Vérifier et recevoir mon code Wi-Fi
            </button>
          </div>
        )}
        {message ? <p className="err">{message}</p> : null}
      </div>
    );
  }

  if (phase === 'loading') {
    return (
      <div className="stack">
        <div className="spinner" aria-hidden="true" />
        <p className="hint" role="status">Préparation de votre code…</p>
      </div>
    );
  }

  if (phase === 'code' && code) {
    return (
      <div className="stack">
        <div className="code-box" role="group" aria-label="Votre code Wi-Fi">
          <span className="code-label">VOTRE CODE WI-FI</span>
          <span className="code-value">{code}</span>
        </div>
        <button className="btn big" onClick={() => void copy()}>
          {copied ? 'Code copié ✓' : 'Copier mon code'}
        </button>
        <div className="howto">
          <p className="field-label">Utiliser mon code</p>
          <ol>
            <li>Connectez-vous au réseau Wi-Fi <strong>Déo Gracias</strong>.</li>
            <li>La page d’accueil du Wi-Fi s’ouvre (portail captif).</li>
            <li>Saisissez votre code ci-dessus, puis validez.</li>
          </ol>
        </div>
        <p className="hint">Code à usage unique. Retrouvez-le à tout moment via « Mes tickets ».</p>
      </div>
    );
  }

  return (
    <div className="stack">
      <p className="err" role="alert">{message ?? 'Le code n’est pas encore disponible.'}</p>
      <button className="btn ghost" onClick={() => void reveal()}>Vérifier à nouveau</button>
    </div>
  );
}

/** UX 6 — « Mes tickets » : révélation auditée, un clic par code. */
export function RevealCodeButton({ ticketId }: { ticketId: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (code) {
    return <span className="code-inline" title="Code révélé (journalisé)">{code}</span>;
  }
  return (
    <span>
      <button
        className="btn small"
        onClick={() => {
          void (async () => {
            const res = await api<{ code: string }>(`/tickets/${ticketId}/code`, { token: storage.customerToken() });
            if (res.ok && res.body) setCode(res.body.code);
            else setError(problemDetail(res.body));
          })();
        }}
      >
        Voir le code
      </button>
      {error ? <span className="err"> {error}</span> : null}
    </span>
  );
}
