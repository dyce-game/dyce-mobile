import { wordTilesEngine, wordTilesWordSet, type WordTilesState } from '@dyce/games';
import {
  SIZE,
  bagLine,
  blankNeedingLetter,
  canExchange,
  cellAtPoint,
  endingLine,
  fitCell,
  idx,
  lastMoveLine,
  lastTiles,
  lettersAt,
  parseWordTilesView,
  pendingAt,
  placeTile,
  playErrorMessage,
  premiumAt,
  premiumLabel,
  previewLine,
  previewPlay,
  removeAt,
  resultReason,
  scrollFor,
  setBlank,
  squareLabel,
  syncOrder,
  tileValue,
  toggleIn,
  toTiles,
  waitingLine,
  wordTilesScoreLine,
  ZOOM_CELL,
  type Pending,
  type WordTilesView,
} from './word-tiles-logic';

const A = 'user-a';
const B = 'user-b';
const EMPTY = new Array<string>(SIZE * SIZE).fill('');

function game(): WordTilesState {
  return wordTilesEngine.init([A, B], 7n, {});
}

function view(s: WordTilesState, viewer: string): WordTilesView {
  const v = parseWordTilesView(wordTilesEngine.view(s, viewer));
  if (!v) throw new Error('view did not parse');
  return v;
}

/** The first board: A has the rack we choose. */
function withRack(rack: string[]): WordTilesState {
  const s = game();
  return { ...s, racks: { ...s.racks, [A]: rack } };
}

const put = (cells: string[], word: string, r: number, c: number, across = true): string[] => {
  const out = [...cells];
  word.split('').forEach((ch, i) => {
    out[idx(across ? r : r + i, across ? c + i : c)] = ch;
  });
  return out;
};

describe('parseWordTilesView', () => {
  it('reads the engine view: your rack, the bag, no other racks', () => {
    const v = view(game(), A);
    expect(v.players).toEqual([A, B]);
    expect(v.board).toHaveLength(225);
    expect(v.rack).toHaveLength(7);
    expect(v.racks).toBeNull();
    expect(v.turn).toBe(A);
    expect(v.bagCount).toBe(102 - 14);
    expect(v.rackCounts).toEqual({ [A]: 7, [B]: 7 });
    expect(v.last).toBeNull();
    expect(v.over).toBe(false);
  });

  it('reads the last move after a play', () => {
    const s = withRack(['C', 'A', 'T', 'S', 'E', 'N', 'D']);
    const next = wordTilesEngine.apply(s, A, {
      kind: 'play',
      tiles: [
        { r: 7, c: 6, letter: 'C' },
        { r: 7, c: 7, letter: 'A' },
        { r: 7, c: 8, letter: 'T' },
      ],
    });
    const v = view(next, B);
    expect(v.turn).toBe(B);
    expect(v.last?.kind).toBe('play');
    expect(v.last?.words[0]?.word).toBe('CAT');
    expect(v.board[idx(7, 7)]).toBe('A');
    expect(v.scores[A]).toBeGreaterThan(0);
    expect(lastTiles(v).size).toBe(3);
  });

  it('reads a pass and an exchange', () => {
    const s = game();
    const passed = view(wordTilesEngine.apply(s, A, { kind: 'pass' }), B);
    expect(passed.last?.kind).toBe('pass');
    const swapped = view(
      wordTilesEngine.apply(s, A, { kind: 'exchange', letters: [s.racks[A]![0]!] }),
      B,
    );
    expect(swapped.last?.kind).toBe('exchange');
    expect(swapped.last?.exchanged).toBe(1);
    expect(lastTiles(swapped).size).toBe(0);
  });

  it('shows every rack once the game is over, and a spectator no rack', () => {
    let s = game();
    for (let i = 0; i < 4; i++) {
      s = wordTilesEngine.apply(s, s.players[s.turn]!, { kind: 'pass' });
    }
    const v = view(s, A);
    expect(v.over).toBe(true);
    expect(v.endReason).toBe('passes');
    expect(v.turn).toBeNull();
    expect(v.racks?.[B]).toHaveLength(7);
    const spec = parseWordTilesView(wordTilesEngine.view(game(), 'spectator'));
    expect(spec?.rack).toBeNull();
  });

  it('rejects anything it does not recognise', () => {
    const good = wordTilesEngine.view(game(), A) as Record<string, unknown>;
    expect(parseWordTilesView(null)).toBeNull();
    expect(parseWordTilesView({})).toBeNull();
    expect(parseWordTilesView({ ...good, board: ['A'] })).toBeNull();
    expect(parseWordTilesView({ ...good, board: new Array(225).fill('1') })).toBeNull();
    expect(parseWordTilesView({ ...good, rack: ['A', 'a'] })).toBeNull();
    expect(parseWordTilesView({ ...good, turn: 'someone-else' })).toBeNull();
    expect(parseWordTilesView({ ...good, last: { seq: 'x' } })).toBeNull();
    expect(parseWordTilesView({ ...good, scores: { [A]: 'x' } })).toBeNull();
  });
});

describe('squares', () => {
  it('knows the premium layout and prints it', () => {
    expect(premiumAt(7, 7)).toBe('DW');
    expect(premiumLabel('DW', 7, 7)).toBe('★');
    expect(premiumLabel('TW', 0, 3)).toBe('3W');
    expect(premiumLabel('TL', 3, 6)).toBe('3L');
    expect(premiumLabel('DL', 2, 2)).toBe('2L');
    expect(premiumLabel(null, 5, 5)).toBe('');
  });

  it('labels squares for a screen reader', () => {
    expect(squareLabel(7, 7, '', null)).toContain('centre star');
    expect(squareLabel(0, 3, '', null)).toContain('triple word');
    expect(squareLabel(1, 1, 'J', null)).toBe('Row 2, column 2, tile J');
    expect(squareLabel(1, 1, 'j', null)).toContain('blank');
    expect(squareLabel(2, 2, '', 'K')).toContain('your tile K');
  });

  it('prints tile values from the engine (blank = 0)', () => {
    expect(tileValue('K')).toBe(4);
    expect(tileValue('E')).toBe(1);
    expect(tileValue('Z')).toBe(8);
    expect(tileValue('?')).toBe(0);
    expect(tileValue('a')).toBe(0);
    expect(tileValue('')).toBe(0);
  });
});

describe('placing tiles', () => {
  const rack = ['C', 'A', 'T', '?', 'E', 'N', 'D'];

  it('puts a tile on an empty square and moves it when placed again', () => {
    const one = placeTile([], EMPTY, rack, 0, 7, 7)!;
    expect(one).toEqual([{ rackIdx: 0, r: 7, c: 7, letter: 'C' }]);
    const moved = placeTile(one, EMPTY, rack, 0, 7, 8)!;
    expect(moved).toEqual([{ rackIdx: 0, r: 7, c: 8, letter: 'C' }]);
  });

  it('sends the old tile back when another is dropped on it', () => {
    const one = placeTile([], EMPTY, rack, 0, 7, 7)!;
    const swapped = placeTile(one, EMPTY, rack, 1, 7, 7)!;
    expect(swapped.map((p) => p.rackIdx)).toEqual([1]);
  });

  it('refuses taken and off-board squares and unknown rack tiles', () => {
    const board = put(EMPTY, 'HI', 7, 7);
    expect(placeTile([], board, rack, 0, 7, 7)).toBeNull();
    expect(placeTile([], EMPTY, rack, 0, -1, 0)).toBeNull();
    expect(placeTile([], EMPTY, rack, 0, 0, 15)).toBeNull();
    expect(placeTile([], EMPTY, rack, 9, 7, 7)).toBeNull();
  });

  it('takes tiles back and finds them', () => {
    const p = placeTile(placeTile([], EMPTY, rack, 0, 7, 7)!, EMPTY, rack, 1, 7, 8)!;
    expect(pendingAt(p, 7, 8)?.rackIdx).toBe(1);
    expect(removeAt(p, 7, 7)).toHaveLength(1);
    expect(pendingAt(removeAt(p, 7, 8), 7, 8)).toBeUndefined();
  });

  it('holds a blank until it is given a letter', () => {
    const p = placeTile([], EMPTY, rack, 3, 7, 7)!;
    expect(p[0]?.letter).toBe('');
    expect(blankNeedingLetter(rack, p)).toEqual(p[0]);
    expect(toTiles(rack, p)).toBeNull();
    const named = setBlank(p, 7, 7, 'S');
    expect(blankNeedingLetter(rack, named)).toBeNull();
    expect(toTiles(rack, named)).toEqual([{ r: 7, c: 7, letter: 'S', blank: true }]);
  });
});

describe('previewPlay (the engine’s own rules and scoring)', () => {
  const rack = ['C', 'A', 'T', 'S', 'E', 'N', 'D'];
  const pendingWord = (letters: [number, number, number][]): Pending[] =>
    letters.map(([rackIdx, r, c]) => ({ rackIdx, r, c, letter: rack[rackIdx]! }));

  it('says nothing for an empty table', () => {
    expect(previewPlay(EMPTY, rack, [], wordTilesWordSet)).toEqual({ kind: 'empty' });
  });

  it('scores a good first word and writes the line', () => {
    const p = previewPlay(
      EMPTY,
      rack,
      pendingWord([
        [0, 7, 6],
        [1, 7, 7],
        [2, 7, 8],
      ]),
      wordTilesWordSet,
    );
    expect(p.kind).toBe('ok');
    if (p.kind === 'ok') {
      expect(p.words.map((w) => w.word)).toEqual(['CAT']);
      // C 2 + A 1 + T 1, the centre square doubles the word: (2 + 1 + 1) * 2.
      expect(p.score).toBe(8);
      expect(previewLine(p)).toBe('CAT · 8 pts');
    }
  });

  it('matches the engine exactly (same score the server will give)', () => {
    const s = withRack(rack);
    const tiles = [
      { r: 7, c: 6, letter: 'C' },
      { r: 7, c: 7, letter: 'A' },
      { r: 7, c: 8, letter: 'T' },
    ];
    const next = wordTilesEngine.apply(s, A, { kind: 'play', tiles });
    const p = previewPlay(
      EMPTY,
      rack,
      pendingWord([
        [0, 7, 6],
        [1, 7, 7],
        [2, 7, 8],
      ]),
      wordTilesWordSet,
    );
    expect(p.kind === 'ok' && p.score).toBe(next.scores[A]);
  });

  it('gives the dictionary rejection message with the word', () => {
    const bad: Pending[] = [
      { rackIdx: 0, r: 7, c: 7, letter: 'C' },
      { rackIdx: 1, r: 7, c: 8, letter: 'A' },
      { rackIdx: 4, r: 7, c: 9, letter: 'E' },
    ];
    const p = previewPlay(EMPTY, rack, bad, wordTilesWordSet);
    expect(p).toMatchObject({ kind: 'error', code: 'invalid_word', invalid: ['CAE'] });
    expect(p.kind === 'error' && p.message).toBe('“CAE” isn’t in the word list');
  });

  it('explains structural mistakes', () => {
    const off: Pending[] = [
      { rackIdx: 0, r: 7, c: 7, letter: 'C' },
      { rackIdx: 1, r: 8, c: 8, letter: 'A' },
    ];
    expect(previewPlay(EMPTY, rack, off, wordTilesWordSet)).toMatchObject({ code: 'not_in_line' });
    const gap: Pending[] = [
      { rackIdx: 0, r: 7, c: 7, letter: 'C' },
      { rackIdx: 1, r: 7, c: 9, letter: 'A' },
    ];
    expect(previewPlay(EMPTY, rack, gap, wordTilesWordSet)).toMatchObject({ code: 'gap' });
    const away: Pending[] = [
      { rackIdx: 0, r: 0, c: 0, letter: 'C' },
      { rackIdx: 1, r: 0, c: 1, letter: 'A' },
    ];
    expect(previewPlay(EMPTY, rack, away, wordTilesWordSet)).toMatchObject({
      code: 'must_cover_center',
    });
    const board = put(EMPTY, 'CAT', 7, 6);
    const lonely: Pending[] = [
      { rackIdx: 3, r: 0, c: 0, letter: 'S' },
      { rackIdx: 4, r: 0, c: 1, letter: 'E' },
    ];
    expect(previewPlay(board, rack, lonely, wordTilesWordSet)).toMatchObject({
      code: 'not_connected',
    });
  });

  it('asks for the blank’s letter before it can score', () => {
    const r = ['?', 'A', 'T'];
    const pending: Pending[] = [
      { rackIdx: 0, r: 7, c: 6, letter: '' },
      { rackIdx: 1, r: 7, c: 7, letter: 'A' },
      { rackIdx: 2, r: 7, c: 8, letter: 'T' },
    ];
    expect(previewPlay(EMPTY, r, pending, wordTilesWordSet)).toEqual({ kind: 'blank' });
    const named = setBlank(pending, 7, 6, 'C');
    const p = previewPlay(EMPTY, r, named, wordTilesWordSet);
    // A blank is worth 0: (0 + 1 + 1) * 2.
    expect(p.kind === 'ok' && p.score).toBe(4);
  });

  it('writes messages for every engine code', () => {
    for (const code of [
      'invalid_word',
      'not_in_line',
      'gap',
      'must_cover_center',
      'first_word_too_short',
      'not_connected',
      'no_word',
      'tiles_not_in_rack',
      'square_taken',
      'whatever',
    ]) {
      expect(playErrorMessage(code, ['XQ'])).toBeTruthy();
    }
    expect(playErrorMessage('invalid_word', ['AB', 'CD'])).toContain('aren’t');
  });
});

describe('the rack', () => {
  it('keeps your order while the rack is the same size and resets for a new one', () => {
    expect(syncOrder([2, 0, 1], 3)).toEqual([2, 0, 1]);
    expect(syncOrder([2, 0, 1], 4)).toEqual([0, 1, 2, 3]);
    expect(syncOrder([2, 2, 1], 3)).toEqual([0, 1, 2]);
    expect(syncOrder([], 0)).toEqual([]);
  });

  it('picks tiles for an exchange', () => {
    expect(toggleIn([], 2)).toEqual([2]);
    expect(toggleIn([2, 4], 2)).toEqual([4]);
    expect(lettersAt(['A', 'B', '?'], [2, 0])).toEqual(['?', 'A']);
  });

  it('allows an exchange only while the bag holds a full rack', () => {
    const v = view(game(), A);
    expect(canExchange(v)).toBe(true);
    expect(canExchange({ ...v, bagCount: 6 })).toBe(false);
    expect(canExchange({ ...v, bagCount: 7 })).toBe(true);
  });
});

describe('zoom', () => {
  it('fits the whole board in the width, and zoomed is the 44pt target', () => {
    expect(fitCell(330)).toBe(22);
    expect(fitCell(100)).toBe(12);
    expect(ZOOM_CELL).toBe(44);
  });

  it('scrolls to centre a square, clamped to the board', () => {
    const total = ZOOM_CELL * SIZE;
    expect(scrollFor(0, 0, ZOOM_CELL, 360, 400)).toEqual({ x: 0, y: 0 });
    expect(scrollFor(14, 14, ZOOM_CELL, 360, 400)).toEqual({ x: total - 360, y: total - 400 });
    const mid = scrollFor(7, 7, ZOOM_CELL, 360, 400);
    expect(mid.x).toBeCloseTo(7.5 * 44 - 180);
    expect(mid.y).toBeCloseTo(7.5 * 44 - 200);
    expect(scrollFor(3, 3, ZOOM_CELL, 5000, 5000)).toEqual({ x: 0, y: 0 });
  });

  it('finds the square under a point', () => {
    expect(cellAtPoint(0, 0, 22)).toEqual({ r: 0, c: 0 });
    expect(cellAtPoint(23, 45, 22)).toEqual({ r: 2, c: 1 });
    expect(cellAtPoint(329, 329, 22)).toEqual({ r: 14, c: 14 });
    expect(cellAtPoint(330, 0, 22)).toBeNull();
    expect(cellAtPoint(-1, 5, 22)).toBeNull();
    expect(cellAtPoint(5, 5, 0)).toBeNull();
  });
});

describe('lines of text', () => {
  const name = (id: string) => (id === B ? 'Zainab' : id);

  it('writes the score line with you first', () => {
    const v = { ...view(game(), A), scores: { [A]: 148, [B]: 131 } };
    expect(wordTilesScoreLine(v, A, name)).toBe('You 148 · Zainab 131');
    expect(wordTilesScoreLine(v, B, name)).toBe('You 131 · user-a 148');
  });

  it('says what the last move was', () => {
    const s = withRack(['C', 'A', 'T', 'S', 'E', 'N', 'D']);
    const played = view(
      wordTilesEngine.apply(s, A, {
        kind: 'play',
        tiles: [
          { r: 7, c: 6, letter: 'C' },
          { r: 7, c: 7, letter: 'A' },
          { r: 7, c: 8, letter: 'T' },
        ],
      }),
      B,
    );
    expect(lastMoveLine(played, B, name)).toBe('user-a played CAT for 8');
    expect(lastMoveLine(played, A, name)).toBe('You played CAT for 8');
    const passed = view(wordTilesEngine.apply(game(), A, { kind: 'pass' }), B);
    expect(lastMoveLine(passed, B, name)).toBe('user-a passed');
    const g = game();
    const swapped = view(
      wordTilesEngine.apply(g, A, { kind: 'exchange', letters: g.racks[A]!.slice(0, 3) }),
      B,
    );
    expect(lastMoveLine(swapped, B, name)).toBe('user-a swapped 3 tiles');
    expect(lastMoveLine(view(game(), A), A, name)).toBeNull();
  });

  it('describes the bag, the wait and the ending', () => {
    expect(bagLine(0)).toBe('The bag is empty');
    expect(bagLine(1)).toBe('1 tile left in the bag');
    expect(bagLine(60)).toBe('60 tiles left in the bag');
    const v = view(game(), A);
    expect(waitingLine(v, name)).toBe('Waiting for user-a');
    expect(waitingLine({ ...v, turn: null }, name)).toBe('Game over');
    expect(endingLine({ ...v, scoreless: 0 }, 2)).toBeNull();
    expect(endingLine({ ...v, scoreless: 3 }, 2)).toBe('Game ends if 1 more turn is passed');
    expect(endingLine({ ...v, scoreless: 2 }, 2)).toBe('Game ends if 2 more turns are passed');
    expect(endingLine({ ...v, scoreless: 1 }, 2)).toBeNull();
  });

  it('says why the game ended', () => {
    const v = view(game(), A);
    expect(resultReason(v, name, A)).toBeNull();
    expect(resultReason({ ...v, over: true, endReason: 'passes' }, name, A)).toBe(
      'Everyone passed',
    );
    expect(resultReason({ ...v, over: true, endReason: 'out', wentOut: B }, name, A)).toBe(
      'Zainab used every tile',
    );
    expect(resultReason({ ...v, over: true, endReason: 'out', wentOut: A }, name, A)).toBe(
      'You used every tile',
    );
  });
});
