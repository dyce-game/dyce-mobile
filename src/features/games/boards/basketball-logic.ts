import {
  BASKETBALL_AIM_MAX,
  BASKETBALL_POWER_MAX,
  BASKETBALL_RACKS,
  basketballIsMoneyRack,
  simulateBasketballShot,
  type BasketballInput,
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
import {
  clamp,
  framesMs,
  plural,
  quantise,
  sampleFrames,
  type Plan,
  type Sampler,
} from './r3f-common/shot-flow';
import type { CameraSpec, V3 } from './r3f-common/camera-math';

/**
 * Basketball, the parts that are not drawing: reading the server's view, the court and the camera for each
 * rack, turning a flick (or the sliders) into the two integers the engine takes, and the shot replay. The
 * server adds a small release wobble and simulates the shot (backend ADR-034); the device predicts with the
 * same simulation on the input it sent and glides to the server's path when it differs.
 */

export type ShotRecord = {
  seq: number;
  by: string;
  rack: number;
  shot: number;
  input: BasketballInput;
  applied: BasketballInput;
  made: boolean;
  swish: boolean;
  rimHits: number;
  boardHits: number;
  money: boolean;
  points: number;
  endX: number;
  endZ: number;
};

export type BasketballView = {
  players: [string, string];
  racks: number;
  shotsPerRack: number;
  turn: 0 | 1;
  rack: number;
  shotsLeft: number;
  score: Record<string, number>;
  made: Record<string, number>;
  shots: Record<string, ShotRecord[]>;
  over: boolean;
  winner: string | null;
  last: ShotRecord | null;
  seq: number;
};

// ---- the server's view -----------------------------------------------------------------------------

function parseInput(v: unknown): BasketballInput | null {
  if (!isRecord(v) || !isNum(v.aim) || !isNum(v.power)) return null;
  return { aim: v.aim, power: v.power };
}

function parseShot(v: unknown): ShotRecord | null {
  if (!isRecord(v) || !isNum(v.seq) || !isStr(v.by) || !isInt(v.rack) || !isInt(v.shot))
    return null;
  const input = parseInput(v.input);
  const applied = parseInput(v.applied);
  if (!input || !applied || typeof v.made !== 'boolean') return null;
  return {
    seq: v.seq,
    by: v.by,
    rack: v.rack,
    shot: v.shot,
    input,
    applied,
    made: v.made,
    swish: v.swish === true,
    rimHits: isNum(v.rimHits) ? v.rimHits : 0,
    boardHits: isNum(v.boardHits) ? v.boardHits : 0,
    money: v.money === true,
    points: isNum(v.points) ? v.points : 0,
    endX: isNum(v.endX) ? v.endX : 0,
    endZ: isNum(v.endZ) ? v.endZ : 0,
  };
}

export function parseBasketballView(view: unknown): BasketballView | null {
  if (!isRecord(view)) return null;
  const players = parsePlayers(view.players);
  if (!players) return null;
  if (view.turn !== 0 && view.turn !== 1) return null;
  if (!isInt(view.racks) || !isInt(view.shotsPerRack) || !isInt(view.rack)) return null;
  if (!isNum(view.shotsLeft) || !isNum(view.seq)) return null;
  const score = numberRecord(view.score, players);
  const made = numberRecord(view.made, players);
  if (!score || !made || !isRecord(view.shots)) return null;
  const shots: Record<string, ShotRecord[]> = {};
  for (const id of players) {
    const list = view.shots[id];
    if (!Array.isArray(list)) return null;
    const out: ShotRecord[] = [];
    for (const s of list) {
      const r = parseShot(s);
      if (!r) return null;
      out.push(r);
    }
    shots[id] = out;
  }
  let last: ShotRecord | null = null;
  if (view.last !== null && view.last !== undefined) {
    last = parseShot(view.last);
    if (!last) return null;
  }
  return {
    players,
    racks: view.racks,
    shotsPerRack: view.shotsPerRack,
    turn: view.turn,
    rack: view.rack,
    shotsLeft: view.shotsLeft,
    score,
    made,
    shots,
    over: view.over === true,
    winner: isStr(view.winner) ? view.winner : null,
    last,
    seq: view.seq,
  };
}

export const moverOf = (v: BasketballView): string | null => (v.over ? null : v.players[v.turn]);
export const isMoney = (v: BasketballView, rack = v.rack): boolean =>
  basketballIsMoneyRack(rack, v.racks);

/** The shots a player has taken at one rack, in order. */
export const shotsAtRack = (v: BasketballView, id: string, rack: number): ShotRecord[] =>
  (v.shots[id] ?? []).filter((s) => s.rack === rack);

// ---- the court and its camera ------------------------------------------------------------------------

export const RIM_H = 3.048;
export const RIM_R = 0.2286;
export const BALL_R = 0.12;
export const BOARD_Z = 0.38;
export const RELEASE_H = 2.1;
export const AIM_MAX = BASKETBALL_AIM_MAX;
export const POWER_MAX = BASKETBALL_POWER_MAX;

/**
 * The engine's floor plan (millimetres, hoop at the origin, shooters at z < 0, backboard at +z) in the world:
 * metres, y up, with z flipped so the shooter looks down -z (three.js's forward) and x is to their right.
 */
export const courtToWorld = (xMm: number, yMm: number, zMm: number): V3 => [
  xMm / 1000,
  yMm / 1000,
  -zMm / 1000,
];

/** Where the shooter stands for a rack, in the world (the ball is released from here, at RELEASE_H). */
export function spotWorld(rack: number): V3 {
  const r = BASKETBALL_RACKS[clamp(rack, 0, BASKETBALL_RACKS.length - 1)] as {
    x: number;
    z: number;
  };
  return courtToWorld(r.x, 0, r.z);
}

/** The ball in the hand at a rack. */
export const restWorld = (rack: number): V3 => {
  const s = spotWorld(rack);
  return [s[0], RELEASE_H, s[2]];
};

const BACK = 2.4; // metres behind the shooter's spot
const EYE = 2.45;

/**
 * Behind the shooter's shoulder at a rack, looking at the backboard: the ball waits just below the middle of
 * the picture and the hoop sits in its upper half.
 */
export function basketballCamera(rack: number): CameraSpec {
  const spot = spotWorld(rack);
  const d = Math.hypot(spot[0], spot[2]) || 1;
  const k = (d + BACK) / d;
  const pos: V3 = [spot[0] * k, EYE, spot[2] * k];
  const target: V3 = [0, 2.7, 0];
  const dx = pos[0] - target[0];
  const dy = pos[1] - target[1];
  const dz = pos[2] - target[2];
  const dist = Math.hypot(dx, dy, dz);
  return { target, dir: [dx / dist, dy / dist, dz / dist], distance: dist, fovDeg: 38 };
}

// ---- input -----------------------------------------------------------------------------------------

/** Quantise to the integers the engine takes, inside the legal range. */
export function toInput(aim: number, power: number): BasketballInput {
  return {
    aim: quantise(aim, -AIM_MAX, AIM_MAX),
    power: quantise(power, 0, POWER_MAX),
  };
}

/** A flick shorter than this (points) is a tap, not a shot. */
export const MIN_FLICK = 30;
export const AIM_STEP = 10;
export const POWER_STEP = 10;
/** A good medium shot from the arc is around this power, where the sliders start. */
export const DEFAULT_POWER = 520;

/**
 * A finger flick from the ball (dx right, dy UP, in points) becomes a shot: how far up sets the power (half
 * the board height is full power), how far sideways sets the aim (a third of the width is full aim).
 */
export function inputFromFlick(
  dx: number,
  dy: number,
  size: { width: number; height: number },
): BasketballInput | null {
  if (dy < MIN_FLICK) return null;
  return toInput(
    (dx / Math.max(1, size.width / 3)) * AIM_MAX,
    (dy / Math.max(1, size.height * 0.5)) * POWER_MAX,
  );
}

export const stepAim = (aim: number, dir: 1 | -1, step = AIM_STEP): number =>
  clamp(aim + dir * step, -AIM_MAX, AIM_MAX);
export const stepPower = (power: number, dir: 1 | -1, step = POWER_STEP): number =>
  clamp(power + dir * step, 0, POWER_MAX);

export function aimLabel(aim: number): string {
  if (aim === 0) return 'Straight';
  return `${Math.abs(aim)} ${aim < 0 ? 'left' : 'right'}`;
}
export const powerLabel = (power: number): string => `${Math.round(power / 10)} percent`;

// ---- plans: a shot's flight ---------------------------------------------------------------------------

export type ShotPlanData = {
  rack: number;
  /** ~30 Hz keyframes of the ball centre, millimetres in the floor plan: x, y, z. */
  trace: [number, number, number][];
  made: boolean;
  swish: boolean;
};
export type ShotPlan = Plan<ShotPlanData>;

/** After the ball drops through the hoop it falls this long, then is gone. */
export const DROP_MS = 380;

export function planShot(rack: number, input: BasketballInput): ShotPlan {
  const sim = simulateBasketballShot(rack, input, true);
  const o = sim.outcome;
  return {
    data: { rack, trace: sim.trace, made: o.made, swish: o.swish },
    durationMs: framesMs(sim.trace) + (o.made ? DROP_MS : 0),
    key: `${o.made}:${o.rimHits}:${o.boardHits}`,
  };
}

/** The server's shot, simulated from the input it applied (the device's own plus the release wobble). */
export const planFromRecord = (s: ShotRecord): ShotPlan => planShot(s.rack, s.applied);

/** The ball `ms` into a plan: x, y, z in millimetres (it falls out of the net after a make). */
export const sampleShot: Sampler<ShotPlanData> = (plan, ms) => {
  const tr = plan.data.trace;
  const flight = framesMs(tr);
  if (ms <= flight || !plan.data.made) return sampleFrames(tr, ms);
  const end = tr[tr.length - 1] as [number, number, number];
  const t = (ms - flight) / 1000;
  return [end[0], end[1] - 0.5 * 9810 * t * t, end[2]];
};

/** Has the ball passed through the hoop by `ms`? (For the net's little swing.) */
export const throughAt = (plan: ShotPlan): number =>
  plan.data.made ? framesMs(plan.data.trace) : Infinity;

/** The first stretch of a predicted flight, as points in the world, for the aim guide. */
export function guidePoints(rack: number, input: BasketballInput, share = 0.45): V3[] {
  const sim = simulateBasketballShot(rack, input, true);
  return sim.trace
    .slice(1, Math.max(2, Math.ceil(sim.trace.length * share)))
    .map((p) => courtToWorld(p[0], p[1], p[2]));
}

/**
 * The shots to replay that this device has not seen yet: the other player's run since my last shot (or the
 * first shots of the game), oldest first.
 */
export function replayShot(
  v: BasketballView,
  myId: string | null,
  after: number,
): { shot: ShotRecord; plan: ShotPlan } | null {
  const all = new Map<number, ShotRecord>();
  for (const id of v.players) for (const s of v.shots[id] ?? []) all.set(s.seq, s);
  if (v.last) all.set(v.last.seq, v.last);
  const mineLast = Math.max(0, ...[...all.values()].filter((s) => s.by === myId).map((s) => s.seq));
  const next = [...all.values()]
    .filter((s) => s.seq > after && s.seq > mineLast && s.by !== myId)
    .sort((a, b) => a.seq - b.seq)[0];
  if (!next) return null;
  return { shot: next, plan: planFromRecord(next) };
}

// ---- words -----------------------------------------------------------------------------------------

export type ShotTone = 'hit' | 'rim' | 'miss';

export function shotCopy(
  s: ShotRecord,
  myId: string | null,
  nameOf: (id: string) => string,
): { text: string; tone: ShotTone } {
  const mine = s.by === myId;
  const who = mine ? 'You' : nameOf(s.by);
  if (s.made) {
    const how = s.swish ? 'Swish!' : s.boardHits > 0 ? 'Off the glass and in!' : 'Rattled in!';
    const pts = s.money ? ` Money ball, +${s.points}` : ` +${s.points}`;
    return { text: `${mine ? '' : `${who}: `}${how}${pts}`, tone: 'hit' };
  }
  if (s.rimHits > 0) return { text: `${who} rattled the rim and it came out`, tone: 'rim' };
  if (s.boardHits > 0)
    return {
      text: mine ? 'Off the backboard, no good' : `${who} hit the backboard, no good`,
      tone: 'miss',
    };
  return { text: mine ? 'Missed' : `${who} missed`, tone: 'miss' };
}

export function chipLine(v: BasketballView, myId: string | null, oppId: string): string {
  if (v.over) return `${v.score[oppId] ?? 0} points · done`;
  return `${plural(v.score[oppId] ?? 0, 'point')} · ${moverOf(v) === myId ? 'your shots' : 'shooting'}`;
}

export function rackLine(v: BasketballView): string {
  if (v.over) return 'Final';
  return `Rack ${v.rack + 1} of ${v.racks} · ${isMoney(v) ? 'money rack, 2 points each' : '1 point each'}`;
}

export function hintFor(
  v: BasketballView,
  yourTurn: boolean,
  oppName: string,
  sliders: boolean,
): string {
  if (v.over) return 'Game over';
  if (!yourTurn) return `${oppName} is shooting`;
  const left = `${v.shotsLeft} ${v.shotsLeft === 1 ? 'shot' : 'shots'} left`;
  return `${sliders ? 'Set aim and power, then shoot' : 'Flick up to shoot'} · ${left}`;
}

/** The score line on the result screen. */
export function basketballScoreLine(
  v: BasketballView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  return youFirst(v.players, myId)
    .map((id) => `${id === myId ? 'You' : nameOf(id)} ${plural(v.score[id] ?? 0, 'point')}`)
    .join(' · ');
}

export const otherPlayer = (v: BasketballView, id: string): string => otherOf(v.players, id);

/** Numbers for the results screen. */
export function shooterStats(v: BasketballView, id: string) {
  const list = v.shots[id] ?? [];
  const money = list.filter((s) => s.money && s.made).length;
  return {
    taken: list.length,
    made: list.filter((s) => s.made).length,
    swishes: list.filter((s) => s.swish).length,
    money,
  };
}
