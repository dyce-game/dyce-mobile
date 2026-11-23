import { eightBallEngine, type EightBallState } from '@dyce/games';
import {
  ANGLE_MAX,
  SPIN_MAX,
  aimGuide,
  angleBetween,
  ballsToSlots,
  ballsWithCue,
  eightBallScoreLine,
  groupLeft,
  onEight,
  parseEightBallView,
  placeBounds,
  placementFrom,
  placementOk,
  planFromRecord,
  planShot,
  powerFromPull,
  sampleShot,
  shotCopy,
  suggestPocket,
  tableToWorld,
  toShot,
  worldToTable,
  wrapAngle,
  type EightBallView,
} from './eight-ball-logic';

const A = 'user-a';
const B = 'user-b';

const fresh = (seed = 7n): EightBallState => eightBallEngine.init([A, B], seed, {});
const wire = (s: EightBallState): unknown => JSON.parse(JSON.stringify(eightBallEngine.view(s, A)));
const viewOf = (s: EightBallState): EightBallView => {
  const v = parseEightBallView(wire(s));
  if (!v) throw new Error('view did not parse');
  return v;
};
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bo');
const shoot = (s: EightBallState, by: string, angle: number, power: number) =>
  eightBallEngine.apply(s, by, { kind: 'shoot', angle, power, spinX: 0, spinY: 0 });

describe('parseEightBallView', () => {
  it('reads the engine view, as it arrives over the wire', () => {
    const v = viewOf(fresh());
    expect(v.players).toEqual([A, B]);
    expect(v.balls).toHaveLength(16);
    expect(v.hand).toBe('kitchen');
    expect(v.breaking).toBe(true);
    expect(v.groups).toBeNull();
    expect(v.last).toBeNull();
  });

  it('reads a view with a shot record', () => {
    const v = viewOf(shoot(fresh(), A, 0, 900));
    expect(v.last?.by).toBe(A);
    expect(v.last?.from).toHaveLength(16);
    expect(v.seq).toBe(1);
  });

  it('refuses what it does not recognise', () => {
    expect(parseEightBallView(null)).toBeNull();
    expect(parseEightBallView('x')).toBeNull();
    expect(parseEightBallView({})).toBeNull();
    const ok = wire(fresh()) as Record<string, unknown> & { balls: { id: number }[] };
    expect(parseEightBallView({ ...ok, balls: 'nope' })).toBeNull();
    expect(parseEightBallView({ ...ok, hand: 'sometimes' })).toBeNull();
    expect(parseEightBallView({ ...ok, turn: 2 })).toBeNull();
    expect(parseEightBallView({ ...ok, players: [A] })).toBeNull();
    expect(parseEightBallView({ ...ok, balls: ok.balls.filter((b) => b.id !== 0) })).toBeNull();
    expect(parseEightBallView({ ...ok, groups: { [A]: 'solid' } })).toBeNull();
  });
});

describe('table frame', () => {
  it('round-trips the engine frame through the world', () => {
    for (const [x, y] of [
      [0, 0],
      [560, 560],
      [2240, 1120],
      [1680, 300],
    ] as const) {
      const w = tableToWorld(x, y);
      const t = worldToTable(w[0], w[2]);
      expect(t.x).toBeCloseTo(x, 6);
      expect(t.y).toBeCloseTo(y, 6);
    }
  });

  it('puts the head end towards the camera and the engine +y on the left', () => {
    expect(tableToWorld(0, 560)[2]).toBeGreaterThan(tableToWorld(2240, 560)[2]);
    expect(tableToWorld(1000, 1000)[0]).toBeLessThan(tableToWorld(1000, 100)[0]);
  });
});

describe('input', () => {
  it('quantises to the integers the engine takes', () => {
    expect(toShot(36000, 1500, 0, 0)).toEqual({ angle: 0, power: 1000, spinX: 0, spinY: 0 });
    expect(toShot(-50, -20, 0, 0)).toEqual({ angle: ANGLE_MAX - 50, power: 0, spinX: 0, spinY: 0 });
    expect(toShot(12345.6, 499.5, 0, 0).angle).toBe(12346);
    expect(Number.isInteger(toShot(1.2, 3.4, 5.6, 7.8).power)).toBe(true);
  });

  it('keeps spin inside the circle the engine allows', () => {
    for (const [x, y] of [
      [100, 100],
      [-100, 100],
      [90, -90],
      [100, 0],
      [75, 75],
      [999, -999],
    ] as const) {
      const t = toShot(0, 0, x, y);
      expect(t.spinX * t.spinX + t.spinY * t.spinY).toBeLessThanOrEqual(SPIN_MAX * SPIN_MAX);
    }
    expect(Object.is(toShot(0, 0, -0.2, 0).spinX, -0)).toBe(false);
  });

  it('wraps angles', () => {
    expect(wrapAngle(-1)).toBe(35999);
    expect(wrapAngle(36000)).toBe(0);
    expect(wrapAngle(36001.4)).toBe(1);
  });

  it('turns two table points into an angle, and a pull into a power', () => {
    expect(angleBetween({ x: 0, y: 0 }, { x: 100, y: 0 })).toBe(0);
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: 100 })).toBe(9000);
    expect(angleBetween({ x: 0, y: 0 }, { x: -100, y: 0 })).toBe(18000);
    expect(angleBetween({ x: 0, y: 0 }, { x: 0, y: -100 })).toBe(27000);
    expect(angleBetween({ x: 5, y: 5 }, { x: 6, y: 6 })).toBeNull();
    expect(powerFromPull(10)).toBeNull();
    expect(powerFromPull(75)).toBe(500);
    expect(powerFromPull(5000)).toBe(1000);
  });
});

describe('ball in hand', () => {
  const v = viewOf(fresh());
  it('clamps a placement behind the head string on the break', () => {
    const p = placementFrom(1900, 560, 'kitchen');
    expect(p.x).toBe(5600);
    expect(Number.isInteger(p.x) && Number.isInteger(p.y)).toBe(true);
    expect(placeBounds('kitchen').xMax).toBe(560);
  });

  it('asks the engine whether a spot is legal', () => {
    expect(placementOk(v.balls, { x: 4000, y: 5600 }, 'kitchen')).toBe(true);
    const eight = v.balls.find((b) => b.id === 8);
    expect(placementOk(v.balls, { x: eight?.x ?? 0, y: eight?.y ?? 0 }, 'anywhere')).toBe(false);
    expect(placementOk(v.balls, { x: 4000, y: 5600 }, 'none')).toBe(false);
  });

  it('moves only the cue ball', () => {
    const moved = ballsWithCue(v.balls, { x: 4000, y: 4000 });
    expect(moved.find((b) => b.id === 0)).toEqual({ id: 0, x: 4000, y: 4000 });
    expect(moved.filter((b) => b.id !== 0)).toEqual(v.balls.filter((b) => b.id !== 0));
    expect(ballsWithCue(v.balls, null)).toEqual(v.balls);
  });
});

describe('aimGuide', () => {
  const v = viewOf(fresh());
  it('runs from the cue ball to the first ball in the way', () => {
    const g = aimGuide(v.balls, 0);
    expect(g.hitId).not.toBeNull();
    expect(g.to.x).toBeGreaterThan(g.from.x);
    expect(g.objectDir).not.toBeNull();
  });

  it('stops at the cushion when nothing is in the way', () => {
    const g = aimGuide(v.balls, 18000);
    expect(g.hitId).toBeNull();
    expect(g.to.x).toBeCloseTo(28.5, 6);
    expect(g.objectDir).toBeNull();
  });
});

describe('plans', () => {
  it('predicts a shot with the engine simulation and replays the server record to the same result', () => {
    const s0 = fresh(11n);
    const input = { angle: 0, power: 950, spinX: 0, spinY: 0 };
    const plan = planShot(s0.balls, input);
    expect(plan.durationMs).toBeGreaterThan(0);
    const v = viewOf(shoot(s0, A, 0, 950));
    const rec = planFromRecord(v.last as NonNullable<typeof v.last>);
    expect(rec?.key).toBe(plan.key);
    const last = rec?.data.frames.at(-1) ?? [];
    for (const b of v.balls) {
      const f = last.find((q) => q[0] === b.id);
      expect(f).toBeDefined();
      expect(f?.[1]).toBe(b.x);
      expect(f?.[2]).toBe(b.y);
    }
  });

  it('returns null when the record does not agree with the simulation', () => {
    const v = viewOf(shoot(fresh(3n), A, 0, 900));
    const rec = v.last as NonNullable<typeof v.last>;
    expect(planFromRecord({ ...rec, pocketed: [{ id: 3, pocket: 1 }] })).toBeNull();
  });

  it('samples a shot as 48 numbers, clamped at both ends', () => {
    const plan = planShot(fresh(5n).balls, { angle: 0, power: 800, spinX: 0, spinY: 0 });
    const start = sampleShot(plan, -50);
    const end = sampleShot(plan, plan.durationMs + 5000);
    expect(start).toHaveLength(48);
    expect(start).toEqual(ballsToSlots(plan.data.from));
    expect(end).toHaveLength(48);
    expect(end[2]).toBe(1);
  });
});

describe('words and groups', () => {
  it('knows when a player is on the 8', () => {
    const v = viewOf(fresh());
    const groups = { [A]: 'solid', [B]: 'stripe' } as const;
    const clear = { ...v, groups, balls: v.balls.filter((b) => b.id === 0 || b.id >= 8) };
    expect(onEight(clear, A)).toBe(true);
    expect(onEight(clear, B)).toBe(false);
    expect(groupLeft(clear, 'stripe')).toBe(7);
    expect(onEight(v, A)).toBe(false);
    expect(suggestPocket(v.balls)).toBeGreaterThanOrEqual(0);
  });

  it('describes a foul with ball in hand', () => {
    const v = viewOf(fresh());
    const shot = {
      seq: 2,
      by: A,
      input: { angle: 0, power: 100, spinX: 0, spinY: 0 },
      from: v.balls,
      firstContact: null,
      pocketed: [],
      fouls: ['no_contact' as const],
      railAfterContact: 0,
      wasBreak: false,
      reRack: false,
      keepsTurn: false,
    };
    const c = shotCopy(shot, v, A, nameOf);
    expect(c.tone).toBe('foul');
    expect(c.text).toContain('Foul');
    expect(c.text).toContain('Bo has the cue ball in hand');
    expect(shotCopy({ ...shot, by: B }, v, A, nameOf).text).toContain('Ball in hand for you');
    expect(shotCopy({ ...shot, fouls: [] }, v, A, nameOf).tone).toBe('miss');
    expect(
      shotCopy({ ...shot, fouls: [], pocketed: [{ id: 3, pocket: 1 }] }, v, A, nameOf).text,
    ).toBe('You potted the 3');
    expect(shotCopy({ ...shot, reRack: true }, v, A, nameOf).text).toContain('re-racked');
  });

  it('reads out the score line', () => {
    const v = viewOf(fresh());
    expect(eightBallScoreLine(v, A, nameOf)).toBe('The table never closed');
    const closed = { ...v, groups: { [A]: 'solid', [B]: 'stripe' } as const };
    expect(eightBallScoreLine(closed, A, nameOf)).toBe('You 7 balls left · Bo 7 balls left');
  });
});
