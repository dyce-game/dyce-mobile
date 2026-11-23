/**
 * Small, hand-written checks the view parsers of Word Tiles, Anagrams, Mini Golf and Tanks share. Every
 * parser returns `null` for anything it does not recognise (docs/ADDING_A_GAME.md), so a newer server never
 * crashes an older app: the host shows "Update Dyce to play this game" instead.
 */

export type Rec = Record<string, unknown>;

export const isRec = (v: unknown): v is Rec =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);

export const isStr = (v: unknown): v is string => typeof v === 'string';

export const strArray = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(isStr) ? (v as string[]) : null;

export const intArray = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every(isInt) ? (v as number[]) : null;

/** `{ [playerId]: number }` for the listed players; a missing or non-number entry is not allowed. */
export function numberRecord(v: unknown, ids: readonly string[]): Record<string, number> | null {
  if (!isRec(v)) return null;
  const out: Record<string, number> = {};
  for (const id of ids) {
    const n = v[id];
    if (typeof n !== 'number') return null;
    out[id] = n;
  }
  return out;
}

/** `{ [playerId]: number | null }`: a hidden score is null. */
export function nullableNumberRecord(
  v: unknown,
  ids: readonly string[],
): Record<string, number | null> | null {
  if (!isRec(v)) return null;
  const out: Record<string, number | null> = {};
  for (const id of ids) {
    const n = v[id];
    out[id] = typeof n === 'number' ? n : null;
  }
  return out;
}

/** The display name for a player id: display name, then username, else the fallback. */
export function playerName(
  players: readonly { userId: string; displayName?: string | null; username?: string | null }[],
  id: string | null | undefined,
  fallback = 'Them',
): string {
  const p = players.find((x) => x.userId === id);
  return p?.displayName || p?.username || fallback;
}

/**
 * Which "last move" animations this device has shown, by match id (kept in memory for this run of the app).
 * A game whose final move is animated holds the result screen back until it has been shown (`holdResult` in
 * its registry entry); the board marks the move as shown, then calls `onSettled`.
 */
export function createSeenLog() {
  const seen = new Map<string, number>();
  return {
    has: (matchId: string, seq: number): boolean => (seen.get(matchId) ?? 0) >= seq,
    mark: (matchId: string, seq: number): void => {
      if (seq > (seen.get(matchId) ?? 0)) seen.set(matchId, seq);
    },
    clear: (): void => seen.clear(),
  };
}
