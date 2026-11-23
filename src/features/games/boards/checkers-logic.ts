import {
  checkersEngine,
  type CheckersEndReason,
  type CheckersMove,
  type CheckersState,
} from '@dyce/games';
import { isIntArray, isRecord, isStringArray, plural } from './board-common';

/**
 * Checkers on the phone: the server's view, its parser and the pure helpers for the board. The rules are the
 * engine's; the view lists every legal move (`legal`, jumps only when a jump is available), and this file turns
 * that list into "which piece can move", "where can it go next" and the words around them.
 */

export type CheckersView = Omit<CheckersState, 'seen'> & { legal: CheckersMove[] };

export type CheckersAction = { kind: 'move'; path: number[] } | { kind: 'resign' };

const END_REASONS: readonly CheckersEndReason[] = [
  'no_moves',
  'resign',
  'forty_move',
  'repetition',
];

export function parseCheckersView(view: unknown): CheckersView | null {
  if (!isRecord(view)) return null;
  const { players, board, turn, noProgress, winner, draw, endReason, seq } = view;
  if (!isStringArray(players) || players.length !== 2) return null;
  if (typeof board !== 'string' || !/^[abAB.]{64}$/.test(board)) return null;
  if (turn !== 0 && turn !== 1) return null;
  if (typeof noProgress !== 'number' || typeof seq !== 'number') return null;
  if (winner !== null && typeof winner !== 'string') return null;
  if (typeof draw !== 'boolean') return null;
  if (endReason !== null && !END_REASONS.includes(endReason as CheckersEndReason)) return null;
  if (!Array.isArray(view.legal)) return null;
  const legal: CheckersMove[] = [];
  for (const m of view.legal) {
    if (!isRecord(m) || !isIntArray(m.path) || !isIntArray(m.captured)) return null;
    if (m.path.length < 2 || m.path.some((s) => s < 0 || s > 63)) return null;
    legal.push({ path: m.path, captured: m.captured });
  }
  let last: CheckersView['last'] = null;
  if (view.last !== null && view.last !== undefined) {
    const l = view.last;
    if (
      !isRecord(l) ||
      typeof l.by !== 'string' ||
      !isIntArray(l.path) ||
      !isIntArray(l.captured)
    ) {
      return null;
    }
    last = { by: l.by, path: l.path, captured: l.captured, crowned: l.crowned === true };
  }
  return {
    players,
    board,
    turn,
    noProgress,
    winner,
    draw,
    endReason: (endReason ?? null) as CheckersEndReason | null,
    last,
    seq,
    legal,
  };
}

/* ---------------------------------------------------------------- squares and pieces */

/** Which seat you are, or null when you are watching (then you see the first player's side at the bottom). */
export function mySeat(view: CheckersView, myId: string | null): 0 | 1 | null {
  const i = myId ? view.players.indexOf(myId) : -1;
  return i === 0 ? 0 : i === 1 ? 1 : null;
}

/** Board squares in drawing order, top-left first. The second player sees the board turned round. */
export function visualOrder(seat: 0 | 1 | null): number[] {
  const out = Array.from({ length: 64 }, (_, i) => i);
  return seat === 1 ? out.reverse() : out;
}

export const isDark = (sq: number): boolean => ((sq >> 3) + (sq & 7)) % 2 === 1;

/** "c3": file a..h from the left, rank 1..8 from the first player's end. */
export const squareName = (sq: number): string => 'abcdefgh'[sq & 7]! + String(8 - (sq >> 3));

export const seatOfPiece = (ch: string): 0 | 1 | null =>
  ch === 'a' || ch === 'A' ? 0 : ch === 'b' || ch === 'B' ? 1 : null;

export const isKingPiece = (ch: string): boolean => ch === 'A' || ch === 'B';

export const SEAT_COLOUR = ['red', 'black'] as const;

/** "c3, your red king" / "d4, empty". */
export function describeSquare(board: string, sq: number, seat: 0 | 1 | null): string {
  const ch = board[sq]!;
  const owner = seatOfPiece(ch);
  if (owner === null) return `${squareName(sq)}, empty`;
  const who = owner === seat ? 'your' : seat === null ? '' : 'their';
  const piece = `${SEAT_COLOUR[owner]} ${isKingPiece(ch) ? 'king' : 'piece'}`;
  return `${squareName(sq)}, ${[who, piece].filter(Boolean).join(' ')}`;
}

export function pieceCounts(board: string): [number, number] {
  let a = 0;
  let b = 0;
  for (const ch of board) {
    if (ch === 'a' || ch === 'A') a++;
    else if (ch === 'b' || ch === 'B') b++;
  }
  return [a, b];
}

/* ---------------------------------------------------------------- building a move square by square */

const startsWith = (path: readonly number[], prefix: readonly number[]): boolean =>
  prefix.every((s, i) => path[i] === s);

/** Legal moves that begin with the squares picked so far. */
export function candidates(view: CheckersView, picked: readonly number[]): CheckersMove[] {
  return view.legal.filter((m) => m.path.length >= picked.length && startsWith(m.path, picked));
}

/** Pieces that have a legal move (only those that can jump when a jump is forced). */
export function movablePieces(view: CheckersView): Set<number> {
  return new Set(view.legal.map((m) => m.path[0]!));
}

/** The squares that can come next after `picked`: one step for a plain move, the next landing for a jump. */
export function nextSquares(view: CheckersView, picked: readonly number[]): number[] {
  const out = new Set<number>();
  for (const m of candidates(view, picked)) {
    if (m.path.length > picked.length) out.add(m.path[picked.length]!);
  }
  return [...out];
}

/** The legal move that is exactly `picked`, when the player has finished choosing. */
export function completeMove(
  view: CheckersView,
  picked: readonly number[],
): CheckersMove | undefined {
  return view.legal.find((m) => m.path.length === picked.length && startsWith(m.path, picked));
}

/** A jump is forced (every legal move captures). */
export const mustJump = (view: CheckersView): boolean =>
  view.legal.length > 0 && view.legal[0]!.captured.length > 0;

/** The squares a half-built jump has already jumped over, to show them struck out. */
export function jumpedSoFar(view: CheckersView, picked: readonly number[]): number[] {
  const m = candidates(view, picked)[0];
  if (!m || picked.length < 2) return [];
  return m.captured.slice(0, picked.length - 1);
}

export const moveAction = (path: readonly number[]): CheckersAction => ({
  kind: 'move',
  path: [...path],
});

/** The board after a move, from the engine itself (so a crowning and the captures are right). */
export function predictMove(
  view: CheckersView,
  path: readonly number[],
): { board: string; last: { path: number[]; captured: number[] } } | null {
  const me = view.players[view.turn];
  if (me === undefined) return null;
  const state: CheckersState = { ...view, seen: {} };
  const action = moveAction(path);
  if (!checkersEngine.validate(state, me, action).ok) return null;
  const next = checkersEngine.apply(state, me, action);
  return {
    board: next.board,
    last: { path: [...path], captured: next.last?.captured ?? [] },
  };
}

/* ---------------------------------------------------------------- words */

/** "c3 to e5 to g7": a move for a screen reader and the move list. */
export function pathLabel(path: readonly number[], captured = 0): string {
  const route = path.map(squareName).join(' to ');
  return captured > 0 ? `${route}, jumps ${plural(captured, 'piece')}` : route;
}

export const END_COPY: Record<CheckersEndReason, string> = {
  no_moves: 'No moves left',
  resign: 'Resigned',
  forty_move: 'Forty moves without a capture',
  repetition: 'The same position three times',
};

export function barCopy(
  view: CheckersView,
  myId: string | null,
  oppName: string,
  yourTurn: boolean,
  picked: readonly number[],
): { title: string; subtitle: string | null } {
  const over = view.winner !== null || view.draw;
  if (over) {
    const title = view.draw ? 'Draw' : view.winner === myId ? 'You won' : `${oppName} won`;
    return { title, subtitle: view.endReason ? END_COPY[view.endReason] : null };
  }
  if (!yourTurn) return { title: `${oppName}'s turn`, subtitle: 'Waiting for them to move' };
  if (picked.length > 0) {
    const more = nextSquares(view, picked);
    if (completeMove(view, picked)) {
      return {
        title: `Move ready · ${pathLabel(picked)}`,
        subtitle: 'Press the button to play it',
      };
    }
    return {
      title: `${squareName(picked[0]!)} selected${picked.length > 1 ? ' · keep jumping' : ''}`,
      subtitle: more.length === 1 ? 'Tap the ring' : 'Tap a ring to move there',
    };
  }
  if (mustJump(view)) {
    const longest = Math.max(...view.legal.map((m) => m.captured.length));
    return {
      title: longest > 1 ? 'Your turn · multi-jump available' : 'Your turn · jump available',
      subtitle: 'Jumps are forced · tap a piece',
    };
  }
  return { title: 'Your turn', subtitle: 'Tap a piece, then a ring' };
}

/** "You 8 left · Dayo 0 left", the line under the result. */
export function checkersScoreLine(
  view: CheckersView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  if (view.winner === null && !view.draw) return null;
  const [a, b] = pieceCounts(view.board);
  const mine = (id: string) => (id === myId ? 'You' : nameOf(id));
  const counts = `${mine(view.players[0]!)} ${a} · ${mine(view.players[1]!)} ${b} pieces left`;
  if (view.draw) return `Draw · ${counts}`;
  if (view.endReason === 'resign') return `${mine(view.winner!)} won by resignation · ${counts}`;
  return `${mine(view.winner!)} won · ${counts}`;
}

export function boardSummary(view: CheckersView, seat: 0 | 1 | null): string {
  const [a, b] = pieceCounts(view.board);
  const mine = seat === 1 ? b : a;
  const theirs = seat === 1 ? a : b;
  const colour = seat === null ? '' : ` You play ${SEAT_COLOUR[seat]}.`;
  return `Checkers board.${colour} You have ${plural(mine, 'piece')}, they have ${theirs}.`;
}
