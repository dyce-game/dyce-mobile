import { ease, lerpPose, type Ease, type Pose } from './layout';

/**
 * The cards on the table as things that move: each has a current pose and, while it travels, a tween to
 * the next one (a delay, a duration, an easing and an arc so a played card lifts over the table). The scene
 * reads `poseOf` every frame and asks `step` whether to keep drawing. Plain data and time passed in, so it is
 * tested without a renderer or a clock.
 */

export type MoveOptions = {
  delay?: number;
  duration?: number;
  ease?: Ease;
  /** Extra height at the middle of the trip, metres. */
  arc?: number;
  /** Start from this pose instead of where the card is now. */
  from?: Pose;
};

type Tween = { from: Pose; to: Pose; start: number; dur: number; ease: Ease; arc: number };
type Actor = { cur: Pose; tween: Tween | null };

export class ActorStore {
  private readonly actors = new Map<string, Actor>();

  has(id: string): boolean {
    return this.actors.has(id);
  }

  /** Puts a card down at once. */
  place(id: string, p: Pose): void {
    this.actors.set(id, { cur: p, tween: null });
  }

  /** Sends a card to `to`. A card that was never placed starts there. `duration` 0 (or less) is a jump. */
  move(id: string, to: Pose, now: number, o: MoveOptions = {}): void {
    const from = o.from ?? this.actors.get(id)?.cur ?? to;
    const dur = o.duration ?? 380;
    const delay = o.delay ?? 0;
    if (dur <= 0 && delay <= 0) {
      this.actors.set(id, { cur: to, tween: null });
      return;
    }
    this.actors.set(id, {
      cur: from,
      tween: {
        from,
        to,
        start: now + delay,
        dur: Math.max(1, dur),
        ease: o.ease ?? 'inout',
        arc: o.arc ?? 0,
      },
    });
  }

  remove(id: string): void {
    this.actors.delete(id);
  }

  poseOf(id: string): Pose | null {
    return this.actors.get(id)?.cur ?? null;
  }

  /** Moves every card to where it should be at `now`. True while something is still travelling or waiting to. */
  step(now: number): boolean {
    let busy = false;
    for (const a of this.actors.values()) {
      const t = a.tween;
      if (!t) continue;
      if (now < t.start) {
        busy = true;
        continue;
      }
      const k = (now - t.start) / t.dur;
      if (k >= 1) {
        a.cur = t.to;
        a.tween = null;
        continue;
      }
      const e = ease(t.ease, k);
      const p = lerpPose(t.from, t.to, e);
      if (t.arc) p.y += Math.sin(Math.PI * k) * t.arc;
      a.cur = p;
      busy = true;
    }
    return busy;
  }

  /** Time at which everything now travelling will have arrived (0 if nothing is). */
  settlesAt(): number {
    let end = 0;
    for (const a of this.actors.values())
      if (a.tween) end = Math.max(end, a.tween.start + a.tween.dur);
    return end;
  }

  size(): number {
    return this.actors.size;
  }
}
