import { randomBytes, randomUUID } from 'node:crypto';
import type { RealtimeEvent } from '@dyce/shared';
import { hashPhone } from '../../src/auth/crypto.ts';
import { MessagesService, type Publisher } from '../../src/chat/messages.service.ts';
import { FriendsService } from '../../src/social/friends.service.ts';
import { createTestDb, type TestDb } from '../testing/testDb.ts';

const SECRET = 'k'.repeat(40);
const T0 = new Date('2026-11-14T10:00:00Z').getTime();

let db: TestDb;
let chat: MessagesService;
let friends: FriendsService;
/** Each call to the clock moves time forward one second, so messages always have a distinct, ordered time. */
const clock = { t: T0 };
const now = () => new Date((clock.t += 1000));
const setTime = (iso: string) => {
  clock.t = new Date(iso).getTime();
};
const published: { users: readonly string[]; event: RealtimeEvent }[] = [];
const publisher: Publisher = { publish: (users, event) => void published.push({ users, event }) };

beforeAll(async () => {
  db = await createTestDb();
  chat = new MessagesService(db.app, publisher, now);
  friends = new FriendsService(db.app, now);
});
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  clock.t = T0;
  published.length = 0;
});

type Person = { id: string; username: string };
let seq = 0;

async function person(opts: { disabled?: boolean; policy?: 'everyone' | 'fof' | 'nobody' } = {}) {
  const id = randomUUID();
  seq++;
  await db.app.query('INSERT INTO users (id, phone_hash) VALUES ($1, $2)', [
    id,
    hashPhone(SECRET, `+23481${String(50000000 + seq * 13).padStart(8, '0')}`),
  ]);
  const username = `m${seq}_${randomBytes(2).toString('hex')}`;
  await db.app.query(
    'INSERT INTO profiles (id, username, display_name, request_policy) VALUES ($1, $2, $3, $4)',
    [id, username, `Person ${seq}`, opts.policy ?? 'everyone'],
  );
  if (opts.disabled)
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [id]);
  return { id, username } satisfies Person;
}

async function befriend(a: Person, b: Person) {
  await friends.sendRequest(a.id, b.id);
  await friends.accept(b.id, a.id);
}
const block = (blocker: Person, blocked: Person) =>
  db.app.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [
    blocker.id,
    blocked.id,
  ]);
const setPolicy = (p: Person, policy: 'everyone' | 'fof' | 'nobody') =>
  db.admin.query('UPDATE profiles SET request_policy = $2 WHERE id = $1', [p.id, policy]);
const setConfig = (key: string, value: number) =>
  db.admin.query(
    `INSERT INTO app_config (key, value) VALUES ($1, to_jsonb($2::int))
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value],
  );
const code = (c: string) => expect.objectContaining({ code: c });
const say = (from: Person, convId: string, body = 'hello') =>
  chat.send(from.id, convId, { id: randomUUID(), body });
const open = async (a: Person, b: Person) => (await chat.openDirect(a.id, b.id)).id;
const ids = (list: { id: string }[]) => list.map((c) => c.id);

describe('opening a conversation', () => {
  it('creates one conversation per pair, whoever opens it', async () => {
    const a = await person();
    const b = await person();
    const first = await open(a, b);
    expect(await open(a, b)).toBe(first);
    expect(await open(b, a)).toBe(first);
    const n = await db.admin.query(
      `SELECT count(*)::int AS n FROM conversations WHERE kind = 'direct' AND id = $1`,
      [first],
    );
    expect(n.rows[0].n).toBe(1);
  });

  it('is active for both when they are friends, and a request for the other person when not', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b);
    const ab = await db.admin.query(
      `SELECT user_id, state FROM conversation_members WHERE conversation_id = $1`,
      [await open(a, b)],
    );
    expect(ab.rows.map((r) => r.state)).toEqual(['active', 'active']);

    const ac = await db.admin.query(
      `SELECT user_id, state FROM conversation_members WHERE conversation_id = $1`,
      [await open(a, c)],
    );
    expect(Object.fromEntries(ac.rows.map((r) => [r.user_id, r.state]))).toEqual({
      [a.id]: 'active',
      [c.id]: 'request',
    });
  });

  it('shows nothing in anyone’s list until a message is sent', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    await open(a, b);
    expect((await chat.list(a.id)).conversations).toEqual([]);
    expect((await chat.list(b.id)).conversations).toEqual([]);
  });

  it('refuses yourself, unknown people and disabled accounts', async () => {
    const a = await person();
    const gone = await person({ disabled: true });
    await expect(chat.openDirect(a.id, a.id)).rejects.toEqual(code('cannot_add_self'));
    await expect(chat.openDirect(a.id, randomUUID())).rejects.toEqual(code('user_not_found'));
    await expect(chat.openDirect(a.id, gone.id)).rejects.toEqual(code('user_not_found'));
  });

  it('treats someone who blocked you as nonexistent, and tells you if you blocked them', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await block(b, a); // b blocked a
    await block(a, c); // a blocked c
    await expect(chat.openDirect(a.id, b.id)).rejects.toEqual(code('user_not_found'));
    await expect(chat.openDirect(a.id, c.id)).rejects.toEqual(code('blocked'));
  });

  it('two people opening at the same instant still get one conversation', async () => {
    const a = await person();
    const b = await person();
    const [x, y] = await Promise.all([chat.openDirect(a.id, b.id), chat.openDirect(b.id, a.id)]);
    expect(x.id).toBe(y.id);
  });
});

describe('sending between friends', () => {
  it('stores the message, orders them, and shows it in both lists', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const m1 = await say(a, conv, 'first');
    const m2 = await say(b, conv, 'second');
    expect(m1).toMatchObject({ senderId: a.id, body: 'first', kind: 'text', conversationId: conv });
    expect(Date.parse(m2.createdAt)).toBeGreaterThan(Date.parse(m1.createdAt));

    const mine = (await chat.list(a.id)).conversations;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      id: conv,
      state: 'active',
      peer: { id: b.id, username: b.username, relationship: 'friends' },
      lastMessage: { body: 'second' },
      unread: 1, // b's reply
    });
    expect((await chat.list(b.id)).conversations[0]).toMatchObject({ unread: 1 }); // a's first
  });

  it('is idempotent: retrying the same message id returns it and sends nothing new', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const id = randomUUID();
    const one = await chat.send(a.id, conv, { id, body: 'once' });
    published.length = 0;
    const two = await chat.send(a.id, conv, { id, body: 'once' });
    expect(two).toEqual(one);
    expect(published).toEqual([]);
    expect((await chat.messages(a.id, conv)).messages).toHaveLength(1);
  });

  it('does not let a message id be reused in someone else’s conversation', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b);
    await befriend(a, c);
    const id = randomUUID();
    await chat.send(a.id, await open(a, b), { id, body: 'x' });
    await expect(chat.send(a.id, await open(a, c), { id, body: 'x' })).rejects.toEqual(
      code('message_id_taken'),
    );
    await expect(chat.send(b.id, await open(a, b), { id, body: 'x' })).rejects.toEqual(
      code('message_id_taken'),
    );
  });

  it('tells both people (and only them) live', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const m = await say(a, conv);
    expect(published).toHaveLength(1);
    expect([...published[0]!.users].sort()).toEqual([a.id, b.id].sort());
    expect(published[0]!.event).toEqual({ type: 'message', message: m });
    expect(published.flatMap((p) => p.users)).not.toContain(c.id);
  });

  it('still stores the message if live delivery fails', async () => {
    const broken = new MessagesService(
      db.app,
      {
        publish: () => {
          throw new Error('socket exploded');
        },
      },
      now,
    );
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const m = await broken.send(a.id, conv, { id: randomUUID(), body: 'still here' });
    expect((await chat.messages(b.id, conv)).messages[0]).toEqual(m);
  });

  it('refuses an empty or oversized body at the database', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await expect(say(a, conv, '')).rejects.toThrow();
    await expect(say(a, conv, 'x'.repeat(4001))).rejects.toThrow();
    await expect(say(a, conv, 'x'.repeat(4000))).resolves.toBeDefined();
  });

  it('many people sending at once all arrive, once', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await Promise.all(Array.from({ length: 12 }, (_, i) => say(i % 2 ? a : b, conv, `burst ${i}`)));
    expect((await chat.messages(a.id, conv, { limit: 50 })).messages).toHaveLength(12);
  });
});

describe('who can see a conversation', () => {
  it('only its two members can read, send, mark read, accept or decline', async () => {
    const a = await person();
    const b = await person();
    const spy = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv);
    await expect(chat.get(spy.id, conv)).rejects.toEqual(code('conversation_not_found'));
    await expect(chat.messages(spy.id, conv)).rejects.toEqual(code('conversation_not_found'));
    await expect(say(spy, conv)).rejects.toEqual(code('conversation_not_found'));
    await expect(chat.markRead(spy.id, conv)).rejects.toEqual(code('conversation_not_found'));
    await expect(chat.accept(spy.id, conv)).rejects.toEqual(code('conversation_not_found'));
    await expect(chat.decline(spy.id, conv)).rejects.toEqual(code('conversation_not_found'));
    expect((await chat.list(spy.id)).conversations).toEqual([]);
  });

  it('a blocked person disappears from lists and can no longer send', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv);
    await block(b, a);
    expect((await chat.list(a.id)).conversations).toEqual([]);
    await expect(say(a, conv)).rejects.toEqual(code('user_not_found'));
    await expect(chat.messages(a.id, conv)).resolves.toBeDefined(); // history stays readable to its owner
  });

  it('a disabled account drops out of the list', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    await say(a, await open(a, b));
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [b.id]);
    expect((await chat.list(a.id)).conversations).toEqual([]);
  });
});

describe('messages from someone who is not a friend (Requests)', () => {
  it('lands in the recipient’s Requests, never in their Chat', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv, 'hey, want to play?');

    const all = await chat.list(me.id, 'all');
    expect(all.conversations).toEqual([]);
    expect(all.requestCount).toBe(1);
    expect(all.unreadTotal).toBe(0); // requests don't count toward the Chat badge

    const reqs = await chat.list(me.id, 'requests');
    expect(reqs.conversations).toHaveLength(1);
    expect(reqs.conversations[0]).toMatchObject({
      id: conv,
      state: 'request',
      peer: { id: stranger.id, relationship: 'none' },
      lastMessage: { body: 'hey, want to play?' },
    });
    expect((await chat.list(me.id, 'friends')).conversations).toEqual([]);
  });

  it('shows the sender their own message as an ordinary chat', async () => {
    const stranger = await person();
    const me = await person();
    await say(stranger, await open(stranger, me));
    const mine = await chat.list(stranger.id);
    expect(mine.conversations).toHaveLength(1);
    expect(mine.conversations[0]!.state).toBe('active');
    expect(mine.requestCount).toBe(0);
  });

  it('lets only a few messages through before the other person answers', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv, '1');
    await say(stranger, conv, '2');
    await say(stranger, conv, '3');
    await expect(say(stranger, conv, '4')).rejects.toEqual(code('request_pending'));
    expect((await chat.messages(me.id, conv)).messages).toHaveLength(3);
  });

  it('honours a changed limit', async () => {
    await setConfig('request_messages_before_accept', 1);
    try {
      const stranger = await person();
      const me = await person();
      const conv = await open(stranger, me);
      await say(stranger, conv);
      await expect(say(stranger, conv)).rejects.toEqual(code('request_pending'));
    } finally {
      await setConfig('request_messages_before_accept', 3);
    }
  });

  it('replying is accepting: the chat moves into the replier’s Chat and the limit goes away', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv, '1');
    await say(stranger, conv, '2');
    await say(stranger, conv, '3');
    await say(me, conv, 'hi!');
    expect((await chat.list(me.id, 'requests')).conversations).toEqual([]);
    expect(ids((await chat.list(me.id)).conversations)).toEqual([conv]);
    await expect(say(stranger, conv, '4')).resolves.toBeDefined();
  });

  it('accepting moves it into Chat without sending anything', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv, 'hi');
    published.length = 0;
    const summary = await chat.accept(me.id, conv);
    expect(summary.state).toBe('active');
    expect(ids((await chat.list(me.id)).conversations)).toEqual([conv]);
    expect((await chat.list(me.id)).requestCount).toBe(0);
    expect(published).toEqual([]);
    await expect(chat.accept(me.id, conv)).resolves.toMatchObject({ state: 'active' }); // idempotent
  });

  it('declining hides it silently, and the sender is told nothing', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv, 'hi');
    await chat.decline(me.id, conv);
    await chat.decline(me.id, conv); // idempotent

    expect((await chat.list(me.id, 'requests')).conversations).toEqual([]);
    expect((await chat.list(me.id)).requestCount).toBe(0);
    // the sender's view is unchanged and they can keep writing (up to the same limit)
    expect((await chat.list(stranger.id)).conversations[0]).toMatchObject({ state: 'active' });
    published.length = 0;
    await say(stranger, conv, 'anyone there?');
    expect(published).toHaveLength(1);
    expect(published[0]!.users).toEqual([stranger.id]); // not delivered live to the person who ignored it
    await say(stranger, conv, 'hello?');
    await expect(say(stranger, conv, 'please?')).rejects.toEqual(code('request_pending'));
  });

  it('can still be accepted after it was declined', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv);
    await chat.decline(me.id, conv);
    await chat.accept(me.id, conv);
    expect(ids((await chat.list(me.id)).conversations)).toEqual([conv]);
  });

  it('cannot decline a normal chat', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv);
    await expect(chat.decline(b.id, conv)).rejects.toEqual(code('conversation_not_found'));
    // and the sender can't "decline" their own outgoing message either
    const s = await person();
    const r = await person();
    const c2 = await open(s, r);
    await say(s, c2);
    await expect(chat.decline(s.id, c2)).rejects.toEqual(code('conversation_not_found'));
  });

  it('becoming friends turns a request, even an ignored one, into an ordinary chat', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv, 'hi');
    await chat.decline(me.id, conv);
    await befriend(stranger, me);

    expect(ids((await chat.list(me.id)).conversations)).toEqual([conv]);
    expect((await chat.list(me.id, 'friends')).conversations).toHaveLength(1);
    expect((await chat.list(me.id)).requestCount).toBe(0);
    published.length = 0;
    await say(stranger, conv, 'we are friends now');
    expect([...published[0]!.users].sort()).toEqual([stranger.id, me.id].sort());
  });

  it('respects “nobody can message me”', async () => {
    const closed = await person();
    const friend = await person();
    await befriend(friend, closed); // friends first: a "nobody" policy also refuses friend requests
    await setPolicy(closed, 'nobody');
    const stranger = await person();
    const conv = await open(stranger, closed);
    await expect(say(stranger, conv)).rejects.toEqual(code('requests_closed'));
    // friends are not strangers
    await expect(say(friend, await open(friend, closed))).resolves.toBeDefined();
  });

  it('respects “friends of friends only”', async () => {
    const guarded = await person();
    const mutual = await person();
    await befriend(mutual, guarded);
    await setPolicy(guarded, 'fof');
    const knows = await person();
    await befriend(knows, mutual);
    const stranger = await person();
    await expect(say(stranger, await open(stranger, guarded))).rejects.toEqual(
      code('requests_closed'),
    );
    await expect(say(knows, await open(knows, guarded))).resolves.toBeDefined();
  });

  it('limits how many new strangers one person can write to per day, and resets at Lagos midnight', async () => {
    await setConfig('stranger_requests_per_day', 2);
    try {
      setTime('2026-11-14T10:00:00Z');
      const spammer = await person();
      const targets = [await person(), await person(), await person()];
      await say(spammer, await open(spammer, targets[0]!));
      await say(spammer, await open(spammer, targets[1]!));
      await expect(say(spammer, await open(spammer, targets[2]!))).rejects.toEqual(
        code('message_requests_rate_limited'),
      );
      // more messages in the conversations already started are not new requests
      await expect(say(spammer, await open(spammer, targets[0]!), 'again')).resolves.toBeDefined();
      // Lagos is UTC+1: midnight there is 23:00 UTC
      setTime('2026-11-14T23:30:00Z');
      await expect(say(spammer, await open(spammer, targets[2]!))).resolves.toBeDefined();
    } finally {
      await setConfig('stranger_requests_per_day', 20);
    }
  });

  it('does not tell a stranger when a request is opened or read', async () => {
    const stranger = await person();
    const me = await person();
    const conv = await open(stranger, me);
    await say(stranger, conv);
    published.length = 0;
    await chat.markRead(me.id, conv);
    expect(published).toEqual([]);
    expect((await chat.messages(stranger.id, conv)).peerReadAt).toBeNull();
    // ...but the request itself no longer counts as unread for me
    expect((await chat.list(me.id, 'requests')).conversations[0]!.unread).toBe(0);
  });
});

describe('reading', () => {
  it('clears unread, tells the other person, and shows them “read up to here”', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv, 'one');
    await say(a, conv, 'two');
    expect((await chat.list(b.id)).unreadTotal).toBe(2);
    expect((await chat.messages(a.id, conv)).peerReadAt).toBeNull();

    published.length = 0;
    const { readAt } = await chat.markRead(b.id, conv);
    expect((await chat.list(b.id)).unreadTotal).toBe(0);
    expect(published).toEqual([
      {
        users: [a.id],
        event: { type: 'read', conversationId: conv, userId: b.id, at: readAt },
      },
    ]);
    expect((await chat.messages(a.id, conv)).peerReadAt).toBe(readAt);
  });

  it('never moves the read marker backwards, and your own messages are never unread to you', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv, 'hi');
    expect((await chat.list(a.id)).conversations[0]!.unread).toBe(0);
    const marker = async () =>
      (
        await db.admin.query(
          `SELECT last_read_at FROM conversation_members WHERE conversation_id = $1 AND user_id = $2`,
          [conv, a.id],
        )
      ).rows[0].last_read_at as Date;
    await chat.markRead(a.id, conv);
    const before = await marker();
    setTime('2026-11-14T08:00:00Z'); // an earlier clock reading
    await chat.markRead(a.id, conv);
    expect((await marker()).getTime()).toBeGreaterThanOrEqual(before.getTime());
  });

  it('sending does not mark what you have not seen as read', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv, 'you there?');
    await say(b, conv, 'yes'); // b replies without opening the thread
    expect((await chat.list(b.id)).conversations[0]!.unread).toBe(1);
    expect((await chat.messages(a.id, conv)).peerReadAt).toBeNull();
  });

  it('counts unread per conversation, capped at 99', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const rows = Array.from({ length: 105 }, (_, i) => [
      randomUUID(),
      conv,
      a.id,
      `m${i}`,
      new Date(T0 + i * 1000),
    ]);
    for (const r of rows) {
      await db.admin.query(
        `INSERT INTO messages (id, conversation_id, sender_id, kind, body, created_at)
         VALUES ($1, $2, $3, 'text', $4, $5)`,
        [r[0], r[1], r[2], r[3], r[4]],
      );
    }
    await db.admin.query(`UPDATE conversations SET last_message_at = now() WHERE id = $1`, [conv]);
    expect((await chat.list(b.id)).conversations[0]!.unread).toBe(99);
  });
});

describe('history', () => {
  it('pages newest first with a cursor, without gaps or repeats', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    for (let i = 1; i <= 75; i++) await say(i % 2 ? a : b, conv, `msg ${i}`);

    const seen: string[] = [];
    let before: string | undefined;
    let pages = 0;
    for (;;) {
      const page = await chat.messages(a.id, conv, { before, limit: 30 });
      pages++;
      seen.push(...page.messages.map((m) => m.body));
      if (!page.nextCursor) break;
      before = page.nextCursor;
    }
    expect(pages).toBe(3);
    expect(seen).toHaveLength(75);
    expect(seen[0]).toBe('msg 75');
    expect(seen[74]).toBe('msg 1');
    expect(new Set(seen).size).toBe(75);
  });

  it('keeps messages that share a timestamp in a stable order across pages', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const same = new Date(T0 + 5000);
    for (let i = 0; i < 7; i++) {
      await db.admin.query(
        `INSERT INTO messages (id, conversation_id, sender_id, kind, body, created_at)
         VALUES ($1, $2, $3, 'text', $4, $5)`,
        [randomUUID(), conv, a.id, `same ${i}`, same],
      );
    }
    const first = await chat.messages(a.id, conv, { limit: 3 });
    const second = await chat.messages(a.id, conv, { limit: 3, before: first.nextCursor! });
    const third = await chat.messages(a.id, conv, { limit: 3, before: second.nextCursor! });
    const all = [...first.messages, ...second.messages, ...third.messages].map((m) => m.body);
    expect(new Set(all).size).toBe(7);
    expect(third.nextCursor).toBeNull();
  });

  it('is empty for a new conversation', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    expect(await chat.messages(a.id, await open(a, b))).toEqual({
      messages: [],
      nextCursor: null,
      peerReadAt: null,
    });
  });

  it('does not return deleted messages', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    const gone = await say(a, conv, 'oops');
    await say(a, conv, 'keep');
    await db.admin.query(`UPDATE messages SET deleted_at = now() WHERE id = $1`, [gone.id]);
    expect((await chat.messages(b.id, conv)).messages.map((m) => m.body)).toEqual(['keep']);
    expect((await chat.list(b.id)).conversations[0]!.lastMessage!.body).toBe('keep');
  });
});

describe('the list', () => {
  it('orders by latest activity and splits Friends from the rest', async () => {
    const me = await person();
    const old = await person();
    const recent = await person();
    const accepted = await person(); // not a friend, but their request was accepted
    await befriend(me, old);
    await befriend(me, recent);
    await say(old, await open(old, me), 'older');
    await say(recent, await open(recent, me), 'newer');
    const stranger = await open(accepted, me);
    await say(accepted, stranger, 'hi from a stranger');
    await chat.accept(me.id, stranger);
    await say(me, stranger, 'newest');

    const all = await chat.list(me.id);
    expect(all.conversations.map((c) => c.peer.id)).toEqual([accepted.id, recent.id, old.id]);
    expect((await chat.list(me.id, 'friends')).conversations.map((c) => c.peer.id)).toEqual([
      recent.id,
      old.id,
    ]);
  });

  it('keeps one person’s conversations out of another’s list', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b);
    await say(a, await open(a, b));
    expect((await chat.list(c.id)).conversations).toEqual([]);
  });

  it('does not expose phone numbers', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    await say(a, conv);
    const text = JSON.stringify([await chat.list(a.id), await chat.get(b.id, conv)]);
    expect(text).not.toMatch(/\+234|phone/i);
  });
});

describe('typing signals', () => {
  it('go to the other person in a normal chat or a pending request', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    expect(await chat.typingTarget(a.id, await open(a, b))).toBe(b.id);
    const s = await person();
    const r = await person();
    expect(await chat.typingTarget(s.id, await open(s, r))).toBe(r.id);
  });

  it('go nowhere for outsiders, blocked people, or someone who ignored the request', async () => {
    const a = await person();
    const b = await person();
    const out = await person();
    await befriend(a, b);
    const conv = await open(a, b);
    expect(await chat.typingTarget(out.id, conv)).toBeNull();
    expect(await chat.typingTarget(a.id, randomUUID())).toBeNull();

    const s = await person();
    const r = await person();
    const c2 = await open(s, r);
    await say(s, c2);
    await chat.decline(r.id, c2);
    expect(await chat.typingTarget(s.id, c2)).toBeNull();

    await block(b, a);
    expect(await chat.typingTarget(a.id, conv)).toBeNull();
  });
});

describe('integrity', () => {
  it('every direct conversation has exactly two members and a key', async () => {
    const bad = await db.admin.query(`
      SELECT c.id FROM conversations c
       WHERE c.kind = 'direct'
         AND (c.direct_key IS NULL
              OR (SELECT count(*) FROM conversation_members m WHERE m.conversation_id = c.id) <> 2)`);
    expect(bad.rows).toEqual([]);
  });

  it('the database refuses a direct conversation without a key, and two for one pair', async () => {
    await expect(
      db.admin.query(`INSERT INTO conversations (kind) VALUES ('direct')`),
    ).rejects.toThrow();
    const a = await person();
    const b = await person();
    await open(a, b);
    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    await expect(
      db.admin.query(`INSERT INTO conversations (kind, direct_key) VALUES ('direct', $1)`, [key]),
    ).rejects.toThrow();
  });
});
