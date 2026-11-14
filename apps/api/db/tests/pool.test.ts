import {
  balanceOf,
  createMatch,
  createTestDb,
  idem,
  setBalance,
  type TestDb,
} from '../testing/testDb.ts';
import {
  expectDyceError,
  expectLedgerClean,
  fundedUser,
  setConfig,
  type LedgerResult,
} from './helpers.ts';

const NAIRA = 100;
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

const stake = async (
  match: string,
  user: string,
  amount: number,
  key = idem(),
): Promise<LedgerResult> =>
  (await db.app.query('SELECT * FROM stake_pool($1, $2, $3, $4)', [match, user, amount, key]))
    .rows[0];

const settle = async (match: string): Promise<LedgerResult> =>
  (await db.app.query('SELECT * FROM settle_match($1)', [match])).rows[0];

const refund = async (match: string, reason = 'expired'): Promise<LedgerResult> =>
  (await db.app.query('SELECT * FROM refund_match($1, $2)', [match, reason])).rows[0];

async function place(match: string, placements: Record<string, number>): Promise<void> {
  for (const [user, p] of Object.entries(placements)) {
    await db.app.query(
      'UPDATE match_players SET placement = $1 WHERE match_id = $2 AND user_id = $3',
      [p, match, user],
    );
  }
}

async function payouts(match: string): Promise<Record<string, number | null>> {
  const r = await db.admin.query(
    'SELECT user_id, payout_kobo FROM match_players WHERE match_id = $1',
    [match],
  );
  return Object.fromEntries(
    r.rows.map((x) => [x.user_id, x.payout_kobo === null ? null : Number(x.payout_kobo)]),
  );
}

async function escrowBalance(match: string): Promise<number> {
  const r = await db.admin.query(
    `SELECT coalesce(sum(e.amount_kobo), 0)::bigint AS s FROM ledger_accounts a
       JOIN ledger_entries e ON e.account_id = a.id WHERE a.kind = 'pool_escrow' AND a.match_id = $1`,
    [match],
  );
  return Number(r.rows[0].s);
}

describe('stake_pool', () => {
  it('moves the stake into escrow and records it on the player', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    const r = await stake(m, a.id, 10_000 * NAIRA);
    expect(r.replayed).toBe(false);
    expect(await balanceOf(db, a.id)).toBe(190_000 * NAIRA);
    expect(await escrowBalance(m)).toBe(10_000 * NAIRA);
    const row = await db.admin.query(
      'SELECT staked_kobo FROM match_players WHERE match_id = $1 AND user_id = $2',
      [m, a.id],
    );
    expect(Number(row.rows[0].staked_kobo)).toBe(10_000 * NAIRA);
    await expectLedgerClean(db);
  });

  it('is idempotent on its key', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    const key = idem();
    const first = await stake(m, a.id, 1_000 * NAIRA, key);
    const retry = await stake(m, a.id, 1_000 * NAIRA, key);
    expect(retry).toMatchObject({ txn_id: first.txn_id, replayed: true });
    expect(await balanceOf(db, a.id)).toBe(199_000 * NAIRA);
    expect(await escrowBalance(m)).toBe(1_000 * NAIRA);
  });

  it('requires an adult, a seat in the match, and enough money', async () => {
    const minor = await fundedUser(db, { adult: false });
    const a = await fundedUser(db);
    const stranger = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, minor.id]);
    await expectDyceError(stake(m, minor.id, 1_000 * NAIRA), 'adult_required');
    await expectDyceError(stake(m, stranger.id, 1_000 * NAIRA), 'not_a_player');
    await setBalance(db, a.id, 50_000 * NAIRA);
    await expectDyceError(stake(m, a.id, 80_000 * NAIRA), 'insufficient_funds'); // under the daily pool limit
    expect(await balanceOf(db, a.id)).toBe(50_000 * NAIRA);
  });

  it('refuses free matches and closed matches', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const free = await createMatch(db, a.id, [a.id, b.id], { mode: 'free' });
    await expectDyceError(stake(free, a.id, 100), 'not_a_pool_match');
    const closed = await createMatch(db, a.id, [a.id, b.id]);
    await db.admin.query(`UPDATE matches SET status = 'finished' WHERE id = $1`, [closed]);
    await expectDyceError(stake(closed, a.id, 100), 'match_closed');
  });

  it('enforces the daily pool limits from config', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await setConfig(db, 'pool_staked_per_day_kobo', 5_000 * NAIRA);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await expectDyceError(stake(m, a.id, 6_000 * NAIRA), 'over_pool_stake_limit');
    await setConfig(db, 'pool_staked_per_day_kobo', 100_000 * NAIRA);

    await setConfig(db, 'pool_games_per_day', 1);
    const m1 = await createMatch(db, b.id, [b.id, a.id]);
    const m2 = await createMatch(db, b.id, [b.id, a.id]);
    await stake(m1, b.id, 100 * NAIRA);
    await expectDyceError(stake(m2, b.id, 100 * NAIRA), 'over_pool_games_limit');
    await setConfig(db, 'pool_games_per_day', 20);
  });

  it('a frozen user cannot stake', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await db.admin.query('UPDATE profiles SET pool_frozen = true WHERE id = $1', [a.id]);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await expectDyceError(stake(m, a.id, 100), 'pool_frozen');
  });
});

describe('settle_match', () => {
  it('winner takes all (1v1)', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id], { scheme: 'winner_all' });
    await stake(m, a.id, 10_000 * NAIRA);
    await stake(m, b.id, 10_000 * NAIRA);
    await place(m, { [a.id]: 1, [b.id]: 2 });
    await settle(m);
    expect(await balanceOf(db, a.id)).toBe(210_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(190_000 * NAIRA);
    expect(await escrowBalance(m)).toBe(0);
    expect(await payouts(m)).toEqual({ [a.id]: 20_000 * NAIRA, [b.id]: 0 });
    const status = await db.admin.query('SELECT status FROM matches WHERE id = $1', [m]);
    expect(status.rows[0].status).toBe('finished');
    await expectLedgerClean(db);
  });

  it('50/30/20 with a rounding remainder going to first place', async () => {
    const [a, b, c] = [await fundedUser(db), await fundedUser(db), await fundedUser(db)];
    const m = await createMatch(db, a.id, [a.id, b.id, c.id], { scheme: 'p50_30_20' });
    for (const u of [a, b, c]) await stake(m, u.id, 33_334); // pot 100,002 kobo
    await place(m, { [a.id]: 1, [b.id]: 2, [c.id]: 3 });
    await settle(m);
    // floors: 50,001 / 30,000 / 20,000 = 100,001 → remainder 1 to first → 50,002
    expect(await payouts(m)).toEqual({ [a.id]: 50_002, [b.id]: 30_000, [c.id]: 20_000 });
    expect(await escrowBalance(m)).toBe(0);
    await expectLedgerClean(db);
  });

  it('60/40 with two players', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id], { scheme: 'p60_40' });
    await stake(m, a.id, 5_000 * NAIRA);
    await stake(m, b.id, 5_000 * NAIRA);
    await place(m, { [a.id]: 2, [b.id]: 1 });
    await settle(m);
    expect(await payouts(m)).toEqual({ [b.id]: 6_000 * NAIRA, [a.id]: 4_000 * NAIRA });
  });

  it('tied players split their combined slots equally', async () => {
    const users = [
      await fundedUser(db),
      await fundedUser(db),
      await fundedUser(db),
      await fundedUser(db),
    ];
    const [a, b, c, d] = users as [
      (typeof users)[0],
      (typeof users)[0],
      (typeof users)[0],
      (typeof users)[0],
    ];
    const m = await createMatch(
      db,
      a.id,
      users.map((u) => u.id),
      { scheme: 'p50_30_20' },
    );
    for (const u of users) await stake(m, u.id, 1_000 * NAIRA); // pot ₦4,000 → slots 2,000 / 1,200 / 800
    await place(m, { [a.id]: 1, [b.id]: 2, [c.id]: 2, [d.id]: 4 });
    await settle(m);
    expect(await payouts(m)).toEqual({
      [a.id]: 2_000 * NAIRA,
      [b.id]: 1_000 * NAIRA, // (1,200 + 800) / 2
      [c.id]: 1_000 * NAIRA,
      [d.id]: 0,
    });
    await expectLedgerClean(db);
  });

  it('a draw refunds every stake', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m, a.id, 3_000 * NAIRA);
    await stake(m, b.id, 3_000 * NAIRA);
    await place(m, { [a.id]: 1, [b.id]: 1 });
    await settle(m);
    expect(await balanceOf(db, a.id)).toBe(200_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(200_000 * NAIRA);
    const res = await db.admin.query('SELECT result FROM match_players WHERE match_id = $1', [m]);
    expect(res.rows.map((r) => r.result)).toEqual(['draw', 'draw']);
    await expectLedgerClean(db);
  });

  it('settling twice returns the original transaction and pays once', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m, a.id, 1_000 * NAIRA);
    await stake(m, b.id, 1_000 * NAIRA);
    await place(m, { [a.id]: 1, [b.id]: 2 });
    const first = await settle(m);
    const again = await settle(m);
    expect(again).toMatchObject({ txn_id: first.txn_id, replayed: true });
    expect(await balanceOf(db, a.id)).toBe(201_000 * NAIRA);
  });

  it('refuses to settle without placements', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m, a.id, 1_000 * NAIRA);
    await stake(m, b.id, 1_000 * NAIRA);
    await expectDyceError(settle(m), 'placements_missing');
    expect(await escrowBalance(m)).toBe(2_000 * NAIRA);
  });

  it('free matches settle without moving money', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id], { mode: 'free' });
    const r = await settle(m);
    expect(r.txn_id).toBeNull();
    expect(await balanceOf(db, a.id)).toBe(200_000 * NAIRA);
    const status = await db.admin.query('SELECT status FROM matches WHERE id = $1', [m]);
    expect(status.rows[0].status).toBe('finished');
  });

  it('concurrent settles pay exactly once', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m, a.id, 1_000 * NAIRA);
    await stake(m, b.id, 1_000 * NAIRA);
    await place(m, { [a.id]: 1, [b.id]: 2 });
    await Promise.all([settle(m), settle(m), settle(m)]);
    expect(await balanceOf(db, a.id)).toBe(201_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(199_000 * NAIRA);
    await expectLedgerClean(db);
  });
});

describe('refund_match', () => {
  it('returns every stake when an invite expires', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m, a.id, 5_000 * NAIRA);
    await refund(m, 'expired');
    expect(await balanceOf(db, a.id)).toBe(200_000 * NAIRA);
    expect(await escrowBalance(m)).toBe(0);
    const status = await db.admin.query('SELECT status FROM matches WHERE id = $1', [m]);
    expect(status.rows[0].status).toBe('expired');
    await expectLedgerClean(db);
  });

  it('is idempotent, and cannot follow or precede a settlement', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m, a.id, 1_000 * NAIRA);
    const first = await refund(m, 'cancelled');
    const again = await refund(m, 'cancelled');
    expect(again).toMatchObject({ txn_id: first.txn_id, replayed: true });
    await expectDyceError(settle(m), 'already_settled');

    const m2 = await createMatch(db, a.id, [a.id, b.id]);
    await stake(m2, a.id, 1_000 * NAIRA);
    await stake(m2, b.id, 1_000 * NAIRA);
    await place(m2, { [a.id]: 1, [b.id]: 2 });
    await settle(m2);
    await expectDyceError(refund(m2, 'cancelled'), 'already_settled');
  });

  it('with no stakes it just closes the match', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    const r = await refund(m, 'expired');
    expect(r.txn_id).toBeNull();
  });

  it('rejects an unknown reason', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await expectDyceError(refund(m, 'because'), 'invalid_reason');
  });
});

describe('whole-ledger invariants', () => {
  it('after all of the above: every txn balances and every cached balance matches the entries', async () => {
    await expectLedgerClean(db);
    const total = await db.admin.query(
      `SELECT coalesce(sum(amount_kobo), 0)::bigint AS s FROM ledger_entries`,
    );
    expect(Number(total.rows[0].s)).toBe(0);
  });
});
