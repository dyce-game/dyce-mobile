import { whotEngine, type WhotCard, type WhotState } from '@dyce/games';
import {
  drawAction,
  lastEventLine,
  marketLabel,
  mostHeldShape,
  onLastCard,
  opponentsOf,
  opponentSlots,
  parseWhotView,
  playAction,
  playableCards,
  ruleLine,
  secondsLeft,
  sortedHand,
  type WhotView,
} from './whot-logic';

const c = (shape: WhotCard['shape'], n: number): WhotCard => ({ shape, n });

const view = (o: Partial<WhotView> = {}): WhotView => ({
  players: ['a', 'b', 'c'],
  current: 'a',
  hand: [c('circle', 2), c('triangle', 5), c('cross', 7), c('whot', 20)],
  counts: { a: 4, b: 3, c: 2 },
  marketCount: 30,
  top: c('circle', 4),
  requested: null,
  pending: null,
  winner: null,
  endReason: null,
  last: null,
  ...o,
});

describe('reading the table', () => {
  it('reads the engine view for a real game, and refuses garbage', () => {
    const s = whotEngine.init(['a', 'b', 'c'], 5n, {});
    const parsed = parseWhotView(whotEngine.view(s as WhotState, 'a'));
    expect(parsed).not.toBeNull();
    expect(parsed!.hand).toHaveLength(6);
    expect(parsed!.counts['b']).toBe(6);
    expect(parseWhotView(null)).toBeNull();
    expect(parseWhotView({ players: [] })).toBeNull();
    expect(parseWhotView({ ...view(), hand: [{ shape: 1 }] })).toBeNull();
  });
});

describe('which cards can be played', () => {
  it('matches shape or number, a Whot always, nothing when it is not your turn', () => {
    const v = view();
    expect(playableCards(v, true)).toEqual([c('circle', 2), c('whot', 20)]);
    expect(playableCards(v, false)).toEqual([]);
    expect(playableCards(view({ top: c('cross', 9) }), true)).toEqual([
      c('cross', 7),
      c('whot', 20),
    ]);
  });

  it('after a Whot only the asked-for shape (or another Whot); under a pick two only a 2', () => {
    expect(playableCards(view({ requested: 'triangle' }), true)).toEqual([
      c('triangle', 5),
      c('whot', 20),
    ]);
    const pending = view({ pending: { n: 2, total: 2 }, top: c('square', 2) });
    expect(playableCards(pending, true)).toEqual([c('circle', 2)]);
  });
});

describe('what a tap sends', () => {
  it('a plain play carries no call until it leaves one card or goes out', () => {
    expect(playAction(view(), c('circle', 2))).toEqual({ kind: 'play', card: c('circle', 2) });
    const two = view({ hand: [c('circle', 2), c('triangle', 5)] });
    expect(playAction(two, c('circle', 2))).toEqual({
      kind: 'play',
      card: c('circle', 2),
      call: true,
    });
    const one = view({ hand: [c('circle', 2)] });
    expect(playAction(one, c('circle', 2))).toMatchObject({ call: true });
  });

  it('a Whot names a shape: the one chosen, else the one held most', () => {
    expect(playAction(view(), c('whot', 20), 'star')).toMatchObject({ shape: 'star' });
    expect(
      playAction(
        view({ hand: [c('cross', 1), c('cross', 2), c('whot', 20), c('star', 1)] }),
        c('whot', 20),
      ),
    ).toMatchObject({
      shape: 'cross',
    });
    expect(mostHeldShape([c('whot', 20)])).toBeNull();
    expect(drawAction()).toEqual({ kind: 'draw' });
  });

  it('every action the app builds is accepted by the engine', () => {
    let s = whotEngine.init(['a', 'b'], 11n, {});
    for (let i = 0; i < 300 && !whotEngine.isTerminal(s); i++) {
      const by = whotEngine.currentPlayers(s)[0]!;
      const v = parseWhotView(whotEngine.view(s, by))!;
      const card = playableCards(v, true)[0];
      const action = card ? playAction(v, card) : drawAction();
      expect(whotEngine.validate(s, by, action)).toEqual({ ok: true });
      s = whotEngine.apply(s, by, action);
    }
    // never charged for a forgotten call
    expect((s as WhotState).last?.missedCall ?? null).toBeNull();
  });
});

describe('words', () => {
  const names: Record<string, string> = { a: 'Amaka', b: 'Tunde', c: 'Zee' };
  const nameOf = (id: string) => names[id] ?? 'Someone';

  it('says what the table is asking for', () => {
    expect(ruleLine(view())).toBe('4 of circles on top · match the shape or the number');
    expect(ruleLine(view({ pending: { n: 2, total: 4 } }))).toBe('Pick two! Play a 2 or pick 4');
    expect(ruleLine(view({ requested: 'star' }))).toBe('Whot! Play a star or a Whot');
    expect(ruleLine(view({ top: c('cross', 7) }))).toMatch(/^7 of crosses on top/);
    expect(ruleLine(view({ endReason: 'out' }))).toBe('The game is over');
    expect(marketLabel(view())).toBe('Go to market');
    expect(marketLabel(view({ pending: { n: 5, total: 6 } }))).toBe('Pick 6');
  });

  it('says what just happened', () => {
    const base = {
      seq: 1,
      by: 'a',
      kind: 'play',
      drew: 0,
      requested: null,
      marketed: [] as string[],
      missedCall: null,
    } as const;
    expect(lastEventLine(null, nameOf)).toBeNull();
    expect(lastEventLine({ ...base, card: c('circle', 7), effect: null }, nameOf)).toBe(
      'Amaka played 7 of circles',
    );
    expect(lastEventLine({ ...base, card: c('circle', 2), effect: 'pick_two' }, nameOf)).toBe(
      'Amaka played Pick two',
    );
    expect(
      lastEventLine({ ...base, card: c('whot', 20), effect: 'whot', requested: 'star' }, nameOf),
    ).toBe('Amaka played Whot · asking for stars');
    expect(
      lastEventLine({ ...base, kind: 'draw', card: null, effect: null, drew: 2, by: 'b' }, nameOf),
    ).toBe('Tunde went to market (2 cards)');
    expect(
      lastEventLine(
        { ...base, card: c('circle', 7), effect: null, drew: 2, missedCall: 'last_card' },
        nameOf,
      ),
    ).toMatch(/forgot to call last card/);
  });

  it('knows who is on their last card', () => {
    expect(onLastCard(view({ counts: { a: 4, b: 1, c: 2 } }))).toEqual(['b']);
  });
});

describe('layout and clocks', () => {
  it('seats the opponents clockwise from your left and spreads them across the top', () => {
    expect(opponentsOf(['a', 'b', 'c', 'd'], 'b')).toEqual(['c', 'd', 'a']);
    expect(opponentsOf(['a', 'b'], 'a')).toEqual(['b']);
    expect(opponentSlots(1)).toHaveLength(1);
    expect(opponentSlots(2)).toHaveLength(2);
    expect(opponentSlots(3).map((p) => p.x)).toEqual([0.14, 0.5, 0.86]);
  });

  it('counts the turn clock in server time even if the device clock is wrong', () => {
    // The device is 10 minutes ahead of the server.
    const state = { serverNow: 1_000_000, turnDeadlineAt: 1_025_000 };
    const received = 1_600_000;
    expect(secondsLeft(state, received, received)).toBe(25);
    expect(secondsLeft(state, received, received + 10_000)).toBe(15);
    expect(secondsLeft(state, received, received + 40_000)).toBe(0);
    expect(secondsLeft({ serverNow: 1, turnDeadlineAt: null }, 1, 1)).toBeNull();
  });

  it('keeps a hand in a steady order', () => {
    expect(sortedHand([c('whot', 20), c('star', 2), c('circle', 9), c('circle', 3)])).toEqual([
      c('circle', 3),
      c('circle', 9),
      c('star', 2),
      c('whot', 20),
    ]);
  });
});
