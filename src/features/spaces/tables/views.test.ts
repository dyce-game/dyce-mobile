import { advance, initState, viewOf } from './fixtures';
import { parseCrazyView, parseWhotTableView } from './views';

describe('reading the Crazy Cards view', () => {
  it('parses what the engine sends to every seat, at the start', () => {
    const s = initState('crazy-cards', ['ada', 'bola', 'chi']);
    for (const p of ['ada', 'bola', 'chi']) {
      const v = parseCrazyView(viewOf('crazy-cards', s, p));
      expect(v).not.toBeNull();
      expect(v!.hand).toHaveLength(7);
      expect(v!.counts).toEqual({ ada: 7, bola: 7, chi: 7 });
      expect(v!.hands).toBeUndefined();
      expect(v!.last).toBeNull();
    }
  });

  it("never carries anyone else's cards before the game ends", () => {
    const s = advance('crazy-cards', initState('crazy-cards', ['ada', 'bola']), 6);
    const raw = viewOf('crazy-cards', s, 'ada') as Record<string, unknown>;
    expect(Object.keys(raw)).not.toContain('deck');
    expect(raw.hands).toBeUndefined();
    const v = parseCrazyView(raw)!;
    expect(v.hand.length).toBe(v.counts.ada);
  });

  it('parses a finished game with every hand and the points', () => {
    let s = initState('crazy-cards', ['ada', 'bola', 'chi']);
    s = advance('crazy-cards', s, 2000);
    const v = parseCrazyView(viewOf('crazy-cards', s, 'bola'))!;
    expect(v.endReason).not.toBeNull();
    expect(v.hands).toBeDefined();
    expect(Object.keys(v.points ?? {}).sort()).toEqual(['ada', 'bola', 'chi']);
  });

  it("refuses a view that is not this game's", () => {
    expect(parseCrazyView(null)).toBeNull();
    expect(parseCrazyView('table')).toBeNull();
    expect(parseCrazyView({ players: ['a'] })).toBeNull();
    const w = viewOf('whot', initState('whot', ['ada', 'bola']), 'ada');
    expect(parseCrazyView(w)).toBeNull();
    expect(
      parseCrazyView({
        ...(viewOf('crazy-cards', initState('crazy-cards', ['ada', 'bola']), 'ada') as object),
        hand: [{ color: 'pink', value: '3' }],
      }),
    ).toBeNull();
  });
});

describe('reading the Whot! view', () => {
  it('parses what the engine sends, and the event after a move', () => {
    let s = initState('whot', ['ada', 'bola', 'chi', 'dayo']);
    expect(parseWhotTableView(viewOf('whot', s, 'ada'))!.hand.length).toBeGreaterThanOrEqual(5);
    s = advance('whot', s, 3);
    const v = parseWhotTableView(viewOf('whot', s, 'chi'))!;
    expect(v.last).not.toBeNull();
    expect(v.marketCount).toBeGreaterThan(0);
  });

  it('shows every hand only once the game is over', () => {
    let s = initState('whot', ['ada', 'bola']);
    expect(parseWhotTableView(viewOf('whot', s, 'ada'))!.hands).toBeUndefined();
    s = advance('whot', s, 3000);
    const v = parseWhotTableView(viewOf('whot', s, 'ada'))!;
    expect(v.endReason).not.toBeNull();
    expect(v.hands).toBeDefined();
  });

  it("refuses garbage and the other game's view", () => {
    expect(parseWhotTableView(undefined)).toBeNull();
    expect(parseWhotTableView({})).toBeNull();
    expect(
      parseWhotTableView(viewOf('crazy-cards', initState('crazy-cards', ['ada', 'bola']), 'ada')),
    ).toBeNull();
  });
});
