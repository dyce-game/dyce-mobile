import { randomUUID } from 'node:crypto';
import {
  balanceOf,
  createUser,
  createTestDb,
  idem,
  setBalance,
  type TestDb,
} from '../testing/testDb.ts';
import {
  expectDyceError,
  expectLedgerClean,
  expectPermissionDenied,
  fundedUser,
  grant,
  setConfig,
  transfer,
} from './helpers.ts';

const NAIRA = 100;
let db: TestDb;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

describe('welcome grant', () => {
  it('gives ₦200,000 exactly once, even if called repeatedly', async () => {
    const u = await createUser(db);
    expect(await balanceOf(db, u.id)).toBe(0);
    const first = await grant(db, u.id);
    const second = await grant(db, u.id);
    expect(first.replayed).toBe(false);
    expect(second.replayed).toBe(true);
    expect(second.txn_id).toBe(first.txn_id);
    expect(await balanceOf(db, u.id)).toBe(200_000 * NAIRA);
  });

  it('is enforced by a unique index even if the idempotency key were different', async () => {
    const u = await fundedUser(db);
    await expect(
      db.admin.query(
        `INSERT INTO ledger_txns (kind, idempotency_key, meta) VALUES ('grant', $1, $2::jsonb)`,
        [`other:${randomUUID()}`, JSON.stringify({ to_user: u.id })],
      ),
    ).rejects.toThrow(/ledger_one_grant_per_user/);
  });
});

describe('transfer', () => {
  it('moves money, writes balanced entries, and keeps the ledger clean', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const r = await transfer(db, a.id, b.id, 5_000 * NAIRA);
    expect(r.replayed).toBe(false);
    expect(await balanceOf(db, a.id)).toBe(195_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(205_000 * NAIRA);
    const sum = await db.admin.query(
      'SELECT sum(amount_kobo)::bigint AS s, count(*)::int AS n FROM ledger_entries WHERE txn_id = $1',
      [r.txn_id],
    );
    expect(Number(sum.rows[0].s)).toBe(0);
    expect(sum.rows[0].n).toBe(2);
    await expectLedgerClean(db);
  });

  it('rejects insufficient funds and leaves no trace', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await setBalance(db, a.id, 1_000 * NAIRA);
    const key = idem();
    await expectDyceError(transfer(db, a.id, b.id, 2_000 * NAIRA, key), 'insufficient_funds');
    expect(await balanceOf(db, a.id)).toBe(1_000 * NAIRA);
    const rows = await db.admin.query('SELECT 1 FROM ledger_txns WHERE idempotency_key = $1', [
      key,
    ]);
    expect(rows.rowCount).toBe(0);
  });

  it.each([0, -500])('rejects a non-positive amount (%i)', async (amount) => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await expectDyceError(transfer(db, a.id, b.id, amount), 'invalid_amount');
  });

  it('rejects sending to yourself', async () => {
    const a = await fundedUser(db);
    await expectDyceError(transfer(db, a.id, a.id, 100), 'self_payment');
  });

  it('a retry with the same idempotency key returns the original txn and moves money once', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const key = idem();
    const first = await transfer(db, a.id, b.id, 1_000 * NAIRA, key);
    const retry = await transfer(db, a.id, b.id, 1_000 * NAIRA, key);
    expect(retry.replayed).toBe(true);
    expect(retry.txn_id).toBe(first.txn_id);
    expect(await balanceOf(db, a.id)).toBe(199_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(201_000 * NAIRA);
  });

  it('a retry still succeeds after the sender can no longer afford the amount', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const key = idem();
    await transfer(db, a.id, b.id, 1_000 * NAIRA, key);
    await setBalance(db, a.id, 0);
    const retry = await transfer(db, a.id, b.id, 1_000 * NAIRA, key);
    expect(retry.replayed).toBe(true);
  });

  it('two concurrent spends of the last ₦1,000: exactly one succeeds', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const c = await fundedUser(db);
    await setBalance(db, a.id, 1_000 * NAIRA);
    const results = await Promise.allSettled([
      transfer(db, a.id, b.id, 1_000 * NAIRA),
      transfer(db, a.id, c.id, 1_000 * NAIRA),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(failed).toHaveLength(1);
    expect((failed[0]!.reason as Error).message).toBe('dyce:insufficient_funds');
    expect(await balanceOf(db, a.id)).toBe(0);
    await expectLedgerClean(db);
  });

  it('many concurrent opposite transfers do not deadlock or lose money', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const jobs: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      jobs.push(transfer(db, a.id, b.id, 100 * NAIRA));
      jobs.push(transfer(db, b.id, a.id, 100 * NAIRA));
    }
    await Promise.all(jobs);
    expect(await balanceOf(db, a.id)).toBe(200_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(200_000 * NAIRA);
    await expectLedgerClean(db);
  });

  it('enforces the per-send and daily limits', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await expectDyceError(transfer(db, a.id, b.id, 50_001 * NAIRA), 'over_send_limit');
    // daily limit ₦200,000: four sends of ₦50,000 use it up, then even ₦1 is refused
    for (let i = 0; i < 4; i++) await transfer(db, a.id, b.id, 50_000 * NAIRA);
    await setBalance(db, a.id, 100_000 * NAIRA); // plenty of money; only the daily limit should stop it
    await expectDyceError(transfer(db, a.id, b.id, 1 * NAIRA), 'over_daily_limit');
  });

  it('refuses transfers between blocked users in either direction', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await db.app.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [b.id, a.id]);
    await expectDyceError(transfer(db, a.id, b.id, 100), 'blocked');
    await expectDyceError(transfer(db, b.id, a.id, 100), 'blocked');
  });
});

describe('payment requests (QR)', () => {
  const create = async (
    requester: string,
    amount: number | null,
    ttl = 15,
    target: string | null = null,
  ) =>
    (
      await db.app.query('SELECT * FROM create_payment_request($1, $2, $3, $4, $5)', [
        requester,
        amount,
        'for suya',
        target,
        ttl,
      ])
    ).rows[0] as { id: string; code: string; status: string; amount_kobo: string | null };

  const pay = async (code: string, payer: string, amount: number | null = null, key = idem()) =>
    (
      await db.app.query('SELECT * FROM pay_payment_request($1, $2, $3, $4)', [
        code,
        payer,
        amount,
        key,
      ])
    ).rows[0] as { txn_id: string; replayed: boolean };

  it('creates a 10-char base32 code and a payer settles it', async () => {
    const requester = await fundedUser(db);
    const payer = await fundedUser(db);
    const req = await create(requester.id, 2_000 * NAIRA);
    expect(req.code).toMatch(/^[A-Z2-7]{10}$/);
    const r = await pay(req.code, payer.id);
    expect(r.replayed).toBe(false);
    expect(await balanceOf(db, requester.id)).toBe(202_000 * NAIRA);
    expect(await balanceOf(db, payer.id)).toBe(198_000 * NAIRA);
    const row = await db.admin.query(
      'SELECT status, paid_by, txn_id FROM payment_requests WHERE id = $1',
      [req.id],
    );
    expect(row.rows[0]).toMatchObject({ status: 'paid', paid_by: payer.id, txn_id: r.txn_id });
  });

  it('a request paid twice fails the second time and charges once', async () => {
    const requester = await fundedUser(db);
    const p1 = await fundedUser(db);
    const p2 = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA);
    await pay(req.code, p1.id);
    await expectDyceError(pay(req.code, p2.id), 'request_already_paid');
    expect(await balanceOf(db, p2.id)).toBe(200_000 * NAIRA);
  });

  it('two payers racing for one request: exactly one wins', async () => {
    const requester = await fundedUser(db);
    const p1 = await fundedUser(db);
    const p2 = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA);
    const results = await Promise.allSettled([pay(req.code, p1.id), pay(req.code, p2.id)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(await balanceOf(db, requester.id)).toBe(201_000 * NAIRA);
  });

  it('the same payer retrying with the same key gets the original result', async () => {
    const requester = await fundedUser(db);
    const payer = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA);
    const key = idem();
    const first = await pay(req.code, payer.id, null, key);
    const retry = await pay(req.code, payer.id, null, key);
    expect(retry).toMatchObject({ txn_id: first.txn_id, replayed: true });
    expect(await balanceOf(db, payer.id)).toBe(199_000 * NAIRA);
  });

  it('rejects an expired request', async () => {
    const requester = await fundedUser(db);
    const payer = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA, 1);
    await db.admin.query(
      `UPDATE payment_requests SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [req.id],
    );
    await expectDyceError(pay(req.code, payer.id), 'request_expired');
    expect(await balanceOf(db, payer.id)).toBe(200_000 * NAIRA);
  });

  it('expire_payment_requests() marks overdue open requests expired', async () => {
    const requester = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA, 1);
    await db.admin.query(
      `UPDATE payment_requests SET expires_at = now() - interval '1 minute' WHERE id = $1`,
      [req.id],
    );
    const n = (await db.app.query('SELECT expire_payment_requests() AS n')).rows[0].n as number;
    expect(n).toBeGreaterThanOrEqual(1);
    const row = await db.admin.query('SELECT status FROM payment_requests WHERE id = $1', [req.id]);
    expect(row.rows[0].status).toBe('expired');
  });

  it('rejects paying your own request', async () => {
    const requester = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA);
    await expectDyceError(pay(req.code, requester.id), 'self_payment');
  });

  it('cancelled requests cannot be paid', async () => {
    const requester = await fundedUser(db);
    const payer = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA);
    await db.app.query('SELECT cancel_payment_request($1, $2)', [req.code, requester.id]);
    await expectDyceError(pay(req.code, payer.id), 'request_cancelled');
  });

  it('any-amount requests need an amount from the payer; fixed ones reject a different amount', async () => {
    const requester = await fundedUser(db);
    const payer = await fundedUser(db);
    const anyAmount = await create(requester.id, null);
    await expectDyceError(pay(anyAmount.code, payer.id, null), 'amount_required');
    await pay(anyAmount.code, payer.id, 750 * NAIRA);
    expect(await balanceOf(db, requester.id)).toBe(200_750 * NAIRA);

    const fixed = await create(requester.id, 1_000 * NAIRA);
    await expectDyceError(pay(fixed.code, payer.id, 999 * NAIRA), 'amount_mismatch');
  });

  it('targeted requests can only be paid by the target', async () => {
    const requester = await fundedUser(db);
    const target = await fundedUser(db);
    const other = await fundedUser(db);
    const req = await create(requester.id, 1_000 * NAIRA, 15, target.id);
    await expectDyceError(pay(req.code, other.id), 'request_not_for_you');
    await pay(req.code, target.id);
  });

  it('caps open requests per user at 10', async () => {
    const requester = await fundedUser(db);
    for (let i = 0; i < 10; i++) await create(requester.id, 100 * NAIRA);
    await expectDyceError(create(requester.id, 100 * NAIRA), 'too_many_open_requests');
  });

  it('unknown code', async () => {
    const payer = await fundedUser(db);
    await expectDyceError(pay('AAAAAAAAAA', payer.id), 'request_not_found');
  });

  it('request payments obey the send limit and blocks', async () => {
    const requester = await fundedUser(db);
    const payer = await fundedUser(db);
    await expectDyceError(create(requester.id, 60_000 * NAIRA), 'over_send_limit');
    const req = await create(requester.id, 100 * NAIRA);
    await db.app.query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2)', [
      requester.id,
      payer.id,
    ]);
    await expectDyceError(pay(req.code, payer.id), 'blocked');
  });
});

describe('daily top-up', () => {
  it('only when under the threshold, once per day', async () => {
    const u = await fundedUser(db);
    await expectDyceError(
      db.app.query('SELECT * FROM claim_daily_topup($1)', [u.id]),
      'balance_too_high',
    );
    await setBalance(db, u.id, 5_000 * NAIRA);
    await db.app.query('SELECT * FROM claim_daily_topup($1)', [u.id]);
    expect(await balanceOf(db, u.id)).toBe(25_000 * NAIRA);
    await setBalance(db, u.id, 5_000 * NAIRA);
    await expectDyceError(
      db.app.query('SELECT * FROM claim_daily_topup($1)', [u.id]),
      'topup_already_claimed',
    );
  });
});

describe('reversal', () => {
  it('reverses a transfer exactly once', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const t = await transfer(db, a.id, b.id, 3_000 * NAIRA);
    const rev = (
      await db.admin.query('SELECT * FROM reverse_txn($1, $2, NULL)', [t.txn_id, 'dispute'])
    ).rows[0];
    expect(rev.replayed).toBe(false);
    expect(await balanceOf(db, a.id)).toBe(200_000 * NAIRA);
    expect(await balanceOf(db, b.id)).toBe(200_000 * NAIRA);
    const again = (
      await db.admin.query('SELECT * FROM reverse_txn($1, $2, NULL)', [t.txn_id, 'dispute'])
    ).rows[0];
    expect(again).toMatchObject({ txn_id: rev.txn_id, replayed: true });
    await expectLedgerClean(db);
  });

  it('fails when the receiver has already spent the money', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const c = await fundedUser(db);
    const t = await transfer(db, a.id, b.id, 3_000 * NAIRA);
    await setBalance(db, b.id, 0);
    await expectDyceError(
      db.admin.query('SELECT * FROM reverse_txn($1, $2, NULL)', [t.txn_id, 'x']),
      'insufficient_funds',
    );
    expect(c.id).toBeDefined();
  });
});

describe('database-level safety', () => {
  it('the app role cannot write ledger or wallet tables directly', async () => {
    const u = await fundedUser(db);
    await expectPermissionDenied(
      db.app.query(`INSERT INTO ledger_txns (kind, idempotency_key) VALUES ('adjust', $1)`, [
        idem(),
      ]),
    );
    await expectPermissionDenied(
      db.app.query('UPDATE wallets SET balance_kobo = 999999999 WHERE user_id = $1', [u.id]),
    );
    await expectPermissionDenied(db.app.query('DELETE FROM ledger_entries'));
    await expectPermissionDenied(db.app.query('UPDATE daily_usage SET sent_kobo = 0'));
  });

  it('the app role cannot call admin or internal functions', async () => {
    const u = await fundedUser(db);
    await expectPermissionDenied(
      db.app.query('SELECT * FROM reverse_txn($1, $2, NULL)', [randomUUID(), 'x']),
    );
    await expectPermissionDenied(
      db.app.query(`SELECT _ledger_post('adjust', $1, NULL, '{}'::jsonb, '[]'::jsonb)`, [idem()]),
    );
    expect(u.id).toBeDefined();
  });

  it('the app role cannot edit stakes or payouts on match_players', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const { createMatch } = await import('../testing/testDb.ts');
    const m = await createMatch(db, a.id, [a.id, b.id]);
    await expectPermissionDenied(
      db.app.query('UPDATE match_players SET staked_kobo = 0 WHERE match_id = $1', [m]),
    );
    await expectPermissionDenied(
      db.app.query('UPDATE match_players SET payout_kobo = 99999 WHERE match_id = $1', [m]),
    );
  });

  it('ledger rows are append-only, even for the superuser', async () => {
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    const t = await transfer(db, a.id, b.id, 100);
    await expect(
      db.admin.query('UPDATE ledger_txns SET kind = $1 WHERE id = $2', ['adjust', t.txn_id]),
    ).rejects.toThrow('dyce:ledger_is_append_only');
    await expect(
      db.admin.query('DELETE FROM ledger_entries WHERE txn_id = $1', [t.txn_id]),
    ).rejects.toThrow('dyce:ledger_is_append_only');
    await expect(db.admin.query('TRUNCATE ledger_entries')).rejects.toThrow(
      'dyce:ledger_is_append_only',
    );
  });

  it('an unbalanced transaction cannot be committed', async () => {
    const client = await db.admin.connect();
    try {
      await client.query('BEGIN');
      const t = await client.query(
        `INSERT INTO ledger_txns (kind, idempotency_key) VALUES ('adjust', $1) RETURNING id`,
        [idem()],
      );
      await client.query(
        `INSERT INTO ledger_entries (txn_id, account_id, amount_kobo)
         VALUES ($1, (SELECT _system_account('system_adjust')), 500)`,
        [t.rows[0].id],
      );
      await expect(client.query('COMMIT')).rejects.toThrow('dyce:unbalanced_txn');
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });

  it('a wallet balance can never go negative, even by direct tampering', async () => {
    const u = await fundedUser(db);
    await expect(
      db.admin.query('UPDATE wallets SET balance_kobo = -1 WHERE user_id = $1', [u.id]),
    ).rejects.toThrow(/wallets_balance_non_negative/);
  });

  it('the invariant check finds a planted mismatch and can freeze Pool for that user', async () => {
    const u = await fundedUser(db);
    const clean = await db.app.query('SELECT * FROM ledger_check_invariants(false)');
    expect(clean.rows.filter((r) => r.ref === u.id)).toEqual([]);

    await db.admin.query('UPDATE wallets SET balance_kobo = balance_kobo + 5 WHERE user_id = $1', [
      u.id,
    ]);
    const bad = await db.app.query('SELECT * FROM ledger_check_invariants(true)');
    expect(bad.rows.find((r) => r.ref === u.id)).toMatchObject({ problem: 'wallet_mismatch' });
    const prof = await db.admin.query('SELECT pool_frozen FROM profiles WHERE id = $1', [u.id]);
    expect(prof.rows[0].pool_frozen).toBe(true);

    // repair so later tests in this file see a clean ledger
    await db.admin.query('UPDATE wallets SET balance_kobo = balance_kobo - 5 WHERE user_id = $1', [
      u.id,
    ]);
  });

  it('config limits come from app_config', async () => {
    await setConfig(db, 'send_limit_kobo', 100 * NAIRA);
    const a = await fundedUser(db);
    const b = await fundedUser(db);
    await expectDyceError(transfer(db, a.id, b.id, 101 * NAIRA), 'over_send_limit');
    await transfer(db, a.id, b.id, 100 * NAIRA);
    await setConfig(db, 'send_limit_kobo', 50_000 * NAIRA);
  });
});
