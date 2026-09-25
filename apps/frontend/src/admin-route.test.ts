import { describe, expect, it } from 'vitest';
import { appRoute } from './admin-route.js';

describe('IMP-29 — routage admin et route guard', () => {
  it('reconnaît les URLs canoniques login et dashboard', () => {
    expect(appRoute('/admin/login')).toBe('admin-login');
    expect(appRoute('/admin/login/')).toBe('admin-login');
    expect(appRoute('/admin')).toBe('admin');
    expect(appRoute('/admin/')).toBe('admin');
  });

  it('conserve les liens hash historiques sans les traiter comme une sécurité', () => {
    expect(appRoute('/', '#/admin/login')).toBe('admin-login');
    expect(appRoute('/', '#/admin')).toBe('admin');
    expect(appRoute('/', '#/')).toBe('accueil');
  });

  it('laisse les routes publiques hors espace admin', () => {
    expect(appRoute('/')).toBe('accueil');
    expect(appRoute('/checkout')).toBe('accueil');
    expect(appRoute('/administer')).toBe('accueil');
  });

  it('privilégie le chemin canonique sur un hash contradictoire', () => {
    expect(appRoute('/admin/login', '#/')).toBe('admin-login');
    expect(appRoute('/admin', '#/')).toBe('admin');
    expect(appRoute('/', '#/admin')).toBe('admin');
  });
});
