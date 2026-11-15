import type { HistoryItem } from '@dyce/shared';
import { dayLabel, newMessageId } from '../chat/chat-logic';

/** Quick amounts on the Send and Request screens, in whole naira. */
export const AMOUNT_PRESETS = [500, 1_000, 2_000, 5_000] as const;

const KOBO_PER_NAIRA = 100;

/**
 * Reads what someone typed into an amount field ("1,500", "₦ 2000", "5000.") as whole naira and returns kobo.
 * Whole naira only (the keypad has no decimals); empty, zero and anything with letters or decimals is null.
 */
export function parseNairaInput(text: string): number | null {
  const cleaned = text.replace(/[₦\s,]/g, '').replace(/\.$/, '');
  if (!/^\d{1,9}$/.test(cleaned)) return null;
  const naira = Number(cleaned);
  return naira > 0 ? naira * KOBO_PER_NAIRA : null;
}

/** The link a request's QR code holds (it carries only the code, never an amount or a name). */
export const requestUrl = (code: string) => `https://dyce.games/r/${code}`;

/**
 * Pulls a request code out of what was scanned or pasted: the bare code, `https://dyce.games/r/<code>` or
 * `dyce://r/<code>`. Anything else (another site, a personal code, junk) is null: "That's not a Dyce code."
 */
export function parseRequestCode(input: string): string | null {
  const text = input.trim();
  const code = /^[A-Za-z2-7]{10}$/.test(text)
    ? text
    : (/^(?:https:\/\/(?:www\.)?dyce\.games|dyce:\/)\/r\/([A-Za-z2-7]{10})\/?(?:[?#].*)?$/i.exec(
        text,
      )?.[1] ?? null);
  return code ? code.toUpperCase() : null;
}

/** "Expires in 14 min", "Expires in 6 days", or "Expired". */
export function expiryLabel(expiresAt: string, now: Date = new Date()): string {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (ms <= 0) return 'Expired';
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return `Expires in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Expires in ${hours} ${hours === 1 ? 'hour' : 'hours'}`;
  const days = Math.floor(hours / 24);
  return `Expires in ${days} ${days === 1 ? 'day' : 'days'}`;
}

/** An idempotency key for one money action. Make it once per confirmation and reuse it on retry. */
export const newMoneyKey = (prefix: 'send' | 'pay'): string => `${prefix}-${newMessageId()}`;

/** The line for a history row: who it was with, in words. */
export function historyTitle(item: HistoryItem): string {
  const who =
    item.counterparty?.displayName || (item.counterparty ? `@${item.counterparty.username}` : '');
  switch (item.kind) {
    case 'grant':
      return 'Dyce welcome gift';
    case 'topup':
      return 'Daily top-up';
    case 'transfer':
      return item.amountKobo < 0 ? `Sent to ${who}` : `Received from ${who}`;
    case 'request_payment':
      return item.amountKobo < 0 ? `Paid ${who}` : `${who} paid you`;
    case 'stake':
      return 'Pool stake';
    case 'payout':
      return 'Pool winnings';
    case 'refund':
      return 'Pool refund';
    case 'reversal':
      return 'Reversal';
    default:
      return 'Adjustment';
  }
}

/** History rows grouped under day headings ("Today", "Yesterday", ...), keeping order. */
export function groupByDay(
  items: HistoryItem[],
  now: Date = new Date(),
): { label: string; items: HistoryItem[] }[] {
  const groups: { label: string; items: HistoryItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.createdAt, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(item);
    else groups.push({ label, items: [item] });
  }
  return groups;
}
