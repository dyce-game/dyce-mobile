import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

/**
 * Phone numbers are never stored: only HMAC-SHA256(server secret, E.164). Hashing happens on the
 * server because plain device-side hashes of phone numbers are trivially reversible (small keyspace).
 * The "phone:" prefix domain-separates this from the OTP hash below, which uses the same secret.
 */
export function hashPhone(secret: string, e164: string): Buffer {
  return createHmac('sha256', secret).update(`phone:${e164}`).digest();
}

/** OTP codes are 6 digits, so the stored hash is keyed with a server secret and bound to the challenge id. */
export function hashOtp(secret: string, challengeId: string, code: string): Buffer {
  return createHmac('sha256', secret).update(`otp:${challengeId}:${code}`).digest();
}

export function safeEqual(a: Buffer, b: Buffer): boolean {
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Uniform 6-digit code from the OS CSPRNG (randomInt is unbiased). */
export function generateOtp(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Opaque refresh token (256 bits). Only its SHA-256 is stored; high entropy makes a plain hash safe. */
export function newRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Stable bigint key for pg_advisory_xact_lock, derived from a hash so raw data never reaches the lock. */
export function lockKey(hash: Buffer): string {
  return hash.readBigInt64BE(0).toString();
}
