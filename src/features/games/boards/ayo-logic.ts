import { ayoEngine, type AyoState } from '@dyce/games';
import { isInt, isRecord, isStr } from './r3f-common/board-utils';
import type { CameraSpec, V3 } from './r3f-common/camera-math';

/**
 * Ayo Olopon and Mancala (Kalah) on the phone, the parts that are not drawing (backend ADR-035). One engine,
 * two rule sets chosen when the match is made (`view.variant`), so one board draws both: Ayo is two rows of
 * six pits and the winnings are counted in a tally; Kalah adds a store at each end. Nothing is hidden, so the
 * view is the whole state plus `legal` (the pits you may lift from).
 *
 * Pits are numbered round the ring: 0..5 are the first player's row, 6..11 the second player's, and pit `i`
 * faces pit `11 - i`. The board is drawn from your seat: your row along the bottom, left to right, in the order
 * you sow (counter-clockwise: along your row, up the right-hand side, back along theirs).
 */

export type Variant = 'ayo' | 'kalah';
export type Lap = { from: number; path: number[] };
export type LastSow = {
  by: string;
  pit: number;
  laps: Lap[];
  captured: number;
  capturedFrom: number | null;
  extraTurn: boolean;
};

export type AyoView = {
  players: [string, string];
  variant: Variant;
  seeds: number;
  pits: number[];
  stores: [number, number];
  turn: 0 | 1;
  plies: number;
  winner: string | null;
  draw: boolean;
  endReason: 'target' | 'out_of_seeds' | 'max_plies' | 'resign' | null;
  last: LastSow | null;
  seq: number;
  /** The pits you may lift from now (the mover's non-empty pits; none when the game is over). */
  legal: number[];
};

// ---- the server's view -----------------------------------------------------------------------------

const isCount = (v: unknown): v is number => isInt(v) && v >= 0 && v <= 96;
const isPit = (v: unknown): v is number => isInt(v) && v >= 0 && v < 12;

function parseLast(v: unknown): LastSow | null | undefined {
  if (v === null || v === undefined) return null;
  if (!isRecord(v) || !isStr(v.by) || !isPit(v.pit) || !Array.isArray(v.laps)) return undefined;
  const laps: Lap[] = [];
  for (const l of v.laps) {
    if (!isRecord(l) || !isPit(l.from) || !Array.isArray(l.path)) return undefined;
    // -1 marks "your store" in a Kalah lap.
    if (!l.path.every((p) => isPit(p) || p === -1)) return undefined;
    laps.push({ from: l.from, path: l.path as number[] });
  }
  if (!isCount(v.captured)) return undefined;
  if (v.capturedFrom !== null && !isPit(v.capturedFrom)) return undefined;
  return {
    by: v.by,
    pit: v.pit,
    laps,
    captured: v.captured,
    capturedFrom: v.capturedFrom as number | null,
    extraTurn: v.extraTurn === true,
  };
}

export function parseAyoView(view: unknown): AyoView | null {
  if (!isRecord(view)) return null;
  const { players, pits, stores, legal } = view;
  if (!Array.isArray(players) || players.length !== 2 || !players.every(isStr)) return null;
  if (view.variant !== 'ayo' && view.variant !== 'kalah') return null;
  if (!Array.isArray(pits) || pits.length !== 12 || !pits.every(isCount)) return null;
  if (!Array.isArray(stores) || stores.length !== 2 || !stores.every(isCount)) return null;
  if (view.turn !== 0 && view.turn !== 1) return null;
  if (!isInt(view.seq) || !isInt(view.plies) || !isInt(view.seeds)) return null;
  if (!Array.isArray(legal) || !legal.every(isPit)) return null;
  if (view.winner !== null && !isStr(view.winner)) return null;
  const last = parseLast(view.last);
  if (last === undefined) return null;
  const end = view.endReason;
  return {
    players: [players[0] as string, players[1] as string],
    variant: view.variant,
    seeds: view.seeds,
    pits: pits as number[],
    stores: [stores[0] as number, stores[1] as number],
    turn: view.turn,
    plies: view.plies,
    winner: (view.winner as string | null) ?? null,
    draw: view.draw === true,
    endReason:
      end === 'target' || end === 'out_of_seeds' || end === 'max_plies' || end === 'resign'
        ? end
        : null,
    last,
    seq: view.seq,
    legal: legal as number[],
  };
}

// ---- who and what ------------------------------------------------------------------------------------

export const isOver = (v: AyoView): boolean => v.winner !== null || v.draw;
export const winTarget = (v: AyoView): number => (v.seeds * 12) / 2 + 1;

/** Your seat (spectators see the first player's side). */
export function seatOf(v: AyoView, myId: string | null): 0 | 1 {
  return myId && v.players[1] === myId ? 1 : 0;
}
export const moverOf = (v: AyoView): string | null => (isOver(v) ? null : v.players[v.turn]);
export const isMyTurn = (v: AyoView, myId: string | null): boolean =>
  !!myId && !isOver(v) && v.players[v.turn] === myId;

export const pitOwner = (pit: number): 0 | 1 => (pit < 6 ? 0 : 1);
export const opposite = (pit: number): number => 11 - pit;

/** Your six pits, left to right as you see them (the order you sow along). */
export const myRow = (seat: 0 | 1): number[] => Array.from({ length: 6 }, (_, k) => seat * 6 + k);
/** Their six pits, left to right as you see them (the pit facing yours, so reversed). */
export const theirRow = (seat: 0 | 1): number[] => myRow(seat).map(opposite);

export const winningsOf = (v: AyoView, id: string): number =>
  v.stores[v.players.indexOf(id) as 0 | 1] ?? 0;

/** "You 26 · Amaka 18": what each side has won. */
export function ayoScoreLine(
  view: AyoView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const me = myId && view.players.includes(myId) ? myId : view.players[0];
  const foe = view.players[0] === me ? view.players[1] : view.players[0];
  return `You ${winningsOf(view, me)} · ${nameOf(foe)} ${winningsOf(view, foe)}`;
}

export const variantName = (v: Variant): string => (v === 'kalah' ? 'Mancala' : 'Ayo Olopon');

// ---- previewing a sow, with the engine's own rules ---------------------------------------------------

export type Prediction = {
  /** Where the last seed lands: a pit of yours, a pit of theirs, or your store (Kalah). */
  lands: 'mine' | 'theirs' | 'store';
  landPit: number | null;
  relays: number;
  captured: number;
  capturedFrom: number | null;
  extraTurn: boolean;
  next: AyoState;
};

/** What lifting `pit` would do, from the engine itself (the view is the whole state). */
export function predictSow(view: AyoView, pit: number): Prediction | null {
  if (!view.legal.includes(pit) || isOver(view)) return null;
  const by = view.players[view.turn];
  const state = { ...view, maxPlies: 400, last: view.last } as unknown as AyoState;
  const check = ayoEngine.validate(state, by, { kind: 'sow', pit });
  if (!check.ok) return null;
  const next = ayoEngine.apply(state, by, { kind: 'sow', pit });
  const last = next.last;
  if (!last) return null;
  const lastLap = last.laps[last.laps.length - 1];
  const end = lastLap?.path[lastLap.path.length - 1];
  const landPit = end === undefined || end === -1 ? null : end;
  return {
    lands:
      end === -1
        ? 'store'
        : landPit !== null && pitOwner(landPit) === view.turn
          ? 'mine'
          : 'theirs',
    landPit,
    relays: Math.max(0, last.laps.length - 1),
    captured: last.captured,
    capturedFrom: last.capturedFrom,
    extraTurn: last.extraTurn,
    next,
  };
}

const seedWord = (n: number): string => `${n} ${n === 1 ? 'seed' : 'seeds'}`;

/** "Pit 5 has 7 seeds · lands in their row, captures 3" (pit numbers are 1 to 6 along your row). */
export function sowCopy(
  view: AyoView,
  myId: string | null,
  pit: number,
  p: Prediction | null,
): string {
  const seat = seatOf(view, myId);
  const n = view.pits[pit] ?? 0;
  const head = `Pit ${pit - seat * 6 + 1} has ${seedWord(n)}`;
  if (!p) return head;
  const bits: string[] = [];
  if (p.lands === 'store') bits.push('ends in your store: go again');
  else bits.push(p.lands === 'mine' ? 'lands in your row' : 'lands in their row');
  if (p.relays > 0) bits.push(`${p.relays} ${p.relays === 1 ? 'relay' : 'relays'}`);
  if (p.captured > 0) bits.push(`captures ${p.captured}`);
  return `${head} · ${bits.join(', ')}`;
}

export const sowAction = (pit: number): Record<string, unknown> => ({ kind: 'sow', pit });

/** What happened on the last move, in a line (the banner). */
export function lastLine(
  view: AyoView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const l = view.last;
  if (!l) return null;
  const who = l.by === myId ? 'You' : nameOf(l.by);
  const seat = view.players.indexOf(l.by);
  const sown = l.laps.reduce((a, x) => a + x.path.length, 0);
  const parts = [
    `${who} sowed pit ${l.pit - seat * 6 + 1} (${sown} ${sown === 1 ? 'seed' : 'seeds'})`,
  ];
  if (l.captured > 0) parts.push(`captured ${l.captured}`);
  if (l.extraTurn) parts.push('and goes again');
  return parts.join(', ');
}

// ---- the board in the world ---------------------------------------------------------------------------

export const PIT_R = 0.42;
export const ROW_Z = 0.82;
export const BOARD_D = 3.3;
export const boardWidth = (variant: Variant): number => (variant === 'kalah' ? 8.6 : 6.9);
export const storeX = (variant: Variant): number => (variant === 'kalah' ? 3.55 : 0);

/** Which of the two stores (or capture tallies) is a seat's, as a side: yours is on the right. */
export type Slot = { kind: 'pit'; pit: number } | { kind: 'store'; seat: 0 | 1 };

/** Centre of a pit as seen from `seat`: x along the row, z towards you (positive is your side). */
export function pitXZ(pit: number, seat: 0 | 1): [number, number] {
  const mine = pitOwner(pit) === seat;
  const k = mine ? pit - seat * 6 : opposite(pit) - seat * 6;
  return [k - 2.5, mine ? ROW_Z : -ROW_Z];
}

export function storeXZ(storeSeat: 0 | 1, seat: 0 | 1, variant: Variant): [number, number] {
  const x = storeX(variant);
  return [storeSeat === seat ? x : -x, 0];
}

export function slotXZ(slot: Slot, seat: 0 | 1, variant: Variant): [number, number] {
  return slot.kind === 'pit' ? pitXZ(slot.pit, seat) : storeXZ(slot.seat, seat, variant);
}

export const pitWorld = (pit: number, seat: 0 | 1, y = 0.1): V3 => {
  const [x, z] = pitXZ(pit, seat);
  return [x, y, z];
};

/** The camera: the board from your side of the table, tilted down. */
export function ayoCamera(variant: Variant): CameraSpec {
  return {
    target: [0, 0, 0.15],
    dir: [0, Math.sin(1.0), Math.cos(1.0)],
    distance: 11,
    fovDeg: 30,
    fitWidth: boardWidth(variant) + 1.4,
  };
}

// ---- where the seeds lie ------------------------------------------------------------------------------

export type SeedPos = { x: number; y: number; z: number; tone: number };

/** The k-th seed in a pit: a sunflower spiral, so adding a seed never moves the others. */
export function seedInPit(cx: number, cz: number, k: number): SeedPos {
  const a = k * 2.399963;
  const r = Math.min(0.3, 0.075 * Math.sqrt(k + 0.6));
  return {
    x: cx + Math.cos(a) * r,
    y: 0.1 + Math.min(0.16, 0.014 * k),
    z: cz + Math.sin(a) * r * 0.9,
    tone: k,
  };
}

/** The k-th seed in a store: a grid along the store's length. */
export function seedInStore(cx: number, k: number): SeedPos {
  const col = k % 3;
  const row = Math.floor(k / 3) % 9;
  const layer = Math.floor(k / 27);
  return { x: cx + (col - 1) * 0.24, y: 0.1 + layer * 0.1, z: (row - 4) * 0.23, tone: k };
}

export type Hand = { count: number; at: Slot };
export type Fly = { from: Slot; to: Slot; t: number };
export type Display = {
  pits: number[];
  stores: [number, number];
  hand: Hand | null;
  fly: Fly | null;
};

/** Every seed on the board as a position, for the instanced mesh (pits, store piles, the seeds in the hand). */
export function layoutSeeds(d: Display, seat: 0 | 1, variant: Variant): SeedPos[] {
  const out: SeedPos[] = [];
  d.pits.forEach((n, pit) => {
    const [cx, cz] = pitXZ(pit, seat);
    for (let k = 0; k < n; k++) out.push(seedInPit(cx, cz, k));
  });
  if (variant === 'kalah') {
    ([0, 1] as const).forEach((s) => {
      const [cx] = storeXZ(s, seat, variant);
      for (let k = 0; k < d.stores[s]; k++) out.push(seedInStore(cx, k));
    });
  }
  if (d.hand) {
    const [hx, hz] = slotXZ(d.hand.at, seat, variant);
    const shown = Math.min(d.hand.count, 8);
    for (let k = 0; k < shown; k++) {
      const a = k * 2.399963;
      out.push({
        x: hx + Math.cos(a) * 0.13,
        y: 0.95 + 0.04 * k,
        z: hz + Math.sin(a) * 0.13,
        tone: k,
      });
    }
  }
  if (d.fly) {
    const [fx, fz] = slotXZ(d.fly.from, seat, variant);
    const [tx, tz] = slotXZ(d.fly.to, seat, variant);
    const t = Math.min(1, Math.max(0, d.fly.t));
    out.push({
      x: fx + (tx - fx) * t,
      y: 0.95 + 0.45 * 4 * t * (1 - t) - 0.85 * t * t,
      z: fz + (tz - fz) * t,
      tone: 3,
    });
  }
  return out;
}

// ---- the sowing animation, as a pure timeline --------------------------------------------------------

export const LIFT_MS = 340;
export const DROP_MS = 230;
export const CAPTURE_MS = 520;
/** The longest a sowing may play, however many relays it has. */
export const MAX_SOW_MS = 7000;

type Frame = {
  t0: number;
  t1: number;
  before: Display;
  after: Display;
  /** The seed in flight during this frame. */
  move: { from: Slot; to: Slot } | null;
  label: 'lift' | 'drop' | 'capture';
};
export type Timeline = { frames: Frame[]; totalMs: number; final: Display };

const copy = (d: Display): Display => ({
  pits: d.pits.slice(),
  stores: [d.stores[0], d.stores[1]],
  hand: d.hand ? { ...d.hand } : null,
  fly: null,
});

/**
 * Builds the sowing from the board before the move and the server's record of it (every lap, the capture).
 * Frames: lift the seeds, then drop them one by one (a seed flies from the hand to each pit, or to your store),
 * relay again for each further lap, then the capture. `stateAt` answers "what is on the board `ms` in".
 */
export function buildSowTimeline(
  prev: { pits: readonly number[]; stores: readonly number[] },
  last: Pick<LastSow, 'laps' | 'captured' | 'capturedFrom'>,
  variant: Variant,
  moverSeat: 0 | 1,
): Timeline {
  let cur: Display = {
    pits: prev.pits.slice(),
    stores: [prev.stores[0] ?? 0, prev.stores[1] ?? 0],
    hand: null,
    fly: null,
  };
  const frames: Frame[] = [];
  let t = 0;
  const push = (label: Frame['label'], ms: number, after: Display, move: Frame['move']) => {
    frames.push({ t0: t, t1: t + ms, before: cur, after, move, label });
    t += ms;
    cur = after;
  };

  for (const lap of last.laps) {
    // Lift: the pit empties into the hand.
    let a = copy(cur);
    const n = a.pits[lap.from] ?? 0;
    a.pits[lap.from] = 0;
    a.hand = { count: n, at: { kind: 'pit', pit: lap.from } };
    push('lift', LIFT_MS, a, null);
    for (const dest of lap.path) {
      a = copy(cur);
      const from = cur.hand!.at;
      const to: Slot =
        dest === -1 ? { kind: 'store', seat: moverSeat } : { kind: 'pit', pit: dest };
      if (to.kind === 'store') a.stores[moverSeat] += 1;
      else a.pits[to.pit] = (a.pits[to.pit] ?? 0) + 1;
      a.hand = cur.hand!.count - 1 > 0 ? { count: cur.hand!.count - 1, at: to } : null;
      push('drop', DROP_MS, a, { from, to });
    }
  }

  if (last.capturedFrom !== null && last.captured > 0) {
    const a = copy(cur);
    const lastLap = last.laps[last.laps.length - 1];
    const landed = lastLap?.path[lastLap.path.length - 1];
    a.pits[last.capturedFrom] = 0;
    if (variant === 'kalah' && landed !== undefined && landed >= 0) a.pits[landed] = 0;
    a.stores[moverSeat] += last.captured;
    push('capture', CAPTURE_MS, a, {
      from: { kind: 'pit', pit: last.capturedFrom },
      to: { kind: 'store', seat: moverSeat },
    });
  }
  // A long relay chain is shown faster rather than longer: the whole sowing takes at most MAX_SOW_MS.
  if (t > MAX_SOW_MS) {
    const k = MAX_SOW_MS / t;
    for (const f of frames) {
      f.t0 *= k;
      f.t1 *= k;
    }
    t = MAX_SOW_MS;
  }
  return { frames, totalMs: t, final: cur };
}

/** The board `ms` into a timeline (a seed mid-flight is in `fly`). Past the end it is the final board. */
export function stateAt(tl: Timeline, ms: number): Display {
  if (ms >= tl.totalMs || tl.frames.length === 0) return tl.final;
  const f = tl.frames.find((fr) => ms >= fr.t0 && ms < fr.t1) ?? tl.frames[0]!;
  const k = (ms - f.t0) / (f.t1 - f.t0);
  if (f.label === 'drop' && f.move) {
    // The seed is still in the air: the hand has one fewer, the pit has not grown yet.
    const d = copy(f.before);
    const left = (f.before.hand?.count ?? 1) - 1;
    d.hand = left > 0 && f.before.hand ? { count: left, at: f.before.hand.at } : null;
    d.fly = { from: f.move.from, to: f.move.to, t: k };
    return d;
  }
  if (f.label === 'capture') {
    // Seeds leave the captured pit as one flight; the pit and the store change at the end.
    const d = copy(f.before);
    d.fly = f.move ? { from: f.move.from, to: f.move.to, t: k } : null;
    return d;
  }
  return copy(f.before);
}
