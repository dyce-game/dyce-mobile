import type { PublicUser, Relationship } from '@dyce/shared';

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
       WHEN f.status = 'pending' AND f.requested_by = $1::uuid THEN 'pending_out'
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
