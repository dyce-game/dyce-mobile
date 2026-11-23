import type { MatchPlayer } from '@dyce/shared';

/**
 * Pure helpers shared by the classic board games (Chess, Checkers, Dots & Boxes, Filler): who is who, how big
 * a square can be, and when a tap should be confirmed. No React, so they are unit tested.
 */

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

export const isIntArray = (v: unknown): v is number[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'number' && Number.isInteger(x));

/** The name a player goes by on a board. */
export function nameOfPlayer(players: MatchPlayer[], id: string | null | undefined): string {
  const p = players.find((x) => x.userId === id);
  return p?.displayName || p?.username || 'Them';
}

/** Your seat (0 or 1) in a two-player game, or null for someone who is not playing. */
export function seatOf(seats: readonly string[], myId: string | null): 0 | 1 | null {
  const i = myId ? seats.indexOf(myId) : -1;
  return i === 0 ? 0 : i === 1 ? 1 : null;
}

/** "1 box", "2 boxes". */
export function plural(
  n: number,
  one: string,
  many = /(s|x|ch|sh)$/.test(one) ? `${one}es` : `${one}s`,
): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** The smallest a square may be drawn (a stated limit: below this the board scrolls instead of shrinking). */
export const MIN_SQUARE = 36;
/** The size a touch target must reach for a one-tap move; smaller squares use select-then-confirm. */
export const TOUCH_SQUARE = 44;
/** A board never grows past this on a tablet or a wide browser. */
export const MAX_BOARD = 520;

/**
 * The side of one square for a `cols` x `rows` board that has to fit in `availW` x `availH`: as large as the
 * space allows, never over `MAX_BOARD` wide and never under `MIN_SQUARE`.
 */
export function squareSizeFor(availW: number, availH: number, cols: number, rows = cols): number {
  const w = Math.min(availW, MAX_BOARD) / cols;
  const h = availH > 0 ? availH / rows : w;
  return Math.max(MIN_SQUARE, Math.floor(Math.min(w, h)));
}

/** On squares smaller than a touch target a tap only selects; a button in the bar confirms the move. */
export const needsConfirm = (square: number): boolean => square < TOUCH_SQUARE;
