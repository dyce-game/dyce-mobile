import { anagramsEngine } from '@dyce/games';
import {
  addFound,
  anagramsMover,
  anagramsScoreLine,
  anagramsStage,
  beatLine,
  byPoints,
  dropLast,
  inAnagramsDictionary,
  letterLabel,
  missedWords,
  opponentLine,
  parseAnagramsView,
  pickedWord,
  pickForLetter,
  poolLabel,
  previewHint,
  previewOf,
  shuffledOrder,
  togglePick,
  totalScore,
  type AnagramsView,
} from './anagrams-logic';

const A = 'user-a';
const B = 'user-b';

/** A real view from the engine, so the parser is tested against what the server sends. */
function engineView(viewer: string, actions: [string, object][] = []) {
  let s = anagramsEngine.init([A, B], 42n, {});
  for (const [by, a] of actions) {
    s = anagramsEngine.apply(s, by, a as never);
  }
  return anagramsEngine.view(s, viewer);
}

function parsed(viewer: string, actions: [string, object][] = []): AnagramsView {
  const v = parseAnagramsView(engineView(viewer, actions));
  if (!v) throw new Error('view did not parse');
  return v;
}

describe('parseAnagramsView', () => {
  it('reads the engine view before Start: no letters, nobody played', () => {
    const v = parsed(A);
    expect(v.letters).toBeNull();
    expect(v.players).toEqual([A, B]);
    expect(v.status[A]).toBe('idle');
    expect(v.scores[A]).toBeNull();
    expect(v.rejected).toBeNull();
  });

  it('shows the six letters once you have started', () => {
    const v = parsed(A, [[A, { kind: 'start' }]]);
    expect(v.letters).toHaveLength(6);
    expect(v.status[A]).toBe('playing');
    // The other player has not started: they still see nothing.
    expect(parsed(B).letters).toBeNull();
  });

  it('reads scores, words and the possible-words count after both are done', () => {
    const v = parsed(A, [
      [A, { kind: 'start' }],
      [A, { kind: 'submit', words: [] }],
      [B, { kind: 'start' }],
      [B, { kind: 'submit', words: ['zzzzzz'] }],
    ]);
    expect(v.status).toEqual({ [A]: 'done', [B]: 'done' });
    expect(v.words[A]).toEqual([]);
    expect(v.rejected).toBe(0);
    expect(typeof v.possibleWords).toBe('number');
    expect(typeof v.possibleScore).toBe('number');
  });

  it('rejects anything it does not recognise', () => {
    expect(parseAnagramsView(null)).toBeNull();
    expect(parseAnagramsView('x')).toBeNull();
    expect(parseAnagramsView({})).toBeNull();
    const good = engineView(A) as Record<string, unknown>;
    expect(parseAnagramsView({ ...good, status: { [A]: 'weird', [B]: 'idle' } })).toBeNull();
    expect(parseAnagramsView({ ...good, letters: [1, 2] })).toBeNull();
    expect(parseAnagramsView({ ...good, players: [1] })).toBeNull();
  });
});

describe('stage and mover', () => {
  const base: AnagramsView = {
    players: [A, B],
    roundMs: 60_000,
    letters: null,
    status: { [A]: 'idle', [B]: 'idle' },
    scores: { [A]: null, [B]: null },
    words: { [A]: null, [B]: null },
    rejected: null,
    possibleWords: null,
    possibleScore: null,
  };

  it('moves from intro to playing to waiting to over', () => {
    expect(anagramsStage(base, A)).toBe('intro');
    expect(anagramsStage({ ...base, status: { ...base.status, [A]: 'playing' } }, A)).toBe(
      'playing',
    );
    expect(anagramsStage({ ...base, status: { [A]: 'done', [B]: 'idle' } }, A)).toBe('waiting');
    expect(anagramsStage({ ...base, status: { [A]: 'done', [B]: 'done' } }, A)).toBe('over');
  });

  it('says it is your move until you have sent your words, then theirs', () => {
    expect(anagramsMover(base, A)).toBe(A);
    expect(anagramsMover({ ...base, status: { [A]: 'done', [B]: 'playing' } }, A)).toBe(B);
    expect(anagramsMover({ ...base, status: { [A]: 'done', [B]: 'done' } }, A)).toBeNull();
  });

  it('writes the score line with you first', () => {
    const v = { ...base, scores: { [A]: 7, [B]: 12 } };
    const name = (id: string) => (id === B ? 'Zainab' : 'x');
    expect(anagramsScoreLine(v, A, name)).toBe('You 7 · Zainab 12');
    expect(anagramsScoreLine(v, B, name)).toBe('You 12 · x 7');
  });
});

describe('building a word', () => {
  const letters = ['G', 'A', 'N', 'R', 'O', 'E'];

  it('spells the picks in order', () => {
    expect(pickedWord(letters, [3, 1, 2, 0])).toBe('RANG');
    expect(pickedWord(letters, [])).toBe('');
  });

  it('adds a letter on tap and takes it back on a second tap', () => {
    expect(togglePick([], 3)).toEqual([3]);
    expect(togglePick([3, 1], 2)).toEqual([3, 1, 2]);
    expect(togglePick([3, 1, 2], 1)).toEqual([3, 2]);
    expect(dropLast([3, 1, 2])).toEqual([3, 1]);
    expect(dropLast([])).toEqual([]);
  });

  it('finds a typed letter: the first copy not picked yet', () => {
    const twin = ['E', 'A', 'E', 'T', 'S', 'N'];
    expect(pickForLetter(twin, [], 'e')).toBe(0);
    expect(pickForLetter(twin, [0], 'E')).toBe(2);
    expect(pickForLetter(twin, [0, 2], 'e')).toBeNull();
    expect(pickForLetter(twin, [], 'z')).toBeNull();
  });
});

describe('previewOf', () => {
  it('walks the kinds', () => {
    expect(previewOf('', [])).toEqual({ kind: 'empty', points: 0 });
    expect(previewOf('GO', [])).toEqual({ kind: 'short', points: 0 });
    expect(previewOf('ZZZ', [])).toEqual({ kind: 'unknown', points: 0 });
  });

  it('scores by length (3 -> 1, 4 -> 2, 5 -> 4, 6 -> 10) and spots repeats', () => {
    expect(inAnagramsDictionary('RANGE')).toBe(true);
    expect(previewOf('RANGE', [])).toEqual({ kind: 'word', points: 4 });
    expect(previewOf('RANGE', ['RANGE'])).toEqual({ kind: 'found', points: 0 });
    expect(previewOf('ORANGE', [])).toEqual({ kind: 'word', points: 10 });
    expect(previewOf('AGO', [])).toEqual({ kind: 'word', points: 1 });
  });

  it('keeps the words found without duplicates and totals them', () => {
    expect(addFound(['AGO'], 'AGO')).toEqual(['AGO']);
    expect(addFound(['AGO'], 'EARN')).toEqual(['AGO', 'EARN']);
    expect(totalScore(['AGO', 'EARN', 'RANGE', 'ORANGE'])).toBe(1 + 2 + 4 + 10);
  });

  it('orders words best first, then A to Z', () => {
    expect(byPoints(['AGO', 'ORANGE', 'EARN', 'ANGER', 'GONE'])).toEqual([
      'ORANGE',
      'ANGER',
      'EARN',
      'GONE',
      'AGO',
    ]);
  });

  it('has a hint for every kind', () => {
    expect(previewHint('unknown', 0)).toBe('Not in the word list');
    expect(previewHint('word', 4)).toContain('+4');
    expect(previewHint('word', 10)).toContain('All six letters');
    expect(previewHint('empty', 0)).toBeTruthy();
    expect(previewHint('short', 0)).toBeTruthy();
    expect(previewHint('found', 0)).toBeTruthy();
  });
});

describe('shuffledOrder', () => {
  it('is a permutation that moves something', () => {
    let n = 0;
    const rand = () => {
      n += 1;
      return (n * 0.37) % 1;
    };
    const order = shuffledOrder(6, rand);
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4, 5]);
    expect(order).not.toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('still moves things when the random source never does', () => {
    const order = shuffledOrder(4, () => 0.999);
    expect([...order].sort()).toEqual([0, 1, 2, 3]);
    expect(order).not.toEqual([0, 1, 2, 3]);
  });

  it('copes with tiny pools', () => {
    expect(shuffledOrder(0, Math.random)).toEqual([]);
    expect(shuffledOrder(1, Math.random)).toEqual([0]);
  });
});

describe('lines of text', () => {
  const view: AnagramsView = {
    players: [A, B],
    roundMs: 60_000,
    letters: ['G', 'A', 'N', 'R', 'O', 'E'],
    status: { [A]: 'playing', [B]: 'done' },
    scores: { [A]: null, [B]: 9 },
    words: { [A]: null, [B]: null },
    rejected: null,
    possibleWords: null,
    possibleScore: null,
  };

  it('describes the opponent', () => {
    expect(opponentLine(view, B, 'Zainab')).toBe('Zainab · played · 9 pts');
    expect(opponentLine({ ...view, status: { [A]: 'playing', [B]: 'playing' } }, B, 'Zainab')).toBe(
      'Zainab · playing now',
    );
    expect(opponentLine({ ...view, status: { [A]: 'playing', [B]: 'idle' } }, B, 'Zainab')).toBe(
      "Zainab · hasn't played yet",
    );
    expect(opponentLine(view, null, 'Them')).toBe('Them');
  });

  it('says what to beat only when there is a score', () => {
    expect(beatLine(view, B)).toBe('beat 9');
    expect(beatLine({ ...view, scores: { [A]: null, [B]: null } }, B)).toBeNull();
  });

  it('labels the pool and the tiles for a screen reader', () => {
    expect(poolLabel(['G', 'A'], [])).toBe('Letters: G, A.');
    expect(poolLabel(['G', 'A'], [1, 0])).toContain('A G');
    expect(letterLabel('G', false)).toContain('Tap to add');
    expect(letterLabel('G', true)).toContain('used');
  });

  it('lists the words the other player found that you missed', () => {
    expect(missedWords(['AGO'], ['AGO', 'EARN'])).toEqual(['EARN']);
  });
});
