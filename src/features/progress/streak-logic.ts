import type { StreakLost, StreakStatus } from '@dyce/shared';

/**
 * Pure logic for "Streak lost" and the streak saver (SPEC section 9, design: StreakLost; backend ADR-042). A streak
 * is consecutive days with a win. When a whole day goes by without one it ends, and the person has 24 hours to win
 * one Free game and get the old length back. No React in here, so it is unit tested.
 */

/** Hours (rounded up) until the saver runs out; 0 once it has. */
export function saverHoursLeft(expiresAt: string | null, now = Date.now()): number {
  if (!expiresAt) return 0;
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 3_600_000));
}

/** Should the app put the "streak lost" screen in front of the person? Only a fresh loss that can still be saved. */
export function shouldPrompt(status: StreakStatus | undefined, now = Date.now()): boolean {
  const lost = status?.lost;
  return (
    !!lost && !lost.seen && lost.saverAvailable && saverHoursLeft(lost.saverExpiresAt, now) > 0
  );
}

export type StreakCopy = {
  title: string;
  body: string;
  /** The tiles under the text. */
  items: { mark: string; tone: 'ember' | 'grey'; title: string; detail: string }[];
  /** The main button: a rematch with whoever beat them, else "Play a free game". */
  cta: string;
  /** The other button. */
  alt: string;
};

const name = (p: { displayName: string; username: string }) => p.displayName || p.username;

/** The words on the screen, from the server's facts. */
export function streakCopy(status: StreakStatus, now = Date.now()): StreakCopy | null {
  const lost: StreakLost | null = status.lost;
  if (!lost) return null;
  const hours = saverHoursLeft(lost.saverExpiresAt, now);
  const best = Math.max(status.best, lost.length);
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
  const who = lost.brokenBy ? name(lost.brokenBy) : null;
  const bestLine =
    best === lost.length ? `Your best is ${days(best)}.` : `Your best is still ${best} in a row.`;

  const items: StreakCopy['items'] = [];
  if (lost.saverAvailable && hours > 0) {
    items.push({
      mark: `${hours}h`,
      tone: 'ember',
      title: 'Streak saver',
      detail: `Win your next free game within ${hours}h and the ${lost.length} comes back`,
    });
  } else {
    items.push({
      mark: '0h',
      tone: 'grey',
      title: 'No streak saver now',
      detail: 'A saver can be used once a week. Win a game to start a new streak',
    });
  }
  if (status.friendsBest) {
    items.push({
      mark: String(status.friendsBest.length),
      tone: 'grey',
      title: 'Streak this week',
      detail: `Longest among your friends: ${name(status.friendsBest)}, ${status.friendsBest.length}`,
    });
  }
  return {
    title: `Streak ended at ${lost.length}`,
    body: `${who ? `${who} broke it.` : 'A day went by without a win.'} ${bestLine}`,
    items,
    cta: who ? `Rematch ${who} · free` : 'Play a free game',
    alt: 'Not now',
  };
}
