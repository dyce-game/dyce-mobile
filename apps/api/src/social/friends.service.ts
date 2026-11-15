import type pg from 'pg';
import type {
  FriendRequestsResponse,
  FriendsResponse,
  PublicUser,
  Relationship,
} from '@dyce/shared';
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

type Status = 'pending' | 'accepted' | 'declined';

/** The single friendships row between $1 and $2 (rows are stored with user_low < user_high). */
const PAIR = `user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)`;

/** One request/answer per pair at a time, so A->B and B->A racing can't both insert or both answer. */
async function lockPair(c: pg.PoolClient, a: string, b: string): Promise<void> {
  await c.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(LEAST($1::text, $2::text) || GREATEST($1::text, $2::text), 0))`,
    [a, b],
  );
}

/**
 * Friends: requests, answers, the list, and exact-username lookup.
 *
 * Statuses: `pending` (waiting), `accepted` (friends) and `declined` (the recipient chose "Ignore"). The
 * requester is never told about a decline: they keep seeing "Requested", and cannot send another request.
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

  // ---- the list ---------------------------------------------------------------------------------

  /** Your friends, A-Z. People you've blocked (or who blocked you) and disabled accounts are left out. */
  async list(userId: string): Promise<FriendsResponse> {
    const r = await this.pool.query<{
      id: string;
      username: string;
      display_name: string;
      since: Date;
    }>(
      `SELECT u.id, p.username, p.display_name, coalesce(f.responded_at, f.created_at) AS since
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_low = $1::uuid THEN f.user_high ELSE f.user_low END
         JOIN profiles p ON p.id = u.id
        WHERE f.status = 'accepted'
          AND $1::uuid IN (f.user_low, f.user_high)
          AND u.disabled_at IS NULL
          AND ${NOT_BLOCKED}
        ORDER BY lower(p.username)
        LIMIT 500`,
      [userId],
    );
    return {
      friends: r.rows.map((row) => ({
        id: row.id,
        username: row.username,
        displayName: row.display_name,
        since: row.since.toISOString(),
      })),
    };
  }

  /**
   * Requests waiting for you (newest first, with how many friends you share) and requests you sent. A
   * request you ignored no longer appears; one the other person ignored still shows as sent.
   */
  async requests(userId: string): Promise<FriendRequestsResponse> {
    const incoming = await this.pool.query<{
      id: string;
      username: string;
      display_name: string;
      requested_at: Date;
      mutual: number;
    }>(
      `SELECT u.id, p.username, p.display_name, f.created_at AS requested_at,
              (SELECT count(*)::int FROM (
                 SELECT CASE WHEN a.user_low = $1::uuid THEN a.user_high ELSE a.user_low END
                   FROM friendships a WHERE a.status = 'accepted' AND $1::uuid IN (a.user_low, a.user_high)
                 INTERSECT
                 SELECT CASE WHEN b.user_low = u.id THEN b.user_high ELSE b.user_low END
                   FROM friendships b WHERE b.status = 'accepted' AND u.id IN (b.user_low, b.user_high)
               ) m) AS mutual
         FROM friendships f
         JOIN users u ON u.id = f.requested_by
         JOIN profiles p ON p.id = u.id
        WHERE f.status = 'pending'
          AND f.requested_by <> $1::uuid
          AND $1::uuid IN (f.user_low, f.user_high)
          AND u.disabled_at IS NULL
          AND ${NOT_BLOCKED}
        ORDER BY f.created_at DESC
        LIMIT 200`,
      [userId],
    );

    const outgoing = await this.pool.query<{
      id: string;
      username: string;
      display_name: string;
      requested_at: Date;
    }>(
      `SELECT u.id, p.username, p.display_name, f.created_at AS requested_at
         FROM friendships f
         JOIN users u ON u.id = CASE WHEN f.user_low = $1::uuid THEN f.user_high ELSE f.user_low END
         JOIN profiles p ON p.id = u.id
        WHERE f.status IN ('pending', 'declined')
          AND f.requested_by = $1::uuid
          AND u.disabled_at IS NULL
          AND ${NOT_BLOCKED}
        ORDER BY f.created_at DESC
        LIMIT 200`,
      [userId],
    );

    return {
      incoming: incoming.rows.map((r) => ({
        user: {
          id: r.id,
          username: r.username,
          displayName: r.display_name,
          relationship: 'pending_in' as const,
        },
        requestedAt: r.requested_at.toISOString(),
        mutualFriends: r.mutual,
      })),
      outgoing: outgoing.rows.map((r) => ({
        user: {
          id: r.id,
          username: r.username,
          displayName: r.display_name,
          relationship: 'pending_out' as const,
        },
        requestedAt: r.requested_at.toISOString(),
      })),
    };
  }

  // ---- answering --------------------------------------------------------------------------------

  /** Accept a request from `fromId`. Idempotent for an existing friendship; an ignored request can still be accepted. */
  async accept(userId: string, fromId: string): Promise<{ relationship: Relationship }> {
    if (userId === fromId) throw new AuthError('cannot_add_self');
    const now = this.clock();
    return withTx(this.pool, async (c) => {
      await lockPair(c, userId, fromId);
      const row = await this.incomingRow(c, userId, fromId);
      if (row.status === 'accepted') return { relationship: 'friends' as const };
      await c.query(`UPDATE friendships SET status = 'accepted', responded_at = $3 WHERE ${PAIR}`, [
        userId,
        fromId,
        now,
      ]);
      return { relationship: 'friends' as const };
    });
  }

  /** "Ignore": hide the request without telling the sender. Idempotent. */
  async decline(userId: string, fromId: string): Promise<{ relationship: Relationship }> {
    if (userId === fromId) throw new AuthError('cannot_add_self');
    const now = this.clock();
    return withTx(this.pool, async (c) => {
      await lockPair(c, userId, fromId);
      const row = await this.incomingRow(c, userId, fromId);
      // an existing friendship is removed with remove(), not declined
      if (row.status === 'accepted') throw new AuthError('friend_request_not_found');
      if (row.status === 'pending') {
        await c.query(
          `UPDATE friendships SET status = 'declined', responded_at = $3 WHERE ${PAIR}`,
          [userId, fromId, now],
        );
      }
      return { relationship: 'none' as const };
    });
  }

  /** The friendship row, only if `fromId` is the one who asked `userId`, neither has blocked the other, and they're active. */
  private async incomingRow(
    c: pg.PoolClient,
    userId: string,
    fromId: string,
  ): Promise<{ status: Status }> {
    const r = await c.query<{ status: Status; requested_by: string }>(
      `SELECT f.status, f.requested_by
         FROM friendships f
         JOIN users u ON u.id = $2::uuid AND u.disabled_at IS NULL
        WHERE f.user_low = LEAST($1::uuid, $2::uuid) AND f.user_high = GREATEST($1::uuid, $2::uuid)
          AND ${NOT_BLOCKED}`,
      [userId, fromId],
    );
    const row = r.rows[0];
    if (!row) throw new AuthError('friend_request_not_found');
    if (row.status !== 'accepted' && row.requested_by !== fromId) {
      throw new AuthError('friend_request_not_found'); // it's your own outgoing request
    }
    return { status: row.status };
  }

  /** Withdraw a request you sent (including one that was ignored). Idempotent. */
  async cancel(userId: string, otherId: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM friendships
        WHERE ${PAIR} AND requested_by = $1::uuid AND status IN ('pending', 'declined')`,
      [userId, otherId],
    );
  }

  /** Remove a friend. Either of you can send a new request later. Idempotent. */
  async remove(userId: string, otherId: string): Promise<void> {
    await this.pool.query(`DELETE FROM friendships WHERE ${PAIR} AND status = 'accepted'`, [
      userId,
      otherId,
    ]);
  }

  // ---- asking -----------------------------------------------------------------------------------

  /**
   * Sends a friend request, or accepts one the other person already sent. Idempotent: asking twice, or
   * asking someone who is already your friend, changes nothing and returns the current relationship.
   */
  async sendRequest(userId: string, targetId: string): Promise<{ relationship: Relationship }> {
    if (userId === targetId) throw new AuthError('cannot_add_self');
    const now = this.clock();

    return withTx(this.pool, async (c) => {
      await lockPair(c, userId, targetId);

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

      const existing = await c.query<{ status: Status; requested_by: string }>(
        `SELECT status, requested_by FROM friendships WHERE ${PAIR}`,
        [userId, targetId],
      );
      const row = existing.rows[0];

      if (row) {
        if (row.status === 'accepted') return { relationship: 'friends' as const };
        // your own request (pending, or ignored by them): nothing changes, and you aren't told which
        if (row.requested_by === userId) return { relationship: 'pending_out' as const };
        // they asked first (even if you ignored it earlier): adding them back is the "yes"
        await c.query(
          `UPDATE friendships SET status = 'accepted', responded_at = $3 WHERE ${PAIR}`,
          [userId, targetId, now],
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
