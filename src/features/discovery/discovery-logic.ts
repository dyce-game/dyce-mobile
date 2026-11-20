import {
  formatNaira,
  type HeadToHead,
  type ProfileRelationship,
  type UserProfile,
} from '@dyce/shared';

/** "62%", or "—" before they have played. */
export function winRateLabel(rate: number | null): string {
  return rate === null ? '—' : `${Math.round(rate * 100)}%`;
}

/** "Last: Sea Battle pool · you lost ₦1,000" / "Last: Pig · you won". */
export function headToHeadLast(h: HeadToHead): string | null {
  const last = h.last;
  if (!last) return null;
  const verb = last.result === 'win' ? 'you won' : last.result === 'loss' ? 'you lost' : 'a draw';
  const money =
    last.netKobo !== null && last.netKobo !== 0 && last.result !== 'draw'
      ? ` ${formatNaira(Math.abs(last.netKobo), { compact: true })}`
      : '';
  return `Last: ${last.gameName}${last.mode === 'pool' ? ' pool' : ''} · ${verb}${money}`;
}

/** The share of the bar that is yours: 0..100, half when nobody has won. */
export function headToHeadShare(h: HeadToHead): number {
  const total = h.wins + h.losses;
  return total === 0 ? 50 : Math.round((h.wins / total) * 100);
}

/** "3 mutual friends: Ada, Tunde and 1 more", or null when there are none. */
export function mutualLabel(m: UserProfile['mutualFriends']): string | null {
  if (m.count === 0) return null;
  const names = m.sample.map((s) => s.displayName || s.username);
  const more = m.count - names.length;
  const list =
    names.length === 0
      ? ''
      : more > 0
        ? `${names.join(', ')} and ${more} more`
        : names.length === 1
          ? names[0]!
          : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${m.count} mutual ${m.count === 1 ? 'friend' : 'friends'}${list ? `: ${list}` : ''}`;
}

export type ProfileAction =
  | { kind: 'add' }
  | { kind: 'requested' }
  | { kind: 'accept' }
  | { kind: 'closed' }
  | { kind: 'none' };

/** The friend button for someone's profile. */
export function profileAction(
  relationship: ProfileRelationship,
  canRequest: boolean,
): ProfileAction {
  switch (relationship) {
    case 'none':
      return canRequest ? { kind: 'add' } : { kind: 'closed' };
    case 'pending_out':
      return { kind: 'requested' };
    case 'pending_in':
      return { kind: 'accept' };
    default:
      return { kind: 'none' };
  }
}

/** "Won" / "Lost" / "Draw" / "Left early" for a recent game. */
export function resultLabel(result: 'win' | 'loss' | 'draw' | 'forfeit'): string {
  return { win: 'Won', loss: 'Lost', draw: 'Draw', forfeit: 'Left early' }[result];
}

/** "Resets Monday · 2d 14h" from the server's reset time. */
export function resetsIn(resetsAt: string, now: Date): string {
  const ms = new Date(resetsAt).getTime() - now.getTime();
  if (ms <= 0) return 'Resets now';
  const mins = Math.floor(ms / 60_000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return d > 0
    ? `Resets Monday · ${d}d ${h}h`
    : h > 0
      ? `Resets Monday · ${h}h ${m}m`
      : `Resets Monday · ${m}m`;
}

/** "640 XP" or "+₦12.5k" / "−₦2k". */
export function boardValue(metric: 'xp' | 'pool', value: number): string {
  if (metric === 'xp') return `${value.toLocaleString('en-NG')} XP`;
  return `${value < 0 ? '−' : '+'}${formatNaira(Math.abs(value), { compact: true })}`;
}

/** "70 XP behind Zainab" under your row, or null when you lead. */
export function behindNote(
  metric: 'xp' | 'pool',
  me: { value: number; rank: number } | null,
  above: { value: number; displayName: string; username: string } | null,
): string | null {
  if (!me) return null;
  if (!above) return me.rank === 1 ? 'You lead this week' : null;
  const gap = above.value - me.value;
  const name = above.displayName || `@${above.username}`;
  return gap <= 0
    ? `Level with ${name}`
    : `${boardValue(metric, gap).replace('+', '')} behind ${name}`;
}
