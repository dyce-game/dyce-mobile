import { cameraPose, project, unproject, unprojectPlane, type CameraSpec } from './camera-math';
import {
  clamp,
  forgetPlayed,
  framesMs,
  hasPlayed,
  holdsForFinalShot,
  markPlayed,
  playbackOver,
  playbackSample,
  playedSeq,
  plural,
  quantise,
  sampleFrames,
  startPlayback,
  stepValue,
  type Plan,
  type Sampler,
} from './shot-flow';
import { isInt, numberRecord, otherOf, parsePlayers, youFirst } from './board-utils';

const TABLE: CameraSpec = {
  target: [0, 0, -0.2],
  dir: [0, 0.7, 0.714],
  distance: 3.4,
  fovDeg: 36,
  fitWidth: 1.62,
};

describe('camera-math', () => {
  it('pulls back on a narrow screen to keep the width in view', () => {
    const wide = cameraPose(TABLE, 1000, 500);
    const narrow = cameraPose(TABLE, 300, 800);
    const d = (p: typeof wide) =>
      Math.hypot(
        p.position[0] - p.target[0],
        p.position[1] - p.target[1],
        p.position[2] - p.target[2],
      );
    expect(d(wide)).toBeCloseTo(3.4, 6);
    expect(d(narrow)).toBeGreaterThan(3.4);
  });

  it('projects the target to the centre of the screen', () => {
    const pose = cameraPose(TABLE, 390, 700);
    const c = project(pose, TABLE.target, 390, 700);
    expect(c?.x).toBeCloseTo(195, 3);
    expect(c?.y).toBeCloseTo(350, 3);
  });

  it('turns a screen point back into the point on the floor it came from', () => {
    const pose = cameraPose(TABLE, 390, 700);
    for (const p of [
      [0.3, 0, 0.5],
      [-0.4, 0, -0.9],
      [0, 0, 0],
    ] as const) {
      const s = project(pose, p, 390, 700);
      expect(s).not.toBeNull();
      const back = unproject(pose, (s as { x: number }).x, (s as { y: number }).y, 390, 700, 0);
      expect(back?.[0]).toBeCloseTo(p[0], 6);
      expect(back?.[2]).toBeCloseTo(p[2], 6);
    }
  });

  it('works for a wall that faces the camera too', () => {
    const wall: CameraSpec = { target: [0, 0, 0], dir: [0, 0, 1], distance: 1.4, fovDeg: 30 };
    const pose = cameraPose(wall, 390, 700);
    const s = project(pose, [0.1, 0.05, 0], 390, 700);
    const back = unprojectPlane(
      pose,
      (s as { x: number }).x,
      (s as { y: number }).y,
      390,
      700,
      [0, 0, 1],
      0,
    );
    expect(back?.[0]).toBeCloseTo(0.1, 6);
    expect(back?.[1]).toBeCloseTo(0.05, 6);
  });

  it('says null for a point behind the camera or a ray that never lands', () => {
    const pose = cameraPose(TABLE, 390, 700);
    expect(project(pose, [0, 5, 20], 390, 700)).toBeNull();
    // Above the horizon the ray never meets the floor.
    expect(unproject(pose, 195, -2000, 390, 700, 0)).toBeNull();
  });
});

describe('shot-flow', () => {
  const sample: Sampler<{ to: number }> = (plan, ms) => [
    (plan.data.to * Math.min(ms, plan.durationMs)) / plan.durationMs,
  ];
  const plan = (to: number, key = 'a'): Plan<{ to: number }> => ({
    data: { to },
    durationMs: 1000,
    key,
  });

  it('samples a plan and knows when it is over', () => {
    const pb = startPlayback(plan(10), 1, 5000, null, sample);
    expect(playbackSample(pb, 5500, sample)).toEqual([5]);
    expect(playbackOver(pb, 5999)).toBe(false);
    expect(playbackOver(pb, 6000)).toBe(true);
  });

  it('glides from where the picture is to the corrected plan, then follows it', () => {
    const first = startPlayback(plan(10), 1, 0, null, sample);
    const fixed = startPlayback(plan(20, 'b'), 1, 500, first, sample, 200);
    // Keeps the original start time and blends from the picture at that moment (5) towards the new path.
    expect(fixed.startedAt).toBe(0);
    expect(fixed.blend?.from).toEqual([5]);
    expect(playbackSample(fixed, 500, sample)).toEqual([5]);
    expect(playbackSample(fixed, 600, sample)[0]).toBeCloseTo(5 + (12 - 5) * 0.5, 6);
    expect(playbackSample(fixed, 700, sample)).toEqual([14]);
    expect(playbackOver(fixed, 1000)).toBe(true);
  });

  it('restarts a correction from the start when the first playback is already done', () => {
    const first = startPlayback(plan(10), 1, 0, null, sample);
    first.done = true;
    const again = startPlayback(plan(20, 'b'), 2, 4000, first, sample);
    expect(again.startedAt).toBe(4000);
    expect(again.blend).toBeNull();
  });

  it('interpolates 30 Hz frames and clamps at both ends', () => {
    const frames = [
      [0, 0],
      [30, 60],
      [60, 120],
    ];
    expect(sampleFrames(frames, -10)).toEqual([0, 0]);
    expect(sampleFrames(frames, 1000 / 60)).toEqual([15, 30]);
    expect(sampleFrames(frames, 5000)).toEqual([60, 120]);
    expect(sampleFrames([], 10)).toEqual([]);
    expect(framesMs(frames)).toBeCloseTo((2 * 1000) / 30, 6);
    expect(framesMs([])).toBe(0);
  });

  it('quantises and steps inside a range, never to -0', () => {
    expect(quantise(12.6, -10, 10)).toBe(10);
    expect(quantise(-0.2, -10, 10)).toBe(0);
    expect(Object.is(quantise(-0.2, -10, 10), -0)).toBe(false);
    expect(stepValue(95, 1, 10, 0, 100)).toBe(100);
    expect(stepValue(5, -1, 10, 0, 100)).toBe(0);
    expect(clamp(5, 1, 3)).toBe(3);
    expect(plural(1, 'dart')).toBe('1 dart');
    expect(plural(3, 'dart')).toBe('3 darts');
  });

  it('remembers which shots this device has shown, once', () => {
    forgetPlayed();
    expect(hasPlayed('m1', 3)).toBe(false);
    markPlayed('m1', 3);
    markPlayed('m1', 2);
    expect(playedSeq('m1')).toBe(3);
    expect(hasPlayed('m1', 3)).toBe(true);
    expect(hasPlayed('m1', 4)).toBe(false);
    expect(hasPlayed('m2', 1)).toBe(false);
  });

  it('holds a finished game back only until its last shot has been shown', () => {
    forgetPlayed();
    expect(holdsForFinalShot('m', false, { seq: 4 })).toBe(false);
    expect(holdsForFinalShot('m', true, null)).toBe(false);
    expect(holdsForFinalShot('m', true, { seq: 4 })).toBe(true);
    markPlayed('m', 4);
    expect(holdsForFinalShot('m', true, { seq: 4 })).toBe(false);
  });
});

describe('board-utils', () => {
  it('reads the small shapes views are made of', () => {
    expect(parsePlayers(['a', 'b'])).toEqual(['a', 'b']);
    expect(parsePlayers(['a'])).toBeNull();
    expect(parsePlayers(['a', 2])).toBeNull();
    expect(numberRecord({ a: 1, b: 2 }, ['a', 'b'])).toEqual({ a: 1, b: 2 });
    expect(numberRecord({ a: 1 }, ['a', 'b'])).toBeNull();
    expect(numberRecord({ a: '1', b: 2 }, ['a', 'b'])).toBeNull();
    expect(isInt(3)).toBe(true);
    expect(isInt(3.5)).toBe(false);
    expect(otherOf(['a', 'b'], 'a')).toBe('b');
    expect(youFirst(['a', 'b'], 'b')).toEqual(['b', 'a']);
    expect(youFirst(['a', 'b'], null)).toEqual(['a', 'b']);
  });
});
