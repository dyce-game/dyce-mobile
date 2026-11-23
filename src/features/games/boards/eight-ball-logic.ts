import {
  EIGHT_BALL_ANGLE_MAX,
  EIGHT_BALL_BALL_R,
  EIGHT_BALL_DMM,
  EIGHT_BALL_POCKETS,
  EIGHT_BALL_POWER_MAX,
  EIGHT_BALL_SPIN_MAX,
  EIGHT_BALL_TABLE_L,
  EIGHT_BALL_TABLE_W,
  EIGHT_BALL_HEAD_X,
  eightBallCanPlace,
  eightBallGroupOf,
  simulateEightBallShot,
  sinCosCenti,
  type EightBallEnd,
  type EightBallFoul,
  type EightBallInput,
  type EightBallTableBall,
} from '@dyce/games';
import {
  isInt,
  isNum,
  isRecord,
  isStr,
  otherOf,
  parsePlayers,
  youFirst,
} from './r3f-common/board-utils';
import { clamp, framesMs, plural, type Plan, type Sampler } from './r3f-common/shot-flow';
import type { V3 } from './r3f-common/camera-math';

/**
 * 8 Ball, the parts that are not drawing: reading the server's view, the table in metres, turning a finger
 * (or the sliders) into the integers the engine takes, the aim guide, ball in hand, and the shot replay. The
 * server decides every shot; this predicts and replays it with the same simulation (backend ADR-034).
 */

export type Ball = EightBallTableBall;
export type Group = 'solid' | 'stripe';
export type Hand = 'none' | 'kitchen' | 'anywhere';

export type EightBallShot = {
  seq: number;
  by: string;
  input: EightBallInput;
  /** The table before the shot, the cue ball where it was struck from. */
  from: Ball[];
  firstContact: number | null;
  pocketed: { id: number; pocket: number }[];
  fouls: EightBallFoul[];
  railAfterContact: number;
  wasBreak: boolean;
  reRack: boolean;
  keepsTurn: boolean;
};

export type EightBallView = {
  players: [string, string];
  maxShots: number;
  balls: Ball[];
  pocketed: number[];
  groups: Record<string, Group> | null;
  turn: 0 | 1;
  hand: Hand;
  breaking: boolean;
  shots: number;
  over: boolean;
  winner: string | null;
  end: EightBallEnd | null;
  last: EightBallShot | null;
  seq: number;
};

// ---- the server's view -----------------------------------------------------------------------------

const FOULS: readonly string[] = [
  'scratch',
  'no_contact',
  'wrong_first_contact',
  'no_rail',
  'bad_break',
];
const ENDS: readonly string[] = [
  'eight_pocketed',
  'eight_early',
  'eight_wrong_pocket',
  'eight_foul',
  'max_shots',
];

function parseBalls(v: unknown): Ball[] | null {
  if (!Array.isArray(v)) return null;
  const out: Ball[] = [];
  for (const b of v) {
    if (!isRecord(b) || !isInt(b.id) || !isNum(b.x) || !isNum(b.y)) return null;
    if (b.id < 0 || b.id > 15) return null;
    out.push({ id: b.id, x: b.x, y: b.y });
  }
  return out;
}

function parseShot(v: unknown): EightBallShot | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isRecord(v) || !isNum(v.seq) || !isStr(v.by) || !isRecord(v.input)) return undefined;
  const i = v.input;
  if (!isNum(i.angle) || !isNum(i.power) || !isNum(i.spinX) || !isNum(i.spinY)) return undefined;
  const from = parseBalls(v.from);
  if (!from || !Array.isArray(v.pocketed) || !Array.isArray(v.fouls)) return undefined;
  const pocketed: { id: number; pocket: number }[] = [];
  for (const p of v.pocketed) {
    if (!isRecord(p) || !isInt(p.id) || !isInt(p.pocket)) return undefined;
    pocketed.push({ id: p.id, pocket: p.pocket });
  }
  return {
    seq: v.seq,
    by: v.by,
    input: { angle: i.angle, power: i.power, spinX: i.spinX, spinY: i.spinY },
    from,
    firstContact: isNum(v.firstContact) ? v.firstContact : null,
    pocketed,
    fouls: v.fouls.filter((f): f is EightBallFoul => isStr(f) && FOULS.includes(f)),
    railAfterContact: isNum(v.railAfterContact) ? v.railAfterContact : 0,
    wasBreak: v.wasBreak === true,
    reRack: v.reRack === true,
    keepsTurn: v.keepsTurn === true,
  };
}

export function parseEightBallView(view: unknown): EightBallView | null {
  if (!isRecord(view)) return null;
  const players = parsePlayers(view.players);
  const balls = parseBalls(view.balls);
  if (!players || !balls || !balls.some((b) => b.id === 0)) return null;
  if (!isNum(view.seq) || !isNum(view.shots)) return null;
  if (view.turn !== 0 && view.turn !== 1) return null;
  if (view.hand !== 'none' && view.hand !== 'kitchen' && view.hand !== 'anywhere') return null;
  let groups: Record<string, Group> | null = null;
  if (view.groups !== null && view.groups !== undefined) {
    if (!isRecord(view.groups)) return null;
    groups = {};
    for (const id of players) {
      const g = view.groups[id];
      if (g !== 'solid' && g !== 'stripe') return null;
      groups[id] = g;
    }
  }
  const last = parseShot(view.last);
  if (last === undefined) return null;
  return {
    players,
    maxShots: isNum(view.maxShots) ? view.maxShots : 120,
    balls,
    pocketed: Array.isArray(view.pocketed) ? view.pocketed.filter(isInt) : [],
    groups,
    turn: view.turn,
    hand: view.hand,
    breaking: view.breaking === true,
    shots: view.shots,
    over: view.over === true,
    winner: isStr(view.winner) ? view.winner : null,
    end: isStr(view.end) && ENDS.includes(view.end) ? (view.end as EightBallEnd) : null,
    last,
    seq: view.seq,
  };
}

// ---- who is on the table ---------------------------------------------------------------------------

export const moverOf = (v: EightBallView): string | null => (v.over ? null : v.players[v.turn]);

export const groupOfPlayer = (v: EightBallView, id: string): Group | null => v.groups?.[id] ?? null;

/** Balls of a group still on the table. */
export const groupLeft = (v: EightBallView, group: Group): number =>
  v.balls.filter((b) => eightBallGroupOf(b.id) === group).length;

/** Is this player now on the 8 (their group is assigned and all of it is down)? */
export function onEight(v: EightBallView, id: string): boolean {
  const g = groupOfPlayer(v, id);
  return g !== null && groupLeft(v, g) === 0;
}

/** The ids of the balls a player still has to pot (empty on an open table). */
export function targetBalls(v: EightBallView, id: string): number[] {
  const g = groupOfPlayer(v, id);
  if (!g) return [];
  return v.balls.filter((b) => eightBallGroupOf(b.id) === g).map((b) => b.id);
}

export const groupWord = (g: Group | null): string =>
  g === 'solid' ? 'solids' : g === 'stripe' ? 'stripes' : 'open table';

// ---- the table in metres ---------------------------------------------------------------------------

export const TABLE_L_M = EIGHT_BALL_TABLE_L / 1000;
export const TABLE_W_M = EIGHT_BALL_TABLE_W / 1000;
export const BALL_R_M = EIGHT_BALL_BALL_R / 1000;
/** One engine unit (0.1 mm) in millimetres. */
export const DMM = EIGHT_BALL_DMM;

/**
 * The engine's table (x along the long side, y across, in millimetres, origin at a corner pocket) in the
 * world: the table is centred, the head end (where the cue ball starts) is towards the camera (+z) and the
 * engine's +y is the camera's left, so what the player sees is what the engine means by "counter-clockwise".
 */
export const tableToWorld = (xMm: number, yMm: number, h = 0): V3 => [
  -(yMm - EIGHT_BALL_TABLE_W / 2) / 1000,
  h,
  (EIGHT_BALL_TABLE_L / 2 - xMm) / 1000,
];
export const worldToTable = (x: number, z: number): { x: number; y: number } => ({
  x: EIGHT_BALL_TABLE_L / 2 - z * 1000,
  y: EIGHT_BALL_TABLE_W / 2 - x * 1000,
});

export const ballWorld = (b: Ball): V3 => tableToWorld(b.x / DMM, b.y / DMM, BALL_R_M);

/** Where the cue ball may go (mm): the playing surface less a ball's radius. */
export function placeBounds(hand: Hand) {
  const lo = EIGHT_BALL_BALL_R;
  return {
    xMin: lo,
    xMax: hand === 'kitchen' ? EIGHT_BALL_HEAD_X / DMM : EIGHT_BALL_TABLE_L - lo,
    yMin: lo,
    yMax: EIGHT_BALL_TABLE_W - lo,
  };
}

/** Clamp a point on the table (mm) to where the cue ball may be placed, as integer dmm. */
export function placementFrom(xMm: number, yMm: number, hand: Hand): { x: number; y: number } {
  const b = placeBounds(hand === 'none' ? 'anywhere' : hand);
  return {
    x: Math.round(clamp(xMm, b.xMin, b.xMax) * DMM),
    y: Math.round(clamp(yMm, b.yMin, b.yMax) * DMM),
  };
}

export function placementOk(
  balls: readonly Ball[],
  place: { x: number; y: number },
  hand: Hand,
): boolean {
  if (hand === 'none') return false;
  return eightBallCanPlace(balls, place.x, place.y, hand);
}

/** The table with the cue ball moved to `place` (dmm), or as it is. */
export function ballsWithCue(
  balls: readonly Ball[],
  place: { x: number; y: number } | null,
): Ball[] {
  if (!place) return balls.map((b) => ({ ...b }));
  return balls.map((b) => (b.id === 0 ? { id: 0, x: place.x, y: place.y } : { ...b }));
}

export const cueBall = (balls: readonly Ball[]): Ball =>
  balls.find((b) => b.id === 0) ?? {
    id: 0,
    x: EIGHT_BALL_HEAD_X,
    y: (EIGHT_BALL_TABLE_W / 2) * DMM,
  };

// ---- input -----------------------------------------------------------------------------------------

export const ANGLE_MAX = EIGHT_BALL_ANGLE_MAX;
export const POWER_MAX = EIGHT_BALL_POWER_MAX;
export const SPIN_MAX = EIGHT_BALL_SPIN_MAX;
/** Angle step for the slider's buttons: half a degree, in centidegrees. */
export const ANGLE_STEP = 50;
export const POWER_STEP = 20;
export const SPIN_STEP = 10;
/** A pull shorter than this (points) is a tap, not a shot. */
export const MIN_PULL = 24;
/** The pull (points) that is full power. */
export const FULL_PULL = 150;

export const wrapAngle = (cdeg: number): number =>
  ((Math.round(cdeg) % ANGLE_MAX) + ANGLE_MAX) % ANGLE_MAX;

/** Quantise to the integers the engine takes: angle 0..35999, power 0..1000, spin inside the circle. */
export function toShot(angle: number, power: number, spinX: number, spinY: number): EightBallInput {
  let sx = clamp(Math.round(spinX), -SPIN_MAX, SPIN_MAX) || 0;
  let sy = clamp(Math.round(spinY), -SPIN_MAX, SPIN_MAX) || 0;
  const len = Math.hypot(sx, sy);
  if (len > SPIN_MAX) {
    const k = SPIN_MAX / len;
    sx = Math.trunc(sx * k) || 0;
    sy = Math.trunc(sy * k) || 0;
    // Truncation can leave the sum of squares a hair over: shrink until it fits.
    while (sx * sx + sy * sy > SPIN_MAX * SPIN_MAX) {
      sx -= Math.sign(sx);
      sy -= Math.sign(sy);
    }
  }
  return {
    angle: wrapAngle(angle),
    power: clamp(Math.round(power), 0, POWER_MAX),
    spinX: sx,
    spinY: sy,
  };
}

/** The cue angle (centidegrees, 0 = +x, counter-clockwise) that points from one table point to another (mm). */
export function angleBetween(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.hypot(dx, dy) < 12) return null;
  return wrapAngle((Math.atan2(dy, dx) * 18000) / Math.PI);
}

/** Power from how far the cue is pulled back (points). Under MIN_PULL there is no shot. */
export function powerFromPull(pullPt: number): number | null {
  if (pullPt < MIN_PULL) return null;
  return clamp(Math.round((pullPt / FULL_PULL) * POWER_MAX), 0, POWER_MAX);
}

export const angleLabel = (cdeg: number): string => `${(cdeg / 100).toFixed(1)} degrees`;
export const powerLabel = (power: number): string => `${Math.round(power / 10)} percent`;
export function spinLabel(sx: number, sy: number): string {
  if (sx === 0 && sy === 0) return 'No spin';
  const parts: string[] = [];
  if (sy > 0) parts.push('follow');
  if (sy < 0) parts.push('draw');
  if (sx > 0) parts.push('right');
  if (sx < 0) parts.push('left');
  return parts.join(' and ');
}

// ---- pockets ---------------------------------------------------------------------------------------

/** Pocket names from the player's seat (the head end of the table is nearest). */
export const POCKET_NAMES = [
  'Near right',
  'Right side',
  'Far right',
  'Near left',
  'Left side',
  'Far left',
] as const;

export const pocketName = (i: number): string => POCKET_NAMES[i] ?? 'Pocket';

export const pocketWorld = (i: number): V3 => {
  const p = EIGHT_BALL_POCKETS[i] ?? { x: 0, y: 0 };
  return tableToWorld(p.x, p.y, 0);
};

/** The pocket nearest the 8, as a starting call (mm). */
export function suggestPocket(balls: readonly Ball[]): number {
  const eight = balls.find((b) => b.id === 8);
  if (!eight) return 5;
  let best = 0;
  let bestD = Infinity;
  EIGHT_BALL_POCKETS.forEach((p, i) => {
    const d = (p.x - eight.x / DMM) ** 2 + (p.y - eight.y / DMM) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

// ---- the aim guide ---------------------------------------------------------------------------------

export type AimGuide = {
  /** mm */
  from: { x: number; y: number };
  /** Where the cue ball stops: the ghost ball against the first ball in the way, or the cushion. */
  to: { x: number; y: number };
  hitId: number | null;
  /** Unit direction (table frame) the struck ball leaves in, and a short way along it (mm). */
  objectDir: { x: number; y: number } | null;
};

/**
 * Where the cue ball goes in a straight line from `angle`: up to the first ball it would touch (the "ghost
 * ball", and the way that ball is sent) or the cushion. A guide for aiming, not a prediction: spin and the
 * cushions after the first touch are not drawn.
 */
export function aimGuide(balls: readonly Ball[], angle: number): AimGuide {
  const cue = cueBall(balls);
  const cx = cue.x / DMM;
  const cy = cue.y / DMM;
  const [s, c] = sinCosCenti(wrapAngle(angle));
  const D = 2 * EIGHT_BALL_BALL_R;
  let tHit = Infinity;
  let hitId: number | null = null;
  let hitPos = { x: 0, y: 0 };
  for (const b of balls) {
    if (b.id === 0) continue;
    const bx = b.x / DMM - cx;
    const by = b.y / DMM - cy;
    const proj = bx * c + by * s;
    if (proj <= 0) continue;
    const d2 = bx * bx + by * by - proj * proj;
    if (d2 >= D * D) continue;
    const t = proj - Math.sqrt(D * D - d2);
    if (t < tHit) {
      tHit = t;
      hitId = b.id;
      hitPos = { x: b.x / DMM, y: b.y / DMM };
    }
  }
  const lo = EIGHT_BALL_BALL_R;
  const xMax = EIGHT_BALL_TABLE_L - lo;
  const yMax = EIGHT_BALL_TABLE_W - lo;
  let tWall = Infinity;
  if (c > 1e-9) tWall = Math.min(tWall, (xMax - cx) / c);
  if (c < -1e-9) tWall = Math.min(tWall, (lo - cx) / c);
  if (s > 1e-9) tWall = Math.min(tWall, (yMax - cy) / s);
  if (s < -1e-9) tWall = Math.min(tWall, (lo - cy) / s);
  const t = Math.max(0, Math.min(tHit, tWall));
  const to = { x: cx + c * t, y: cy + s * t };
  let objectDir: AimGuide['objectDir'] = null;
  if (hitId !== null && tHit <= tWall) {
    const ox = hitPos.x - to.x;
    const oy = hitPos.y - to.y;
    const l = Math.hypot(ox, oy) || 1;
    objectDir = { x: ox / l, y: oy / l };
  } else hitId = null;
  return { from: { x: cx, y: cy }, to, hitId, objectDir };
}

// ---- plans: a shot's animation -----------------------------------------------------------------------

export type ShotPlanData = {
  /** The table before the shot (cue ball where it is struck from). */
  from: Ball[];
  /** ~30 Hz keyframes of `[id, x, y]` in dmm. */
  frames: [number, number, number][][];
  pocketed: { id: number; pocket: number }[];
};

export type ShotPlan = Plan<ShotPlanData>;

const keyOf = (pocketed: readonly { id: number; pocket: number }[]): string =>
  pocketed.map((p) => `${p.id}:${p.pocket}`).join(',');

/** The shot as simulated from a table and an input. The device's prediction and the replay both use this. */
export function planShot(from: readonly Ball[], input: EightBallInput): ShotPlan {
  const sim = simulateEightBallShot(from, input, true);
  return {
    data: { from: from.map((b) => ({ ...b })), frames: sim.trace, pocketed: sim.outcome.pocketed },
    durationMs: framesMs(sim.trace),
    key: keyOf(sim.outcome.pocketed),
  };
}

/** The server's shot replayed from its record; null when the simulation does not give the recorded result. */
export function planFromRecord(shot: EightBallShot): ShotPlan | null {
  const plan = planShot(shot.from, shot.input);
  return plan.key === keyOf(shot.pocketed) ? plan : null;
}

/** Per ball: x, y (dmm) and whether it is on the table: 3 numbers for each of the 16 ids. */
export const BALL_SLOTS = 16;

/** The picture `ms` into a shot: 48 numbers, glided between keyframes. */
export const sampleShot: Sampler<ShotPlanData> = (plan, ms) => {
  const frames = plan.data.frames;
  const out = new Array<number>(BALL_SLOTS * 3).fill(0);
  if (frames.length === 0) return out;
  const f = Math.max(0, ms) / (1000 / 30);
  const i = Math.min(Math.floor(f), frames.length - 1);
  const A = frames[i] as [number, number, number][];
  const B = frames[Math.min(i + 1, frames.length - 1)] as [number, number, number][];
  const t = Math.min(1, f - Math.floor(f));
  const nextOf = new Map<number, [number, number, number]>();
  for (const q of B) nextOf.set(q[0], q);
  for (const a of A) {
    const b = nextOf.get(a[0]);
    const k = a[0] * 3;
    out[k] = b ? a[1] + (b[1] - a[1]) * t : a[1];
    out[k + 1] = b ? a[2] + (b[2] - a[2]) * t : a[2];
    out[k + 2] = 1;
  }
  return out;
};

/** The static table as the same 48 numbers, so the scene has one way to read positions. */
export function ballsToSlots(balls: readonly Ball[]): number[] {
  const out = new Array<number>(BALL_SLOTS * 3).fill(0);
  for (const b of balls) {
    const k = b.id * 3;
    out[k] = b.x;
    out[k + 1] = b.y;
    out[k + 2] = 1;
  }
  return out;
}

// ---- colours -----------------------------------------------------------------------------------------

/** Ball colours by number (the usual set), '#F6F2EA' for the cue ball. */
export const BALL_COLORS: readonly string[] = [
  '#F6F2EA',
  '#F5C518',
  '#2457D6',
  '#E0453A',
  '#6B2FB3',
  '#FF7A1A',
  '#1E8E5A',
  '#8A2B2B',
  '#111111',
  '#F5C518',
  '#2457D6',
  '#E0453A',
  '#6B2FB3',
  '#FF7A1A',
  '#1E8E5A',
  '#8A2B2B',
];

// ---- words -------------------------------------------------------------------------------------------

export type ShotTone = 'hit' | 'miss' | 'foul';

const ballName = (id: number): string =>
  id === 0 ? 'the cue ball' : id === 8 ? 'the 8 ball' : `the ${id}`;

const FOUL_TEXT: Record<EightBallFoul, string> = {
  scratch: 'potted the cue ball',
  no_contact: 'hit nothing',
  wrong_first_contact: 'hit the wrong ball first',
  no_rail: 'no ball reached a cushion',
  bad_break: 'made an illegal break',
};

/** What the last shot did, in a sentence for the banner and the screen reader. */
export function shotCopy(
  shot: EightBallShot,
  v: EightBallView,
  myId: string | null,
  nameOf: (id: string) => string,
): { text: string; tone: ShotTone } {
  const mine = shot.by === myId;
  const who = mine ? 'You' : nameOf(shot.by);
  const foe = mine ? nameOf(otherOf(v.players, shot.by)) : 'you';
  const potted = shot.pocketed.filter((p) => p.id !== 0);
  if (v.over && v.end) {
    switch (v.end) {
      case 'eight_pocketed':
        return { text: `${who} sank the 8 ball`, tone: 'hit' };
      case 'eight_early':
        return { text: `${who} sank the 8 too early`, tone: 'foul' };
      case 'eight_wrong_pocket':
        return { text: `The 8 went in the wrong pocket`, tone: 'foul' };
      case 'eight_foul':
        return { text: `${who} fouled on the 8`, tone: 'foul' };
      case 'max_shots':
        return { text: 'Out of shots', tone: 'miss' };
    }
  }
  if (shot.reRack) return { text: 'The 8 went down on the break: re-racked', tone: 'foul' };
  if (shot.fouls.length > 0) {
    const first = shot.fouls[0] as EightBallFoul;
    const next = shot.keepsTurn
      ? ''
      : mine
        ? `. ${foe} has the cue ball in hand`
        : '. Ball in hand for you';
    return {
      text: `Foul: ${who === 'You' ? 'you' : who} ${FOUL_TEXT[first]}${next}`,
      tone: 'foul',
    };
  }
  if (potted.length > 0) {
    const names = potted.map((p) => (p.id === 8 ? '8' : String(p.id))).join(', ');
    return {
      text: `${who} potted ${potted.length === 1 ? ballName(potted[0]!.id) : `the ${names}`}`,
      tone: 'hit',
    };
  }
  return { text: mine ? 'No pot' : `${who} missed`, tone: 'miss' };
}

/** The line under the opponent's name. */
export function chipLine(v: EightBallView, myId: string | null, oppId: string): string {
  const g = groupOfPlayer(v, oppId);
  const left = g ? groupLeft(v, g) : null;
  const base = g ? `${groupWord(g)} · ${left} left` : 'Open table';
  if (v.over) return `${base} · done`;
  return `${base} · ${moverOf(v) === myId ? 'your shot' : 'shooting'}`;
}

/** What the hint under the table says. */
export function hintLine(
  v: EightBallView,
  yourTurn: boolean,
  oppName: string,
  placing: boolean,
  sliders: boolean,
): string {
  if (v.over) return 'Game over';
  if (!yourTurn) return `${oppName} is shooting`;
  if (placing)
    return v.breaking ? 'Place the cue ball behind the line' : 'Ball in hand: place the cue ball';
  return sliders
    ? 'Set the angle and power, then shoot'
    : 'Drag to aim · pull back from the cue ball to shoot';
}

export function turnStateLine(v: EightBallView, myId: string | null): string {
  if (v.over) return 'Game over';
  const me = myId ?? v.players[0];
  const g = groupOfPlayer(v, me);
  if (v.hand === 'kitchen' && v.breaking) return moverOf(v) === me ? 'Your break' : 'Their break';
  if (onEight(v, me)) return 'You are on the 8';
  return g ? `You: ${groupWord(g)} · ${groupLeft(v, g)} left` : 'Open table';
}

/** The score line on the result screen: balls left for each player. */
export function eightBallScoreLine(
  v: EightBallView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  if (!v.groups) return 'The table never closed';
  return youFirst(v.players, myId)
    .map((id) => {
      const g = v.groups?.[id];
      const left = g ? groupLeft(v, g) : 0;
      return `${id === myId ? 'You' : nameOf(id)} ${plural(left, 'ball')} left`;
    })
    .join(' · ');
}

/** How the game ended, for the results screen. */
export function endNote(
  v: EightBallView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  if (!v.over || !v.end) return null;
  const winner = v.winner ? (v.winner === myId ? 'You' : nameOf(v.winner)) : null;
  switch (v.end) {
    case 'eight_pocketed':
      return `${winner ?? 'Someone'} potted the 8 ball in the called pocket.`;
    case 'eight_early':
      return 'The 8 ball went down before its group was cleared.';
    case 'eight_wrong_pocket':
      return 'The 8 ball went in a pocket that was not called.';
    case 'eight_foul':
      return 'The 8 ball was sunk with a foul.';
    case 'max_shots':
      return `${v.maxShots} shots were played: fewer balls left wins.`;
  }
}
