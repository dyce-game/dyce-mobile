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

/** Whether a typed name can be saved, and what to tell the person when it can't. */
export function nameProblem(raw: string): string | null {
  const name = raw.trim();
  if (name.length === 0) return 'Enter a name.';
  if (name.length > MAX_DISPLAY_NAME_LENGTH)
    return `Keep it to ${MAX_DISPLAY_NAME_LENGTH} characters.`;
  return null;
}
