import type pg from 'pg';
import type { PublicUser, Relationship } from '@dyce/shared';

/** One writer at a time per pair of people, so racing requests/messages between them can't both insert. */
export async function lockPair(c: pg.PoolClient, a: string, b: string): Promise<void> {
  await c.query(
    `SELECT pg_advisory_xact_lock(hashtextextended(LEAST($1::text, $2::text) || GREATEST($1::text, $2::text), 0))`,
    [a, b],
  );
}

/**
 * SQL fragments shared by every query that shows "another user" to the signed-in user.
 * Convention: `$1` is the signed-in user's id, `u` is the other user's `users` row, `p` their profile.
 */

/** Joins the single friendship row between `u` and the signed-in user (rows are stored low < high). */
export const FRIENDSHIP_JOIN = `
  LEFT JOIN friendships f
    ON f.user_low = LEAST(u.id, $1::uuid) AND f.user_high = GREATEST(u.id, $1::uuid)`;

export const RELATIONSHIP_EXPR = `
  CASE WHEN f.status = 'accepted' THEN 'friends'
       -- an ignored ("declined") request still looks pending to the person who sent it
       WHEN f.status IN ('pending', 'declined') AND f.requested_by = $1::uuid THEN 'pending_out'
       WHEN f.status = 'pending' THEN 'pending_in'
       ELSE 'none' END`;

/** Neither side has blocked the other. Blocked users never appear in matches, suggestions or lookups. */
export const NOT_BLOCKED = `
  NOT EXISTS (
    SELECT 1 FROM blocks b
     WHERE (b.blocker_id = u.id AND b.blocked_id = $1::uuid)
        OR (b.blocker_id = $1::uuid AND b.blocked_id = u.id))`;

export type PublicUserRow = {
  id: string;
  username: string;
  display_name: string;
  relationship: Relationship;
};

export function toPublicUser(row: PublicUserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.display_name,
    relationship: row.relationship,
  };
}
