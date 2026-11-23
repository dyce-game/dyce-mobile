import type { MatchPlayer } from '@dyce/shared';

/** A display name for a player id: their name, their handle, or "Them". */
export function makeNameOf(players: readonly MatchPlayer[]): (id: string) => string {
  return (id) => {
    const p = players.find((x) => x.userId === id);
    return p?.displayName || p?.username || 'Them';
  };
}

export const otherOf = (players: readonly [string, string], id: string): string =>
  players[0] === id ? players[1] : players[0];

/** "You" first, then the other: the order a score line reads in. */
export const youFirst = (players: readonly string[], myId: string | null): string[] =>
  [...players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));

/** `parse` helpers for the hand-written view parsers. */
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
export const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isInt = (v: unknown): v is number => isNum(v) && Number.isInteger(v);
export const isStr = (v: unknown): v is string => typeof v === 'string';

/** A record of `number` values keyed by the two players, or null if either is missing. */
export function numberRecord(v: unknown, keys: readonly string[]): Record<string, number> | null {
  if (!isRecord(v)) return null;
  const out: Record<string, number> = {};
  for (const k of keys) {
    const n = v[k];
    if (!isNum(n)) return null;
    out[k] = n;
  }
  return out;
}

export function parsePlayers(v: unknown): [string, string] | null {
  if (!Array.isArray(v) || v.length !== 2 || !v.every(isStr)) return null;
  return [v[0] as string, v[1] as string];
}
