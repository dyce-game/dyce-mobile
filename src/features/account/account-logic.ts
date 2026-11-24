import {
  formatNaira,
  type DeletionPreview,
  type DisputeReason,
  type DisputeView,
  type MatchDisputeInfo,
} from '@dyce/shared';

/**
 * Pure logic for the account screens (Delete account, Download my data) and the Pool dispute screens
 * (Dispute, DisputeStatus). No React, so it is unit tested.
 */

// ---- delete account ---------------------------------------------------------------------------

/** The confirm button unlocks when the typed text is the account's username (case and a leading @ ignored). */
export function deletionConfirmed(typed: string, username: string): boolean {
  const t = typed.trim().replace(/^@/, '').toLowerCase();
  return t.length > 0 && t === username.toLowerCase();
}

export type DeletionRow = {
  mark: string;
  tone: 'ember' | 'money' | 'warn' | 'blue';
  title: string;
  body: string;
};

/** What deleting does, in the order of the design, with the real numbers for this person. */
export function deletionRows(p: DeletionPreview): DeletionRow[] {
  return [
    {
      mark: '@',
      tone: 'ember',
      title: 'Your @username is released',
      body: `Someone else can claim @${p.username} once your account is erased.`,
    },
    {
      mark: 'Ð',
      tone: 'money',
      title: 'Dyce Cash is cleared',
      body:
        p.balanceKobo > 0
          ? `${formatNaira(p.balanceKobo)} goes to zero. It was virtual, so nothing is paid out.`
          : 'Your balance is already zero. It was virtual, so nothing is paid out.',
    },
    {
      mark: '✕',
      tone: 'warn',
      title: 'Your profile, friends and stats are erased',
      body: 'Games you played stay in your opponents’ history as “Deleted player”. Friends keep their own copies of messages you sent them.',
    },
    {
      mark: '↓',
      tone: 'blue',
      title: 'Want a copy first?',
      body: 'Download your data from Settings before you go.',
    },
  ];
}

/** The yellow note about open games, or null when there are none. */
export function openGamesNote(p: DeletionPreview): string | null {
  if (p.openGames <= 0) return null;
  const games = p.openGames === 1 ? '1 game is still open' : `${p.openGames} games are still open`;
  return `${games}. When your account is erased they are cancelled and any Pool stake goes back to everyone who put one in.`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Dec" (with the year when it is not this one). */
export function shortDate(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const base = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

/** "Wed 12 Dec, 6:00 PM". */
export function longDateTime(iso: string): string {
  const d = new Date(iso);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${days[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}, ${((h + 11) % 12) + 1}:${m} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---- data export ------------------------------------------------------------------------------

export function exportFileName(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `dyce-data-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** The document as the file will hold it: readable, two-space indented. */
export function exportToText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// ---- disputes ---------------------------------------------------------------------------------

export const DISPUTE_REASON_LIST: { id: DisputeReason; label: string }[] = [
  { id: 'cheat', label: 'Opponent cheated' },
  { id: 'glitch', label: 'Game glitched' },
  { id: 'score', label: 'Score is wrong' },
  { id: 'disconnect', label: 'Unfair disconnect' },
  { id: 'other', label: 'Something else' },
];

export function disputeReasonLabel(r: DisputeReason): string {
  return DISPUTE_REASON_LIST.find((x) => x.id === r)?.label ?? 'Something else';
}

/** "You have 5 hours left to dispute this result", "You have 38 minutes…", or null once the window is shut. */
export function disputeWindowText(info: MatchDisputeInfo, now: Date = new Date()): string | null {
  if (!info.windowEndsAt) return null;
  const ms = new Date(info.windowEndsAt).getTime() - now.getTime();
  if (ms <= 0) return null;
  const mins = Math.ceil(ms / 60_000);
  if (mins < 60)
    return `You have ${mins} minute${mins === 1 ? '' : 's'} left to dispute this result.`;
  const hours = Math.ceil(mins / 60);
  return `You have ${hours} hour${hours === 1 ? '' : 's'} left to dispute this result.`;
}

/** Why a result cannot be disputed, in words (null when it can, or when you already did). */
export function disputeBlockedText(info: MatchDisputeInfo): string | null {
  switch (info.blockedBy) {
    case 'not_pool':
      return 'Only Pool results can be disputed. Free games have no money at stake.';
    case 'not_finished':
      return 'You can dispute a result once the game has finished.';
    case 'window_closed':
      return 'The 24 hour window for disputing this result has closed.';
    default:
      return null;
  }
}

export type DisputeStep = {
  title: string;
  body: string;
  state: 'done' | 'now' | 'next';
};

/**
 * The status timeline of the design, told truthfully (ADR-037): the money has already been paid out and nothing is
 * frozen, so there is no "pot frozen" step. Submitted, then a person looks at it, then a decision you can read here.
 */
export function disputeSteps(d: DisputeView): DisputeStep[] {
  const decided = d.status === 'upheld' || d.status === 'reversed';
  const reviewing = d.status === 'reviewing' || decided;
  return [
    { title: 'Submitted', body: longDateTime(d.createdAt), state: 'done' },
    {
      title: reviewing ? 'A person looked at it' : 'Waiting for a person',
      body: reviewing
        ? d.reviewingAt
          ? longDateTime(d.reviewingAt)
          : 'Reviewed by the Dyce team.'
        : 'Someone on the Dyce team will check the game’s moves and timing.',
      state: reviewing ? 'done' : 'now',
    },
    {
      title: 'Decision',
      body: decided
        ? (d.decisionNote ?? decisionLine(d.status))
        : 'It will appear here. Check back later.',
      state: decided ? 'done' : 'next',
    },
  ];
}

export function decisionLine(status: DisputeView['status']): string {
  switch (status) {
    case 'reversed':
      return 'We found a problem with this result and corrected it.';
    case 'upheld':
      return 'We checked the game and the result stands.';
    default:
      return '';
  }
}

/** The pill at the top of the status screen. */
export function disputeBadge(status: DisputeView['status']): string {
  switch (status) {
    case 'open':
      return 'SUBMITTED';
    case 'reviewing':
      return 'IN REVIEW';
    case 'upheld':
      return 'RESULT STANDS';
    case 'reversed':
      return 'CORRECTED';
  }
}
