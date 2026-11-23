import {
  SEA_FLEET,
  SEA_SIZE,
  seaBattleCheckPlacement,
  seaBattleRandomPlacement,
  seaShipCells,
  seedRng,
} from '@dyce/games';
import { isInt, isRecord, isStr } from './r3f-common/board-utils';
import type { CameraSpec, V3 } from './r3f-common/camera-math';

/**
 * Sea Battle on the phone, the parts that are not drawing (backend ADR-035). The server's view hides the
 * other fleet: `boards[id].ships` is null for the other player's waters until a ship is sunk (it then shows
 * up in `sunk`) or the game is over. Everything here works from that view only.
 *
 * Cells are numbered `r * 10 + c`; columns are lettered A to J and rows numbered 1 to 10 for the words.
 */

export const SIZE: number = SEA_SIZE;
export type Dir = 'h' | 'v';
export type Placement = { r: number; c: number; dir: Dir };
export type Ship = { id: string; len: number; r: number; c: number; dir: Dir };
export type ShotResult = 'miss' | 'hit' | 'sunk';
export type ShotCell = { cell: number; result: ShotResult };
export type FleetSpec = { id: string; len: number };

export type Waters = {
  /** Shots fired AT these waters, with what each did. */
  shots: ShotCell[];
  /** Ships of this fleet that are sunk (always visible). */
  sunk: Ship[];
  shipsLeft: number;
  /** The whole fleet, only for the owner (or everyone once the game is over). */
  ships: Ship[] | null;
};

export type LastFire = {
  by: string;
  shots: { cell: number; result: ShotResult; ship: string | null }[];
};

export type SeaBattleView = {
  players: [string, string];
  size: number;
  salvo: boolean;
  fleetSpec: FleetSpec[];
  phase: 'placing' | 'battle' | 'over';
  /** Who fires now (battle only). */
  turn: string | null;
  shotsAllowed: number;
  placed: Record<string, boolean>;
  boards: Record<string, Waters>;
  last: LastFire | null;
  winner: string | null;
  endReason: 'sunk' | 'resign' | null;
  seq: number;
};

// ---- the server's view -----------------------------------------------------------------------------

const isDir = (v: unknown): v is Dir => v === 'h' || v === 'v';
const isResult = (v: unknown): v is ShotResult => v === 'miss' || v === 'hit' || v === 'sunk';
const inGrid = (n: unknown): n is number => isInt(n) && n >= 0 && n < SIZE * SIZE;

function parseShip(v: unknown): Ship | null {
  if (!isRecord(v) || !isStr(v.id) || !isInt(v.len) || !isInt(v.r) || !isInt(v.c) || !isDir(v.dir))
    return null;
  if (v.len < 1 || v.len > 5 || v.r < 0 || v.c < 0 || v.r >= SIZE || v.c >= SIZE) return null;
  return { id: v.id, len: v.len, r: v.r, c: v.c, dir: v.dir };
}

function parseShips(v: unknown): Ship[] | null {
  if (!Array.isArray(v)) return null;
  const out: Ship[] = [];
  for (const s of v) {
    const ship = parseShip(s);
    if (!ship) return null;
    out.push(ship);
  }
  return out;
}

function parseWaters(v: unknown): Waters | null {
  if (!isRecord(v) || !Array.isArray(v.shots) || !isInt(v.shipsLeft)) return null;
  const shots: ShotCell[] = [];
  for (const s of v.shots) {
    if (!isRecord(s) || !inGrid(s.cell) || !isResult(s.result)) return null;
    shots.push({ cell: s.cell, result: s.result });
  }
  const sunk = parseShips(v.sunk);
  if (!sunk) return null;
  let ships: Ship[] | null = null;
  if (v.ships !== null && v.ships !== undefined) {
    ships = parseShips(v.ships);
    if (!ships) return null;
  }
  return { shots, sunk, shipsLeft: v.shipsLeft, ships };
}

export function parseSeaBattleView(view: unknown): SeaBattleView | null {
  if (!isRecord(view)) return null;
  const { players, phase, boards, placed } = view;
  if (!Array.isArray(players) || players.length !== 2 || !players.every(isStr)) return null;
  const ids = [players[0] as string, players[1] as string] as [string, string];
  if (phase !== 'placing' && phase !== 'battle' && phase !== 'over') return null;
  if (view.size !== SIZE || !isInt(view.seq) || !isInt(view.shotsAllowed)) return null;
  if (!isRecord(boards) || !isRecord(placed)) return null;
  const outBoards: Record<string, Waters> = {};
  const outPlaced: Record<string, boolean> = {};
  for (const id of ids) {
    const w = parseWaters(boards[id]);
    if (!w) return null;
    outBoards[id] = w;
    outPlaced[id] = placed[id] === true;
  }
  const spec: FleetSpec[] = [];
  if (!Array.isArray(view.fleetSpec)) return null;
  for (const f of view.fleetSpec) {
    if (!isRecord(f) || !isStr(f.id) || !isInt(f.len)) return null;
    spec.push({ id: f.id, len: f.len });
  }
  if (spec.length === 0) return null;
  let last: LastFire | null = null;
  if (view.last !== null && view.last !== undefined) {
    const l = view.last;
    if (!isRecord(l) || !isStr(l.by) || !Array.isArray(l.shots)) return null;
    const shots: LastFire['shots'] = [];
    for (const s of l.shots) {
      if (!isRecord(s) || !inGrid(s.cell) || !isResult(s.result)) return null;
      shots.push({ cell: s.cell, result: s.result, ship: isStr(s.ship) ? s.ship : null });
    }
    last = { by: l.by, shots };
  }
  if (view.turn !== null && !isStr(view.turn)) return null;
  if (view.winner !== null && !isStr(view.winner)) return null;
  return {
    players: ids,
    size: SIZE,
    salvo: view.salvo === true,
    fleetSpec: spec,
    phase,
    turn: (view.turn as string | null) ?? null,
    shotsAllowed: view.shotsAllowed,
    placed: outPlaced,
    boards: outBoards,
    last,
    winner: (view.winner as string | null) ?? null,
    endReason: view.endReason === 'sunk' || view.endReason === 'resign' ? view.endReason : null,
    seq: view.seq,
  };
}

// ---- coordinates ----------------------------------------------------------------------------------

const COLS = 'ABCDEFGHIJ';
export const cellOf = (r: number, c: number): number => r * SIZE + c;
export const rowOf = (cell: number): number => Math.floor(cell / SIZE);
export const colOf = (cell: number): number => cell % SIZE;
/** "D4": the column letter and the row number, as a player says it. */
export const coordLabel = (cell: number): string => `${COLS[colOf(cell)]}${rowOf(cell) + 1}`;

/** Moves a cursor one step, stopping at the edge. */
export function nudge(cell: number, dr: number, dc: number): number {
  const r = Math.min(SIZE - 1, Math.max(0, rowOf(cell) + dr));
  const c = Math.min(SIZE - 1, Math.max(0, colOf(cell) + dc));
  return cellOf(r, c);
}

// ---- who is who ----------------------------------------------------------------------------------

export const isOver = (v: SeaBattleView): boolean => v.phase === 'over';

/** My seat's id (spectators see the first player's side). */
export const meOf = (v: SeaBattleView, myId: string | null): string =>
  myId && v.players.includes(myId) ? myId : v.players[0];
export const foeOf = (v: SeaBattleView, myId: string | null): string => {
  const me = meOf(v, myId);
  return v.players[0] === me ? v.players[1] : v.players[0];
};

/**
 * Whose move it is. While placing, both players act at once: it is yours until you have placed, then theirs
 * until they have (the entry's `mover`, so the chat card says who is being waited for).
 */
export function moverOf(v: SeaBattleView, myId: string | null): string | null {
  if (v.phase === 'over') return null;
  if (v.phase === 'battle') return v.turn;
  const me = meOf(v, myId);
  const foe = foeOf(v, myId);
  if (!v.placed[me]) return me;
  if (!v.placed[foe]) return foe;
  return null;
}

/** Can I act now? Placing: until I have placed. Battle: on my turn. */
export function canAct(v: SeaBattleView, myId: string | null): boolean {
  if (!myId || !v.players.includes(myId)) return false;
  if (v.phase === 'placing') return !v.placed[myId];
  if (v.phase === 'battle') return v.turn === myId;
  return false;
}

// ---- placing the fleet -------------------------------------------------------------------------------

/** The cells of ship `len` placed at `p`. */
export const placementCells = (len: number, p: Placement): number[] =>
  seaShipCells({ ...p, len }, SIZE);

export const fitsBoard = (len: number, p: Placement): boolean =>
  p.r >= 0 &&
  p.c >= 0 &&
  (p.dir === 'h' ? p.c + len <= SIZE && p.r < SIZE : p.r + len <= SIZE && p.c < SIZE);

/** Pulls a placement back inside the board (a ship dragged off the edge sits against it). */
export function clampPlacement(len: number, p: Placement): Placement {
  const maxR = p.dir === 'v' ? SIZE - len : SIZE - 1;
  const maxC = p.dir === 'h' ? SIZE - len : SIZE - 1;
  return { dir: p.dir, r: Math.min(maxR, Math.max(0, p.r)), c: Math.min(maxC, Math.max(0, p.c)) };
}

export const rotatePlacement = (len: number, p: Placement): Placement =>
  clampPlacement(len, { ...p, dir: p.dir === 'h' ? 'v' : 'h' });

export type Layout = (Placement | null)[];

/** Cells used by the ships in `layout`, leaving out ship `skip`. */
function takenCells(spec: readonly FleetSpec[], layout: Layout, skip: number): Set<number> {
  const taken = new Set<number>();
  layout.forEach((p, i) => {
    const s = spec[i];
    if (p && s && i !== skip) placementCells(s.len, p).forEach((c) => taken.add(c));
  });
  return taken;
}

/** Can ship `idx` go at `p`: on the board and not on top of another ship (ships may touch). */
export function canPlace(
  spec: readonly FleetSpec[],
  layout: Layout,
  idx: number,
  p: Placement,
): boolean {
  const s = spec[idx];
  if (!s || !fitsBoard(s.len, p)) return false;
  const taken = takenCells(spec, layout, idx);
  return placementCells(s.len, p).every((c) => !taken.has(c));
}

export const emptyLayout = (spec: readonly FleetSpec[]): Layout => spec.map(() => null);
export const layoutComplete = (layout: Layout): layout is Placement[] =>
  layout.length > 0 && layout.every((p) => p !== null);
export const placedCount = (layout: Layout): number => layout.filter((p) => p !== null).length;

/** The first ship still to place, or the first one if every ship is down. */
export function nextUnplaced(layout: Layout): number {
  const i = layout.findIndex((p) => p === null);
  return i < 0 ? 0 : i;
}

/** A random legal fleet from a number (a "Shuffle" press); the engine's own helper, so it is always legal. */
export function randomLayout(seed: number): Placement[] {
  return seaBattleRandomPlacement(seedRng(BigInt(Math.abs(Math.trunc(seed)) + 1)));
}

/** Does the engine accept this fleet (the server will check again). */
export function layoutLegal(layout: Layout): boolean {
  if (!layoutComplete(layout)) return false;
  return seaBattleCheckPlacement(layout).ok;
}

/** The wire action for a finished layout. */
export const placeAction = (layout: Placement[]): Record<string, unknown> => ({
  kind: 'place',
  ships: layout.map((p) => ({ r: p.r, c: p.c, dir: p.dir })),
});

export const fireAction = (cells: readonly number[]): Record<string, unknown> => ({
  kind: 'fire',
  shots: cells.map((c) => ({ r: rowOf(c), c: colOf(c) })),
});

/** Ships of a layout as `Ship`s (for drawing a fleet that is not on the server yet). */
export function layoutShips(spec: readonly FleetSpec[], layout: Layout): Ship[] {
  const out: Ship[] = [];
  layout.forEach((p, i) => {
    const s = spec[i];
    if (p && s) out.push({ id: s.id, len: s.len, ...p });
  });
  return out;
}

// ---- firing ------------------------------------------------------------------------------------------

export const shotMap = (w: Waters): Map<number, ShotResult> =>
  new Map(w.shots.map((s) => [s.cell, s.result]));

/** Has this cell been fired at already (so firing there again is refused)? */
export const alreadyFired = (w: Waters, cell: number): boolean =>
  w.shots.some((s) => s.cell === cell);

export type Counts = { hits: number; misses: number; sunk: number };
export function countsOf(w: Waters): Counts {
  let hits = 0;
  let misses = 0;
  for (const s of w.shots) {
    if (s.result === 'miss') misses++;
    else hits++;
  }
  return { hits, misses, sunk: w.sunk.length };
}

const prettyShip = (id: string): string => id.replace(/^./, (c) => c.toUpperCase());

/** What the cell under the cursor holds, for the status line and the screen reader. */
export function cellStatus(w: Waters, cell: number): string {
  const hit = w.shots.find((s) => s.cell === cell);
  if (!hit) return 'open water';
  return hit.result === 'miss' ? 'a miss' : hit.result === 'sunk' ? 'a sunk ship' : 'a hit';
}

// ---- words ---------------------------------------------------------------------------------------------

/** The line about the shot(s) just fired: "You fired at D4: a hit", "Tunde sank your cruiser!". */
export function shotCopy(
  last: LastFire,
  myId: string | null,
  nameOf: (id: string) => string,
): { text: string; tone: 'hit' | 'miss' | 'foul' } {
  const mine = last.by === myId;
  const who = mine ? 'You' : nameOf(last.by);
  const sunk = last.shots.find((s) => s.result === 'sunk');
  const owner = mine ? 'their' : 'your';
  if (sunk) {
    const ship = prettyShip(sunk.ship ?? 'ship').toLowerCase();
    return {
      text: mine ? `Sunk! You sank their ${ship}` : `${who} sank your ${ship}`,
      tone: mine ? 'hit' : 'foul',
    };
  }
  const hits = last.shots.filter((s) => s.result === 'hit').length;
  const where = last.shots.map((s) => coordLabel(s.cell)).join(', ');
  if (hits > 0) {
    return {
      text: `${who} hit ${owner} ship at ${where}`,
      tone: mine ? 'hit' : 'foul',
    };
  }
  return { text: `${who} missed at ${where}`, tone: 'miss' };
}

/** The line under the result: "Ships sunk: You 5 · Tunde 3". */
export function seaBattleScoreLine(
  view: SeaBattleView,
  myId: string | null,
  nameOf: (id: string) => string,
): string | null {
  const me = meOf(view, myId);
  const foe = foeOf(view, myId);
  const mine = view.boards[foe]?.sunk.length ?? 0;
  const theirs = view.boards[me]?.sunk.length ?? 0;
  return `Ships sunk: You ${mine} · ${nameOf(foe)} ${theirs}`;
}

/** "3 of 5 ships afloat". */
export const afloatLine = (w: Waters, total: number): string =>
  `${w.shipsLeft} of ${total} ships afloat`;

// ---- the camera and the grid in the world ------------------------------------------------------------

/** World position of a cell centre: x along the columns, z down the rows, one unit a cell. */
export const cellWorld = (cell: number, y = 0): V3 => [colOf(cell) + 0.5, y, rowOf(cell) + 0.5];

/** The cell under a point on the water, or null off the grid. */
export function cellAt(x: number, z: number): number | null {
  if (x < 0 || z < 0 || x >= SIZE || z >= SIZE) return null;
  return cellOf(Math.floor(z), Math.floor(x));
}

/** Where a ship sits: centre point and whether it lies along x. */
export function shipPose(ship: Pick<Ship, 'len' | 'r' | 'c' | 'dir'>): {
  x: number;
  z: number;
  along: 'x' | 'z';
} {
  return ship.dir === 'h'
    ? { x: ship.c + ship.len / 2, z: ship.r + 0.5, along: 'x' }
    : { x: ship.c + 0.5, z: ship.r + ship.len / 2, along: 'z' };
}

/** The isometric camera: the grid seen from a corner, as in the design (turned 38 degrees, tilted). */
export const SEA_CAMERA: CameraSpec = {
  target: [5, 0, 5],
  dir: [Math.sin(0.66) * Math.cos(0.9), Math.sin(0.9), Math.cos(0.66) * Math.cos(0.9)],
  distance: 24,
  fovDeg: 26,
  fitWidth: 15.5,
};

export const FLEET: readonly FleetSpec[] = SEA_FLEET;
