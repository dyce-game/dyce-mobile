import type pg from 'pg';
import type { ContactMatch, ContactsMatchResponse, ContactSuggestionsResponse } from '@dyce/shared';
import { hashPhone } from '../auth/crypto.ts';
import { AuthError } from '../auth/auth-error.ts';
import type { Clock } from '../auth/tokens.ts';
import { readConfigInt, secondsUntilLagosMidnight } from '../db/config.ts';
import { withTx } from '../db/tx.ts';
import {
  FRIENDSHIP_JOIN,
  NOT_BLOCKED,
  RELATIONSHIP_EXPR,
  toPublicUser,
  type PublicUserRow,
} from './relationship.ts';

type MatchRow = PublicUserRow & { phone_hash: Buffer };

/**
 * Contact matching ("who from my address book is on Dyce?").
 *
 * Privacy contract: the numbers arrive over TLS, are hashed in memory with the server secret, compared
 * with `users.phone_hash`, and dropped. Nothing about the *unmatched* numbers is stored or logged, and
 * for matched ones we keep only the user id (contact_links). Names never leave the device: the response
 * identifies each match by the position of its number in the request.
 */
export class ContactsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly phoneSecret: string,
    private readonly clock: Clock = () => new Date(),
  ) {}

  async match(userId: string, numbers: string[]): Promise<ContactsMatchResponse> {
    const now = this.clock();
    // hash -> every request position that produced it (a number may be listed twice)
    const positions = new Map<string, number[]>();
    numbers.forEach((n, i) => {
      const key = hashPhone(this.phoneSecret, n).toString('hex');
      positions.set(key, [...(positions.get(key) ?? []), i]);
    });
    const hashes = [...positions.keys()];

    return withTx(this.pool, async (c) => {
      // Daily cap on lookups. Counted before matching; rolled back (with this transaction) if exceeded.
      const limit = await readConfigInt(c, 'contact_lookups_per_day', 10_000);
      const used = await c.query<{ lookups: number }>(
        `INSERT INTO contact_lookups (user_id, day, lookups)
         VALUES ($1, ($2::timestamptz AT TIME ZONE 'Africa/Lagos')::date, $3)
         ON CONFLICT (user_id, day) DO UPDATE SET lookups = contact_lookups.lookups + EXCLUDED.lookups
         RETURNING lookups`,
        [userId, now, numbers.length],
      );
      if ((used.rows[0]?.lookups ?? 0) > limit) {
        throw new AuthError('contacts_rate_limited', {
          retryAfterSeconds: secondsUntilLagosMidnight(now),
        });
      }

      const found = await c.query<MatchRow>(
        `SELECT u.phone_hash, u.id, p.username, p.display_name, ${RELATIONSHIP_EXPR} AS relationship
           FROM users u
           JOIN profiles p ON p.id = u.id
           ${FRIENDSHIP_JOIN}
          WHERE u.phone_hash IN (SELECT decode(h, 'hex') FROM unnest($2::text[]) AS h)
            AND u.disabled_at IS NULL
            AND u.id <> $1::uuid
            AND ${NOT_BLOCKED}`,
        [userId, hashes],
      );

      if (found.rows.length > 0) {
        await c.query(
          `INSERT INTO contact_links (owner_id, contact_user_id, created_at)
           SELECT $1, unnest($2::uuid[]), $3
           ON CONFLICT (owner_id, contact_user_id) DO NOTHING`,
          [userId, found.rows.map((r) => r.id), now],
        );
      }

      const matches: ContactMatch[] = [];
      for (const row of found.rows) {
        for (const index of positions.get(row.phone_hash.toString('hex')) ?? []) {
          matches.push({ index, user: toPublicUser(row) });
        }
      }
      matches.sort((a, b) => a.index - b.index);
      return { matches };
    });
  }

  /** People from earlier syncs who are on Dyce and not yet your friend ("On Dyce" suggestions). */
  async suggestions(userId: string): Promise<ContactSuggestionsResponse> {
    const r = await this.pool.query<PublicUserRow>(
      `SELECT u.id, p.username, p.display_name, ${RELATIONSHIP_EXPR} AS relationship
         FROM contact_links cl
         JOIN users u ON u.id = cl.contact_user_id
         JOIN profiles p ON p.id = u.id
         ${FRIENDSHIP_JOIN}
        WHERE cl.owner_id = $1::uuid
          AND u.disabled_at IS NULL
          AND (f.status IS NULL OR f.status <> 'accepted')
          AND ${NOT_BLOCKED}
        ORDER BY p.username
        LIMIT 200`,
      [userId],
    );
    return { suggestions: r.rows.map(toPublicUser) };
  }

  /** Forget everything we stored from this user's address book (data deletion, NDPA 2023). */
  async clear(userId: string): Promise<number> {
    const r = await this.pool.query('DELETE FROM contact_links WHERE owner_id = $1', [userId]);
    return r.rowCount ?? 0;
  }
}
