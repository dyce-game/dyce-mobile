import type { RealtimeEvent } from '@dyce/shared';
import {
  backoffMs,
  createRealtimeClient,
  realtimeUrl,
  type RealtimeStatus,
  type SocketLike,
} from './realtime-client';

class FakeSocket implements SocketLike {
  readyState = 0;
  sent: string[] = [];
  closedWith: [number?, string?] | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: unknown }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(d);
  }
  close(code?: number, reason?: string) {
    this.closedWith = [code, reason];
    this.readyState = 3;
  }
  // test helpers
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(frame: unknown) {
    this.onmessage?.({ data: typeof frame === 'string' ? frame : JSON.stringify(frame) });
  }
  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

function setup(token: string | null | (() => Promise<string | null>) = 'tok-1') {
  const sockets: FakeSocket[] = [];
  const events: RealtimeEvent[] = [];
  const statuses: RealtimeStatus[] = [];
  const timers: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];
  const client = createRealtimeClient({
    url: 'ws://x/realtime',
    getToken: typeof token === 'function' ? token : async () => token,
    onEvent: (e) => events.push(e),
    onStatus: (s) => statuses.push(s),
    createSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    setTimer: (fn, ms) => {
      const t = { fn, ms, id: timers.length + 1, cleared: false };
      timers.push(t);
      return t.id;
    },
    clearTimer: (id) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.cleared = true;
    },
    random: () => 1, // no jitter: delays are exactly the base
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const fire = () =>
    timers
      .filter((t) => !t.cleared)
      .at(-1)!
      .fn();
  return { client, sockets, events, statuses, timers, flush, fire };
}

describe('backoffMs', () => {
  it('doubles from half a second up to a 30 second ceiling', () => {
    const d = (n: number) => backoffMs(n, () => 1);
    expect([d(0), d(1), d(2), d(3)]).toEqual([500, 1000, 2000, 4000]);
    expect(d(20)).toBe(30_000);
  });
  it('adds jitter between half and the full delay', () => {
    expect(backoffMs(2, () => 0)).toBe(1000);
    expect(backoffMs(2, () => 0.5)).toBe(1500);
  });
});

describe('realtimeUrl', () => {
  it('swaps the scheme and adds the path', () => {
    expect(realtimeUrl('http://localhost:3000')).toBe('ws://localhost:3000/realtime');
    expect(realtimeUrl('https://api.dyce.games/')).toBe('wss://api.dyce.games/realtime');
  });
});

describe('createRealtimeClient', () => {
  it('connects, authenticates with the first frame, and becomes ready', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    expect(t.sockets).toHaveLength(1);
    expect(t.sockets[0]!.url).toBe('ws://x/realtime'); // the token is never in the URL
    expect(t.sockets[0]!.sent).toEqual([]);
    t.sockets[0]!.open();
    expect(JSON.parse(t.sockets[0]!.sent[0]!)).toEqual({ type: 'auth', token: 'tok-1' });
    t.sockets[0]!.receive({ type: 'ready' });
    expect(t.client.status).toBe('ready');
    expect(t.statuses).toEqual(['connecting', 'ready']);
    expect(t.events).toEqual([{ type: 'ready' }]);
  });

  it('passes events on and ignores junk', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    const s = t.sockets[0]!;
    s.open();
    s.receive({ type: 'ready' });
    s.receive('not json');
    s.receive({ nothing: true });
    s.receive(JSON.stringify([1, 2]));
    s.receive({ type: 'typing', conversationId: 'c', userId: 'u', typing: true });
    expect(t.events.map((e) => e.type)).toEqual(['ready', 'typing']);
  });

  it('reconnects with backoff after a drop, and resets the backoff once ready again', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    t.sockets[0]!.open();
    t.sockets[0]!.receive({ type: 'ready' });
    t.sockets[0]!.drop();
    expect(t.client.status).toBe('waiting');
    expect(t.timers.at(-1)!.ms).toBe(500);
    t.fire();
    await t.flush();
    t.sockets[1]!.drop(); // fails before ready
    expect(t.timers.at(-1)!.ms).toBe(1000);
    t.fire();
    await t.flush();
    t.sockets[2]!.open();
    t.sockets[2]!.receive({ type: 'ready' });
    t.sockets[2]!.drop();
    expect(t.timers.at(-1)!.ms).toBe(500); // back to the start
  });

  it('reconnects immediately when the server closes for an expired token', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    t.sockets[0]!.open();
    t.sockets[0]!.receive({ type: 'ready' });
    t.sockets[0]!.drop(4403);
    expect(t.timers.at(-1)!.ms).toBe(0);
  });

  it('asks for a fresh token every time it connects', async () => {
    let n = 0;
    const t = setup(async () => `tok-${++n}`);
    t.client.start();
    await t.flush();
    t.sockets[0]!.open();
    t.sockets[0]!.drop(4403);
    t.fire();
    await t.flush();
    t.sockets[1]!.open();
    expect(JSON.parse(t.sockets[1]!.sent[0]!).token).toBe('tok-2');
  });

  it('waits and retries when there is no token (signed out or offline)', async () => {
    const t = setup(null);
    t.client.start();
    await t.flush();
    expect(t.sockets).toHaveLength(0);
    expect(t.client.status).toBe('waiting');
    expect(t.timers).toHaveLength(1);
  });

  it('survives getToken throwing', async () => {
    const t = setup(async () => {
      throw new Error('offline');
    });
    t.client.start();
    await t.flush();
    expect(t.client.status).toBe('waiting');
  });

  it('stop() closes the socket and never reconnects', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    const s = t.sockets[0]!;
    s.open();
    s.receive({ type: 'ready' });
    t.client.stop();
    expect(s.closedWith).toEqual([1000, 'client_stop']);
    expect(t.client.status).toBe('idle');
    s.drop(); // a late close event from the old socket
    expect(t.timers.filter((x) => !x.cleared)).toHaveLength(0);
    expect(t.sockets).toHaveLength(1);
  });

  it('ignores events from a socket it already abandoned', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    const old = t.sockets[0]!;
    t.client.stop();
    t.client.start();
    await t.flush();
    old.receive({ type: 'typing', conversationId: 'c', userId: 'u', typing: true });
    expect(t.events).toEqual([]);
  });

  it('reconnectNow() skips the wait', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    t.sockets[0]!.open();
    t.sockets[0]!.drop();
    expect(t.client.status).toBe('waiting');
    t.client.reconnectNow();
    await t.flush();
    expect(t.sockets).toHaveLength(2);
    expect(t.timers.at(-1)!.cleared).toBe(true);
  });

  it('only sends typing signals while ready', async () => {
    const t = setup();
    t.client.start();
    await t.flush();
    const s = t.sockets[0]!;
    t.client.sendTyping('c1', true); // still connecting
    s.open();
    t.client.sendTyping('c1', true); // authenticating
    s.receive({ type: 'ready' });
    t.client.sendTyping('c1', true);
    expect(s.sent.map((f) => JSON.parse(f).type)).toEqual(['auth', 'typing']);
    expect(JSON.parse(s.sent[1]!)).toEqual({ type: 'typing', conversationId: 'c1', typing: true });
  });

  it('start() twice does not open two sockets', async () => {
    const t = setup();
    t.client.start();
    t.client.start();
    await t.flush();
    expect(t.sockets).toHaveLength(1);
  });
});
