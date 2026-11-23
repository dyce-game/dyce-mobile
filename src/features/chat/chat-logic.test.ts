import type {
  ConversationSummary,
  GameCardPayload,
  GroupMember,
  Message,
  MessagesResponse,
  PollPayload,
  RealtimeEvent,
} from '@dyce/shared';
import {
  CHAT_TABS,
  applyPollEvent,
  applyReactionEvent,
  availableActions,
  buildThreadItems,
  canDeleteForEveryone,
  clockTime,
  conversationTitle,
  dayLabel,
  flattenPages,
  listTime,
  memberCountLabel,
  mergeOutbox,
  myReaction,
  newMessageId,
  pollPercent,
  previewText,
  reactOptimistically,
  receiptFor,
  removeMessage,
  replyPreviewOf,
  senderLookup,
  setPoll,
  setReactions,
  tombstone,
  upsertMessage,
  votedPoll,
  withMyReaction,
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
});

// ---- groups, bots, replies, reactions, polls and deletes ----------------------------------------

const direct = (last: Message | null): ConversationSummary => ({
  id: 'c1',
  kind: 'direct',
  peer: { id: THEM, username: 'them', displayName: 'Them', avatar: null, relationship: 'friends' },
  state: 'active',
  lastMessage: last,
  unread: 0,
});
const groupConv = (last: Message | null): ConversationSummary => ({
  id: 'g1',
  kind: 'group',
  group: { title: 'Game night', photoUrl: null, memberCount: 4, role: 'member', members: [] },
  state: 'active',
  lastMessage: last,
  unread: 0,
});
const botConv = (last: Message | null): ConversationSummary => ({
  id: 'b1',
  kind: 'bot',
  bot: {
    slug: 'coach-cue',
    name: 'Coach Cue',
    tagline: '8 Ball drills',
    color: '#5A4FCF',
    gameSlug: 'eight-ball',
  },
  state: 'active',
  lastMessage: last,
  unread: 0,
});

describe('previews of groups, bots and deleted messages', () => {
  it('names the sender in a group, and says "You" for yours', () => {
    const last = { ...msg('a', 'ifeoma', at(2026, 11, 14), "who's next?"), senderName: 'Ifeoma' };
    expect(previewText(groupConv(last), ME)).toBe("Ifeoma: who's next?");
    expect(previewText(groupConv(msg('b', ME, at(2026, 11, 14), 'me')), ME)).toBe('You: me');
  });
  it('shows system lines as they are, and tombstones in words', () => {
    const system: Message = {
      ...msg('s', 'ifeoma', at(2026, 11, 14), 'Ifeoma added Dayo'),
      kind: 'system',
    } as Message;
    expect(previewText(groupConv(system), ME)).toBe('Ifeoma added Dayo');
    const gone = { ...msg('d', THEM, at(2026, 11, 14), ''), deleted: true };
    expect(previewText(direct(gone), ME)).toBe('This message was deleted');
    expect(previewText(direct({ ...gone, senderId: ME }), ME)).toBe('You deleted a message');
  });
  it('shows a bot’s words without a name', () => {
    expect(previewText(botConv(msg('a', 'bot:coach-cue', at(2026, 11, 14), 'Chalk up.')), ME)).toBe(
      'Chalk up.',
    );
  });
  it('titles every kind of conversation', () => {
    expect(conversationTitle(direct(null))).toBe('Them');
    expect(conversationTitle(groupConv(null))).toBe('Game night');
    expect(conversationTitle(botConv(null))).toBe('Coach Cue');
  });
});

const reacted = (...keys: ['gg' | 'ha' | 'wow' | 'q' | 'l', number, boolean][]): Message => ({
  ...msg('m1', THEM, at(2026, 11, 14), 'hello'),
  reactions: keys.map(([key, count, mine]) => ({ key, count, mine })),
});
const one = (m: Message) => data(page([m]));
const first = (d: MessagesData | undefined) => d!.pages[0]!.messages[0]!;

describe('reactions in the cache', () => {
  it('moves your reaction, keeping the fixed order and dropping empty ones', () => {
    expect(withMyReaction(undefined, null, 'gg')).toEqual([{ key: 'gg', count: 1, mine: true }]);
    expect(
      withMyReaction(
        [
          { key: 'gg', count: 1, mine: true },
          { key: 'ha', count: 2, mine: false },
        ],
        'gg',
        'wow',
      ),
    ).toEqual([
      { key: 'ha', count: 2, mine: false },
      { key: 'wow', count: 1, mine: true },
    ]);
    expect(withMyReaction([{ key: 'gg', count: 1, mine: true }], 'gg', null)).toEqual([]);
  });

  it('shows your tap at once, and a second tap on the same one takes it back', () => {
    const d = one(msg('m1', THEM, at(2026, 11, 14)));
    const a = reactOptimistically(d, 'm1', 'gg');
    expect(a.reaction).toBe('gg');
    expect(myReaction(first(a.data))).toBe('gg');
    const b = reactOptimistically(a.data, 'm1', 'gg');
    expect(b.reaction).toBeNull();
    expect(first(b.data).reactions).toEqual([]);
    const c = reactOptimistically(a.data, 'm1', 'ha');
    expect(c.reaction).toBe('ha');
    expect(first(c.data).reactions).toEqual([{ key: 'ha', count: 1, mine: true }]);
  });

  it('leaves a thread that does not have the message alone (same object)', () => {
    const d = one(msg('m1', THEM, at(2026, 11, 14)));
    expect(reactOptimistically(d, 'nope', 'gg').data).toBe(d);
  });

  it('takes the server’s tally, and live events keep your own reaction', () => {
    const d = one(reacted(['gg', 1, true]));
    expect(first(setReactions(d, 'm1', [{ key: 'ha', count: 3, mine: false }])).reactions).toEqual([
      { key: 'ha', count: 3, mine: false },
    ]);
    const event: Extract<RealtimeEvent, { type: 'reaction' }> = {
      type: 'reaction',
      conversationId: 'c1',
      messageId: 'm1',
      userId: 'amaka',
      reaction: 'ha',
      counts: [
        { key: 'gg', count: 1 },
        { key: 'ha', count: 1 },
      ],
    };
    // someone else's reaction: yours (gg) stays marked
    expect(first(applyReactionEvent(d, event, ME)).reactions).toEqual([
      { key: 'gg', count: 1, mine: true },
      { key: 'ha', count: 1, mine: false },
    ]);
    // your own on another device: that one becomes yours
    expect(first(applyReactionEvent(d, { ...event, userId: ME }, ME)).reactions).toEqual([
      { key: 'gg', count: 1, mine: false },
      { key: 'ha', count: 1, mine: true },
    ]);
    // zero counts vanish
    expect(
      first(applyReactionEvent(d, { ...event, reaction: null, counts: [] }, ME)).reactions,
    ).toEqual([]);
  });
});

const poll = (over: Partial<PollPayload> = {}): PollPayload => ({
  question: 'What are we playing at 9?',
  options: [
    { id: 0, text: 'Crazy Cards', votes: 2 },
    { id: 1, text: 'Whot!', votes: 1 },
  ],
  total: 3,
  myVote: null,
  ...over,
});
const pollMessage = (p: PollPayload): Message => ({
  ...msg('p1', THEM, at(2026, 11, 14)),
  kind: 'poll',
  payload: p,
});

describe('polls in the cache', () => {
  it('counts your vote at once, moves it when you change it, and removes it', () => {
    const v = votedPoll(poll(), 1);
    expect(v).toMatchObject({ myVote: 1, total: 4 });
    expect(v.options.map((o) => o.votes)).toEqual([2, 2]);
    const moved = votedPoll(v, 0);
    expect(moved.options.map((o) => o.votes)).toEqual([3, 1]);
    expect(moved.total).toBe(4);
    const back = votedPoll(moved, null);
    expect(back).toMatchObject({ myVote: null, total: 3 });
    expect(back.options.map((o) => o.votes)).toEqual([2, 1]);
  });

  it('takes live tallies and keeps your vote unless the voter was you', () => {
    const d = one(pollMessage(poll({ myVote: 0 })));
    const event: Extract<RealtimeEvent, { type: 'poll' }> = {
      type: 'poll',
      conversationId: 'c1',
      messageId: 'p1',
      voterId: 'amaka',
      optionId: 1,
      votes: [
        { id: 0, votes: 2 },
        { id: 1, votes: 2 },
      ],
      total: 4,
    };
    const m = first(applyPollEvent(d, event, ME)) as Extract<Message, { kind: 'poll' }>;
    expect(m.payload).toMatchObject({ total: 4, myVote: 0 });
    expect(m.payload.options.map((o) => o.votes)).toEqual([2, 2]);
    const mine = first(applyPollEvent(d, { ...event, voterId: ME, optionId: 1 }, ME)) as Extract<
      Message,
      { kind: 'poll' }
    >;
    expect(mine.payload.myVote).toBe(1);
    const set = first(setPoll(d, 'p1', poll({ total: 9 }))) as Extract<Message, { kind: 'poll' }>;
    expect(set.payload.total).toBe(9);
  });

  it('works out bar widths', () => {
    expect(pollPercent(0, 0)).toBe(0);
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(3, 3)).toBe(100);
  });
});

describe('deleting', () => {
  it('turns a message into a tombstone and its quotes into "deleted"', () => {
    const original = reacted(['gg', 1, false]);
    const reply: Message = {
      ...msg('m2', ME, at(2026, 11, 14, 12, 5), 'yes'),
      replyTo: { id: 'm1', senderId: THEM, senderName: 'Them', snippet: 'hello', deleted: false },
    };
    const out = tombstone(data(page([reply, original])), 'm1')!;
    const [r, t] = out.pages[0]!.messages;
    expect(t).toMatchObject({ id: 'm1', kind: 'text', body: '', deleted: true });
    expect(t!.reactions).toBeUndefined();
    expect(r!.replyTo).toMatchObject({ snippet: '', deleted: true });
  });

  it('drops a message you deleted for yourself, keeping everything else', () => {
    const d = data(
      page([msg('a', ME, at(2026, 11, 14, 12, 2)), msg('b', THEM, at(2026, 11, 14, 12, 1))]),
    );
    expect(flattenPages(removeMessage(d, 'a')).map((m) => m.id)).toEqual(['b']);
    expect(removeMessage(d, 'nope')).toBe(d);
  });

  it('knows when a message can still be deleted for everyone', () => {
    const sent = (minsAgo: number): Message =>
      msg('x', ME, new Date(NOW.getTime() - minsAgo * 60_000).toISOString());
    expect(canDeleteForEveryone(sent(14), ME, NOW)).toBe(true);
    expect(canDeleteForEveryone(sent(16), ME, NOW)).toBe(false);
    expect(canDeleteForEveryone({ ...sent(1), senderId: THEM }, ME, NOW)).toBe(false);
    expect(canDeleteForEveryone({ ...sent(1), deleted: true }, ME, NOW)).toBe(false);
    expect(canDeleteForEveryone({ ...sent(1), status: 'sending' }, ME, NOW)).toBe(false);
    const card = { ...sent(1), kind: 'money_sent', payload: {} } as unknown as Message;
    expect(canDeleteForEveryone(card, ME, NOW)).toBe(false);
  });
});

describe('the long-press menu', () => {
  const fresh = (over: Partial<Message> = {}): Message =>
    ({ ...msg('x', THEM, new Date(NOW.getTime() - 60_000).toISOString()), ...over }) as Message;
  const ctx = { myId: ME, conversationKind: 'group' as const, canAnswer: true, now: NOW };

  it('offers react, reply, copy, delete for me and report on someone else’s text', () => {
    expect(availableActions(fresh(), ctx)).toEqual([
      'react',
      'reply',
      'copy',
      'delete_me',
      'report',
    ]);
  });
  it('offers delete for everyone on your own recent text, and no report', () => {
    expect(availableActions(fresh({ senderId: ME }), ctx)).toEqual([
      'react',
      'reply',
      'copy',
      'delete_me',
      'delete_everyone',
    ]);
    const old = fresh({
      senderId: ME,
      createdAt: new Date(NOW.getTime() - 20 * 60_000).toISOString(),
    });
    expect(availableActions(old, ctx)).not.toContain('delete_everyone');
  });
  it('does not react or reply in a request you have not accepted', () => {
    expect(availableActions(fresh(), { ...ctx, canAnswer: false })).toEqual([
      'copy',
      'delete_me',
      'report',
    ]);
  });
  it('offers nothing on system lines, tombstones, or a message still sending', () => {
    expect(availableActions(fresh({ kind: 'system' }), ctx)).toEqual([]);
    expect(availableActions(fresh({ deleted: true }), ctx)).toEqual([]);
    expect(availableActions({ ...fresh(), status: 'sending' } as ThreadMessage, ctx)).toEqual([]);
  });
  it('never offers to report a bot, a card, or copy a poll', () => {
    expect(
      availableActions(fresh({ senderId: 'bot:coach-cue' }), { ...ctx, conversationKind: 'bot' }),
    ).not.toContain('report');
    const card = fresh({ kind: 'money_sent', payload: {} } as unknown as Partial<Message>);
    expect(availableActions(card, ctx)).not.toContain('report');
    expect(availableActions(card, ctx)).not.toContain('copy');
    const p = availableActions(pollMessage(poll()), ctx);
    expect(p).not.toContain('copy');
    expect(p).toContain('report');
  });
});

describe('replies and senders', () => {
  it('quotes a text, a poll and a game in one short line', () => {
    expect(replyPreviewOf(msg('a', THEM, at(2026, 11, 14), 'a  long\nmessage'), 'Them')).toEqual({
      id: 'a',
      senderId: THEM,
      senderName: 'Them',
      snippet: 'a long message',
      deleted: false,
    });
    expect(replyPreviewOf(pollMessage(poll()), 'Them').snippet).toBe(
      'Poll: What are we playing at 9?',
    );
    expect(
      replyPreviewOf(msg('b', THEM, at(2026, 11, 14), 'x'.repeat(200)), 'Them').snippet,
    ).toHaveLength(80);
  });

  it('looks up names, and keeps the name of someone who left', () => {
    const members: GroupMember[] = [
      {
        user: {
          id: 'u1',
          username: 'amaka',
          displayName: 'Amaka O',
          avatar: null,
          relationship: 'friends',
        },
        role: 'admin',
        state: 'active',
        joinedAt: at(2026, 11, 1),
      },
      {
        user: { id: 'u2', username: 'dayo', displayName: '', avatar: null, relationship: 'none' },
        role: 'member',
        state: 'left',
        joinedAt: at(2026, 11, 1),
      },
    ];
    const who = senderLookup(members);
    expect(who('u1')).toMatchObject({ name: 'Amaka O', left: false });
    expect(who('u2')).toMatchObject({ name: 'dayo', left: true });
    expect(who('stranger')).toMatchObject({ name: 'Someone', left: true });
    expect(senderLookup(undefined)('u1').name).toBe('Someone');
  });

  it('counts people', () => {
    expect(memberCountLabel(1)).toBe('1 person');
    expect(memberCountLabel(5)).toBe('5 people');
  });

  it('breaks a run of messages at a system line, and keeps reactions on a card update', () => {
    const system = { ...msg('s', 'a', at(2026, 11, 14, 12, 1)), kind: 'system' } as Message;
    const items = buildThreadItems(
      [msg('m2', 'a', at(2026, 11, 14, 12, 2)), system, msg('m1', 'a', at(2026, 11, 14, 12, 0))],
      ME,
      NOW,
    ).filter((i) => i.kind === 'message');
    // m2 / system / m1 (newest first): neither text message shares a run with the other
    expect(
      items.map((i) => [i.kind === 'message' && i.first, i.kind === 'message' && i.last]),
    ).toEqual([
      [true, true],
      [true, true],
      [true, true],
    ]);

    const game = (v: number): Message => ({
      ...msg('g', ME, at(2026, 11, 14)),
      kind: 'game',
      payload: { stateVersion: v } as GameCardPayload,
      reactions: [{ key: 'gg', count: 1, mine: true }],
    });
    const { reactions: _drop, ...bare } = game(2) as Message & { reactions?: unknown };
    const merged = first(upsertMessage(one(game(1)), bare as Message));
    expect(merged.reactions).toEqual([{ key: 'gg', count: 1, mine: true }]);
  });
});
