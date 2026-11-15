import type pg from 'pg';

type Queryable = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

/** Reads an integer from `app_config` (the database value wins), falling back to a default. */
export async function readConfigInt(db: Queryable, key: string, fallback: number): Promise<number> {
  const r = await db.query<{ v: string }>(
    `SELECT value #>> '{}' AS v FROM app_config WHERE key = $1`,
    [key],
  );
  const n = Number(r.rows[0]?.v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/** Lagos is UTC+1 all year (no daylight saving), which defines "today" for daily limits. */
const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export function lagosDayStart(now: Date): Date {
  return new Date(
    Math.floor((now.getTime() + LAGOS_OFFSET_MS) / DAY_MS) * DAY_MS - LAGOS_OFFSET_MS,
  );
}

export function secondsUntilLagosMidnight(now: Date): number {
  return Math.max(1, Math.ceil((lagosDayStart(now).getTime() + DAY_MS - now.getTime()) / 1000));
}
