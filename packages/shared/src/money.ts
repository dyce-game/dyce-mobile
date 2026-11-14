import { z } from 'zod';

/**
 * Money is integer kobo. ₦1 = 100 kobo. Never floats.
 * In Postgres this is `bigint`; in TS it is a number inside the safe-integer range,
 * branded so a raw number can't be passed where kobo is expected.
 */
export type Kobo = number & { readonly __brand: 'Kobo' };

export const KOBO_PER_NAIRA = 100;

/** Starting grant: ₦200,000. */
export const WELCOME_GRANT_KOBO = nairaToKobo(200_000);

export function isKobo(n: unknown): n is Kobo {
  return typeof n === 'number' && Number.isSafeInteger(n);
}

/** Assert that `n` is a safe integer and brand it. Negative values are allowed (signed ledger entries). */
export function kobo(n: number): Kobo {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(`Kobo must be a safe integer, got ${n}`);
  }
  return n as Kobo;
}

/** Whole naira → kobo. Fractions of a naira are rejected: amount entry is whole naira only. */
export function nairaToKobo(naira: number): Kobo {
  if (!Number.isSafeInteger(naira)) {
    throw new RangeError(`Naira must be a whole number, got ${naira}`);
  }
  return kobo(naira * KOBO_PER_NAIRA);
}

export function addKobo(a: Kobo, b: Kobo): Kobo {
  return kobo(a + b);
}

export function subKobo(a: Kobo, b: Kobo): Kobo {
  return kobo(a - b);
}

/** zod schema for a Kobo value on the wire (JSON numbers). */
export const koboSchema = z
  .number()
  .int()
  .refine(Number.isSafeInteger, 'Out of safe-integer range')
  .transform((n) => n as Kobo);

/** A strictly positive amount, as required by transfers, stakes and requests. */
export const positiveKoboSchema = koboSchema.refine((n) => n > 0, 'Amount must be positive');

/**
 * Split `total` across `weights` (e.g. [50, 30, 20]) in integer kobo.
 * Each share is floored; the rounding remainder goes to the first share
 * (the first-placed player), matching `settle_match()` in WALLET_AND_QR.md §2.
 */
export function splitKobo(total: Kobo, weights: readonly number[]): Kobo[] {
  if (weights.length === 0) throw new RangeError('weights must not be empty');
  if (total < 0) throw new RangeError('total must not be negative');
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) throw new RangeError('weights must sum to a positive number');
  const shares = weights.map((w) => Math.floor((total * w) / sum));
  const distributed = shares.reduce((a, b) => a + b, 0);
  shares[0] = (shares[0] ?? 0) + (total - distributed);
  return shares.map(kobo);
}
