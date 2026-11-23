import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import {
  markPlayed,
  playedSeq,
  startPlayback,
  type Plan,
  type Playback,
  type Sampler,
} from './shot-flow';

/** One shot being shown: whose, what the picture currently follows, and what the screen is waiting for. */
export type Anim<D, S> = {
  kind: 'mine' | 'theirs';
  token: number;
  plan: Plan<D>;
  /** The server's seq before my shot, so its answer can be told from the old state (mine only). */
  baseSeq: number;
  /** The server's record of this shot, once known (always for a replay). */
  shot: S | null;
  /** The server's answer is in. */
  confirmed: boolean;
  /** The picture has finished its path. */
  ended: boolean;
};

export type ShotFlowOptions<D, S extends { seq: number; by: string }> = {
  matchId: string;
  myId: string | null;
  reduce: boolean;
  busy: boolean;
  moveFailed: boolean;
  /** The server's newest shot record, and the sequence number of the match. */
  last: S | null;
  sample: Sampler<D>;
  /**
   * My shot's plan again, simulated from what the server recorded (its `applied` input). Null when the app
   * cannot tell (then the picture is left as it is).
   */
  authoritative: (predicted: Plan<D>, shot: S) => Plan<D> | null;
  /**
   * The next shot after `afterSeq` that the view still holds a record of, oldest first (any author), with its
   * plan (null when the simulation does not agree with the record: show the result without the animation).
   */
  replay: (afterSeq: number) => { shot: S; plan: Plan<D> | null } | null;
  /** The shot's picture has landed: say what happened (banner, haptic). */
  onShown: (shot: S, kind: 'mine' | 'theirs') => void;
  onSettled?: () => void;
  holdMineMs?: number;
  holdTheirsMs?: number;
  /** A shot takes about a second or two; if the canvas has not said it finished after this, carry on. */
  watchdogMs?: number;
};

/**
 * The shot life cycle every 3D sports board shares (ADR-020, generalised). Mine: predict from my input and
 * start at once; when the server's answer arrives with another outcome, glide to the server's path. Theirs:
 * replay each shot the view still records, once per device. Then hold the finished picture for a moment and
 * hand the board back. A watchdog and "reduce motion" make sure no shot can block the game behind its own
 * animation.
 */
export function useShotFlow<D, S extends { seq: number; by: string }>(o: ShotFlowOptions<D, S>) {
  const { matchId, myId, reduce, busy, moveFailed, last } = o;
  const [anim, setAnim] = useState<Anim<D, S> | null>(null);
  const [wake, setWake] = useState(0);
  const playbackRef = useRef<Playback<D> | null>(null);
  const tokenRef = useRef(0);
  const sawBusy = useRef(false);
  const opts = useRef(o);
  opts.current = o;

  const start = useCallback((plan: Plan<D>): number => {
    const token = ++tokenRef.current;
    playbackRef.current = startPlayback(plan, token, performance.now(), null, opts.current.sample);
    setWake((w) => w + 1);
    return token;
  }, []);

  const onPlaybackEnd = useCallback((token: number) => {
    setAnim((a) => (a && a.token === token ? { ...a, ended: true } : a));
  }, []);

  /** I have shot: show my predicted plan now. The caller sends the move. */
  const fire = useCallback(
    (plan: Plan<D>, baseSeq: number) => {
      sawBusy.current = false;
      if (reduce) {
        setAnim({
          kind: 'mine',
          token: -1,
          plan,
          baseSeq,
          shot: null,
          confirmed: false,
          ended: true,
        });
        return;
      }
      const token = start(plan);
      setAnim({ kind: 'mine', token, plan, baseSeq, shot: null, confirmed: false, ended: false });
    },
    [reduce, start],
  );

  // Watchdog.
  const animToken = anim?.token;
  const animEnded = anim?.ended;
  const animConfirmed = anim?.confirmed;
  useEffect(() => {
    if (animToken === undefined || animEnded) return;
    const id = setTimeout(
      () => setAnim((a) => (a && a.token === animToken ? { ...a, ended: true } : a)),
      opts.current.watchdogMs ?? 6000,
    );
    return () => clearTimeout(id);
  }, [animToken, animEnded, animConfirmed]);

  // The server's answer to my shot: keep the picture if it agrees, glide to the server's path if it does not.
  useEffect(() => {
    if (!anim || anim.kind !== 'mine' || anim.confirmed) return;
    if (!last || last.by !== myId || last.seq <= anim.baseSeq) return;
    let { plan, ended } = anim;
    const auth = opts.current.authoritative(anim.plan, last);
    if (auth) {
      if (!reduce && auth.key !== anim.plan.key) {
        playbackRef.current = startPlayback(
          auth,
          anim.token,
          performance.now(),
          playbackRef.current,
          opts.current.sample,
        );
        ended = false;
        setWake((w) => w + 1);
      }
      plan = auth;
    }
    setAnim({ ...anim, plan, shot: last, confirmed: true, ended });
  }, [anim, last, myId, reduce]);

  // The move never went through: put the picture back. (Only once this shot's request has been seen in flight:
  // an error left over from an earlier move must not cancel a new shot.)
  useEffect(() => {
    if (busy) {
      sawBusy.current = true;
      return;
    }
    if (moveFailed && sawBusy.current && anim && anim.kind === 'mine' && !anim.confirmed) {
      sawBusy.current = false;
      playbackRef.current = null;
      setAnim(null);
    }
  }, [busy, moveFailed, anim]);

  // Shots I have not seen (theirs, or made on another device): replay them in order, once each.
  const lastSeq = last?.seq ?? 0;
  useEffect(() => {
    if (anim || !last) return;
    let seq = playedSeq(matchId);
    if (seq >= lastSeq) return;
    for (let guard = 0; guard < 200 && seq < lastSeq; guard++) {
      const next = opts.current.replay(seq);
      if (!next || next.shot.seq <= seq) break;
      const shot = next.shot;
      seq = shot.seq;
      if (shot.by === myId) {
        markPlayed(matchId, seq);
        continue;
      }
      if (reduce || !next.plan) {
        markPlayed(matchId, seq);
        opts.current.onShown(shot, 'theirs');
        continue;
      }
      const token = start(next.plan);
      setAnim({
        kind: 'theirs',
        token,
        plan: next.plan,
        baseSeq: seq - 1,
        shot,
        confirmed: true,
        ended: false,
      });
      return;
    }
    markPlayed(matchId, lastSeq);
    opts.current.onSettled?.();
  }, [lastSeq, anim, matchId, myId, reduce]);

  // The picture has landed (and the server agrees): say what happened, let it sit, then show the table as it is.
  useEffect(() => {
    if (!anim || !anim.confirmed || !anim.ended || !anim.shot) return;
    const shot = anim.shot;
    opts.current.onShown(shot, anim.kind);
    const id = setTimeout(
      () => {
        markPlayed(matchId, shot.seq);
        playbackRef.current = null;
        setAnim(null);
        opts.current.onSettled?.();
      },
      reduce ? 0 : anim.kind === 'theirs' ? (o.holdTheirsMs ?? 1000) : (o.holdMineMs ?? 600),
    );
    return () => clearTimeout(id);
  }, [anim, matchId, reduce]);

  return { anim, wake, playbackRef, fire, onPlaybackEnd } as {
    anim: Anim<D, S> | null;
    wake: number;
    playbackRef: MutableRefObject<Playback<D> | null>;
    fire: (plan: Plan<D>, baseSeq: number) => void;
    onPlaybackEnd: (token: number) => void;
  };
}
