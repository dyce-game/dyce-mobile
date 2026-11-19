import { cupPongEngine, cupPongRack, type CupPongState } from '@dyce/games';
import {
  canRerack,
  cupPongScoreLine,
  forgetPlayed,
  hasPlayed,
  holdsForFinalThrow,
  inputFromDrag,
  markPlayed,
  moverOf,
  parseCupPongView,
  predictThrow,
  preThrowRack,
  replayThrow,
  rerackSpots,
  sampleTrace,
  stepAim,
  stepPower,
  tableOwner,
  throwCopy,
  toInput,
  traceMs,
  turnLine,
  type CupPongView,
} from './cup-pong-logic';

const A = 'user-a';
const B = 'user-b';

/** The engine's own view, as the server would send it. */
const viewOf = (s: CupPongState) => JSON.parse(JSON.stringify(cupPongEngine.view(s, A)));
const fresh = () => cupPongEngine.init([A, B], 7n, {});
const parsed = (s: CupPongState): CupPongView => parseCupPongView(viewOf(s)) as CupPongView;

/** Throw with fixed inputs until `pick` likes the result, so tests don't depend on a lucky seed. */
function throwUntil(
  s0: CupPongState,
  by: string,
  pick: (s: CupPongState) => boolean,
): CupPongState {
  for (let power = 300; power < 800; power += 3) {
    for (const aim of [0, -30, 30, 60, -60, 100, -100]) {
      const s = cupPongEngine.apply(s0, by, { kind: 'throw', aim, power });
      if (pick(s)) return s;
    }
  }
  throw new Error('no throw found');
}

describe('parseCupPongView', () => {
  it('reads the engine view (and the view has no rng)', () => {
    const raw = viewOf(fresh());
    expect(raw).not.toHaveProperty('rng');
    const v = parseCupPongView(raw);
    expect(v?.players).toEqual([A, B]);
    expect(v?.racks[A]).toHaveLength(10);
    expect(v?.last).toBeNull();
    expect(moverOf(v as CupPongView)).toBe(A);
  });

  it('refuses a view that is not Cup Pong', () => {
    expect(parseCupPongView(null)).toBeNull();
    expect(parseCupPongView({})).toBeNull();
    expect(parseCupPongView({ ...viewOf(fresh()), players: [A] })).toBeNull();
    expect(
      parseCupPongView({ ...viewOf(fresh()), racks: { [A]: [{ id: 'x' }], [B]: [] } }),
    ).toBeNull();
    expect(parseCupPongView({ ...viewOf(fresh()), last: { seq: 1 } })).toBeNull();
  });
});

describe('what is on the table', () => {
  it("shows the other player's cups on your turn and your own on theirs", () => {
    const v = parsed(fresh());
    expect(tableOwner(v, A)).toBe(B);
    expect(tableOwner(v, B)).toBe(B);
  });

  it('after the game, the table the last throw was aimed at', () => {
    const v = { ...parsed(fresh()), over: true, last: { seq: 1, by: B } as never };
    expect(tableOwner(v, A)).toBe(A);
  });

  it('re-rack: only once, before the first ball, with 2 to 6 cups', () => {
    let s = fresh();
    expect(canRerack(parsed(s), A)).toBe(false); // ten cups
    s = { ...s, racks: { ...s.racks, [A]: cupPongRack().slice(0, 5) } };
    expect(canRerack(parsed(s), A)).toBe(true);
    expect(canRerack(parsed(s), B)).toBe(false); // not their turn
    expect(canRerack(parsed({ ...s, ballsLeft: 2 }), A)).toBe(false);
    expect(canRerack(parsed({ ...s, rerackUsed: { ...s.rerackUsed, [A]: true } }), A)).toBe(false);
  });

  it('knows the re-rack shapes from the engine', () => {
    expect(rerackSpots(10)).toBeNull();
    expect(rerackSpots(6)).toHaveLength(6);
    expect(rerackSpots(2)).toHaveLength(2);
    expect(rerackSpots(7)).toBeNull();
  });
});

describe('input', () => {
  const size = { width: 400, height: 800 };

  it('a short drag is a tap, not a throw', () => {
    expect(inputFromDrag(0, 10, size)).toBeNull();
    expect(inputFromDrag(50, -200, size)).toBeNull();
  });

  it('turns a drag into integers inside the legal range', () => {
    expect(inputFromDrag(0, 200, size)).toEqual({ aim: 0, power: 500 });
    expect(inputFromDrag(9999, 99999, size)).toEqual({ aim: 500, power: 1000 });
    expect(Number.isInteger(inputFromDrag(37.3, 211.7, size)?.power)).toBe(true);
    expect(inputFromDrag(-9999, 300, size)?.aim).toBe(-500);
  });

  it('never sends -0 or a fraction, whatever the sliders hold', () => {
    expect(Object.is(toInput(-0.2, 10).aim, 0)).toBe(true);
    expect(toInput(12.6, 999.5)).toEqual({ aim: 13, power: 1000 });
    expect(toInput(-900, -4)).toEqual({ aim: -500, power: 0 });
  });

  it('steps stop at the ends', () => {
    expect(stepAim(495, 1)).toBe(500);
    expect(stepAim(-495, -1)).toBe(-500);
    expect(stepPower(5, -1)).toBe(0);
    expect(stepPower(995, 1)).toBe(1000);
  });

  it("every input the app can build passes the engine's own check", () => {
    const s = fresh();
    for (const [dx, dy] of [
      [0, 40],
      [500, 900],
      [-500, 900],
      [12, 333],
    ] as const) {
      const input = inputFromDrag(dx, dy, size);
      expect(input).not.toBeNull();
      const r = cupPongEngine.validate(s, A, {
        kind: 'throw',
        aim: (input as { aim: number }).aim,
        power: (input as { power: number }).power,
      });
      expect(r.ok).toBe(true);
    }
  });
});

describe('replaying a throw', () => {
  it('the app simulation agrees with the engine for the input it applied', () => {
    const s0 = fresh();
    const s1 = throwUntil(s0, A, (s) => s.last?.sunk !== null);
    const v = parsed(s1);
    const replay = replayThrow(v);
    expect(replay).not.toBeNull();
    expect(replay?.prediction.sunk).toBe(v.last?.sunk);
    expect(replay?.rack).toEqual(s0.racks[B]);
    expect(replay?.prediction.trace.length).toBeGreaterThan(10);
  });

  it('a miss replays as a miss with the cups unchanged', () => {
    const s1 = cupPongEngine.apply(fresh(), A, { kind: 'throw', aim: 400, power: 100 });
    const v = parsed(s1);
    expect(v.last?.sunk).toBeNull();
    expect(preThrowRack(v)).toEqual(v.racks[B]);
    expect(replayThrow(v)?.prediction.sunk).toBeNull();
  });

  it('puts a sunk cup back where it stood, also after a re-rack', () => {
    // Defender B has 5 cups and re-racks them; then A sinks one.
    let s = fresh();
    s = { ...s, racks: { ...s.racks, [B]: cupPongRack().slice(0, 5) }, turn: 1 };
    s = cupPongEngine.apply(s, B, { kind: 'rerack' });
    const before = s.racks[B];
    s = { ...s, turn: 0, ballsLeft: 3 };
    const after = throwUntil(s, A, (t) => t.last?.sunk !== null);
    const v = parsed(after);
    expect(preThrowRack(v)).toEqual(before);
    expect(replayThrow(v)?.prediction.sunk).toBe(v.last?.sunk);
  });

  it('plays once per throw on this device, and holds the result for an unseen final throw', () => {
    forgetPlayed();
    expect(hasPlayed('m1', 3)).toBe(false);
    markPlayed('m1', 3);
    expect(hasPlayed('m1', 3)).toBe(true);
    expect(hasPlayed('m1', 2)).toBe(true);
    expect(hasPlayed('m1', 4)).toBe(false);
    const v = { ...parsed(fresh()), over: true, last: { seq: 5 } as never };
    expect(holdsForFinalThrow('m1', v)).toBe(true);
    markPlayed('m1', 5);
    expect(holdsForFinalThrow('m1', v)).toBe(false);
    expect(holdsForFinalThrow('m1', parsed(fresh()))).toBe(false);
  });
});

describe('traces', () => {
  it('samples between keyframes and holds the last one', () => {
    const trace = [
      [0, 300, 150],
      [10, 400, 250],
      [20, 300, 350],
    ] as const;
    expect(sampleTrace(trace, 0)).toEqual([0, 300, 150]);
    expect(sampleTrace(trace, 1000 / 30 / 2)).toEqual([5, 350, 200]);
    expect(sampleTrace(trace, 9999)).toEqual([20, 300, 350]);
    expect(traceMs(trace)).toBeCloseTo(66.67, 1);
  });

  it('a real throw takes a fraction of a second to a few seconds', () => {
    const p = predictThrow(cupPongRack(), { aim: 0, power: 540 });
    expect(p.durationMs).toBeGreaterThan(300);
    expect(p.durationMs).toBeLessThan(3000);
  });
});

describe('words', () => {
  const name = (id: string) => (id === A ? 'Ada' : 'Zainab');
  const base = {
    seq: 1,
    input: { aim: 0, power: 0 },
    applied: { aim: 0, power: 0 },
    bounces: 0,
    rimHits: 0,
    endX: 0,
    endZ: 0,
  };

  it('says what happened to each side', () => {
    expect(throwCopy({ ...base, by: A, sunk: 3 }, A, name).tone).toBe('hit');
    expect(throwCopy({ ...base, by: B, sunk: 3 }, A, name).text).toBe(
      'Zainab sank one of your cups',
    );
    expect(throwCopy({ ...base, by: A, sunk: null, rimHits: 1 }, A, name).tone).toBe('rim');
    expect(throwCopy({ ...base, by: A, sunk: null }, A, name).text).toBe('Missed');
  });

  it('turn line and score line', () => {
    const v = parsed(fresh());
    expect(turnLine(v, A, 'Zainab')).toEqual({ text: 'Your throw · 3 balls left', mine: true });
    expect(turnLine(v, B, 'Ada')).toEqual({ text: 'Ada is throwing', mine: false });
    expect(cupPongScoreLine({ ...v, sunk: { [A]: 4, [B]: 1 } }, B, name)).toBe(
      'You 1 cup · Ada 4 cups',
    );
  });
});
