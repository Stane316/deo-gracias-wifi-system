/**
 * IMP-25 — Helpers de formatage purs (testés sans DOM).
 */

/** Prix en FCFA, sans décimales : 500 => « 500 F », 1500 => « 1 500 F ». */
export function formatFcfa(amount: number): string {
  const entier = Math.round(amount);
  const groupes = String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f');
  return `${entier < 0 ? '-' : ''}${groupes}\u202fF`;
}

/** Durée lisible à partir d'heures entières : 5 => « 5 h », 24 => « 24 h ». */
export function formatHours(hours: number): string {
  return `${hours}\u202fh`;
}

/** Date ISO -> « 24/09/2026 14:05 » (fuseau local). */
export function formatDateTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** IMP-25.4 — le backend est-il injoignable (proxy en erreur, corps non-JSON) ? */
export function backendUnreachableMessage(status: number, body: unknown): string | null {
  if (body !== null) return null; // réponse structurée => message porté par problemDetail
  if (status === 0 || status >= 500) {
    return 'Backend injoignable : démarrez-le avec « npm run start -w @dg/backend » puis rechargez (GUIDE-09 §3).';
  }
  return null;
}

/** Extrait le message d'un problème RFC 7807 ou d'une réponse quelconque. */
export function problemDetail(body: unknown): string {
  if (body && typeof body === 'object') {
    const detail = (body as Record<string, unknown>)['detail'];
    if (typeof detail === 'string' && detail.length > 0) return detail;
    const title = (body as Record<string, unknown>)['title'];
    if (typeof title === 'string' && title.length > 0) return title;
  }
  return 'Erreur inattendue';
}
