import { z } from 'zod';

/**
 * GRILLE A OFFICIELLE (décision propriétaire, docs 03/05) — source unique de vérité.
 * Toute divergence ailleurs dans le codebase est un bug de revue.
 * Accès = durée cumulative (limit-uptime MikroTik) ; Validité = fenêtre d'expiration
 * appliquée par les moniteurs du routeur (contrat Mikmon §5).
 */
export const OFFERS = [
  {
    id: '5-HEURES',
    priceFcfa: 100,
    accessHours: 5,
    validityHours: 24,
    mikrotikProfile: '5-HEURES',
    limitUptime: '05:00:00',
  },
  {
    id: '12-HEURES',
    priceFcfa: 200,
    accessHours: 12,
    validityHours: 24,
    mikrotikProfile: '12-HEURES',
    limitUptime: '12:00:00',
  },
  {
    id: '24-HEURES',
    priceFcfa: 300,
    accessHours: 24,
    validityHours: 48,
    mikrotikProfile: '24-HEURES',
    limitUptime: '1d00:00:00',
  },
  {
    id: '72-HEURES',
    priceFcfa: 500,
    accessHours: 72,
    validityHours: 120,
    mikrotikProfile: '72-HEURES',
    limitUptime: '3d00:00:00',
  },
  {
    id: '1-SEMAINE',
    priceFcfa: 1000,
    accessHours: 168,
    validityHours: 240,
    mikrotikProfile: '1-SEMAINE',
    limitUptime: '7d00:00:00',
  },
  {
    id: '1-MOIS',
    priceFcfa: 4000,
    accessHours: 720,
    validityHours: 960,
    mikrotikProfile: '1-MOIS',
    limitUptime: '40d00:00:00',
  },
] as const;

export type Offer = (typeof OFFERS)[number];
export type OfferId = Offer['id'];

export const offerSchema = z.object({
  id: z.string(),
  priceFcfa: z.number().int().positive(),
  accessHours: z.number().int().positive(),
  validityHours: z.number().int().positive(),
  mikrotikProfile: z.string(),
  // Formats RouterOS observés : « HH:MM:SS » ou « DdHH:MM:SS » (ex. 05:00:00, 1d00:00:00, 40d00:00:00)
  limitUptime: z.string().regex(/^(\d+d)?\d{2}:\d{2}:\d{2}$/),
});

/**
 * États du cycle de vie d'un ticket CÔTÉ ROUTEUR (contrat Mikmon §2).
 * EXPIRED_REMOVED : le routeur SUPPRIME le ticket à expiration (moniteurs ~2,5 min).
 * ADMIN_FREE_LEGACY : accès gratuits hérités de l'admin externe, hors mécanisme.
 * IMP-11 : renommé TICKET_ROUTER_STATES pour lever l'ambiguïté avec les états
 * plateforme (TICKET_DB_STATES, states.ts) — docs 06 §13.
 */
export const TICKET_ROUTER_STATES = [
  'UNUSED',
  'ACTIVE',
  'EXPIRED_REMOVED',
  'ADMIN_FREE_LEGACY',
] as const;

export type TicketRouterState = (typeof TICKET_ROUTER_STATES)[number];

/**
 * @deprecated IMP-11 : alias rétrocompatible de TICKET_ROUTER_STATES.
 * Ne pas utiliser dans le nouveau code ; sera retiré à l'IMP qui consommera
 * définitivement les états plateforme (backend IMP-12+).
 */
export const TICKET_STATES = TICKET_ROUTER_STATES;
/** @deprecated IMP-11 : alias de TicketRouterState. */
export type TicketState = TicketRouterState;

export * from './states.js';
