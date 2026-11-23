import {
  dotsAndBoxesEngine,
  dotsOpenLines,
  DOTS_MAX,
  DOTS_MIN,
  type DotsAndBoxesState,
} from '@dyce/games';
import { isRecord, isStringArray, plural } from './board-common';

/**
 * Dots & Boxes on the phone: the server's view (the whole state, nothing is hidden), its parser and the pure
 * helpers for the board: which lines are open, what drawing one would do (close a box, give one away, or
 * neither), the words around it, and the board after a move from the engine itself.
 */

export type DotsView = DotsAndBoxesState;
export type Dir = 'h' | 'v';
export type Line = { dir: Dir; r: number; c: number };
export type DotsAction = { kind: 'line'; dir: Dir; r: number; c: number } | { kind: 'resign' };

const isIntList = (v: unknown, len: number, min: number, max: number): v is number[] =>
  Array.isArray(v) &&
  v.length === len &&
  v.every((x) => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max);

export function parseDotsView(view: unknown): DotsView | null {
  if (!isRecord(view)) return null;
  const { players, dots, h, v, boxes, turn, scores, winner, draw, endReason, seq } = view;
  if (!isStringArray(players) || players.length !== 2) return null;
  if (typeof dots !== 'number' || !Number.isInteger(dots) || dots < DOTS_MIN || dots > DOTS_MAX) {
    return null;
  }
  const side = dots - 1;
  if (!isIntList(h, dots * side, -1, 1)) return null;
  if (!isIntList(v, side * dots, -1, 1)) return null;
  if (!isIntList(boxes, side * side, -1, 1)) return null;
  if (turn !== 0 && turn !== 1) return null;
  if (!isIntList(scores, 2, 0, side * side)) return null;
  if (winner !== null && typeof winner !== 'string') return null;
  if (typeof draw !== 'boolean' || typeof seq !== 'number') return null;
  if (endReason !== null && endReason !== 'complete' && endReason !== 'resign') return null;
  let last: DotsView['last'] = null;
  if (view.last !== null && view.last !== undefined) {
    const l = view.last;
    if (!isRecord(l) || typeof l.by !== 'string' || (l.dir !== 'h' && l.dir !== 'v')) return null;
    if (typeof l.r !== 'number' || typeof l.c !== 'number' || !Array.isArray(l.boxes)) return null;
    last = {
      by: l.by,
      dir: l.dir,
      r: l.r,
      c: l.c,
      boxes: l.boxes.filter((b): b is number => typeof b === 'number'),
    };
  }
  return { players, dots, h, v, boxes, turn, scores, winner, draw, endReason, last, seq };
}

/* ---------------------------------------------------------------- lines and boxes */

/** Boxes along one side. */
export const sideOf = (view: DotsView): number => view.dots - 1;

export function lineOwner(view: DotsView, line: Line): number {
  return line.dir === 'h'
    ? view.h[line.r * (view.dots - 1) + line.c]!
    : view.v[line.r * view.dots + line.c]!;
}

export const isOpen = (view: DotsView, line: Line): boolean => lineOwner(view, line) < 0;

export const sameLine = (a: Line | null, b: Line | null): boolean =>
  a !== null && b !== null && a.dir === b.dir && a.r === b.r && a.c === b.c;

/** How many of a box's four sides are drawn. */
export function boxSides(view: DotsView, br: number, bc: number): number {
  const n = view.dots;
  let sides = 0;
  if (view.h[br * (n - 1) + bc]! >= 0) sides++;
  if (view.h[(br + 1) * (n - 1) + bc]! >= 0) sides++;
  if (view.v[br * n + bc]! >= 0) sides++;
  if (view.v[br * n + bc + 1]! >= 0) sides++;
  return sides;
}

/** The boxes a line touches (one on the edge, two inside), as [row, col]. */
export function touching(view: DotsView, line: Line): [number, number][] {
  const side = sideOf(view);
  const cand: [number, number][] =
    line.dir === 'h'
      ? [
          [line.r - 1, line.c],
          [line.r, line.c],
        ]
      : [
          [line.r, line.c - 1],
          [line.r, line.c],
        ];
  return cand.filter(([r, c]) => r >= 0 && c >= 0 && r < side && c < side);
}

export type Effect = 'closes' | 'gives' | 'safe';

/** What drawing an open line would do: close a box (you go again), hand the other player a box, or neither. */
export function lineEffect(view: DotsView, line: Line): Effect {
  let gives = false;
  for (const [r, c] of touching(view, line)) {
    const after = boxSides(view, r, c) + 1;
    if (after === 4) return 'closes';
    if (after === 3) gives = true;
  }
  return gives ? 'gives' : 'safe';
}

export const EFFECT_COPY: Record<Effect, string> = {
  closes: 'Closes a box, so you go again',
  gives: 'Gives them a box to close',
  safe: 'Gives them nothing',
};

/** Every line still open, from the engine's own list. */
export const openLines = (view: DotsView): Line[] => dotsOpenLines(view);

/** At least one open line closes a box. */
export const hasClosing = (view: DotsView): boolean =>
  openLines(view).some((l) => lineEffect(view, l) === 'closes');

export const boxesLeft = (view: DotsView): number => view.boxes.filter((b) => b < 0).length;

export const moveAction = (line: Line): DotsAction => ({
  kind: 'line',
  dir: line.dir,
  r: line.r,
  c: line.c,
});

/** The state after drawing a line, from the engine, for showing it before the server answers. */
export function predictLine(view: DotsView, line: Line): DotsView | null {
  const me = view.players[view.turn];
  if (me === undefined) return null;
  if (!dotsAndBoxesEngine.validate(view, me, moveAction(line)).ok) return null;
  return dotsAndBoxesEngine.apply(view, me, moveAction(line));
}

/* ---------------------------------------------------------------- words */

/** 1-based "row 2, column 3" for a dot. */
const dotName = (r: number, c: number): string => `row ${r + 1}, column ${c + 1}`;

/** A line for a screen reader and the line list: which two dots it joins, and its state or effect. */
export function lineLabel(view: DotsView, line: Line, seat: 0 | 1 | null): string {
  const to = line.dir === 'h' ? dotName(line.r, line.c + 1) : dotName(line.r + 1, line.c);
  const base = `${line.dir === 'h' ? 'Horizontal' : 'Vertical'} line from dot ${dotName(line.r, line.c)} to dot ${to}`;
  const owner = lineOwner(view, line);
  if (owner >= 0) return `${base}, drawn by ${owner === seat ? 'you' : 'them'}`;
  return `${base}, ${EFFECT_COPY[lineEffect(view, line)].toLowerCase()}`;
}

/** The mark shown in a box: Y for you, the opponent's first letter (T if that would also be Y). */
export function boxMark(isMe: boolean, oppName: string): string {
  if (isMe) return 'Y';
  const ch = oppName.trim().charAt(0).toUpperCase();
  return ch && ch !== 'Y' ? ch : 'T';
}

export function barCopy(
  view: DotsView,
  myId: string | null,
  oppName: string,
  yourTurn: boolean,
  selected: Line | null,
): { title: string; subtitle: string | null } {
  if (view.winner !== null || view.draw) {
    const [a, b] = view.scores;
    const title = view.draw ? 'Draw' : view.winner === myId ? 'You won' : `${oppName} won`;
    return { title, subtitle: view.endReason === 'resign' ? 'Resigned' : `${a} to ${b}` };
  }
  if (!yourTurn) {
    return {
      title: `${oppName}'s line`,
      subtitle:
        view.last && view.last.by !== myId && view.last.boxes.length > 0
          ? `They closed ${plural(view.last.boxes.length, 'box')} and go again`
          : 'Waiting for them',
    };
  }
  if (selected)
    return { title: 'Draw this line?', subtitle: EFFECT_COPY[lineEffect(view, selected)] };
  return {
    title: 'Your line · close a box, go again',
    subtitle: hasClosing(view) ? 'A box is ready to close' : 'Pick a line that gives them nothing',
  };
}

/** "You 9 · Bayo 7", the line under the result. */
export function dotsScoreLine(
  view: DotsView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  if (view.winner === null && !view.draw) return null;
  const who = (i: number) => (view.players[i] === myId ? 'You' : nameOf(view.players[i]!));
  const line = `${who(0)} ${view.scores[0]} · ${who(1)} ${view.scores[1]}`;
  return view.endReason === 'resign' ? `Resigned · ${line}` : line;
}

export function boardSummary(view: DotsView, seat: 0 | 1 | null, oppName: string): string {
  const me = seat === null ? view.scores[0]! : view.scores[seat]!;
  const them = seat === null ? view.scores[1]! : view.scores[seat === 0 ? 1 : 0]!;
  return `Dots and boxes, ${sideOf(view)} by ${sideOf(view)}. You own ${plural(me, 'box', 'boxes')}, ${oppName} owns ${them}. ${plural(boxesLeft(view), 'box', 'boxes')} left.`;
}
