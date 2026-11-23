import type { ProfileBadge } from '@dyce/shared';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * What the badge sheet says about one badge (design: BadgeDetail). The server knows whether you have it and when;
 * it does not report progress towards it or how many players have it, so those lines of the design are not shown.
 */
export function badgeDetail(b: Pick<ProfileBadge, 'earnedAt'>): {
  unlocked: boolean;
  status: string;
} {
  if (!b.earnedAt) return { unlocked: false, status: 'Locked · not earned yet' };
  const d = new Date(b.earnedAt);
  return {
    unlocked: true,
    status: `Unlocked · ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`,
  };
}
