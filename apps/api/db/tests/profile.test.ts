import { randomBytes, randomUUID } from 'node:crypto';
import { LedgerRepo } from '../../src/ledger/ledger.repo.ts';
import { ProfileService } from '../../src/profile/profile.service.ts';
import { createTestDb, type TestDb } from '../testing/testDb.ts';

let db: TestDb;
let profiles: ProfileService;
let clockYear = 2026;

beforeAll(async () => {
  db = await createTestDb();
  profiles = new ProfileService(
    db.app,
    new LedgerRepo(db.app),
    () => new Date(Date.UTC(clockYear, 5, 1)),
  );
});
afterAll(async () => {
  await db.close();
});

/** An account that has verified its phone but not created a profile yet (what OTP verification leaves behind). */
async function bareUser(): Promise<string> {
  const id = randomUUID();
  await db.app.query('INSERT INTO users (id, phone_hash) VALUES ($1, $2)', [id, randomBytes(32)]);
  return id;
}
let n = 0;
const name = () => `tester${++n}_${randomBytes(2).toString('hex')}`;
const code = (c: string) => expect.objectContaining({ code: c });

describe('createProfile', () => {
  it('creates the profile and moves onboarding to the contacts step', async () => {
    const id = await bareUser();
    const username = name();
    const me = await profiles.createProfile(id, { username, displayName: 'Ada' });
    expect(me.profile).toMatchObject({
      username,
      displayName: 'Ada',
      isAdult: false,
      level: 1,
      xp: 0,
    });
    expect(me.nextStep).toBe('contacts');
  });

  it('defaults the display name to the username', async () => {
    const id = await bareUser();
    const username = name();
    expect((await profiles.createProfile(id, { username })).profile?.displayName).toBe(username);
  });

  it('allows dots and underscores (spec: a-z 0-9 . _)', async () => {
    const id = await bareUser();
    const username = `ada.o_${randomBytes(2).toString('hex')}`;
    expect((await profiles.createProfile(id, { username })).profile?.username).toBe(username);
  });

  it('usernames are unique, and suggestions for a clash are free, valid and short', async () => {
    const a = await bareUser();
    const b = await bareUser();
    const username = name();
    await profiles.createProfile(a, { username });
    const err = await profiles.createProfile(b, { username }).catch((e) => e);
    expect(err).toMatchObject({ code: 'username_taken' });
    const suggestions = err.details.suggestions as string[];
    expect(suggestions.length).toBeGreaterThan(0);
    for (const s of suggestions) {
      expect(s.length).toBeLessThanOrEqual(20);
      expect((await profiles.checkUsername(s)).available).toBe(true);
    }
  });

  it('a user can only create one profile', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    await expect(profiles.createProfile(id, { username: name() })).rejects.toEqual(
      code('profile_exists'),
    );
  });

  it('the database blocks reserved names even if the API check were bypassed', async () => {
    const id = await bareUser();
    await expect(profiles.createProfile(id, { username: 'admin' })).rejects.toEqual(
      code('username_reserved'),
    );
    await expect(
      db.admin.query(`INSERT INTO profiles (id, username) VALUES ($1, 'support')`, [id]),
    ).rejects.toThrow('dyce:username_reserved');
  });

  it('the database enforces the username format as a backstop', async () => {
    const id = await bareUser();
    for (const bad of [
      'Ab',
      'ab',
      '.abc',
      'abc.',
      'a..bc',
      'UPPERcase',
      'has space',
      'x'.repeat(21),
    ]) {
      await expect(
        db.admin.query('INSERT INTO profiles (id, username) VALUES ($1, $2)', [id, bad]),
      ).rejects.toThrow(/username_format|dyce:/);
    }
  });
});

describe('checkUsername', () => {
  it('reports availability case-insensitively', async () => {
    const id = await bareUser();
    const username = name();
    await profiles.createProfile(id, { username });
    expect(await profiles.checkUsername(username)).toMatchObject({ available: false });
    expect(await profiles.checkUsername(`${name()}x`)).toEqual({
      available: true,
      suggestions: [],
    });
  });
});

describe('getMe', () => {
  it('works before a profile exists (profile is null, step is username)', async () => {
    const me = await profiles.getMe(await bareUser());
    expect(me.profile).toBeNull();
    expect(me.nextStep).toBe('username');
  });
  it('rejects unknown and disabled users', async () => {
    await expect(profiles.getMe(randomUUID())).rejects.toEqual(code('unauthorized'));
    const id = await bareUser();
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [id]);
    await expect(profiles.getMe(id)).rejects.toEqual(code('account_disabled'));
  });
});

describe('onboarding order and resume', () => {
  it('walks username -> contacts -> avatar -> bonus -> notifications -> done', async () => {
    const id = await bareUser();
    expect((await profiles.getMe(id)).nextStep).toBe('username');
    await profiles.createProfile(id, { username: name() });
    expect((await profiles.getMe(id)).nextStep).toBe('contacts');
    expect((await profiles.completeStep(id, 'contacts')).nextStep).toBe('avatar');
    expect((await profiles.completeStep(id, 'avatar')).nextStep).toBe('bonus');
    const bonus = await profiles.claimWelcomeBonus(id);
    expect(bonus).toMatchObject({
      granted: true,
      balanceKobo: 20_000_000,
      nextStep: 'notifications',
    });
    expect((await profiles.completeStep(id, 'notifications')).nextStep).toBe('done');
  });

  it('resumes at the earliest unfinished step, even if a later one was done first', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    await profiles.completeStep(id, 'notifications');
    expect((await profiles.getMe(id)).nextStep).toBe('contacts'); // contacts still outstanding
  });

  it('step completion is idempotent', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    await profiles.completeStep(id, 'contacts');
    expect((await profiles.completeStep(id, 'contacts')).nextStep).toBe('avatar');
  });

  it('steps need a profile first', async () => {
    const id = await bareUser();
    await expect(profiles.completeStep(id, 'contacts')).rejects.toEqual(code('profile_required'));
    await expect(profiles.claimWelcomeBonus(id)).rejects.toEqual(code('profile_required'));
  });

  it('an avatar already set by the avatar module counts as done', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    await db.admin.query(`UPDATE profiles SET avatar = '{"v":1}'::jsonb WHERE id = $1`, [id]);
    await profiles.completeStep(id, 'contacts');
    expect((await profiles.getMe(id)).nextStep).toBe('bonus');
  });
});

describe('welcome bonus', () => {
  it('pays ₦200,000 once, even when claimed repeatedly or concurrently', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    const results = await Promise.all([1, 2, 3, 4].map(() => profiles.claimWelcomeBonus(id)));
    expect(results.filter((r) => r.granted)).toHaveLength(1);
    for (const r of results) expect(r.balanceKobo).toBe(20_000_000);
    const again = await profiles.claimWelcomeBonus(id);
    expect(again).toMatchObject({ granted: false, balanceKobo: 20_000_000 });
    const entries = await db.admin.query(
      `SELECT count(*)::int AS n FROM ledger_txns WHERE kind = 'grant' AND meta ->> 'to_user' = $1`,
      [id],
    );
    expect(entries.rows[0].n).toBe(1);
  });

  it('leaves the ledger consistent', async () => {
    const r = await db.app.query('SELECT * FROM ledger_check_invariants(false)');
    expect(r.rows).toEqual([]);
  });
});

describe('age gate (ADR-007)', () => {
  it('19+ by birth year becomes an adult', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    expect(await profiles.setBirthYear(id, 2000)).toEqual({ isAdult: true });
    expect((await profiles.getMe(id)).profile?.isAdult).toBe(true);
  });

  it('a minor stays a minor, and cannot retry other years to unlock Pool', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    expect(await profiles.setBirthYear(id, 2012)).toEqual({ isAdult: false });
    await expect(profiles.setBirthYear(id, 1990)).rejects.toEqual(code('age_already_set'));
    expect((await profiles.getMe(id)).profile?.isAdult).toBe(false);
  });

  it('the database also refuses to change a birth year once set', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    await profiles.setBirthYear(id, 2012);
    await expect(
      db.admin.query('UPDATE profiles SET birth_year = 1990 WHERE id = $1', [id]),
    ).rejects.toThrow('dyce:age_already_set');
  });

  it('needs a profile first', async () => {
    await expect(profiles.setBirthYear(await bareUser(), 2000)).rejects.toEqual(
      code('profile_required'),
    );
  });

  it('is judged against the current year, not a hard-coded one', async () => {
    const id = await bareUser();
    await profiles.createProfile(id, { username: name() });
    clockYear = 2030;
    try {
      expect(await profiles.setBirthYear(id, 2010)).toEqual({ isAdult: true }); // 20 in 2030
    } finally {
      clockYear = 2026;
    }
  });

  it('a minor cannot stake in Pool (end to end with the ledger rules)', async () => {
    const minor = await bareUser();
    const adult = await bareUser();
    await profiles.createProfile(minor, { username: name() });
    await profiles.createProfile(adult, { username: name() });
    await profiles.setBirthYear(minor, 2012);
    await profiles.setBirthYear(adult, 1995);
    await profiles.claimWelcomeBonus(minor);
    await profiles.claimWelcomeBonus(adult);
    await db.admin.query(
      `INSERT INTO games (slug, name, dimension, sync, min_players, max_players, enabled)
       VALUES ('_example', 'Example', '2d', 'async', 2, 4, true) ON CONFLICT DO NOTHING`,
    );
    const m = randomUUID();
    await db.app.query(
      `INSERT INTO matches (id, game_slug, mode, stake_kobo, status, seed, created_by)
       VALUES ($1, '_example', 'pool', 100, 'active', 1, $2)`,
      [m, adult],
    );
    for (const [i, u] of [adult, minor].entries()) {
      await db.app.query(
        'INSERT INTO match_players (match_id, user_id, seat) VALUES ($1, $2, $3)',
        [m, u, i + 1],
      );
    }
    await expect(
      db.app.query('SELECT * FROM stake_pool($1, $2, 100, $3)', [m, minor, `k:${randomUUID()}`]),
    ).rejects.toThrow('dyce:adult_required');
    await expect(
      db.app.query('SELECT * FROM stake_pool($1, $2, 100, $3)', [m, adult, `k:${randomUUID()}`]),
    ).resolves.toBeTruthy();
  });
});
