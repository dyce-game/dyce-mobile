import {
  seaBattleEngine,
  seaBattleRandomPlacement,
  seedRng,
  type SeaBattleState,
} from '@dyce/games';
import {
  alreadyFired,
  canAct,
  canPlace,
  cellAt,
  cellStatus,
  cellWorld,
  clampPlacement,
  coordLabel,
  countsOf,
  emptyLayout,
  fireAction,
  layoutComplete,
  layoutLegal,
  moverOf,
  nextUnplaced,
  nudge,
  parseSeaBattleView,
  placeAction,
  placementCells,
  randomLayout,
  rotatePlacement,
  seaBattleScoreLine,
  shipPose,
  shotCopy,
  type Layout,
  type SeaBattleView,
} from './sea-battle-logic';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bola');

const wire = (s: SeaBattleState, viewer: string): unknown =>
  JSON.parse(JSON.stringify(seaBattleEngine.view(s, viewer)));
function viewOf(s: SeaBattleState, viewer: string): SeaBattleView {
  const v = parseSeaBattleView(wire(s, viewer));
  if (!v) throw new Error('view did not parse');
  return v;
}

// A fixed fleet: every ship on its own row, along the top, so shots are easy to aim.
const ROWS = [
  { r: 0, c: 0, dir: 'h' as const },
  { r: 1, c: 0, dir: 'h' as const },
  { r: 2, c: 0, dir: 'h' as const },
  { r: 3, c: 0, dir: 'h' as const },
  { r: 4, c: 0, dir: 'h' as const },
];

function started(): SeaBattleState {
  let s = seaBattleEngine.init([A, B], 1n, { salvo: false });
  s = seaBattleEngine.apply(s, A, { kind: 'place', ships: ROWS });
  s = seaBattleEngine.apply(s, B, { kind: 'place', ships: ROWS });
  return s;
}

describe('parseSeaBattleView', () => {
  it('reads the engine view while placing, for both viewers', () => {
    const s = seaBattleEngine.init([A, B], 1n, { salvo: false });
    const v = viewOf(s, A);
    expect(v.phase).toBe('placing');
    expect(v.players).toEqual([A, B]);
    expect(v.fleetSpec).toHaveLength(5);
    expect(v.placed).toEqual({ [A]: false, [B]: false });
    expect(v.boards[A]!.ships).toBeNull();
    expect(v.last).toBeNull();
  });

  it('never has the other fleet in the view during the battle, only your own', () => {
    const s = started();
    const v = viewOf(s, A);
    expect(v.phase).toBe('battle');
    expect(v.boards[A]!.ships).toHaveLength(5);
    expect(v.boards[B]!.ships).toBeNull();
    expect(v.shotsAllowed).toBe(1);
  });

  it('shows a sunk ship and, once the game is over, both fleets', () => {
    let s = started();
    const hunter = s.players[s.turn]!;
    const other = hunter === A ? B : A;
    // The hunter sinks the destroyer (row 4, cols 0-1); the other player then misses.
    s = seaBattleEngine.apply(s, hunter, { kind: 'fire', shots: [{ r: 4, c: 0 }] });
    s = seaBattleEngine.apply(s, other, { kind: 'fire', shots: [{ r: 9, c: 9 }] });
    s = seaBattleEngine.apply(s, hunter, { kind: 'fire', shots: [{ r: 4, c: 1 }] });
    const v = viewOf(s, hunter);
    expect(v.boards[other]!.sunk.map((x) => x.id)).toEqual(['destroyer']);
    expect(v.boards[other]!.ships).toBeNull();
    expect(v.last?.shots[0]?.result).toBe('sunk');
    const over = viewOf(seaBattleEngine.apply(s, other, { kind: 'resign' }), hunter);
    expect(over.phase).toBe('over');
    expect(over.winner).toBe(hunter);
    expect(over.boards[other]!.ships).toHaveLength(5);
  });

  it('refuses things it does not recognise', () => {
    const good = wire(started(), A) as Record<string, unknown>;
    expect(parseSeaBattleView(null)).toBeNull();
    expect(parseSeaBattleView({})).toBeNull();
    expect(parseSeaBattleView({ ...good, phase: 'lobby' })).toBeNull();
    expect(parseSeaBattleView({ ...good, size: 8 })).toBeNull();
    expect(parseSeaBattleView({ ...good, boards: {} })).toBeNull();
    expect(parseSeaBattleView({ ...good, players: [A] })).toBeNull();
    const bad = JSON.parse(JSON.stringify(good));
    bad.boards[A].shots = [{ cell: 500, result: 'hit' }];
    expect(parseSeaBattleView(bad)).toBeNull();
  });
});

describe('who moves', () => {
  it('is you until you have placed, then them, and nobody once both have', () => {
    let s = seaBattleEngine.init([A, B], 1n, { salvo: false });
    expect(moverOf(viewOf(s, A), A)).toBe(A);
    expect(moverOf(viewOf(s, A), B)).toBe(B);
    s = seaBattleEngine.apply(s, A, { kind: 'place', ships: ROWS });
    expect(moverOf(viewOf(s, A), A)).toBe(B);
    expect(moverOf(viewOf(s, B), B)).toBe(B);
    expect(canAct(viewOf(s, A), A)).toBe(false);
    expect(canAct(viewOf(s, B), B)).toBe(true);
    s = seaBattleEngine.apply(s, B, { kind: 'place', ships: ROWS });
    const v = viewOf(s, A);
    expect(moverOf(v, A)).toBe(v.turn);
    expect(canAct(v, v.turn!)).toBe(true);
    expect(canAct(v, v.turn === A ? B : A)).toBe(false);
  });

  it('is nobody when the game is over, and a spectator cannot act', () => {
    const s = seaBattleEngine.apply(started(), A, { kind: 'resign' });
    const v = viewOf(s, A);
    expect(moverOf(v, A)).toBeNull();
    expect(canAct(v, 'someone-else')).toBe(false);
    expect(canAct(v, null)).toBe(false);
  });
});

describe('coordinates', () => {
  it('labels columns A to J and rows 1 to 10', () => {
    expect(coordLabel(0)).toBe('A1');
    expect(coordLabel(34)).toBe('E4');
    expect(coordLabel(99)).toBe('J10');
  });
  it('nudges a cursor and stops at the edges', () => {
    expect(nudge(0, -1, -1)).toBe(0);
    expect(nudge(0, 1, 1)).toBe(11);
    expect(nudge(99, 1, 1)).toBe(99);
    expect(nudge(55, 0, -1)).toBe(54);
  });
  it('finds the cell under a point on the water', () => {
    expect(cellAt(0.2, 0.2)).toBe(0);
    expect(cellAt(9.9, 9.9)).toBe(99);
    expect(cellAt(10.1, 3)).toBeNull();
    expect(cellAt(-0.1, 3)).toBeNull();
    expect(cellWorld(23)).toEqual([3.5, 0, 2.5]);
  });
  it('puts a ship centre where the ship is', () => {
    expect(shipPose({ len: 5, r: 2, c: 1, dir: 'h' })).toEqual({ x: 3.5, z: 2.5, along: 'x' });
    expect(shipPose({ len: 3, r: 2, c: 1, dir: 'v' })).toEqual({ x: 1.5, z: 3.5, along: 'z' });
  });
});

describe('placing the fleet', () => {
  const spec = viewOf(seaBattleEngine.init([A, B], 1n, { salvo: false }), A).fleetSpec;

  it('lists the cells a ship covers and keeps it on the board', () => {
    expect(placementCells(3, { r: 2, c: 4, dir: 'h' })).toEqual([24, 25, 26]);
    expect(placementCells(3, { r: 2, c: 4, dir: 'v' })).toEqual([24, 34, 44]);
    expect(clampPlacement(5, { r: 0, c: 8, dir: 'h' })).toEqual({ r: 0, c: 5, dir: 'h' });
    expect(clampPlacement(5, { r: 9, c: 0, dir: 'v' })).toEqual({ r: 5, c: 0, dir: 'v' });
    expect(rotatePlacement(4, { r: 8, c: 2, dir: 'h' })).toEqual({ r: 6, c: 2, dir: 'v' });
  });

  it('refuses a ship over another ship or off the board, but lets ships touch', () => {
    const layout: Layout = emptyLayout(spec);
    layout[0] = { r: 0, c: 0, dir: 'h' };
    expect(canPlace(spec, layout, 1, { r: 0, c: 3, dir: 'v' })).toBe(false);
    expect(canPlace(spec, layout, 1, { r: 1, c: 0, dir: 'h' })).toBe(true);
    expect(canPlace(spec, layout, 1, { r: 0, c: 8, dir: 'h' })).toBe(false);
    // a placed ship may be moved onto its own cells
    expect(canPlace(spec, layout, 0, { r: 0, c: 1, dir: 'h' })).toBe(true);
  });

  it('finds the next ship to place', () => {
    const layout: Layout = emptyLayout(spec);
    expect(nextUnplaced(layout)).toBe(0);
    layout[0] = { r: 0, c: 0, dir: 'h' };
    layout[1] = { r: 1, c: 0, dir: 'h' };
    expect(nextUnplaced(layout)).toBe(2);
    expect(layoutComplete(layout)).toBe(false);
  });

  it('builds the wire action the engine accepts', () => {
    const layout: Layout = ROWS.map((p) => p);
    expect(layoutComplete(layout)).toBe(true);
    expect(layoutLegal(layout)).toBe(true);
    const action = placeAction(layout as never);
    const s = seaBattleEngine.init([A, B], 1n, { salvo: false });
    expect(seaBattleEngine.validate(s, A, action as never).ok).toBe(true);
  });

  it('shuffles into layouts the engine always accepts', () => {
    for (let seed = 0; seed < 40; seed++) {
      const layout = randomLayout(seed);
      expect(layoutLegal(layout)).toBe(true);
    }
    expect(randomLayout(1)).toEqual(randomLayout(1));
    expect(randomLayout(1)).not.toEqual(randomLayout(2));
    expect(randomLayout(3)).toEqual(seaBattleRandomPlacement(seedRng(4n)));
  });
});

describe('firing', () => {
  it('sends the row and column the engine wants, and it accepts them', () => {
    const s = started();
    const hunter = s.players[s.turn]!;
    const action = fireAction([34]);
    expect(action).toEqual({ kind: 'fire', shots: [{ r: 3, c: 4 }] });
    expect(seaBattleEngine.validate(s, hunter, action as never).ok).toBe(true);
  });

  it('knows a cell that was fired at, and counts hits and misses', () => {
    let s = started();
    const hunter = s.players[s.turn]!;
    const other = hunter === A ? B : A;
    s = seaBattleEngine.apply(s, hunter, { kind: 'fire', shots: [{ r: 0, c: 0 }] }); // carrier: hit
    s = seaBattleEngine.apply(s, other, { kind: 'fire', shots: [{ r: 9, c: 9 }] });
    s = seaBattleEngine.apply(s, hunter, { kind: 'fire', shots: [{ r: 9, c: 0 }] }); // miss
    const v = viewOf(s, hunter);
    const water = v.boards[other]!;
    expect(alreadyFired(water, 0)).toBe(true);
    expect(alreadyFired(water, 1)).toBe(false);
    expect(countsOf(water)).toEqual({ hits: 1, misses: 1, sunk: 0 });
    expect(cellStatus(water, 0)).toBe('a hit');
    expect(cellStatus(water, 90)).toBe('a miss');
    expect(cellStatus(water, 55)).toBe('open water');
  });
});

describe('words', () => {
  it('says what a shot did, from both seats', () => {
    const miss = { by: A, shots: [{ cell: 34, result: 'miss' as const, ship: null }] };
    expect(shotCopy(miss, A, nameOf)).toEqual({ text: 'You missed at E4', tone: 'miss' });
    expect(shotCopy(miss, B, nameOf).text).toBe('Ada missed at E4');
    const hit = { by: A, shots: [{ cell: 0, result: 'hit' as const, ship: null }] };
    expect(shotCopy(hit, A, nameOf)).toEqual({ text: 'You hit their ship at A1', tone: 'hit' });
    expect(shotCopy(hit, B, nameOf)).toEqual({ text: 'Ada hit your ship at A1', tone: 'foul' });
    const sunk = { by: B, shots: [{ cell: 1, result: 'sunk' as const, ship: 'cruiser' }] };
    expect(shotCopy(sunk, B, nameOf).text).toBe('Sunk! You sank their cruiser');
    expect(shotCopy(sunk, A, nameOf).text).toBe('Bola sank your cruiser');
  });

  it('gives the score line under the result', () => {
    let s = started();
    const hunter = s.players[s.turn]!;
    const other = hunter === A ? B : A;
    s = seaBattleEngine.apply(s, hunter, { kind: 'fire', shots: [{ r: 4, c: 0 }] });
    s = seaBattleEngine.apply(s, other, { kind: 'fire', shots: [{ r: 9, c: 9 }] });
    s = seaBattleEngine.apply(s, hunter, { kind: 'fire', shots: [{ r: 4, c: 1 }] });
    const v = viewOf(s, hunter);
    expect(seaBattleScoreLine(v, hunter, nameOf)).toBe(`Ships sunk: You 1 · ${nameOf(other)} 0`);
  });
});
