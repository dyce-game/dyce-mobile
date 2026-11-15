import { randomBytes, randomUUID } from 'node:crypto';
import { hashPhone } from '../../src/auth/crypto.ts';
import { ContactsService } from '../../src/social/contacts.service.ts';
import { FriendsService } from '../../src/social/friends.service.ts';
import { createTestDb, type TestDb } from '../testing/testDb.ts';
import { setConfig } from './helpers.ts';

const SECRET = 'k'.repeat(40);

let db: TestDb;
let contacts: ContactsService;
let friends: FriendsService;
const clock = { now: new Date('2026-11-14T10:00:00Z') };

beforeAll(async () => {
  db = await createTestDb();
  contacts = new ContactsService(db.app, SECRET, () => clock.now);
  friends = new FriendsService(db.app, () => clock.now);
});
afterAll(async () => {
  await db.close();
});
beforeEach(() => {
  clock.now = new Date('2026-11-14T10:00:00Z');
});

type Person = { id: string; e164: string; username: string };
let seq = 0;
const nextNumber = () => `+23480${String(30000000 + ++seq * 13).padStart(8, '0')}`;

/** A user shaped like one that signed in by OTP (phone stored only as a keyed hash) and chose a username. */
async function person(
  opts: { profile?: boolean; policy?: 'everyone' | 'fof' | 'nobody'; disabled?: boolean } = {},
): Promise<Person> {
  const id = randomUUID();
  const e164 = nextNumber();
  await db.app.query('INSERT INTO users (id, phone_hash) VALUES ($1, $2)', [
    id,
    hashPhone(SECRET, e164),
  ]);
  const username = `p${seq}_${randomBytes(2).toString('hex')}`;
  if (opts.profile !== false) {
    await db.app.query(
      'INSERT INTO profiles (id, username, display_name, request_policy) VALUES ($1, $2, $3, $4)',
      [id, username, `Person ${seq}`, opts.policy ?? 'everyone'],
    );
  }
  if (opts.disabled)
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [id]);
  return { id, e164, username };
}

const block = (blocker: Person, blocked: Person) =>
  db.app.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [
    blocker.id,
    blocked.id,
  ]);
const code = (c: string) => expect.objectContaining({ code: c });

describe('ContactsService.match', () => {
  it('finds people on Dyce and reports where each matched number was in the request', async () => {
    const me = await person();
    const a = await person();
    const b = await person();
    const res = await contacts.match(me.id, ['+2348099990001', a.e164, '+2348099990002', b.e164]);
    expect(res.matches).toEqual([
      {
        index: 1,
        user: {
          id: a.id,
          username: a.username,
          displayName: expect.any(String),
          relationship: 'none',
        },
      },
      {
        index: 3,
        user: {
          id: b.id,
          username: b.username,
          displayName: expect.any(String),
          relationship: 'none',
        },
      },
    ]);
  });

  it('never returns a phone number, hash or anything about unmatched numbers', async () => {
    const me = await person();
    const a = await person();
    const res = await contacts.match(me.id, [a.e164, '+2348099990003']);
    const text = JSON.stringify(res);
    expect(text).not.toContain(a.e164.slice(4));
    expect(text).not.toContain('8099990003');
    expect(Object.keys(res.matches[0]!.user).sort()).toEqual([
      'displayName',
      'id',
      'relationship',
      'username',
    ]);
  });

  it('skips yourself, disabled accounts and accounts that have no profile yet', async () => {
    const me = await person();
    const disabled = await person({ disabled: true });
    const noProfile = await person({ profile: false });
    const ok = await person();
    const res = await contacts.match(me.id, [me.e164, disabled.e164, noProfile.e164, ok.e164]);
    expect(res.matches.map((m) => m.user.id)).toEqual([ok.id]);
  });

  it('hides people who blocked you and people you blocked', async () => {
    const me = await person();
    const blockedMe = await person();
    const iBlocked = await person();
    const fine = await person();
    await block(blockedMe, me);
    await block(me, iBlocked);
    const res = await contacts.match(me.id, [blockedMe.e164, iBlocked.e164, fine.e164]);
    expect(res.matches.map((m) => m.user.id)).toEqual([fine.id]);
  });

  it('a number listed twice matches at both positions', async () => {
    const me = await person();
    const a = await person();
    const res = await contacts.match(me.id, [a.e164, '+2348099990004', a.e164]);
    expect(res.matches.map((m) => m.index)).toEqual([0, 2]);
  });

  it('stores only the matched user ids, once, however often you sync', async () => {
    const me = await person();
    const a = await person();
    await contacts.match(me.id, [a.e164]);
    await contacts.match(me.id, [a.e164, '+2348099990005']);
    const links = await db.admin.query(
      'SELECT contact_user_id FROM contact_links WHERE owner_id = $1',
      [me.id],
    );
    expect(links.rows).toEqual([{ contact_user_id: a.id }]);
  });

  it('after syncing, no table contains any contact number (matched or not)', async () => {
    const me = await person();
    const a = await person();
    const unmatched = ['+2348055501234', '+2348055505678'];
    await contacts.match(me.id, [a.e164, ...unmatched]);
    const tables = (
      await db.admin.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    ).rows.map((r) => r.tablename as string);
    const needles = [a.e164, a.e164.slice(4), ...unmatched, '8055501234', '8055505678'];
    const hits: string[] = [];
    for (const t of tables) {
      for (const r of (await db.admin.query(`SELECT x::text AS row FROM "${t}" x`)).rows) {
        if (needles.some((n) => (r.row as string).includes(n))) hits.push(t);
      }
    }
    expect(hits).toEqual([]);
  });

  it('reports the current relationship', async () => {
    const me = await person();
    const friend = await person();
    const iAsked = await person();
    const askedMe = await person();
    const stranger = await person();
    await friends.sendRequest(me.id, friend.id);
    await friends.sendRequest(friend.id, me.id); // reciprocal -> friends
    await friends.sendRequest(me.id, iAsked.id);
    await friends.sendRequest(askedMe.id, me.id);
    const res = await contacts.match(me.id, [
      friend.e164,
      iAsked.e164,
      askedMe.e164,
      stranger.e164,
    ]);
    expect(res.matches.map((m) => m.user.relationship)).toEqual([
      'friends',
      'pending_out',
      'pending_in',
      'none',
    ]);
  });

  it('handles a full batch of 500 numbers', async () => {
    const me = await person();
    const a = await person();
    const numbers = Array.from({ length: 499 }, (_, i) => `+23480999${String(10000 + i)}`);
    numbers.push(a.e164);
    const started = Date.now();
    const res = await contacts.match(me.id, numbers);
    expect(res.matches.map((m) => m.index)).toEqual([499]);
    expect(Date.now() - started).toBeLessThan(5000);
  });

  describe('daily lookup limit', () => {
    it('refuses past the cap, does not count the refused batch, and resets the next Lagos day', async () => {
      await setConfig(db, 'contact_lookups_per_day', 5);
      try {
        const me = await person();
        await contacts.match(me.id, ['+2348099990101', '+2348099990102', '+2348099990103']);
        const err = await contacts
          .match(me.id, ['+2348099990104', '+2348099990105', '+2348099990106'])
          .catch((e) => e);
        expect(err).toMatchObject({ code: 'contacts_rate_limited' });
        expect(err.details.retryAfterSeconds).toBeGreaterThan(0);
        expect(err.details.retryAfterSeconds).toBeLessThanOrEqual(86_400);

        const used = await db.admin.query(
          'SELECT lookups FROM contact_lookups WHERE user_id = $1',
          [me.id],
        );
        expect(used.rows[0].lookups).toBe(3); // the refused batch was rolled back

        await contacts.match(me.id, ['+2348099990107', '+2348099990108']); // exactly at the cap: allowed
        clock.now = new Date(clock.now.getTime() + 24 * 3600 * 1000);
        await contacts.match(me.id, ['+2348099990109']); // new day
      } finally {
        await setConfig(db, 'contact_lookups_per_day', 10_000);
      }
    });

    it('is per user', async () => {
      await setConfig(db, 'contact_lookups_per_day', 2);
      try {
        const x = await person();
        const y = await person();
        await contacts.match(x.id, ['+2348099990201', '+2348099990202']);
        await expect(contacts.match(x.id, ['+2348099990203'])).rejects.toEqual(
          code('contacts_rate_limited'),
        );
        await expect(contacts.match(y.id, ['+2348099990203'])).resolves.toBeTruthy();
      } finally {
        await setConfig(db, 'contact_lookups_per_day', 10_000);
      }
    });
  });
});

describe('ContactsService.suggestions and clear', () => {
  it('lists matched people who are not yet friends, sorted, hiding blocked and disabled ones', async () => {
    const me = await person();
    const friend = await person();
    const a = await person();
    const b = await person();
    const blocked = await person();
    const disabled = await person();
    await contacts.match(me.id, [friend.e164, a.e164, b.e164, blocked.e164, disabled.e164]);
    await friends.sendRequest(me.id, friend.id);
    await friends.sendRequest(friend.id, me.id); // friends now
    await block(me, blocked);
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [disabled.id]);

    const { suggestions } = await contacts.suggestions(me.id);
    const names = suggestions.map((s) => s.username);
    expect(names).toEqual([a.username, b.username].sort());
    expect(suggestions.every((s) => s.relationship === 'none')).toBe(true);
  });

  it('shows a pending request as pending_out so the Add button can say "Requested"', async () => {
    const me = await person();
    const a = await person();
    await contacts.match(me.id, [a.e164]);
    await friends.sendRequest(me.id, a.id);
    expect((await contacts.suggestions(me.id)).suggestions[0]!.relationship).toBe('pending_out');
  });

  it('each user only sees their own contacts', async () => {
    const x = await person();
    const y = await person();
    const a = await person();
    await contacts.match(x.id, [a.e164]);
    expect((await contacts.suggestions(y.id)).suggestions).toEqual([]);
  });

  it('clear forgets everything stored from the address book', async () => {
    const me = await person();
    const a = await person();
    const b = await person();
    await contacts.match(me.id, [a.e164, b.e164]);
    expect(await contacts.clear(me.id)).toBe(2);
    expect((await contacts.suggestions(me.id)).suggestions).toEqual([]);
    expect(await contacts.clear(me.id)).toBe(0);
  });
});

describe('FriendsService.sendRequest', () => {
  const relationship = async (from: Person, to: Person) =>
    (await friends.sendRequest(from.id, to.id)).relationship;

  it('creates a pending request, and asking again changes nothing', async () => {
    const a = await person();
    const b = await person();
    expect(await relationship(a, b)).toBe('pending_out');
    expect(await relationship(a, b)).toBe('pending_out');
    const rows = await db.admin.query(
      `SELECT status, requested_by FROM friendships WHERE $1 IN (user_low, user_high)`,
      [a.id],
    );
    expect(rows.rows).toEqual([{ status: 'pending', requested_by: a.id }]);
  });

  it('a reciprocal request becomes friendship, and asking a friend again is a no-op', async () => {
    const a = await person();
    const b = await person();
    await relationship(a, b);
    expect(await relationship(b, a)).toBe('friends');
    expect(await relationship(a, b)).toBe('friends');
    expect(await relationship(b, a)).toBe('friends');
  });

  it('two people adding each other at the same moment end up as friends with a single row', async () => {
    const a = await person();
    const b = await person();
    await Promise.all([friends.sendRequest(a.id, b.id), friends.sendRequest(b.id, a.id)]);
    const rows = await db.admin.query(
      `SELECT status FROM friendships WHERE $1 IN (user_low, user_high)`,
      [a.id],
    );
    expect(rows.rows).toEqual([{ status: 'accepted' }]);
  });

  it('rejects yourself, unknown people, disabled accounts and accounts without a profile', async () => {
    const a = await person();
    await expect(friends.sendRequest(a.id, a.id)).rejects.toEqual(code('cannot_add_self'));
    await expect(friends.sendRequest(a.id, randomUUID())).rejects.toEqual(code('user_not_found'));
    const disabled = await person({ disabled: true });
    await expect(friends.sendRequest(a.id, disabled.id)).rejects.toEqual(code('user_not_found'));
    const noProfile = await person({ profile: false });
    await expect(friends.sendRequest(a.id, noProfile.id)).rejects.toEqual(code('user_not_found'));
  });

  it('blocks: if they blocked you they look nonexistent; if you blocked them it says so', async () => {
    const a = await person();
    const b = await person();
    const c = await person();
    await block(b, a);
    await block(a, c);
    await expect(friends.sendRequest(a.id, b.id)).rejects.toEqual(code('user_not_found'));
    await expect(friends.sendRequest(a.id, c.id)).rejects.toEqual(code('blocked'));
  });

  it('"nobody" refuses new requests but still lets you accept one they already sent', async () => {
    const a = await person();
    const b = await person();
    await expect(
      friends.sendRequest(a.id, (await person({ policy: 'nobody' })).id),
    ).rejects.toEqual(code('requests_closed'));
    await friends.sendRequest(b.id, a.id); // b asks a first
    await db.admin.query(`UPDATE profiles SET request_policy = 'nobody' WHERE id = $1`, [b.id]);
    expect(await relationship(a, b)).toBe('friends'); // accepting is allowed
  });

  it('"friends of friends" needs a mutual friend or a shared contact', async () => {
    const asker = await person();
    const strict = await person({ policy: 'fof' });
    await expect(friends.sendRequest(asker.id, strict.id)).rejects.toEqual(code('requests_closed'));

    // via contacts
    await contacts.match(asker.id, [strict.e164]);
    expect(await relationship(asker, strict)).toBe('pending_out');

    // via a mutual friend
    const asker2 = await person();
    const strict2 = await person({ policy: 'fof' });
    const mutual = await person();
    await friends.sendRequest(asker2.id, mutual.id);
    await friends.sendRequest(mutual.id, asker2.id);
    await friends.sendRequest(strict2.id, mutual.id);
    await friends.sendRequest(mutual.id, strict2.id);
    expect(await relationship(asker2, strict2)).toBe('pending_out');
  });

  it('limits new requests per day but never blocks existing ones, and resets next day', async () => {
    await setConfig(db, 'friend_requests_per_day', 2);
    try {
      const a = await person();
      const [b, c, d] = [await person(), await person(), await person()];
      await relationship(a, b);
      await relationship(a, c);
      await expect(friends.sendRequest(a.id, d.id)).rejects.toEqual(
        code('friend_requests_rate_limited'),
      );
      expect(await relationship(a, b)).toBe('pending_out'); // existing: fine
      clock.now = new Date(clock.now.getTime() + 24 * 3600 * 1000);
      expect(await relationship(a, d)).toBe('pending_out');
    } finally {
      await setConfig(db, 'friend_requests_per_day', 50);
    }
  });

  it('accepting a request is not limited', async () => {
    await setConfig(db, 'friend_requests_per_day', 1);
    try {
      const a = await person();
      const b = await person();
      const c = await person();
      await friends.sendRequest(b.id, a.id);
      await friends.sendRequest(c.id, a.id);
      await friends.sendRequest(a.id, (await person()).id); // uses a's only new request
      expect(await relationship(a, b)).toBe('friends');
      expect(await relationship(a, c)).toBe('friends');
    } finally {
      await setConfig(db, 'friend_requests_per_day', 50);
    }
  });
});

describe('FriendsService.findByUsername', () => {
  it('finds an exact username, case-insensitively, with the relationship', async () => {
    const me = await person();
    const a = await person();
    const found = await friends.findByUsername(me.id, a.username.toUpperCase());
    expect(found).toMatchObject({ id: a.id, username: a.username, relationship: 'none' });
    await friends.sendRequest(me.id, a.id);
    expect((await friends.findByUsername(me.id, a.username)).relationship).toBe('pending_out');
  });

  it('does not find partial names, yourself, disabled users or blocked users', async () => {
    const me = await person();
    const a = await person();
    const disabled = await person({ disabled: true });
    const blockedMe = await person();
    const iBlocked = await person();
    await block(blockedMe, me);
    await block(me, iBlocked);
    await expect(friends.findByUsername(me.id, a.username.slice(0, 4))).rejects.toEqual(
      code('user_not_found'),
    );
    await expect(friends.findByUsername(me.id, me.username)).rejects.toEqual(
      code('user_not_found'),
    );
    for (const p of [disabled, blockedMe, iBlocked]) {
      await expect(friends.findByUsername(me.id, p.username)).rejects.toEqual(
        code('user_not_found'),
      );
    }
  });
});

describe('integrity', () => {
  it('friendship rows always satisfy the low < high ordering constraint', async () => {
    const r = await db.admin.query(
      'SELECT count(*)::int AS n FROM friendships WHERE user_low >= user_high',
    );
    expect(r.rows[0].n).toBe(0);
  });
});
