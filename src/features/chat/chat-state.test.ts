import { QueryClient } from '@tanstack/react-query';
import { queryKeys, type MatchView, type Message } from '@dyce/shared';
import { jwtExpiresAt } from '../auth/jwt';
import type { MessagesData } from './chat-logic';
import { createOutboxStore } from './outbox';
import { applyRealtimeEvent } from './realtime-cache';
import { createTypingTracker } from './typing';

const ME = 'me';
const THEM = 'them';
const CONV = 'c1';

const msg = (id: string, sender: string, createdAt: string): Message => ({
  id,
  conversationId: CONV,
  senderId: sender,
  kind: 'text',
  body: id,
  createdAt,
});

describe('jwtExpiresAt', () => {
  const token = (payload: object) =>
    `h.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.s`;
  it('reads exp in milliseconds', () => {
    expect(jwtExpiresAt(token({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });
  it('returns null for anything it cannot read', () => {
    expect(jwtExpiresAt('nonsense')).toBeNull();
    expect(jwtExpiresAt('a.%%%.c')).toBeNull();
    expect(jwtExpiresAt(token({ sub: 'x' }))).toBeNull();
    expect(jwtExpiresAt(token({ exp: 'soon' }))).toBeNull();
  });
});

describe('outbox', () => {
  const m = (id: string, conv = CONV) => ({
    ...msg(id, ME, '2026-11-14T10:00:00.000Z'),
    conversationId: conv,
  });

  it('tracks a message from sending to failed to gone', () => {
    const s = createOutboxStore();
    s.getState().add(m('a'));
    expect(s.getState().byConversation[CONV]![0]).toMatchObject({ id: 'a', status: 'sending' });
    s.getState().markFailed(CONV, 'a', 'No connection', true);
    expect(s.getState().byConversation[CONV]![0]).toMatchObject({
      status: 'failed',
      error: 'No connection',
      retryable: true,
    });
    s.getState().markSending(CONV, 'a');
    expect(s.getState().byConversation[CONV]![0]).toMatchObject({ status: 'sending' });
    expect(s.getState().byConversation[CONV]![0]!.error).toBeUndefined();
    s.getState().remove(CONV, 'a');
    expect(s.getState().byConversation).toEqual({});
  });

  it('keeps conversations apart and does not duplicate a message added twice', () => {
    const s = createOutboxStore();
    s.getState().add(m('a'));
    s.getState().add(m('a'));
    s.getState().add(m('b', 'other'));
    expect(s.getState().byConversation[CONV]).toHaveLength(1);
    expect(Object.keys(s.getState().byConversation).sort()).toEqual(['c1', 'other']);
  });
});

describe('typing tracker', () => {
  function tracker() {
    const timers: { fn: () => void; ms: number; id: number; cleared: boolean }[] = [];
    const t = createTypingTracker({
      ttlMs: 6000,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms, id: timers.length, cleared: false });
        return timers.length - 1;
      },
      clearTimer: (id) => {
        timers[id as number]!.cleared = true;
      },
    });
    return { t, timers };
  }

  it('shows typing until told they stopped', () => {
    const { t } = tracker();
    t.setTyping(CONV, true);
    expect(t.isTyping(CONV)).toBe(true);
    t.setTyping(CONV, false);
    expect(t.isTyping(CONV)).toBe(false);
  });

  it('fades a typing signal that never gets a stop, and restarts the clock on each new signal', () => {
    const { t, timers } = tracker();
    t.setTyping(CONV, true);
    t.setTyping(CONV, true);
    expect(timers[0]!.cleared).toBe(true);
    expect(timers[1]!.ms).toBe(6000);
    timers[1]!.fn();
    expect(t.isTyping(CONV)).toBe(false);
  });

  it('tracks conversations separately and can be reset', () => {
    const { t } = tracker();
    t.setTyping('a', true);
    t.setTyping('b', true);
    t.setTyping('a', false);
    expect(t.isTyping('b')).toBe(true);
    t.reset();
    expect(t.isTyping('b')).toBe(false);
  });
});

describe('applyRealtimeEvent', () => {
  const setup = () => {
    const client = new QueryClient();
    const typing = createTypingTracker({ setTimer: () => 0, clearTimer: () => undefined });
    const invalidated: unknown[] = [];
    client.invalidateQueries = ((filters: { queryKey: unknown }) => {
      invalidated.push(filters.queryKey);
      return Promise.resolve();
    }) as typeof client.invalidateQueries;
    const seed = (messages: Message[], peerReadAt: string | null = null) =>
      client.setQueryData<MessagesData>(queryKeys.messages(CONV), {
        pages: [{ messages, nextCursor: null, peerReadAt }],
        pageParams: [undefined],
      });
    const cached = () => client.getQueryData<MessagesData>(queryKeys.messages(CONV));
    return { client, typing, invalidated, seed, cached };
  };

  it('puts a new message into an open thread and refreshes the lists', () => {
    const { client, typing, invalidated, seed, cached } = setup();
    seed([msg('a', ME, '2026-11-14T10:00:00.000Z')]);
    applyRealtimeEvent(
      client,
      { type: 'message', message: msg('b', THEM, '2026-11-14T10:01:00.000Z') },
      ME,
      typing,
    );
    expect(cached()!.pages[0]!.messages.map((m) => m.id)).toEqual(['b', 'a']);
    expect(invalidated).toContainEqual(queryKeys.conversationsAll);
  });

  it('refreshes the wallet when a money card arrives, and only then', () => {
    const { client, typing, invalidated } = setup();
    const card = (kind: 'money_sent' | 'money_request'): Message =>
      ({
        ...msg('m', THEM, '2026-11-14T10:00:00.000Z'),
        kind,
        payload: {},
      }) as unknown as Message;
    applyRealtimeEvent(
      client,
      { type: 'message', message: msg('t', THEM, '2026-11-14T10:00:00.000Z') },
      ME,
      typing,
    );
    expect(invalidated).not.toContainEqual(queryKeys.wallet);
    applyRealtimeEvent(client, { type: 'message', message: card('money_sent') }, ME, typing);
    expect(invalidated).toContainEqual(queryKeys.wallet);
    invalidated.length = 0;
    applyRealtimeEvent(client, { type: 'message', message: card('money_request') }, ME, typing);
    expect(invalidated).toContainEqual(queryKeys.wallet);
  });

  it('keeps your own view of a match, never an older one', () => {
    const { client, typing } = setup();
    const view = (stateVersion: number, status: MatchView['status']): MatchView => ({
      id: 'm1',
      gameSlug: '_example',
      gameName: 'Pig',
      mode: 'free',
      stakeKobo: 0,
      potKobo: 0,
      counterStakeKobo: null,
      allowCounter: false,
      status,
      conversationId: CONV,
      createdBy: ME,
      players: [],
      stateVersion,
      currentTurn: null,
      view: null,
      outcome: null,
      inviteExpiresAt: null,
      createdAt: '2026-11-14T10:00:00.000Z',
      finishedAt: null,
    });
    const cached = () => client.getQueryData<MatchView>(queryKeys.match('m1'));
    applyRealtimeEvent(client, { type: 'match', match: view(3, 'active') }, ME, typing);
    expect(cached()?.stateVersion).toBe(3);
    applyRealtimeEvent(client, { type: 'match', match: view(2, 'active') }, ME, typing);
    expect(cached()?.stateVersion).toBe(3);
    applyRealtimeEvent(client, { type: 'match', match: view(4, 'finished') }, ME, typing);
    expect(cached()).toMatchObject({ stateVersion: 4, status: 'finished' });
  });

  it('does not add a message twice (the sender gets their own send back live)', () => {
    const { client, typing, seed, cached } = setup();
    const a = msg('a', ME, '2026-11-14T10:00:00.000Z');
    seed([a]);
    applyRealtimeEvent(client, { type: 'message', message: a }, ME, typing);
    expect(cached()!.pages[0]!.messages).toHaveLength(1);
  });

  it('does not create a thread cache out of one live message', () => {
    const { client, typing, cached } = setup();
    applyRealtimeEvent(
      client,
      { type: 'message', message: msg('a', THEM, '2026-11-14T10:00:00.000Z') },
      ME,
      typing,
    );
    expect(cached()).toBeUndefined();
  });

  it('stops the typing indicator when their message arrives', () => {
    const { client, typing } = setup();
    typing.setTyping(CONV, true);
    applyRealtimeEvent(
      client,
      { type: 'message', message: msg('a', THEM, '2026-11-14T10:00:00.000Z') },
      ME,
      typing,
    );
    expect(typing.isTyping(CONV)).toBe(false);
  });

  it('records when the other person read, and ignores your own reads from another device', () => {
    const { client, typing, seed, cached } = setup();
    seed([]);
    applyRealtimeEvent(
      client,
      { type: 'read', conversationId: CONV, userId: ME, at: 'x' },
      ME,
      typing,
    );
    expect(cached()!.pages[0]!.peerReadAt).toBeNull();
    applyRealtimeEvent(
      client,
      { type: 'read', conversationId: CONV, userId: THEM, at: '2026-11-14T10:05:00.000Z' },
      ME,
      typing,
    );
    expect(cached()!.pages[0]!.peerReadAt).toBe('2026-11-14T10:05:00.000Z');
  });

  it('shows their typing, but never your own', () => {
    const { client, typing } = setup();
    applyRealtimeEvent(
      client,
      { type: 'typing', conversationId: CONV, userId: ME, typing: true },
      ME,
      typing,
    );
    expect(typing.isTyping(CONV)).toBe(false);
    applyRealtimeEvent(
      client,
      { type: 'typing', conversationId: CONV, userId: THEM, typing: true },
      ME,
      typing,
    );
    expect(typing.isTyping(CONV)).toBe(true);
  });

  it('refreshes everything after (re)connecting, to catch up on what was missed', () => {
    const { client, typing, invalidated } = setup();
    applyRealtimeEvent(client, { type: 'ready' }, ME, typing);
    expect(invalidated).toEqual([
      queryKeys.conversationsAll,
      ['messages'],
      ['match'],
      ['space'],
      ['spaces'],
    ]);
  });
});
