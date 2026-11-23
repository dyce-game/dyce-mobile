import { useCallback, useEffect, useRef, useState } from 'react';
import { hasPlayed, markPlayed } from '../r3f-common/shot-flow';

/** One move being shown: a token for the scene to report back with, and whatever the game needs to draw it. */
export type Replay<M> = { token: number; seq: number; move: M };

/**
 * Shows each new move once on this device (mine and theirs alike, the server decides every outcome): when
 * the view's `seq` moves past what this device has already shown for the match, `make()` builds the move's
 * animation (or null when there is nothing to show), the scene plays it and calls `done(token)`, and the
 * host is told through `onSettled` so it can show the result once the last move has landed. "Reduce motion",
 * a move that cannot be shown and a watchdog make sure nothing can hold the game behind its own animation.
 *
 * It shares the per-match "played" counter with the sports boards (`holdsForFinalShot` reads it), so an
 * entry's `holdResult` can keep the host on the board until the final move has been shown.
 */
export function useMoveReplay<M>(o: {
  matchId: string;
  seq: number;
  reduce: boolean;
  /** The animation for the newest move, or null to just show the board as it is. */
  make: () => M | null;
  onSettled?: () => void;
  /** Longest a move may take before the board carries on anyway. */
  watchdogMs?: number;
}): { replay: Replay<M> | null; done: (token: number) => void } {
  const { matchId, seq, reduce } = o;
  const [replay, setReplay] = useState<Replay<M> | null>(null);
  const current = useRef<Replay<M> | null>(null);
  const tokenRef = useRef(0);
  const opts = useRef(o);
  opts.current = o;

  const done = useCallback((token: number) => {
    const r = current.current;
    if (!r || r.token !== token) return;
    markPlayed(opts.current.matchId, r.seq);
    current.current = null;
    setReplay(null);
    opts.current.onSettled?.();
  }, []);

  // A new move the device has not shown yet.
  useEffect(() => {
    if (current.current) return;
    if (hasPlayed(matchId, seq)) return;
    const move = opts.current.reduce ? null : opts.current.make();
    if (move === null) {
      markPlayed(matchId, seq);
      opts.current.onSettled?.();
      return;
    }
    const r: Replay<M> = { token: ++tokenRef.current, seq, move };
    current.current = r;
    setReplay(r);
  }, [seq, replay, matchId, reduce]);

  // Watchdog: a canvas that never reports back must not hold the game.
  const token = replay?.token;
  useEffect(() => {
    if (token === undefined) return;
    const id = setTimeout(() => done(token), opts.current.watchdogMs ?? 6000);
    return () => clearTimeout(id);
  }, [token, done]);

  return { replay, done };
}
