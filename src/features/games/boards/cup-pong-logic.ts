import {
  CUP_PONG_AIM_MAX,
  CUP_PONG_POWER_MAX,
  cupPongCanRerack,
  cupPongEngine,
  cupPongRack,
  simulateCupPongThrow,
  type CupPongCup,
  type CupPongInput,
} from '@dyce/games';

/**
 * Cup Pong, the parts that are not drawing: reading the server's view, working out what is on the table,
 * turning a finger drag (or the sliders) into the integer input the engine takes, and the throw replay.
 * The server decides every throw; this only predicts and replays it with the same simulation.
 */

// ---- the server's view ---------------------------------------------------------------------------

export type CupPongThrow = {
  seq: number;
  by: string;
  /** What the player sent. */
  input: CupPongInput;
  /** What the server simulated (input plus the release wobble from the seeded RNG). */
  applied: CupPongInput;
  sunk: number | null;
  bounces: number;
  rimHits: number;
  endX: number;
  endZ: number;
};

export type CupPongView = {
  players: [string, string];
  ballsPerTurn: number;
  maxRounds: number;
  /** Each player's own standing cups, in the frame of whoever throws at them. */
  racks: Record<string, CupPongCup[]>;
  rerackUsed: Record<string, boolean>;
  turn: 0 | 1;
  round: number;
  ballsLeft: number;
  thrown: Record<string, number>;
  sunk: Record<string, number>;
  over: boolean;
  winner: string | null;
  last: CupPongThrow | null;
  seq: number;
};

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseCup(v: unknown): CupPongCup | null {
  if (!isRecord(v) || !isNum(v.id) || !isNum(v.x) || !isNum(v.z)) return null;
  return { id: v.id, x: v.x, z: v.z };
}

function parseInput(v: unknown): CupPongInput | null {
  if (!isRecord(v) || !isNum(v.aim) || !isNum(v.power)) return null;
  return { aim: v.aim, power: v.power };
}

function parseThrow(v: unknown): CupPongThrow | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isRecord(v)) return undefined;
  const input = parseInput(v.input);
  const applied = parseInput(v.applied);
  if (!input || !applied || !isNum(v.seq) || typeof v.by !== 'string') return undefined;
  if (v.sunk !== null && !isNum(v.sunk)) return undefined;
  return {
    seq: v.seq,
    by: v.by,
    input,
    applied,
    sunk: v.sunk === null ? null : (v.sunk as number),
    bounces: isNum(v.bounces) ? v.bounces : 0,
    rimHits: isNum(v.rimHits) ? v.rimHits : 0,
    endX: isNum(v.endX) ? v.endX : 0,
    endZ: isNum(v.endZ) ? v.endZ : 0,
  };
}

export function parseCupPongView(view: unknown): CupPongView | null {
  if (!isRecord(view)) return null;
  const { players, racks, rerackUsed, thrown, sunk } = view;
  if (!Array.isArray(players) || players.length !== 2) return null;
  if (!players.every((p) => typeof p === 'string')) return null;
  if (!isRecord(racks) || !isRecord(rerackUsed) || !isRecord(thrown) || !isRecord(sunk)) {
    return null;
  }
  if (!isNum(view.round) || !isNum(view.ballsLeft) || !isNum(view.seq)) return null;
  if (view.turn !== 0 && view.turn !== 1) return null;
  const outRacks: Record<string, CupPongCup[]> = {};
  const outRerack: Record<string, boolean> = {};
  const outThrown: Record<string, number> = {};
  const outSunk: Record<string, number> = {};
  for (const id of players as string[]) {
    const rack = racks[id];
    if (!Array.isArray(rack)) return null;
    const cups = rack.map(parseCup);
    if (cups.some((c) => c === null)) return null;
    outRacks[id] = cups as CupPongCup[];
    outRerack[id] = rerackUsed[id] === true;
    outThrown[id] = isNum(thrown[id]) ? (thrown[id] as number) : 0;
    outSunk[id] = isNum(sunk[id]) ? (sunk[id] as number) : 0;
  }
  const last = parseThrow(view.last);
  if (last === undefined) return null;
  return {
    players: players as [string, string],
    ballsPerTurn: isNum(view.ballsPerTurn) ? view.ballsPerTurn : 3,
    maxRounds: isNum(view.maxRounds) ? view.maxRounds : 12,
    racks: outRacks,
    rerackUsed: outRerack,
    turn: view.turn,
    round: view.round,
    ballsLeft: view.ballsLeft,
    thrown: outThrown,
    sunk: outSunk,
    over: view.over === true,
    winner: typeof view.winner === 'string' ? view.winner : null,
    last,
    seq: view.seq,
  };
}

// ---- who is on the table ---------------------------------------------------------------------------

/** The player whose turn it is (null once the game is over). */
export const moverOf = (v: CupPongView): string | null => (v.over ? null : v.players[v.turn]);

export const otherPlayer = (v: CupPongView, id: string): string =>
  v.players[0] === id ? v.players[1] : v.players[0];

export const cupsLeft = (v: CupPongView, id: string): number => v.racks[id]?.length ?? 0;

/** The cups you throw at on your turn, or (when the other player throws) your own, as they see them. */
export function tableOwner(v: CupPongView, myId: string | null): string {
  const mine = myId !== null && v.players.includes(myId) ? myId : v.players[0];
  const mover = moverOf(v);
  if (mover === null) {
    // finished: the table the last throw was aimed at
    return v.last ? otherPlayer(v, v.last.by) : otherPlayer(v, mine);
  }
  return mover === mine ? otherPlayer(v, mine) : mine;
}

/** Can the player re-rack right now (once a game, before their first ball of a turn, with 2 to 6 cups)? */
export function canRerack(v: CupPongView, id: string): boolean {
  if (v.over || moverOf(v) !== id || v.rerackUsed[id]) return false;
  if (v.ballsLeft !== v.ballsPerTurn) return false;
  return cupPongCanRerack(cupsLeft(v, id));
}

// ---- cup positions ---------------------------------------------------------------------------------

const spotCache = new Map<number, { x: number; z: number }[] | null>();

/**
 * Where the cups go when a rack of `n` is re-racked (null if that size can't be). Asked of the engine
 * itself so the app never holds a second copy of the shapes.
 */
export function rerackSpots(n: number): { x: number; z: number }[] | null {
  if (spotCache.has(n)) return spotCache.get(n) ?? null;
  let spots: { x: number; z: number }[] | null = null;
  if (Number.isInteger(n) && n >= 1 && n <= 10) {
    const base = cupPongEngine.init(['a', 'b'], 1n, {});
    const cups = cupPongRack().slice(0, n);
    const state = { ...base, racks: { a: cups, b: base.racks.b ?? [] } };
    const next = cupPongEngine.apply(state, 'a', { kind: 'rerack' });
    const moved = (next.racks.a ?? []).map((c) => ({ x: c.x, z: c.z }));
    const same = moved.every((c, i) => c.x === cups[i]?.x && c.z === cups[i]?.z);
    spots = same ? null : moved;
  }
  spotCache.set(n, spots);
  return spots;
}

const dist2 = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/**
 * The defender's cups as they stood BEFORE the last throw: the standing cups plus the one it sank. The
 * view only keeps the cups that are left, so the sunk cup's place is worked out: its spot in the standard
 * rack, or after a re-rack the re-rack spot nearest to where the ball dropped. Good enough to replay a
 * throw; the replay is only shown when the simulation agrees with what the server recorded.
 */
export function preThrowRack(v: CupPongView): CupPongCup[] | null {
  const last = v.last;
  if (!last) return null;
  const defender = otherPlayer(v, last.by);
  const after = v.racks[defender] ?? [];
  if (last.sunk === null) return after;
  const sunkId = last.sunk;
  let spot: { x: number; z: number } | null = null;
  if (!v.rerackUsed[defender]) {
    const std = cupPongRack().find((c) => c.id === sunkId);
    spot = std ? { x: std.x, z: std.z } : null;
  } else {
    const drop = { x: last.endX, z: last.endZ };
    let best = Infinity;
    for (let n = 1; n <= 9; n++) {
      for (const s of rerackSpots(n) ?? []) {
        const free = after.every((c) => dist2(c, s) > 80 ** 2);
        const d = dist2(s, drop);
        if (free && d < best && d <= 60 ** 2) {
          best = d;
          spot = s;
        }
      }
    }
    spot ??= drop;
  }
  if (!spot) return null;
  return [...after, { id: sunkId, x: spot.x, z: spot.z }].sort((a, b) => a.id - b.id);
}

// ---- input -----------------------------------------------------------------------------------------

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const AIM_MAX = CUP_PONG_AIM_MAX;
export const POWER_MAX = CUP_PONG_POWER_MAX;
/** Slider and button step sizes. */
export const AIM_STEP = 10;
export const POWER_STEP = 10;
/** A drag shorter than this (points) is a tap, not a throw. */
export const MIN_DRAG = 28;

/** Quantise to the integers the engine takes, inside the legal range. */
export function toInput(aim: number, power: number): CupPongInput {
  return {
    aim: clamp(Math.round(aim), -AIM_MAX, AIM_MAX) || 0,
    power: clamp(Math.round(power), 0, POWER_MAX),
  };
}

/**
 * A finger drag from the ball (dx right, dy UP, in points) becomes a throw: how far up sets the power, how
 * far sideways sets the aim. The whole board height above the ball is full power; a third of the width
 * either side is full aim. Under MIN_DRAG it is a tap and null.
 */
export function inputFromDrag(
  dx: number,
  dy: number,
  size: { width: number; height: number },
): CupPongInput | null {
  if (dy < MIN_DRAG) return null;
  const power = (dy / Math.max(1, size.height * 0.5)) * POWER_MAX;
  const aim = (dx / Math.max(1, size.width / 3)) * AIM_MAX;
  return toInput(aim, power);
}

export const stepAim = (aim: number, dir: 1 | -1, step = AIM_STEP) =>
  clamp(aim + dir * step, -AIM_MAX, AIM_MAX);
export const stepPower = (power: number, dir: 1 | -1, step = POWER_STEP) =>
  clamp(power + dir * step, 0, POWER_MAX);

/** "12 left of centre" and so on, for the sliders' spoken value. */
export function aimLabel(aim: number): string {
  if (aim === 0) return 'Centre';
  return `${Math.abs(aim)} ${aim < 0 ? 'left' : 'right'}`;
}
export const powerLabel = (power: number): string => `${Math.round(power / 10)} percent`;

// ---- replay ----------------------------------------------------------------------------------------

export const TRACE_HZ = 30;
export type Point = readonly [x: number, y: number, z: number];

export const traceMs = (trace: readonly Point[]): number =>
  Math.max(0, trace.length - 1) * (1000 / TRACE_HZ);

/** Where the ball is `ms` into a trace (millimetres, in the thrower's frame). */
export function sampleTrace(trace: readonly Point[], ms: number): Point {
  const first = trace[0];
  if (!first) return [0, 300, 150];
  const f = Math.max(0, ms) / (1000 / TRACE_HZ);
  const i = Math.floor(f);
  const a = trace[Math.min(i, trace.length - 1)] as Point;
  const b = trace[Math.min(i + 1, trace.length - 1)] as Point;
  const t = f - i;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export type Prediction = { trace: Point[]; sunk: number | null; durationMs: number };

/** The throw as the player's own device sees it: the input as sent, without the server's release wobble. */
export function predictThrow(rack: readonly CupPongCup[], input: CupPongInput): Prediction {
  const sim = simulateCupPongThrow(rack, input, true);
  return { trace: sim.trace, sunk: sim.outcome.sunk, durationMs: traceMs(sim.trace) };
}

/**
 * The throw the server recorded, replayed from its stored input. Null when the simulation of the cups we
 * could reconstruct does not give the server's result (then the app just shows the table as it is).
 */
export function replayThrow(v: CupPongView): { rack: CupPongCup[]; prediction: Prediction } | null {
  const last = v.last;
  const rack = preThrowRack(v);
  if (!last || !rack) return null;
  const sim = simulateCupPongThrow(rack, last.applied, true);
  if (sim.outcome.sunk !== last.sunk) return null;
  return {
    rack,
    prediction: { trace: sim.trace, sunk: sim.outcome.sunk, durationMs: traceMs(sim.trace) },
  };
}

// ---- words -----------------------------------------------------------------------------------------

export type ThrowTone = 'hit' | 'rim' | 'miss';

export function throwCopy(
  last: CupPongThrow,
  myId: string | null,
  nameOf: (id: string) => string,
): { text: string; tone: ThrowTone } {
  const mine = last.by === myId;
  const who = mine ? 'You' : nameOf(last.by);
  if (last.sunk !== null) {
    return {
      text: mine ? 'Splash! You sank a cup' : `${who} sank one of your cups`,
      tone: 'hit',
    };
  }
  if (last.rimHits > 0) return { text: `${who} hit the rim and it spun out`, tone: 'rim' };
  return { text: mine ? 'Missed' : `${who} missed`, tone: 'miss' };
}

/** The line under the opponent's name: whose go it is and what is left. */
export function turnLine(
  v: CupPongView,
  myId: string | null,
  oppName: string,
): { text: string; mine: boolean } {
  const mover = moverOf(v);
  if (mover === null) return { text: 'Game over', mine: false };
  if (mover === myId) {
    return {
      text: `Your throw · ${v.ballsLeft} ${v.ballsLeft === 1 ? 'ball' : 'balls'} left`,
      mine: true,
    };
  }
  return { text: `${oppName} is throwing`, mine: false };
}

/** "6 cups left" for the opponent chip. */
export const cupsLine = (n: number): string => `${n} ${n === 1 ? 'cup' : 'cups'} left`;

/** The score line on the result screen: cups sunk each. */
export function cupPongScoreLine(
  v: CupPongView,
  myId: string | null,
  nameOf: (id: string) => string,
): string {
  const order = [...v.players].sort((a, b) => (a === myId ? -1 : b === myId ? 1 : 0));
  return order
    .map(
      (id) =>
        `${id === myId ? 'You' : nameOf(id)} ${v.sunk[id] ?? 0} ${v.sunk[id] === 1 ? 'cup' : 'cups'}`,
    )
    .join(' · ');
}

// ---- what this device has already played ---------------------------------------------------------

/** Throws already shown on this device, so a replay happens once per throw and a finished game isn't held. */
const played = new Map<string, number>();

export const hasPlayed = (matchId: string, seq: number): boolean =>
  (played.get(matchId) ?? 0) >= seq;
export function markPlayed(matchId: string, seq: number): void {
  if (seq > (played.get(matchId) ?? 0)) played.set(matchId, seq);
}
/** For tests. */
export const forgetPlayed = (): void => played.clear();

/**
 * Should the board hold the result screen back for this view, so the last throw can be shown first?
 * True while a finished game's final throw has not been shown on this device.
 */
export function holdsForFinalThrow(matchId: string, v: CupPongView | null): boolean {
  return !!v && v.over && !!v.last && !hasPlayed(matchId, v.last.seq);
}
