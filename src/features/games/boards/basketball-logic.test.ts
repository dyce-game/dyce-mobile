import { basketballEngine, type BasketballState } from '@dyce/games';
import {
  AIM_MAX,
  POWER_MAX,
  basketballCamera,
  basketballScoreLine,
  chipLine,
  courtToWorld,
  guidePoints,
  inputFromFlick,
  isMoney,
  parseBasketballView,
  planFromRecord,
  planShot,
  rackLine,
  replayShot,
  restWorld,
  sampleShot,
  shooterStats,
  shotCopy,
  shotsAtRack,
  spotWorld,
  stepAim,
  stepPower,
  throughAt,
  toInput,
  type BasketballView,
  type ShotRecord,
} from './basketball-logic';
import { cameraPose, project } from './r3f-common/camera-math';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bo');

const fresh = (cfg = {}): BasketballState => basketballEngine.init([A, B], 9n, cfg);
const wire = (s: BasketballState): unknown =>
  JSON.parse(JSON.stringify(basketballEngine.view(s, A)));
const viewOf = (s: BasketballState): BasketballView => {
  const v = parseBasketballView(wire(s));
  if (!v) throw new Error('view did not parse');
  return v;
};
const shoot = (s: BasketballState, by: string, aim = 0, power = 520) =>
  basketballEngine.apply(s, by, { kind: 'shoot', aim, power });
const run = (s: BasketballState, by: string, n: number) => {
  let next = s;
  for (let i = 0; i < n; i++) next = shoot(next, by);
  return next;
};

describe('parseBasketballView', () => {
  it('reads the engine view as it arrives over the wire', () => {
    const v = viewOf(fresh());
    expect(v.players).toEqual([A, B]);
    expect(v.racks).toBe(5);
    expect(v.shotsPerRack).toBe(5);
    expect(v.shotsLeft).toBe(5);
    expect(v.last).toBeNull();
    expect(v.shots[A]).toEqual([]);
  });

  it('reads a view with shots', () => {
    const v = viewOf(shoot(fresh(), A));
    expect(v.last?.by).toBe(A);
    expect(v.shots[A]).toHaveLength(1);
    expect(v.last?.applied.power).toBeGreaterThan(0);
  });

  it('refuses what it does not recognise', () => {
    const ok = wire(shoot(fresh(), A)) as Record<string, unknown>;
    expect(parseBasketballView(null)).toBeNull();
    expect(parseBasketballView({})).toBeNull();
    expect(parseBasketballView({ ...ok, turn: 3 })).toBeNull();
    expect(parseBasketballView({ ...ok, score: { [A]: 1 } })).toBeNull();
    expect(parseBasketballView({ ...ok, shots: { [A]: [{ seq: 1 }], [B]: [] } })).toBeNull();
    expect(parseBasketballView({ ...ok, last: { seq: 1 } })).toBeNull();
    expect(parseBasketballView({ ...ok, racks: 'x' })).toBeNull();
  });
});

describe('the court', () => {
  it('flips z so the shooter looks down -z with x to their right', () => {
    expect(courtToWorld(1000, 2000, -6000)).toEqual([1, 2, 6]);
    const top = spotWorld(2);
    expect(top[2]).toBeGreaterThan(6);
    expect(spotWorld(0)[0]).toBeLessThan(0);
    expect(spotWorld(4)[0]).toBeGreaterThan(0);
    expect(restWorld(2)[1]).toBeCloseTo(2.1, 9);
  });

  it('puts the camera behind the shooter and the hoop in the upper half of the picture', () => {
    for (let rack = 0; rack < 5; rack++) {
      const spec = basketballCamera(rack);
      const pose = cameraPose(spec, 390, 700);
      const spot = spotWorld(rack);
      // Further from the hoop than the spot, on the same side.
      expect(Math.hypot(pose.position[0], pose.position[2])).toBeGreaterThan(
        Math.hypot(spot[0], spot[2]),
      );
      const hoop = project(pose, [0, 3.048, 0], 390, 700);
      expect(hoop).not.toBeNull();
      expect((hoop as { y: number }).y).toBeLessThan(350);
      const ball = project(pose, restWorld(rack), 390, 700);
      expect((ball as { y: number }).y).toBeGreaterThan(350);
      expect((ball as { y: number }).y).toBeLessThan(700);
    }
  });

  it('marks the last rack as the money rack', () => {
    const v = viewOf(fresh());
    expect(isMoney(v)).toBe(false);
    expect(isMoney(v, 4)).toBe(true);
    expect(rackLine(v)).toBe('Rack 1 of 5 · 1 point each');
    expect(rackLine({ ...v, rack: 4 })).toBe('Rack 5 of 5 · money rack, 2 points each');
  });
});

describe('input', () => {
  it('quantises to the integers the engine takes', () => {
    expect(toInput(1.4, 519.6)).toEqual({ aim: 1, power: 520 });
    expect(toInput(9999, 9999)).toEqual({ aim: AIM_MAX, power: POWER_MAX });
    expect(toInput(-9999, -5)).toEqual({ aim: -AIM_MAX, power: 0 });
    expect(Object.is(toInput(-0.2, 0).aim, -0)).toBe(false);
    expect(stepAim(AIM_MAX - 5, 1)).toBe(AIM_MAX);
    expect(stepPower(5, -1)).toBe(0);
  });

  it('turns a flick into aim and power', () => {
    const size = { width: 390, height: 700 };
    expect(inputFromFlick(0, 10, size)).toBeNull();
    expect(inputFromFlick(0, 175, size)).toEqual({ aim: 0, power: 500 });
    expect(inputFromFlick(130, 350, size)).toEqual({ aim: AIM_MAX, power: POWER_MAX });
    expect(inputFromFlick(-65, 100, size)?.aim).toBe(-250);
    expect(inputFromFlick(0, 9999, size)?.power).toBe(POWER_MAX);
  });
});

describe('plans', () => {
  it('predicts with the engine simulation and agrees with the server when the input is the one it applied', () => {
    const s = shoot(fresh(), A);
    const v = viewOf(s);
    const rec = v.last as ShotRecord;
    const plan = planFromRecord(rec);
    expect(plan.data.made).toBe(rec.made);
    expect(plan.data.swish).toBe(rec.swish);
    expect(plan.data.rack).toBe(0);
  });

  it('takes longer after a make so the ball can fall through the net', () => {
    let made: ReturnType<typeof planShot> | null = null;
    for (let p = 500; p <= 540 && !made; p += 5) {
      const plan = planShot(2, { aim: 0, power: p });
      if (plan.data.made) made = plan;
    }
    expect(made).not.toBeNull();
    const plan = made as ReturnType<typeof planShot>;
    expect(plan.durationMs).toBeGreaterThan(((plan.data.trace.length - 1) * 1000) / 30);
    expect(throughAt(plan)).toBeCloseTo(((plan.data.trace.length - 1) * 1000) / 30, 6);
    // It falls below the rim after going through.
    const through = sampleShot(plan, throughAt(plan));
    const later = sampleShot(plan, plan.durationMs);
    expect(later[1] as number).toBeLessThan(through[1] as number);
  });

  it('starts at the release point and ends where the trace ends', () => {
    const plan = planShot(1, { aim: 0, power: 500 });
    const first = plan.data.trace[0] as number[];
    expect(sampleShot(plan, 0)).toEqual(first);
    expect(Math.round(first[1] as number)).toBe(2100);
    const last = plan.data.trace.at(-1) as number[];
    if (!plan.data.made) expect(sampleShot(plan, plan.durationMs)).toEqual(last);
  });

  it('draws the first part of the flight for the aim guide', () => {
    const g = guidePoints(2, { aim: 0, power: 520 });
    expect(g.length).toBeGreaterThan(3);
    expect(g[0]?.[1]).toBeGreaterThan(2.1);
    expect(guidePoints(2, { aim: 0, power: 520 }, 0.2).length).toBeLessThan(g.length);
  });
});

describe('replayShot', () => {
  it('replays the other player run, oldest first, and nothing of mine', () => {
    let s = run(fresh(), A, 3);
    let v = viewOf(s);
    // I am B: A's three shots are new to me.
    const a = replayShot(v, B, 0);
    expect(a?.shot.seq).toBe(1);
    expect(replayShot(v, B, 1)?.shot.seq).toBe(2);
    expect(replayShot(v, B, 3)).toBeNull();
    // I am A: nothing to replay.
    expect(replayShot(v, A, 0)).toBeNull();
    // After B answers, A sees only B's run, not their own earlier shots.
    s = run(run(s, A, 2), B, 2);
    v = viewOf(s);
    expect(replayShot(v, A, 0)?.shot.by).toBe(B);
    expect(replayShot(v, A, 0)?.shot.seq).toBe(6);
  });

  it('uses the rack the shot was taken from', () => {
    const s = run(run(fresh(), A, 5), B, 5);
    const v = viewOf(s);
    expect(v.rack).toBe(1);
    expect(replayShot(v, A, 0)?.plan.data.rack).toBe(0);
  });
});

describe('words and stats', () => {
  const base: ShotRecord = {
    seq: 3,
    by: A,
    rack: 0,
    shot: 3,
    input: { aim: 0, power: 520 },
    applied: { aim: 0, power: 520 },
    made: true,
    swish: true,
    rimHits: 0,
    boardHits: 0,
    money: false,
    points: 1,
    endX: 0,
    endZ: 0,
  };

  it('says what the shot did', () => {
    expect(shotCopy(base, A, nameOf)).toEqual({ text: 'Swish! +1', tone: 'hit' });
    expect(shotCopy({ ...base, by: B, swish: false, rimHits: 2 }, A, nameOf).text).toBe(
      'Bo: Rattled in! +1',
    );
    expect(shotCopy({ ...base, swish: false, boardHits: 1 }, A, nameOf).text).toBe(
      'Off the glass and in! +1',
    );
    expect(shotCopy({ ...base, money: true, points: 2 }, A, nameOf).text).toBe(
      'Swish! Money ball, +2',
    );
    expect(
      shotCopy({ ...base, made: false, swish: false, rimHits: 1, points: 0 }, A, nameOf).tone,
    ).toBe('rim');
    expect(
      shotCopy({ ...base, made: false, swish: false, boardHits: 1, points: 0 }, A, nameOf).text,
    ).toBe('Off the backboard, no good');
    expect(shotCopy({ ...base, made: false, swish: false, points: 0 }, B, nameOf).text).toBe(
      'Ada missed',
    );
  });

  it('counts a rack and a player', () => {
    const s = run(run(fresh(), A, 5), B, 2);
    const v = viewOf(s);
    expect(shotsAtRack(v, A, 0)).toHaveLength(5);
    expect(shotsAtRack(v, B, 0)).toHaveLength(2);
    expect(shotsAtRack(v, A, 1)).toHaveLength(0);
    const st = shooterStats(v, A);
    expect(st.taken).toBe(5);
    expect(st.made).toBe(v.made[A]);
    expect(st.money).toBe(0);
  });

  it('reads out the score and the opponent line', () => {
    const v = viewOf(fresh());
    const scored = { ...v, score: { [A]: 12, [B]: 1 } };
    expect(basketballScoreLine(scored, A, nameOf)).toBe('You 12 points · Bo 1 point');
    expect(chipLine(scored, A, B)).toBe('1 point · your shots');
    expect(chipLine(scored, B, A)).toBe('12 points · shooting');
  });
});
