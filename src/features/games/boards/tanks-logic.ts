import {
  TANKS_ANGLE_MAX,
  TANKS_COL_W,
  TANKS_POWER_MAX,
  TANKS_WEAPONS,
  TANKS_WORLD_H,
  TANKS_WORLD_W,
  simulateTanksShot,
  tanksCarve,
  tanksTankCentre,
  type TanksImpact,
  type TanksWeapon,
} from '@dyce/games';
import { createSeenLog, intArray, isInt, isRec, isStr, strArray, type Rec } from './arcade-parse';

/**
 * Pure logic for the Tanks board: the parser for the server's view, aim and power (the drag and the step
 * buttons), the shot the board predicts with the shared simulation and plays back from its traces, replaying
 * the other player's shot, and the lines of text. No React in here, so it is unit tested. The server runs the
 * same simulation and its answer is final.
 */

export type Pt = { x: number; y: number };
export type Weapon = TanksWeapon;
export const WEAPONS: readonly Weapon[] = ['shell', 'heavy', 'triple'];

export type LastShot = {
  seq: number;
  by: string;
  angle: number;
  power: number;
  weapon: Weapon;
  /** The wind it was fired in. */
  wind: number;
  impacts: TanksImpact[];
};

export type TanksView = {
  players: [string, string];
  /** 200 column heights, 4 world units wide; the ground after the last shot. */
  terrain: number[];
  tankCols: [number, number];
  hp: [number, number];
  ammo: Record<string, { heavy: number; triple: number }>;
  /** Wind for the turn in progress, -10..10 (positive pushes right). */
  wind: number;
  turn: 0 | 1;
  shots: [number, number];
  maxShots: number;
  over: boolean;
  winner: string | null;
  last: LastShot | null;
  seq: number;
};

const pair = (v: unknown): [number, number] | null => {
  const a = intArray(v);
  return a && a.length === 2 ? [a[0] as number, a[1] as number] : null;
};

function parseImpact(v: unknown): TanksImpact | null {
  if (!isRec(v)) return null;
  const { kind, x, y, damage } = v;
  if (kind !== 'ground' && kind !== 'tank' && kind !== 'out') return null;
  const d = pair(damage);
  if (!isInt(x) || !isInt(y) || !d) return null;
  return { kind, x, y, damage: d };
}

function parseLast(v: unknown): LastShot | null {
  if (!isRec(v)) return null;
  const { seq, by, angle, power, weapon, wind, impacts } = v;
  if (!isInt(seq) || !isStr(by) || !isInt(angle) || !isInt(power) || !isInt(wind)) return null;
  if (weapon !== 'shell' && weapon !== 'heavy' && weapon !== 'triple') return null;
  if (!Array.isArray(impacts)) return null;
  const out: TanksImpact[] = [];
  for (const i of impacts) {
    const p = parseImpact(i);
    if (!p) return null;
    out.push(p);
  }
  return { seq, by, angle, power, weapon, wind, impacts: out };
}

export function parseTanksView(view: unknown): TanksView | null {
  if (!isRec(view)) return null;
  const v: Rec = view;
  const pl = strArray(v.players);
  if (!pl || pl.length !== 2) return null;
  const terrain = intArray(v.terrain);
  if (!terrain || terrain.length !== TANKS_WORLD_W / TANKS_COL_W) return null;
  const tankCols = pair(v.tankCols);
  const hp = pair(v.hp);
  const shots = pair(v.shots);
  if (!tankCols || !hp || !shots) return null;
  if (tankCols.some((c) => c < 0 || c >= terrain.length)) return null;
  if (!isRec(v.ammo)) return null;
  const ammo: Record<string, { heavy: number; triple: number }> = {};
  for (const id of pl) {
    const a = v.ammo[id];
    if (!isRec(a) || !isInt(a.heavy) || !isInt(a.triple)) return null;
    ammo[id] = { heavy: a.heavy, triple: a.triple };
  }
  if (!isInt(v.wind) || !isInt(v.maxShots) || !isInt(v.seq)) return null;
  if (v.turn !== 0 && v.turn !== 1) return null;
  let last: LastShot | null = null;
  if (v.last !== null && v.last !== undefined) {
    last = parseLast(v.last);
    if (!last) return null;
  }
  return {
    players: [pl[0] as string, pl[1] as string],
    terrain,
    tankCols,
    hp,
    ammo,
    wind: v.wind,
    turn: v.turn,
    shots,
    maxShots: v.maxShots,
    over: v.over === true,
    winner: isStr(v.winner) ? v.winner : null,
    last,
    seq: v.seq,
  };
}

export const myIndex = (view: TanksView, myId: string | null): 0 | 1 =>
  view.players[1] === myId ? 1 : 0;

/** "You 62 hp · Ada 0 hp" */
export function tanksScoreLine(
  view: TanksView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const mine = myIndex(view, myId);
  const other = mine === 0 ? 1 : 0;
  return `You ${view.hp[mine]} hp · ${nameOf(view.players[other])} ${view.hp[other]} hp`;
}

// ---- aim and power --------------------------------------------------------------------------------------------

export const POWER_MAX = TANKS_POWER_MAX;
export const ANGLE_MAX = TANKS_ANGLE_MAX;
export const clampAngle = (a: number): number => Math.max(0, Math.min(ANGLE_MAX, Math.round(a)));
export const clampPower = (p: number): number => Math.max(1, Math.min(POWER_MAX, Math.round(p)));

/** Sensible start: aim up and toward the other tank. */
export const defaultAim = (view: TanksView, index: 0 | 1): { angle: number; power: number } => ({
  angle: view.tankCols[index] < view.tankCols[index === 0 ? 1 : 0] ? 45 : 135,
  power: 60,
});

/**
 * Drag from the tank to aim: the barrel points at the finger, the distance is the power. `from` and `to` are
 * in world units (y up). Pointing below the horizon counts as flat (0 or 180).
 */
export function dragToAim(
  from: Pt,
  to: Pt,
  fullUnits = 260,
): { angle: number; power: number } | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 14) return null;
  let deg = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right, 90 = up
  if (deg < 0) deg = dx >= 0 ? 0 : 180;
  return { angle: clampAngle(deg), power: clampPower((len / fullUnits) * POWER_MAX) };
}

/** The tip of the barrel (world units) for the picture. */
export function barrelTip(centre: Pt, angle: number, length = 26): Pt {
  const a = (angle * Math.PI) / 180;
  return { x: centre.x + Math.cos(a) * length, y: centre.y + Math.sin(a) * length };
}

// The guide below is only a hint: a no-wind, no-ground parabola with the same gravity and speed as the engine.
const GRAVITY = 100;
const SPEED_PER_POWER = 3;

/**
 * A short dotted arc to show roughly where a shot is headed (no wind, no ground). The wind is shown
 * separately and the engine flies the real shot, so this is a guide and never a prediction.
 */
export function guideArc(from: Pt, angle: number, power: number, points = 9, stepSec = 0.09): Pt[] {
  const a = (angle * Math.PI) / 180;
  const speed = clampPower(power) * SPEED_PER_POWER;
  const vx = Math.cos(a) * speed;
  const vy = Math.sin(a) * speed;
  const out: Pt[] = [];
  for (let i = 1; i <= points; i++) {
    const t = i * stepSec;
    out.push({ x: from.x + vx * t, y: from.y + vy * t - 0.5 * GRAVITY * t * t });
  }
  return out;
}

// ---- weapons and ammo -----------------------------------------------------------------------------------------

export const weaponName = (w: Weapon): string =>
  w === 'shell' ? 'Shell' : w === 'heavy' ? 'Big shot' : 'Triple';

/** How many of a weapon a player has left (null = unlimited). */
export function ammoLeft(view: TanksView, id: string, w: Weapon): number | null {
  return w === 'shell' ? null : (view.ammo[id]?.[w] ?? 0);
}

export const weaponLabel = (view: TanksView, id: string, w: Weapon): string => {
  const n = ammoLeft(view, id, w);
  return n === null ? weaponName(w) : `${weaponName(w)} · ${n} left`;
};

export const weaponInfo = (w: Weapon): string => {
  const s = TANKS_WEAPONS[w];
  return `${s.shells > 1 ? `${s.shells} small shells` : 'One shell'}, up to ${s.damage} damage, blast ${s.radius}`;
};

// ---- planning and playing a shot ------------------------------------------------------------------------------

export type Plan = {
  traces: [number, number][][];
  impacts: TanksImpact[];
  terrain: number[];
  hp: [number, number];
};

/** Fly a shot with the shared simulation from the state the board shows now. */
export function planShot(
  view: TanksView,
  shooter: 0 | 1,
  weapon: Weapon,
  angle: number,
  power: number,
): Plan {
  const sim = simulateTanksShot(
    view.terrain,
    view.tankCols,
    view.hp,
    shooter,
    view.wind,
    weapon,
    angle,
    power,
    true,
  );
  return { traces: sim.traces, impacts: sim.impacts, terrain: sim.terrain, hp: sim.hp };
}

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * The other player's last shot, when this device never saw the ground before it (the app was closed, or
 * opened on this game): fly the same input over the ground as it is now and cut each shell's path at its
 * recorded impact. The craters only removed ground, so the shell is in the same place until it lands.
 */
export function replayFromResult(view: TanksView): [number, number][][] | null {
  const last = view.last;
  if (!last) return null;
  const shooter = view.players[0] === last.by ? 0 : 1;
  const sim = simulateTanksShot(
    view.terrain,
    view.tankCols,
    [Math.max(1, view.hp[0]), Math.max(1, view.hp[1])],
    shooter,
    last.wind,
    last.weapon,
    last.angle,
    last.power,
    true,
  );
  return last.impacts.map((imp, i) => {
    const trace = sim.traces[i] ?? [];
    const at: Pt = { x: imp.x, y: imp.y };
    if (imp.kind === 'out') return trace;
    let cut = trace.length - 1;
    let best = Infinity;
    for (let k = 0; k < trace.length; k++) {
      const p = trace[k] as [number, number];
      const d = dist({ x: p[0], y: p[1] }, at);
      if (d < best) {
        best = d;
        cut = k;
      }
      if (d < 6) break;
    }
    return [...trace.slice(0, cut), [imp.x, imp.y] as [number, number]];
  });
}

/** The simulation keeps a keyframe every 4 steps of 1/120 s: 30 a second. */
export const TRACE_HZ = 30;
export const PAUSE_MS = 280;

export type Timeline = { starts: number[]; ends: number[]; total: number };

/** When each shell starts and lands, one after the other, with a short pause between. */
export function timeline(traces: readonly (readonly unknown[])[]): Timeline {
  const starts: number[] = [];
  const ends: number[] = [];
  let t = 0;
  for (const tr of traces) {
    const dur = Math.max(1, tr.length - 1) * (1000 / TRACE_HZ);
    starts.push(t);
    ends.push(t + dur);
    t += dur + PAUSE_MS;
  }
  return { starts, ends, total: Math.max(0, t - PAUSE_MS) };
}

/**
 * The state of the animation `ms` in: how many shells have landed, and where the shell in the air is
 * (null between shells and at the end).
 */
export function frameAt(
  traces: readonly (readonly (readonly [number, number])[])[],
  tl: Timeline,
  ms: number,
): { landed: number; pos: Pt | null; shell: number } {
  let landed = 0;
  let pos: Pt | null = null;
  let shell = 0;
  for (let i = 0; i < traces.length; i++) {
    const tr = traces[i] as readonly (readonly [number, number])[];
    if (ms >= (tl.ends[i] as number)) {
      landed = i + 1;
      shell = i;
    } else if (ms >= (tl.starts[i] as number)) {
      const f = ((ms - (tl.starts[i] as number)) / 1000) * TRACE_HZ;
      const k = Math.min(Math.floor(f), tr.length - 1);
      const a = tr[k] as readonly [number, number];
      const b = tr[Math.min(k + 1, tr.length - 1)] as readonly [number, number];
      const t = Math.min(1, f - k);
      pos = { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
      shell = i;
      break;
    }
  }
  return { landed, pos, shell };
}

/** The ground after the first `landed` shells of a shot have landed (craters appear as shells land). */
export function terrainAfter(
  pre: readonly number[],
  weapon: Weapon,
  impacts: readonly TanksImpact[],
  landed: number,
): number[] {
  let ground = pre.slice();
  const radius = TANKS_WEAPONS[weapon].radius;
  for (let i = 0; i < Math.min(landed, impacts.length); i++) {
    const imp = impacts[i] as TanksImpact;
    if (imp.kind !== 'out') ground = tanksCarve(ground, imp.x, imp.y, radius);
  }
  return ground;
}

/** Health after the first `landed` shells have landed. */
export function hpAfter(
  pre: readonly [number, number],
  impacts: readonly TanksImpact[],
  landed: number,
): [number, number] {
  const out: [number, number] = [pre[0], pre[1]];
  for (let i = 0; i < Math.min(landed, impacts.length); i++) {
    const imp = impacts[i] as TanksImpact;
    out[0] -= imp.damage[0];
    out[1] -= imp.damage[1];
  }
  return out;
}

/** Do two plans agree on where the shells landed and what they did (the server's impacts vs ours)? */
export const sameImpacts = (a: readonly TanksImpact[], b: readonly TanksImpact[]): boolean =>
  a.length === b.length &&
  a.every(
    (x, i) =>
      x.kind === b[i]?.kind &&
      x.x === b[i]?.x &&
      x.y === b[i]?.y &&
      x.damage[0] === b[i]?.damage[0] &&
      x.damage[1] === b[i]?.damage[1],
  );

// ---- drawing helpers --------------------------------------------------------------------------------------------

/** World y (up) to screen y (down) in a 500 high world. */
export const flipY = (y: number): number => TANKS_WORLD_H - y;

/** The ground as the points of a closed polygon (screen coordinates in world units). */
export function terrainPoints(terrain: readonly number[]): string {
  const pts = terrain.map((h, c) => `${c * TANKS_COL_W + TANKS_COL_W / 2},${flipY(h)}`);
  return [
    `0,${TANKS_WORLD_H}`,
    `0,${flipY(terrain[0] ?? 0)}`,
    ...pts,
    `${TANKS_WORLD_W},${flipY(terrain[terrain.length - 1] ?? 0)}`,
    `${TANKS_WORLD_W},${TANKS_WORLD_H}`,
  ].join(' ');
}

/** A tank's centre in world units (y up). */
export const tankAt = (view: TanksView, index: 0 | 1, terrain = view.terrain): Pt =>
  tanksTankCentre(terrain, view.tankCols[index]);

export const hpColor = (hp: number): string =>
  hp > 50 ? '#2BB673' : hp > 25 ? '#E3A93B' : '#E0455E';

// ---- lines of text ------------------------------------------------------------------------------------------------

/** "Wind ← 7", "Wind → 3", "No wind". */
export const windLabel = (wind: number): string =>
  wind === 0 ? 'No wind' : `Wind ${wind < 0 ? '←' : '→'} ${Math.abs(wind)}`;

export const windSpoken = (wind: number): string =>
  wind === 0
    ? 'No wind'
    : `Wind blowing ${wind < 0 ? 'left' : 'right'}, strength ${Math.abs(wind)} of 10`;

/** "Shot 3 of 12" for the shot you are about to take. */
export const shotLine = (view: TanksView, index: 0 | 1): string =>
  `Shot ${Math.min(view.shots[index] + 1, view.maxShots)} of ${view.maxShots}`;

/** "You hit Ada for 40", "Ada missed", "Ada hurt themselves for 10". */
export function lastShotLine(
  view: TanksView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const l = view.last;
  if (!l) return null;
  const shooter = view.players[0] === l.by ? 0 : 1;
  const target = shooter === 0 ? 1 : 0;
  const total: [number, number] = [0, 0];
  for (const i of l.impacts) {
    total[0] += i.damage[0];
    total[1] += i.damage[1];
  }
  const who = l.by === myId ? 'You' : nameOf(l.by);
  const them = view.players[target] === myId ? 'you' : nameOf(view.players[target] as string);
  if (total[target] > 0) {
    return `${who} hit ${them} for ${total[target]}${total[shooter] > 0 ? ` and hurt ${l.by === myId ? 'yourself' : 'themselves'} for ${total[shooter]}` : ''}`;
  }
  if (total[shooter] > 0) {
    return `${who} hurt ${l.by === myId ? 'yourself' : 'themselves'} for ${total[shooter]}`;
  }
  return l.impacts.every((i) => i.kind === 'out') ? `${who} missed the whole map` : `${who} missed`;
}

/** Floating text for a damaged tank: "-40". */
export const damageText = (d: number): string => (d > 0 ? `-${d}` : '');

// ---- holding the result until the last shot has landed ------------------------------------------------------

export const tanksSeen = createSeenLog();

/** True while a finished game's final shot has not been shown on this device. */
export const holdsForFinalShot = (matchId: string, v: TanksView | null): boolean =>
  !!v && v.over && !!v.last && !tanksSeen.has(matchId, v.last.seq);
