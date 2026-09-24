/**
 * IMP-23 — Client zero-dep de l'API classique RouterOS (6.49, doc 07 §37) :
 * TCP (api) ou TLS (api-ssl), login clair OU challenge md5, opérations hotspot
 * mappées sur la file `mikrotik_sync` (create_ticket / disable_ticket) et
 * `probePermissions()` pour le P6 (permissions `dg-connector` testées en W2).
 *
 * Le client ne décide JAMAIS de la politique métier (contrat §3) : il exécute
 * des phrases et rapporte les `!trap` tels quels.
 */
import { createHash } from 'node:crypto';
import * as net from 'node:net';
import * as tls from 'node:tls';
import type { HotspotUserRecord } from './hotspot-parser.js';
import {
  encodeSentence,
  parseSentence,
  replyWordsToReply,
  type RouterOsReply,
} from './routeros-protocol.js';

export interface RouterOsConnectOptions {
  host: string;
  port: number;
  user: string;
  password: string;
  /** true = api-ssl (TLS) ; défaut false = api (TCP clair, LAN uniquement). */
  tls?: boolean;
  /** Rejette uniquement les erreurs de certificat si false (LAN, W2). */
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
}

export class RouterOsApiError extends Error {
  constructor(
    public readonly trapMessage: string,
    public readonly command: string,
  ) {
    super(`RouterOS !trap sur ${command} : ${trapMessage}`);
  }
}

interface Pending {
  replies: RouterOsReply[];
  resolve: (replies: RouterOsReply[]) => void;
  reject: (err: Error) => void;
}

export class RouterOsApiClient {
  private socket: net.Socket | tls.TLSSocket | null = null;
  private buffer = Buffer.alloc(0);
  private queue: Pending[] = [];

  constructor(private readonly opts: RouterOsConnectOptions) {}

  async connect(): Promise<void> {
    const timeout = this.opts.timeoutMs ?? 5_000;
    const socket = await new Promise<net.Socket | tls.TLSSocket>((resolve, reject) => {
      const onErr = (err: Error): void => reject(err);
      const sock = this.opts.tls
        ? tls.connect(
            {
              host: this.opts.host,
              port: this.opts.port,
              rejectUnauthorized: this.opts.rejectUnauthorized ?? true,
            },
            () => resolve(sock),
          )
        : net.createConnection({ host: this.opts.host, port: this.opts.port }, () => resolve(sock));
      sock.once('error', onErr);
      sock.setTimeout(timeout, () => {
        sock.destroy(new Error('délai de connexion RouterOS dépassé'));
      });
    });
    socket.setTimeout(0);
    this.socket = socket;
    socket.on('data', (chunk: Buffer) => this.onData(chunk));
    socket.on('error', (err) => this.failAll(err));
    socket.on('close', () => this.failAll(new Error('connexion RouterOS fermée')));
    await this.login();
  }

  close(): void {
    this.socket?.destroy();
    this.socket = null;
  }

  private failAll(err: Error): void {
    const pending = this.queue.splice(0);
    for (const p of pending) p.reject(err);
  }

  private onData(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const parsed = parseSentence(this.buffer);
      if (parsed === null) return;
      this.buffer = this.buffer.subarray(parsed.consumed);
      const reply = replyWordsToReply(parsed.words);
      const head = this.queue[0];
      if (!head) continue;
      if (reply.tag === '!re') {
        head.replies.push(reply);
      } else if (reply.tag === '!done') {
        head.replies.push(reply);
        this.queue.shift();
        head.resolve(head.replies);
      } else if (reply.tag === '!trap') {
        const message = reply.attrs.get('message') ?? 'erreur sans message';
        this.queue.shift();
        head.reject(new RouterOsApiError(message, head.replies.map((r) => r.tag).join(',') || 'cmd'));
      } else if (reply.tag === '!fatal') {
        this.failAll(new Error('RouterOS !fatal'));
        return;
      }
    }
  }

  /** Envoie une phrase et attend `!done`/`!trap`. */
  talk(words: string[]): Promise<RouterOsReply[]> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error('client non connecté'));
    return new Promise<RouterOsReply[]>((resolve, reject) => {
      this.queue.push({ replies: [], resolve, reject });
      socket.write(encodeSentence(words));
    });
  }

  private async login(): Promise<void> {
    try {
      await this.talk(['/login', `=name=${this.opts.user}`, `=password=${this.opts.password}`]);
    } catch (err) {
      if (err instanceof RouterOsApiError && /encrypted/i.test(err.trapMessage)) {
        // Schéma challenge (simplifié hex, ajustement sur routeur réel en W2 —
        // P6) : /login nu => =ret= puis md5(0x00 + challenge + password).
        // Mode primaire LAN : login clair ci-dessus (doc 07 §37).
        const first = await this.talk(['/login']);
        const challenge = Buffer.from(first[0]?.attrs.get('ret') ?? '', 'hex');
        const md5 = createHash('md5')
          .update(Buffer.concat([challenge, Buffer.from(this.opts.password, 'utf8')]))
          .digest('hex');
        // Schéma simplifié hex : préfixe '0' = octet 0x00 (ajustement binaire W2, P6).
        await this.talk(['/login', `=name=${this.opts.user}`, `=password=0${md5}`]);
      } else {
        throw err;
      }
    }
  }

  /** `/ip/hotspot/user/add` (contrat §3 : name/profile/password/comment). */
  async addHotspotUser(input: { name: string; password: string; profile: string; comment: string }): Promise<string> {
    const replies = await this.talk([
      '/ip/hotspot/user/add',
      `=name=${input.name}`,
      `=password=${input.password}`,
      `=profile=${input.profile}`,
      `=comment=${input.comment}`,
    ]);
    const id = replies.find((r) => r.tag === '!done')?.attrs.get('ret');
    if (!id) throw new RouterOsApiError('add sans .id retourné', '/ip/hotspot/user/add');
    return id;
  }

  async findHotspotUserId(name: string): Promise<string | null> {
    const replies = await this.talk(['/ip/hotspot/user/print', `?name=${name}`, '=.probing=yes']);
    return replies.find((r) => r.tag === '!re')?.attrs.get('.id') ?? null;
  }

  async setHotspotUserDisabled(id: string, disabled: boolean): Promise<void> {
    await this.talk(['/ip/hotspot/user/set', `=.id=${id}`, `=disabled=${disabled ? 'yes' : 'no'}`]);
  }

  async removeHotspotUser(id: string): Promise<void> {
    await this.talk(['/ip/hotspot/user/remove', `=.id=${id}`]);
  }

  async printHotspotUsers(): Promise<HotspotUserRecord[]> {
    const replies = await this.talk(['/ip/hotspot/user/print']);
    return replies
      .filter((r) => r.tag === '!re')
      .map((r) => ({
        name: r.attrs.get('name') ?? '',
        profile: r.attrs.get('profile') ?? 'default',
        comment: r.attrs.get('comment') ?? null,
        limitUptime: r.attrs.get('limit-uptime') ?? null,
        disabled: r.attrs.get('disabled') === 'yes' || r.attrs.get('disabled') === 'true',
      }));
  }

  /** P6 (IMP-23) : sonde lecture + écriture avec un user jetable `dgprobe0`. */
  async probePermissions(): Promise<{ read: boolean; write: boolean; detail: string }> {
    let read = false;
    let write = false;
    const notes: string[] = [];
    try {
      await this.printHotspotUsers();
      read = true;
    } catch (err) {
      notes.push(`read: ${err instanceof Error ? err.message : String(err)}`);
    }
    try {
      const id = await this.addHotspotUser({
        name: 'dgprobe0',
        password: 'probe0000',
        profile: 'Admin-free',
        comment: 'probe-imp23',
      });
      await this.removeHotspotUser(id);
      write = true;
    } catch (err) {
      notes.push(`write: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { read, write, detail: notes.join(' ; ') || 'lecture+écriture OK (user jetable créé puis supprimé)' };
  }
}
