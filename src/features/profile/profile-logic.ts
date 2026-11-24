import {
  checkContent,
  formatNaira,
  MAX_DISPLAY_NAME_LENGTH,
  type RequestPolicy,
  type UserProfile,
} from '@dyce/shared';

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

/** The four stat cards, from your real finished games ("—" and Ð0 before the first one). */
export function statsFor(p: UserProfile | undefined): ProfileStat[] {
  const rate = p?.stats.winRate;
  return [
    { key: 'games', label: 'Games', value: String(p?.stats.games ?? 0) },
    { key: 'winRate', label: 'Win rate', value: rate == null ? '—' : `${Math.round(rate * 100)}%` },
    {
      key: 'poolNet',
      label: 'Pool net',
      value: formatNaira(p?.money?.poolNetKobo ?? 0, { compact: true }),
      money: true,
    },
    {
      key: 'bestPot',
      label: 'Best pot',
      value: formatNaira(p?.money?.bestPotKobo ?? 0, { compact: true }),
    },
  ];
}

/** Whether a typed name can be saved, and what to tell the person when it can't. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return 'Enter a name.';
  if (name.length > MAX_DISPLAY_NAME_LENGTH)
    return `Keep it to ${MAX_DISPLAY_NAME_LENGTH} characters.`;
  if (!checkContent(name, 'name').ok) return "That wording isn't allowed on Dyce.";
  return null;
}
