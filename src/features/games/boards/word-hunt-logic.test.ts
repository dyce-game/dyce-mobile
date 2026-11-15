import type { WordHuntView } from '../games-logic';
import {
  addFound,
  adjacent,
  beatLine,
  cellAtPoint,
  cellCenter,
  cellLabel,
  extendPath,
  formatClock,
  inDictionary,
  missedWords,
  opponentLine,
  parseSavedRound,
  pointsLabel,
  previewOf,
  remainingMs,
  spokenClock,
  tapStep,
  totalScore,
  wordOf,
} from './word-hunt-logic';

/**
 * The grid, row by row (indices 0-15):
 *   S U Y A
 *   J O L F
 *   M E D I
 *   R T N K
 */
const BOARD = 'SUYAJOLFMEDIRTNK'.split('');

describe('adjacent', () => {
  it('is true for sideways and diagonal neighbours only', () => {
    expect(adjacent(0, 1)).toBe(true);
    expect(adjacent(0, 4)).toBe(true);
    expect(adjacent(0, 5)).toBe(true);
    expect(adjacent(5, 10)).toBe(true);
    expect(adjacent(0, 2)).toBe(false);
    expect(adjacent(0, 10)).toBe(false);
    expect(adjacent(3, 4)).toBe(false); // end of one row, start of the next
    expect(adjacent(7, 7)).toBe(false);
  });
});

describe('extendPath (dragging)', () => {
  it('starts, extends to touching cells, and ignores the rest', () => {
    expect(extendPath([], 5)).toEqual([5]);
    expect(extendPath([5], 6)).toEqual([5, 6]);
    expect(extendPath([5, 6], 15)).toEqual([5, 6]); // not touching 6
    expect(extendPath([5, 6], 6)).toEqual([5, 6]); // still on the last one
    expect(extendPath([5, 6, 7], 5)).toEqual([5, 6, 7]); // a letter is used once
  });

  it('un-picks the last letter when you slide back onto the one before it', () => {
    expect(extendPath([0, 1, 2], 1)).toEqual([0, 1]);
    expect(extendPath([0, 1], 0)).toEqual([0]);
  });

  it('never returns the array it was given', () => {
    const p = [1, 2];
    expect(extendPath(p, 2)).not.toBe(p);
  });
});

describe('tapStep (tapping letters in order)', () => {
  it('adds a touching letter, takes back the last, and restarts elsewhere', () => {
    expect(tapStep([], 0)).toEqual([0]);
    expect(tapStep([0], 1)).toEqual([0, 1]);
    expect(tapStep([0, 1], 1)).toEqual([0]);
    expect(tapStep([0, 1], 0)).toEqual([0]); // the one before the last also steps back
    expect(tapStep([0, 1], 15)).toEqual([15]);
    expect(tapStep([0, 1, 2], 0)).toEqual([0, 1, 2]); // a letter used further back does nothing
  });
});

describe('cellAtPoint', () => {
  const size = 320; // 80pt per cell
  it('finds the cell under the finger', () => {
    expect(cellAtPoint(40, 40, size)).toBe(0);
    expect(cellAtPoint(280, 40, size)).toBe(3);
    expect(cellAtPoint(120, 200, size)).toBe(9);
    expect(cellAtPoint(280, 280, size)).toBe(15);
  });

  it('ignores the gaps and corners, so a diagonal slide does not clip a third letter', () => {
    expect(cellAtPoint(79, 40, size)).toBeNull(); // the edge between cells 0 and 1
    expect(cellAtPoint(79, 79, size)).toBeNull(); // the corner shared by 0, 1, 4 and 5
    expect(cellAtPoint(75, 75, size, 0.78)).toBeNull();
    expect(cellAtPoint(60, 60, size, 0.78)).toBe(0);
  });

  it('is null outside the grid or for an empty size', () => {
    expect(cellAtPoint(-1, 10, size)).toBeNull();
    expect(cellAtPoint(10, 320, size)).toBeNull();
    expect(cellAtPoint(10, 10, 0)).toBeNull();
  });

  it('has cell centres that land back on their own cell', () => {
    for (let c = 0; c < 16; c++) {
      const { x, y } = cellCenter(c, size);
      expect(cellAtPoint(x, y, size)).toBe(c);
    }
  });
});

describe('words and the preview', () => {
  it('reads the picked letters as a word', () => {
    expect(wordOf(BOARD, [0, 1, 2, 3])).toBe('SUYA');
    expect(wordOf(BOARD, [])).toBe('');
  });

  it('knows dictionary words (3+ letters, any case)', () => {
    expect(inDictionary('SEA')).toBe(true);
    expect(inDictionary('sea')).toBe(true);
    expect(inDictionary('XQZV')).toBe(false);
    expect(inDictionary('SE')).toBe(false);
    expect(inDictionary('')).toBe(false);
  });

  it('previews what the letters spell', () => {
    expect(previewOf('', [])).toEqual({ kind: 'empty', points: 0 });
    expect(previewOf('SE', [])).toEqual({ kind: 'short', points: 0 });
    expect(previewOf('XQZV', [])).toEqual({ kind: 'unknown', points: 0 });
    expect(previewOf('SEA', [])).toEqual({ kind: 'word', points: 1 });
    expect(previewOf('FIRE', [])).toEqual({ kind: 'word', points: 2 });
    expect(previewOf('FIRE', ['FIRE'])).toEqual({ kind: 'found', points: 0 });
  });

  it('adds a found word once and totals the score by length', () => {
    expect(addFound(['SEA'], 'FIRE')).toEqual(['SEA', 'FIRE']);
    expect(addFound(['SEA'], 'SEA')).toEqual(['SEA']);
    // 3 -> 1, 4 -> 2, 5 -> 4, 6 -> 6, 7 -> 9, 8+ -> 12
    const words = ['SEA', 'FIRE', 'JOLLO', 'JOLLOF', 'ABCDEFG', 'ABCDEFGH', 'ABCDEFGHIJ'];
    expect(totalScore(words)).toBe(1 + 2 + 4 + 6 + 9 + 12 + 12);
    expect(totalScore([])).toBe(0);
  });
});

describe('the clock', () => {
  it('counts down from when the round began and stops at zero', () => {
    expect(remainingMs(1000, 1000, 80_000)).toBe(80_000);
    expect(remainingMs(1000, 41_000, 80_000)).toBe(40_000);
    expect(remainingMs(1000, 200_000, 80_000)).toBe(0);
  });

  it('formats m:ss, rounding up so it never shows 0:00 early', () => {
    expect(formatClock(80_000)).toBe('1:20');
    expect(formatClock(41_000)).toBe('0:41');
    expect(formatClock(40_001)).toBe('0:41');
    expect(formatClock(7_000)).toBe('0:07');
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
  });

  it('says it in words for a screen reader', () => {
    expect(spokenClock(41_000)).toBe('41 seconds left');
    expect(spokenClock(80_000)).toBe('1 minute 20 seconds left');
  });
});

describe('saved round', () => {
  it('reads back what was saved and refuses anything else', () => {
    expect(parseSavedRound(JSON.stringify({ startedAt: 5, words: ['SEA'] }))).toEqual({
      startedAt: 5,
      words: ['SEA'],
    });
    expect(parseSavedRound(null)).toBeNull();
    expect(parseSavedRound('not json')).toBeNull();
    expect(parseSavedRound(JSON.stringify({ startedAt: '5', words: [] }))).toBeNull();
    expect(parseSavedRound(JSON.stringify({ startedAt: 5, words: [1] }))).toBeNull();
  });
});

describe('lines of text', () => {
  const view = (status: 'idle' | 'playing' | 'done', score: number | null): WordHuntView => ({
    players: ['me', 'zainab'],
    roundMs: 80_000,
    board: BOARD,
    status: { me: 'playing', zainab: status },
    scores: { me: null, zainab: score },
    words: { me: null, zainab: null },
    rejected: null,
    possibleWords: null,
    possibleScore: null,
  });

  it('describes the opponent', () => {
    expect(opponentLine(view('done', 41), 'zainab', 'Zainab')).toBe('Zainab · played · 41 pts');
    expect(opponentLine(view('done', 1), 'zainab', 'Zainab')).toBe('Zainab · played · 1 pt');
    expect(pointsLabel(0)).toBe('0 pts');
    expect(opponentLine(view('playing', null), 'zainab', 'Zainab')).toBe('Zainab · playing now');
    expect(opponentLine(view('idle', null), 'zainab', 'Zainab')).toBe("Zainab · hasn't played yet");
    expect(opponentLine(view('idle', null), null, 'Zainab')).toBe('Zainab');
  });

  it('shows the score to beat only once there is one', () => {
    expect(beatLine(view('done', 41), 'zainab')).toBe('beat 41');
    expect(beatLine(view('playing', null), 'zainab')).toBeNull();
    expect(beatLine(view('done', 0), 'zainab')).toBe('beat 0');
  });

  it('labels every cell for a screen reader', () => {
    expect(cellLabel('S', 0, null)).toBe('Letter S, row 1, column 1');
    expect(cellLabel('K', 15, null)).toBe('Letter K, row 4, column 4');
    expect(cellLabel('U', 1, 0)).toBe('Letter U, row 1, column 2, picked 1');
  });

  it('lists the words you missed', () => {
    expect(missedWords(['SEA'], ['SEA', 'FIRE', 'LOAF'])).toEqual(['FIRE', 'LOAF']);
    expect(missedWords([], [])).toEqual([]);
  });
});
