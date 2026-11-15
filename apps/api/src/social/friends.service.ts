import type pg from 'pg';
import type { PublicUser, Relationship } from '@dyce/shared';
import { AuthError } from '../auth/auth-error.ts';
import type { Clock } from '../auth/tokens.ts';
import { lagosDayStart, readConfigInt } from '../db/config.ts';
import { withTx } from '../db/tx.ts';
import {
  FRIENDSHIP_JOIN,
  NOT_BLOCKED,
  RELATIONSHIP_EXPR,
  toPublicUser,
  type PublicUserRow,
} from './relationship.ts';

/**
 * Friend requests and exact-username lookup: just enough for "add" buttons on contact suggestions and
 * for the "Find by username" fallback. Listing, accepting and declining requests belongs to the
 * social/discovery work; a *reciprocal* request (they already asked you) accepts here.
 */
export class FriendsService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly clock: Clock = () => new Date(),
  ) {}

  /** Exact, case-insensitive username lookup. Blocked users (either direction) look like they don't exist. */
  async findByUsername(userId: string, username: string): Promise<PublicUser> {
    const r = await this.pool.query<PublicUserRow>(
      `SELECT u.id, p.username, p.display_name, ${RELATIONSHIP_EXPR} AS relationship
         FROM users u
         JOIN profiles p ON p.id = u.id
         ${FRIENDSHIP_JOIN}
        WHERE lower(p.username) = $2 AND u.disabled_at IS NULL AND u.id <> $1::uuid AND ${NOT_BLOCKED}`,
      [userId, username.toLowerCase()],
    );
    const row = r.rows[0];
    if (!row) throw new AuthError('user_not_found');
    return toPublicUser(row);
  }

  /**
   * Sends a friend request, or accepts one the other person already sent. Idempotent: asking twice, or
   * asking someone who is already your friend, changes nothing and returns the current relationship.
   */
  async sendRequest(userId: string, targetId: string): Promise<{ relationship: Relationship }> {
    if (userId === targetId) throw new AuthError('cannot_add_self');
    const now = this.clock();

    return withTx(this.pool, async (c) => {
      // One request per pair at a time, so A->B and B->A racing can't both insert.
      await c.query(
        `SELECT pg_advisory_xact_lock(hashtextextended(LEAST($1::text, $2::text) || GREATEST($1::text, $2::text), 0))`,
        [userId, targetId],
      );

      const target = await c.query<{ request_policy: 'everyone' | 'fof' | 'nobody' }>(
        `SELECT p.request_policy FROM users u JOIN profiles p ON p.id = u.id
          WHERE u.id = $1 AND u.disabled_at IS NULL`,
        [targetId],
      );
      const policy = target.rows[0]?.request_policy;
      if (!policy) throw new AuthError('user_not_found');

      const blocks = await c.query<{ blocker_id: string }>(
        `SELECT blocker_id FROM blocks
          WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
        [userId, targetId],
      );
      // If THEY blocked you, they look like they don't exist. If YOU blocked them, say so.
      if (blocks.rows.some((b) => b.blocker_id === targetId)) throw new AuthError('user_not_found');
      if (blocks.rows.length > 0) throw new AuthError('blocked');

      const existing = await c.query<{ status: 'pending' | 'accepted'; requested_by: string }>(
        `SELECT status, requested_by FROM friendships
          WHERE user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)`,
        [userId, targetId],
      );
      const row = existing.rows[0];

      if (row) {
        if (row.status === 'accepted') return { relationship: 'friends' as const };
        if (row.requested_by === userId) return { relationship: 'pending_out' as const };
        // they asked first: this is the "yes"
        await c.query(
          `UPDATE friendships SET status = 'accepted'
            WHERE user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)`,
          [userId, targetId],
        );
        return { relationship: 'friends' as const };
      }

      // A brand-new request: apply the target's privacy setting and our abuse limit.
      if (policy === 'nobody') throw new AuthError('requests_closed');
      if (policy === 'fof') {
        const ok = await c.query<{ ok: boolean }>(
          `WITH mine AS (
             SELECT CASE WHEN user_low = $1 THEN user_high ELSE user_low END AS f
               FROM friendships WHERE status = 'accepted' AND $1 IN (user_low, user_high)),
           theirs AS (
             SELECT CASE WHEN user_low = $2 THEN user_high ELSE user_low END AS f
               FROM friendships WHERE status = 'accepted' AND $2 IN (user_low, user_high))
           SELECT (
             EXISTS (SELECT 1 FROM mine JOIN theirs USING (f))
             OR EXISTS (SELECT 1 FROM contact_links
                         WHERE (owner_id = $1 AND contact_user_id = $2) OR (owner_id = $2 AND contact_user_id = $1))
           ) AS ok`,
          [userId, targetId],
        );
        if (!ok.rows[0]?.ok) throw new AuthError('requests_closed');
      }

      const limit = await readConfigInt(c, 'friend_requests_per_day', 50);
      const sent = await c.query<{ n: string }>(
        `SELECT count(*) AS n FROM friendships WHERE requested_by = $1 AND created_at >= $2`,
        [userId, lagosDayStart(now)],
      );
      if (Number(sent.rows[0]?.n ?? 0) >= limit)
        throw new AuthError('friend_requests_rate_limited');

      await c.query(
        `INSERT INTO friendships (user_low, user_high, status, requested_by, created_at)
         VALUES (LEAST($1::uuid, $2::uuid), GREATEST($1::uuid, $2::uuid), 'pending', $1, $3)`,
        [userId, targetId, now],
      );
      return { relationship: 'pending_out' as const };
    });
  }
}
