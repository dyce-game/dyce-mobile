import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { realtimeClientFrameSchema } from '@dyce/shared';
import type { AccessClaims } from '../auth/tokens.ts';
import type { RealtimeHub } from './hub.ts';

export const REALTIME_PATH = '/realtime';

type Tokens = {
  verifyAccessWithExpiry(token: string): Promise<AccessClaims & { expiresAt: number }>;
};
type Typing = { typingTarget(userId: string, conversationId: string): Promise<string | null> };

export type RealtimeServerOptions = {
  /** How long a new socket has to send its `auth` frame. */
  authTimeoutMs?: number;
  /** How often to ping; a socket that misses two is dropped. */
  pingIntervalMs?: number;
  /** Typing signals allowed per socket per window. */
  typingBurst?: number;
  typingWindowMs?: number;
  now?: () => number;
};

/**
 * The live connection endpoint (`/realtime`). The token is sent in the first frame, not in the URL (URLs
 * end up in logs). A socket closes when its token expires; the app reconnects with a fresh one, so a
 * revoked session loses live delivery within one access-token lifetime.
 */
export class RealtimeServer {
  private readonly wss: WebSocketServer;
  private readonly opts: Required<RealtimeServerOptions>;
  private readonly onUpgrade: (req: IncomingMessage, socket: Duplex, head: Buffer) => void;
  private readonly timers = new Set<NodeJS.Timeout>();

  constructor(
    private readonly http: Server,
    private readonly tokens: Tokens,
    private readonly hub: RealtimeHub,
    private readonly typing: Typing,
    options: RealtimeServerOptions = {},
  ) {
    this.opts = {
      authTimeoutMs: 5_000,
      pingIntervalMs: 30_000,
      typingBurst: 20,
      typingWindowMs: 10_000,
      now: () => Date.now(),
      ...options,
    };
    // Frames are tiny; anything bigger is not ours.
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 4_096 });
    this.onUpgrade = (req, socket, head) => {
      const path = (req.url ?? '').split('?')[0];
      if (path !== REALTIME_PATH) return; // not ours; leave it to whoever else listens
      this.wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws));
    };
  }

  attach(): void {
    this.http.on('upgrade', this.onUpgrade);
  }

  async close(): Promise<void> {
    this.http.off('upgrade', this.onUpgrade);
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.hub.closeAll();
    for (const client of this.wss.clients) client.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
  }

  private later(fn: () => void, ms: number): NodeJS.Timeout {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, ms);
    this.timers.add(t);
    return t;
  }

  private onConnection(ws: WebSocket): void {
    let userId: string | null = null;
    let alive = true;
    let burst: number[] = [];
    let expiry: NodeJS.Timeout | undefined;

    const authTimer = this.later(() => ws.close(4401, 'auth_timeout'), this.opts.authTimeoutMs);

    const ping = setInterval(() => {
      if (!alive) return ws.terminate();
      alive = false;
      ws.ping();
    }, this.opts.pingIntervalMs);
    ws.on('pong', () => {
      alive = true;
    });

    ws.on('message', (raw) => {
      void (async () => {
        let frame;
        try {
          frame = realtimeClientFrameSchema.parse(JSON.parse(raw.toString()));
        } catch {
          return ws.close(4400, 'bad_frame');
        }

        if (userId === null) {
          if (frame.type !== 'auth') return ws.close(4401, 'auth_required');
          try {
            const claims = await this.tokens.verifyAccessWithExpiry(frame.token);
            if (ws.readyState !== ws.OPEN) return;
            userId = claims.userId;
            clearTimeout(authTimer);
            this.timers.delete(authTimer);
            expiry = this.later(
              () => ws.close(4403, 'token_expired'),
              Math.max(0, claims.expiresAt - this.opts.now()),
            );
            this.hub.add(userId, ws);
            ws.send(JSON.stringify({ type: 'ready' }));
          } catch {
            ws.close(4401, 'unauthorized');
          }
          return;
        }

        if (frame.type === 'typing') {
          const t = this.opts.now();
          burst = burst.filter((x) => t - x < this.opts.typingWindowMs);
          if (burst.length >= this.opts.typingBurst) return; // quietly drop the excess
          burst.push(t);
          const target = await this.typing.typingTarget(userId, frame.conversationId);
          if (target) {
            this.hub.publish([target], {
              type: 'typing',
              conversationId: frame.conversationId,
              userId,
              typing: frame.typing,
            });
          }
        }
        // a second `auth` frame is ignored: reconnect to change identity
      })();
    });

    ws.on('close', () => {
      clearInterval(ping);
      clearTimeout(authTimer);
      this.timers.delete(authTimer);
      if (expiry) {
        clearTimeout(expiry);
        this.timers.delete(expiry);
      }
      if (userId) this.hub.remove(userId, ws);
    });
    ws.on('error', () => ws.terminate());
  }
}
