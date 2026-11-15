import type {
  ConversationFilter,
  ConversationSummary,
  Message,
  MessagesResponse,
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

/** The preview line under a name in the chat list. */
export function previewText(conversation: ConversationSummary, myId: string | null): string {
  const last = conversation.lastMessage;
  if (!last) return 'No messages yet';
  const text = last.body.replace(/\s+/g, ' ').trim();
  return last.senderId === myId ? `You: ${text}` : text;
}

/** The five filters on the Chat tab. Groups and Bots arrive with those features and show an honest empty state. */
export type ChatTab = ConversationFilter | 'groups' | 'bots';

export const CHAT_TABS: { key: ChatTab; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'friends', label: 'Friends' },
  { key: 'groups', label: 'Groups' },
  { key: 'requests', label: 'Requests' },
  { key: 'bots', label: 'Bots' },
];

/** Which server list a tab reads. Groups and Bots have none yet, so they read "all" (for the Requests count) and show no rows. */
export function filterForTab(tab: ChatTab): ConversationFilter {
  return tab === 'groups' || tab === 'bots' ? 'all' : tab;
}

/** The conversations to list under a tab (none for Groups and Bots until they exist). */
export function rowsForTab(tab: ChatTab, rows: ConversationSummary[]): ConversationSummary[] {
  return tab === 'groups' || tab === 'bots' ? [] : rows;
}

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
          if (m.kind === 'game' && message.kind === 'game') {
            return message.payload.stateVersion >= m.payload.stateVersion ? message : m;
          }
          return message;
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
