import type { LiveState, SpaceMember, SpaceView } from '@dyce/shared';

/**
 * Pure logic for the Ludo room's table (backend ADR-043): who is seated, and the one-line state of each seat
 * (on the clock, out of the game, disconnected). No React, so it is tested.
 */

/** The members who are at the table, in seat order. */
export function ludoTableMembers(
  space: Pick<SpaceView, 'members'>,
  live: Pick<LiveState, 'seats'>,
): SpaceMember[] {
  const seated = new Set(live.seats.map((s) => s.userId));
  return [...space.members].filter((m) => seated.has(m.userId)).sort((a, b) => a.seat - b.seat);
}

/** The Ludo room (3 or 4 at a table), which has its own table screen. */
export const isLudoRoom = (slug: string): boolean => slug === 'ludo-room';

export type SeatLine = {
  label: string;
  note: string | null;
  onTurn: boolean;
  spoken: string;
};

/** "You", "Amaka", and under it "Your turn · 18s", "Left" or "Offline". */
export function ludoSeatLine(
  member: Pick<SpaceMember, 'userId' | 'displayName' | 'username'>,
  live: Pick<LiveState, 'seats' | 'turnUserId' | 'status'>,
  myId: string,
  secondsLeft: number | null,
): SeatLine {
  const me = member.userId === myId;
  const seat = live.seats.find((s) => s.userId === member.userId);
  const name = member.displayName || member.username;
  const label = me ? 'You' : name;
  const onTurn = live.status === 'live' && live.turnUserId === member.userId && !seat?.forfeited;
  let note: string | null = null;
  if (seat?.forfeited) note = 'Left';
  else if (onTurn)
    note = `${me ? 'Your turn' : 'Their turn'}${secondsLeft !== null ? ` · ${secondsLeft}s` : ''}`;
  else if (live.status === 'live' && seat && !seat.connected) note = 'Offline';
  return {
    label,
    note,
    onTurn,
    spoken: `${label}${note ? `, ${note}` : ''}`,
  };
}
