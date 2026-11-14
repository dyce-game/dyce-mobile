import { z } from 'zod';
import { nairaToKobo } from './money.ts';

/**
 * Typed `app_config` keys (limits, feature flags, payout schemes).
 * Values mirror the rows seeded in supabase/seed.sql; the server value always wins.
 */
export const payoutSchemeSchema = z.enum(['winner_all', 'p50_30_20', 'p60_40']);
export type PayoutScheme = z.infer<typeof payoutSchemeSchema>;

/** Percentage weights by placement. No house fee in v1. */
export const PAYOUT_WEIGHTS: Record<PayoutScheme, readonly number[]> = {
  winner_all: [100],
  p50_30_20: [50, 30, 20],
  p60_40: [60, 40],
};

export const appConfigSchema = z.object({
  /** Per-send cap (kobo). ₦50,000. */
  send_limit_kobo: z.number().int().default(nairaToKobo(50_000)),
  /** Daily send cap (kobo). ₦200,000. */
  send_daily_limit_kobo: z.number().int().default(nairaToKobo(200_000)),
  /** Free top-up claimable when balance is under this. ₦10,000. */
  topup_threshold_kobo: z.number().int().default(nairaToKobo(10_000)),
  /** Free daily top-up amount. ₦20,000. */
  topup_amount_kobo: z.number().int().default(nairaToKobo(20_000)),
  /** Max open QR/payment requests per user. */
  max_open_requests: z.number().int().default(10),
  /** QR requests shown in person expire after this many minutes. */
  qr_expiry_minutes: z.number().int().default(15),
  /** Requests sent into a chat expire after this many days. */
  chat_request_expiry_days: z.number().int().default(7),
  /** Daily rate limits. */
  stranger_requests_per_day: z.number().int().default(20),
  money_requests_per_day: z.number().int().default(30),
  sms_invites_per_day: z.number().int().default(50),
  stranger_scans_per_day: z.number().int().default(20),
  /** Pool daily limits (soft defaults; users may set lower personal limits). */
  pool_games_per_day: z.number().int().default(20),
  pool_staked_per_day_kobo: z.number().int().default(nairaToKobo(100_000)),
  /** Play Integrity / App Attest before first Pool; soft-fail while false. */
  integrity_required: z.boolean().default(false),
  /** Invitee has this long to respond before the stake is refunded. */
  match_invite_ttl_hours: z.number().int().default(24),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
export type AppConfigKey = keyof AppConfig;

export function parseAppConfig(rows: Record<string, unknown>): AppConfig {
  return appConfigSchema.parse(rows);
}
