/**
 * IMP-23 — Passerelle file `mikrotik_sync` -> API RouterOS classique.
 * Même contrat de résultat que le DryRunConnector (IMP-21) : le code clair
 * (`password`) voyage uniquement LAN local (doc 07 §38), purge W2 au succès.
 */
import type { RouterOpResult } from './dry-run.js';
import type { RouterOsApiClient } from './routeros-client.js';

export async function applyQueueOp(
  client: RouterOsApiClient,
  operation: string,
  payload: Record<string, unknown>,
): Promise<RouterOpResult> {
  try {
    switch (operation) {
      case 'create_ticket': {
        const name = typeof payload['name'] === 'string' ? payload['name'] : null;
        const password = typeof payload['password'] === 'string' ? payload['password'] : null;
        const profile = typeof payload['profile'] === 'string' ? payload['profile'] : null;
        const comment = typeof payload['comment'] === 'string' ? payload['comment'] : null;
        if (!name || !password || !profile || !comment) {
          return { ok: false, code: 'invalid_payload', message: 'create_ticket requiert name/password/profile/comment', detail: null };
        }
        const routerId = await client.addHotspotUser({ name, password, profile, comment });
        return {
          ok: true,
          code: null,
          message: null,
          detail: { applied: 'create_ticket', router: 'routeros-api', name, router_id: routerId },
        };
      }
      case 'disable_ticket': {
        const name = typeof payload['name'] === 'string' ? payload['name'] : null;
        if (!name) {
          return { ok: false, code: 'invalid_name', message: 'disable_ticket requiert name', detail: null };
        }
        const id = await client.findHotspotUserId(name);
        if (!id) {
          return { ok: false, code: 'user_not_found', message: `user absent du routeur : ${name}`, detail: null };
        }
        await client.setHotspotUserDisabled(id, true);
        return { ok: true, code: null, message: null, detail: { applied: 'disable_ticket', router: 'routeros-api', name } };
      }
      case 'read_status':
      case 'refresh_inventory': {
        const users = await client.printHotspotUsers();
        return {
          ok: true,
          code: null,
          message: null,
          detail: { user_count: users.length, router: 'routeros-api' },
        };
      }
      default:
        return { ok: false, code: 'unsupported_operation', message: `opération inconnue : ${operation}`, detail: null };
    }
  } catch (err) {
    return {
      ok: false,
      code: 'routeros_error',
      message: err instanceof Error ? err.message : String(err),
      detail: null,
    };
  }
}
