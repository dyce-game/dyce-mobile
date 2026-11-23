import { fillerEngine, FILLER_START, type FillerState } from '@dyce/games';
import {
  COLOURS,
  SHAPES,
  barCopy,
  bestColour,
  boardSummary,
  chipLabel,
  cornerOf,
  countOf,
  fillerScoreLine,
  gainOf,
  holder,
  isPickable,
  mySeat,
  parseFillerView,
  pickAction,
  predictPick,
  shapePath,
  type FillerView,
} from './filler-logic';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bola');

const fresh = (seed = 7n) => fillerEngine.init([A, B], seed, {});
const wireOf = (s: FillerState): unknown => JSON.parse(JSON.stringify(fillerEngine.view(s, A)));
function viewOf(s: FillerState): FillerView {
  const v = parseFillerView(wireOf(s));
  if (!v) throw new Error('view did not parse');
  return v;
}
/** Plays the best colour for whoever is to move, `n` times. */
function advance(s: FillerState, n: number): FillerState {
  let cur = s;
  for (let i = 0; i < n && !cur.over; i++) {
    const v = viewOf(cur);
    cur = fillerEngine.apply(cur, cur.players[cur.turn], pickAction(bestColour(v)));
  }
  return cur;
}

describe('parseFillerView', () => {
  it('reads the engine view of a new game', () => {
    const v = viewOf(fresh());
    expect(v.cells).toHaveLength(56);
    expect(v.owner.filter((o) => o === 1)).toHaveLength(1);
    expect(v.owner.filter((o) => o === 2)).toHaveLength(1);
    expect(v.counts).toEqual({ [A]: 1, [B]: 1 });
    expect(v.last).toBeNull();
    expect(v.turn).toBe(0);
  });

  it('keeps the last pick', () => {
    const v = viewOf(advance(fresh(), 1));
    expect(v.last?.by).toBe(A);
    expect(v.turn).toBe(1);
  });

  it('refuses anything it does not recognise', () => {
    const good = wireOf(fresh()) as Record<string, unknown>;
    expect(parseFillerView(null)).toBeNull();
    expect(parseFillerView({ ...good, cols: 9 })).toBeNull();
    expect(parseFillerView({ ...good, cells: [1, 2, 3] })).toBeNull();
    expect(parseFillerView({ ...good, cells: new Array(56).fill(9) })).toBeNull();
    expect(parseFillerView({ ...good, owner: new Array(56).fill(5) })).toBeNull();
    expect(parseFillerView({ ...good, colours: [0] })).toBeNull();
    expect(parseFillerView({ ...good, turn: 2 })).toBeNull();
    expect(parseFillerView({ ...good, over: 'no' })).toBeNull();
    expect(parseFillerView({ ...good, last: { seq: 1 } })).toBeNull();
  });

  it('counts the squares itself when the view has no counts', () => {
    const good = wireOf(fresh()) as Record<string, unknown>;
    const v = parseFillerView({ ...good, counts: undefined })!;
    expect(v.counts).toEqual({ [A]: 1, [B]: 1 });
  });
});

describe('colours', () => {
  const v = viewOf(fresh());

  it('has six colours with six different shapes', () => {
    expect(COLOURS).toHaveLength(6);
    expect(new Set(SHAPES).size).toBe(6);
    expect(new Set(COLOURS.map((c) => c.fill)).size).toBe(6);
  });

  it('blocks the two colours in play', () => {
    expect(isPickable(v, v.colours[0])).toBe(false);
    expect(isPickable(v, v.colours[1])).toBe(false);
    expect([0, 1, 2, 3, 4, 5].filter((c) => isPickable(v, c))).toHaveLength(4);
  });

  it('says who holds a colour', () => {
    expect(holder(v, v.colours[0], 0)).toBe('you');
    expect(holder(v, v.colours[0], 1)).toBe('them');
    expect(holder(v, v.colours[1], 0)).toBe('them');
    expect(
      holder(
        v,
        [0, 1, 2, 3, 4, 5].find((c) => isPickable(v, c))!,
        0,
      ),
    ).toBeNull();
    expect(mySeat(v, A)).toBe(0);
    expect(mySeat(v, B)).toBe(1);
    expect(mySeat(v, null)).toBeNull();
  });

  it('draws a shape for each', () => {
    for (const s of SHAPES) expect(shapePath(s, 10, 10, 5)).toMatch(/^M/);
  });
});

describe('picking', () => {
  const v = viewOf(fresh());
  const open = [0, 1, 2, 3, 4, 5].filter((c) => isPickable(v, c));

  it('counts the gain with the engine', () => {
    for (const c of open) {
      const next = fillerEngine.apply(fresh(), A, pickAction(c));
      expect(gainOf(v, c)).toBe(next.last!.gained);
    }
  });

  it('predicts the board after a pick', () => {
    const c = bestColour(v);
    const guess = predictPick(v, c)!;
    const real = fillerEngine.apply(fresh(), A, pickAction(c));
    expect(guess.cells).toEqual(real.cells);
    expect(guess.owner).toEqual(real.owner);
    expect(guess.colours).toEqual(real.colours);
    expect(guess.counts[A]).toBe(real.owner.filter((o) => o === 1).length);
    expect(guess.turn).toBe(1);
    expect(v.cells).toEqual(fresh().cells); // the view itself is untouched
  });

  it('refuses a colour that is held', () => {
    expect(predictPick(v, v.colours[0])).toBeNull();
    expect(predictPick(v, v.colours[1])).toBeNull();
    expect(predictPick(v, 9)).toBeNull();
  });

  it('suggests the colour that gains most', () => {
    const best = bestColour(v);
    expect(open).toContain(best);
    for (const c of open) expect(gainOf(v, best)).toBeGreaterThanOrEqual(gainOf(v, c));
  });

  it('counts squares per player', () => {
    expect(countOf(v, A)).toBe(1);
    expect(countOf(v, null)).toBe(0);
  });

  it('starts you in the right corner', () => {
    expect(FILLER_START[0]).toBe(48);
    expect(cornerOf(0)).toBe('bottom-left corner');
    expect(cornerOf(1)).toBe('top-right corner');
  });
});

describe('words', () => {
  const v = viewOf(fresh());
  const open = [0, 1, 2, 3, 4, 5].filter((c) => isPickable(v, c));

  it('labels each chip', () => {
    expect(chipLabel(v, v.colours[0], 0)).toMatch(/your colour, not available$/);
    expect(chipLabel(v, v.colours[1], 0)).toMatch(/their colour, not available$/);
    expect(chipLabel(v, open[0]!, 0)).toMatch(/^[A-Za-z]+, would add \d+ squares?$/);
  });

  it('says what is going on', () => {
    expect(barCopy(v, A, 'Bola', true, null, 0).title).toBe('Your pick');
    expect(barCopy(v, A, 'Bola', true, null, 0).subtitle).toMatch(/bottom-left corner/);
    expect(barCopy(v, B, 'Ada', false, null, 1).title).toBe("Ada's pick");
    const c = open[0]!;
    expect(barCopy(v, A, 'Bola', true, c, 0).title).toBe(
      `Your pick · ${COLOURS[c]!.name.toLowerCase()} grabs ${gainOf(v, c)} square${gainOf(v, c) === 1 ? '' : 's'}`,
    );
  });

  it('tells you what they picked', () => {
    const after = viewOf(advance(fresh(), 1));
    expect(barCopy(after, A, 'Bola', false, null, 0).subtitle).toMatch(/^Waiting|^They picked/);
    expect(barCopy(after, B, 'Ada', true, null, 1).title).toBe('Your pick');
  });

  it('writes the result line', () => {
    expect(fillerScoreLine(v, A, nameOf)).toBeNull();
    let s = fresh();
    for (let i = 0; i < 120 && !s.over; i++) s = advance(s, 1);
    expect(s.over).toBe(true);
    const done = viewOf(s);
    expect(fillerScoreLine(done, A, nameOf)).toMatch(/^You \d+ · Bola \d+ squares$/);
    expect(fillerScoreLine(done, B, nameOf)).toMatch(/^Ada \d+ · You \d+ squares$/);
    const t = barCopy(done, A, 'Bola', false, null, 0).title;
    expect(['You won', 'Bola won', 'Draw']).toContain(t);
  });

  it('summarises the board', () => {
    expect(boardSummary(v, A, 'Bola')).toBe(
      'Filler board, 8 by 7. You hold 1 square, Bola holds 1. 29 wins.',
    );
  });
});
