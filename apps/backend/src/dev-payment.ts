/**
 * IMP-25 — Paiement factice pour la DÉMO VISUELLE LOCALE (budget nul).
 *
 * `DevPaymentProvider` implémente le même contrat que FedaPayClient mais ne
 * contacte aucun prestataire : le checkout retourne une référence `DEV-…` et
 * l'approbation passe par la route `POST /webhooks/dev-approve` (montée par
 * app.ts UNIQUEMENT quand `payment.devMode` est vrai — server.ts ne l'active
 * que si PAYMENT_DEV_MODE=1 ET aucune FEDAPAY_SECRET_KEY n'est définie).
 *
 * JAMAIS en production : la preuve de paiement réelle reste le webhook FedaPay
 * signé (doc 06 §17).
 */
import { randomUUID } from 'node:crypto';
import type { CheckoutInput, CheckoutResult, PaymentProvider } from './fedapay.js';

export class DevPaymentProvider implements PaymentProvider {
  async createCheckout(_input: CheckoutInput): Promise<CheckoutResult> {
    return {
      providerRef: `DEV-${randomUUID().slice(0, 8)}`,
      // Pas de redirection externe : la SPA affiche le bouton d'approbation.
      redirectUrl: '#dev-approve',
    };
  }
}
