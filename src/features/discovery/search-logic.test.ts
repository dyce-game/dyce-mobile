import type { ConversationSummary, GameInfo, HistoryItem } from '@dyce/shared';
import {
  addRecent,
  filterChats,
  filterGames,
  filterHistory,
  parseRecents,
  scopeFrom,
} from './search-logic';

const game = (name: string, categories: string[] = []): GameInfo => ({
  slug: name.toLowerCase(),
  name,
  dimension: '2d',
  sync: 'async',
  minPlayers: 2,
  maxPlayers: 2,
  categories,
  supportsPool: true,
});

describe('recent searches', () => {
  it('keeps the newest first, without duplicates, at most 8', () => {
    expect(addRecent(['pig', 'ada'], 'Ada')).toEqual(['Ada', 'pig']);
    expect(addRecent([], 'a')).toEqual([]);
    expect(addRecent([], '  ')).toEqual([]);
    let list: string[] = [];
    for (let i = 0; i < 12; i++) list = addRecent(list, `person${i}`);
    expect(list).toHaveLength(8);
    expect(list[0]).toBe('person11');
  });
  it('survives bad saved data', () => {
    expect(parseRecents(null)).toEqual([]);
    expect(parseRecents('not json')).toEqual([]);
    expect(parseRecents('{"a":1}')).toEqual([]);
    expect(parseRecents('["ada", 3, "", "pig"]')).toEqual(['ada', 'pig']);
  });
});

describe('local filters', () => {
  it('finds games by name or category, from 2 characters', () => {
    const games = [game('Cup Pong', ['arcade']), game('Word Hunt', ['word'])];
    expect(filterGames(games, 'cup').map((g) => g.name)).toEqual(['Cup Pong']);
    expect(filterGames(games, 'WORD').map((g) => g.name)).toEqual(['Word Hunt']);
    expect(filterGames(games, 'c')).toEqual([]);
  });

  it('finds chats by name, username or last message, ignoring requests', () => {
    const chat = (state: 'active' | 'request', username: string, body = ''): ConversationSummary =>
      ({
        id: username,
        kind: 'direct',
        state,
        unread: 0,
        peer: {
          id: username,
          username,
          displayName: username.toUpperCase(),
          avatar: null,
          relationship: 'friends',
        },
        lastMessage: body ? ({ body } as ConversationSummary['lastMessage']) : null,
      }) as ConversationSummary;
    const list = [
      chat('active', 'amaka', 'see you at 8'),
      chat('request', 'amaka2'),
      chat('active', 'tunde'),
    ];
    expect(filterChats(list, '@ama').map((c) => c.id)).toEqual(['amaka']);
    expect(filterChats(list, 'see you').map((c) => c.id)).toEqual(['amaka']);
  });

  it('finds transactions by note or person', () => {
    const item = (note: string, username?: string): HistoryItem =>
      ({
        id: note,
        kind: 'transfer',
        amountKobo: 100,
        createdAt: '',
        note,
        requestCode: null,
        counterparty: username ? { id: '1', username, displayName: '', avatar: null } : null,
      }) as HistoryItem;
    const items = [item('lunch', 'zee'), item('tickets', 'ada')];
    expect(filterHistory(items, 'lun').map((i) => i.id)).toEqual(['lunch']);
    expect(filterHistory(items, 'ada').map((i) => i.id)).toEqual(['tickets']);
  });

  it('defaults to the chat scope', () => {
    expect(scopeFrom('wallet')).toBe('wallet');
    expect(scopeFrom('x')).toBe('chat');
    expect(scopeFrom(undefined)).toBe('chat');
  });
});
