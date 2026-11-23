import {
  fillerAutoAction,
  fillerCounts,
  fillerEngine,
  fillerGain,
  FILLER_CELLS,
  FILLER_COLOURS,
  FILLER_COLS,
  FILLER_MAJORITY,
  FILLER_ROWS,
  type FillerState,
} from '@dyce/games';
import { isIntArray, isRecord, isStringArray, plural } from './board-common';

/**
 * Filler on the phone: the server's view (the whole state plus each player's count), its parser and the pure
 * helpers: which colours you may pick, how many squares each would win (the engine's own `fillerGain`), the
 * board after a pick (the engine's own `apply`), and the words around it.
 */

export type FillerView = FillerState & { counts: Record<string, number> };
export type FillerAction = { kind: 'pick'; colour: number };

export const COLS = FILLER_COLS;
export const ROWS = FILLER_ROWS;
export const MAJORITY = FILLER_MAJORITY + 1;

export function parseFillerView(view: unknown): FillerView | null {
  if (!isRecord(view)) return null;
  const { players, cols, rows, cells, owner, colours, turn, turns, maxTurns, over, winner } = view;
  if (!isStringArray(players) || players.length !== 2) return null;
  if (cols !== FILLER_COLS || rows !== FILLER_ROWS) return null;
  if (!isIntArray(cells) || cells.length !== FILLER_CELLS) return null;
  if (cells.some((c) => c < 0 || c >= FILLER_COLOURS)) return null;
  if (!isIntArray(owner) || owner.length !== FILLER_CELLS || owner.some((o) => o < 0 || o > 2)) {
    return null;
  }
  if (!isIntArray(colours) || colours.length !== 2) return null;
  if (colours.some((c) => c < 0 || c >= FILLER_COLOURS)) return null;
  if (turn !== 0 && turn !== 1) return null;
  if (typeof turns !== 'number' || typeof maxTurns !== 'number' || typeof over !== 'boolean') {
    return null;
  }
  if (winner !== null && typeof winner !== 'string') return null;
  let last: FillerView['last'] = null;
  if (view.last !== null && view.last !== undefined) {
    const l = view.last;
    if (
      !isRecord(l) ||
      typeof l.seq !== 'number' ||
      typeof l.by !== 'string' ||
      typeof l.colour !== 'number' ||
      typeof l.gained !== 'number'
    ) {
      return null;
    }
    last = { seq: l.seq, by: l.by, colour: l.colour, gained: l.gained };
  }
  const counts: Record<string, number> = {};
  const given = isRecord(view.counts) ? view.counts : {};
  for (const id of players) {
    const n = given[id];
    counts[id] =
      typeof n === 'number' ? n : owner.filter((o) => o === (id === players[0] ? 1 : 2)).length;
  }
  return {
    players: [players[0]!, players[1]!],
    cols: FILLER_COLS,
    rows: FILLER_ROWS,
    cells,
    owner: owner as (0 | 1 | 2)[],
    colours: [colours[0]!, colours[1]!],
    turn,
    turns,
    maxTurns,
    over,
    winner,
    last,
    counts,
  };
}

/* ---------------------------------------------------------------- colours */

export type FillerColour = { name: string; fill: string; edge: string };

/** The six colours from the design (PlayFiller). Each also has its own shape, so colour is never the only cue. */
export const COLOURS: readonly FillerColour[] = [
  { name: 'Red', fill: '#E0453A', edge: '#8E1E16' },
  { name: 'Yellow', fill: '#F2B90F', edge: '#A87A00' },
  { name: 'Green', fill: '#2BB673', edge: '#17734A' },
  { name: 'Blue', fill: '#2457D6', edge: '#12307A' },
  { name: 'Purple', fill: '#7A4FCF', edge: '#4A2A8A' },
  { name: 'Charcoal', fill: '#3A332E', edge: '#15120F' },
];

export type Shape = 'circle' | 'square' | 'triangle' | 'diamond' | 'plus' | 'bar';
export const SHAPES: readonly Shape[] = ['circle', 'square', 'triangle', 'diamond', 'plus', 'bar'];

/** An SVG path for a shape centred at (cx, cy) with half-size `r`. */
export function shapePath(shape: Shape, cx: number, cy: number, r: number): string {
  switch (shape) {
    case 'circle':
      return `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${2 * r} 0 a${r} ${r} 0 1 0 ${-2 * r} 0 Z`;
    case 'square':
      return `M${cx - r} ${cy - r} h${2 * r} v${2 * r} h${-2 * r} Z`;
    case 'triangle':
      return `M${cx} ${cy - r} L${cx + r} ${cy + r * 0.8} L${cx - r} ${cy + r * 0.8} Z`;
    case 'diamond':
      return `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`;
    case 'plus': {
      const t = r * 0.38;
      return `M${cx - t} ${cy - r} h${2 * t} v${r - t} h${r - t} v${2 * t} h${-(r - t)} v${r - t} h${-2 * t} v${-(r - t)} h${-(r - t)} v${-2 * t} h${r - t} Z`;
    }
    case 'bar':
      return `M${cx - r} ${cy - r * 0.35} h${2 * r} v${r * 0.7} h${-2 * r} Z`;
  }
}

/* ---------------------------------------------------------------- picking */

/** Your seat (0 = bottom-left corner, 1 = top-right), or null when you are watching. */
export function mySeat(view: FillerView, myId: string | null): 0 | 1 | null {
  const i = myId ? view.players.indexOf(myId) : -1;
  return i === 0 ? 0 : i === 1 ? 1 : null;
}

/** Who holds a colour right now: you, them, or nobody. */
export function holder(
  view: FillerView,
  colour: number,
  seat: 0 | 1 | null,
): 'you' | 'them' | null {
  const owners = view.colours.map((c, i) => (c === colour ? i : -1)).filter((i) => i >= 0);
  if (owners.length === 0) return null;
  if (seat === null) return 'them';
  return owners.includes(seat) ? 'you' : 'them';
}

/** A colour can be picked unless one of the two players holds it. */
export const isPickable = (view: FillerView, colour: number): boolean =>
  !view.colours.includes(colour);

/** How many free squares a colour would add for whoever is to move. */
export const gainOf = (view: FillerView, colour: number): number =>
  fillerGain(view, view.turn, colour);

/** The colour the engine would auto-pick for a player who ran out of time: the one that gains most. */
export const bestColour = (view: FillerView): number => fillerAutoAction(view).colour;

export const pickAction = (colour: number): FillerAction => ({ kind: 'pick', colour });

/** The state after a pick, from the engine, for showing it before the server answers. */
export function predictPick(view: FillerView, colour: number): FillerView | null {
  const me = view.players[view.turn];
  if (me === undefined || !isPickable(view, colour)) return null;
  if (!fillerEngine.validate(view, me, pickAction(colour)).ok) return null;
  const next = fillerEngine.apply(view, me, pickAction(colour));
  const [a, b] = fillerCounts(next);
  return { ...next, counts: { [next.players[0]]: a, [next.players[1]]: b } };
}

export function countOf(view: FillerView, id: string | null): number {
  return id === null ? 0 : (view.counts[id] ?? 0);
}

/* ---------------------------------------------------------------- words */

export const colourName = (colour: number): string => COLOURS[colour]?.name ?? 'Colour';

/** "Green, would add 5 squares" / "Red, your colour" for the chips. */
export function chipLabel(view: FillerView, colour: number, seat: 0 | 1 | null): string {
  const name = colourName(colour);
  const h = holder(view, colour, seat);
  if (h === 'you') return `${name}, your colour, not available`;
  if (h === 'them') return `${name}, their colour, not available`;
  return `${name}, would add ${plural(gainOf(view, colour), 'square')}`;
}

/** Which corner you grow from. */
export const cornerOf = (seat: 0 | 1 | null): string =>
  seat === 1 ? 'top-right corner' : 'bottom-left corner';

export function barCopy(
  view: FillerView,
  myId: string | null,
  oppName: string,
  yourTurn: boolean,
  selected: number | null,
  seat: 0 | 1 | null,
): { title: string; subtitle: string | null } {
  if (view.over) {
    const title =
      view.winner === null ? 'Draw' : view.winner === myId ? 'You won' : `${oppName} won`;
    const mine = countOf(view, myId);
    const theirs = view.players.filter((p) => p !== myId).map((p) => countOf(view, p))[0] ?? 0;
    return { title, subtitle: `${mine} to ${theirs}` };
  }
  if (!yourTurn) {
    return {
      title: `${oppName}'s pick`,
      subtitle:
        view.last && view.last.by !== myId
          ? `They picked ${colourName(view.last.colour).toLowerCase()}`
          : 'Waiting for them',
    };
  }
  if (selected !== null) {
    const g = gainOf(view, selected);
    return {
      title: `Your pick · ${colourName(selected).toLowerCase()} grabs ${plural(g, 'square')}`,
      subtitle: `Grow from the ${cornerOf(seat)}`,
    };
  }
  return { title: 'Your pick', subtitle: `Choose a colour · grow from the ${cornerOf(seat)}` };
}

/** "You 31 · Amaka 19 squares", the line under the result. */
export function fillerScoreLine(
  view: FillerView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  if (!view.over) return null;
  const who = (id: string) => (id === myId ? 'You' : nameOf(id));
  const [a, b] = view.players;
  return `${who(a)} ${countOf(view, a)} · ${who(b)} ${countOf(view, b)} squares`;
}

export function boardSummary(view: FillerView, myId: string | null, oppName: string): string {
  const opp = view.players.find((p) => p !== myId) ?? null;
  return `Filler board, ${COLS} by ${ROWS}. You hold ${plural(countOf(view, myId), 'square')}, ${oppName} holds ${countOf(view, opp)}. ${MAJORITY} wins.`;
}
