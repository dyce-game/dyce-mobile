import { z } from 'zod';

/** Treat empty strings (a blank line in .env) as "not set". */
const optional = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema.optional());

const positiveInt = (def: number) => z.coerce.number().int().positive().default(def);

/** Validated at boot: the API refuses to start with missing or malformed configuration. */
export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    /** Connect as a login role that is a member of `dyce_api` (never a superuser). */
    DATABASE_URL: z.string().min(1),
    /** HS256 secret for access tokens. Colyseus verifies the same token. */
    JWT_SECRET: z.string().min(32),
    /** Server-side secret for hashing phone numbers and OTP codes. Rotating it breaks contact matching. */
    PHONE_HASH_SALT: z.string().min(32),
    JWT_ACCESS_TTL_SECONDS: positiveInt(900),
    REFRESH_TTL_DAYS: positiveInt(30),
    OTP_TTL_SECONDS: positiveInt(300),
    /** Non-production only: fixed 6-digit code, no SMS sent. For Maestro and local development. */
    OTP_TEST_CODE: optional(z.string().regex(/^\d{6}$/, 'OTP_TEST_CODE must be 6 digits')),
    /** "console" prints codes (masked number) to the log; "real" sends through Termii/Twilio. */
    SMS_DRIVER: z.enum(['console', 'real']).default('console'),
    TERMII_API_KEY: optional(z.string().min(1)),
    TERMII_SENDER_ID: optional(z.string().min(1)),
    TERMII_BASE_URL: optional(z.url()),
    TERMII_CHANNEL: optional(z.enum(['dnd', 'generic', 'whatsapp'])),
    TWILIO_ACCOUNT_SID: optional(z.string().min(1)),
    TWILIO_AUTH_TOKEN: optional(z.string().min(1)),
    TWILIO_FROM: optional(z.string().min(1)),
    TWILIO_MESSAGING_SERVICE_SID: optional(z.string().min(1)),
    /** Comma-separated browser origins allowed to call the API (web guest game, local web dev). Empty = none. */
    CORS_ORIGINS: optional(z.string()),
    /** Number of reverse-proxy hops to trust for client IPs (rate limiting). 0 = none. */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  })
  .superRefine((env, ctx) => {
    const fail = (path: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [path], message });

    if (env.NODE_ENV === 'production') {
      if (env.OTP_TEST_CODE) fail('OTP_TEST_CODE', 'must not be set in production');
      if (env.SMS_DRIVER !== 'real') fail('SMS_DRIVER', 'must be "real" in production');
    }
    if (env.SMS_DRIVER === 'real' && !hasTermii(env) && !hasTwilio(env)) {
      fail(
        'SMS_DRIVER',
        'real SMS needs Termii (key + sender id) or Twilio (sid + token + from/messaging service)',
      );
    }
  });

export type Env = z.infer<typeof envSchema>;

export function hasTermii(env: Pick<Env, 'TERMII_API_KEY' | 'TERMII_SENDER_ID'>): boolean {
  return Boolean(env.TERMII_API_KEY && env.TERMII_SENDER_ID);
}

export function hasTwilio(
  env: Pick<
    Env,
    'TWILIO_ACCOUNT_SID' | 'TWILIO_AUTH_TOKEN' | 'TWILIO_FROM' | 'TWILIO_MESSAGING_SERVICE_SID'
  >,
): boolean {
  return Boolean(
    env.TWILIO_ACCOUNT_SID &&
    env.TWILIO_AUTH_TOKEN &&
    (env.TWILIO_FROM || env.TWILIO_MESSAGING_SERVICE_SID),
  );
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid environment: ${problems}`);
  }
  return parsed.data;
}
