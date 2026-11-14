import type { TestDb } from '../testing/testDb.ts';
import { createUser, idem, type TestUser } from '../testing/testDb.ts';

/** Asserts a promise rejects with a Postgres error whose message is `dyce:<code>`. */
export async function expectDyceError(p: Promise<unknown>, code: string): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error(`Expected dyce:${code} but the call succeeded`);
  expect((err as Error).message).toBe(`dyce:${code}`);
}

export async function expectPermissionDenied(p: Promise<unknown>): Promise<void> {
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  if (!err) throw new Error('Expected permission denied but the call succeeded');
  expect((err as Error).message).toMatch(/permission denied/i);
}

export type LedgerResult = { txn_id: string | null; replayed: boolean };

export async function grant(db: TestDb, userId: string): Promise<LedgerResult> {
  return (await db.app.query('SELECT * FROM grant_welcome($1)', [userId])).rows[0];
}

/** A user with the standard ₦200,000 welcome grant. */
export async function fundedUser(db: TestDb, opts: { adult?: boolean } = {}): Promise<TestUser> {
  const u = await createUser(db, opts);
  await grant(db, u.id);
  return u;
}

export async function transfer(
  db: TestDb,
  from: string,
  to: string,
  amount: number,
  key: string = idem(),
): Promise<LedgerResult> {
  return (
    await db.app.query('SELECT * FROM transfer($1, $2, $3, $4, $5)', [
      from,
      to,
      amount,
      'test',
      key,
    ])
  ).rows[0];
}

/** Every ledger invariant must hold after any sequence of money operations. */
export async function expectLedgerClean(db: TestDb): Promise<void> {
  const r = await db.app.query('SELECT * FROM ledger_check_invariants(false)');
  expect(r.rows).toEqual([]);
}

export async function setConfig(db: TestDb, key: string, value: number | boolean): Promise<void> {
  await db.admin.query(
    `INSERT INTO app_config (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, JSON.stringify(value)],
  );
}
