import {
  parseWordHuntView,
  wordHuntMover,
  wordHuntScoreLine,
  wordHuntStage,
  type WordHuntView,
} from './games-logic';

const ME = 'me';
const AMAKA = 'amaka';
const BOARD = 'SUYAJOLFMEDIRTNK'.split('');

const raw = (over: Record<string, unknown> = {}) => ({
  players: [ME, AMAKA],
  roundMs: 80000,
  dict: 'x',
  board: BOARD,
  status: { [ME]: 'playing', [AMAKA]: 'done' },
  scores: { [ME]: null, [AMAKA]: 41 },
  words: { [ME]: null, [AMAKA]: null },
  rejected: null,
  possibleWords: null,
  possibleScore: null,
  ...over,
});
const at = (a: string, b: string) =>
  parseWordHuntView(raw({ status: { [ME]: a, [AMAKA]: b } })) as WordHuntView;
const nameOf = (id: string) => (id === AMAKA ? 'Amaka' : 'Them');

describe('parseWordHuntView', () => {
  it('parses the server view', () => {
    const v = parseWordHuntView(raw());
    expect(v?.board).toEqual(BOARD);
    expect(v?.status[AMAKA]).toBe('done');
    expect(v?.scores).toEqual({ [ME]: null, [AMAKA]: 41 });
    expect(v?.words[AMAKA]).toBeNull();
  });

  it('accepts a grid that is still hidden', () => {
    const v = parseWordHuntView(raw({ board: null, status: { [ME]: 'idle', [AMAKA]: 'idle' } }));
    expect(v?.board).toBeNull();
  });

  it('keeps the words and totals once finished', () => {
    const v = parseWordHuntView(
      raw({
        status: { [ME]: 'done', [AMAKA]: 'done' },
        scores: { [ME]: 38, [AMAKA]: 41 },
        words: { [ME]: ['SEA', 'SUYA'], [AMAKA]: ['FIRE'] },
        rejected: 1,
        possibleWords: 40,
        possibleScore: 120,
      }),
    );
    expect(v?.words[ME]).toEqual(['SEA', 'SUYA']);
    expect(v?.rejected).toBe(1);
    expect(v?.possibleWords).toBe(40);
  });

  it('rejects anything that is not a Word Hunt view', () => {
    expect(parseWordHuntView(null)).toBeNull();
    expect(parseWordHuntView('x')).toBeNull();
    expect(parseWordHuntView(raw({ board: ['A', 'B'] }))).toBeNull();
    expect(parseWordHuntView(raw({ status: { [ME]: 'sleeping', [AMAKA]: 'done' } }))).toBeNull();
    expect(parseWordHuntView(raw({ roundMs: '80' }))).toBeNull();
    expect(parseWordHuntView({ players: [ME] })).toBeNull();
  });
});

describe('wordHuntStage', () => {
  it('knows which stage you are in', () => {
    expect(wordHuntStage(at('idle', 'done'), ME)).toBe('intro');
    expect(wordHuntStage(at('playing', 'idle'), ME)).toBe('playing');
    expect(wordHuntStage(at('done', 'playing'), ME)).toBe('waiting');
    expect(wordHuntStage(at('done', 'done'), ME)).toBe('over');
    expect(wordHuntStage(at('done', 'done'), null)).toBe('intro');
  });
});

describe('wordHuntMover', () => {
  it('says whose move it is when both play at once', () => {
    expect(wordHuntMover(at('idle', 'idle'), ME)).toBe(ME);
    expect(wordHuntMover(at('idle', 'idle'), AMAKA)).toBe(AMAKA);
    expect(wordHuntMover(at('done', 'playing'), ME)).toBe(AMAKA);
    expect(wordHuntMover(at('playing', 'done'), ME)).toBe(ME);
    expect(wordHuntMover(at('done', 'done'), ME)).toBeNull();
  });
});

describe('wordHuntScoreLine', () => {
  it('writes the score line with you first', () => {
    const v = parseWordHuntView(
      raw({ status: { [ME]: 'done', [AMAKA]: 'done' }, scores: { [ME]: 38, [AMAKA]: 41 } }),
    ) as WordHuntView;
    expect(wordHuntScoreLine(v, ME, nameOf)).toBe('You 38 · Amaka 41');
    expect(wordHuntScoreLine(v, AMAKA, nameOf)).toBe('You 41 · Them 38');
  });
});
