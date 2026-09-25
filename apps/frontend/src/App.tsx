import { useEffect, useState } from 'react';
import { Admin } from './pages/Admin.js';
import { Checkout } from './checkout/Checkout.js';

/** Routage minimal par hash : #/ (public) et #/admin. */
function useRoute(): 'accueil' | 'admin' {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return hash.startsWith('#/admin') ? 'admin' : 'accueil';
}

export function App() {
  const route = useRoute();
  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#/">
          <img className="brand-logo" src="/logo.png" alt="Logo Déo Gracias Wi-Fi" />
          Déo Gracias Wi-Fi
        </a>
        <nav className="nav">
          <a href="#/" className={route === 'accueil' ? 'active' : ''}>Espace client</a>
          <a href="#/admin" className={route === 'admin' ? 'active' : ''}>Administration</a>
        </nav>
      </header>
      <main className="content">
        {route === 'admin' ? <Admin /> : <Checkout />}
      </main>
      <footer className="footer">Merci pour votre confiance — Déo Gracias Wi-Fi</footer>
    </div>
  );
}
