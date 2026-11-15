import { z } from 'zod';
import type { PublicUser } from './contacts.ts';

/** Longest text message, in characters. */
export const MAX_MESSAGE_LENGTH = 4000;

export const conversationIdParamSchema = z.uuid();

export const openDirectSchema = z.object({ userId: z.uuid() });
export type OpenDirectRequest = z.infer<typeof openDirectSchema>;

/**
 * The client makes the message id (a UUID) so the bubble can appear instantly and a retry after a bad
 * connection can't send it twice.
 */
export const sendMessageSchema = z.object({
  id: z.uuid(),
  body: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

/** "<ISO timestamp>|<message id>": the position of the oldest message already loaded. */
export const messageCursorSchema = z
  .string()
  .max(80)
  .regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\|[0-9a-f-]{36}$/i, 'invalid cursor');

export const messagesQuerySchema = z.object({
  before: messageCursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
export type MessagesQuery = z.infer<typeof messagesQuerySchema>;

export const conversationFilterSchema = z.enum(['all', 'friends', 'requests']);
export type ConversationFilter = z.infer<typeof conversationFilterSchema>;
export const listConversationsQuerySchema = z.object({
  filter: conversationFilterSchema.default('all'),
});

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  kind: 'text';
  body: string;
  /** ISO timestamp, set by the server. */
  createdAt: string;
};

/** `request`: someone you don't know yet wrote to you. Nothing here is shown in Chat until you accept. */
export type ConversationState = 'active' | 'request';

export type ConversationSummary = {
  id: string;
  kind: 'direct';
  peer: PublicUser;
  state: ConversationState;
  lastMessage: Message | null;
  /** Messages from the other person you haven't read (capped at 99). */
  unread: number;
};

export type ConversationsResponse = {
  conversations: ConversationSummary[];
  /** Conversations waiting in Requests (for the tab badge). */
  requestCount: number;
  /** Unread messages across active conversations (for the Chat tab badge). */
  unreadTotal: number;
};

export type MessagesResponse = {
  /** Newest first. */
  messages: Message[];
  /** Pass as `before` to load older messages; null when there are no more. */
  nextCursor: string | null;
  /** When the other person last read the thread: your messages up to here are "Read". */
  peerReadAt: string | null;
};

// ---- realtime (WebSocket) ----------------------------------------------------------------------

/** Server to client. */
export type RealtimeEvent =
  | { type: 'ready' }
  | { type: 'message'; message: Message }
  | { type: 'read'; conversationId: string; userId: string; at: string }
  | { type: 'typing'; conversationId: string; userId: string; typing: boolean };

/** Client to server. The first frame must be `auth`. */
export type RealtimeClientFrame =
  { type: 'auth'; token: string } | { type: 'typing'; conversationId: string; typing: boolean };

export const realtimeClientFrameSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('auth'), token: z.string().min(10).max(4000) }),
  z.object({ type: z.literal('typing'), conversationId: z.uuid(), typing: z.boolean() }),
]);
