import { useEffect, useState } from 'react';
import { Admin } from './pages/Admin.js';
import { Accueil } from './pages/Accueil.js';

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
          <span className="brand-dot" aria-hidden="true" />
          Déo Gracias Wi-Fi
        </a>
        <nav className="nav">
          <a href="#/" className={route === 'accueil' ? 'active' : ''}>Espace client</a>
          <a href="#/admin" className={route === 'admin' ? 'active' : ''}>Administration</a>
        </nav>
      </header>
      <main className="content">
        {route === 'admin' ? <Admin /> : <Accueil />}
      </main>
      <footer className="footer">
        Démo locale IMP-25 — backend réel (Postgres), paiements et auth admin en mode DEV.
      </footer>
    </div>
  );
}
