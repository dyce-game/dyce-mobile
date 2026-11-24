import type { HistoryItem } from '@dyce/shared';
import { dayLabel, newMessageId } from '../chat/chat-logic';

/** A request we were already watching has just turned paid (not a first load of one that was paid before). */
export function requestJustPaid(
  previous: string | undefined,
  current: string | undefined,
): boolean {
  return previous !== undefined && previous !== 'paid' && current === 'paid';
}

/** Quick amounts on the Send and Request screens, in whole naira. */
export const AMOUNT_PRESETS = [500, 1_000, 2_000, 5_000] as const;

const KOBO_PER_NAIRA = 100;

/**
 * Reads what someone typed into an amount field ("1,500", "Ð 2000", "5000.") as whole naira and returns kobo.
 * Whole naira only (the keypad has no decimals); empty, zero and anything with letters or decimals is null.
 */
export function parseNairaInput(text: string): number | null {
  const cleaned = text.replace(/[Ð₦\s,]/g, '').replace(/\.$/, '');
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

// ---- the design's wallet screens ---------------------------------------------------------------------

/** The History chips (design: WalletHistory). */
export const HISTORY_CHIPS: { key: 'all' | 'pool' | 'transfer' | 'bonus'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pool', label: 'Pools' },
  { key: 'transfer', label: 'Transfers' },
  { key: 'bonus', label: 'Bonuses & refunds' },
];

/** "Amaka Obi" -> "AO", "tunde.o" -> "T". Up to two letters. */
export function initials(name: string): string {
  const parts = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}

const EMBER = '#C93E1C';
const BRASS = '#C98500';

/** The coloured tile on a history row or receipt: initials for people, Ð for cash events, P for Pools. */
export function historyTile(item: Pick<HistoryItem, 'kind' | 'counterparty'>): {
  mark: string;
  bg: string;
} {
  switch (item.kind) {
    case 'transfer':
    case 'request_payment':
      return {
        mark: initials(item.counterparty?.displayName || item.counterparty?.username || '?'),
        bg: EMBER,
      };
    case 'stake':
    case 'payout':
    case 'refund':
      return { mark: 'P', bg: BRASS };
    default:
      return { mark: 'Ð', bg: EMBER };
  }
}

/** The weekday letter for a "2026-11-15" date ("S", "M", ...). Date-only, so no time zone can shift it. */
export function weekdayLetter(date: string): string {
  const d = new Date(`${date}T12:00:00Z`).getUTCDay();
  return 'SMTWTFS'[d] ?? '';
}

/** Bar heights for the week chart: each day's share of the biggest day, capped at 70% like the design so a bar never reaches the amount above it, never thinner than a sliver. */
export function weekBars(
  days: { date: string; netKobo: number }[],
): { letter: string; pct: number; loss: boolean }[] {
  const max = Math.max(1, ...days.map((d) => Math.abs(d.netKobo)));
  return days.map((d) => ({
    letter: weekdayLetter(d.date),
    pct: d.netKobo === 0 ? 4 : Math.max(8, Math.round((Math.abs(d.netKobo) / max) * 70)),
    loss: d.netKobo < 0,
  }));
}

/** The calculator keypad on Send: digits, "00" and delete, capped at `maxNaira`. Returns the new digit string. */
export function keypadPress(current: string, key: string, maxNaira: number): string {
  const a = current === '0' ? '' : current;
  if (key === 'del') return a.slice(0, -1) || '0';
  const next = (a + key).replace(/^0+/, '') || '0';
  return String(Math.min(maxNaira, parseInt(next, 10)));
}
