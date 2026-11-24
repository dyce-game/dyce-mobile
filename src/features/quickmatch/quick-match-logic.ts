import { formatNaira, type QuickMatchStatus, type QuickMatchTicket } from '@dyce/shared';

/**
 * Pure logic for quick match (design: QuickMatch): what each state of a search says, the accept countdown
 * and which tickets are "open". The server decides everything (who is matched, the 10 second window, the
 * refunds); this only describes it. No React in here, so it is unit tested.
 */

/** The window to accept a found match (the server allows a few seconds more for the network). */
export const ACCEPT_SECONDS = 10;

export const isOpen = (t: QuickMatchTicket | null | undefined): boolean =>
  t?.status === 'searching' || t?.status === 'found';

const ENDED: readonly QuickMatchStatus[] = ['cancelled', 'expired', 'declined', 'missed', 'failed'];
export const isEnded = (t: QuickMatchTicket | null | undefined): boolean =>
  !!t && ENDED.includes(t.status);

/**
 * Seconds left to accept, counted from when this device first saw the match (the device clock may be off,
 * so the server's timestamp is not used for the countdown). Never below 0.
 */
export function acceptSecondsLeft(seenAt: number, now: number, total = ACCEPT_SECONDS): number {
  return Math.max(0, total - Math.floor((now - seenAt) / 1000));
}

/** "0:09" */
export const clock = (seconds: number): string =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

/** "Level 14 · 62% wins" (or "Level 14 · New here" before their first finished game). */
export function opponentLine(t: QuickMatchTicket): string {
  const o = t.opponent;
  if (!o) return '';
  return o.winRatePct === null
    ? `Level ${o.level} · New here`
    : `Level ${o.level} · ${o.winRatePct}% wins`;
}

/** "Free" or "Pool · Ð500 each · winner takes Ð1,000". */
export function modeText(t: Pick<QuickMatchTicket, 'mode' | 'stakeKobo'>): string {
  return t.mode === 'pool'
    ? `Pool · ${formatNaira(t.stakeKobo)} each · winner takes ${formatNaira(t.stakeKobo * 2)}`
    : 'Free';
}

/** What to tell the person when their search ended without a game. Null when there is nothing to say. */
export function endedText(t: QuickMatchTicket): string | null {
  switch (t.status) {
    case 'expired':
      return 'No one was found this time. Try again, or invite a friend.';
    case 'missed':
      return t.mode === 'pool'
        ? 'The match timed out. Your stake is back in your wallet.'
        : 'The match timed out.';
    case 'declined':
      return t.mode === 'pool'
        ? 'You skipped that match. Your stake is back.'
        : 'You skipped that match.';
    case 'failed':
      return failureText(t.errorCode);
    default:
      return null;
  }
}

function failureText(code: string | null): string {
  switch (code) {
    case 'insufficient_funds':
      return "You don't have enough Dyce Cash for that stake.";
    case 'over_pool_stake_limit':
    case 'over_pool_games_limit':
      return "You've reached today's Pool limit. Try a Free match, or come back tomorrow.";
    case 'adult_required':
      return 'Pool is for players 18 and over.';
    case 'pool_frozen':
      return 'Pool is paused on your account.';
    case 'spaces_limit':
      return "You're in a lot of spaces already. Leave one first.";
    default:
      return "We couldn't start that match. Nothing was taken from your wallet.";
  }
}

/** "382 people looking" / "You're the first one looking". */
export function lookingText(n: number): string {
  if (n <= 1) return "You're the first one looking";
  return `${n} people looking`;
}
