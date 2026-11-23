import type { ConversationSummary, GameInfo, HistoryItem, SpaceView } from '@dyce/shared';

export const SEARCH_SCOPES = ['chat', 'spaces', 'wallet'] as const;
export type SearchScope = (typeof SEARCH_SCOPES)[number];

export function scopeFrom(raw: string | undefined): SearchScope {
  return SEARCH_SCOPES.find((s) => s === raw) ?? 'chat';
}

const MAX_RECENTS = 8;

/** Newest first, no duplicates (ignoring case), at most 8. Blank text is never kept. */
export function addRecent(list: string[], q: string): string[] {
  const t = q.trim().replace(/\s+/g, ' ');
  if (t.length < 2) return list;
  return [t, ...list.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENTS);
}

/** Reads what was saved; anything that is not a list of strings is dropped. */
export function parseRecents(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string' && x.length > 0).slice(0, MAX_RECENTS)
      : [];
  } catch {
    return [];
  }
}

const norm = (s: string) => s.trim().replace(/^@/, '').toLowerCase();
const has = (hay: string | undefined | null, needle: string) =>
  (hay ?? '').toLowerCase().includes(needle);

export function filterGames(games: GameInfo[], q: string): GameInfo[] {
  const n = norm(q);
  if (n.length < 2) return [];
  return games.filter((g) => has(g.name, n) || g.categories.some((c) => has(c, n))).slice(0, 5);
}

export function filterChats(chats: ConversationSummary[], q: string): ConversationSummary[] {
  const n = norm(q);
  if (n.length < 2) return [];
  return chats
    .filter(
      (c) =>
        c.state === 'active' &&
        (has(c.peer?.username ?? '', n) ||
          has(c.peer?.displayName ?? '', n) ||
          has(c.group?.title ?? '', n) ||
          has(c.bot?.name ?? '', n) ||
          (c.lastMessage && has(c.lastMessage.body, n))),
    )
    .slice(0, 5);
}

export function filterSpaces(spaces: SpaceView[], q: string): SpaceView[] {
  const n = norm(q);
  if (n.length < 2) return [];
  return spaces.filter((s) => has(s.name, n) || has(s.gameName, n) || has(s.code, n)).slice(0, 5);
}

export function filterHistory(items: HistoryItem[], q: string): HistoryItem[] {
  const n = norm(q);
  if (n.length < 2) return [];
  return items
    .filter(
      (i) =>
        has(i.note, n) || has(i.counterparty?.username, n) || has(i.counterparty?.displayName, n),
    )
    .slice(0, 8);
}

/** The placeholder for each scope's field. */
export function placeholderFor(scope: SearchScope): string {
  return scope === 'spaces'
    ? 'Spaces, codes and people'
    : scope === 'wallet'
      ? 'Transactions and people'
      : 'Chats, people and games';
}
