import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { api, type Offer, type OrderView } from '../api.js';
import {
  backendUnreachableMessage,
  chooseOfferLabel,
  formatHours,
  maskPhone,
  payCtaLabel,
  problemDetail,
} from '../format.js';
import { checkoutReducer, initialCheckoutState } from './machine.js';
import { MyTickets } from './MyTickets.js';
import { PlanRecap } from './PlanRecap.js';
import { validateCustomerPhone } from './phone.js';
import { classifyOrderState } from './orderstate.js';
import { CodeDelivery } from './CodeDelivery.js';

/**
 * UX 5 — orchestration transactionnelle réelle :
 *  POST /orders (clé d'idempotence stable) → POST /orders/:id/pay →
 *  ouverture du checkout provider (redirect_url) → polling GET /orders/:id →
 *  états processing / pending / preparing / failed / delivered (§16-25).
 * Le frontend ne décide JAMAIS seul du succès : seule la lecture de l'état
 * backend fait avancer la machine.
 */

const RESUME_KEY = 'dg.checkout.resume';

interface ResumeInfo {
  orderId: string;
  offer: Offer;
  phone: string;
}

function readResume(): ResumeInfo | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    return raw ? (JSON.parse(raw) as ResumeInfo) : null;
  } catch {
    return null;
  }
}

function writeResume(info: ResumeInfo | null): void {
  try {
    if (info) sessionStorage.setItem(RESUME_KEY, JSON.stringify(info));
    else sessionStorage.removeItem(RESUME_KEY);
  } catch {
    /* stockage indisponible : reprise désactivée, flux nominal intact */
  }
}

const STEPS_NAV: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Offre' },
  { id: 2, label: 'Paiement' },
  { id: 3, label: 'Confirmation' },
];

function navIndex(step: string): number {
  if (step === 'ENTRY') return 0;
  if (step === 'PLAN_SELECTION' || step === 'PLAN_CONFIRMATION') return 1;
  if (step === 'PAYMENT_METHOD' || step === 'PHONE_INPUT' || step === 'PAYMENT_CONFIRMATION' || step === 'PAYMENT_PROCESSING') return 2;
  return 3;
}

export function Checkout() {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [view, setView] = useState<'journey' | 'tickets'>('journey');

  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

  /** DEV uniquement : le provider factice ne redirige pas, approbation manuelle étiquetée démo. */
  const [devApprove, setDevApprove] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const pollErrors = useRef(0);
  const processingSince = useRef<number | null>(null);

  const loadOffers = async () => {
    setOffersLoading(true);
    setOffersError(null);
    const res = await api<Offer[]>('/offers');
    if (res.ok && res.body) setOffers(res.body);
    else setOffersError(backendUnreachableMessage(res.status, res.body) ?? problemDetail(res.body));
    setOffersLoading(false);
  };

  useEffect(() => {
    void loadOffers();
  }, []);

  /** §24 — reprise après actualisation : transaction déjà créée => on revient en attente. */
  useEffect(() => {
    const info = readResume();
    if (!info) return;
    void (async () => {
      const res = await api<OrderView>(`/orders/${info.orderId}`);
      const cls = res.ok && res.body ? classifyOrderState(res.body.state) : 'UNKNOWN';
      if (cls === 'PENDING' || cls === 'PREPARING') {
        dispatch({ type: 'RESUME', orderId: info.orderId, offer: info.offer, phone: info.phone });
      } else {
        writeResume(null);
      }
    })();
  }, []);

  const applyOrderState = useCallback(
    (orderState: string) => {
      const cls = classifyOrderState(orderState);
      if (cls === 'DELIVERED') {
        writeResume(null);
        dispatch({ type: 'PAYMENT_CONFIRMED', orderId: state.orderId ?? '', paymentId: paymentId ?? '', providerRef: null });
        dispatch({ type: 'TICKET_PREPARING' });
        dispatch({ type: 'TICKET_READY' });
      } else if (cls === 'PREPARING') {
        dispatch({ type: 'PAYMENT_CONFIRMED', orderId: state.orderId ?? '', paymentId: paymentId ?? '', providerRef: null });
        dispatch({ type: 'TICKET_PREPARING' });
      } else if (cls === 'FAILED') {
        writeResume(null);
        dispatch({ type: 'PAYMENT_REFUSED', message: 'Le paiement n’a pas abouti : votre opérateur a refusé la transaction. Aucun montant n’est débité.' });
      } else if (cls === 'CANCELLED') {
        writeResume(null);
        dispatch({ type: 'PAYMENT_REFUSED', message: 'Le paiement a été annulé. Vous pouvez réessayer quand vous voulez.' });
      } else if (cls === 'EXPIRED') {
        writeResume(null);
        dispatch({ type: 'PAYMENT_REFUSED', message: 'La session de paiement a expiré. Relancez le paiement : aucune somme n’est débitée.' });
      }
      // PENDING / UNKNOWN : on continue de vérifier (§18), jamais d'échec déclaré
    },
    [state.orderId, paymentId],
  );

  /** Polling de l'état backend pendant traitement / attente / préparation. */
  useEffect(() => {
    const active =
      state.step === 'PAYMENT_PROCESSING' || state.step === 'PAYMENT_PENDING' || state.step === 'TICKET_DELIVERY';
    if (!active || !state.orderId) return;
    if (state.step === 'PAYMENT_PROCESSING' && processingSince.current === null) {
      processingSince.current = Date.now();
    }
    const tick = async () => {
      const res = await api<OrderView>(`/orders/${state.orderId}`);
      if (!res.ok || !res.body) {
        pollErrors.current += 1;
        if (pollErrors.current >= 3) {
          dispatch({ type: 'TECHNICAL_ERROR', message: 'Nous n’arrivons plus à joindre le service. Vérifiez votre connexion, puis utilisez « Vérifier à nouveau ».' });
        }
        return;
      }
      pollErrors.current = 0;
      if (
        state.step === 'PAYMENT_PROCESSING' &&
        classifyOrderState(res.body.state) === 'PENDING' &&
        processingSince.current !== null &&
        Date.now() - processingSince.current > 20000
      ) {
        dispatch({ type: 'PAYMENT_PENDING_SEEN' });
        return;
      }
      applyOrderState(res.body.state);
    };
    void tick();
    const id = setInterval(() => void tick(), 2500);
    return () => clearInterval(id);
  }, [state.step, state.orderId, applyOrderState]);

  /** §16/25 — lancement réel : commande idempotente puis paiement backend. */
  const launchPayment = async () => {
    if (!state.offer || !state.phone || !state.idempotencyKey) return;
    dispatch({ type: 'LAUNCH_PAYMENT' });
    processingSince.current = null;
    pollErrors.current = 0;
    const orderRes = await api<OrderView>('/orders', {
      method: 'POST',
      body: { offer_id: state.offer.id, customer_phone: state.phone },
      headers: { 'idempotency-key': state.idempotencyKey },
    });
    if (!orderRes.ok || !orderRes.body) {
      dispatch({ type: 'TECHNICAL_ERROR', message: backendUnreachableMessage(orderRes.status, orderRes.body) ?? problemDetail(orderRes.body) });
      return;
    }
    const orderId = orderRes.body.id;
    writeResume({ orderId, offer: state.offer, phone: state.phone });
    const payRes = await api<{ payment_id: string; provider_ref: string; redirect_url: string; replay?: boolean }>(
      `/orders/${orderId}/pay`,
      { method: 'POST' },
    );
    if (!payRes.ok || !payRes.body) {
      if (payRes.status === 409) {
        // déjà payé / en cours : on repolle simplement (§25)
        return;
      }
      dispatch({ type: 'TECHNICAL_ERROR', message: backendUnreachableMessage(payRes.status, payRes.body) ?? problemDetail(payRes.body) });
      return;
    }
    setPaymentId(payRes.body.payment_id);
    // Pour que la machine porte l'orderId, on transite par l'état confirmé uniquement
    // via le polling ; ici on mémorise l'orderId localement pour le polling :
    dispatchOrderId(orderId);
    if (payRes.body.redirect_url && payRes.body.redirect_url.startsWith('http')) {
      // Production : ouverture de la page sécurisée du provider (§16)
      const w = window.open(payRes.body.redirect_url, '_blank', 'noopener');
      if (!w) window.location.href = payRes.body.redirect_url;
    } else {
      setDevApprove(true); // DEV : approbation factice étiquetée démo
    }
  };

  // Le polling lit state.orderId : on le pose via un événement dédié de la machine.
  const dispatchOrderId = (orderId: string) => {
    dispatch({ type: 'ATTACH_ORDER', orderId });
  };

  const approveDev = async () => {
    if (!paymentId) return;
    const res = await api<{ processed?: string }>('/webhooks/dev-approve', {
      method: 'POST',
      body: { payment_id: paymentId },
    });
    if (!res.ok) {
      dispatch({ type: 'TECHNICAL_ERROR', message: problemDetail(res.body) });
    }
    // le polling constate ensuite DELIVERED
  };

  return (
    <div className="checkout">
      <nav className="steps" aria-label="Progression de l’achat">
        {STEPS_NAV.map((s) => {
          const active = view === 'journey' && s.id === navIndex(state.step);
          return (
            <span key={s.id} className={`step ${active ? 'active' : ''}`}>
              <span className="step-num">{s.id}</span> {s.label}
            </span>
          );
        })}
      </nav>

      {view === 'tickets' ? (
        <section className="card journey-card">
          <h2>Mes tickets</h2>
          <div className="card-body">
            <MyTickets />
            <p className="backline">
              <button className="btn ghost" onClick={() => setView('journey')}>Retour à l’accueil</button>
            </p>
          </div>
        </section>
      ) : state.step === 'ENTRY' ? (
        <section className="card journey-card">
          <h2>Bienvenue</h2>
          <div className="card-body stack">
            <h3 className="question">Que souhaitez-vous faire ?</h3>
            <button
              className="btn big"
              onClick={() => {
                setView('journey');
                dispatch({ type: 'START_PURCHASE' });
              }}
            >
              Acheter un accès Wi-Fi
            </button>
            <button className="btn ghost big" onClick={() => dispatch({ type: 'HAS_CODE' })}>
              J’ai déjà un code
            </button>
            {state.message === 'code-portal' ? (
              <p className="hint" role="status">
                Votre code s’utilise directement sur la page de connexion du Wi-Fi
                (portail captif) : saisissez-le y pour activer votre accès.
              </p>
            ) : null}
            <button className="linklike" onClick={() => setView('tickets')}>
              Me connecter pour retrouver mes tickets
            </button>
          </div>
        </section>
      ) : state.step === 'PLAN_SELECTION' ? (
        <section className="card journey-card">
          <h2>Choisissez votre accès Wi-Fi</h2>
          <div className="card-body stack">
            <p className="hint">Sélectionnez le forfait qui correspond à votre besoin.</p>
            {offersLoading ? <p className="hint" role="status">Chargement des offres…</p> : null}
            {!offersLoading && offersError ? (
              <div className="stack">
                <p className="err">{offersError}</p>
                <button className="btn ghost" onClick={() => void loadOffers()}>Réessayer</button>
              </div>
            ) : null}
            <div className="offer-list">
              {offers.map((o) => (
                <div className="offer-card" key={o.id}>
                  <span className="offer-price">{`${o.priceFcfa} FCFA`}</span>
                  <span className="offer-hours">{formatHours(o.accessHours)} d’accès</span>
                  <span className="offer-meta">Wi-Fi Déo Gracias · validité {formatHours(o.validityHours)}</span>
                  <button
                    className="btn"
                    onClick={() =>
                      dispatch({ type: 'SELECT_PLAN', offer: o, idempotencyKey: `dg-${crypto.randomUUID()}` })
                    }
                  >
                    {chooseOfferLabel(o.priceFcfa)}
                  </button>
                </div>
              ))}
            </div>
            <p className="backline">
              <button className="linklike" onClick={() => dispatch({ type: 'RESTART' })}>Retour</button>
            </p>
          </div>
        </section>
      ) : state.step === 'PLAN_CONFIRMATION' && state.offer ? (
        <section className="card journey-card">
          <h2>Votre accès</h2>
          <div className="card-body stack">
            <PlanRecap offer={state.offer} />
            <p className="confirm-line">
              Vous allez payer <strong>{state.offer.priceFcfa} FCFA</strong> pour obtenir{' '}
              <strong>{formatHours(state.offer.accessHours)}</strong> d’accès Wi-Fi.
            </p>
            <p className="hint" role="note">Paiement sécurisé via votre opérateur mobile.</p>
            <button className="btn big" onClick={() => dispatch({ type: 'CONFIRM_PLAN' })}>
              Continuer vers le paiement
            </button>
            <button className="btn ghost" onClick={() => dispatch({ type: 'MODIFY_PLAN' })}>
              Modifier mon choix
            </button>
          </div>
        </section>
      ) : state.step === 'PAYMENT_METHOD' ? (
        <PaymentMethodScreen
          onChoose={() => dispatch({ type: 'CHOOSE_METHOD', method: 'Mobile Money' })}
          onBack={() => dispatch({ type: 'BACK' })}
        />
      ) : state.step === 'PHONE_INPUT' ? (
        <PhoneScreen
          onBack={() => dispatch({ type: 'BACK' })}
          onSubmit={(phone) => dispatch({ type: 'SUBMIT_PHONE', phone })}
        />
      ) : state.step === 'PAYMENT_CONFIRMATION' && state.offer ? (
        <section className="card journey-card">
          <h2>Confirmez votre paiement</h2>
          <div className="card-body stack">
            <ul className="kv">
              <li><span>Forfait</span><strong>{formatHours(state.offer.accessHours)}</strong></li>
              <li><span>Paiement</span><strong>{state.method ?? 'Mobile Money'}</strong></li>
              <li><span>Numéro</span><strong>{maskPhone(state.phone)}</strong></li>
              <li><span>Total</span><strong>{`${state.offer.priceFcfa} FCFA`}</strong></li>
            </ul>
            <button className="btn big" onClick={() => void launchPayment()}>
              {payCtaLabel(state.offer.priceFcfa)}
            </button>
            <p className="hint" role="note">Paiement sécurisé via votre opérateur mobile.</p>
            <button className="btn ghost" onClick={() => dispatch({ type: 'BACK' })}>
              Modifier le numéro ou le moyen
            </button>
          </div>
        </section>
      ) : state.step === 'PAYMENT_PROCESSING' ? (
        <section className="card journey-card">
          <h2>Paiement en cours</h2>
          <div className="card-body stack">
            <div className="spinner" aria-hidden="true" />
            <p className="confirm-line" role="status">Nous vérifions votre paiement. Ne fermez pas cette page.</p>
            <ul className="kv">
              <li><span>Montant</span><strong>{state.offer ? `${state.offer.priceFcfa} FCFA` : ''}</strong></li>
              <li><span>Paiement</span><strong>{state.method ?? 'Mobile Money'}</strong></li>
              <li><span>Numéro</span><strong>{maskPhone(state.phone)}</strong></li>
            </ul>
            {devApprove ? (
              <div className="dev-banner">
                <p className="hint">Mode démo : aucun prestataire réel n’est connecté.</p>
                <button className="btn ghost" onClick={() => void approveDev()}>
                  Confirmer le paiement (démo)
                </button>
              </div>
            ) : (
              <p className="hint">Validez le paiement sur la page sécurisée de votre opérateur, puis revenez ici.</p>
            )}
          </div>
        </section>
      ) : state.step === 'PAYMENT_PENDING' ? (
        <section className="card journey-card">
          <h2>Paiement en attente</h2>
          <div className="card-body stack">
            <p className="confirm-line" role="status">
              Votre paiement n’est pas encore confirmé. Nous continuons de vérifier.
            </p>
            {devApprove ? (
              <div className="dev-banner">
                <p className="hint">Mode démo : confirmez pour poursuivre.</p>
                <button className="btn ghost" onClick={() => void approveDev()}>
                  Confirmer le paiement (démo)
                </button>
              </div>
            ) : null}
            <button className="btn big" onClick={() => { if (state.orderId) void applyOrderStateNow(); }}>
              Vérifier à nouveau
            </button>
            <button className="btn ghost" onClick={() => { writeResume(null); dispatch({ type: 'RESTART' }); }}>
              Retourner à l’accueil
            </button>
          </div>
        </section>
      ) : state.step === 'PAYMENT_FAILED' ? (
        <section className="card journey-card">
          <h2>Le paiement n’a pas abouti</h2>
          <div className="card-body stack">
            <p className="err" role="alert">{state.message ?? 'Nous n’avons pas pu confirmer votre paiement.'}</p>
            <button className="btn big" onClick={() => dispatch({ type: 'RETRY_PAYMENT' })}>
              Réessayer le paiement
            </button>
            <button className="btn ghost" onClick={() => dispatch({ type: 'RESTART' })}>
              Choisir une autre offre
            </button>
          </div>
        </section>
      ) : state.step === 'ERROR' ? (
        <section className="card journey-card">
          <h2>Un problème technique est survenu</h2>
          <div className="card-body stack">
            <p className="err" role="alert">{state.message ?? 'Le service ne répond pas.'}</p>
            <button className="btn big" onClick={() => dispatch({ type: 'RETRY_PAYMENT' })}>
              Réessayer le paiement
            </button>
            <button className="btn ghost" onClick={() => { writeResume(null); dispatch({ type: 'RESTART' }); }}>
              Recommencer
            </button>
          </div>
        </section>
      ) : state.step === 'PAYMENT_SUCCESS' || state.step === 'TICKET_DELIVERY' ? (
        <section className="card journey-card">
          <h2>Paiement réussi</h2>
          <div className="card-body stack">
            <p className="ok" role="status">Votre accès Wi-Fi est en cours de préparation.</p>
            {state.offer ? <PlanRecap offer={state.offer} /> : null}
            <div className="spinner" aria-hidden="true" />
            <p className="hint">Nous finalisons votre code Wi-Fi. Aucun second paiement n’est nécessaire.</p>
          </div>
        </section>
      ) : (
        <section className="card journey-card">
          <h2>Paiement réussi — votre code Wi-Fi</h2>
          <div className="card-body stack">
            {state.offer ? <PlanRecap offer={state.offer} /> : null}
            <CodeDelivery phone={state.phone} offer={state.offer} />
            <button className="btn ghost" onClick={() => dispatch({ type: 'RESTART' })}>Retour à l’accueil</button>
          </div>
        </section>
      )}
    </div>
  );

  async function applyOrderStateNow() {
    if (!state.orderId) return;
    const res = await api<OrderView>(`/orders/${state.orderId}`);
    if (res.ok && res.body) applyOrderState(res.body.state);
  }
}

/** UX 4 — §12 : un seul moyen configuré (Mobile Money via FedaPay, D-UX4). */
function PaymentMethodScreen({ onChoose, onBack }: { onChoose: () => void; onBack: () => void }) {
  return (
    <section className="card journey-card">
      <h2>Comment souhaitez-vous payer ?</h2>
      <div className="card-body stack">
        <button className="method-card" onClick={onChoose}>
          <span className="offer-hours">Mobile Money</span>
          <span className="offer-meta">Paiement sécurisé via votre opérateur mobile</span>
          <span className="method-ops" aria-hidden="true">
            <span className="badge op-mtn">MTN</span>
            <span className="badge op-moov">Moov</span>
            <span className="badge op-celtiis">Celtiis</span>
          </span>
          <span className="btn big">Payer avec Mobile Money</span>
        </button>
        <p className="hint" role="note">Votre opérateur exact se choisit sur la page sécurisée du paiement.</p>
        <button className="btn ghost" onClick={onBack}>Revenir à mon forfait</button>
      </div>
    </section>
  );
}

/** UX 4 — §13/14 : format attendu, validation immédiate, messages humains. */
function PhoneScreen({ onSubmit, onBack }: { onSubmit: (phone: string) => void; onBack: () => void }) {
  const [value, setValue] = useState('');
  const check = validateCustomerPhone(value);
  const touched = value.length > 0;
  return (
    <section className="card journey-card">
      <h2>Entrez votre numéro</h2>
      <div className="card-body stack">
        <p className="hint">Paiement : Mobile Money — le numéro servira à recevoir votre accès.</p>
        <label className="field-label" htmlFor="phone">Numéro</label>
        <input
          id="phone"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="01 XX XX XX XX"
          inputMode="tel"
          autoComplete="tel"
          aria-describedby="phone-help"
          aria-invalid={touched && !check.ok}
        />
        <p id="phone-help" className={touched && check.ok ? 'ok' : 'hint'} role="status">
          {touched
            ? check.ok
              ? '✓ Numéro valide'
              : check.message
            : 'Format attendu : 01 XX XX XX XX (10 chiffres).'}
        </p>
        <button
          className="btn big"
          disabled={!check.ok}
          onClick={() => {
            if (check.ok) onSubmit(check.normalized);
          }}
        >
          Vérifier mon numéro
        </button>
        <button className="btn ghost" onClick={onBack}>Changer de moyen de paiement</button>
      </div>
    </section>
  );
}
