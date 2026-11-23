import { archeryEngine, flyArcheryArrow, type ArcheryState } from '@dyce/games';
import {
  AIM_MAX,
  DISTANCE_M,
  DRAW_MAX,
  EYE_H,
  archerStats,
  archeryScoreLine,
  arrowCopy,
  arrowDirection,
  arrowLabel,
  arrowsOnTarget,
  chipLine,
  compensation,
  currentWind,
  dragAim,
  endLine,
  faceToWorld,
  parseArcheryView,
  planArrow,
  planFromRecord,
  predictArrow,
  pushLine,
  replayArrow,
  ringColors,
  sampleArrow,
  shownEnd,
  toInput,
  windPushMm,
  windSpeed,
  windWords,
  ARCHERY_CAMERA,
  SLOWDOWN,
  type ArcheryView,
  type ArrowRecord,
} from './archery-logic';
import { cameraPose, project } from './r3f-common/camera-math';

const A = 'user-a';
const B = 'user-b';
const nameOf = (id: string) => (id === A ? 'Ada' : 'Bo');

const fresh = (cfg = {}): ArcheryState => archeryEngine.init([A, B], 13n, cfg);
const wire = (s: ArcheryState): unknown => JSON.parse(JSON.stringify(archeryEngine.view(s, A)));
const viewOf = (s: ArcheryState): ArcheryView => {
  const v = parseArcheryView(wire(s));
  if (!v) throw new Error('view did not parse');
  return v;
};
const shoot = (s: ArcheryState, by: string, aimX = 0, aimY = 0, draw = 1000) =>
  archeryEngine.apply(s, by, { kind: 'shoot', aimX, aimY, draw });
const run = (s: ArcheryState, by: string, n: number) => {
  let next = s;
  for (let i = 0; i < n; i++) next = shoot(next, by);
  return next;
};

describe('parseArcheryView', () => {
  it('reads the engine view, which only reveals the winds up to this end', () => {
    const s = fresh();
    expect(s.winds).toHaveLength(3);
    const v = viewOf(s);
    expect(v.winds).toHaveLength(1);
    expect(v.winds[0]).toBe(s.winds[0]);
    expect(v.ends).toBe(3);
    expect(v.arrowsLeft).toBe(3);
    expect(currentWind(v)).toBe(s.winds[0]);
  });

  it('reads a view with arrows and keeps the tremor the server added', () => {
    const v = viewOf(shoot(fresh(), A));
    expect(v.last?.by).toBe(A);
    expect(v.last?.tremor).toBeDefined();
    expect(v.arrows[A]).toHaveLength(1);
    expect(v.score[A]).toBe(v.last?.score);
  });

  it('refuses what it does not recognise', () => {
    const ok = wire(shoot(fresh(), A)) as Record<string, unknown>;
    expect(parseArcheryView(null)).toBeNull();
    expect(parseArcheryView({})).toBeNull();
    expect(parseArcheryView({ ...ok, starter: 2 })).toBeNull();
    expect(parseArcheryView({ ...ok, winds: ['x'] })).toBeNull();
    expect(parseArcheryView({ ...ok, xs: { [A]: 0 } })).toBeNull();
    expect(parseArcheryView({ ...ok, arrows: { [A]: [{ seq: 1 }], [B]: [] } })).toBeNull();
    expect(parseArcheryView({ ...ok, last: { seq: 1 } })).toBeNull();
  });

  it('follows the end: the next end reveals its wind and shows a fresh target', () => {
    let s = run(fresh(), A, 3);
    s = run(s, B, 3);
    const v = viewOf(s);
    expect(v.end).toBe(1);
    expect(v.winds).toHaveLength(2);
    expect(shownEnd(v)).toBe(1);
    expect(arrowsOnTarget(v)).toEqual([]);
    expect(arrowsOnTarget(v, 0)).toHaveLength(6);
    expect(endLine(v)).toBe('End 2 of 3 · 3 arrows each');
  });
});

describe('the range', () => {
  it('puts the face 30 m down the range, at eye height, y up', () => {
    expect(DISTANCE_M).toBe(30);
    expect(faceToWorld(0, 0)).toEqual([0, EYE_H, -30]);
    expect(faceToWorld(200, -100)).toEqual([0.2, EYE_H - 0.1, -30]);
  });

  it('frames the face a little above the middle with room to aim off for the wind', () => {
    const pose = cameraPose(ARCHERY_CAMERA, 390, 700);
    const centre = project(pose, faceToWorld(0, 0), 390, 700);
    expect((centre as { x: number }).x).toBeCloseTo(195, 3);
    expect((centre as { y: number }).y).toBeLessThan(350);
    const edge = project(pose, faceToWorld(AIM_MAX, 0), 390, 700);
    expect((edge as { x: number }).x).toBeLessThan(390);
    const left = project(pose, faceToWorld(-AIM_MAX, 0), 390, 700);
    expect((left as { x: number }).x).toBeGreaterThan(0);
    // The 800 mm face is a good size on a phone.
    const rim = project(pose, faceToWorld(400, 0), 390, 700);
    expect((rim as { x: number }).x - 195).toBeGreaterThan(40);
  });
});

describe('input', () => {
  it('quantises to the integers the engine takes', () => {
    expect(toInput(12.6, -3.4, 999.5)).toEqual({ aimX: 13, aimY: -3, draw: 1000 });
    expect(toInput(99999, -99999, -5)).toEqual({ aimX: AIM_MAX, aimY: -AIM_MAX, draw: 0 });
    expect(Object.is(toInput(-0.2, 0, 0).aimX, -0)).toBe(false);
    expect(DRAW_MAX).toBe(1000);
  });

  it('moves the sight by a share of the drag and stays inside the range', () => {
    expect(dragAim({ x: 0, y: 0 }, 10, 20, 4)).toEqual({ x: 40, y: 80 });
    expect(dragAim({ x: 100, y: -50 }, -5, -5, 2)).toEqual({ x: 90, y: -60 });
    expect(dragAim({ x: 1000, y: 0 }, 1000, 0, 4)).toEqual({ x: AIM_MAX, y: 0 });
  });
});

describe('wind', () => {
  it('reads the wind as speed and side', () => {
    expect(windSpeed(62)).toBe('6.2 m/s');
    expect(windSpeed(-35)).toBe('3.5 m/s');
    expect(windWords(0)).toBe('Calm');
    expect(windWords(4)).toBe('Calm');
    expect(windWords(62)).toBe('6.2 m/s to the right');
    expect(windWords(-35)).toBe('3.5 m/s to the left');
  });

  it('pushes the arrow with the wind, more when the draw is short', () => {
    expect(windPushMm(0, 1000)).toBe(0);
    expect(windPushMm(80, 1000)).toBeGreaterThan(150);
    expect(windPushMm(-80, 1000)).toBeLessThan(-150);
    expect(Math.abs(windPushMm(80, 200))).toBeGreaterThan(Math.abs(windPushMm(80, 1000)));
    expect(pushLine(0, 1000)).toBe('No push');
    expect(pushLine(80, 1000)).toMatch(/^Pushes about \d+ cm right$/);
    expect(pushLine(-80, 1000)).toMatch(/^Pushes about \d+ cm left$/);
  });

  it('allowing for the wind brings the arrow back to the middle', () => {
    for (const wind of [80, 45, -60, -80]) {
      const aimX = compensation(wind, 1000);
      expect(Math.sign(aimX)).toBe(-Math.sign(wind));
      const landed = flyArcheryArrow({ aimX, aimY: 0, draw: 1000 }, wind);
      expect(Math.abs(landed.x)).toBeLessThanOrEqual(12);
    }
    expect(compensation(0, 1000)).toBe(0);
  });
});

describe('plans', () => {
  it('predicts the landing from the engine flight without the tremor', () => {
    const input = { aimX: 50, aimY: -30, draw: 800 };
    const plan = predictArrow(input, 40);
    const f = flyArcheryArrow(input, 40);
    expect(plan.data).toEqual({ x: f.x, y: f.y, flightMs: f.flightMs });
    expect(plan.durationMs).toBeCloseTo(f.flightMs * SLOWDOWN, 6);
  });

  it('replays the record the server stored', () => {
    const v = viewOf(shoot(fresh(), A, 20, 10));
    const rec = v.last as ArrowRecord;
    const plan = planFromRecord(rec);
    expect(plan.data).toEqual({ x: rec.x, y: rec.y, flightMs: rec.flightMs });
    expect(plan.key).toBe(`${rec.x},${rec.y}`);
    // The server's tremor means the device's prediction usually lands somewhere else, so the picture is corrected.
    const pred = predictArrow(rec.input, rec.windDms);
    expect(pred.key === plan.key || rec.tremor.x !== 0 || rec.tremor.y !== 0).toBe(true);
  });

  it('flies from the hand at eye height to the landing point', () => {
    const plan = planArrow(150, -80, 560);
    const start = sampleArrow(plan, 0);
    const end = sampleArrow(plan, plan.durationMs);
    expect(start[0]).toBeCloseTo(0, 9);
    expect(start[1]).toBeCloseTo(EYE_H, 9);
    expect(start[2]).toBeCloseTo(0, 9);
    expect(end[0]).toBeCloseTo(0.15, 9);
    expect(end[1]).toBeCloseTo(EYE_H - 0.08, 9);
    expect(end[2]).toBeCloseTo(-30, 9);
    expect(sampleArrow(plan, 99999)).toEqual(end);
    expect(sampleArrow(plan, -5)).toEqual(start);
    // Climbs over the line, then drops: higher than the chord in the middle.
    const mid = sampleArrow(plan, plan.durationMs / 2);
    expect(mid[1] as number).toBeGreaterThan(((start[1] as number) + (end[1] as number)) / 2 + 0.2);
    // Forward at a steady speed.
    expect(mid[2]).toBeCloseTo(-15, 9);
  });

  it('points the arrow along its path, level at the start and nose-down at the end', () => {
    const plan = planArrow(0, 0, 560);
    const early = arrowDirection(plan, 100);
    const late = arrowDirection(plan, plan.durationMs - 20);
    expect(Math.hypot(...early)).toBeCloseTo(1, 6);
    expect(early[2]).toBeLessThan(0);
    expect(early[1]).toBeGreaterThan(0);
    expect(late[1]).toBeLessThan(0);
  });
});

describe('replayArrow', () => {
  it('replays the other archer run since my last arrow, oldest first', () => {
    let s = run(fresh(), A, 3);
    let v = viewOf(s);
    expect(replayArrow(v, B, 0)?.shot.seq).toBe(1);
    expect(replayArrow(v, B, 1)?.shot.seq).toBe(2);
    expect(replayArrow(v, B, 3)).toBeNull();
    expect(replayArrow(v, A, 0)).toBeNull();
    s = run(s, B, 2);
    v = viewOf(s);
    expect(replayArrow(v, A, 0)?.shot.seq).toBe(4);
    expect(replayArrow(v, A, 4)?.shot.seq).toBe(5);
  });
});

describe('scoring and words', () => {
  const rec = (score: number, isX = false, by = A): ArrowRecord => ({
    seq: 1,
    by,
    end: 0,
    input: { aimX: 0, aimY: 0, draw: 1000 },
    tremor: { x: 0, y: 0 },
    x: 0,
    y: 0,
    score,
    isX,
    windDms: 0,
    flightMs: 500,
  });

  it('paints the ring colours as the face is painted', () => {
    expect(ringColors(10).fill).toBe('#F2C230');
    expect(ringColors(9).fill).toBe('#F2C230');
    expect(ringColors(8).fill).toBe('#E0453A');
    expect(ringColors(6).fill).toBe('#2F6BEA');
    expect(ringColors(4).fill).toBe('#1B140F');
    expect(ringColors(1).fill).toBe('#F6F2EA');
    expect(ringColors(0).fill).toBe('#44364B');
    expect(arrowLabel(rec(10, true))).toBe('X');
    expect(arrowLabel(rec(0))).toBe('M');
    expect(arrowLabel(rec(7))).toBe('7');
  });

  it('says what the arrow did', () => {
    expect(arrowCopy(rec(10, true), A, nameOf).text).toBe('You hit the X: 10');
    expect(arrowCopy(rec(9), B, nameOf)).toEqual({ text: 'Ada hit gold: 9', tone: 'hit' });
    expect(arrowCopy(rec(7), A, nameOf).text).toBe('You hit red: 7');
    expect(arrowCopy(rec(0), A, nameOf)).toEqual({ text: 'Missed the target', tone: 'miss' });
    expect(arrowCopy(rec(0, false, B), A, nameOf).text).toBe('Bo missed the target');
  });

  it('breaks a tie on Xs in the score line', () => {
    const v = viewOf(fresh());
    const tie = { ...v, score: { [A]: 70, [B]: 70 }, xs: { [A]: 3, [B]: 1 } };
    expect(archeryScoreLine(tie, A, nameOf)).toBe('You 70 points (3 X) · Bo 70 points (1 X)');
    const win = { ...v, score: { [A]: 71, [B]: 70 }, xs: { [A]: 3, [B]: 1 } };
    expect(archeryScoreLine(win, A, nameOf)).toBe('You 71 points · Bo 70 points');
    expect(chipLine(v, A, B)).toBe('0 points · your arrows');
    expect(chipLine(v, B, A)).toBe('0 points · shooting');
  });

  it('adds up an archer', () => {
    const s = run(run(fresh(), A, 3), B, 3);
    const v = viewOf(s);
    const st = archerStats(v, A);
    expect(st.arrows).toBe(3);
    expect(st.best).toBe(Math.max(...(v.arrows[A] ?? []).map((a) => a.score)));
    expect(st.xs).toBe(v.xs[A]);
    expect(st.gold + st.misses).toBeLessThanOrEqual(3);
  });
});
