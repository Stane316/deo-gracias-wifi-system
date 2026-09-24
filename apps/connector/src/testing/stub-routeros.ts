/**
 * IMP-23 — Stub de test : serveur TCP parlant le protocole binaire RouterOS
 * (login clair ou challenge, add/print/set/remove hotspot user). Permet de
 * tester le client SANS routeur physique (le vrai arrive en W2, P6).
 */
import { createHash, randomBytes } from 'node:crypto';
import * as net from 'node:net';
import { encodeSentence, parseSentence } from '../routeros-protocol.js';

export interface StubUser {
  '.id': string;
  name: string;
  password: string;
  profile: string;
  comment: string;
  disabled: string;
}

export class StubRouterOsServer {
  users = new Map<string, StubUser>();
  /** true = le premier /login nu reçoit un challenge (schéma md5). */
  requireChallenge = false;
  /** Prochaine commande d'écriture => !trap (panne temporaire). */
  failNextWrite = false;
  expectedUser = 'dg-connector';
  expectedPassword = 'stub-pass';
  private nextId = 1;
  private server: net.Server | null = null;
  private sockets = new Set<net.Socket>();

  async listen(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.sockets.add(socket);
        socket.on('close', () => this.sockets.delete(socket));
        this.handle(socket);
      });
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') resolve(address.port);
        else reject(new Error('adresse stub indisponible'));
      });
      this.server = server;
    });
  }

  async close(): Promise<void> {
    for (const socket of this.sockets) socket.destroy();
    this.sockets.clear();
    await new Promise<void>((resolve) => {
      if (!this.server) return resolve();
      this.server.close(() => resolve());
    });
    this.server = null;
  }

  private send(socket: net.Socket, words: string[]): void {
    socket.write(encodeSentence(words));
  }

  private handle(socket: net.Socket): void {
    let buffer = Buffer.alloc(0);
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        const parsed = parseSentence(buffer);
        if (parsed === null) return;
        buffer = buffer.subarray(parsed.consumed);
        this.dispatch(socket, parsed.words);
      }
    });
    socket.on('error', () => undefined);
  }

  private dispatch(socket: net.Socket, words: string[]): void {
    const cmd = words[0] ?? '';
    const attrs = new Map<string, string>();
    for (const w of words.slice(1)) {
      if (w.startsWith('=')) {
        const eq = w.indexOf('=', 1);
        if (eq > 0) attrs.set(w.slice(1, eq), w.slice(eq + 1));
      } else if (w.startsWith('?')) {
        // Filtre de requête (?name=…) : lu comme attribut de filtrage.
        const eq = w.indexOf('=');
        if (eq > 0) attrs.set(w.slice(1, eq), w.slice(eq + 1));
      }
    }
    switch (cmd) {
      case '/login': {
        const name = attrs.get('name');
        const password = attrs.get('password');
        if (this.requireChallenge) {
          if (name === undefined) {
            this.send(socket, ['!done', `=ret=${randomBytes(16).toString('hex')}`]);
          } else if (password !== undefined && password.length === 33 && password.startsWith('0')) {
            // Réponse challenge (hex simplifié) acceptée par le stub.
            this.send(socket, ['!done']);
          } else {
            // Login clair refusé : force la bascule challenge côté client.
            this.send(socket, ['!trap', '=message=must use encrypted password']);
          }
          return;
        }
        if (name === undefined) {
          this.send(socket, ['!trap', '=message=invalid user name or password']);
          return;
        }
        if (name === this.expectedUser && password === this.expectedPassword) {
          this.send(socket, ['!done']);
        } else {
          this.send(socket, ['!trap', '=message=invalid user name or password']);
        }
        return;
      }
      case '/ip/hotspot/user/add': {
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.send(socket, ['!trap', '=message=flash error (stub)']);
          return;
        }
        const name = attrs.get('name') ?? '';
        if ([...this.users.values()].some((u) => u.name === name)) {
          this.send(socket, ['!trap', '=message=failure: already have such user']);
          return;
        }
        const id = `*${(this.nextId++).toString(16).toUpperCase()}`;
        this.users.set(id, {
          '.id': id,
          name,
          password: attrs.get('password') ?? '',
          profile: attrs.get('profile') ?? 'default',
          comment: attrs.get('comment') ?? '',
          disabled: 'no',
        });
        this.send(socket, ['!done', `=ret=${id}`]);
        return;
      }
      case '/ip/hotspot/user/print': {
        const filter = attrs.get('name');
        for (const user of this.users.values()) {
          if (filter !== undefined && user.name !== filter) continue;
          this.send(socket, [
            '!re',
            `=.id=${user['.id']}`,
            `=name=${user.name}`,
            `=profile=${user.profile}`,
            `=comment=${user.comment}`,
            `=disabled=${user.disabled}`,
          ]);
        }
        this.send(socket, ['!done']);
        return;
      }
      case '/ip/hotspot/user/set': {
        if (this.failNextWrite) {
          this.failNextWrite = false;
          this.send(socket, ['!trap', '=message=flash error (stub)']);
          return;
        }
        const id = attrs.get('.id');
        const user = id ? this.users.get(id) : undefined;
        if (!user) {
          this.send(socket, ['!trap', '=message=no such item']);
          return;
        }
        const disabled = attrs.get('disabled');
        if (disabled !== undefined) user.disabled = disabled;
        this.send(socket, ['!done']);
        return;
      }
      case '/ip/hotspot/user/remove': {
        const id = attrs.get('.id');
        if (!id || !this.users.delete(id)) {
          this.send(socket, ['!trap', '=message=no such item']);
          return;
        }
        this.send(socket, ['!done']);
        return;
      }
      default:
        this.send(socket, ['!trap', `=message=unknown command ${cmd}`]);
    }
  }
}

/** Utilitaire : challenge md5 attendu côté client (miroir de l'algo client). */
export function md5ChallengeResponse(challengeHex: string, password: string): string {
  return createHash('md5')
    .update(Buffer.concat([Buffer.from([0]), Buffer.from(challengeHex, 'hex'), Buffer.from(password, 'utf8')]))
    .digest('hex');
}
