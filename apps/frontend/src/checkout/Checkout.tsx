import { useEffect, useReducer, useState } from 'react';
import { api, type Offer } from '../api.js';
import {
  backendUnreachableMessage,
  chooseOfferLabel,
  formatHours,
  problemDetail,
} from '../format.js';
import { checkoutReducer, initialCheckoutState } from './machine.js';
import { MyTickets } from './MyTickets.js';

/**
 * UX 2 — Entrée du parcours + sélection du forfait, branchés sur la machine
 * à états (UX 1). Une seule question à la fois (§02), mobile first (§27),
 * tokens existants uniquement (§29).
 * La confirmation complète arrive en UX 3 ; l'écran de confirmation affiché
 * ici est provisoire (retour fonctionnel, suite verrouillée « étape suivante »).
 */

const STEPS_NAV: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Offre' },
  { id: 2, label: 'Paiement' },
  { id: 3, label: 'Confirmation' },
];

function navIndex(step: string): number {
  if (step === 'ENTRY') return 0;
  if (step === 'PLAN_SELECTION' || step === 'PLAN_CONFIRMATION') return 1;
  return 2;
}

export function Checkout() {
  const [state, dispatch] = useReducer(checkoutReducer, initialCheckoutState);
  const [view, setView] = useState<'journey' | 'tickets'>('journey');

  const [offers, setOffers] = useState<Offer[]>([]);
  const [offersLoading, setOffersLoading] = useState(true);
  const [offersError, setOffersError] = useState<string | null>(null);

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
            <button
              className="btn ghost big"
              onClick={() => dispatch({ type: 'HAS_CODE' })}
            >
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
      ) : state.step === 'PLAN_CONFIRMATION' ? (
        <section className="card journey-card">
          <h2>Votre accès</h2>
          <div className="card-body stack">
            <div className="recap">
              <span className="offer-price">{state.offer ? `${state.offer.priceFcfa} FCFA` : ''}</span>
              <span className="offer-hours">{state.offer ? formatHours(state.offer.accessHours) : ''}</span>
            </div>
            <p>
              Vous allez payer <strong>{state.offer ? `${state.offer.priceFcfa} FCFA` : ''}</strong> pour obtenir{' '}
              <strong>{state.offer ? formatHours(state.offer.accessHours) : ''}</strong> d’accès Wi-Fi.
            </p>
            <button className="btn big" disabled title="Étape suivante (UX 3)">
              Continuer vers le paiement
            </button>
            <p className="hint">La confirmation complète (paiement) arrive à l’étape UX 3.</p>
            <button className="btn ghost" onClick={() => dispatch({ type: 'MODIFY_PLAN' })}>
              Modifier mon choix
            </button>
          </div>
        </section>
      ) : (
        <section className="card journey-card">
          <h2>Étape suivante</h2>
          <div className="card-body stack">
            <p className="hint">Cette étape sera livrée dans l’itération suivante.</p>
            <button className="btn ghost" onClick={() => dispatch({ type: 'RESTART' })}>Recommencer</button>
          </div>
        </section>
      )}
    </div>
  );
}
