/**
 * Typage des imports Vite `?raw` (contenu brut d'un fichier non-TS).
 * Permet au test normatif seed-sync de lire la migration 0008 sans dépendre
 * de node:fs / node:path / node:url (et donc sans @types/node pour ce fichier).
 */
declare module '*?raw' {
  const content: string;
  export default content;
}
