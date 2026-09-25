export type AppRoute = 'accueil' | 'admin-login' | 'admin';

function normalizedPath(pathname: string): string {
  if (pathname.length > 1) return pathname.replace(/\/+$/, '');
  return pathname || '/';
}

/**
 * IMP-29 — routes publiques et admin sans faire de l'interface une frontière
 * de sécurité : les API restent toujours protégées côté backend.
 */
export function appRoute(pathname: string, hash = ''): AppRoute {
  const path = normalizedPath(pathname);
  if (path === '/admin/login' || path.startsWith('/admin/login/')) return 'admin-login';
  if (path === '/admin' || path.startsWith('/admin/')) return 'admin';

  // Compatibilité avec les liens hash de la démo IMP-25/27. Une navigation
  // vers la page admin remplace ensuite ce hash par une URL canonique.
  const legacy = hash.replace(/^#/, '').replace(/\/+$/, '') || '/';
  if (legacy === '/admin/login' || legacy.startsWith('/admin/login/')) return 'admin-login';
  if (legacy === '/admin' || legacy.startsWith('/admin/')) return 'admin';
  return 'accueil';
}

export function replaceBrowserPath(path: '/admin/login' | '/admin'): void {
  if (typeof window === 'undefined') return;
  if (window.location.pathname !== path || window.location.hash !== '') {
    window.history.replaceState(null, '', path);
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
}
