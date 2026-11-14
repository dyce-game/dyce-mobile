import { randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { migrate } from '../migrator.ts';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL;

export type TestDb = {
  /** Superuser pool: fixtures, tampering, and anything the API role must NOT be able to do. */
  admin: pg.Pool;
  /** Pool connected as the restricted application role (member of dyce_api). Use this for the code under test. */
  app: pg.Pool;
  close(): Promise<void>;
};

function withDb(url: string, db: string): string {
  const u = new URL(url);
  u.pathname = `/${db}`;
  return u.toString();
}

/** Creates an isolated database, applies every migration, and connects an admin and an app-role pool. */
export async function createTestDb(): Promise<TestDb> {
  if (!ADMIN_URL) {
    throw new Error('TEST_DATABASE_ADMIN_URL is not set. Run tests with `pnpm test:db`.');
  }
  const name = `dyce_t_${randomBytes(6).toString('hex')}`;
  const root = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  await root.query(`CREATE DATABASE ${name} ENCODING 'UTF8' TEMPLATE template0`);
  await root.end();

  const admin = new pg.Pool({ connectionString: withDb(ADMIN_URL, name), max: 5 });
  await migrate(admin); // creates the cluster-wide dyce_api role on first run
  // Login role used by the application (member of dyce_api), created once per cluster.
  const root2 = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
  await root2.query(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'dyce_app') THEN
      CREATE ROLE dyce_app LOGIN PASSWORD 'dyce_app' IN ROLE dyce_api;
    END IF; END $$`);
  await root2.end();

  const appUrl = new URL(withDb(ADMIN_URL, name));
  appUrl.username = 'dyce_app';
  appUrl.password = 'dyce_app';
  const app = new pg.Pool({ connectionString: appUrl.toString(), max: 10 });

  return {
    admin,
    app,
    async close() {
      await app.end();
      await admin.end();
      const r = new pg.Pool({ connectionString: ADMIN_URL, max: 1 });
      await r.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`).catch(() => undefined);
      await r.end();
    },
  };
}

let userCounter = 0;

export type TestUser = { id: string; username: string };

/** Creates a user + profile through the app role (as the API would). The wallet is created by trigger. */
export async function createUser(
  db: TestDb,
  opts: { adult?: boolean; username?: string } = {},
): Promise<TestUser> {
  const username =
    opts.username ??
    `user_${(++userCounter).toString().padStart(4, '0')}_${randomBytes(2).toString('hex')}`;
  const id = randomUUID();
  await db.app.query('INSERT INTO users (id, phone_hash) VALUES ($1, $2)', [id, randomBytes(32)]);
  await db.app.query(
    'INSERT INTO profiles (id, username, display_name, is_adult) VALUES ($1, $2, $3, $4)',
    [id, username, username, opts.adult ?? true],
  );
  return { id, username };
}

export async function balanceOf(db: TestDb, userId: string): Promise<number> {
  const r = await db.admin.query<{ balance_kobo: string }>(
    'SELECT balance_kobo FROM wallets WHERE user_id = $1',
    [userId],
  );
  return Number(r.rows[0]!.balance_kobo);
}

/** Set a wallet to an exact balance by posting a real 'adjust' ledger transaction (keeps the ledger consistent). */
export async function setBalance(db: TestDb, userId: string, kobo: number): Promise<void> {
  const cur = await balanceOf(db, userId);
  const delta = kobo - cur;
  if (delta === 0) return;
  await db.admin.query(
    `SELECT _ledger_post('adjust', $1, NULL, '{}'::jsonb, jsonb_build_array(
       jsonb_build_object('account', _system_account('system_adjust'), 'amount', $2::bigint * -1),
       jsonb_build_object('account', _wallet_account($3), 'amount', $2::bigint)))`,
    [`adjust:${randomUUID()}`, delta, userId],
  );
}

export async function ensureGame(db: TestDb, slug = '_example'): Promise<void> {
  await db.admin.query(
    `INSERT INTO games (slug, name, dimension, sync, min_players, max_players, enabled)
     VALUES ($1, 'Example', '2d', 'async', 2, 4, true) ON CONFLICT DO NOTHING`,
    [slug],
  );
}

/** Pool/free match with players seated 1..n, created through the app role like the API would. */
export async function createMatch(
  db: TestDb,
  creator: string,
  players: string[],
  opts: {
    mode?: 'free' | 'pool';
    scheme?: 'winner_all' | 'p50_30_20' | 'p60_40';
    stake?: number;
  } = {},
): Promise<string> {
  await ensureGame(db);
  const id = randomUUID();
  await db.app.query(
    `INSERT INTO matches (id, game_slug, mode, stake_kobo, payout_scheme, status, seed, created_by)
     VALUES ($1, '_example', $2, $3, $4, 'active', 1, $5)`,
    [id, opts.mode ?? 'pool', opts.stake ?? 0, opts.scheme ?? 'winner_all', creator],
  );
  for (const [i, p] of players.entries()) {
    await db.app.query('INSERT INTO match_players (match_id, user_id, seat) VALUES ($1, $2, $3)', [
      id,
      p,
      i + 1,
    ]);
  }
  return id;
}

export function idem(): string {
  return `t:${randomUUID()}`;
}
