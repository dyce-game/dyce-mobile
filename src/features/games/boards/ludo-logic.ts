import { LUDO_HOME, LUDO_RING, LUDO_SAFE, ludoRingSquare, ludoTarget } from '@dyce/games';
import { isInt, isRecord, isStr } from './r3f-common/board-utils';

/**
 * Ludo on the phone, the parts that are not drawing (backend ADR-035). The server rolls the die (the view
 * never carries the generator, so nobody can predict a roll) and the move result says what was rolled, so the
 * board only ever shows `last.dice`. A turn is `roll`, then `move {token}` unless the roll cannot be used.
 *
 * Geometry. The board is a 15 x 15 grid of cells, `(x, y)` with y down; the ring of 52 squares runs round the
 * cross and a seat's start square is `starts[seat]` (0, 13, 26, 39). Ring square `i` is the quarter-turn
 * rotation of one of 13 squares, so the whole ring is `QUARTER` turned about the centre (7, 7). A token's
 * `progress` is -1 in the yard, 0..50 walked from its start (ring square `(start + progress) % 52`; each colour
 * skips the square just behind its start, where its home column leaves the ring), 51..55 the home column,
 * 56 home. Everything is first worked out in "board" coordinates (seat 0's yard top-left, seats going
 * clockwise), then turned so that YOUR yard is bottom-left, nearest to you.
 */

export type LudoLast =
  | { kind: 'roll'; by: string; dice: number }
  | {
      kind: 'move';
      by: string;
      dice: number;
      token: number;
      from: number;
      to: number;
      captured: { player: string; token: number }[];
    }
  | { kind: 'pass'; by: string; dice: number; reason: 'no_move' | 'three_sixes' };

export type LudoView = {
  players: string[];
  tokensEach: number;
  rankAll: boolean;
  starts: number[];
  tokens: number[][];
  turn: number;
  phase: 'roll' | 'move';
  dice: number | null;
  sixes: number;
  finished: string[];
  out: string[];
  over: boolean;
  last: LudoLast | null;
  seq: number;
  /** The tokens you may move with the current roll. */
  legal: number[];
};

// ---- the server's view -----------------------------------------------------------------------------

const isDie = (v: unknown): v is number => isInt(v) && v >= 1 && v <= 6;
const isProgress = (v: unknown): v is number => isInt(v) && v >= -1 && v <= LUDO_HOME;
const strList = (v: unknown): string[] | null =>
  Array.isArray(v) && v.every(isStr) ? (v as string[]) : null;

function parseLast(v: unknown): LudoLast | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isRecord(v) || !isStr(v.by) || !isDie(v.dice)) return undefined;
  if (v.kind === 'roll') return { kind: 'roll', by: v.by, dice: v.dice };
  if (v.kind === 'pass') {
    if (v.reason !== 'no_move' && v.reason !== 'three_sixes') return undefined;
    return { kind: 'pass', by: v.by, dice: v.dice, reason: v.reason };
  }
  if (v.kind !== 'move') return undefined;
  if (!isInt(v.token) || !isProgress(v.from) || !isProgress(v.to) || !Array.isArray(v.captured))
    return undefined;
  const captured: { player: string; token: number }[] = [];
  for (const c of v.captured) {
    if (!isRecord(c) || !isStr(c.player) || !isInt(c.token)) return undefined;
    captured.push({ player: c.player, token: c.token });
  }
  return { kind: 'move', by: v.by, dice: v.dice, token: v.token, from: v.from, to: v.to, captured };
}

export function parseLudoView(view: unknown): LudoView | null {
  if (!isRecord(view)) return null;
  const players = strList(view.players);
  if (!players || players.length < 2 || players.length > 4) return null;
  if (!isInt(view.tokensEach) || view.tokensEach < 1 || view.tokensEach > 4) return null;
  const starts = view.starts;
  if (!Array.isArray(starts) || starts.length !== players.length || !starts.every(isInt))
    return null;
  const tokens = view.tokens;
  if (!Array.isArray(tokens) || tokens.length !== players.length) return null;
  for (const row of tokens) {
    if (!Array.isArray(row) || row.length !== view.tokensEach || !row.every(isProgress))
      return null;
  }
  if (!isInt(view.turn) || view.turn < 0 || view.turn >= players.length) return null;
  if (view.phase !== 'roll' && view.phase !== 'move') return null;
  if (view.dice !== null && !isDie(view.dice)) return null;
  const finished = strList(view.finished);
  const out = strList(view.out);
  const legal = view.legal;
  if (!finished || !out || !Array.isArray(legal) || !legal.every(isInt)) return null;
  if (!isInt(view.seq) || typeof view.over !== 'boolean') return null;
  const last = parseLast(view.last);
  if (last === undefined) return null;
  return {
    players,
    tokensEach: view.tokensEach,
    rankAll: view.rankAll === true,
    starts: starts as number[],
    tokens: tokens as number[][],
    turn: view.turn,
    phase: view.phase,
    dice: (view.dice as number | null) ?? null,
    sixes: isInt(view.sixes) ? view.sixes : 0,
    finished,
    out,
    over: view.over,
    last,
    seq: view.seq,
    legal: legal as number[],
  };
}

// ---- who ---------------------------------------------------------------------------------------------

/** Your seat (a spectator sees seat 0's side). */
export function mySeat(v: LudoView, myId: string | null): number {
  const i = myId ? v.players.indexOf(myId) : -1;
  return i < 0 ? 0 : i;
}
export const moverOf = (v: LudoView): string | null =>
  v.over ? null : (v.players[v.turn] ?? null);
export const isMyTurn = (v: LudoView, myId: string | null): boolean =>
  !!myId && !v.over && v.players[v.turn] === myId;
export const homeCount = (v: LudoView, seat: number): number =>
  (v.tokens[seat] ?? []).filter((p) => p === LUDO_HOME).length;
export const isActive = (v: LudoView, id: string): boolean =>
  !v.out.includes(id) && !v.finished.includes(id);

/** The colours: you are green, the others red, blue and yellow in seat order after you. */
export const SEAT_COLORS = ['#2BB673', '#E0453A', '#2457D6', '#FFB020'] as const;
export const SEAT_NAMES = ['Green', 'Red', 'Blue', 'Yellow'] as const;
export const NEUTRAL = '#C7CBD2';
export function colorIndex(v: LudoView, seat: number, myId: string | null): number {
  const me = mySeat(v, myId);
  return (seat - me + v.players.length) % v.players.length;
}
export const colorOf = (v: LudoView, seat: number, myId: string | null): string =>
  SEAT_COLORS[colorIndex(v, seat, myId)] ?? NEUTRAL;
export const colorNameOf = (v: LudoView, seat: number, myId: string | null): string =>
  SEAT_NAMES[colorIndex(v, seat, myId)] ?? 'Grey';

/** The quadrant of the board a seat plays from: 0 top-left, then clockwise (its start square is 13 per quadrant). */
export const quadOf = (v: LudoView, seat: number): number =>
  Math.round((v.starts[seat] ?? 0) / 13) % 4;

// ---- the board in cells ----------------------------------------------------------------------------

export type P = readonly [number, number];
/** The first 13 ring squares (seat 0's start, then up and over the top arm); the rest are turns of these. */
export const QUARTER: readonly P[] = [
  [1, 6],
  [2, 6],
  [3, 6],
  [4, 6],
  [5, 6],
  [6, 5],
  [6, 4],
  [6, 3],
  [6, 2],
  [6, 1],
  [6, 0],
  [7, 0],
  [8, 0],
];
/** Seat 0's home column, from the ring towards the middle. */
export const HOME_COLUMN: readonly P[] = [
  [1, 7],
  [2, 7],
  [3, 7],
  [4, 7],
  [5, 7],
];

/** A quarter-turn clockwise about the centre (7, 7), `k` times. */
export function rotate(p: P, k: number): P {
  let [x, y] = p;
  for (let i = 0; i < ((k % 4) + 4) % 4; i++) [x, y] = [14 - y, x];
  return [x, y];
}

export const ringCell = (i: number): P =>
  rotate(QUARTER[((i % 13) + 13) % 13] as P, Math.floor((((i % 52) + 52) % 52) / 13));
export const SAFE: ReadonlySet<number> = new Set(LUDO_SAFE);
export const isStar = (ring: number): boolean => SAFE.has(ring) && ring % 13 !== 0;
export const isStart = (ring: number): boolean => ring % 13 === 0;

const YARD_SPOTS: readonly P[] = [
  [1.5, 1.5],
  [3.5, 1.5],
  [1.5, 3.5],
  [3.5, 3.5],
];
/** Where tokens rest at home in the middle: a short stack along the quadrant's triangle. */
const homeSpot = (t: number): P => [6.35, 6.2 + 0.53 * t];

/** The board position (in cells, fractional) of a token, before turning the board to your view. */
export function tokenCell(quad: number, progress: number, token: number): P {
  if (progress < 0) return rotate(YARD_SPOTS[token] as P, quad);
  if (progress <= 50) return ringCell((quad * 13 + progress) % LUDO_RING);
  if (progress < LUDO_HOME) return rotate(HOME_COLUMN[progress - 51] as P, quad);
  return rotate(homeSpot(token), quad);
}

/** How many quarter-turns bring your quadrant to the bottom-left (quadrant 3), nearest to you. */
export const viewTurns = (myQuad: number): number => (3 - myQuad + 4) % 4;

/** A board position turned to your view and put in world units: x right, z towards you, centre at 0. */
export function toWorld(p: P, turns: number): [number, number] {
  const [x, y] = rotate(p, turns);
  return [x - 7, y - 7];
}

/** Which ring square a token stands on, or null in the yard, the home column or home. */
export const ringSquareOf = (start: number, progress: number): number | null =>
  ludoRingSquare(start, progress);

/** The progress at which seat `start` stands on ring `square` (0..50), or null (the skipped square, or none). */
export function progressOnSquare(start: number, square: number): number | null {
  const p = (((square - start) % LUDO_RING) + LUDO_RING) % LUDO_RING;
  return p <= 50 ? p : null;
}

// ---- moves, in words and as actions ----------------------------------------------------------------

export const rollAction = (): Record<string, unknown> => ({ kind: 'roll' });
export const moveAction = (token: number): Record<string, unknown> => ({ kind: 'move', token });

export type MovePreview = {
  token: number;
  from: number;
  to: number;
  leavesYard: boolean;
  home: boolean;
  intoColumn: boolean;
  captures: number;
};

/** What moving `token` with the current roll would do, with the engine's own rules (a capture needs a non-safe ring square). */
export function previewMove(v: LudoView, seat: number, token: number): MovePreview | null {
  const dice = v.dice;
  const from = v.tokens[seat]?.[token];
  if (dice === null || from === undefined) return null;
  const to = ludoTarget(from, dice);
  if (to === null) return null;
  let captures = 0;
  const sq = ringSquareOf(v.starts[seat] as number, to);
  if (sq !== null && !SAFE.has(sq)) {
    v.players.forEach((id, j) => {
      if (j === seat || v.out.includes(id)) return;
      for (const p of v.tokens[j] as number[]) {
        if (ringSquareOf(v.starts[j] as number, p) === sq) captures++;
      }
    });
  }
  return {
    token,
    from,
    to,
    leavesYard: from === -1,
    home: to === LUDO_HOME,
    intoColumn: to > 50 && to < LUDO_HOME,
    captures,
  };
}

export function previewLine(p: MovePreview): string {
  if (p.leavesYard) return `Token ${p.token + 1} leaves the yard`;
  if (p.home) return `Token ${p.token + 1} gets home`;
  if (p.captures > 0)
    return `Token ${p.token + 1} captures ${p.captures === 1 ? 'a token' : `${p.captures} tokens`}`;
  if (p.intoColumn) return `Token ${p.token + 1} enters the home column`;
  return `Token ${p.token + 1} moves ${p.to - p.from}`;
}

/** A token as a screen reader says it. */
export function tokenLabel(v: LudoView, seat: number, token: number): string {
  const p = v.tokens[seat]?.[token] ?? -1;
  const n = token + 1;
  if (p < 0) return `Token ${n}, in the yard`;
  if (p >= LUDO_HOME) return `Token ${n}, home`;
  if (p > 50) return `Token ${n}, in the home column, ${LUDO_HOME - p} to go`;
  return `Token ${n}, ${p} squares from its start, ${LUDO_HOME - p} to home`;
}

/** The line about the last event: "You rolled a 5", "Amaka captured a token". */
export function lastLine(
  v: LudoView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const l = v.last;
  if (!l) return null;
  const who = l.by === myId ? 'You' : nameOf(l.by);
  if (l.kind === 'roll') return `${who} rolled a ${l.dice}`;
  if (l.kind === 'pass') {
    return l.reason === 'three_sixes'
      ? `${who} rolled a third 6: turn passes`
      : `${who} rolled a ${l.dice}: no move`;
  }
  const bits = [`${who} moved token ${l.token + 1}`];
  if (l.from === -1) bits.push('out of the yard');
  if (l.to === LUDO_HOME) bits.push('home');
  if (l.captured.length > 0) {
    const victims = [
      ...new Set(l.captured.map((c) => (c.player === myId ? 'your' : `${nameOf(c.player)}'s`))),
    ];
    bits.push(
      `and captured ${victims.join(' and ')} ${l.captured.length === 1 ? 'token' : 'tokens'}`,
    );
  }
  return bits.join(' ');
}

/** The line under the result: "You 4 home · Amaka 2 home". */
export function ludoScoreLine(
  v: LudoView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const me = mySeat(v, myId);
  const parts = [`You ${homeCount(v, me)} home`];
  v.players.forEach((id, s) => {
    if (s !== me) parts.push(`${nameOf(id)} ${homeCount(v, s)} home`);
  });
  return parts.join(' · ');
}

// ---- replaying the last event -----------------------------------------------------------------------

/**
 * The tokens as they stood before the last move (the view holds the board after it): the moved token back at
 * `from`, and any token it captured back on the square it landed on. Other events change no token.
 */
export function tokensBefore(v: LudoView): number[][] {
  const out = v.tokens.map((row) => row.slice());
  const l = v.last;
  if (!l || l.kind !== 'move') return out;
  const seat = v.players.indexOf(l.by);
  if (seat < 0) return out;
  const row = out[seat];
  if (row) row[l.token] = l.from;
  const square = ringSquareOf(v.starts[seat] as number, l.to);
  if (square !== null) {
    for (const c of l.captured) {
      const j = v.players.indexOf(c.player);
      const p = j < 0 ? null : progressOnSquare(v.starts[j] as number, square);
      if (j >= 0 && p !== null && out[j]) (out[j] as number[])[c.token] = p;
    }
  }
  return out;
}

export const STEP_MS = 190;
export const CAPTURE_FLY_MS = 480;
export const ROLL_MS = 900;

/** The squares a token passes: leaving the yard is one step onto the start square. */
export function hopSteps(from: number, to: number): number[] {
  if (from < 0) return [0];
  const out: number[] = [];
  for (let p = from + 1; p <= to; p++) out.push(p);
  return out;
}

export type Event =
  | { kind: 'roll'; dice: number; pass: boolean; durationMs: number }
  | { kind: 'move'; durationMs: number; hopMs: number; last: Extract<LudoLast, { kind: 'move' }> };

export function eventOf(last: LudoLast): Event {
  if (last.kind === 'move') {
    const hopMs = hopSteps(last.from, last.to).length * STEP_MS;
    return {
      kind: 'move',
      last,
      hopMs,
      durationMs: hopMs + (last.captured.length ? CAPTURE_FLY_MS : 0) + 160,
    };
  }
  return { kind: 'roll', dice: last.dice, pass: last.kind === 'pass', durationMs: ROLL_MS + 250 };
}

/**
 * Where the moving token is `ms` into its hop, in board cells: it steps square to square, rising in an arc on
 * each step. Returns the position, the height above the board (in cells) and the number of squares done.
 */
export function hopAt(
  quad: number,
  token: number,
  from: number,
  to: number,
  ms: number,
): { cell: P; lift: number; done: number } {
  const steps = hopSteps(from, to);
  if (steps.length === 0) return { cell: tokenCell(quad, to, token), lift: 0, done: 0 };
  const f = Math.max(0, ms) / STEP_MS;
  const i = Math.min(steps.length - 1, Math.floor(f));
  const k = Math.min(1, f - i);
  const a = tokenCell(quad, i === 0 ? from : (steps[i - 1] as number), token);
  const b = tokenCell(quad, steps[i] as number, token);
  const t = ms >= steps.length * STEP_MS ? 1 : k;
  return {
    cell: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t],
    lift: 0.7 * 4 * t * (1 - t),
    done: ms >= steps.length * STEP_MS ? steps.length : i,
  };
}

// ---- the die -------------------------------------------------------------------------------------------

/** Pip positions on a face, in a -1..1 square. */
export const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [
    [-0.5, -0.5],
    [0.5, 0.5],
  ],
  3: [
    [-0.5, -0.5],
    [0, 0],
    [0.5, 0.5],
  ],
  4: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  5: [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0, 0],
    [-0.5, 0.5],
    [0.5, 0.5],
  ],
  6: [
    [-0.5, -0.55],
    [0.5, -0.55],
    [-0.5, 0],
    [0.5, 0],
    [-0.5, 0.55],
    [0.5, 0.55],
  ],
};

/** Cube faces: which value sits on which side (opposite faces add up to 7) and the turn that puts +z on it. */
export const DIE_FACES: readonly { value: number; rot: readonly [number, number, number] }[] = [
  { value: 3, rot: [0, 0, 0] },
  { value: 4, rot: [0, Math.PI, 0] },
  { value: 2, rot: [0, Math.PI / 2, 0] },
  { value: 5, rot: [0, -Math.PI / 2, 0] },
  { value: 1, rot: [-Math.PI / 2, 0, 0] },
  { value: 6, rot: [Math.PI / 2, 0, 0] },
];

/** The turn of the cube that has `value` on top. */
export const DIE_REST: Record<number, readonly [number, number, number]> = {
  1: [0, 0, 0],
  2: [0, 0, Math.PI / 2],
  3: [-Math.PI / 2, 0, 0],
  4: [Math.PI / 2, 0, 0],
  5: [0, 0, -Math.PI / 2],
  6: [Math.PI, 0, 0],
};

/** The die `ms` into a roll: tumbling, slowing, landing on `value` (turn as x, y, z; lift as height in cells). */
export function dieAt(value: number, ms: number): { rot: [number, number, number]; lift: number } {
  const rest = DIE_REST[value] ?? DIE_REST[1]!;
  const k = Math.min(1, Math.max(0, ms / ROLL_MS));
  const slow = 1 - Math.pow(1 - k, 3);
  const spin = 1 - slow;
  return {
    rot: [rest[0] + spin * Math.PI * 6, rest[1] + spin * Math.PI * 4, rest[2] + spin * Math.PI * 2],
    lift: 1.2 * 4 * k * (1 - k) * (k < 1 ? 1 : 0),
  };
}

// ---- where the pawns stand ------------------------------------------------------------------------------

export type Pawn = {
  seat: number;
  token: number;
  /** World position (x right, z towards you, board centre at 0). */
  x: number;
  z: number;
  /** Smaller when several tokens share a square. */
  scale: number;
};

/**
 * Every pawn's world position. Tokens sharing a ring square (a safe square, or a stack of your own) stand side
 * by side across it, a little smaller, so each can still be seen and tapped.
 */
export function layoutPawns(
  tokens: readonly (readonly number[])[],
  quads: readonly number[],
  turns: number,
): Pawn[] {
  const out: Pawn[] = [];
  const groups = new Map<string, number[]>();
  tokens.forEach((row, seat) =>
    row.forEach((p, token) => {
      const cell = tokenCell(quads[seat] as number, p, token);
      const [x, z] = toWorld(cell, turns);
      const idx = out.push({ seat, token, x, z, scale: 1 }) - 1;
      // yards and the middle already give each token its own spot
      if (p >= 0 && p <= 50) {
        const key = `${cell[0]},${cell[1]}`;
        groups.set(key, [...(groups.get(key) ?? []), idx]);
      }
    }),
  );
  for (const idxs of groups.values()) {
    if (idxs.length < 2) continue;
    idxs.forEach((i, k) => {
      const pawn = out[i] as Pawn;
      pawn.x += (k - (idxs.length - 1) / 2) * 0.3;
      pawn.scale = idxs.length > 3 ? 0.62 : 0.74;
    });
  }
  return out;
}
