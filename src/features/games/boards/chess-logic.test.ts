import { chessEngine, type ChessState } from '@dyce/games';
import {
  barCopy,
  capturedPieces,
  chessScoreLine,
  describeSquare,
  indexOf,
  kingIndex,
  listedMoves,
  movableSquares,
  moveAction,
  parseChessView,
  predictMove,
  promotionChoices,
  sideOf,
  squareOf,
  targetsFrom,
  visualOrder,
  type ChessView,
} from './chess-logic';

const A = 'user-a';
const B = 'user-b';

const wireOf = (state: ChessState, viewer = A): unknown =>
  JSON.parse(JSON.stringify(chessEngine.view(state, viewer)));

/** The engine's own view, as the server would send it (through JSON, as it travels). */
function viewOf(state: ChessState, viewer = A): ChessView {
  const parsed = parseChessView(wireOf(state, viewer));
  if (!parsed) throw new Error('view did not parse');
  return parsed;
}

function play(moves: [string, string][], fen?: string): ChessState {
  let s = chessEngine.init([A, B], 1n, fen ? { fen } : {});
  for (const [from, to] of moves) {
    const by = s.players[s.turn]!;
    const action = moveAction(from, to);
    const v = chessEngine.validate(s, by, action);
    if (!v.ok) throw new Error(`illegal ${from}${to}: ${v.code}`);
    s = chessEngine.apply(s, by, action);
  }
  return s;
}

const nameOf = (id: string) => (id === A ? 'Ada' : 'Bola');
const fresh = () => chessEngine.init([A, B], 1n, {});

describe('parseChessView', () => {
  it('reads the engine view of the start position', () => {
    const v = viewOf(fresh());
    expect(v.players).toEqual([A, B]);
    expect(v.board).toHaveLength(64);
    expect(v.legal).toHaveLength(20);
    expect(v.last).toBeNull();
    expect(v.endReason).toBeNull();
  });

  it('keeps the last move and the end reason', () => {
    const s = play([
      ['f2', 'f3'],
      ['e7', 'e5'],
      ['g2', 'g4'],
      ['d8', 'h4'],
    ]);
    const v = viewOf(s);
    expect(v.winner).toBe(B);
    expect(v.endReason).toBe('checkmate');
    expect(v.last?.san).toBe('Qh4#');
    expect(v.legal).toEqual([]);
  });

  it('refuses anything it does not recognise', () => {
    const good = wireOf(fresh()) as Record<string, unknown>;
    expect(parseChessView(null)).toBeNull();
    expect(parseChessView('x')).toBeNull();
    expect(parseChessView({})).toBeNull();
    expect(parseChessView({ ...good, board: 'short' })).toBeNull();
    expect(parseChessView({ ...good, board: 'x'.repeat(64) })).toBeNull();
    expect(parseChessView({ ...good, turn: 2 })).toBeNull();
    expect(parseChessView({ ...good, players: [A] })).toBeNull();
    expect(parseChessView({ ...good, legal: [{ from: 'z9', to: 'e4' }] })).toBeNull();
    expect(
      parseChessView({ ...good, legal: [{ from: 'e2', to: 'e4', promotion: 'k' }] }),
    ).toBeNull();
    expect(parseChessView({ ...good, endReason: 'boredom' })).toBeNull();
  });
});

describe('squares and sides', () => {
  it('draws your side at the bottom', () => {
    const v = viewOf(fresh());
    expect(sideOf(v, A)).toBe('w');
    expect(sideOf(v, B)).toBe('b');
    expect(sideOf(v, null)).toBe('w');
    expect(squareOf(visualOrder('w')[0]!)).toBe('a8');
    expect(squareOf(visualOrder('b')[0]!)).toBe('h1');
    expect(new Set(visualOrder('b')).size).toBe(64);
  });

  it('names squares both ways', () => {
    expect(squareOf(indexOf('e4'))).toBe('e4');
    expect(indexOf('a8')).toBe(0);
    expect(indexOf('h1')).toBe(63);
  });

  it('describes a square for a screen reader', () => {
    const v = viewOf(fresh());
    expect(describeSquare(v.board, indexOf('e2'))).toBe('e2, white pawn');
    expect(describeSquare(v.board, indexOf('d8'))).toBe('d8, black queen');
    expect(describeSquare(v.board, indexOf('e4'))).toBe('e4, empty');
  });
});

describe('legal moves from the view', () => {
  const v = viewOf(fresh());

  it('lists where a pawn and a knight can go', () => {
    expect(
      targetsFrom(v, 'e2')
        .map((t) => t.to)
        .sort(),
    ).toEqual(['e3', 'e4']);
    expect(
      targetsFrom(v, 'g1')
        .map((t) => t.to)
        .sort(),
    ).toEqual(['f3', 'h3']);
    expect(targetsFrom(v, 'a1')).toEqual([]);
  });

  it('knows which pieces can move', () => {
    const m = movableSquares(v);
    expect(m.has('e2')).toBe(true);
    expect(m.has('a1')).toBe(false);
    expect(m.size).toBe(10);
  });

  it('marks captures, including en passant', () => {
    const s = play([
      ['e2', 'e4'],
      ['a7', 'a6'],
      ['e4', 'e5'],
      ['d7', 'd5'],
    ]);
    const t = targetsFrom(viewOf(s), 'e5');
    expect(t.find((x) => x.to === 'd6')?.capture).toBe(true);
    expect(t.find((x) => x.to === 'e6')?.capture).toBe(false);
  });

  it('asks for a promotion piece and lists the four', () => {
    const view = viewOf(chessEngine.init([A, B], 1n, { fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' }));
    expect(targetsFrom(view, 'a7')).toEqual([{ to: 'a8', promotes: true, capture: false }]);
    expect(promotionChoices(view, 'a7', 'a8').sort()).toEqual(['b', 'n', 'q', 'r']);
    expect(listedMoves(view).filter((m) => m.from === 'a7')).toHaveLength(1);
  });

  it('lists each from/to once with a label', () => {
    const rows = listedMoves(v);
    expect(rows).toHaveLength(20);
    expect(rows.some((r) => r.label === 'Pawn e2 to e4')).toBe(true);
  });

  it('says what a capture is in words', () => {
    const view = viewOf(
      play([
        ['e2', 'e4'],
        ['d7', 'd5'],
      ]),
    );
    expect(listedMoves(view).some((r) => r.label === 'Pawn e4 to d5, takes pawn')).toBe(true);
  });
});

describe('captured pieces', () => {
  it('is empty at the start', () => {
    expect(capturedPieces(viewOf(fresh()).board)).toEqual({ white: [], black: [], lead: 0 });
  });

  it('counts what is missing', () => {
    const s = play([
      ['e2', 'e4'],
      ['d7', 'd5'],
      ['e4', 'd5'],
      ['d8', 'd5'],
    ]);
    const c = capturedPieces(viewOf(s).board);
    expect(c.white).toEqual(['p']);
    expect(c.black).toEqual(['p']);
    expect(c.lead).toBe(0);
  });

  it('shows a lead', () => {
    const board = viewOf(fresh()).board.replace('R', '.'); // White has lost the a1 rook
    const c = capturedPieces(board);
    expect(c.black).toEqual(['r']);
    expect(c.lead).toBe(-5);
  });
});

describe('predictMove', () => {
  it('plays the engine move on a copy', () => {
    const p = predictMove(viewOf(fresh()), 'e2', 'e4')!;
    expect(p.board[indexOf('e4')]).toBe('P');
    expect(p.board[indexOf('e2')]).toBe('.');
    expect(p.last).toEqual({ from: 'e2', to: 'e4' });
    expect(p.check).toBe(false);
  });

  it('handles castling and promotion like the engine', () => {
    const castle = viewOf(
      chessEngine.init([A, B], 1n, { fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' }),
    );
    const p = predictMove(castle, 'e1', 'g1')!;
    expect(p.board[indexOf('g1')]).toBe('K');
    expect(p.board[indexOf('f1')]).toBe('R');
    const promo = viewOf(chessEngine.init([A, B], 1n, { fen: '8/P6k/8/8/8/8/8/K7 w - - 0 1' }));
    expect(predictMove(promo, 'a7', 'a8', 'q')!.board[indexOf('a8')]).toBe('Q');
    expect(predictMove(promo, 'a7', 'a8')).toBeNull();
  });

  it('refuses a move that is not legal', () => {
    const v = viewOf(fresh());
    expect(predictMove(v, 'e2', 'e5')).toBeNull();
    expect(predictMove(v, 'e7', 'e5')).toBeNull();
  });

  it('flags a check', () => {
    const s = play([
      ['e2', 'e4'],
      ['f7', 'f6'],
    ]);
    expect(predictMove(viewOf(s), 'd1', 'h5')!.check).toBe(true);
  });

  it('finds the kings', () => {
    const v = viewOf(fresh());
    expect(squareOf(kingIndex(v.board, 'w'))).toBe('e1');
    expect(squareOf(kingIndex(v.board, 'b'))).toBe('e8');
  });
});

describe('words', () => {
  const start = viewOf(fresh());

  it('says whose move it is', () => {
    expect(barCopy(start, A, 'Bola', true, null, 0).title).toBe('Your move · white');
    expect(barCopy(start, B, 'Ada', false, null, 0).title).toBe("Ada's move");
  });

  it('says what is selected', () => {
    const c = barCopy(start, A, 'Bola', true, 'g1', 2);
    expect(c.title).toBe('Knight g1 selected');
    expect(c.subtitle).toBe('2 moves');
  });

  it('warns about a check', () => {
    const s = play([
      ['e2', 'e4'],
      ['f7', 'f6'],
      ['d1', 'h5'],
    ]);
    expect(barCopy(viewOf(s, B), B, 'Ada', true, null, 0).subtitle).toMatch(/check/i);
  });

  it('writes the result line', () => {
    expect(chessScoreLine(start, A, nameOf)).toBeNull();
    const mate = viewOf(
      play([
        ['f2', 'f3'],
        ['e7', 'e5'],
        ['g2', 'g4'],
        ['d8', 'h4'],
      ]),
    );
    expect(chessScoreLine(mate, B, nameOf)).toBe('You won by checkmate · 2 moves');
    expect(chessScoreLine(mate, A, nameOf)).toBe('Bola won by checkmate · 2 moves');
  });

  it('writes draws and resignations', () => {
    const stale = chessEngine.init([A, B], 1n, { fen: '7k/5Q2/6K1/8/8/8/8/8 b - - 0 1' });
    expect(stale.draw).toBe(true);
    expect(chessScoreLine(viewOf(stale), A, nameOf)).toMatch(/^Draw · stalemate/);
    const resigned = chessEngine.apply(fresh(), A, { kind: 'resign' });
    expect(chessScoreLine(viewOf(resigned), B, nameOf)).toBe('You won by resignation');
    expect(barCopy(viewOf(resigned), A, 'Bola', false, null, 0).title).toBe('Bola won');
  });
});
