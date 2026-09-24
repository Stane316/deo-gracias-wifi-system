/**
 * IMP-18 — Génération de tickets digitaux par le backend (remplace Mikmon, D5/N4).
 * Contrat Mikmon (docs/infrastructure/mikhmon-contract.md §3) :
 * - tickets **indistinguables dans leur mécanique** des tickets Mikmon ;
 * - distinguables dans leur identité : `name` = `dg` + 6 caractères [a-z0-9] ;
 * - `comment` = `vc-<seq>-<mm.dd.yy>-` (préfixe `vc` OBLIGATOIRE pour l'On-Login ;
 *   seq = séquence digitale propre plateforme, 3+ chiffres, à partir de 100) ;
 * - profile + limit-uptime = valeurs de `plans` (jamais déduites du nom, doc 09 §36) ;
 * - ≤ 200 créations/lot (RAM routeur 128 Mo, §3.5).
 *
 * Sécurité (0004, INC-01/INC-04) : la base ne stocke JAMAIS le code client en
 * clair — uniquement `sha256(code)`. Le code clair n'existe que :
 * 1) dans la réponse de génération (affichage unique, à archiver au coffre) ;
 * 2) dans `mikrotik_sync.payload` le temps de la synchronisation routeur.
 */
import { randomBytes } from 'node:crypto';

/** Alphabet du nom routeur : [a-z0-9] (contrat §3.4). */
export const ROUTER_NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
/** Préfixe d'identité plateforme (distinguable des users Mikmon, contrat §3.4). */
export const ROUTER_NAME_PREFIX = 'dg';
export const ROUTER_NAME_RANDOM_LENGTH = 6;

/**
 * Alphabet du code client : SANS caractères ambigus (0/o, 1/l/i) — affiché sur
 * voucher, recopié à la main sur un téléphone (contrat §3.4, format affiché IMP-19).
 */
export const CLIENT_CODE_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyz';
export const CLIENT_CODE_LENGTH = 8;

/** Limite contrat §3.5 : ~200 créations/lot sans observation RAM (128 Mo). */
export const MAX_BATCH_QUANTITY = 200;

/** Première séquence digitale (les batches Mikmon manuels ont occupé 1..6). */
export const FIRST_BACKEND_BATCH_SEQ = 100;

/** Générateur aléatoire injectable (CSPRNG par défaut ; seedable en test). */
export type RandomSource = () => number;

export function cryptoRandomSource(): RandomSource {
  return () => randomBytes(4).readUInt32BE(0) / 0x1_0000_0000;
}

function pick(random: RandomSource, alphabet: string, length: number): string {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(random() * alphabet.length) % alphabet.length];
  }
  return out;
}

/** Nom d'user routeur : `dg` + 6 caractères [a-z0-9] (contrat §3.4). */
export function generateRouterName(random: RandomSource): string {
  return ROUTER_NAME_PREFIX + pick(random, ROUTER_NAME_ALPHABET, ROUTER_NAME_RANDOM_LENGTH);
}

/** Code client : 8 caractères sans ambigus (recopie manuelle). */
export function generateClientCode(random: RandomSource): string {
  return pick(random, CLIENT_CODE_ALPHABET, CLIENT_CODE_LENGTH);
}

/**
 * Comment routeur : `vc-<seq>-<mm.dd.yy>-` (contrat §3.3).
 * `seq` en 3+ chiffres ; date = jour de génération (fuseau du site, UTC+1).
 */
export function buildMikrotikComment(seq: number, generatedOn: Date): string {
  if (!Number.isInteger(seq) || seq < FIRST_BACKEND_BATCH_SEQ) {
    throw new Error(`séquence digitale invalide : ${seq} (>= ${FIRST_BACKEND_BATCH_SEQ})`);
  }
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Africa/Porto-Novo',
    month: '2-digit',
    day: '2-digit',
    year: '2-digit',
  }).formatToParts(generatedOn);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '01';
  return `vc-${seq}-${get('month')}.${get('day')}.${get('year')}-`;
}

export interface GeneratedTicketSpec {
  routerName: string;
  clientCode: string;
  mikrotikComment: string;
}

export interface GenerateBatchInput {
  seq: number;
  quantity: number;
  generatedOn?: Date;
  random?: RandomSource;
}

/**
 * Génère les spécifications d'un lot (aucun accès base). Codes uniques garantis
 * par tirage CSPRNG dans un espace large (31^8 ≈ 8,5e11 pour le code client) ;
 * une vérification d'unicité intra-lot est tout de même appliquée.
 */
export function generateTicketSpecs(input: GenerateBatchInput): GeneratedTicketSpec[] {
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_BATCH_QUANTITY) {
    throw new Error(`quantité invalide : ${input.quantity} (1..${MAX_BATCH_QUANTITY}, contrat §3.5)`);
  }
  const random = input.random ?? cryptoRandomSource();
  const generatedOn = input.generatedOn ?? new Date();
  const comment = buildMikrotikComment(input.seq, generatedOn);
  const specs: GeneratedTicketSpec[] = [];
  const seenCodes = new Set<string>();
  const seenNames = new Set<string>();
  while (specs.length < input.quantity) {
    const routerName = generateRouterName(random);
    const clientCode = generateClientCode(random);
    if (seenCodes.has(clientCode) || seenNames.has(routerName)) continue;
    seenCodes.add(clientCode);
    seenNames.add(routerName);
    specs.push({ routerName, clientCode, mikrotikComment: comment });
  }
  return specs;
}
