import type { CanvasMessage } from '@dyce/games';
import type { LiveState } from '@dyce/shared';
import { LiveConnection, tableIsGone, type LiveStatus, type RoomLike } from './live-connection';

class FakeRoom implements RoomLike {
  handlers = new Map<string, (m: never) => void>();
  leaveCb: ((code: number) => void) | null = null;
  sent: [string, unknown][] = [];
  left: boolean | undefined;
  onMessage(type: string, cb: (m: never) => void) {
    this.handlers.set(type, cb);
  }
  onLeave(cb: (code: number) => void) {
    this.leaveCb = cb;
  }
  send(type: string, message?: unknown) {
    this.sent.push([type, message]);
  }
  leave(consented?: boolean) {
    this.left = consented;
  }
  emit(type: string, m: unknown) {
    this.handlers.get(type)?.(m as never);
  }
  drop(code = 1006) {
    this.leaveCb?.(code);
  }
}

const flush = () => new Promise((r) => setImmediate(r));
const state = (over: Partial<LiveState> = {}): LiveState => ({
  matchId: 'm',
  spaceId: 's',
  gameSlug: 'whot',
  mode: 'free',
  version: 0,
  status: 'live',
  view: {},
  seats: [],
  turnUserId: null,
  turnDeadlineAt: null,
  roomKind: 'turns',
  canAct: false,
  waiting: false,
  serverNow: 0,
  results: null,
  ...over,
});

function setup(opens: (() => Promise<RoomLike>)[]) {
  const states: LiveState[] = [];
  const errors: unknown[] = [];
  const statuses: LiveStatus[] = [];
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let n = 0;
  const conn = new LiveConnection({
    open: () => (opens[n++] ?? opens[opens.length - 1]!)(),
    onState: (s) => states.push(s),
    onError: (e) => errors.push(e),
    onStatus: (s) => statuses.push(s),
    setTimer: (fn, ms) => {
      const id = timers.length + 1;
      timers.push({ fn, ms, id });
      return id;
    },
    clearTimer: (id) => {
      const i = timers.findIndex((t) => t.id === id);
      if (i >= 0) timers.splice(i, 1);
    },
    random: () => 0.5,
  });
  return { conn, states, errors, statuses, timers, opened: () => n };
}

describe('LiveConnection canvas', () => {
  it('hands every `canvas` message of the current room to the screen, in order, and ignores a room that was dropped', async () => {
    const a = new FakeRoom();
    const b = new FakeRoom();
    const got: CanvasMessage[] = [];
    const conn = new LiveConnection({
      open: (() => {
        const rooms = [a, b];
        return async () => rooms.shift() as RoomLike;
      })(),
      onState: () => undefined,
      onError: () => undefined,
      onCanvas: (m) => got.push(m),
      onStatus: () => undefined,
      setTimer: (fn) => {
        fn();
        return 1;
      },
      clearTimer: () => undefined,
      random: () => 0,
    });
    conn.start();
    await flush();
    const m1: CanvasMessage = { turn: 0, reset: true, strokes: [], extend: [] };
    const m2: CanvasMessage = {
      turn: 0,
      reset: false,
      strokes: [{ id: 1, color: 0, width: 4, pts: [[1, 2]] }],
      extend: [],
    };
    a.emit('canvas', m1);
    a.emit('canvas', m2);
    expect(got).toEqual([m1, m2]);
    // The line drops and the next one opens: only the new room's messages count.
    a.drop();
    await flush();
    a.emit('canvas', m2);
    b.emit('canvas', m1);
    expect(got).toEqual([m1, m2, m1]);
  });
});

describe('LiveConnection', () => {
  it('connects, passes state and errors through, and sends moves', async () => {
    const room = new FakeRoom();
    const t = setup([async () => room]);
    t.conn.start();
    await flush();
    expect(t.statuses).toEqual(['connecting', 'live']);
    room.emit('state', state({ version: 3 }));
    room.emit('error', { code: 'not_your_turn' });
    expect(t.states.map((s) => s.version)).toEqual([3]);
    expect(t.errors).toEqual([{ code: 'not_your_turn' }]);
    expect(t.conn.send('move', { expectedVersion: 3, action: { kind: 'draw' } })).toBe(true);
    expect(room.sent).toEqual([['move', { expectedVersion: 3, action: { kind: 'draw' } }]]);
  });

  it('a dropped line is rejoined with a growing pause, and the table stays as it was', async () => {
    const first = new FakeRoom();
    const second = new FakeRoom();
    const t = setup([
      async () => first,
      async () => Promise.reject(new Error('offline')),
      async () => second,
    ]);
    t.conn.start();
    await flush();
    first.drop();
    expect(t.statuses.at(-1)).toBe('reconnecting');
    expect(t.timers).toHaveLength(1);
    const firstPause = t.timers[0]!.ms;
    t.timers.shift()!.fn(); // the join fails
    await flush();
    expect(t.statuses.at(-1)).toBe('reconnecting');
    expect(t.timers).toHaveLength(1);
    expect(t.timers[0]!.ms).toBeGreaterThan(firstPause);
    t.timers.shift()!.fn();
    await flush();
    expect(t.statuses.at(-1)).toBe('live');
    second.emit('state', state({ version: 9 }));
    expect(t.states.at(-1)!.version).toBe(9);
    expect(t.opened()).toBe(3);
  });

  it('ignores the old room once a new one is open', async () => {
    const first = new FakeRoom();
    const second = new FakeRoom();
    const t = setup([async () => first, async () => second]);
    t.conn.start();
    await flush();
    first.drop();
    t.timers.shift()!.fn();
    await flush();
    first.emit('state', state({ version: 100 }));
    first.drop();
    expect(t.states).toEqual([]);
    expect(t.statuses.at(-1)).toBe('live');
    expect(t.timers).toHaveLength(0);
  });

  it('a table opened on another device ends this one without retrying', async () => {
    const room = new FakeRoom();
    const t = setup([async () => room]);
    t.conn.start();
    await flush();
    room.drop(4010);
    expect(t.statuses.at(-1)).toBe('replaced');
    expect(t.timers).toHaveLength(0);
  });

  it('after the result the server closes the table: that is the end, not a drop', async () => {
    const room = new FakeRoom();
    const t = setup([async () => room]);
    t.conn.start();
    await flush();
    room.emit('state', state({ status: 'finished' }));
    room.drop(1000);
    expect(t.statuses.at(-1)).toBe('ended');
    expect(t.timers).toHaveLength(0);
  });

  it('a table that is gone stops the retries', async () => {
    const t = setup([
      async () => Promise.reject(Object.assign(new Error('x'), { code: 'space_not_open' })),
    ]);
    t.conn.start();
    await flush();
    expect(t.statuses.at(-1)).toBe('ended');
    expect(t.timers).toHaveLength(0);
    expect(tableIsGone({ code: 4404 })).toBe(true);
    expect(tableIsGone({ code: 4403 })).toBe(true);
    expect(tableIsGone({ status: 404 })).toBe(true);
    expect(tableIsGone({ code: 'network' })).toBe(false);
    expect(tableIsGone(new Error('boom'))).toBe(false);
  });

  it('stop closes the line and cancels any pending retry', async () => {
    const room = new FakeRoom();
    const t = setup([async () => room]);
    t.conn.start();
    await flush();
    room.drop();
    expect(t.timers).toHaveLength(1);
    t.conn.stop();
    expect(t.timers).toHaveLength(0);

    const live = new FakeRoom();
    const t2 = setup([async () => live]);
    t2.conn.start();
    await flush();
    t2.conn.stop();
    expect(live.left).toBe(true);
    expect(t2.conn.send('move')).toBe(false);
  });

  it('coming back to the app retries at once', async () => {
    const t = setup([async () => Promise.reject(new Error('offline')), async () => new FakeRoom()]);
    t.conn.start();
    await flush();
    expect(t.timers).toHaveLength(1);
    t.conn.reconnectNow();
    await flush();
    expect(t.statuses.at(-1)).toBe('live');
    expect(t.timers).toHaveLength(0);
  });
});
