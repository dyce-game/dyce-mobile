import { useEffect, useState } from 'react';
import type { LiveState } from '@dyce/shared';
import { secondsLeft } from '../party-logic';

/** The device clock, re-read every `intervalMs`. Only for drawing (a countdown, a grace period), never for rules. */
export function useNow(intervalMs = 250): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Seconds left in the phase, counted from the server's clock (`serverNow` + `turnDeadlineAt`), so a wrong
 * device clock cannot move it. Null while the room waits for everyone to join, or once it is over.
 */
export function usePhaseClock(
  live: LiveState,
  receivedAt: number,
): { seconds: number | null; now: number } {
  const now = useNow(250);
  return { seconds: secondsLeft(live, receivedAt, now), now };
}
