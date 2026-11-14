import { z } from 'zod';

/** Validated at boot: the API refuses to start with missing or malformed configuration. */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  /** Connect as a login role that is a member of `dyce_api` (never a superuser). */
  DATABASE_URL: z.string().min(1),
  /** HS256 secret for access tokens. Colyseus verifies the same token. */
  JWT_SECRET: z.string().min(32),
  /** Server-side salt for phone hashing (HMAC). Rotating it invalidates contact matching. */
  PHONE_HASH_SALT: z.string().min(16),
});

export type Env = z.infer<typeof envSchema>;

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
