import {
  DELETE_FOR_EVERYONE_MINUTES,
  REACTION_KEYS,
  isBotSender,
  type AvatarConfig,
  type ConversationFilter,
  type ConversationSummary,
  type GroupMember,
  type Message,
  type MessagesResponse,
  type PollPayload,
  type ReactionCount,
  type ReactionKey,
  type RealtimeEvent,
  type ReplyPreview,
} from '@dyce/shared';

/** A message as the thread shows it: the server's copy, or one still on its way (or that failed). */
export type ThreadMessage = Message & {
  status?: 'sending' | 'failed';
  /** Why a failed message failed, in words for the person. */
  error?: string;
  /** False when retrying can't help (e.g. the other person must reply first). */
  retryable?: boolean;
};

/** What a thread list renders, newest first (the list is inverted, so "after" in the array is higher up). */
export type ThreadItem =
  | {
      kind: 'message';
      key: string;
      message: ThreadMessage;
      mine: boolean;
      /** Top of a run of messages from one person (shows the loose corner). */
      first: boolean;
      /** Bottom of a run (shows the tail and the time). */
      last: boolean;
    }
  | { kind: 'day'; key: string; label: string; time: string };

const MINUTE = 60_000;
/** Messages from one person closer together than this read as one run. */
export const GROUP_GAP_MS = 5 * MINUTE;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const DAY_MS = 24 * 60 * MINUTE;
/** Whole calendar days from `a` to `b` in the device's time zone (DST-safe). */
const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b) - startOfDay(a)) / DAY_MS);

/** "4:30 PM" */
export function clockTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "Today", "Yesterday", "Monday", "Nov 3", "Nov 3, 2025": the day separator in a thread. */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const ago = daysBetween(d, now);
  if (ago <= 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return WEEKDAYS[d.getDay()]!;
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** The time on a chat-list row: "4:30 PM", "Yesterday", "Mon", "Nov 3". */
export function listTime(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const ago = daysBetween(d, now);
  if (ago <= 0) return clockTime(iso);
  if (ago === 1) return 'Yesterday';
  if (ago < 7) return WEEKDAYS[d.getDay()]!.slice(0, 3);
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`;
}

/** What a conversation is called: a person's name, the group's name, or the bot's. */
export function conversationTitle(c: ConversationSummary): string {
  if (c.kind === 'group') return c.group.title;
  if (c.kind === 'bot') return c.bot.name;
  return c.peer.displayName || c.peer.username;
}

/** The preview line under a name in the chat list. */
export function previewText(conversation: ConversationSummary, myId: string | null): string {
  const last = conversation.lastMessage;
  if (!last) return 'No messages yet';
  const mine = last.senderId === myId;
  if (last.deleted) return mine ? 'You deleted a message' : 'This message was deleted';
  const text = last.body.replace(/\s+/g, ' ').trim();
  if (last.kind === 'system') return text;
  if (mine) return `You: ${text}`;
  // in a group, say who: "Ifeoma: who's next?"
  if (conversation.kind === 'group' && last.senderName) return `${last.senderName}: ${text}`;
  return text;
}

/** The five filters on the Chat tab; each reads the server list of the same name. */
export type ChatTab = Exclude<ConversationFilter, 'filtered'>;

export const CHAT_TABS: { key: ChatTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'friends', label: 'Friends' },
  { key: 'groups', label: 'Groups' },
  { key: 'requests', label: 'Requests' },
  { key: 'bots', label: 'Bots' },
];

/** A random UUID v4 for a message id (the server uses it to make retries safe). */
export function newMessageId(random: () => number = Math.random): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(random() * 16);
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---- merging what the server says with what we're still sending --------------------------------

export type MessagesData = { pages: MessagesResponse[]; pageParams: unknown[] };

/** Every loaded message, newest first, each once. */
export function flattenPages(data: MessagesData | undefined): Message[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: Message[] = [];
  for (const page of data.pages) {
    for (const m of page.messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

/**
 * Adds a message to the cached thread (a live event, or our own send coming back). Does nothing to a thread
 * that isn't cached (it will load fresh), and never adds the same message twice.
 */
export function upsertMessage(
  data: MessagesData | undefined,
  message: Message,
): MessagesData | undefined {
  if (!data || data.pages.length === 0) return data;
  // Already have it. Money requests (open -> paid) and game cards (invited -> your turn -> result) change
  // later, so take the newer copy. A game card never goes backwards: events can arrive out of order.
  if (data.pages.some((p) => p.messages.some((m) => m.id === message.id))) {
    if (message.kind !== 'money_request' && message.kind !== 'game') return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        messages: p.messages.map((m) => {
          if (m.id !== message.id) return m;
          // a card update (paid, your turn, result) carries no reactions or quote: keep what we had
          const keep = { reactions: m.reactions, replyTo: m.replyTo };
          if (m.kind === 'game' && message.kind === 'game') {
            return message.payload.stateVersion >= m.payload.stateVersion
              ? { ...message, ...keep }
              : m;
          }
          return { ...message, ...keep } as Message;
        }),
      })),
    };
  }
  const [first, ...rest] = data.pages;
  const messages = [...first!.messages];
  // keep newest first: slot it in before the first message that is older
  const at = messages.findIndex((m) => m.createdAt < message.createdAt);
  messages.splice(at === -1 ? messages.length : at, 0, message);
  return { ...data, pages: [{ ...first!, messages }, ...rest] };
}

/** Records when the other person last read the thread. Only moves forward. */
export function withPeerReadAt(
  data: MessagesData | undefined,
  at: string,
): MessagesData | undefined {
  if (!data || data.pages.length === 0) return data;
  const [first, ...rest] = data.pages;
  if (first!.peerReadAt && first!.peerReadAt >= at) return data;
  return { ...data, pages: [{ ...first!, peerReadAt: at }, ...rest] };
}

/**
 * Server messages plus the ones still being sent. Unsent messages always sit at the bottom, and one that
 * the server has already confirmed (same id) is shown once, as the server's copy.
 */
export function mergeOutbox(server: Message[], outbox: ThreadMessage[]): ThreadMessage[] {
  const known = new Set(server.map((m) => m.id));
  const pending = outbox
    .filter((m) => !known.has(m.id))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  return [...pending, ...server];
}

/** Turns messages (newest first) into list items with day separators and message runs. */
export function buildThreadItems(
  messages: ThreadMessage[],
  myId: string | null,
  now: Date = new Date(),
): ThreadItem[] {
  const items: ThreadItem[] = [];
  messages.forEach((m, i) => {
    const newer = messages[i - 1]; // below it on screen
    const older = messages[i + 1]; // above it on screen
    const sameRun = (other: ThreadMessage | undefined) =>
      !!other &&
      other.kind !== 'system' &&
      m.kind !== 'system' &&
      other.senderId === m.senderId &&
      Math.abs(Date.parse(other.createdAt) - Date.parse(m.createdAt)) < GROUP_GAP_MS &&
      daysBetween(new Date(other.createdAt), new Date(m.createdAt)) === 0;

    items.push({
      kind: 'message',
      key: m.id,
      message: m,
      mine: m.senderId === myId,
      first: !sameRun(older),
      last: !sameRun(newer),
    });

    // a separator goes above the first message of each day
    if (!older || daysBetween(new Date(older.createdAt), new Date(m.createdAt)) !== 0) {
      items.push({
        kind: 'day',
        key: `day-${m.id}`,
        label: dayLabel(m.createdAt, now),
        time: clockTime(m.createdAt),
      });
    }
  });
  return items;
}

/** What to say under your most recent message: Sending…, Not sent, Sent, or Read. */
export function receiptFor(
  messages: ThreadMessage[],
  myId: string | null,
  peerReadAt: string | null,
): { id: string; label: 'Sending…' | 'Not sent' | 'Sent' | 'Read' } | null {
  const mine = messages.find((m) => m.senderId === myId);
  if (!mine) return null;
  if (mine.status === 'sending') return { id: mine.id, label: 'Sending…' };
  if (mine.status === 'failed') return { id: mine.id, label: 'Not sent' };
  return {
    id: mine.id,
    label: peerReadAt && mine.createdAt <= peerReadAt ? 'Read' : 'Sent',
  };
}

// ---- changes to messages already in the cache (reactions, polls, deletes) -----------------------

/** Applies `fn` to one message of the cached thread (and leaves everything else, including identity, alone). */
export function mapMessage(
  data: MessagesData | undefined,
  messageId: string,
  fn: (m: Message) => Message,
): MessagesData | undefined {
  if (!data) return data;
  let changed = false;
  const pages = data.pages.map((p) => {
    if (!p.messages.some((m) => m.id === messageId)) return p;
    changed = true;
    return { ...p, messages: p.messages.map((m) => (m.id === messageId ? fn(m) : m)) };
  });
  return changed ? { ...data, pages } : data;
}

/** The reaction you gave a message, if any. */
export const myReaction = (m: Pick<Message, 'reactions'>): ReactionKey | null =>
  m.reactions?.find((r) => r.mine)?.key ?? null;

/** Moves your reaction from `from` to `to` in a tally (null = none), keeping the fixed order and dropping zeros. */
export function withMyReaction(
  reactions: ReactionCount[] | undefined,
  from: ReactionKey | null,
  to: ReactionKey | null,
): ReactionCount[] {
  const next = new Map<ReactionKey, ReactionCount>();
  for (const r of reactions ?? []) next.set(r.key, { ...r, mine: false });
  if (from) {
    const r = next.get(from);
    if (r) next.set(from, { ...r, count: r.count - 1 });
  }
  if (to) {
    const r = next.get(to);
    next.set(to, { key: to, count: (r?.count ?? 0) + 1, mine: true });
  }
  return [...next.values()]
    .filter((r) => r.count > 0)
    .sort((a, b) => REACTION_KEYS.indexOf(a.key) - REACTION_KEYS.indexOf(b.key));
}

/** Your own tap on a reaction, shown at once: tapping the one you already gave takes it back. */
export function reactOptimistically(
  data: MessagesData | undefined,
  messageId: string,
  key: ReactionKey,
): { data: MessagesData | undefined; reaction: ReactionKey | null } {
  let reaction: ReactionKey | null = key;
  const next = mapMessage(data, messageId, (m) => {
    const mine = myReaction(m);
    reaction = mine === key ? null : key;
    return { ...m, reactions: withMyReaction(m.reactions, mine, reaction) } as Message;
  });
  return { data: next, reaction };
}

/** Puts the server's tally on a message (the reply to our own reaction). */
export function setReactions(
  data: MessagesData | undefined,
  messageId: string,
  reactions: ReactionCount[],
): MessagesData | undefined {
  return mapMessage(data, messageId, (m) => ({ ...m, reactions }) as Message);
}

/** A live `reaction` event: the new totals, with your own reaction kept (or set, when it was you on another device). */
export function applyReactionEvent(
  data: MessagesData | undefined,
  event: Extract<RealtimeEvent, { type: 'reaction' }>,
  myId: string | null,
): MessagesData | undefined {
  return mapMessage(data, event.messageId, (m) => {
    const mine = event.userId === myId ? event.reaction : myReaction(m);
    const reactions = event.counts
      .filter((c) => c.count > 0)
      .map((c) => ({ key: c.key, count: c.count, mine: c.key === mine }));
    return { ...m, reactions } as Message;
  });
}

/** The poll payload after you vote for `optionId` (null takes it back), before the server confirms. */
export function votedPoll(poll: PollPayload, optionId: number | null): PollPayload {
  const options = poll.options.map((o) => {
    let votes = o.votes;
    if (o.id === poll.myVote) votes -= 1;
    if (o.id === optionId) votes += 1;
    return { ...o, votes };
  });
  return {
    ...poll,
    options,
    myVote: optionId,
    total: options.reduce((n, o) => n + o.votes, 0),
  };
}

export function setPoll(
  data: MessagesData | undefined,
  messageId: string,
  payload: PollPayload,
): MessagesData | undefined {
  return mapMessage(data, messageId, (m) => (m.kind === 'poll' ? { ...m, payload } : m));
}

/** A live `poll` event: new totals, and your own vote kept (or set, when it was you on another device). */
export function applyPollEvent(
  data: MessagesData | undefined,
  event: Extract<RealtimeEvent, { type: 'poll' }>,
  myId: string | null,
): MessagesData | undefined {
  return mapMessage(data, event.messageId, (m) => {
    if (m.kind !== 'poll') return m;
    const tally = new Map(event.votes.map((v) => [v.id, v.votes]));
    return {
      ...m,
      payload: {
        ...m.payload,
        options: m.payload.options.map((o) => ({ ...o, votes: tally.get(o.id) ?? 0 })),
        total: event.total,
        myVote: event.voterId === myId ? event.optionId : m.payload.myVote,
      },
    };
  });
}

/** Deleted for everyone: what stays is a tombstone. */
export function tombstone(
  data: MessagesData | undefined,
  messageId: string,
): MessagesData | undefined {
  const next = mapMessage(data, messageId, (m) => {
    const { reactions: _r, payload: _p, ...rest } = m as Message & { payload?: unknown };
    return { ...rest, kind: 'text', body: '', deleted: true } as Message;
  });
  // anything that quoted it now quotes a deleted message
  return mapQuotes(next, messageId, (q) => ({ ...q, snippet: '', deleted: true }));
}

function mapQuotes(
  data: MessagesData | undefined,
  quotedId: string,
  fn: (q: ReplyPreview) => ReplyPreview,
): MessagesData | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      messages: p.messages.map((m) =>
        m.replyTo?.id === quotedId ? ({ ...m, replyTo: fn(m.replyTo) } as Message) : m,
      ),
    })),
  };
}

/** Deleted for me: gone from this person's thread. */
export function removeMessage(
  data: MessagesData | undefined,
  messageId: string,
): MessagesData | undefined {
  if (!data) return data;
  if (!data.pages.some((p) => p.messages.some((m) => m.id === messageId))) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      messages: p.messages.filter((m) => m.id !== messageId),
    })),
  };
}

// ---- the long-press menu -------------------------------------------------------------------------

export type MessageAction = 'react' | 'reply' | 'copy' | 'delete_me' | 'delete_everyone' | 'report';

/** Matches the server's `delete_for_everyone_minutes` (default 15, SPEC §6). */
export const DELETE_WINDOW_MS = DELETE_FOR_EVERYONE_MINUTES * MINUTE;

/** Your own text or poll, still inside the window. Cards (money, game) are records and can only be hidden. */
export function canDeleteForEveryone(
  m: ThreadMessage,
  myId: string | null,
  now: Date = new Date(),
): boolean {
  return (
    m.senderId === myId &&
    !m.deleted &&
    !m.status &&
    (m.kind === 'text' || m.kind === 'poll') &&
    now.getTime() - Date.parse(m.createdAt) <= DELETE_WINDOW_MS
  );
}

/**
 * What the long-press menu offers for a message. Nothing for a message still being sent, a deleted one or a
 * centred system line. React and Reply need a conversation you can answer in; Copy is for text; Report is
 * for what someone else wrote (never a bot, never a card); Forward and "Turn into a challenge" from the
 * design are left out until they exist.
 */
export function availableActions(
  m: ThreadMessage,
  o: {
    myId: string | null;
    conversationKind: ConversationSummary['kind'];
    /** False for a request you haven't accepted. */
    canAnswer: boolean;
    now?: Date;
  },
): MessageAction[] {
  if (m.status || m.deleted || m.kind === 'system') return [];
  const mine = m.senderId === o.myId;
  const actions: MessageAction[] = [];
  if (o.canAnswer) actions.push('react', 'reply');
  if (m.kind === 'text') actions.push('copy');
  actions.push('delete_me');
  if (canDeleteForEveryone(m, o.myId, o.now)) actions.push('delete_everyone');
  if (
    !mine &&
    !isBotSender(m.senderId) &&
    o.conversationKind !== 'bot' &&
    (m.kind === 'text' || m.kind === 'poll')
  ) {
    actions.push('report');
  }
  return actions;
}

/** What a reply quotes, built from the message being answered. */
export function replyPreviewOf(m: Message, senderName: string): ReplyPreview {
  const snippet =
    m.kind === 'poll' ? `Poll: ${m.payload.question}` : m.kind === 'game' ? 'Game' : m.body;
  return {
    id: m.id,
    senderId: m.senderId,
    senderName,
    snippet: snippet.replace(/\s+/g, ' ').trim().slice(0, 80),
    deleted: false,
  };
}

// ---- who said it (groups) ------------------------------------------------------------------------

export type Sender = { name: string; avatar: AvatarConfig | null; left: boolean };

/** Looks up names and avatars for a group's messages. Someone who has left keeps their name; a stranger is "Someone". */
export function senderLookup(members: GroupMember[] | undefined): (id: string) => Sender {
  const by = new Map(members?.map((m) => [m.user.id, m]));
  return (id) => {
    const m = by.get(id);
    if (!m) return { name: 'Someone', avatar: null, left: true };
    return {
      name: m.user.displayName || m.user.username,
      avatar: m.user.avatar,
      left: m.state === 'left',
    };
  };
}

/** "Amaka", "Amaka and Dayo", "Amaka, Dayo and 2 more": the line under a group's name in the thread header. */
export function memberCountLabel(count: number): string {
  return count === 1 ? '1 person' : `${count} people`;
}

/** The "Poll" bar width, as a whole percent of the votes cast (0 when nobody has voted). */
export function pollPercent(votes: number, total: number): number {
  return total === 0 ? 0 : Math.round((votes / total) * 100);
}
