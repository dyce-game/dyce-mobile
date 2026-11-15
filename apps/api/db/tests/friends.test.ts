import { randomBytes, randomUUID } from 'node:crypto';
import { hashPhone } from '../../src/auth/crypto.ts';
import { FriendsService } from '../../src/social/friends.service.ts';
import { createTestDb, type TestDb } from '../testing/testDb.ts';

const SECRET = 'k'.repeat(40);

let db: TestDb;
let friends: FriendsService;
const clock = { now: new Date('2026-11-14T10:00:00Z') };
const at = (minutes: number) => {
  clock.now = new Date(new Date('2026-11-14T10:00:00Z').getTime() + minutes * 60_000);
};

beforeAll(async () => {
  db = await createTestDb();
  friends = new FriendsService(db.app, () => clock.now);
});
afterAll(async () => {
  await db.close();
});
beforeEach(() => at(0));

type Person = { id: string; username: string };
let seq = 0;

async function person(opts: { disabled?: boolean } = {}): Promise<Person> {
  const id = randomUUID();
  seq++;
  await db.app.query('INSERT INTO users (id, phone_hash) VALUES ($1, $2)', [
    id,
    hashPhone(SECRET, `+23480${String(40000000 + seq * 17).padStart(8, '0')}`),
  ]);
  const username = `f${seq}_${randomBytes(2).toString('hex')}`;
  await db.app.query('INSERT INTO profiles (id, username, display_name) VALUES ($1, $2, $3)', [
    id,
    username,
    `Friend ${seq}`,
  ]);
  if (opts.disabled)
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [id]);
  return { id, username };
}

/** Make a and b friends. */
async function befriend(a: Person, b: Person) {
  await friends.sendRequest(a.id, b.id);
  await friends.accept(b.id, a.id);
}
const block = (blocker: Person, blocked: Person) =>
  db.app.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [
    blocker.id,
    blocked.id,
  ]);
const code = (c: string) => expect.objectContaining({ code: c });
const rows = async (a: Person, b: Person) =>
  (
    await db.admin.query(
      `SELECT status, requested_by, responded_at FROM friendships
        WHERE user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)`,
      [a.id, b.id],
    )
  ).rows;
const names = (list: { username: string }[]) => list.map((f) => f.username);

describe('list', () => {
  it('is empty for a new user', async () => {
    expect((await friends.list((await person()).id)).friends).toEqual([]);
  });

  it('lists accepted friends A-Z with the date the friendship began', async () => {
    const me = await person();
    const zed = await person();
    const amy = await person();
    at(5);
    await friends.sendRequest(me.id, zed.id);
    at(30);
    await friends.accept(zed.id, me.id);
    at(10);
    await befriend(amy, me);

    const { friends: list } = await friends.list(me.id);
    expect(names(list)).toEqual([zed.username, amy.username].sort());
    const zedEntry = list.find((f) => f.id === zed.id)!;
    expect(zedEntry.since).toBe(new Date('2026-11-14T10:30:00Z').toISOString()); // when zed accepted
    expect(Object.keys(zedEntry).sort()).toEqual(['displayName', 'id', 'since', 'username']);
  });

  it('shows the friendship from both sides', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    expect(names((await friends.list(a.id)).friends)).toEqual([b.username]);
    expect(names((await friends.list(b.id)).friends)).toEqual([a.username]);
  });

  it('leaves out pending and ignored requests, blocked people and disabled accounts', async () => {
    const me = await person();
    const pending = await person();
    const ignored = await person();
    const blockedByMe = await person();
    const blockedMe = await person();
    const disabled = await person();
    const ok = await person();
    await friends.sendRequest(me.id, pending.id);
    await friends.sendRequest(ignored.id, me.id);
    await friends.decline(me.id, ignored.id);
    for (const p of [blockedByMe, blockedMe, disabled, ok]) await befriend(me, p);
    await block(me, blockedByMe);
    await block(blockedMe, me);
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [disabled.id]);
    expect(names((await friends.list(me.id)).friends)).toEqual([ok.username]);
  });

  it("never mixes up other people's friends", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b);
    expect((await friends.list(c.id)).friends).toEqual([]);
  });
});

describe('requests', () => {
  it('lists incoming requests newest first and outgoing ones you sent', async () => {
    const me = await person();
    const first = await person();
    const second = await person();
    const asked = await person();
    at(1);
    await friends.sendRequest(first.id, me.id);
    at(2);
    await friends.sendRequest(second.id, me.id);
    at(3);
    await friends.sendRequest(me.id, asked.id);

    const r = await friends.requests(me.id);
    expect(names(r.incoming.map((i) => i.user))).toEqual([second.username, first.username]);
    expect(r.incoming.every((i) => i.user.relationship === 'pending_in')).toBe(true);
    expect(names(r.outgoing.map((o) => o.user))).toEqual([asked.username]);
    expect(r.outgoing[0]!.user.relationship).toBe('pending_out');
    expect(r.incoming[0]!.requestedAt).toBe(new Date('2026-11-14T10:02:00Z').toISOString());
  });

  it('counts the friends you share with each requester', async () => {
    const me = await person();
    const requester = await person();
    const loner = await person();
    const [m1, m2, m3] = [await person(), await person(), await person()];
    await befriend(me, m1);
    await befriend(me, m2);
    await befriend(requester, m1);
    await befriend(requester, m2);
    await befriend(requester, m3); // not shared
    await friends.sendRequest(requester.id, me.id);
    await friends.sendRequest(loner.id, me.id);
    const r = await friends.requests(me.id);
    expect(Object.fromEntries(r.incoming.map((i) => [i.user.username, i.mutualFriends]))).toEqual({
      [requester.username]: 2,
      [loner.username]: 0,
    });
  });

  it('hides blocked and disabled people', async () => {
    const me = await person();
    const blocked = await person();
    const blockedMe = await person();
    const disabled = await person();
    const ok = await person();
    for (const p of [blocked, blockedMe, disabled, ok]) await friends.sendRequest(p.id, me.id);
    await block(me, blocked);
    await block(blockedMe, me);
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [disabled.id]);
    expect(names((await friends.requests(me.id)).incoming.map((i) => i.user))).toEqual([
      ok.username,
    ]);
  });

  it('a request you ignored disappears for you, but the sender still sees it as sent', async () => {
    const me = await person();
    const sender = await person();
    await friends.sendRequest(sender.id, me.id);
    await friends.decline(me.id, sender.id);
    expect((await friends.requests(me.id)).incoming).toEqual([]);
    const sent = await friends.requests(sender.id);
    expect(names(sent.outgoing.map((o) => o.user))).toEqual([me.username]);
    expect(sent.outgoing[0]!.user.relationship).toBe('pending_out'); // nothing reveals the ignore
  });
});

describe('accept', () => {
  it('turns a request into a friendship for both people, and records when', async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    at(7);
    expect(await friends.accept(b.id, a.id)).toEqual({ relationship: 'friends' });
    expect(names((await friends.list(a.id)).friends)).toEqual([b.username]);
    expect((await friends.requests(b.id)).incoming).toEqual([]);
    expect((await friends.requests(a.id)).outgoing).toEqual([]);
    expect((await rows(a, b))[0]).toMatchObject({ status: 'accepted' });
  });

  it('is idempotent', async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    await friends.accept(b.id, a.id);
    expect(await friends.accept(b.id, a.id)).toEqual({ relationship: 'friends' });
    expect(await rows(a, b)).toHaveLength(1);
  });

  it('can accept a request you earlier ignored', async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    await friends.decline(b.id, a.id);
    expect(await friends.accept(b.id, a.id)).toEqual({ relationship: 'friends' });
  });

  it('refuses when there is nothing to accept', async () => {
    const a = await person();
    const b = await person();
    await expect(friends.accept(a.id, b.id)).rejects.toEqual(code('friend_request_not_found'));
    await expect(friends.accept(a.id, randomUUID())).rejects.toEqual(
      code('friend_request_not_found'),
    );
    await expect(friends.accept(a.id, a.id)).rejects.toEqual(code('cannot_add_self'));
  });

  it("can't accept your own outgoing request", async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    await expect(friends.accept(a.id, b.id)).rejects.toEqual(code('friend_request_not_found'));
    expect(await rows(a, b)).toMatchObject([{ status: 'pending' }]);
  });

  it('refuses if the requester is blocked, blocked you, or was disabled', async () => {
    const me = await person();
    const blocked = await person();
    const blockedMe = await person();
    const disabled = await person();
    for (const p of [blocked, blockedMe, disabled]) await friends.sendRequest(p.id, me.id);
    await block(me, blocked);
    await block(blockedMe, me);
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [disabled.id]);
    for (const p of [blocked, blockedMe, disabled]) {
      await expect(friends.accept(me.id, p.id)).rejects.toEqual(code('friend_request_not_found'));
    }
  });

  it('two simultaneous accepts leave one friendship', async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    await Promise.all([friends.accept(b.id, a.id), friends.accept(b.id, a.id)]);
    expect(await rows(a, b)).toHaveLength(1);
  });
});

describe('ignore (decline)', () => {
  it('hides the request and says nothing to the sender', async () => {
    const me = await person();
    const sender = await person();
    await friends.sendRequest(sender.id, me.id);
    expect(await friends.decline(me.id, sender.id)).toEqual({ relationship: 'none' });
    expect((await rows(me, sender))[0]).toMatchObject({ status: 'declined' });
    // the sender's view is unchanged
    expect((await friends.findByUsername(sender.id, me.username)).relationship).toBe('pending_out');
    // and from my side they are a stranger again
    expect((await friends.findByUsername(me.id, sender.username)).relationship).toBe('none');
  });

  it('the sender cannot ask again (and is not told why)', async () => {
    const me = await person();
    const sender = await person();
    await friends.sendRequest(sender.id, me.id);
    await friends.decline(me.id, sender.id);
    expect(await friends.sendRequest(sender.id, me.id)).toEqual({ relationship: 'pending_out' });
    expect(await rows(me, sender)).toMatchObject([{ status: 'declined' }]); // still ignored, still one row
  });

  it('adding back the person you ignored makes you friends', async () => {
    const me = await person();
    const sender = await person();
    await friends.sendRequest(sender.id, me.id);
    await friends.decline(me.id, sender.id);
    expect(await friends.sendRequest(me.id, sender.id)).toEqual({ relationship: 'friends' });
  });

  it('after the sender withdraws an ignored request, they could ask again', async () => {
    const me = await person();
    const sender = await person();
    await friends.sendRequest(sender.id, me.id);
    await friends.decline(me.id, sender.id);
    await friends.cancel(sender.id, me.id);
    expect(await rows(me, sender)).toEqual([]);
    expect(await friends.sendRequest(sender.id, me.id)).toEqual({ relationship: 'pending_out' });
  });

  it('is idempotent, and does not apply to friends or to your own requests', async () => {
    const me = await person();
    const sender = await person();
    const friend = await person();
    const asked = await person();
    await friends.sendRequest(sender.id, me.id);
    await friends.decline(me.id, sender.id);
    await expect(friends.decline(me.id, sender.id)).resolves.toEqual({ relationship: 'none' });
    await befriend(me, friend);
    await expect(friends.decline(me.id, friend.id)).rejects.toEqual(
      code('friend_request_not_found'),
    );
    await friends.sendRequest(me.id, asked.id);
    await expect(friends.decline(me.id, asked.id)).rejects.toEqual(
      code('friend_request_not_found'),
    );
    await expect(friends.decline(me.id, me.id)).rejects.toEqual(code('cannot_add_self'));
  });
});

describe('cancel', () => {
  it('withdraws a request you sent', async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    await friends.cancel(a.id, b.id);
    expect(await rows(a, b)).toEqual([]);
    expect((await friends.requests(b.id)).incoming).toEqual([]);
  });

  it("can't withdraw someone else's request, a friendship, or something that isn't there", async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await friends.sendRequest(a.id, b.id);
    await friends.cancel(b.id, a.id); // b did not send it
    expect(await rows(a, b)).toMatchObject([{ status: 'pending' }]);

    await befriend(a, c);
    await friends.cancel(a.id, c.id);
    await friends.cancel(c.id, a.id);
    expect(await rows(a, c)).toMatchObject([{ status: 'accepted' }]);

    await expect(friends.cancel(a.id, randomUUID())).resolves.toBeUndefined();
  });
});

describe('remove', () => {
  it('ends a friendship for both people, and either can be the one who removes', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await befriend(a, b);
    await befriend(a, c);
    await friends.remove(a.id, b.id);
    await friends.remove(c.id, a.id);
    expect((await friends.list(a.id)).friends).toEqual([]);
    expect((await friends.list(b.id)).friends).toEqual([]);
    expect((await friends.list(c.id)).friends).toEqual([]);
  });

  it('is idempotent and leaves pending requests alone', async () => {
    const a = await person();
    const b = await person();
    await friends.sendRequest(a.id, b.id);
    await friends.remove(a.id, b.id);
    await friends.remove(a.id, b.id);
    expect(await rows(a, b)).toMatchObject([{ status: 'pending' }]);
    await expect(friends.remove(a.id, randomUUID())).resolves.toBeUndefined();
  });

  it('after removing, you are strangers again and can become friends later', async () => {
    const a = await person();
    const b = await person();
    await befriend(a, b);
    await friends.remove(a.id, b.id);
    expect((await friends.findByUsername(a.id, b.username)).relationship).toBe('none');
    await friends.sendRequest(b.id, a.id);
    expect(await friends.accept(a.id, b.id)).toEqual({ relationship: 'friends' });
  });
});

describe('integrity', () => {
  it('every row keeps low < high and a valid requester after all of the above', async () => {
    const bad = await db.admin.query(
      `SELECT count(*)::int AS n FROM friendships
        WHERE user_low >= user_high OR requested_by NOT IN (user_low, user_high)`,
    );
    expect(bad.rows[0].n).toBe(0);
  });
});
