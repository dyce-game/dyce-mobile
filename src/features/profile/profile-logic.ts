import { MAX_DISPLAY_NAME_LENGTH, type RequestPolicy } from '@dyce/shared';

export const POLICY_OPTIONS: { key: RequestPolicy; label: string }[] = [
  { key: 'everyone', label: 'Everyone' },
  { key: 'fof', label: 'Friends of friends' },
  { key: 'nobody', label: 'Nobody' },
];

/** What each choice does, in the words shown under the control. */
export const POLICY_NOTES: Record<RequestPolicy, string> = {
  everyone:
    "Anyone can ask to be your friend or message you. Strangers' messages land in Requests, never in Chat.",
  fof: 'Only people who share a friend with you can ask to be your friend or message you.',
  nobody: 'No new people can add or message you. Your friends can still chat with you.',
};

/** "24 friends", "1 friend", "No friends yet". */
export function friendsLabel(n: number): string {
  return n === 0 ? 'No friends yet' : `${n} ${n === 1 ? 'friend' : 'friends'}`;
}

/** "Level 3 · 120 XP". */
export function levelLabel(level: number, xp: number): string {
  return `Level ${level} · ${xp.toLocaleString('en-NG')} XP`;
}

/**
 * How much XP fills one level: 75 times the level (the design's "Level 8 · 30 / 600 XP"). `xp` is progress inside
 * the current level. Games award the XP later; until then everyone is at the start of Level 1.
 */
export function xpForLevel(level: number): number {
  return 75 * Math.max(1, level);
}

/** 0..1 for the XP bar. */
export function xpProgress(level: number, xp: number): number {
  return Math.min(1, Math.max(0, xp / xpForLevel(level)));
}

/** "30 / 600 XP". */
export function xpLabel(level: number, xp: number): string {
  return `${xp.toLocaleString('en-NG')} / ${xpForLevel(level).toLocaleString('en-NG')} XP`;
}

export type ProfileStat = { key: string; label: string; value: string; money?: boolean };

/** The four stat cards. Nothing has been played yet, so they read as a fresh start until games record results. */
export function profileStats(): ProfileStat[] {
  return [
    { key: 'games', label: 'Games', value: '0' },
    { key: 'winRate', label: 'Win rate', value: '—' },
    { key: 'poolNet', label: 'Pool net', value: '₦0', money: true },
    { key: 'bestPot', label: 'Best pot', value: '₦0' },
  ];
}

/** Badges named in the SPEC, shown locked until earned (the badge system arrives with games). */
export const BADGE_PREVIEW: { key: string; name: string; mark: string; color: string }[] = [
  { key: 'first-win', name: 'First Win', mark: '1st', color: '#2BB673' },
  { key: 'streak-10', name: '10 Streak', mark: '10', color: '#C2410C' },
  { key: 'pool-shark', name: 'Pool Shark', mark: '₦', color: '#C93E1C' },
  { key: 'space-host', name: 'Space Host', mark: '4+', color: '#B37A00' },
  { key: 'whot-master', name: 'Whot Master', mark: 'W', color: '#9AA0AE' },
];

/** Whether a typed name can be saved, and what to tell the person when it can't. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return 'Enter a name.';
  if (name.length > MAX_DISPLAY_NAME_LENGTH)
    return `Keep it to ${MAX_DISPLAY_NAME_LENGTH} characters.`;
  return null;
}
