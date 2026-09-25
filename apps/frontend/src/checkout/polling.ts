/**
 * IMP-27 — politique de vérification frontend.
 *
 * Le navigateur ne confirme jamais un paiement : il relit uniquement GET
 * /orders/:id, dont l'état est produit par le backend/webhook. Les délais
 * sont bornés pour éviter les requêtes infinies et le timeout est une pause
 * de reconciliation, jamais une preuve d'échec ou de succès.
 */

export const POLL_TIMEOUT_MS = 120_000;
export const POLL_MAX_DELAY_MS = 12_000;
export const POLL_MAX_NETWORK_ERRORS = 3;

/** Délai après la première lecture immédiate : 1, 2, 4, 8, puis 12 secondes. */
export function nextPollDelayMs(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt < 0) return 1_000;
  return Math.min(POLL_MAX_DELAY_MS, 1_000 * 2 ** Math.floor(attempt));
}

export function pollTimedOut(startedAt: number, now = Date.now()): boolean {
  return now - startedAt >= POLL_TIMEOUT_MS;
}

export const RECONCILIATION_TIMEOUT_MESSAGE =
  'La confirmation prend plus de temps que prévu. Nous ne relançons pas le paiement : vérifiez à nouveau pour relire l’état du serveur.';

export const RECONCILIATION_NETWORK_MESSAGE =
  'La connexion au service est momentanément interrompue. Aucun nouveau paiement n’a été lancé : vérifiez à nouveau.';

export const UNKNOWN_ORDER_STATE_MESSAGE =
  'Nous avons reçu un état inhabituel. Nous vérifions encore avec le serveur.';
