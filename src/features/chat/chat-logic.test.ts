import type { ConversationSummary, GameCardPayload, Message, MessagesResponse } from '@dyce/shared';
import {
  CHAT_TABS,
  buildThreadItems,
  clockTime,
  dayLabel,
  filterForTab,
  flattenPages,
  listTime,
  mergeOutbox,
  newMessageId,
  previewText,
  receiptFor,
  rowsForTab,
  upsertMessage,
  withPeerReadAt,
  type MessagesData,
  type ThreadMessage,
} from './chat-logic';

const ME = 'me';
const THEM = 'them';
// Local-time constructors keep these tests independent of the machine's time zone.
const at = (y: number, mo: number, d: number, h = 12, mi = 0) =>
  new Date(y, mo - 1, d, h, mi).toISOString();
const NOW = new Date(2026, 10, 14, 15, 0); // Sat 14 Nov 2026, 3pm

const msg = (id: string, sender: string, createdAt: string, body = id): Message => ({
  id,
  conversationId: 'c1',
  senderId: sender,
  kind: 'text',
  body,
  createdAt,
});
const page = (messages: Message[], extra: Partial<MessagesResponse> = {}): MessagesResponse => ({
  messages,
  nextCursor: null,
  peerReadAt: null,
  ...extra,
});
const data = (...pages: MessagesResponse[]): MessagesData => ({ pages, pageParams: [] });

describe('time wording', () => {
  it('formats the clock the way people say it', () => {
    expect(clockTime(at(2026, 11, 14, 16, 30))).toBe('4:30 PM');
    expect(clockTime(at(2026, 11, 14, 0, 5))).toBe('12:05 AM');
    expect(clockTime(at(2026, 11, 14, 12, 0))).toBe('12:00 PM');
    expect(clockTime(at(2026, 11, 14, 9, 7))).toBe('9:07 AM');
  });

  it('labels days for separators', () => {
    expect(dayLabel(at(2026, 11, 14, 9), NOW)).toBe('Today');
    expect(dayLabel(at(2026, 11, 13, 23), NOW)).toBe('Yesterday');
    expect(dayLabel(at(2026, 11, 11, 8), NOW)).toBe('Wednesday');
    expect(dayLabel(at(2026, 11, 3, 8), NOW)).toBe('Nov 3');
    expect(dayLabel(at(2025, 12, 30, 8), NOW)).toBe('Dec 30, 2025');
  });

  it('labels the time on chat list rows', () => {
    expect(listTime(at(2026, 11, 14, 9, 41), NOW)).toBe('9:41 AM');
    expect(listTime(at(2026, 11, 13, 20), NOW)).toBe('Yesterday');
    expect(listTime(at(2026, 11, 10, 20), NOW)).toBe('Tue');
    expect(listTime(at(2026, 10, 2, 20), NOW)).toBe('Oct 2');
    expect(listTime(at(2025, 10, 2, 20), NOW)).toBe('Oct 2, 2025');
  });

  it('counts midnight as a new day even a minute later', () => {
    expect(dayLabel(at(2026, 11, 13, 23, 59), new Date(2026, 10, 14, 0, 1))).toBe('Yesterday');
  });
});

describe('previewText', () => {
  const conv = (last: Message | null): ConversationSummary => ({
    id: 'c1',
    kind: 'direct',
    peer: {
      id: THEM,
      username: 'them',
      displayName: 'Them',
      avatar: null,
      relationship: 'friends',
    },
    state: 'active',
    lastMessage: last,
    unread: 0,
  });
  it('prefixes your own messages and flattens line breaks', () => {
    expect(previewText(conv(msg('a', ME, at(2026, 11, 14), 'hi\n\n there')), ME)).toBe(
      'You: hi there',
    );
    expect(previewText(conv(msg('a', THEM, at(2026, 11, 14), 'yo')), ME)).toBe('yo');
    expect(previewText(conv(null), ME)).toBe('No messages yet');
  });
});

describe('newMessageId', () => {
  it('makes v4-shaped ids that differ', () => {
    const ids = new Set(Array.from({ length: 50 }, () => newMessageId()));
    expect(ids.size).toBe(50);
    for (const id of ids)
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
  it('still works where crypto.randomUUID is missing', () => {
    const g = globalThis as { crypto?: unknown };
    const saved = g.crypto;
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true });
    try {
      let n = 0;
      expect(newMessageId(() => ((n += 7) % 16) / 16)).toMatch(/^[0-9a-f-]{36}$/);
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true });
    }
  });
});

describe('the cached thread', () => {
  it('flattens pages newest first, each message once', () => {
    const a = msg('a', ME, at(2026, 11, 14, 12, 3));
    const b = msg('b', THEM, at(2026, 11, 14, 12, 2));
    const c = msg('c', ME, at(2026, 11, 14, 12, 1));
    expect(flattenPages(data(page([a, b]), page([b, c]))).map((m) => m.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
    expect(flattenPages(undefined)).toEqual([]);
  });

  it('slots a live message in order, and ignores one it already has', () => {
    const a = msg('a', ME, at(2026, 11, 14, 12, 3));
    const c = msg('c', ME, at(2026, 11, 14, 12, 1));
    const base = data(page([a, c]));
    const b = msg('b', THEM, at(2026, 11, 14, 12, 2));
    expect(flattenPages(upsertMessage(base, b)).map((m) => m.id)).toEqual(['a', 'b', 'c']);
    const newest = msg('n', THEM, at(2026, 11, 14, 12, 9));
    expect(flattenPages(upsertMessage(base, newest)).map((m) => m.id)).toEqual(['n', 'a', 'c']);
    const oldest = msg('o', THEM, at(2026, 11, 14, 11, 0));
    expect(flattenPages(upsertMessage(base, oldest)).map((m) => m.id)).toEqual(['a', 'c', 'o']);
    expect(upsertMessage(base, a)).toBe(base);
  });

  describe('a game card', () => {
    const card = (stateVersion: number, status: GameCardPayload['status']): Message => ({
      id: 'g1',
      conversationId: 'c1',
      senderId: ME,
      kind: 'game',
      body: 'Pig · Free',
      createdAt: at(2026, 11, 14, 12, 3),
      payload: {
        matchId: 'g1',
        gameSlug: '_example',
        gameName: 'Pig',
        mode: 'free',
        stakeKobo: 0,
        potKobo: 0,
        counterStakeKobo: null,
        allowCounter: false,
        status,
        currentTurn: null,
        winnerIds: null,
        draw: false,
        stateVersion,
      },
    });
    const statusOf = (d: MessagesData | undefined) => {
      const m = flattenPages(d)[0];
      return m?.kind === 'game' ? m.payload.status : null;
    };

    it('is replaced by a newer copy as the match moves', () => {
      const base = data(page([card(0, 'invited')]));
      expect(statusOf(upsertMessage(base, card(0, 'active')))).toBe('active');
      expect(statusOf(upsertMessage(base, card(4, 'active')))).toBe('active');
    });

    it('never goes backwards when updates arrive out of order', () => {
      const base = data(page([card(5, 'finished')]));
      expect(statusOf(upsertMessage(base, card(2, 'active')))).toBe('finished');
    });
  });

  it('leaves an uncached thread alone', () => {
    expect(upsertMessage(undefined, msg('a', ME, at(2026, 11, 14)))).toBeUndefined();
  });

  it('moves the read marker forward only', () => {
    const base = data(page([], { peerReadAt: at(2026, 11, 14, 12, 5) }));
    expect(withPeerReadAt(base, at(2026, 11, 14, 12, 9))!.pages[0]!.peerReadAt).toBe(
      at(2026, 11, 14, 12, 9),
    );
    expect(withPeerReadAt(base, at(2026, 11, 14, 12, 1))).toBe(base);
  });

  it('does not mutate the cache it was given', () => {
    const base = data(page([msg('a', ME, at(2026, 11, 14, 12, 3))]));
    const frozen = JSON.stringify(base);
    upsertMessage(base, msg('z', THEM, at(2026, 11, 14, 12, 9)));
    withPeerReadAt(base, at(2026, 11, 14, 13));
    expect(JSON.stringify(base)).toBe(frozen);
  });
});

describe('unsent messages', () => {
  const sending = (id: string, t: string): ThreadMessage => ({
    ...msg(id, ME, t),
    status: 'sending',
  });

  it('sit at the bottom, newest first, until the server confirms them', () => {
    const server = [
      msg('s2', THEM, at(2026, 11, 14, 12, 2)),
      msg('s1', ME, at(2026, 11, 14, 12, 1)),
    ];
    const out = [sending('p1', at(2026, 11, 14, 12, 3)), sending('p2', at(2026, 11, 14, 12, 4))];
    expect(mergeOutbox(server, out).map((m) => m.id)).toEqual(['p2', 'p1', 's2', 's1']);
  });

  it('shows a confirmed message once, as the server’s copy', () => {
    const confirmed = msg('p1', ME, at(2026, 11, 14, 12, 3));
    const merged = mergeOutbox([confirmed], [sending('p1', at(2026, 11, 14, 12, 3))]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.status).toBeUndefined();
  });
});

describe('buildThreadItems', () => {
  const kinds = (items: ReturnType<typeof buildThreadItems>) =>
    items.map((i) => (i.kind === 'day' ? `day:${i.label}` : i.key));

  it('puts a day separator above the first message of each day, and above the oldest', () => {
    const items = buildThreadItems(
      [
        msg('m3', ME, at(2026, 11, 14, 9)),
        msg('m2', THEM, at(2026, 11, 13, 22)),
        msg('m1', ME, at(2026, 11, 13, 21)),
      ],
      ME,
      NOW,
    );
    expect(kinds(items)).toEqual(['m3', 'day:Today', 'm2', 'm1', 'day:Yesterday']);
  });

  it('groups runs from one person and marks their top and bottom', () => {
    const items = buildThreadItems(
      [
        msg('c', ME, at(2026, 11, 14, 12, 2)),
        msg('b', ME, at(2026, 11, 14, 12, 1)),
        msg('a', THEM, at(2026, 11, 14, 12, 0)),
      ],
      ME,
      NOW,
    );
    const flags = Object.fromEntries(
      items.flatMap((i) => (i.kind === 'message' ? [[i.key, [i.first, i.last, i.mine]]] : [])),
    );
    expect(flags).toEqual({
      a: [true, true, false],
      b: [true, false, true],
      c: [false, true, true],
    });
  });

  it('starts a new run after a long pause, and across midnight', () => {
    const items = buildThreadItems(
      [msg('b', ME, at(2026, 11, 14, 12, 30)), msg('a', ME, at(2026, 11, 14, 12, 0))],
      ME,
      NOW,
    );
    expect(items.filter((i) => i.kind === 'message' && i.first)).toHaveLength(2);
    const overnight = buildThreadItems(
      [msg('b', ME, at(2026, 11, 14, 0, 1)), msg('a', ME, at(2026, 11, 13, 23, 59))],
      ME,
      NOW,
    );
    expect(overnight.filter((i) => i.kind === 'message' && i.first)).toHaveLength(2);
  });

  it('is empty for no messages', () => {
    expect(buildThreadItems([], ME, NOW)).toEqual([]);
  });
});

describe('receiptFor', () => {
  const mine = msg('m', ME, at(2026, 11, 14, 12, 5));
  const theirs = msg('t', THEM, at(2026, 11, 14, 12, 6));

  it('says nothing when you have sent nothing', () => {
    expect(receiptFor([theirs], ME, null)).toBeNull();
  });
  it('reports the state of your latest message', () => {
    expect(receiptFor([theirs, mine], ME, null)).toEqual({ id: 'm', label: 'Sent' });
    expect(receiptFor([theirs, mine], ME, at(2026, 11, 14, 12, 5))).toEqual({
      id: 'm',
      label: 'Read',
    });
    expect(receiptFor([theirs, mine], ME, at(2026, 11, 14, 12, 4))!.label).toBe('Sent');
    expect(receiptFor([{ ...mine, status: 'sending' }], ME, null)!.label).toBe('Sending…');
    expect(receiptFor([{ ...mine, status: 'failed' }], ME, null)!.label).toBe('Not sent');
  });
});

describe('the Chat tab filters', () => {
  it('has the five filters of the design, in order', () => {
    expect(CHAT_TABS.map((t) => t.key)).toEqual(['all', 'friends', 'groups', 'requests', 'bots']);
  });
  it('reads the server list for All, Friends and Requests, and "all" for the rest (to keep the Requests count)', () => {
    expect(filterForTab('all')).toBe('all');
    expect(filterForTab('friends')).toBe('friends');
    expect(filterForTab('requests')).toBe('requests');
    expect(filterForTab('groups')).toBe('all');
    expect(filterForTab('bots')).toBe('all');
  });
  it('lists nothing under Groups and Bots until they exist, and never hides rows elsewhere', () => {
    const rows = [{ id: 'c1' }, { id: 'c2' }] as ConversationSummary[];
    expect(rowsForTab('groups', rows)).toEqual([]);
    expect(rowsForTab('bots', rows)).toEqual([]);
    expect(rowsForTab('all', rows)).toBe(rows);
    expect(rowsForTab('requests', rows)).toBe(rows);
  });
});
