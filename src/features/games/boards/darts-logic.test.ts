import { dartsEngine, readDartboard, type DartsState } from '@dyce/games';
import {
  AIM_MAX,
  boardToWorld,
  checkout,
  chipLine,
  clockTarget,
  dartCopy,
  dartLabel,
  dartsScoreLine,
  hintLine,
  numberSpots,
  parseDartsView,
  planDart,
  readingLabel,
  replayDart,
  sampleDart,
  scoreText,
  stepAim,
  stuckAfter,
  targetLabel,
  targetPoint,
  toAim,
  turnScored,
  worldToBoard,
  START,
  type DartRecord,
  type DartsView,
} from './darts-logic';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bo');

const fresh = (variant: '501' | 'clock' = '501', wobble = 0): DartsState =>
  dartsEngine.init([A, B], 5n, { variant, wobble });
const wire = (s: DartsState): unknown => JSON.parse(JSON.stringify(dartsEngine.view(s, A)));
const viewOf = (s: DartsState): DartsView => {
  const v = parseDartsView(wire(s));
  if (!v) throw new Error('view did not parse');
  return v;
};
const throwAt = (s: DartsState, by: string, x: number, y: number) =>
  dartsEngine.apply(s, by, { kind: 'throw', x, y });

describe('parseDartsView', () => {
  it('reads the engine view as it arrives over the wire', () => {
    const v = viewOf(fresh());
    expect(v.players).toEqual([A, B]);
    expect(v.variant).toBe('501');
    expect(v.left[A]).toBe(501);
    expect(v.dartsLeft).toBe(3);
    expect(v.turnDarts).toEqual([]);
    expect(v.last).toBeNull();
  });

  it('reads a view with darts in the turn', () => {
    const s = throwAt(throwAt(fresh(), A, 0, 0), A, 0, 1030);
    const v = viewOf(s);
    expect(v.turnDarts).toHaveLength(2);
    expect(v.last?.ring).toBe('triple');
    expect(v.left[A]).toBe(501 - 50 - 60);
    expect(turnScored(v)).toBe(110);
  });

  it('refuses what it does not recognise', () => {
    const ok = wire(fresh()) as Record<string, unknown>;
    expect(parseDartsView(null)).toBeNull();
    expect(parseDartsView({})).toBeNull();
    expect(parseDartsView({ ...ok, variant: 'x' })).toBeNull();
    expect(parseDartsView({ ...ok, turn: 5 })).toBeNull();
    expect(parseDartsView({ ...ok, left: { [A]: 1 } })).toBeNull();
    expect(parseDartsView({ ...ok, turnDarts: [{ seq: 1 }] })).toBeNull();
    expect(parseDartsView({ ...ok, finishedWith: { [A]: 'x', [B]: null } })).toBeNull();
  });
});

describe('the board', () => {
  it('round-trips the board and the world', () => {
    const w = boardToWorld({ x: 1234, y: -567 });
    expect(w[0]).toBeCloseTo(0.1234, 9);
    expect(w[1]).toBeCloseTo(-0.0567, 9);
    expect(worldToBoard(w[0], w[1])).toEqual({ x: 1234, y: -567 });
  });

  it('places the 20 at the top and 3 at the bottom, 6 right and 11 left', () => {
    const spots = numberSpots();
    expect(spots).toHaveLength(20);
    const at = (n: number) => spots.find((s) => s.n === n) as { x: number; y: number };
    expect(at(20).y).toBeGreaterThan(0.19);
    expect(Math.abs(at(20).x)).toBeLessThan(1e-9);
    expect(at(3).y).toBeLessThan(-0.19);
    expect(at(6).x).toBeGreaterThan(0.19);
    expect(at(11).x).toBeLessThan(-0.19);
  });

  it('reads what the engine reads', () => {
    expect(readingLabel({ x: 0, y: 0 })).toBe('Bull, 50');
    expect(readingLabel({ x: 0, y: 1030 })).toBe('Treble 20, 60');
    expect(readingLabel({ x: 0, y: 1660 })).toBe('Double 20, 40');
    expect(readingLabel({ x: 0, y: 1300 })).toBe('20');
    expect(readingLabel({ x: 2400, y: 2400 })).toBe('Off the board');
    expect(readingLabel({ x: 0, y: 100 })).toBe('Outer bull, 25');
  });

  it('quantises the aim to the engine range', () => {
    expect(toAim(1.4, -2.6)).toEqual({ x: 1, y: -3 });
    expect(toAim(99999, -99999)).toEqual({ x: AIM_MAX, y: -AIM_MAX });
    expect(Object.is(toAim(-0.2, 0).x, -0)).toBe(false);
    expect(stepAim(AIM_MAX - 10, 1)).toBe(AIM_MAX);
  });

  it('labels darts and targets', () => {
    const rec = (ring: DartRecord['ring'], number: number) => ({ ring, number });
    expect(dartLabel(rec('triple', 20))).toBe('T20');
    expect(dartLabel(rec('double', 16))).toBe('D16');
    expect(dartLabel(rec('single', 5))).toBe('5');
    expect(dartLabel(rec('dbull', 50))).toBe('Bull');
    expect(dartLabel(rec('bull', 25))).toBe('25');
    expect(dartLabel(rec('miss', 0))).toBe('Miss');
    expect(targetLabel({ ring: 'dbull', n: 50 })).toBe('Bull');
  });
});

describe('checkout hints', () => {
  const route = (left: number, darts = 3) => checkout(left, darts)?.map(targetLabel);

  it('gives the usual routes', () => {
    expect(route(170)).toEqual(['T20', 'T20', 'Bull']);
    expect(route(40)).toEqual(['D20']);
    expect(route(100)).toEqual(['T20', 'D20']);
    expect(route(50)).toEqual(['Bull']);
    expect(route(2)).toEqual(['D1']);
  });

  it('ends on a double and adds up', () => {
    for (let left = 2; left <= 170; left++) {
      const r = checkout(left, 3);
      if (!r) continue;
      const sum = r.reduce((s, t) => s + targetPointValue(t), 0);
      expect(sum).toBe(left);
      const last = r[r.length - 1];
      expect(last?.ring === 'double' || last?.ring === 'dbull').toBe(true);
    }
  });

  it('says no for scores that cannot be finished', () => {
    expect(checkout(169, 3)).toBeNull();
    expect(checkout(501, 3)).toBeNull();
    expect(checkout(1, 3)).toBeNull();
    expect(checkout(0, 3)).toBeNull();
    // With one dart left only a double finishes.
    expect(checkout(100, 1)).toBeNull();
    expect(route(40, 1)).toEqual(['D20']);
  });

  it('aims at the middle of the target', () => {
    const p = targetPoint({ ring: 'triple', n: 20 });
    expect(readDartboard(p.x, p.y)).toMatchObject({ ring: 'triple', number: 20 });
    const d = targetPoint({ ring: 'double', n: 16 });
    expect(readDartboard(d.x, d.y)).toMatchObject({ ring: 'double', number: 16 });
  });

  it('knows the next number in Around the clock', () => {
    expect(targetLabel(clockTarget(21))).toBe('1');
    expect(targetLabel(clockTarget(2))).toBe('20');
    expect(targetLabel(clockTarget(1))).toBe('Bull');
    const v = viewOf(fresh('clock'));
    expect(hintLine(v, A)).toBe('Next: 1');
    expect(scoreText(v, A)).toBe('1');
  });

  it('shows the finish in the hint when there is one', () => {
    const v = { ...viewOf(fresh()), left: { [A]: 170, [B]: 501 } };
    expect(hintLine(v, A)).toBe('Finish: T20 · T20 · Bull');
    expect(hintLine(v, B)).toBeNull();
  });
});

function targetPointValue(t: { ring: string; n: number }): number {
  return t.ring === 'triple'
    ? 3 * t.n
    : t.ring === 'double'
      ? 2 * t.n
      : t.ring === 'dbull'
        ? 50
        : t.ring === 'bull'
          ? 25
          : t.n;
}

describe('plans', () => {
  it('flies from the hand to where it lands', () => {
    const plan = planDart({ x: 100, y: 1030 }, []);
    const start = sampleDart(plan, 0);
    const end = sampleDart(plan, plan.durationMs);
    expect(start).toEqual([START[0], START[1], START[2]]);
    expect(end[0]).toBeCloseTo(0.01, 9);
    expect(end[1]).toBeCloseTo(0.103, 9);
    expect(end[2]).toBeCloseTo(0, 9);
    // Clamped past the ends.
    expect(sampleDart(plan, -50)).toEqual(start);
    expect(sampleDart(plan, 99999)).toEqual(end);
    // Climbs above the straight line in the middle.
    const mid = sampleDart(plan, plan.durationMs / 2);
    expect(mid[1] as number).toBeGreaterThan(((start[1] as number) + (end[1] as number)) / 2);
  });

  it('has a different key when the server wobbles the dart', () => {
    expect(planDart({ x: 1, y: 2 }, []).key).not.toBe(planDart({ x: 1, y: 3 }, []).key);
  });

  it('lists the darts standing in the board after a plan', () => {
    const s = throwAt(fresh(), A, 0, 0);
    const v = viewOf(s);
    const plan = planDart({ x: 5, y: 6 }, v.turnDarts);
    expect(stuckAfter(plan)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 6 },
    ]);
  });
});

describe('replayDart', () => {
  it('replays the unseen darts of a turn in order, each with the darts before it', () => {
    const s = throwAt(throwAt(fresh(), A, 0, 0), A, 0, 1030);
    const v = viewOf(s);
    const first = replayDart(v, 0);
    expect(first?.shot.seq).toBe(1);
    expect(first?.plan?.data.stuck).toEqual([]);
    const second = replayDart(v, 1);
    expect(second?.shot.seq).toBe(2);
    expect(second?.plan?.data.stuck.map((d) => d.seq)).toEqual([1]);
    expect(replayDart(v, 2)).toBeNull();
  });

  it('replays the last dart of a finished turn even though the list was cleared', () => {
    let s = fresh();
    for (let i = 0; i < 3; i++) s = throwAt(s, A, 0, 1030);
    const v = viewOf(s);
    expect(v.turnDarts).toEqual([]);
    expect(replayDart(v, 2)?.shot.seq).toBe(3);
  });
});

describe('words', () => {
  it('describes a dart, a bust, a miss and a finish', () => {
    const base: DartRecord = {
      seq: 1,
      by: A,
      input: { x: 0, y: 0 },
      hit: { x: 0, y: 0 },
      ring: 'triple',
      number: 20,
      points: 60,
      bust: false,
      finished: false,
    };
    const v = { ...viewOf(fresh()), left: { [A]: 141, [B]: 501 } };
    expect(dartCopy(base, v, A, nameOf)).toEqual({ text: 'You hit treble 20: 60', tone: 'hit' });
    expect(
      dartCopy({ ...base, by: B, ring: 'single', number: 5, points: 5 }, v, A, nameOf).text,
    ).toBe('Bo hit 5: 5');
    expect(dartCopy({ ...base, ring: 'miss', number: 0, points: 0 }, v, A, nameOf).tone).toBe(
      'miss',
    );
    const bust = dartCopy({ ...base, bust: true }, v, A, nameOf);
    expect(bust.tone).toBe('foul');
    expect(bust.text).toBe('Bust! You go back to 141');
    expect(
      dartCopy({ ...base, ring: 'double', number: 16, points: 32, finished: true }, v, A, nameOf)
        .text,
    ).toBe('You checked out on double 16');
  });

  it('says whose throw it is under the opponent name', () => {
    const v = viewOf(fresh());
    expect(chipLine(v, A, B)).toBe('0 darts · your throw');
    expect(chipLine(v, B, A)).toBe('0 darts · throwing');
  });

  it('reads out the score line', () => {
    const v = { ...viewOf(fresh()), left: { [A]: 141, [B]: 177 } };
    expect(dartsScoreLine(v, A, nameOf)).toBe('You 141 left · Bo 177 left');
    const done = { ...v, finishedWith: { [A]: 14, [B]: null } };
    expect(dartsScoreLine(done, A, nameOf)).toBe('You finished in 14 darts · Bo 177 left');
  });
});
