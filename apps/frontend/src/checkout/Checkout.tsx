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
import {
  nextPollDelayMs,
  POLL_MAX_NETWORK_ERRORS,
  pollTimedOut,
  RECONCILIATION_NETWORK_MESSAGE,
  RECONCILIATION_TIMEOUT_MESSAGE,
  UNKNOWN_ORDER_STATE_MESSAGE,
} from './polling.js';

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
  paymentId: string | null;
  providerRef: string | null;
}

function readResume(): ResumeInfo | null {
  try {
    const raw = sessionStorage.getItem(RESUME_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ResumeInfo>;
    if (typeof value.orderId !== 'string' || !value.offer || typeof value.phone !== 'string') return null;
    return {
      orderId: value.orderId,
      offer: value.offer,
      phone: value.phone,
      paymentId: typeof value.paymentId === 'string' ? value.paymentId : null,
      providerRef: typeof value.providerRef === 'string' ? value.providerRef : null,
    };
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

/** Recompose l'offre depuis le snapshot backend lors d'une reprise.
 * Le fallback sessionStorage sert seulement à garder l'écran utilisable si une
 * ancienne commande ne contient pas encore tous les champs de compatibilité. */
function offerFromOrder(order: OrderView, fallback: Offer): Offer {
  const snapshot = order.plan_snapshot ?? {};
  const number = (key: string, otherwise: number): number =>
    typeof snapshot[key] === 'number' ? snapshot[key] as number : otherwise;
  const text = (key: string, otherwise: string): string =>
    typeof snapshot[key] === 'string' ? snapshot[key] as string : otherwise;
  return {
    id: order.offer_id ?? text('offer_id', fallback.id),
    priceFcfa: number('price_snapshot', fallback.priceFcfa),
    accessHours: number('access_duration_snapshot', fallback.accessHours),
    validityHours: number('validity_duration_snapshot', fallback.validityHours),
    mikrotikProfile: text('mikrotik_profile', fallback.mikrotikProfile),
    limitUptime: text('limit_uptime', fallback.limitUptime),
  };
}

interface PaymentInitResponse {
  order_id?: string;
  order_reference?: string;
  payment_id?: string | null;
  provider_ref?: string | null;
  redirect_url?: string | null;
  payment_state?: string | null;
  order_state?: string;
  replay?: boolean;
}

export function Checkout() {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [view, setView] = useState<'journey' | 'tickets'>('journey');

  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

  /** DEV uniquement : le provider factice ne redirige pas, approbation manuelle étiquetée démo. */
  const [devApprove, setDevApprove] = useState(false);
  const launchingPayment = useRef(false);
  const pollSession = useRef<{ orderId: string; startedAt: number; attempt: number; networkErrors: number; stopped: boolean } | null>(null);
  const [verifyBusy, setVerifyBusy] = useState(false);

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

  /** §24 — reprise après actualisation : la commande et les identifiants
   * viennent du backend ; le snapshot de session ne décide ni du prix ni du succès. */
  useEffect(() => {
    const info = readResume();
    if (!info) return;
    void (async () => {
      const res = await api<OrderView>(`/orders/${info.orderId}`);
      if (!res.ok || !res.body) return;
      const cls = classifyOrderState(res.body.state);
      if (cls === 'PENDING' || cls === 'PREPARING' || cls === 'DELIVERED' || cls === 'UNKNOWN') {
        const offer = offerFromOrder(res.body, info.offer);
        const paymentId = res.body.payment?.id ?? info.paymentId;
        const providerRef = res.body.payment?.provider_ref ?? info.providerRef;
        setDevApprove(providerRef?.startsWith('DEV-') === true);
        writeResume({ orderId: info.orderId, offer, phone: info.phone, paymentId, providerRef });
        dispatch({ type: 'RESUME', orderId: info.orderId, offer, phone: info.phone, paymentId, providerRef });
      } else {
        writeResume(null);
      }
    })();
  }, []);

  const applyOrderState = useCallback(
    (order: OrderView) => {
      const cls = classifyOrderState(order.state);
      const orderId = order.id;
      const paymentId = order.payment?.id ?? state.paymentId ?? '';
      const providerRef = order.payment?.provider_ref ?? state.providerRef;

      if (order.payment) {
        // Persist these values even when the backend answers 409/replay; they
        // are correlation data, not a client-side payment confirmation.
        dispatch({ type: 'ATTACH_PAYMENT', orderId, paymentId: order.payment.id, providerRef });
        if (state.offer) writeResume({ orderId, offer: state.offer, phone: state.phone, paymentId: order.payment.id, providerRef });
      }

      if (cls === 'PENDING') {
        if (state.step === 'PAYMENT_PROCESSING') dispatch({ type: 'PAYMENT_PENDING_SEEN' });
        return;
      }
      if (cls === 'UNKNOWN') {
        if (state.message !== UNKNOWN_ORDER_STATE_MESSAGE) {
          dispatch({ type: 'ORDER_STATE_UNKNOWN', message: UNKNOWN_ORDER_STATE_MESSAGE });
        }
        return;
      }
      if (cls === 'DELIVERED') {
        writeResume(null);
        if (state.step === 'TICKET_DELIVERY') {
          dispatch({ type: 'TICKET_READY' });
        } else if (state.step === 'PAYMENT_PROCESSING' || state.step === 'PAYMENT_PENDING') {
          // These transitions are driven only by the authoritative backend
          // state; the frontend never infers payment success from a redirect.
          dispatch({ type: 'PAYMENT_CONFIRMED', orderId, paymentId, providerRef });
          dispatch({ type: 'TICKET_PREPARING' });
          dispatch({ type: 'TICKET_READY' });
        }
      } else if (cls === 'PREPARING') {
        if (state.step === 'PAYMENT_PROCESSING' || state.step === 'PAYMENT_PENDING') {
          dispatch({ type: 'PAYMENT_CONFIRMED', orderId, paymentId, providerRef });
          dispatch({ type: 'TICKET_PREPARING' });
        }
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
    },
    [state.message, state.offer, state.orderId, state.paymentId, state.phone, state.providerRef, state.step],
  );

  /**
   * Reconciliation bornée : lecture immédiate, puis backoff 1/2/4/8/12 s,
   * timeout 120 s. Une erreur réseau ou un état inconnu reste une attente ;
   * seul l'état explicite lu depuis le backend peut faire avancer la machine.
   */
  useEffect(() => {
    const active =
      state.step === 'PAYMENT_PROCESSING' || state.step === 'PAYMENT_PENDING' || state.step === 'TICKET_DELIVERY';
    if (!active || !state.orderId) return;

    if (!pollSession.current || pollSession.current.orderId !== state.orderId) {
      pollSession.current = { orderId: state.orderId, startedAt: Date.now(), attempt: 0, networkErrors: 0, stopped: false };
    }
    const session = pollSession.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = () => {
      if (cancelled || session.stopped) return;
      const delay = nextPollDelayMs(session.attempt);
      session.attempt += 1;
      timer = setTimeout(() => void tick(), delay);
    };

    const tick = async () => {
      if (cancelled || session.stopped) return;
      if (pollTimedOut(session.startedAt)) {
        session.stopped = true;
        dispatch({ type: 'PAYMENT_PENDING_SEEN', message: RECONCILIATION_TIMEOUT_MESSAGE });
        return;
      }
      const res = await api<OrderView>(`/orders/${state.orderId}`);
      if (cancelled || session.stopped) return;
      if (!res.ok || !res.body) {
        session.networkErrors += 1;
        if (session.networkErrors >= POLL_MAX_NETWORK_ERRORS) {
          session.stopped = true;
          dispatch({ type: 'PAYMENT_PENDING_SEEN', message: RECONCILIATION_NETWORK_MESSAGE });
          return;
        }
        schedule();
        return;
      }
      session.networkErrors = 0;
      applyOrderState(res.body);
      const cls = classifyOrderState(res.body.state);
      if (cls === 'FAILED' || cls === 'CANCELLED' || cls === 'EXPIRED' || cls === 'DELIVERED') {
        session.stopped = true;
        return;
      }
      schedule();
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer !== null) clearTimeout(timer);
    };
  }, [state.orderId, state.step, applyOrderState]);

  /** §16/25 — commande idempotente puis paiement backend. */
  const launchPayment = async () => {
    if (launchingPayment.current || !state.offer || !state.phone || !state.idempotencyKey) return;
    launchingPayment.current = true;
    let keepLock = false;
    dispatch({ type: 'LAUNCH_PAYMENT' });
    const offer = state.offer;
    const phone = state.phone;
    try {
      const orderRes = await api<OrderView>('/orders', {
        method: 'POST',
        body: { offer_id: offer.id, customer_phone: phone },
        headers: { 'idempotency-key': state.idempotencyKey },
      });
      if (!orderRes.ok || !orderRes.body) {
        dispatch({ type: 'TECHNICAL_ERROR', message: backendUnreachableMessage(orderRes.status, orderRes.body) ?? problemDetail(orderRes.body) });
        return;
      }
      const order = orderRes.body;
      const orderId = order.id;
      const resumedOffer = offerFromOrder(order, offer);
      writeResume({ orderId, offer: resumedOffer, phone, paymentId: order.payment?.id ?? null, providerRef: order.payment?.provider_ref ?? null });
      dispatch({ type: 'ATTACH_ORDER', orderId });

      const payRes = await api<PaymentInitResponse>(`/orders/${orderId}/pay`, { method: 'POST' });
      const payBody = payRes.body;
      if (payRes.status === 409) {
        // Reprise explicite du chemin HTTP 409 : rattacher la commande ET
        // conserver les identifiants avant de relire GET /orders/:id.
        const paymentId = payBody?.payment_id ?? order.payment?.id ?? null;
        const providerRef = payBody?.provider_ref ?? order.payment?.provider_ref ?? null;
        dispatch({ type: 'ATTACH_PAYMENT', orderId, paymentId, providerRef });
        writeResume({ orderId, offer: resumedOffer, phone, paymentId, providerRef });
        setDevApprove(providerRef?.startsWith('DEV-') === true);
        keepLock = true;
        return;
      }
      if (!payRes.ok || !payBody || !payBody.payment_id) {
        dispatch({ type: 'TECHNICAL_ERROR', message: backendUnreachableMessage(payRes.status, payBody) ?? problemDetail(payBody) });
        return;
      }
      const paymentId = payBody.payment_id;
      const providerRef = payBody.provider_ref ?? null;
      dispatch({ type: 'ATTACH_PAYMENT', orderId, paymentId, providerRef });
      writeResume({ orderId, offer: resumedOffer, phone, paymentId, providerRef });
      setDevApprove(providerRef?.startsWith('DEV-') === true);
      keepLock = true;
      if (payBody.redirect_url && payBody.redirect_url.startsWith('http')) {
        // Production : ouverture de la page sécurisée du provider (§16).
        const w = window.open(payBody.redirect_url, '_blank', 'noopener');
        if (!w) window.location.href = payBody.redirect_url;
      }
    } finally {
      if (!keepLock) launchingPayment.current = false;
    }
  };

  const approveDev = async () => {
    if (!state.paymentId) return;
    const res = await api<{ processed?: string }>('/webhooks/dev-approve', {
      method: 'POST',
      body: { payment_id: state.paymentId },
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
            {state.orderId ? <p className="hint">Référence commande : <strong>{state.orderId}</strong></p> : null}
            <ul className="kv">
              <li><span>Montant</span><strong>{state.offer ? `${state.offer.priceFcfa} FCFA` : ''}</strong></li>
              <li><span>Paiement</span><strong>{state.method ?? 'Mobile Money'}</strong></li>
              <li><span>Numéro</span><strong>{maskPhone(state.phone)}</strong></li>
            </ul>
            {devApprove ? (
              <div className="dev-banner">
                <p className="hint">Mode démo : aucun prestataire réel n’est connecté.</p>
                <button className="btn ghost" onClick={() => void approveDev()}>
                  Simuler le webhook backend (démo)
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
              {state.message ?? 'Votre paiement n’est pas encore confirmé. Nous continuons de vérifier.'}
            </p>
            {state.orderId ? <p className="hint">Référence commande : <strong>{state.orderId}</strong></p> : null}
            {devApprove ? (
              <div className="dev-banner">
                <p className="hint">Mode démo : confirmez pour poursuivre.</p>
                <button className="btn ghost" onClick={() => void approveDev()}>
                  Simuler le webhook backend (démo)
                </button>
              </div>
            ) : null}
            <button className="btn big" disabled={verifyBusy} onClick={() => void applyOrderStateNow()}>
              {verifyBusy ? 'Vérification…' : 'Vérifier à nouveau'}
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
            {state.orderId ? <p className="hint">Référence commande : <strong>{state.orderId}</strong></p> : null}
            {state.offer ? <PlanRecap offer={state.offer} /> : null}
            <div className="spinner" aria-hidden="true" />
            <p className="hint">Nous finalisons votre code Wi-Fi. Aucun second paiement n’est nécessaire.</p>
          </div>
        </section>
      ) : (
        <section className="card journey-card">
          <h2>Paiement réussi — votre code Wi-Fi</h2>
          <div className="card-body stack">
            {state.orderId ? <p className="hint">Référence commande : <strong>{state.orderId}</strong></p> : null}
            {state.offer ? <PlanRecap offer={state.offer} /> : null}
            <CodeDelivery phone={state.phone} offer={state.offer} orderId={state.orderId} />
            <button className="btn ghost" onClick={() => dispatch({ type: 'RESTART' })}>Retour à l’accueil</button>
          </div>
        </section>
      )}
    </div>
  );

  async function applyOrderStateNow() {
    if (!state.orderId || verifyBusy) return;
    setVerifyBusy(true);
    if (pollSession.current) pollSession.current.stopped = true;
    pollSession.current = null;
    dispatch({ type: 'RECONCILIATION_RETRY' });
    try {
      const res = await api<OrderView>(`/orders/${state.orderId}`);
      if (res.ok && res.body) applyOrderState(res.body);
      else dispatch({ type: 'PAYMENT_PENDING_SEEN', message: RECONCILIATION_NETWORK_MESSAGE });
    } finally {
      setVerifyBusy(false);
    }
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
