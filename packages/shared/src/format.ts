import { KOBO_PER_NAIRA, type Kobo } from './money.ts';

const NAIRA = '₦';

function groupThousands(n: number): string {
  // Manual grouping: Intl differs between Hermes builds and Deno; this is stable everywhere.
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** One decimal, truncated (never rounded up, so a balance is never overstated); ".0" is dropped. */
function oneDecimal(value: number, divisor: number): string {
  const tenths = Math.floor((value * 10) / divisor);
  const whole = Math.floor(tenths / 10);
  const dec = tenths % 10;
  return dec === 0 ? String(whole) : `${whole}.${dec}`;
}

export type FormatNairaOptions = {
  /** Compact style for pills, headers, list cards: ₦950 · ₦1,500 · ₦12.5k · ₦200k · ₦1.2m */
  compact?: boolean;
};

/**
 * Display kobo as naira. See docs/WALLET_AND_QR.md §1.
 * - full (receipts, confirm sheets): ₦200,000 (kobo shown only when non-zero: ₦1,500.50)
 * - compact: < ₦10,000 → full with separator; ≥ ₦10,000 → k; ≥ ₦1,000,000 → m
 */
export function formatNaira(amount: Kobo | number, opts: FormatNairaOptions = {}): string {
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const naira = Math.floor(abs / KOBO_PER_NAIRA);
  const sign = negative ? '-' : '';

  if (opts.compact) {
    if (naira >= 1_000_000) return `${sign}${NAIRA}${oneDecimal(naira, 1_000_000)}m`;
    if (naira >= 10_000) return `${sign}${NAIRA}${oneDecimal(naira, 1_000)}k`;
    return `${sign}${NAIRA}${groupThousands(naira)}`;
  }

  const kobo = abs % KOBO_PER_NAIRA;
  const frac = kobo === 0 ? '' : `.${String(kobo).padStart(2, '0')}`;
  return `${sign}${NAIRA}${groupThousands(naira)}${frac}`;
}
