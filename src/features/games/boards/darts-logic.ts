import {
  DARTS_AIM_MAX,
  DARTS_PER_TURN,
  DARTS_SECTORS,
  dartsSegmentCentre,
  readDartboard,
  type DartsRing,
  type DartsVariant,
} from '@dyce/games';
import {
  isNum,
  isRecord,
  isStr,
  numberRecord,
  otherOf,
  parsePlayers,
  youFirst,
} from './r3f-common/board-utils';
import { clamp, plural, quantise, type Plan, type Sampler } from './r3f-common/shot-flow';
import type { V3 } from './r3f-common/camera-math';

/**
 * Darts, the parts that are not drawing: reading the server's view, turning a finger (or the sliders) into the
 * aim point the engine takes, what the board says there, the checkout hints, the dart's flight and the words.
 * The server adds the hand wobble and reads the board (backend ADR-034); the device predicts the dart where it
 * was aimed and glides to where the server says it landed.
 */

export type Point = { x: number; y: number };

export type DartRecord = {
  seq: number;
  by: string;
  input: Point;
  hit: Point;
  ring: DartsRing;
  number: number;
  points: number;
  bust: boolean;
  finished: boolean;
};

export type DartsView = {
  players: [string, string];
  variant: DartsVariant;
  maxRounds: number;
  left: Record<string, number>;
  turnStartLeft: Record<string, number>;
  thrown: Record<string, number>;
  finishedWith: Record<string, number | null>;
  turn: 0 | 1;
  round: number;
  dartsLeft: number;
  turnDarts: DartRecord[];
  over: boolean;
  winner: string | null;
  last: DartRecord | null;
  seq: number;
};

// ---- the server's view -----------------------------------------------------------------------------

const RINGS: readonly string[] = ['dbull', 'bull', 'single', 'double', 'triple', 'miss'];

function parsePoint(v: unknown): Point | null {
  if (!isRecord(v) || !isNum(v.x) || !isNum(v.y)) return null;
  return { x: v.x, y: v.y };
}

function parseDart(v: unknown): DartRecord | null {
  if (!isRecord(v) || !isNum(v.seq) || !isStr(v.by)) return null;
  const input = parsePoint(v.input);
  const hit = parsePoint(v.hit);
  if (!input || !hit || !isStr(v.ring) || !RINGS.includes(v.ring)) return null;
  if (!isNum(v.number) || !isNum(v.points)) return null;
  return {
    seq: v.seq,
    by: v.by,
    input,
    hit,
    ring: v.ring as DartsRing,
    number: v.number,
    points: v.points,
    bust: v.bust === true,
    finished: v.finished === true,
  };
}

export function parseDartsView(view: unknown): DartsView | null {
  if (!isRecord(view)) return null;
  const players = parsePlayers(view.players);
  if (!players) return null;
  if (view.variant !== '501' && view.variant !== 'clock') return null;
  if (view.turn !== 0 && view.turn !== 1) return null;
  if (!isNum(view.round) || !isNum(view.dartsLeft) || !isNum(view.seq)) return null;
  const left = numberRecord(view.left, players);
  const turnStartLeft = numberRecord(view.turnStartLeft, players);
  const thrown = numberRecord(view.thrown, players);
  if (!left || !turnStartLeft || !thrown) return null;
  if (!isRecord(view.finishedWith)) return null;
  const finishedWith: Record<string, number | null> = {};
  for (const id of players) {
    const f = view.finishedWith[id];
    if (f !== null && !isNum(f)) return null;
    finishedWith[id] = f as number | null;
  }
  if (!Array.isArray(view.turnDarts)) return null;
  const turnDarts: DartRecord[] = [];
  for (const d of view.turnDarts) {
    const r = parseDart(d);
    if (!r) return null;
    turnDarts.push(r);
  }
  let last: DartRecord | null = null;
  if (view.last !== null && view.last !== undefined) {
    last = parseDart(view.last);
    if (!last) return null;
  }
  return {
    players,
    variant: view.variant,
    maxRounds: isNum(view.maxRounds) ? view.maxRounds : 20,
    left,
    turnStartLeft,
    thrown,
    finishedWith,
    turn: view.turn,
    round: view.round,
    dartsLeft: view.dartsLeft,
    turnDarts,
    over: view.over === true,
    winner: isStr(view.winner) ? view.winner : null,
    last,
    seq: view.seq,
  };
}

export const moverOf = (v: DartsView): string | null => (v.over ? null : v.players[v.turn]);

// ---- the board -----------------------------------------------------------------------------------------

export const AIM_MAX = DARTS_AIM_MAX;
export const DARTS_TURN = DARTS_PER_TURN;
/** One engine unit (0.1 mm) in metres. */
export const UNIT_M = 0.0001;

/** Radii in metres (regulation board). */
export const RING_R = {
  dbull: 0.00635,
  bull: 0.0159,
  tripleIn: 0.099,
  tripleOut: 0.107,
  doubleIn: 0.162,
  doubleOut: 0.17,
} as const;

/** The engine's board point in the world: the board face is the plane z = 0, y up, x to the thrower's right. */
export const boardToWorld = (p: Point, z = 0): V3 => [p.x * UNIT_M, p.y * UNIT_M, z];
export const worldToBoard = (x: number, y: number): Point => ({
  x: Math.round(x / UNIT_M),
  y: Math.round(y / UNIT_M),
});

/** Where on the screen the 20 numbers go: the sector's centre, outside the double ring. */
export function numberSpots(): { n: number; x: number; y: number }[] {
  return DARTS_SECTORS.map((n, i) => {
    const a = (i * 18 * Math.PI) / 180;
    const r = 0.1925;
    return { n, x: Math.sin(a) * r, y: Math.cos(a) * r };
  });
}

// ---- input -----------------------------------------------------------------------------------------

/** Quantise to the integers the engine takes, inside the legal range. */
export const toAim = (x: number, y: number): Point => ({
  x: quantise(x, -AIM_MAX, AIM_MAX),
  y: quantise(y, -AIM_MAX, AIM_MAX),
});

/** A drag shorter than this (points) from where it began is a tap: it places the aim but does not throw. */
export const MIN_DRAG = 12;
/** How far above the finger (points) the aim sits, so the finger does not hide it. */
export const FINGER_LIFT = 56;
export const AIM_STEP = 50;
export const AIM_FINE_STEP = 10;

export const stepAim = (v: number, dir: 1 | -1, step = AIM_STEP): number =>
  clamp(v + dir * step, -AIM_MAX, AIM_MAX);

/** What the board says at the aim point: "Treble 20", "Bull", "Miss". */
export function readingLabel(p: Point): string {
  const r = readDartboard(p.x, p.y);
  switch (r.ring) {
    case 'dbull':
      return 'Bull, 50';
    case 'bull':
      return 'Outer bull, 25';
    case 'miss':
      return 'Off the board';
    case 'single':
      return `${r.number}`;
    case 'double':
      return `Double ${r.number}, ${r.points}`;
    case 'triple':
      return `Treble ${r.number}, ${r.points}`;
  }
}

/** The short label of a dart: "T20", "D16", "20", "Bull", "25", "Miss". */
export function dartLabel(d: Pick<DartRecord, 'ring' | 'number'>): string {
  switch (d.ring) {
    case 'dbull':
      return 'Bull';
    case 'bull':
      return '25';
    case 'miss':
      return 'Miss';
    case 'single':
      return String(d.number);
    case 'double':
      return `D${d.number}`;
    case 'triple':
      return `T${d.number}`;
  }
}

export type Target = { ring: 'single' | 'double' | 'triple' | 'bull' | 'dbull'; n: number };

export const targetLabel = (t: Target): string =>
  t.ring === 'dbull'
    ? 'Bull'
    : t.ring === 'bull'
      ? '25'
      : `${t.ring === 'double' ? 'D' : t.ring === 'triple' ? 'T' : ''}${t.n}`;

export const targetPoint = (t: Target): Point => dartsSegmentCentre(t.n, t.ring);

export const targetSpoken = (t: Target): string =>
  t.ring === 'dbull'
    ? 'the bull'
    : t.ring === 'bull'
      ? 'the outer bull'
      : `${t.ring === 'double' ? 'double' : t.ring === 'triple' ? 'treble' : 'single'} ${t.n}`;

// ---- checkout hints --------------------------------------------------------------------------------

type Seg = Target & { pts: number };

const SCORING: Seg[] = (() => {
  const out: Seg[] = [
    { ring: 'dbull', n: 50, pts: 50 },
    { ring: 'bull', n: 25, pts: 25 },
  ];
  for (let n = 1; n <= 20; n++) {
    out.push(
      { ring: 'single', n, pts: n },
      { ring: 'double', n, pts: 2 * n },
      { ring: 'triple', n, pts: 3 * n },
    );
  }
  // Highest first; on a tie the treble or single, which are the bigger targets, before the double.
  const rank = { triple: 0, single: 1, double: 2, bull: 3, dbull: 3 } as const;
  return out.sort((a, b) => b.pts - a.pts || rank[a.ring] - rank[b.ring]);
})();

/** The doubles a player likes to finish on, most welcome first (D20, D16, D18, ...), then the bull. */
const FINISH_ORDER = [20, 16, 18, 10, 8, 12, 14, 6, 4, 2, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1];
const FINISHERS: Seg[] = [
  ...FINISH_ORDER.map((n): Seg => ({ ring: 'double', n, pts: 2 * n })),
  { ring: 'dbull', n: 50, pts: 50 },
];

function route(left: number, darts: number): Seg[] | null {
  if (darts === 1) {
    const f = FINISHERS.find((s) => s.pts === left);
    return f ? [f] : null;
  }
  for (const first of SCORING) {
    if (first.pts >= left - 1) continue;
    const rest = route(left - first.pts, darts - 1);
    if (rest) return [first, ...rest];
  }
  return null;
}

/**
 * A way to finish from `left` points in at most `dartsLeft` darts, ending on a double (the bull counts):
 * the fewest darts, the usual route (170 is T20, T20, Bull; 40 is D20). Null when no finish is possible.
 */
export function checkout(left: number, dartsLeft: number): Target[] | null {
  if (!Number.isInteger(left) || left < 2 || left > 170) return null;
  for (let k = 1; k <= Math.min(3, dartsLeft); k++) {
    const r = route(left, k);
    if (r) return r.map(({ ring, n }) => ({ ring, n }));
  }
  return null;
}

/** The next number in Around the clock: left counts down from 21; 1 first, the bull last. */
export const clockTarget = (left: number): Target =>
  left <= 1 ? { ring: 'dbull', n: 50 } : { ring: 'single', n: 22 - left };

/** The hint under the aim: a checkout route in 501, the next number in Around the clock. */
export function hintTargets(v: DartsView, id: string): Target[] | null {
  const left = v.left[id] ?? 0;
  if (v.variant === 'clock') return left > 0 ? [clockTarget(left)] : null;
  return checkout(left, v.dartsLeft);
}

export function hintLine(v: DartsView, id: string): string | null {
  const t = hintTargets(v, id);
  if (!t) return null;
  return v.variant === 'clock'
    ? `Next: ${targetLabel(t[0] as Target)}`
    : `Finish: ${t.map(targetLabel).join(' · ')}`;
}

/** The score a panel shows: points left (501), or the number to hit next / done (clock). */
export function scoreText(v: DartsView, id: string): string {
  const left = v.left[id] ?? 0;
  if (v.variant === '501') return String(left);
  return left <= 0 ? 'Done' : targetLabel(clockTarget(left));
}

export const scoreSpoken = (v: DartsView, id: string): string => {
  const left = v.left[id] ?? 0;
  if (v.variant === '501') return `${left} to finish`;
  return left <= 0
    ? 'finished all the numbers'
    : `${plural(left, 'number')} left, next ${targetLabel(clockTarget(left))}`;
};

/** Points scored so far this turn (501), for the line under the chips. */
export function turnScored(v: DartsView): number {
  return v.turnDarts.reduce((sum, d) => sum + (d.bust ? 0 : d.points), 0);
}

// ---- plans: a dart's flight ---------------------------------------------------------------------------

export type DartPlanData = {
  /** Where the dart lands (engine units). */
  hit: Point;
  /** The darts already in the board from this turn, before this one. */
  stuck: DartRecord[];
};
export type DartPlan = Plan<DartPlanData>;

export const FLIGHT_MS = 420;
/** Where the dart leaves the hand, in the world (metres): low and in front of the camera. */
export const START: V3 = [0.07, -0.3, 1.0];

export function planDart(hit: Point, stuck: DartRecord[]): DartPlan {
  return { data: { hit, stuck }, durationMs: FLIGHT_MS, key: `${hit.x},${hit.y}` };
}

/** The dart's tip `ms` into its flight: x, y, z in metres. It arcs up a little and arrives at the board. */
export const sampleDart: Sampler<DartPlanData> = (plan, ms) => {
  const s = clamp(ms / plan.durationMs, 0, 1);
  const e = 1 - (1 - s) * (1 - s);
  const [hx, hy] = boardToWorld(plan.data.hit);
  return [
    START[0] + (hx - START[0]) * e,
    START[1] + (hy - START[1]) * e + 0.12 * 4 * s * (1 - s),
    START[2] * (1 - s),
  ];
};

/** The darts that stand in the board while a plan plays or has played: the turn's earlier darts, then this one. */
export function stuckAfter(plan: DartPlan): Point[] {
  return [...plan.data.stuck.map((d) => d.hit), plan.data.hit];
}

/**
 * The darts to replay that this device has not seen yet: the turn's darts still recorded in the view, plus the
 * last one (a finished turn clears the list). Oldest first, each with the darts that were in the board before.
 */
export function replayDart(
  v: DartsView,
  after: number,
): { shot: DartRecord; plan: DartPlan | null } | null {
  const all = new Map<number, DartRecord>();
  for (const d of v.turnDarts) all.set(d.seq, d);
  if (v.last) all.set(v.last.seq, v.last);
  const next = [...all.values()].filter((d) => d.seq > after).sort((a, b) => a.seq - b.seq)[0];
  if (!next) return null;
  const stuck = v.turnDarts.filter((d) => d.seq < next.seq && d.by === next.by);
  return { shot: next, plan: planDart(next.hit, stuck) };
}

// ---- words -----------------------------------------------------------------------------------------

export type DartTone = 'hit' | 'miss' | 'foul';

const ringWord = (d: DartRecord): string => {
  switch (d.ring) {
    case 'dbull':
      return 'the bull';
    case 'bull':
      return 'the outer bull';
    case 'miss':
      return 'the wall';
    case 'single':
      return `${d.number}`;
    case 'double':
      return `double ${d.number}`;
    case 'triple':
      return `treble ${d.number}`;
  }
};

/** What the last dart did, in a sentence for the banner and the screen reader. */
export function dartCopy(
  d: DartRecord,
  v: DartsView,
  myId: string | null,
  nameOf: (id: string) => string,
): { text: string; tone: DartTone } {
  const mine = d.by === myId;
  const who = mine ? 'You' : nameOf(d.by);
  if (d.finished) {
    return {
      text:
        v.variant === 'clock'
          ? `${who} hit the bull and finished`
          : `${who} checked out on ${ringWord(d)}`,
      tone: 'hit',
    };
  }
  if (d.bust) {
    return {
      text: `Bust! ${who} ${mine ? 'go' : 'goes'} back to ${v.left[d.by] ?? 0}`,
      tone: 'foul',
    };
  }
  if (d.ring === 'miss')
    return { text: mine ? 'Missed the board' : `${who} missed the board`, tone: 'miss' };
  if (v.variant === 'clock') return { text: `${who} hit ${ringWord(d)}`, tone: 'hit' };
  return { text: `${who} hit ${ringWord(d)}: ${d.points}`, tone: d.points >= 40 ? 'hit' : 'miss' };
}

/** The line under the opponent's name. */
export function chipLine(v: DartsView, myId: string | null, oppId: string): string {
  if (v.over) return 'Game over';
  return `${plural(v.thrown[oppId] ?? 0, 'dart')} · ${moverOf(v) === myId ? 'your throw' : 'throwing'}`;
}

export function hintFor(
  v: DartsView,
  yourTurn: boolean,
  oppName: string,
  sliders: boolean,
): string {
  if (v.over) return 'Game over';
  if (!yourTurn) return `${oppName} is throwing`;
  return sliders ? 'Set the aim, then throw' : 'Drag to aim · let go to throw';
}

/** The score line on the result screen. */
export function dartsScoreLine(
  v: DartsView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  return youFirst(v.players, myId)
    .map((id) => {
      const who = id === myId ? 'You' : nameOf(id);
      const done = v.finishedWith[id];
      if (done !== null && done !== undefined) return `${who} finished in ${plural(done, 'dart')}`;
      const left = v.left[id] ?? 0;
      return v.variant === '501' ? `${who} ${left} left` : `${who} ${plural(left, 'number')} left`;
    })
    .join(' · ');
}

export const otherPlayer = (v: DartsView, id: string): string => otherOf(v.players, id);

export const variantName = (v: DartsVariant): string => (v === '501' ? '501' : 'Around the clock');
