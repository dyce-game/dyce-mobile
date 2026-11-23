/**
 * Small pure helpers for the board animations (sowing, dice, shot splashes, token hops). Time is always
 * "milliseconds since the animation began", so everything here can be tested without a clock.
 */

export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
export const easeInOut = (t: number): number => {
  const k = clamp01(t);
  return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
};

/** 0..1 progress of `ms` inside a window that starts at `start` and lasts `len`. */
export const within = (ms: number, start: number, len: number): number =>
  len <= 0 ? 1 : clamp01((ms - start) / len);

/** A hop: height of a thing thrown between two squares, 0 at both ends, `peak` in the middle. */
export const hop = (t: number, peak: number): number => 4 * peak * clamp01(t) * (1 - clamp01(t));

/** The 'prefers-reduced-motion' answer for a board: no animation at all, the board just changes. */
export const NO_ANIMATION_MS = 0;

/** Rounds a time to the frame it falls on at `hz` (tests, and keeps instanced-matrix writes to once a frame). */
export const frameOf = (ms: number, hz = 60): number => Math.floor((ms * hz) / 1000);
