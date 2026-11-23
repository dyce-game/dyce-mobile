import type { LiveState } from '@dyce/shared';
import type { LiveStatus } from './live-connection';

/**
 * What is wrong with the connection at a live table, for the cards over it (design: GameOffline, GameIssues):
 * your own line dropped (the server keeps your seat for 60 seconds), or someone else's did. Pure, so it is
 * unit tested.
 */
export type LiveIssue = { kind: 'offline' } | { kind: 'others'; userIds: string[] } | null;

export function liveIssue(
  state: LiveState | null,
  status: LiveStatus,
  myId: string | null,
): LiveIssue {
  if (!state || state.status !== 'live') return null;
  if (status === 'reconnecting') return { kind: 'offline' };
  // Party games hold their clocks until everyone has connected: that is "waiting", not "lost connection".
  if (state.waiting) return null;
  const away = state.seats
    .filter((s) => s.userId !== myId && !s.connected && !s.forfeited)
    .map((s) => s.userId);
  return away.length > 0 ? { kind: 'others', userIds: away } : null;
}

/** Same people as last time? Used to bring a dismissed "waiting" card back when someone else drops. */
export function sameIssue(a: LiveIssue, b: LiveIssue): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  if (a.kind === 'offline' || b.kind === 'offline') return true;
  return a.userIds.length === b.userIds.length && a.userIds.every((id, i) => id === b.userIds[i]);
}
