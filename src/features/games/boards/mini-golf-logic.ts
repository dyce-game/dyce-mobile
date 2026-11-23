import {
  MINI_GOLF_AIM_MAX,
  MINI_GOLF_POWER_MAX,
  miniGolfHole,
  type MiniGolfHole,
  type MiniGolfInput,
} from '@dyce/games';
import {
  createSeenLog,
  intArray,
  isInt,
  isRec,
  isStr,
  numberRecord,
  strArray,
  type Rec,
} from './arcade-parse';

/**
 * Pure logic for the Mini Golf board: the parser for the server's view, aim and power (the drag, and the
 * step buttons that do the same job), the putt the board sends, the animation of a putt from the shared
 * simulation's trace, and the lines of text. No React in here, so it is unit tested. The server runs the
 * same simulation and its answer is final; the board plays the trace to animate and corrects on mismatch.
 */

export type Pt = { x: number; y: number };

export type PuttView = {
  seq: number;
  hole: number;
  by: string;
  stroke: number;
  /** Integer millimetres. */
  from: Pt;
  to: Pt;
  input: MiniGolfInput;
  sunk: boolean;
  bounces: number;
};

export type MiniGolfView = {
  players: string[];
  mirror: boolean[];
  pars: number[];
  /** 0-8; equals `holes` when the game is over. */
  hole: number;
  holes: number;
  maxStrokes: number;
  turn: string | null;
  over: boolean;
  /** Your own ball in millimetres on the current hole (only yours is sent). */
  ball: Record<string, Pt>;
  strokes: Record<string, number | null>;
  done: Record<string, boolean>;
  sunk: Record<string, boolean | null>;
  /** Putts on this hole you may see: yours, and everyone's once you are done. */
  log: PuttView[];
  /** Strokes per finished hole. */
  card: Record<string, number[]>;
  totals: Record<string, number>;
  last: PuttView | null;
};

const parsePt = (v: unknown): Pt | null =>
  isRec(v) && isInt(v.x) && isInt(v.y) ? { x: v.x, y: v.y } : null;

function parsePutt(v: unknown): PuttView | null {
  if (!isRec(v)) return null;
  const { seq, hole, by, stroke, from, to, input, sunk, bounces } = v;
  const f = parsePt(from);
  const t = parsePt(to);
  if (!isInt(seq) || !isInt(hole) || !isStr(by) || !isInt(stroke) || !f || !t) return null;
  if (!isRec(input) || !isInt(input.dx) || !isInt(input.dy) || !isInt(input.power)) return null;
  return {
    seq,
    hole,
    by,
    stroke,
    from: f,
    to: t,
    input: { dx: input.dx, dy: input.dy, power: input.power },
    sunk: sunk === true,
    bounces: isInt(bounces) ? bounces : 0,
  };
}

export function parseMiniGolfView(view: unknown): MiniGolfView | null {
  if (!isRec(view)) return null;
  const v: Rec = view;
  const players = strArray(v.players);
  if (!players || players.length < 2) return null;
  const { mirror, pars, hole, holes, maxStrokes } = v;
  if (!Array.isArray(mirror) || !mirror.every((m) => typeof m === 'boolean')) return null;
  const parList = intArray(pars);
  if (!parList || !isInt(hole) || !isInt(holes) || !isInt(maxStrokes)) return null;
  if (mirror.length !== holes || parList.length !== holes || hole < 0 || hole > holes) return null;
  if (v.turn !== null && !(isStr(v.turn) && players.includes(v.turn))) return null;
  if (!isRec(v.ball) || !isRec(v.done) || !isRec(v.card) || !isRec(v.strokes) || !isRec(v.sunk)) {
    return null;
  }
  const ball: Record<string, Pt> = {};
  for (const [id, p] of Object.entries(v.ball)) {
    const pt = parsePt(p);
    if (!pt) return null;
    ball[id] = pt;
  }
  const done: Record<string, boolean> = {};
  const strokes: Record<string, number | null> = {};
  const sunk: Record<string, boolean | null> = {};
  const card: Record<string, number[]> = {};
  for (const id of players) {
    done[id] = v.done[id] === true;
    strokes[id] = typeof v.strokes[id] === 'number' ? (v.strokes[id] as number) : null;
    sunk[id] = typeof v.sunk[id] === 'boolean' ? (v.sunk[id] as boolean) : null;
    const c = intArray(v.card[id]);
    if (!c) return null;
    card[id] = c;
  }
  const totals = numberRecord(v.totals, players);
  if (!totals || !Array.isArray(v.log)) return null;
  const log: PuttView[] = [];
  for (const p of v.log) {
    const put = parsePutt(p);
    if (!put) return null;
    log.push(put);
  }
  let last: PuttView | null = null;
  if (v.last !== null && v.last !== undefined) {
    last = parsePutt(v.last);
    if (!last) return null;
  }
  return {
    players,
    mirror: mirror as boolean[],
    pars: parList,
    hole,
    holes,
    maxStrokes,
    turn: v.turn === null ? null : (v.turn as string),
    over: v.over === true,
    ball,
    strokes,
    done,
    sunk,
    log,
    card,
    totals,
    last,
  };
}

/** The hole's geometry for hole `index` of this match (mirrored or not). */
export const holeFor = (view: MiniGolfView, index: number): MiniGolfHole =>
  miniGolfHole(index, view.mirror[index] === true);

/** "You 24 · Tolu 27": total strokes over the finished holes, fewest wins. */
export function miniGolfScoreLine(
  view: MiniGolfView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return order
    .map((id) => `${id === myId ? 'You' : nameOf(id)} ${view.totals[id] ?? 0}`)
    .join(' · ');
}

// ---- aim and power --------------------------------------------------------------------------------------

export const POWER_MAX = MINI_GOLF_POWER_MAX;
export const POWER_DEFAULT = 500;

const RAD = Math.PI / 180;

/** Degrees clockwise from straight up the screen (toward the cup): 0 up, 90 right, 180 down, 270 left. */
export const normAngle = (deg: number): number => ((Math.round(deg) % 360) + 360) % 360;

/** The integer direction vector for an aim angle (y is down the screen). */
export function angleToVector(deg: number): { dx: number; dy: number } {
  const a = normAngle(deg) * RAD;
  return {
    dx: Math.round(Math.sin(a) * MINI_GOLF_AIM_MAX) + 0, // + 0 turns -0 into 0
    dy: Math.round(-Math.cos(a) * MINI_GOLF_AIM_MAX) + 0,
  };
}

export function vectorToAngle(dx: number, dy: number): number {
  return normAngle(Math.atan2(dx, -dy) / RAD);
}

/** The angle that points a ball (millimetres) at the cup (centimetres). */
export const aimAtCup = (ball: Pt, cup: Pt): number =>
  vectorToAngle(cup.x * 10 - ball.x, cup.y * 10 - ball.y);

export const clampPower = (p: number): number => Math.max(1, Math.min(POWER_MAX, Math.round(p)));

export const stepAngle = (deg: number, delta: number): number => normAngle(deg + delta);
export const stepPower = (p: number, delta: number): number => clampPower(p + delta);

/** The putt to send: the engine's integer input for an aim angle and a power. */
export function inputFromAim(deg: number, power: number): MiniGolfInput {
  const { dx, dy } = angleToVector(deg);
  return { dx, dy, power: clampPower(power) };
}

/** The angle a stored input was aimed at (for showing a putt). */
export const angleOfInput = (input: MiniGolfInput): number => vectorToAngle(input.dx, input.dy);

/** The drag distance (points) that is full power, and the shortest drag that counts as a pull. */
export const DRAG_FULL_PX = 130;
export const DRAG_MIN_PX = 10;

/**
 * Pull back from the ball like a slingshot: the ball goes the OPPOSITE way to the drag, and the length of the
 * drag is the power. `px` is the drag vector in points. Null for a drag too short to be a pull.
 */
export function dragToAim(
  px: { x: number; y: number },
  fullPx = DRAG_FULL_PX,
): { angle: number; power: number } | null {
  const len = Math.hypot(px.x, px.y);
  if (len < DRAG_MIN_PX) return null;
  return { angle: vectorToAngle(-px.x, -px.y), power: clampPower((len / fullPx) * POWER_MAX) };
}

/** The end of the aim guide: a short line from the ball (centimetres) whose length grows with power. */
export function guideEnd(ball: Pt, angle: number, power: number, reachCm = 260): Pt {
  const { dx, dy } = angleToVector(angle);
  const k = ((clampPower(power) / POWER_MAX) * reachCm) / MINI_GOLF_AIM_MAX;
  return { x: ball.x + dx * k, y: ball.y + dy * k };
}

// ---- playing a putt back ----------------------------------------------------------------------------------

/** The simulation's trace is a keyframe every 4 steps of 1/120 s: 30 keyframes a second. */
export const TRACE_HZ = 30;

export const traceDurationMs = (trace: readonly (readonly [number, number])[]): number =>
  trace.length <= 1 ? 0 : Math.round(((trace.length - 1) / TRACE_HZ) * 1000);

/** Where the ball is `ms` into the trace, in centimetres (the trace is millimetres). Clamps to the ends. */
export function traceAt(trace: readonly (readonly [number, number])[], ms: number): Pt {
  const first = trace[0];
  if (!first) return { x: 0, y: 0 };
  const f = (Math.max(0, ms) / 1000) * TRACE_HZ;
  const i = Math.floor(f);
  const a = trace[Math.min(i, trace.length - 1)] as readonly [number, number];
  const b = trace[Math.min(i + 1, trace.length - 1)] as readonly [number, number];
  const t = Math.min(1, f - i);
  return { x: (a[0] + (b[0] - a[0]) * t) / 10, y: (a[1] + (b[1] - a[1]) * t) / 10 };
}

export const mmToCm = (p: Pt): Pt => ({ x: p.x / 10, y: p.y / 10 });

export const samePoint = (a: Pt, b: Pt): boolean => a.x === b.x && a.y === b.y;

// ---- lines of text ----------------------------------------------------------------------------------------

/** "HOLE 4 · PAR 3" */
export const holeLine = (view: MiniGolfView, hole = view.hole): string =>
  `HOLE ${Math.min(hole + 1, view.holes)} · PAR ${view.pars[hole] ?? '-'}`;

/** "Stroke 2 of 6" for your next putt. */
export const strokeLine = (stroke: number, max: number): string => `Stroke ${stroke} of ${max}`;

/** "Total: you 9 · Tolu 10" */
export function totalsLine(
  view: MiniGolfView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...view.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return `Total: ${order.map((id) => `${id === myId ? 'you' : nameOf(id)} ${view.totals[id] ?? 0}`).join(' · ')}`;
}

/** How a finished hole went: "Birdie", "Par", "Hole in one!" ... Compared with par. */
export function holeName(strokes: number, par: number, sunk = true): string {
  if (!sunk) return 'Out of strokes';
  if (strokes === 1) return 'Hole in one!';
  const d = strokes - par;
  if (d <= -2) return 'Eagle';
  if (d === -1) return 'Birdie';
  if (d === 0) return 'Par';
  if (d === 1) return 'Bogey';
  return `${d} over par`;
}

/** What a putt did, in a sentence: "Zainab holed out in 3" / "Zainab putt 2". */
export function puttLine(p: PuttView, name: string, par: number): string {
  return p.sunk
    ? `${name} holed out in ${p.stroke} (${holeName(p.stroke, par)})`
    : `${name} putt ${p.stroke}`;
}

/** The players' strokes on the current hole once they are done, for the line under the field. */
export function holeProgress(
  view: MiniGolfView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const parts: string[] = [];
  for (const id of view.players) {
    if (id === myId) continue;
    const s = view.strokes[id];
    if (view.done[id] && typeof s === 'number') {
      parts.push(`${nameOf(id)} ${view.sunk[id] ? 'holed out in' : 'took'} ${s}`);
    }
  }
  return parts.length ? parts.join(' · ') : null;
}

/** One row of the scorecard: a name and the strokes per hole (blank for holes not played). */
export function scorecardRow(
  view: MiniGolfView,
  id: string,
): { cells: (number | null)[]; total: number } {
  const played = view.card[id] ?? [];
  return {
    cells: Array.from({ length: view.holes }, (_, i) => played[i] ?? null),
    total: view.totals[id] ?? 0,
  };
}

/** The putts on the current hole you can see, in order. */
export const visibleLog = (view: MiniGolfView): PuttView[] =>
  view.log.filter((p) => p.hole === view.hole);

// ---- holding the result until the last putt has rolled ------------------------------------------------------

export const golfSeen = createSeenLog();

/** True while a finished game's final putt has not been shown on this device. */
export const holdsForFinalPutt = (matchId: string, v: MiniGolfView | null): boolean =>
  !!v && v.over && !!v.last && !golfSeen.has(matchId, v.last.seq);
