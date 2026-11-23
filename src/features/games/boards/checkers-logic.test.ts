import { checkersEngine, type CheckersState } from '@dyce/games';
import {
  barCopy,
  candidates,
  checkersScoreLine,
  completeMove,
  describeSquare,
  jumpedSoFar,
  moveAction,
  movablePieces,
  mustJump,
  mySeat,
  nextSquares,
  parseCheckersView,
  pathLabel,
  pieceCounts,
  predictMove,
  squareName,
  visualOrder,
  type CheckersView,
} from './checkers-logic';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bola');

const wireOf = (s: CheckersState): unknown => JSON.parse(JSON.stringify(checkersEngine.view(s, A)));
function viewOf(s: CheckersState): CheckersView {
  const v = parseCheckersView(wireOf(s));
  if (!v) throw new Error('view did not parse');
  return v;
}
const fresh = () => checkersEngine.init([A, B], 1n, {});

/** A position set up by hand: `rows` are 8 strings of 8 characters (row 0 = top). */
function position(rows: string[], turn: 0 | 1 = 0): CheckersState {
  return { ...fresh(), board: rows.join(''), turn };
}
const sq = (name: string): number => 'abcdefgh'.indexOf(name[0]!) + (8 - Number(name[1])) * 8;

describe('parseCheckersView', () => {
  it('reads the engine view of the start position', () => {
    const v = viewOf(fresh());
    expect(v.board).toHaveLength(64);
    expect(v.legal).toHaveLength(7); // seven opening moves
    expect(v.last).toBeNull();
    expect(pieceCounts(v.board)).toEqual([12, 12]);
  });

  it('keeps the last move after one is played', () => {
    const s0 = fresh();
    const m = checkersEngine.view(s0, A) as unknown as CheckersView;
    const s1 = checkersEngine.apply(s0, A, moveAction(m.legal[0]!.path));
    const v = viewOf(s1);
    expect(v.last?.path).toEqual(m.legal[0]!.path);
    expect(v.turn).toBe(1);
  });

  it('refuses anything it does not recognise', () => {
    const good = wireOf(fresh()) as Record<string, unknown>;
    expect(parseCheckersView(null)).toBeNull();
    expect(parseCheckersView([])).toBeNull();
    expect(parseCheckersView({ ...good, board: 'abc' })).toBeNull();
    expect(parseCheckersView({ ...good, board: 'z'.repeat(64) })).toBeNull();
    expect(parseCheckersView({ ...good, turn: 3 })).toBeNull();
    expect(parseCheckersView({ ...good, legal: [{ path: [1], captured: [] }] })).toBeNull();
    expect(parseCheckersView({ ...good, legal: [{ path: [1, 99], captured: [] }] })).toBeNull();
    expect(parseCheckersView({ ...good, endReason: 'tired' })).toBeNull();
  });
});

describe('squares', () => {
  it('turns the board round for the second player', () => {
    const v = viewOf(fresh());
    expect(mySeat(v, A)).toBe(0);
    expect(mySeat(v, B)).toBe(1);
    expect(mySeat(v, null)).toBeNull();
    expect(visualOrder(0)[0]).toBe(0);
    expect(visualOrder(1)[0]).toBe(63);
    expect(new Set(visualOrder(1)).size).toBe(64);
  });

  it('names squares from the first player', () => {
    expect(squareName(sq('a1'))).toBe('a1');
    expect(squareName(56)).toBe('a1');
    expect(squareName(7)).toBe('h8');
  });

  it('describes a square', () => {
    const v = viewOf(fresh());
    expect(describeSquare(v.board, sq('b2'), 0)).toBe('b2, your red piece');
    expect(describeSquare(v.board, sq('b2'), 1)).toBe('b2, their red piece');
    expect(describeSquare(v.board, sq('a3'), null)).toBe('a3, red piece');
    expect(describeSquare(v.board, sq('d4'), 0)).toBe('d4, empty');
  });
});

describe('building a move', () => {
  // A red man on c3 can jump d4 to e5, then f6 to g7.
  const double = position([
    '........',
    '........',
    '.....b..', // row 2: f6 is col 5
    '........',
    '...b....', // row 4: d4
    '..a.....', // row 5: c3
    '........',
    '........',
  ]);
  const v = viewOf(double);

  it('forces a jump and offers only the pieces that can jump', () => {
    expect(mustJump(v)).toBe(true);
    expect([...movablePieces(v)]).toEqual([sq('c3')]);
  });

  it('walks a double jump one landing at a time', () => {
    const start = [sq('c3')];
    expect(nextSquares(v, start)).toEqual([sq('e5')]);
    const mid = [sq('c3'), sq('e5')];
    expect(completeMove(v, mid)).toBeUndefined();
    expect(nextSquares(v, mid)).toEqual([sq('g7')]);
    expect(jumpedSoFar(v, mid)).toEqual([sq('d4')]);
    const full = [sq('c3'), sq('e5'), sq('g7')];
    expect(completeMove(v, full)?.captured).toEqual([sq('d4'), sq('f6')]);
    expect(candidates(v, full)).toHaveLength(1);
  });

  it('offers every plain step when nothing can jump', () => {
    const s = viewOf(fresh());
    expect(mustJump(s)).toBe(false);
    expect(movablePieces(s).size).toBe(4);
    const from = s.legal[0]!.path[0]!;
    expect(nextSquares(s, [from]).length).toBeGreaterThan(0);
    expect(completeMove(s, s.legal[0]!.path)).toBeDefined();
  });

  it('branches when a piece can jump two ways', () => {
    const fork = viewOf(
      position([
        '........',
        '........',
        '........',
        '........',
        '...b.b..', // d4, f4
        '....a...', // e3
        '........',
        '........',
      ]),
    );
    const start = [sq('e3')];
    expect(nextSquares(fork, start).sort()).toEqual([sq('c5'), sq('g5')].sort());
    expect(completeMove(fork, [sq('e3'), sq('c5')])?.captured).toEqual([sq('d4')]);
    expect(completeMove(fork, [sq('e3'), sq('g5')])?.captured).toEqual([sq('f4')]);
  });
});

describe('predictMove', () => {
  it('plays the engine move on a copy', () => {
    const s = fresh();
    const v = viewOf(s);
    const path = v.legal[0]!.path;
    const p = predictMove(v, path)!;
    expect(p.board[path[0]!]).toBe('.');
    expect(p.board[path[1]!]).toBe('a');
    expect(p.last.path).toEqual(path);
  });

  it('crowns on the far row', () => {
    const crown = viewOf(
      position([
        '........',
        '..a.....', // c7: red man one step from the king row
        '........',
        '........',
        '........',
        '........',
        '........',
        '......b.',
      ]),
    );
    const move = crown.legal.find((m) => m.path[1] === sq('b8') || m.path[1] === sq('d8'))!;
    const p = predictMove(crown, move.path)!;
    expect(p.board[move.path[1]!]).toBe('A');
  });

  it('refuses a move that is not legal', () => {
    const v = viewOf(fresh());
    expect(predictMove(v, [0, 1])).toBeNull();
    expect(predictMove(v, [sq('a3'), sq('d6')])).toBeNull();
  });
});

describe('words', () => {
  const v = viewOf(fresh());

  it('says whose turn it is', () => {
    expect(barCopy(v, A, 'Bola', true, []).title).toBe('Your turn');
    expect(barCopy(v, B, 'Ada', false, []).title).toBe("Ada's turn");
  });

  it('announces a forced jump and a multi-jump', () => {
    const double = viewOf(
      position([
        '........',
        '........',
        '.....b..',
        '........',
        '...b....',
        '..a.....',
        '........',
        '........',
      ]),
    );
    const c = barCopy(double, A, 'Bola', true, []);
    expect(c.title).toBe('Your turn · multi-jump available');
    expect(c.subtitle).toMatch(/forced/);
    expect(barCopy(double, A, 'Bola', true, [sq('c3')]).title).toMatch(/c3 selected/);
    expect(barCopy(double, A, 'Bola', true, [sq('c3'), sq('e5'), sq('g7')]).title).toMatch(
      /Move ready/,
    );
  });

  it('writes a path for a screen reader', () => {
    expect(pathLabel([sq('c3'), sq('e5'), sq('g7')], 2)).toBe('c3 to e5 to g7, jumps 2 pieces');
    expect(pathLabel([sq('c3'), sq('d4')])).toBe('c3 to d4');
  });

  it('writes the result line', () => {
    expect(checkersScoreLine(v, A, nameOf)).toBeNull();
    const win: CheckersState = {
      ...fresh(),
      board: position([
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '........',
        '.a......',
      ]).board,
      winner: A,
      endReason: 'no_moves',
    };
    expect(checkersScoreLine(viewOf(win), A, nameOf)).toBe('You won · You 1 · Bola 0 pieces left');
    expect(checkersScoreLine(viewOf(win), B, nameOf)).toBe('Ada won · Ada 1 · You 0 pieces left');
    const resigned = checkersEngine.apply(fresh(), A, { kind: 'resign' });
    expect(checkersScoreLine(viewOf(resigned), B, nameOf)).toMatch(/^You won by resignation/);
    const draw: CheckersState = { ...fresh(), draw: true, endReason: 'repetition' };
    expect(checkersScoreLine(viewOf(draw), A, nameOf)).toMatch(/^Draw/);
  });
});
