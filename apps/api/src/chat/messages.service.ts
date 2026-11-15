import type pg from 'pg';
import type {
  ConversationFilter,
  ConversationState,
  ConversationSummary,
  ConversationsResponse,
  Message,
  MessagesResponse,
  RealtimeEvent,
  Relationship,
} from '@dyce/shared';
import { AuthError } from '../auth/auth-error.ts';
import type { Clock } from '../auth/tokens.ts';
import { lagosDayStart, readConfigInt } from '../db/config.ts';
import { withTx } from '../db/tx.ts';
import {
  FRIENDSHIP_JOIN,
  lockPair,
  NOT_BLOCKED,
  RELATIONSHIP_EXPR,
} from '../social/relationship.ts';

/** Where live events go. The WebSocket hub implements it; tests pass a recorder. */
export interface Publisher {
  publish(userIds: readonly string[], event: RealtimeEvent): void;
}

type MemberState = 'active' | 'request' | 'declined' | 'left';

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: Date;
};

const toMessage = (r: MessageRow): Message => ({
  id: r.id,
  conversationId: r.conversation_id,
  senderId: r.sender_id,
  kind: 'text',
  body: r.body,
  createdAt: r.created_at.toISOString(),
});

type SummaryRow = {
  id: string;
  peer_id: string;
  username: string;
  display_name: string;
  relationship: Relationship;
  state: ConversationState | 'declined' | 'left';
  unread: number;
  m_id: string | null;
  m_sender: string | null;
  m_body: string | null;
  m_created: Date | null;
};

/** What the two people in a conversation can do right now, from `viewer`'s side. */
type Seat = {
  peerId: string;
  friends: boolean;
  isNew: boolean; // no message has been sent yet
  myState: MemberState;
  peerState: MemberState;
  peerReadAt: Date | null;
};

/**
 * One-to-one messaging.
 *
 * Friends chat freely. A message to someone who isn't a friend creates the conversation in the Requests
 * inbox of the *recipient* (their membership is `request`); it never reaches their Chat until they accept
 * or reply, and only a few messages can be sent before they do. Ignoring ("declined") is silent: the
 * sender is not told, and the recipient gets no live events or read receipts from then on. Requests also
 * never reveal whether they've been opened (no read receipts until accepted).
 *
 * "Effective" state: once two people are friends, a conversation that was a request (or ignored) counts as
 * active for both, so becoming friends is enough and nothing needs rewriting.
 */
export class MessagesService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly publisher: Publisher,
    private readonly clock: Clock = () => new Date(),
  ) {}

  // ---- opening --------------------------------------------------------------------------------

  /**
   * The conversation with `peerId`, created if it doesn't exist. Creating it sends nothing: it appears in
   * lists only once a message is sent.
   */
  async openDirect(userId: string, peerId: string): Promise<ConversationSummary> {
    if (userId === peerId) throw new AuthError('cannot_add_self');
    const now = this.clock();
    const id = await withTx(this.pool, async (c) => {
      await lockPair(c, userId, peerId);
      await this.assertReachable(c, userId, peerId);

      const key = directKey(userId, peerId);
      const found = await c.query<{ id: string }>(
        `SELECT id FROM conversations WHERE direct_key = $1`,
        [key],
      );
      if (found.rows[0]) return found.rows[0].id;

      const friends = await this.areFriends(c, userId, peerId);
      const created = await c.query<{ id: string }>(
        `INSERT INTO conversations (kind, direct_key, created_by, created_at)
         VALUES ('direct', $1, $2, $3) RETURNING id`,
        [key, userId, now],
      );
      const conversationId = created.rows[0]!.id;
      await c.query(
        `INSERT INTO conversation_members (conversation_id, user_id, state) VALUES
           ($1, $2, 'active'), ($1, $3, $4)`,
        [conversationId, userId, peerId, friends ? 'active' : 'request'],
      );
      return conversationId;
    });
    return this.get(userId, id);
  }

  // ---- reading --------------------------------------------------------------------------------

  /** Your conversations, most recent first. Requests are separate from the rest. */
  async list(userId: string, filter: ConversationFilter = 'all'): Promise<ConversationsResponse> {
    const rows = await this.summaries(this.pool, userId, { onlyWithMessages: true });
    const all = rows.map(toSummary);
    const active = all.filter((c) => c.state === 'active');
    const requests = all.filter((c) => c.state === 'request');
    const shown =
      filter === 'requests'
        ? requests
        : filter === 'friends'
          ? active.filter((c) => c.peer.relationship === 'friends')
          : active;
    return {
      conversations: shown,
      requestCount: requests.length,
      unreadTotal: active.reduce((n, c) => n + c.unread, 0),
    };
  }

  async get(userId: string, conversationId: string): Promise<ConversationSummary> {
    const rows = await this.summaries(this.pool, userId, { conversationId });
    const row = rows[0];
    if (!row) throw new AuthError('conversation_not_found');
    return toSummary(row);
  }

  /** A page of messages, newest first. */
  async messages(
    userId: string,
    conversationId: string,
    opts: { before?: string; limit?: number } = {},
  ): Promise<MessagesResponse> {
    const limit = Math.min(Math.max(opts.limit ?? 30, 1), 50);
    const seat = await this.seat(this.pool, userId, conversationId);

    const params: unknown[] = [conversationId, limit + 1];
    let cursor = '';
    if (opts.before) {
      const [ts, id] = opts.before.split('|') as [string, string];
      params.push(ts, id);
      cursor = `AND (created_at, id) < ($3::timestamptz, $4::uuid)`;
    }
    const r = await this.pool.query<MessageRow>(
      `SELECT id, conversation_id, sender_id, body, created_at
         FROM messages
        WHERE conversation_id = $1 AND deleted_at IS NULL ${cursor}
        ORDER BY created_at DESC, id DESC
        LIMIT $2`,
      params,
    );
    const page = r.rows.slice(0, limit).map(toMessage);
    const last = page[page.length - 1];
    return {
      messages: page,
      nextCursor: r.rows.length > limit && last ? `${last.createdAt}|${last.id}` : null,
      // Reading is only visible to the sender once the conversation is accepted.
      peerReadAt:
        effective(seat.peerState, seat.friends) === 'active'
          ? (seat.peerReadAt?.toISOString() ?? null)
          : null,
    };
  }

  // ---- writing --------------------------------------------------------------------------------

  /**
   * Sends a text message. Idempotent on `input.id`: a retry returns the stored message and sends nothing
   * new, so a flaky connection can't produce duplicates.
   */
  async send(
    userId: string,
    conversationId: string,
    input: { id: string; body: string },
  ): Promise<Message> {
    const now = this.clock();

    const result = await withTx(this.pool, async (c) => {
      // Find the other person first so both of them can be serialised, then read everything under the lock.
      const peerId = await this.peerOf(c, userId, conversationId);
      await lockPair(c, userId, peerId);
      const seat = await this.seat(c, userId, conversationId);
      await this.assertReachable(c, userId, peerId);

      const existing = await c.query<MessageRow>(
        `SELECT id, conversation_id, sender_id, body, created_at FROM messages WHERE id = $1`,
        [input.id],
      );
      const prior = existing.rows[0];
      if (prior) {
        if (prior.conversation_id !== conversationId || prior.sender_id !== userId) {
          throw new AuthError('message_id_taken');
        }
        return { message: toMessage(prior), fresh: false, notifyPeer: false, peerId: seat.peerId };
      }

      if (!seat.friends) await this.checkStrangerRules(c, userId, conversationId, seat, now);

      // Writing in a request is accepting it; becoming friends also makes both sides active.
      if (seat.myState !== 'active') {
        await this.setState(c, conversationId, userId, 'active');
      }
      if (seat.friends && seat.peerState !== 'active') {
        await this.setState(c, conversationId, seat.peerId, 'active');
      }

      const inserted = await c.query<MessageRow>(
        `INSERT INTO messages (id, conversation_id, sender_id, kind, body, created_at)
         VALUES ($1, $2, $3, 'text', $4, $5)
         RETURNING id, conversation_id, sender_id, body, created_at`,
        [input.id, conversationId, userId, input.body, now],
      );
      await c.query(`UPDATE conversations SET last_message_at = $2 WHERE id = $1`, [
        conversationId,
        now,
      ]);
      // Someone who ignored a request gets no live events (and nothing else) from the sender.
      const notifyPeer = effective(seat.peerState, seat.friends) !== 'declined';
      return {
        message: toMessage(inserted.rows[0]!),
        fresh: true,
        notifyPeer,
        peerId: seat.peerId,
      };
    });

    if (result.fresh) {
      const targets = result.notifyPeer ? [userId, result.peerId] : [userId];
      this.safePublish(targets, { type: 'message', message: result.message });
    }
    return result.message;
  }

  /** Marks everything up to now as read. Only an accepted conversation tells the sender. */
  async markRead(userId: string, conversationId: string): Promise<{ readAt: string }> {
    const now = this.clock();
    const seat = await this.seat(this.pool, userId, conversationId);
    await this.pool.query(
      `UPDATE conversation_members
          SET last_read_at = greatest(coalesce(last_read_at, $3), $3)
        WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId, now],
    );
    if (effective(seat.myState, seat.friends) === 'active') {
      this.safePublish([seat.peerId], {
        type: 'read',
        conversationId,
        userId,
        at: now.toISOString(),
      });
    }
    return { readAt: now.toISOString() };
  }

  /** "Accept" a request (or an ignored one): it becomes a normal conversation. Idempotent. */
  async accept(userId: string, conversationId: string): Promise<ConversationSummary> {
    const seat = await this.seat(this.pool, userId, conversationId);
    if (seat.myState !== 'active') await this.setState(this.pool, conversationId, userId, 'active');
    return this.get(userId, conversationId);
  }

  /** "Decline": hides a request without telling the sender. Idempotent. */
  async decline(userId: string, conversationId: string): Promise<void> {
    const seat = await this.seat(this.pool, userId, conversationId);
    // Only a request can be declined; a normal chat is left alone (and a friend's chat is never a request).
    if (effective(seat.myState, seat.friends) !== 'request' && seat.myState !== 'declined') {
      throw new AuthError('conversation_not_found');
    }
    await this.setState(this.pool, conversationId, userId, 'declined');
  }

  /**
   * Who a typing signal from `userId` in this conversation should go to, or null if it shouldn't be sent
   * (not a member, blocked, or the other person ignored the request).
   */
  async typingTarget(userId: string, conversationId: string): Promise<string | null> {
    try {
      const seat = await this.seat(this.pool, userId, conversationId);
      await this.assertReachable(this.pool, userId, seat.peerId);
      return effective(seat.peerState, seat.friends) === 'declined' ? null : seat.peerId;
    } catch {
      return null;
    }
  }

  // ---- internals ------------------------------------------------------------------------------

  private safePublish(userIds: string[], event: RealtimeEvent): void {
    try {
      this.publisher.publish(userIds, event);
    } catch {
      // Live delivery is best effort: the message is stored and the app catches up on reconnect.
    }
  }

  private async setState(
    db: Pick<pg.Pool, 'query'>,
    conversationId: string,
    userId: string,
    state: MemberState,
  ): Promise<void> {
    await db.query(
      `UPDATE conversation_members SET state = $3::member_state
        WHERE conversation_id = $1 AND user_id = $2`,
      [conversationId, userId, state],
    );
  }

  private async areFriends(db: Pick<pg.Pool, 'query'>, a: string, b: string): Promise<boolean> {
    const r = await db.query(
      `SELECT 1 FROM friendships
        WHERE user_low = LEAST($1::uuid, $2::uuid) AND user_high = GREATEST($1::uuid, $2::uuid)
          AND status = 'accepted'`,
      [a, b],
    );
    return r.rows.length > 0;
  }

  /** The other member of a direct conversation `userId` belongs to. */
  private async peerOf(
    db: Pick<pg.Pool, 'query'>,
    userId: string,
    conversationId: string,
  ): Promise<string> {
    const r = await db.query<{ peer: string }>(
      `SELECT o.user_id AS peer
         FROM conversations c
         JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = $1::uuid
         JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> $1::uuid
        WHERE c.id = $2::uuid AND c.kind = 'direct' AND m.state <> 'left'`,
      [userId, conversationId],
    );
    const peer = r.rows[0]?.peer;
    if (!peer) throw new AuthError('conversation_not_found');
    return peer;
  }

  private async seat(
    db: Pick<pg.Pool, 'query'>,
    userId: string,
    conversationId: string,
  ): Promise<Seat> {
    const r = await db.query<{
      peer: string;
      my_state: MemberState;
      peer_state: MemberState;
      peer_read: Date | null;
      last_message_at: Date | null;
      friends: boolean;
    }>(
      `SELECT o.user_id AS peer, m.state AS my_state, o.state AS peer_state,
              o.last_read_at AS peer_read, c.last_message_at,
              EXISTS (SELECT 1 FROM friendships f
                       WHERE f.user_low = LEAST($1::uuid, o.user_id) AND f.user_high = GREATEST($1::uuid, o.user_id)
                         AND f.status = 'accepted') AS friends
         FROM conversations c
         JOIN conversation_members m ON m.conversation_id = c.id AND m.user_id = $1::uuid
         JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> $1::uuid
        WHERE c.id = $2::uuid AND c.kind = 'direct' AND m.state <> 'left'`,
      [userId, conversationId],
    );
    const row = r.rows[0];
    if (!row) throw new AuthError('conversation_not_found');
    return {
      peerId: row.peer,
      friends: row.friends,
      isNew: row.last_message_at === null,
      myState: row.my_state,
      peerState: row.peer_state,
      peerReadAt: row.peer_read,
    };
  }

  /**
   * The other person must exist and be active, and neither of you has blocked the other. If they blocked
   * you the chat looks like it doesn't exist; if you blocked them you're told so.
   */
  private async assertReachable(
    db: Pick<pg.Pool, 'query'>,
    userId: string,
    peerId: string,
  ): Promise<void> {
    const peer = await db.query(
      `SELECT 1 FROM users u JOIN profiles p ON p.id = u.id WHERE u.id = $1 AND u.disabled_at IS NULL`,
      [peerId],
    );
    if (peer.rows.length === 0) throw new AuthError('user_not_found');
    const blocks = await db.query<{ blocker_id: string }>(
      `SELECT blocker_id FROM blocks
        WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)`,
      [userId, peerId],
    );
    if (blocks.rows.some((b) => b.blocker_id === peerId)) throw new AuthError('user_not_found');
    if (blocks.rows.length > 0) throw new AuthError('blocked');
  }

  /** Limits on writing to someone you aren't friends with. */
  private async checkStrangerRules(
    c: pg.PoolClient,
    userId: string,
    conversationId: string,
    seat: Seat,
    now: Date,
  ): Promise<void> {
    // The other person has already answered (accepted, or wrote back): ordinary chat from here on.
    if (seat.peerState === 'active') return;

    if (seat.isNew) {
      const target = await c.query<{ request_policy: 'everyone' | 'fof' | 'nobody' }>(
        `SELECT request_policy FROM profiles WHERE id = $1`,
        [seat.peerId],
      );
      const policy = target.rows[0]?.request_policy ?? 'everyone';
      if (policy === 'nobody') throw new AuthError('requests_closed');
      if (policy === 'fof' && !(await this.knowsEachOther(c, userId, seat.peerId))) {
        throw new AuthError('requests_closed');
      }

      const perDay = await readConfigInt(c, 'stranger_requests_per_day', 20);
      const started = await c.query<{ n: string }>(
        `SELECT count(*) AS n
           FROM conversations cv
           JOIN conversation_members o ON o.conversation_id = cv.id AND o.user_id <> $1::uuid
          WHERE cv.created_by = $1::uuid AND cv.kind = 'direct'
            AND cv.last_message_at >= $2 AND o.state IN ('request', 'declined')`,
        [userId, lagosDayStart(now)],
      );
      if (Number(started.rows[0]?.n ?? 0) >= perDay) {
        throw new AuthError('message_requests_rate_limited');
      }
    }

    const cap = await readConfigInt(c, 'request_messages_before_accept', 3);
    const sent = await c.query<{ n: string }>(
      `SELECT count(*) AS n FROM messages
        WHERE conversation_id = $1 AND sender_id = $2 AND deleted_at IS NULL`,
      [conversationId, userId],
    );
    if (Number(sent.rows[0]?.n ?? 0) >= cap) throw new AuthError('request_pending');
  }

  /** A friend in common, or one of you has the other in their contacts. */
  private async knowsEachOther(c: pg.PoolClient, a: string, b: string): Promise<boolean> {
    const r = await c.query<{ ok: boolean }>(
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
      [a, b],
    );
    return r.rows[0]?.ok === true;
  }

  /** The list/detail query: one row per conversation `userId` is in, with the other person and the latest message. */
  private async summaries(
    db: Pick<pg.Pool, 'query'>,
    userId: string,
    opts: { conversationId?: string; onlyWithMessages?: boolean },
  ): Promise<SummaryRow[]> {
    const params: unknown[] = [userId];
    let where = `m.user_id = $1::uuid AND m.state <> 'left' AND ${NOT_BLOCKED}`;
    if (opts.conversationId) {
      params.push(opts.conversationId);
      where += ` AND c.id = $${params.length}::uuid`;
    }
    if (opts.onlyWithMessages) where += ` AND c.last_message_at IS NOT NULL`;

    const r = await db.query<SummaryRow>(
      `SELECT c.id, u.id AS peer_id, p.username, p.display_name,
              ${RELATIONSHIP_EXPR} AS relationship,
              CASE WHEN f.status = 'accepted' AND m.state IN ('request', 'declined') THEN 'active'
                   ELSE m.state::text END AS state,
              (SELECT count(*)::int FROM (
                 SELECT 1 FROM messages x
                  WHERE x.conversation_id = c.id AND x.sender_id <> $1::uuid AND x.deleted_at IS NULL
                    AND (m.last_read_at IS NULL OR x.created_at > m.last_read_at)
                  LIMIT 99) s) AS unread,
              lm.id AS m_id, lm.sender_id AS m_sender, lm.body AS m_body, lm.created_at AS m_created
         FROM conversation_members m
         JOIN conversations c ON c.id = m.conversation_id AND c.kind = 'direct'
         JOIN conversation_members o ON o.conversation_id = c.id AND o.user_id <> $1::uuid
         JOIN users u ON u.id = o.user_id AND u.disabled_at IS NULL
         JOIN profiles p ON p.id = u.id
         ${FRIENDSHIP_JOIN}
         LEFT JOIN LATERAL (
           SELECT id, sender_id, body, created_at FROM messages
            WHERE conversation_id = c.id AND deleted_at IS NULL
            ORDER BY created_at DESC, id DESC LIMIT 1) lm ON true
        WHERE ${where}
        ORDER BY coalesce(c.last_message_at, c.created_at) DESC
        LIMIT 200`,
      params,
    );
    // An ignored request is hidden from lists; a conversation opened by id (detail) still resolves.
    return opts.conversationId ? r.rows : r.rows.filter((row) => row.state !== 'declined');
  }
}

const directKey = (a: string, b: string): string => (a < b ? `${a}:${b}` : `${b}:${a}`);

/** A request between friends is just a chat. */
function effective(state: MemberState, friends: boolean): MemberState {
  return friends && (state === 'request' || state === 'declined') ? 'active' : state;
}

function toSummary(row: SummaryRow): ConversationSummary {
  const state: ConversationState = row.state === 'request' ? 'request' : 'active';
  return {
    id: row.id,
    kind: 'direct',
    peer: {
      id: row.peer_id,
      username: row.username,
      displayName: row.display_name,
      relationship: row.relationship,
    },
    state,
    lastMessage:
      row.m_id && row.m_sender && row.m_body !== null && row.m_created
        ? toMessage({
            id: row.m_id,
            conversation_id: row.id,
            sender_id: row.m_sender,
            body: row.m_body,
            created_at: row.m_created,
          })
        : null,
    unread: row.unread,
  };
}
