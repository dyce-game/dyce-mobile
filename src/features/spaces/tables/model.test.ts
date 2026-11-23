import {
  crazyCardsEngine,
  whotEngine,
  type CrazyCard,
  type CrazyCardsState,
  type WhotState,
} from '@dyce/games';
import { advance, currentOf, initState, liveFor, modelFor, nameOf, PLAYERS } from './fixtures';
import { crazyFace, sortFaces, whotFace } from './faces';
import {
  buildTableModel,
  callsLastCard,
  choiceNeeded,
  eventLine,
  inForceLine,
  mostHeld,
  playMove,
  seatOrder,
} from './model';

const crazy = (players = ['ada', 'bola', 'chi']): CrazyCardsState =>
  initState('crazy-cards', players) as CrazyCardsState;

describe('seats', () => {
  it('puts you first and follows the order of play', () => {
    expect(seatOrder(PLAYERS, 'chi')).toEqual(['chi', 'dayo', 'ada', 'bola']);
    expect(seatOrder(PLAYERS, 'ada')).toEqual(PLAYERS);
  });

  it('builds seats with counts, names and the current player', () => {
    const s = crazy();
    const cur = currentOf('crazy-cards', s);
    const m = modelFor('crazy-cards', s, 'bola');
    expect(m.seats.map((x) => x.id)).toEqual(['bola', 'chi', 'ada']);
    expect(m.seats.every((x) => x.count === 7)).toBe(true);
    expect(m.seats.find((x) => x.current)?.id).toBe(cur);
    expect(m.seats[1]!.name).toBe('Chi');
    expect(m.over).toBe(false);
  });

  it('marks a seat on one card and a forfeited seat', () => {
    const s = crazy();
    const live = liveFor('crazy-cards', s, 'ada');
    const view = live.view as { counts: Record<string, number> };
    view.counts.chi = 1;
    live.seats[2]!.forfeited = true;
    const m = buildTableModel('crazy-cards', live, 'ada', nameOf)!;
    expect(m.seats.find((x) => x.id === 'chi')).toMatchObject({ lastCard: true, forfeited: true });
  });
});

describe('Crazy Cards: what you can play', () => {
  it('only highlights cards the rules allow, and only on your turn', () => {
    const s = crazy();
    const cur = currentOf('crazy-cards', s);
    const other = ['ada', 'bola', 'chi'].find((p) => p !== cur)!;
    const mine = modelFor('crazy-cards', s, cur);
    expect(mine.myTurn).toBe(true);
    for (const { face, playable } of mine.hand) {
      const c = face.raw as CrazyCard;
      const ok =
        c.color === 'wild' ||
        c.color === mine.colorInForce ||
        c.value === (mine.top.raw as CrazyCard).value;
      expect(playable).toBe(ok);
    }
    const theirs = modelFor('crazy-cards', s, other);
    expect(theirs.myTurn).toBe(false);
    expect(theirs.hand.some((h) => h.playable)).toBe(false);
    expect(theirs.canDraw).toBe(false);
  });

  it('after a draw you may only play the card you drew, or pass', () => {
    for (let seed = 1n; seed < 200n; seed++) {
      const s = crazyCardsEngine.init(['ada', 'bola'], seed, {});
      const by = currentOf('crazy-cards', s);
      const drawn = crazyCardsEngine.apply(s, by, { kind: 'draw' });
      if (drawn.drawn) {
        const m = modelFor('crazy-cards', drawn, by);
        expect(m.drawn).not.toBeNull();
        expect(m.canPass).toBe(true);
        expect(m.canDraw).toBe(false);
        expect(m.hand.filter((h) => h.playable).every((h) => h.face.key === m.drawn!.key)).toBe(
          true,
        );
        return;
      }
    }
    throw new Error('no seed produced a playable draw');
  });

  it('describes the rule in force', () => {
    const s = crazy();
    expect(modelFor('crazy-cards', s, 'ada').ruleLine).toContain('on top');
  });
});

describe('moves', () => {
  it('a plain play carries the card; leaving one card makes the call', () => {
    const s = crazy(['ada', 'bola']);
    const cur = currentOf('crazy-cards', s);
    const m = modelFor('crazy-cards', s, cur);
    const face = m.hand.find((h) => h.playable && h.face.suit !== 'wild')?.face ?? m.hand[0]!.face;
    const mv = playMove(m, face) as Record<string, unknown>;
    expect(mv).toMatchObject({ kind: 'play', card: face.raw });
    expect(mv.call).toBeUndefined();
    const two = { ...m, hand: m.hand.slice(0, 2) };
    expect(callsLastCard(two)).toBe(true);
    expect((playMove(two, face) as { call?: boolean }).call).toBe(true);
  });

  it('a Crazy card names a colour (default: the one you hold most), a Whot names a shape', () => {
    const s = crazy(['ada', 'bola']);
    const m = modelFor('crazy-cards', s, currentOf('crazy-cards', s));
    const wild = crazyFace({ color: 'wild', value: 'wild' });
    expect(choiceNeeded(wild)).toBe('color');
    expect((playMove(m, wild, 'green') as { color: string }).color).toBe('green');
    expect(['red', 'yellow', 'green', 'blue']).toContain(
      (playMove(m, wild) as { color: string }).color,
    );
    const whot = whotFace({ shape: 'whot', n: 20 });
    expect(choiceNeeded(whot)).toBe('shape');
    expect(choiceNeeded(whotFace({ shape: 'star', n: 3 }))).toBeNull();
  });

  it('every Crazy Cards move the app builds is accepted by the engine, to the end of a game', () => {
    let s = crazy(['ada', 'bola', 'chi']);
    for (let i = 0; i < 1500 && s.endReason === null; i++) {
      const by = currentOf('crazy-cards', s);
      const m = modelFor('crazy-cards', s, by);
      const pick = m.hand.find((h) => h.playable);
      const action = (
        pick ? playMove(m, pick.face) : m.canPass ? { kind: 'pass' } : { kind: 'draw' }
      ) as never;
      expect(crazyCardsEngine.validate(s, by, action)).toEqual({ ok: true });
      s = crazyCardsEngine.apply(s, by, action);
    }
    expect(s.endReason).not.toBeNull();
  });

  it('every Whot! move the app builds is accepted by the engine, to the end of a game', () => {
    let s = initState('whot', ['ada', 'bola', 'chi']) as WhotState;
    for (let i = 0; i < 3000 && s.endReason === null; i++) {
      const by = currentOf('whot', s);
      const m = modelFor('whot', s, by);
      const pick = m.hand.find((h) => h.playable);
      const action = (pick ? playMove(m, pick.face) : { kind: 'draw' }) as never;
      expect(whotEngine.validate(s, by, action)).toEqual({ ok: true });
      s = whotEngine.apply(s, by, action);
    }
    expect(s.endReason).not.toBeNull();
  });

  it('mostHeld ignores wilds', () => {
    const m = modelFor('crazy-cards', crazy(), 'ada');
    expect(['red', 'yellow', 'green', 'blue']).toContain(mostHeld(m.hand, 'crazy-cards'));
    expect(mostHeld([], 'whot')).toBe('circle');
  });
});

describe('Whot! table', () => {
  it('reads the same shape of table', () => {
    const s = initState('whot', ['ada', 'bola', 'chi']);
    const m = modelFor('whot', s, currentOf('whot', s));
    expect(m.game).toBe('whot');
    expect(m.hand.length).toBeGreaterThanOrEqual(5);
    expect(m.deckCount).toBeGreaterThan(20);
    expect(m.colorInForce).toBeNull();
    expect(m.canDraw).toBe(true);
    expect(m.drawLabel).toBe('Go to market');
    expect(m.direction).toBe(1);
  });

  it('shows every hand and the points when the game is over', () => {
    const s = advance('whot', initState('whot', ['ada', 'bola', 'chi']), 3000);
    const m = modelFor('whot', s, 'ada');
    expect(m.over).toBe(true);
    expect(m.myTurn).toBe(false);
    expect(m.seats.every((x) => x.revealed !== null)).toBe(true);
  });
});

describe('words', () => {
  it('says what just happened and what is in force', () => {
    const s = advance('crazy-cards', crazy(['ada', 'bola']), 1);
    const m = modelFor('crazy-cards', s, 'ada');
    expect(eventLine(m, nameOf)).toMatch(/Ada|Bola/);
    expect(inForceLine(m)).toMatch(/in play$/);
    expect(inForceLine(modelFor('whot', initState('whot', ['ada', 'bola']), 'ada'))).toBeNull();
  });

  it('sorts a hand by colour then number with wilds last', () => {
    const faces = sortFaces([
      crazyFace({ color: 'wild', value: 'wild' }),
      crazyFace({ color: 'blue', value: '9' }),
      crazyFace({ color: 'red', value: 'skip' }),
      crazyFace({ color: 'red', value: '3' }),
    ]);
    expect(faces.map((f) => f.key)).toEqual(['c:red:3', 'c:red:skip', 'c:blue:9', 'c:wild:wild']);
  });

  it('names Crazy Cards in our own words, never the trademarked ones', () => {
    expect(crazyFace({ color: 'wild', value: 'draw_four' }).label).toBe('Crazy card, draw four');
    expect(crazyFace({ color: 'wild', value: 'wild' }).label).toBe('Crazy card');
    expect(crazyFace({ color: 'blue', value: 'draw_two' }).label).toBe('Blue Draw Two');
    expect(crazyFace({ color: 'green', value: 'skip' }).label).not.toMatch(/uno/i);
  });
});
