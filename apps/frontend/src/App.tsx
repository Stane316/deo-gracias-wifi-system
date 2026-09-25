import { useEffect, useState } from 'react';
import { Admin } from './pages/Admin.js';
import { Checkout } from './checkout/Checkout.js';
import { appRoute, type AppRoute } from './admin-route.js';

function useRoute(): AppRoute {
  const [route, setRoute] = useState<AppRoute>(() => appRoute(window.location.pathname, window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(appRoute(window.location.pathname, window.location.hash));
    window.addEventListener('hashchange', onChange);
    window.addEventListener('popstate', onChange);
    return () => {
      window.removeEventListener('hashchange', onChange);
      window.removeEventListener('popstate', onChange);
    };
  }, []);
  return route;
}

export function App() {
  const route = useRoute();
  const admin = route === 'admin' || route === 'admin-login';
  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="/">
          <img className="brand-logo" src="/logo.png" alt="Logo Déo Gracias Wi-Fi" />
          Déo Gracias Wi-Fi
        </a>
        <nav className="nav" aria-label="Navigation principale">
          <a href="/" className={route === 'accueil' ? 'active' : ''}>Espace client</a>
          <a href="/admin/login" className={admin ? 'active' : ''}>Administration</a>
        </nav>
      </header>
      <main className="content">
        {admin ? <Admin /> : <Checkout />}
      </main>
      <footer className="footer">Merci pour votre confiance — Déo Gracias Wi-Fi</footer>
    </div>
  );
}
