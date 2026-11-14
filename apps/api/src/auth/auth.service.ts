import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { maskPhone, normalizePhone, type SessionResponse, type SessionTokens } from '@dyce/shared';
import { withTx } from '../db/tx.ts';
import { loadNextStep } from '../profile/onboarding.ts';
import type { SmsProvider } from '../sms/sms-provider.ts';
import { SmsDeliveryError } from '../sms/sms-provider.ts';
import { AuthError } from './auth-error.ts';
import {
  generateOtp,
  hashOtp,
  hashPhone,
  lockKey,
  newRefreshToken,
  safeEqual,
  sha256,
} from './crypto.ts';
import type { Clock, TokenService } from './tokens.ts';

export type AuthConfig = {
  /** Secret for phone/OTP hashing (PHONE_HASH_SALT). */
  phoneSecret: string;
  otpTtlSeconds: number;
  refreshTtlDays: number;
  /** Non-production only: every challenge uses this code and no SMS is sent. */
  otpTestCode?: string;
};

export const OTP_RESEND_COOLDOWN_SECONDS = 30;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LIMIT_PER_10_MIN = 3;
export const OTP_LIMIT_PER_DAY = 10;

const TEN_MIN_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type OtpRow = {
  id: string;
  code_hash: Buffer;
  attempts: number;
  expires_at: Date;
};

type Logger = { warn(message: string): void };

export class AuthService {
  constructor(
    private readonly pool: pg.Pool,
    private readonly sms: SmsProvider,
    private readonly tokens: TokenService,
    private readonly config: AuthConfig,
    private readonly clock: Clock = () => new Date(),
    private readonly logger: Logger = { warn: () => undefined },
  ) {}

  private phoneToHash(phone: string, country?: string): { e164: string; hash: Buffer } {
    const e164 = normalizePhone(phone, country);
    if (!e164) throw new AuthError('invalid_phone');
    return { e164, hash: hashPhone(this.config.phoneSecret, e164) };
  }

  // ---- OTP ----------------------------------------------------------------------------------

  /**
   * Sends a one-time code. The response is identical whether or not the number already has an
   * account, so this endpoint can't be used to find out who is on Dyce.
   */
  async requestOtp(input: { phone: string; country?: string }): Promise<{
    resendAfterSeconds: number;
    expiresInSeconds: number;
  }> {
    const { e164, hash } = this.phoneToHash(input.phone, input.country);
    const now = this.clock();
    const testMode = this.config.otpTestCode !== undefined;
    const code = this.config.otpTestCode ?? generateOtp();
    const id = randomUUID();

    await withTx(this.pool, async (c) => {
      // Serialise per phone so concurrent requests can't slip past the rate limits.
      await c.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey(hash)]);

      const windowStart = new Date(now.getTime() - DAY_MS);
      const tenMinStart = new Date(now.getTime() - TEN_MIN_MS);
      const r = await c.query<{
        last: Date | null;
        ten_count: string;
        day_count: string;
        oldest_ten: Date | null;
        oldest_day: Date | null;
      }>(
        `SELECT max(created_at) AS last,
                count(*) FILTER (WHERE created_at > $3) AS ten_count,
                count(*) AS day_count,
                min(created_at) FILTER (WHERE created_at > $3) AS oldest_ten,
                min(created_at) AS oldest_day
           FROM otp_challenges WHERE phone_hash = $1 AND created_at > $2`,
        [hash, windowStart, tenMinStart],
      );
      const row = r.rows[0]!;
      const secondsUntil = (t: Date, windowMs: number) =>
        Math.max(1, Math.ceil((t.getTime() + windowMs - now.getTime()) / 1000));

      if (row.last) {
        const since = (now.getTime() - row.last.getTime()) / 1000;
        if (since < OTP_RESEND_COOLDOWN_SECONDS) {
          throw new AuthError('otp_resend_too_soon', {
            retryAfterSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - since),
          });
        }
      }
      if (Number(row.ten_count) >= OTP_LIMIT_PER_10_MIN && row.oldest_ten) {
        throw new AuthError('otp_rate_limited', {
          retryAfterSeconds: secondsUntil(row.oldest_ten, TEN_MIN_MS),
        });
      }
      if (Number(row.day_count) >= OTP_LIMIT_PER_DAY && row.oldest_day) {
        throw new AuthError('otp_rate_limited', {
          retryAfterSeconds: secondsUntil(row.oldest_day, DAY_MS),
        });
      }

      await c.query(
        `INSERT INTO otp_challenges (id, phone_hash, code_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          id,
          hash,
          hashOtp(this.config.phoneSecret, id, code),
          new Date(now.getTime() + this.config.otpTtlSeconds * 1000),
          now,
        ],
      );
    });

    if (!testMode) {
      try {
        await this.sms.send(
          e164,
          `Your Dyce code is ${code}. It expires in ${Math.round(this.config.otpTtlSeconds / 60)} minutes. Never share it.`,
        );
      } catch (err) {
        // Don't burn the user's rate limit on our provider's failure.
        await this.pool.query('DELETE FROM otp_challenges WHERE id = $1', [id]);
        const provider = err instanceof SmsDeliveryError ? err.provider : 'unknown';
        this.logger.warn(`otp send failed via ${provider} to ${maskPhone(e164)}`);
        throw new AuthError('sms_failed');
      }
    }

    return {
      resendAfterSeconds: OTP_RESEND_COOLDOWN_SECONDS,
      expiresInSeconds: this.config.otpTtlSeconds,
    };
  }

  /** Checks the code and, on success, finds or creates the account and starts a session. */
  async verifyOtp(input: {
    phone: string;
    country?: string;
    code: string;
  }): Promise<SessionResponse> {
    const { hash } = this.phoneToHash(input.phone, input.country);
    const now = this.clock();

    type Outcome = { ok: true; session: SessionResponse } | { ok: false; error: AuthError };

    const outcome = await withTx<Outcome>(this.pool, async (c) => {
      await c.query('SELECT pg_advisory_xact_lock($1::bigint)', [lockKey(hash)]);

      const r = await c.query<OtpRow>(
        `SELECT id, code_hash, attempts, expires_at FROM otp_challenges
          WHERE phone_hash = $1 AND consumed_at IS NULL
          ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
        [hash],
      );
      const challenge = r.rows[0];
      if (!challenge) return { ok: false, error: new AuthError('otp_invalid') };
      if (challenge.expires_at <= now) return { ok: false, error: new AuthError('otp_expired') };
      if (challenge.attempts >= OTP_MAX_ATTEMPTS)
        return { ok: false, error: new AuthError('otp_locked') };

      const expected = hashOtp(this.config.phoneSecret, challenge.id, input.code);
      if (!safeEqual(expected, challenge.code_hash)) {
        // Commit the failed attempt (returning, not throwing, so it isn't rolled back).
        const u = await c.query<{ attempts: number }>(
          'UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts',
          [challenge.id],
        );
        const remaining = Math.max(0, OTP_MAX_ATTEMPTS - (u.rows[0]?.attempts ?? OTP_MAX_ATTEMPTS));
        return {
          ok: false,
          error:
            remaining === 0
              ? new AuthError('otp_locked')
              : new AuthError('otp_invalid', { attemptsRemaining: remaining }),
        };
      }

      await c.query('UPDATE otp_challenges SET consumed_at = $2 WHERE id = $1', [
        challenge.id,
        now,
      ]);

      const u = await c.query<{ id: string; inserted: boolean; disabled_at: Date | null }>(
        `INSERT INTO users (phone_hash, created_at) VALUES ($1, $2)
         ON CONFLICT (phone_hash) DO UPDATE SET phone_hash = users.phone_hash
         RETURNING id, (xmax = 0) AS inserted, disabled_at`,
        [hash, now],
      );
      const user = u.rows[0]!;
      if (user.disabled_at) return { ok: false, error: new AuthError('account_disabled') };

      const familyId = randomUUID();
      const tokens = await this.startSession(c, user.id, familyId, now);
      const nextStep = await loadNextStep(c, user.id);
      return {
        ok: true,
        session: { ...tokens, userId: user.id, isNewUser: user.inserted, nextStep },
      };
    });

    if (!outcome.ok) throw outcome.error;
    return outcome.session;
  }

  // ---- Sessions -----------------------------------------------------------------------------

  private async startSession(
    c: pg.PoolClient,
    userId: string,
    familyId: string,
    now: Date,
  ): Promise<SessionTokens> {
    const refreshToken = newRefreshToken();
    await c.query(
      `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, familyId, sha256(refreshToken), this.refreshExpiry(now), now],
    );
    return {
      accessToken: await this.tokens.signAccess({ userId, familyId }),
      refreshToken,
      expiresIn: this.tokens.expiresIn,
    };
  }

  private refreshExpiry(now: Date): Date {
    return new Date(now.getTime() + this.config.refreshTtlDays * DAY_MS);
  }

  /**
   * Rotates a refresh token. Presenting a token that was already rotated or revoked means it was
   * stolen or replayed, so the whole session family is revoked and the user signs in again.
   */
  async refresh(refreshToken: string): Promise<SessionTokens> {
    const now = this.clock();
    type Outcome = { ok: true; tokens: SessionTokens } | { ok: false; error: AuthError };

    const outcome = await withTx<Outcome>(this.pool, async (c) => {
      const r = await c.query<{
        id: string;
        user_id: string;
        family_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        replaced_by: string | null;
      }>(
        `SELECT id, user_id, family_id, expires_at, revoked_at, replaced_by
           FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE`,
        [sha256(refreshToken)],
      );
      const row = r.rows[0];
      if (!row) return { ok: false, error: new AuthError('invalid_refresh') };

      if (row.revoked_at || row.replaced_by) {
        await c.query(
          'UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL',
          [row.family_id, now],
        );
        return { ok: false, error: new AuthError('refresh_reused') };
      }
      if (row.expires_at <= now) return { ok: false, error: new AuthError('invalid_refresh') };

      const u = await c.query<{ disabled_at: Date | null }>(
        'SELECT disabled_at FROM users WHERE id = $1',
        [row.user_id],
      );
      if (!u.rows[0] || u.rows[0].disabled_at) {
        await c.query(
          'UPDATE refresh_tokens SET revoked_at = $2 WHERE family_id = $1 AND revoked_at IS NULL',
          [row.family_id, now],
        );
        return { ok: false, error: new AuthError('account_disabled') };
      }

      const next = newRefreshToken();
      const ins = await c.query<{ id: string }>(
        `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, created_at)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [row.user_id, row.family_id, sha256(next), this.refreshExpiry(now), now],
      );
      await c.query('UPDATE refresh_tokens SET revoked_at = $2, replaced_by = $3 WHERE id = $1', [
        row.id,
        now,
        ins.rows[0]!.id,
      ]);
      return {
        ok: true,
        tokens: {
          accessToken: await this.tokens.signAccess({
            userId: row.user_id,
            familyId: row.family_id,
          }),
          refreshToken: next,
          expiresIn: this.tokens.expiresIn,
        },
      };
    });

    if (!outcome.ok) throw outcome.error;
    return outcome.tokens;
  }

  /** Ends this device's session. Idempotent: an unknown token is not an error. */
  async logout(refreshToken: string): Promise<void> {
    const now = this.clock();
    await this.pool.query(
      `UPDATE refresh_tokens SET revoked_at = $2
        WHERE revoked_at IS NULL AND family_id IN (SELECT family_id FROM refresh_tokens WHERE token_hash = $1)`,
      [sha256(refreshToken), now],
    );
  }

  /** Ends every session for a user (account deletion, "sign out everywhere"). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.pool.query(
      'UPDATE refresh_tokens SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL',
      [userId, this.clock()],
    );
  }

  /** Housekeeping for a scheduled job: drops spent OTP challenges and long-dead refresh tokens. */
  async purgeExpired(): Promise<{ otp: number; refresh: number }> {
    const now = this.clock();
    const otp = await this.pool.query('DELETE FROM otp_challenges WHERE created_at < $1', [
      new Date(now.getTime() - DAY_MS * 2),
    ]);
    const refresh = await this.pool.query('DELETE FROM refresh_tokens WHERE expires_at < $1', [
      new Date(now.getTime() - DAY_MS * 7),
    ]);
    return { otp: otp.rowCount ?? 0, refresh: refresh.rowCount ?? 0 };
  }
}
