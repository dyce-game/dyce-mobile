import type { NotificationItem, NotificationKind } from '@dyce/shared';

/** "now", "2m", "3h", "Yesterday", "Tue", "12 Nov". */
export function timeAgo(iso: string, now: Date): string {
  const then = new Date(iso);
  const mins = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24 && sameDay(then, now)) return `${hours}h`;
  const days = dayDiff(then, now);
  if (days === 1) return 'Yesterday';
  if (days < 7) return then.toLocaleDateString('en-GB', { weekday: 'short' });
  return then.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function sameDay(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function dayDiff(a: Date, b: Date): number {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((start(b) - start(a)) / 86_400_000);
}

export type NotificationGroup = { label: string; items: NotificationItem[] };

/** "Today" and "Earlier" sections, in the order given (newest first). */
export function groupByDay(items: NotificationItem[], now: Date): NotificationGroup[] {
  const today: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];
  for (const i of items) (sameDay(new Date(i.createdAt), now) ? today : earlier).push(i);
  return [
    ...(today.length ? [{ label: 'Today', items: today }] : []),
    ...(earlier.length ? [{ label: 'Earlier', items: earlier }] : []),
  ];
}

/** The small round tag on an avatar (design: Activity): a mark and a colour per kind. */
export function kindTag(kind: NotificationKind): { mark: string; color: string } {
  switch (kind) {
    case 'pool_result':
    case 'pool_countered':
    case 'game_invite':
    case 'game_accepted':
      return { mark: 'Ð', color: '#C93E1C' };
    case 'pool_refunded':
    case 'money_received':
      return { mark: '↩', color: '#0E7C47' };
    case 'money_requested':
      return { mark: 'Ð', color: '#B37A00' };
    case 'your_turn':
    case 'game_result':
      return { mark: '!', color: '#0E7C47' };
    case 'space_starting':
      return { mark: '+', color: '#C2410C' };
    case 'friend_request':
    case 'friend_accepted':
      return { mark: '+', color: '#2D6CDF' };
    case 'level_up':
      return { mark: '↑', color: '#B37A00' };
    case 'badge_earned':
      return { mark: '#', color: '#7C8597' };
    case 'streak_lost':
      return { mark: '!', color: '#FF7A1A' };
    case 'report_outcome':
    case 'moderation_notice':
      return { mark: '!', color: '#7C8597' };
  }
}

/** The name shown as the other person: their display name, else @username. */
export function actorName(actor: NotificationItem['actor']): string | null {
  if (!actor) return null;
  return actor.displayName || (actor.username ? `@${actor.username}` : null);
}

/** How many to show on a badge: "9+" past nine. */
export function badgeLabel(n: number): string {
  return n > 9 ? '9+' : String(n);
}
