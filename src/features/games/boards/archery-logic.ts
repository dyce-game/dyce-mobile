import {
  ARCHERY_AIM_MAX,
  ARCHERY_DISTANCE,
  ARCHERY_DRAW_MAX,
  archeryScore,
  flyArcheryArrow,
} from '@dyce/games';
import {
  isInt,
  isNum,
  isRecord,
  isStr,
  numberRecord,
  otherOf,
  parsePlayers,
  youFirst,
} from './r3f-common/board-utils';
import { clamp, plural, quantise, type Plan, type Sampler } from './r3f-common/shot-flow';
import type { CameraSpec, V3 } from './r3f-common/camera-math';

/**
 * Archery, the parts that are not drawing: reading the server's view (the winds are only sent up to the
 * current end), the range and the sight, turning a drag (or the sliders) into the three integers the engine
 * takes, the wind readout, the arrow's flight and the replay. The server adds the hand tremor and flies the
 * arrow (backend ADR-034); the device predicts the landing without the tremor and glides to the server's.
 */

export type ArrowRecord = {
  seq: number;
  by: string;
  end: number;
  input: { aimX: number; aimY: number; draw: number };
  tremor: { x: number; y: number };
  x: number;
  y: number;
  score: number;
  isX: boolean;
  windDms: number;
  flightMs: number;
};

export type ArcheryView = {
  players: [string, string];
  ends: number;
  arrowsPerEnd: number;
  /** The wind of every end up to the current one, 0.1 m/s, positive blows to the archer's right. */
  winds: number[];
  end: number;
  starter: 0 | 1;
  turn: 0 | 1;
  arrowsLeft: number;
  arrows: Record<string, ArrowRecord[]>;
  score: Record<string, number>;
  xs: Record<string, number>;
  over: boolean;
  winner: string | null;
  last: ArrowRecord | null;
  seq: number;
};

// ---- the server's view -----------------------------------------------------------------------------

function parseArrow(v: unknown): ArrowRecord | null {
  if (!isRecord(v) || !isNum(v.seq) || !isStr(v.by) || !isInt(v.end)) return null;
  const input = v.input;
  const tremor = v.tremor;
  if (!isRecord(input) || !isNum(input.aimX) || !isNum(input.aimY) || !isNum(input.draw))
    return null;
  if (!isRecord(tremor) || !isNum(tremor.x) || !isNum(tremor.y)) return null;
  if (!isNum(v.x) || !isNum(v.y) || !isNum(v.score) || !isNum(v.windDms) || !isNum(v.flightMs)) {
    return null;
  }
  return {
    seq: v.seq,
    by: v.by,
    end: v.end,
    input: { aimX: input.aimX, aimY: input.aimY, draw: input.draw },
    tremor: { x: tremor.x, y: tremor.y },
    x: v.x,
    y: v.y,
    score: v.score,
    isX: v.isX === true,
    windDms: v.windDms,
    flightMs: v.flightMs,
  };
}

export function parseArcheryView(view: unknown): ArcheryView | null {
  if (!isRecord(view)) return null;
  const players = parsePlayers(view.players);
  if (!players) return null;
  if (view.turn !== 0 && view.turn !== 1) return null;
  if (view.starter !== 0 && view.starter !== 1) return null;
  if (!isInt(view.ends) || !isInt(view.arrowsPerEnd) || !isInt(view.end)) return null;
  if (!isNum(view.arrowsLeft) || !isNum(view.seq)) return null;
  if (!Array.isArray(view.winds) || !view.winds.every(isNum)) return null;
  const score = numberRecord(view.score, players);
  const xs = numberRecord(view.xs, players);
  if (!score || !xs || !isRecord(view.arrows)) return null;
  const arrows: Record<string, ArrowRecord[]> = {};
  for (const id of players) {
    const list = view.arrows[id];
    if (!Array.isArray(list)) return null;
    const out: ArrowRecord[] = [];
    for (const a of list) {
      const r = parseArrow(a);
      if (!r) return null;
      out.push(r);
    }
    arrows[id] = out;
  }
  let last: ArrowRecord | null = null;
  if (view.last !== null && view.last !== undefined) {
    last = parseArrow(view.last);
    if (!last) return null;
  }
  return {
    players,
    ends: view.ends,
    arrowsPerEnd: view.arrowsPerEnd,
    winds: view.winds as number[],
    end: view.end,
    starter: view.starter,
    turn: view.turn,
    arrowsLeft: view.arrowsLeft,
    arrows,
    score,
    xs,
    over: view.over === true,
    winner: isStr(view.winner) ? view.winner : null,
    last,
    seq: view.seq,
  };
}

export const moverOf = (v: ArcheryView): string | null => (v.over ? null : v.players[v.turn]);

/** The wind of the end being shot (the last revealed one). */
export const currentWind = (v: ArcheryView): number =>
  v.winds[Math.min(v.end, v.winds.length - 1)] ?? 0;

/** The end whose arrows are on the target: the current one, or the last once the game is over. */
export const shownEnd = (v: ArcheryView): number => (v.over ? v.ends - 1 : v.end);

export const arrowsOnTarget = (v: ArcheryView, end = shownEnd(v)): ArrowRecord[] =>
  v.players
    .flatMap((id) => v.arrows[id] ?? [])
    .filter((a) => a.end === end)
    .sort((a, b) => a.seq - b.seq);

// ---- the range ---------------------------------------------------------------------------------------

export const DISTANCE_M = ARCHERY_DISTANCE;
export const EYE_H = 1.5;
export const AIM_MAX = ARCHERY_AIM_MAX;
export const DRAW_MAX = ARCHERY_DRAW_MAX;
export const FACE_R_M = 0.4;

/** The target face (millimetres from its centre, y up) in the world: the archer is at the origin, looking down -z. */
export const faceToWorld = (xMm: number, yMm: number, dz = 0): V3 => [
  xMm / 1000,
  EYE_H + yMm / 1000,
  -DISTANCE_M + dz,
];

/**
 * The sight picture: a long lens, so the face and the room to aim off for wind fill the screen. The face sits a
 * little above the middle, clear of the score panels and the controls.
 */
export const ARCHERY_CAMERA: CameraSpec = {
  target: [0, EYE_H - 0.42, -DISTANCE_M],
  dir: [0, 0, 1],
  distance: DISTANCE_M,
  fovDeg: 9.5,
};

// ---- input -----------------------------------------------------------------------------------------

export const toInput = (aimX: number, aimY: number, draw: number) => ({
  aimX: quantise(aimX, -AIM_MAX, AIM_MAX),
  aimY: quantise(aimY, -AIM_MAX, AIM_MAX),
  draw: quantise(draw, 0, DRAW_MAX),
});

export const AIM_STEP = 20;
export const DRAW_STEP = 50;
/** A drag has to cover at least this (points) before the sight moves. */
export const MIN_MOVE = 2;

export const stepAim = (v: number, dir: 1 | -1, step = AIM_STEP): number =>
  clamp(v + dir * step, -AIM_MAX, AIM_MAX);
export const stepDraw = (v: number, dir: 1 | -1, step = DRAW_STEP): number =>
  clamp(v + dir * step, 0, DRAW_MAX);

/** A drag of the sight, from where it began: dx right, dy up (points), `mmPerPt` millimetres of the face per point. */
export function dragAim(
  from: { x: number; y: number },
  dx: number,
  dy: number,
  mmPerPt: number,
): { x: number; y: number } {
  return {
    x: quantise(from.x + dx * mmPerPt, -AIM_MAX, AIM_MAX),
    y: quantise(from.y + dy * mmPerPt, -AIM_MAX, AIM_MAX),
  };
}

export const aimXLabel = (v: number): string =>
  v === 0 ? 'Centre' : `${Math.abs(v) / 10} cm ${v < 0 ? 'left' : 'right'}`;
export const aimYLabel = (v: number): string =>
  v === 0 ? 'Centre' : `${Math.abs(v) / 10} cm ${v < 0 ? 'low' : 'high'}`;
export const drawLabel = (d: number): string =>
  d >= DRAW_MAX ? 'Full draw' : `${Math.round(d / 10)} percent draw`;

// ---- wind ------------------------------------------------------------------------------------------

/** "3.2 m/s" for a wind in 0.1 m/s. */
export const windSpeed = (dms: number): string => `${(Math.abs(dms) / 10).toFixed(1)} m/s`;

export function windWords(dms: number): string {
  if (Math.abs(dms) < 5) return 'Calm';
  return `${windSpeed(dms)} to the ${dms > 0 ? 'right' : 'left'}`;
}

/**
 * How far the wind carries an arrow off the line at this draw, in millimetres (positive = to the right),
 * from the same flight the server flies: the arrow with the wind minus the arrow without it. The sight is
 * what you aim with; this is what to allow for.
 */
export function windPushMm(windDms: number, draw: number): number {
  const base = { aimX: 0, aimY: 0, draw };
  return flyArcheryArrow(base, windDms).x - flyArcheryArrow(base, 0).x;
}

/** The aim that cancels the wind at this draw (mm, to the side the wind comes from), kept inside the aim range. */
export const compensation = (windDms: number, draw: number): number =>
  clamp(-windPushMm(windDms, draw), -AIM_MAX, AIM_MAX) || 0;

export function pushLine(windDms: number, draw: number): string {
  const push = Math.round(Math.abs(windPushMm(windDms, draw)) / 10);
  if (push < 1) return 'No push';
  return `Pushes about ${push} cm ${windDms > 0 ? 'right' : 'left'}`;
}

// ---- plans: an arrow's flight --------------------------------------------------------------------------

export type ArrowPlanData = {
  /** Where it lands on the face, mm. */
  x: number;
  y: number;
  flightMs: number;
};
export type ArrowPlan = Plan<ArrowPlanData>;

/** The flight is shown this much slower than real time, so the eye can follow a 0.5 s arrow. */
export const SLOWDOWN = 1.7;

export function planArrow(x: number, y: number, flightMs: number): ArrowPlan {
  return { data: { x, y, flightMs }, durationMs: flightMs * SLOWDOWN, key: `${x},${y}` };
}

/** The device's own arrow: the engine's flight on the input, without the hand tremor the server adds. */
export function predictArrow(
  input: { aimX: number; aimY: number; draw: number },
  windDms: number,
): ArrowPlan {
  const f = flyArcheryArrow(input, windDms);
  return planArrow(f.x, f.y, f.flightMs);
}

export const planFromRecord = (a: ArrowRecord): ArrowPlan => planArrow(a.x, a.y, a.flightMs);

/**
 * The arrow `ms` into a plan: x, y, z in the world (metres). It leaves the bow at eye height, climbs over
 * the line and drops onto the face: constant sideways and forward speed, gravity pulling down, so the path
 * is the straight line to where it lands plus a parabola of `g T^2 / 8`.
 */
export const sampleArrow: Sampler<ArrowPlanData> = (plan, ms) => {
  const s = clamp(ms / plan.durationMs, 0, 1);
  const T = plan.data.flightMs / 1000;
  const end = faceToWorld(plan.data.x, plan.data.y);
  const bulge = 0.5 * 9.81 * (T * s) * (T - T * s);
  return [end[0] * s, EYE_H + (end[1] - EYE_H) * s + bulge, end[2] * s];
};

/** The arrow's direction at a moment, from two samples a hair apart. */
export function arrowDirection(plan: ArrowPlan, ms: number): V3 {
  const a = sampleArrow(plan, ms - 8) as unknown as V3;
  const b = sampleArrow(plan, ms + 8) as unknown as V3;
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l = Math.hypot(d[0], d[1], d[2]) || 1;
  return [d[0] / l, d[1] / l, d[2] / l];
}

/** The arrows to replay that this device has not seen yet: the other archer's run since my last arrow, oldest first. */
export function replayArrow(
  v: ArcheryView,
  myId: string | null,
  after: number,
): { shot: ArrowRecord; plan: ArrowPlan } | null {
  const all = new Map<number, ArrowRecord>();
  for (const id of v.players) for (const a of v.arrows[id] ?? []) all.set(a.seq, a);
  if (v.last) all.set(v.last.seq, v.last);
  const mineLast = Math.max(0, ...[...all.values()].filter((a) => a.by === myId).map((a) => a.seq));
  const next = [...all.values()]
    .filter((a) => a.seq > after && a.seq > mineLast && a.by !== myId)
    .sort((a, b) => a.seq - b.seq)[0];
  return next ? { shot: next, plan: planFromRecord(next) } : null;
}

// ---- scoring, words ----------------------------------------------------------------------------------

export { archeryScore };

/** The ring colour of a score, as the face is painted: [fill, text]. */
export function ringColors(score: number): { fill: string; text: string } {
  if (score >= 9) return { fill: '#F2C230', text: '#3A2400' };
  if (score >= 7) return { fill: '#E0453A', text: '#FFFFFF' };
  if (score >= 5) return { fill: '#2F6BEA', text: '#FFFFFF' };
  if (score >= 3) return { fill: '#1B140F', text: '#FFFFFF' };
  if (score >= 1) return { fill: '#F6F2EA', text: '#1B140F' };
  return { fill: '#44364B', text: '#FFFFFF' };
}

export const arrowLabel = (a: Pick<ArrowRecord, 'score' | 'isX'>): string =>
  a.isX ? 'X' : a.score === 0 ? 'M' : String(a.score);

export type ArrowTone = 'hit' | 'rim' | 'miss';

export function arrowCopy(
  a: ArrowRecord,
  myId: string | null,
  nameOf: (id: string) => string,
): { text: string; tone: ArrowTone } {
  const mine = a.by === myId;
  const who = mine ? 'You' : nameOf(a.by);
  if (a.isX) return { text: `${who} hit the X: 10`, tone: 'hit' };
  if (a.score === 0)
    return { text: mine ? 'Missed the target' : `${who} missed the target`, tone: 'miss' };
  const ring =
    a.score >= 9
      ? 'gold'
      : a.score >= 7
        ? 'red'
        : a.score >= 5
          ? 'blue'
          : a.score >= 3
            ? 'black'
            : 'white';
  return {
    text: `${who} hit ${ring}: ${a.score}`,
    tone: a.score >= 9 ? 'hit' : a.score >= 5 ? 'rim' : 'miss',
  };
}

export function chipLine(v: ArcheryView, myId: string | null, oppId: string): string {
  if (v.over) return `${v.score[oppId] ?? 0} points · done`;
  return `${plural(v.score[oppId] ?? 0, 'point')} · ${moverOf(v) === myId ? 'your arrows' : 'shooting'}`;
}

export const endLine = (v: ArcheryView): string =>
  v.over ? 'Final' : `End ${v.end + 1} of ${v.ends} · ${v.arrowsPerEnd} arrows each`;

export function hintFor(
  v: ArcheryView,
  yourTurn: boolean,
  oppName: string,
  sliders: boolean,
): string {
  if (v.over) return 'Game over';
  if (!yourTurn) return `${oppName} is shooting`;
  const left = `${v.arrowsLeft} ${v.arrowsLeft === 1 ? 'arrow' : 'arrows'} left`;
  return `${sliders ? 'Set the sight, then release' : 'Drag to move the sight, then Release'} · ${left}`;
}

/** The score line on the result screen: points (and Xs when they decided it). */
export function archeryScoreLine(
  v: ArcheryView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const [a, b] = youFirst(v.players, myId) as [string, string];
  const tie = (v.score[a] ?? 0) === (v.score[b] ?? 0);
  return [a, b]
    .map((id) => {
      const x = tie ? ` (${v.xs[id] ?? 0} X)` : '';
      return `${id === myId ? 'You' : nameOf(id)} ${plural(v.score[id] ?? 0, 'point')}${x}`;
    })
    .join(' · ');
}

export const otherPlayer = (v: ArcheryView, id: string): string => otherOf(v.players, id);

/** Numbers for the results screen. */
export function archerStats(v: ArcheryView, id: string) {
  const list = v.arrows[id] ?? [];
  return {
    arrows: list.length,
    best: list.reduce((m, a) => Math.max(m, a.score), 0),
    gold: list.filter((a) => a.score >= 9).length,
    xs: v.xs[id] ?? 0,
    misses: list.filter((a) => a.score === 0).length,
  };
}
