import type { ReportReason } from '@dyce/shared';

/** The reasons on the Report screen, in the design's order, with their one-line help. */
export const REPORT_REASON_LIST: { id: ReportReason; title: string; help: string }[] = [
  { id: 'cheat', title: 'Cheating or using a bot', help: 'Impossible moves, too-perfect play' },
  { id: 'abuse', title: 'Abusive messages', help: 'Insults, threats, slurs' },
  { id: 'scam', title: 'Scam or fake payment', help: 'Asked for real money or bank details' },
  { id: 'spam', title: 'Spam challenges', help: 'Sends games nonstop' },
  { id: 'name', title: 'Offensive name or avatar', help: '' },
  { id: 'other', title: 'Something else', help: '' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Blocked today", "Blocked yesterday" or "Blocked Oct 30" (with the year if it wasn't this year). */
export function blockedLabel(iso: string, now: Date = new Date()): string {
  const d = new Date(iso);
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const ago = Math.round((day(now) - day(d)) / 86_400_000);
  if (ago <= 0) return 'Blocked today';
  if (ago === 1) return 'Blocked yesterday';
  const base = `${MONTHS[d.getMonth()]} ${d.getDate()}`;
  return `Blocked ${d.getFullYear() === now.getFullYear() ? base : `${base}, ${d.getFullYear()}`}`;
}

/** The link to the Report screen for a person, optionally with the chat to attach. */
export function reportHref(p: {
  userId: string;
  username?: string;
  name?: string;
  /** Their starter look id (e.g. dyce_av_042), so the report screen can show their face. */
  avatar?: string;
  conversationId?: string;
  /** The one message being reported (it must be in `conversationId`). */
  messageId?: string;
}): string {
  const q = Object.entries(p)
    .filter(([, v]) => typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`)
    .join('&');
  return `/report?${q}`;
}
