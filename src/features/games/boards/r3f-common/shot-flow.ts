/**
 * The parts of a 3D sports board that are not drawing, shared by 8 Ball, Darts, Basketball and Archery
 * (ADR-020 pattern, generalised): a "plan" is one shot's animation as the simulation sees it, a "playback"
 * is a plan being shown, and a correction glides from where the picture is to the server's plan.
 */

export type Plan<D> = {
  /** Whatever the scene needs to draw the shot (trace, landing point, the table before it). */
  data: D;
  durationMs: number;
  /** A fingerprint of the outcome. When the server's plan has another key, the picture is corrected. */
  key: string;
};

export type Playback<D> = {
  plan: Plan<D>;
  /** performance.now() when it began. */
  startedAt: number;
  /** Smooths a correction: the sample glides from `from` to the new plan's sample over `ms`. */
  blend: { from: number[]; startedAt: number; ms: number } | null;
  done: boolean;
  token: number;
};

/** A sampler turns a plan and a time into numbers (a position, or all the balls' positions). */
export type Sampler<D> = (plan: Plan<D>, ms: number) => number[];

/** The picture at `now`: the plan's sample, blended from the old picture while a correction glides. */
export function playbackSample<D>(pb: Playback<D>, now: number, sample: Sampler<D>): number[] {
  const p = sample(pb.plan, now - pb.startedAt);
  if (!pb.blend) return p;
  const k = (now - pb.blend.startedAt) / pb.blend.ms;
  if (k >= 1 || pb.blend.from.length !== p.length) return p;
  const from = pb.blend.from;
  return p.map((v, i) => (from[i] as number) + (v - (from[i] as number)) * Math.max(0, k));
}

/** The animation has run its course (and any correction has finished gliding). */
export const playbackOver = <D>(pb: Playback<D>, now: number): boolean =>
  now - pb.startedAt >= pb.plan.durationMs &&
  (!pb.blend || now - pb.blend.startedAt >= pb.blend.ms);

/** A new playback of `plan`, or the correction of `current` to it. */
export function startPlayback<D>(
  plan: Plan<D>,
  token: number,
  now: number,
  current: Playback<D> | null,
  sample: Sampler<D>,
  glideMs = 160,
): Playback<D> {
  const midAir = current && !current.done ? current : null;
  return {
    plan,
    startedAt: midAir ? midAir.startedAt : now,
    blend: midAir
      ? { from: playbackSample(midAir, now, sample), startedAt: now, ms: glideMs }
      : null,
    done: false,
    token,
  };
}

// ---- linear helpers --------------------------------------------------------------------------------

/** Where a 30 Hz trace of `[...numbers]` frames is `ms` into it. */
export function sampleFrames(
  frames: readonly (readonly number[])[],
  ms: number,
  hz = 30,
): number[] {
  const first = frames[0];
  if (!first) return [];
  const f = Math.max(0, ms) / (1000 / hz);
  const i = Math.floor(f);
  const a = frames[Math.min(i, frames.length - 1)] as readonly number[];
  const b = frames[Math.min(i + 1, frames.length - 1)] as readonly number[];
  const t = f - i;
  return a.map((v, k) => v + ((b[k] as number) - v) * t);
}

export const framesMs = (frames: readonly unknown[], hz = 30): number =>
  Math.max(0, frames.length - 1) * (1000 / hz);

export const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Quantise a UI value to an integer inside its range (and never -0). */
export const quantise = (v: number, lo: number, hi: number): number =>
  clamp(Math.round(v), lo, hi) || 0;

export const stepValue = (v: number, dir: 1 | -1, step: number, lo: number, hi: number): number =>
  clamp(v + dir * step, lo, hi);

// ---- shots already shown on this device -------------------------------------------------------------

/** Shots already shown on this device, so a replay happens once per shot and a finished game is not held. */
const played = new Map<string, number>();

export const playedSeq = (matchId: string): number => played.get(matchId) ?? 0;
export const hasPlayed = (matchId: string, seq: number): boolean =>
  (played.get(matchId) ?? 0) >= seq;
export function markPlayed(matchId: string, seq: number): void {
  if (seq > (played.get(matchId) ?? 0)) played.set(matchId, seq);
}
/** For tests. */
export const forgetPlayed = (): void => played.clear();

/** Should the board keep the result back for this finished game, so the final shot can be shown first? */
export const holdsForFinalShot = (
  matchId: string,
  over: boolean,
  last: { seq: number } | null,
): boolean => over && last !== null && !hasPlayed(matchId, last.seq);

/** Rounds the way a scoreboard would say it: "1 point", "2 points". */
export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
