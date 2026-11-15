import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import type { RealtimeEvent } from '@dyce/shared';
import { MAX_SOCKETS_PER_USER, RealtimeHub, type HubSocket } from './hub.ts';
import { RealtimeServer, REALTIME_PATH, type RealtimeServerOptions } from './realtime.server.ts';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const CONV = '33333333-3333-4333-8333-333333333333';

describe('RealtimeHub', () => {
  const fake = () => {
    const sent: string[] = [];
    const closed: [number | undefined, string | undefined][] = [];
    const socket: HubSocket = {
      send: (d) => void sent.push(d),
      close: (c, r) => void closed.push([c, r]),
    };
    return { socket, sent, closed };
  };
  const ev: RealtimeEvent = { type: 'typing', conversationId: CONV, userId: A, typing: true };

  it('delivers to every connection of the named users, once each, and to nobody else', () => {
    const hub = new RealtimeHub();
    const a1 = fake();
    const a2 = fake();
    const b = fake();
    const c = fake();
    hub.add(A, a1.socket);
    hub.add(A, a2.socket);
    hub.add(B, b.socket);
    hub.add('other', c.socket);
    hub.publish([A, B, A], ev);
    expect(a1.sent).toEqual([JSON.stringify(ev)]);
    expect(a2.sent).toHaveLength(1);
    expect(b.sent).toHaveLength(1);
    expect(c.sent).toEqual([]);
  });

  it('forgets a connection once removed, and knows who is online', () => {
    const hub = new RealtimeHub();
    const a = fake();
    hub.add(A, a.socket);
    expect(hub.isOnline(A)).toBe(true);
    hub.remove(A, a.socket);
    expect(hub.isOnline(A)).toBe(false);
    hub.publish([A], ev);
    expect(a.sent).toEqual([]);
  });

  it('keeps going when one connection throws', () => {
    const hub = new RealtimeHub();
    const bad: HubSocket = {
      send: () => {
        throw new Error('boom');
      },
      close: () => undefined,
    };
    const good = fake();
    hub.add(A, bad);
    hub.add(A, good.socket);
    expect(() => hub.publish([A], ev)).not.toThrow();
    expect(good.sent).toHaveLength(1);
  });

  it('drops the oldest connection past the per-user limit', () => {
    const hub = new RealtimeHub();
    const all = Array.from({ length: MAX_SOCKETS_PER_USER + 1 }, fake);
    for (const f of all) hub.add(A, f.socket);
    expect(all[0]!.closed).toEqual([[4002, 'too_many_connections']]);
    expect(all[1]!.closed).toEqual([]);
    hub.publish([A], ev);
    expect(all[0]!.sent).toEqual([]);
    expect(all.at(-1)!.sent).toHaveLength(1);
  });
});

describe('RealtimeServer', () => {
  let http: Server;
  let server: RealtimeServer;
  let hub: RealtimeHub;
  let url: string;
  let nowMs: number;
  const typingChecks: [string, string][] = [];

  async function start(opts: RealtimeServerOptions = {}) {
    http = createServer((_req, res) => res.end('ok'));
    hub = new RealtimeHub();
    nowMs = Date.now();
    server = new RealtimeServer(
      http,
      {
        async verifyAccessWithExpiry(token) {
          if (token === 'token-for-a-xxxx')
            return { userId: A, familyId: 'f', expiresAt: nowMs + 60_000 };
          if (token === 'token-for-b-xxxx')
            return { userId: B, familyId: 'f', expiresAt: nowMs + 60_000 };
          if (token === 'token-expiring-a')
            return { userId: A, familyId: 'f', expiresAt: nowMs + 150 };
          throw new Error('bad token');
        },
      },
      hub,
      {
        async typingTarget(user, conv) {
          typingChecks.push([user, conv]);
          return user === A && conv === CONV ? B : null;
        },
      },
      { now: () => nowMs, ...opts },
    );
    server.attach();
    await new Promise<void>((r) => http.listen(0, '127.0.0.1', r));
    url = `ws://127.0.0.1:${(http.address() as AddressInfo).port}${REALTIME_PATH}`;
  }

  afterEach(async () => {
    await server?.close();
    await new Promise<void>((r) => http.close(() => r()));
    typingChecks.length = 0;
  });

  /** Opens a socket and collects what it receives and how it closes. */
  function connect() {
    const ws = new WebSocket(url);
    const frames: RealtimeEvent[] = [];
    const closed = new Promise<{ code: number; reason: string }>((resolve) =>
      ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() })),
    );
    ws.on('message', (d) => frames.push(JSON.parse(d.toString())));
    const opened = new Promise<void>((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    const next = async (n = 1) => {
      for (let i = 0; i < 100 && frames.length < n; i++)
        await new Promise((r) => setTimeout(r, 10));
      return frames;
    };
    return { ws, frames, closed, opened, next };
  }

  const auth = (token: string) => JSON.stringify({ type: 'auth', token });

  it('says ready after a valid auth frame and then delivers events for that user', async () => {
    await start();
    const c = connect();
    await c.opened;
    c.ws.send(auth('token-for-a-xxxx'));
    expect(await c.next(1)).toEqual([{ type: 'ready' }]);
    const event: RealtimeEvent = { type: 'read', conversationId: CONV, userId: B, at: 'x' };
    hub.publish([A], event);
    expect(await c.next(2)).toEqual([{ type: 'ready' }, event]);
    c.ws.close();
  });

  it('closes a socket whose first frame is not auth', async () => {
    await start();
    const c = connect();
    await c.opened;
    c.ws.send(JSON.stringify({ type: 'typing', conversationId: CONV, typing: true }));
    expect(await c.closed).toMatchObject({ code: 4401, reason: 'auth_required' });
  });

  it('closes on a bad token', async () => {
    await start();
    const c = connect();
    await c.opened;
    c.ws.send(auth('not-a-real-token'));
    expect(await c.closed).toMatchObject({ code: 4401 });
    expect(hub.isOnline(A)).toBe(false);
  });

  it('closes a socket that never authenticates', async () => {
    await start({ authTimeoutMs: 80 });
    const c = connect();
    await c.opened;
    expect(await c.closed).toMatchObject({ code: 4401, reason: 'auth_timeout' });
  });

  it('closes on junk, and on frames bigger than a frame should be', async () => {
    await start();
    const junk = connect();
    await junk.opened;
    junk.ws.send('not json at all');
    expect(await junk.closed).toMatchObject({ code: 4400 });

    const big = connect();
    await big.opened;
    big.ws.send(auth('x'.repeat(10_000)));
    expect((await big.closed).code).toBe(1009);
  });

  it('closes when the token expires, so a revoked session loses live delivery', async () => {
    await start();
    nowMs = Date.now();
    const c = connect();
    await c.opened;
    c.ws.send(auth('token-expiring-a'));
    expect(await c.closed).toMatchObject({ code: 4403, reason: 'token_expired' });
    expect(hub.isOnline(A)).toBe(false);
  });

  it('forwards typing to the person the service names, and only after auth', async () => {
    await start();
    const a = connect();
    const b = connect();
    await Promise.all([a.opened, b.opened]);
    a.ws.send(auth('token-for-a-xxxx'));
    b.ws.send(auth('token-for-b-xxxx'));
    await Promise.all([a.next(1), b.next(1)]);

    a.ws.send(JSON.stringify({ type: 'typing', conversationId: CONV, typing: true }));
    expect(await b.next(2)).toEqual([
      { type: 'ready' },
      { type: 'typing', conversationId: CONV, userId: A, typing: true },
    ]);
    expect(typingChecks).toEqual([[A, CONV]]);
    expect(a.frames).toEqual([{ type: 'ready' }]); // not echoed back
    a.ws.close();
    b.ws.close();
  });

  it('says nothing when the service refuses a typing signal', async () => {
    await start();
    const b = connect();
    await b.opened;
    b.ws.send(auth('token-for-b-xxxx')); // typingTarget() returns null for B
    await b.next(1);
    b.ws.send(JSON.stringify({ type: 'typing', conversationId: CONV, typing: true }));
    await new Promise((r) => setTimeout(r, 100));
    expect(typingChecks).toEqual([[B, CONV]]);
    expect(b.frames).toEqual([{ type: 'ready' }]);
    b.ws.close();
  });

  it('drops typing signals beyond the burst limit without closing the socket', async () => {
    await start({ typingBurst: 3, typingWindowMs: 60_000 });
    const a = connect();
    await a.opened;
    a.ws.send(auth('token-for-a-xxxx'));
    await a.next(1);
    for (let i = 0; i < 10; i++) {
      a.ws.send(JSON.stringify({ type: 'typing', conversationId: CONV, typing: i % 2 === 0 }));
    }
    await new Promise((r) => setTimeout(r, 200));
    expect(typingChecks).toHaveLength(3);
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
    a.ws.close();
  });

  it('leaves other paths to the rest of the server', async () => {
    await start();
    const res = await fetch(url.replace('ws://', 'http://').replace(REALTIME_PATH, '/'));
    expect(await res.text()).toBe('ok');
  });
});
