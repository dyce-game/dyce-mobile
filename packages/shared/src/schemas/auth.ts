import { z } from 'zod';

/**
 * Username rules (docs/SPEC.md section 4): 3-20 chars, a-z 0-9 . _, unique case-insensitively.
 * Additional rules: no leading/trailing dot, no "..", and reserved names are blocked so nobody can
 * pose as the product or staff. Profanity filtering belongs to trust-safety.
 */
export const USERNAME_PATTERN = /^[a-z0-9_][a-z0-9._]{1,18}[a-z0-9_]$/;

export const RESERVED_USERNAMES: readonly string[] = [
  'dyce',
  'admin',
  'administrator',
  'support',
  'help',
  'official',
  'staff',
  'moderator',
  'mod',
  'system',
  'security',
  'team',
  'root',
  'null',
  'undefined',
  'wallet',
  'bank',
  'pool',
  'cash',
];

export function isReservedUsername(name: string): boolean {
  return RESERVED_USERNAMES.includes(name.toLowerCase());
}

export const usernameSchema = z
  .string()
  .transform((s) => s.trim().toLowerCase())
  .pipe(
    z
      .string()
      .regex(USERNAME_PATTERN, 'Use 3-20 letters, numbers, dots or underscores')
      .refine((s) => !s.includes('..'), 'No two dots in a row')
      .refine((s) => !isReservedUsername(s), 'That name is reserved'),
  );

export const countrySchema = z
  .string()
  .length(2)
  .transform((s) => s.toUpperCase());

export const phoneInputSchema = z.string().trim().min(5).max(32);

export const otpRequestSchema = z.object({
  phone: phoneInputSchema,
  country: countrySchema.optional(),
});
export type OtpRequest = z.infer<typeof otpRequestSchema>;

export const OTP_LENGTH = 6;
export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'Enter the 6-digit code');

export const otpVerifySchema = otpRequestSchema.extend({ code: otpCodeSchema });
export type OtpVerify = z.infer<typeof otpVerifySchema>;

export const refreshSchema = z.object({ refreshToken: z.string().min(20).max(256) });

export const profileCreateSchema = z.object({
  username: usernameSchema,
  displayName: z.string().trim().max(40).optional(),
});
export type ProfileCreate = z.infer<typeof profileCreateSchema>;

/** Age gate (first time a user picks Pool). Birth year only; see ADR-007 for the conservative rule. */
export const ageGateSchema = z.object({
  birthYear: z.number().int().min(1900).max(2100),
});

/** The adult rule from ADR-007: with only a birth year, 19+ is certainly 18+. */
export function isAdultByBirthYear(birthYear: number, currentYear: number): boolean {
  return currentYear - birthYear >= 19;
}

// ---- Onboarding ----------------------------------------------------------------------------

/** Order from docs/SPEC.md section 4: Phone -> Code -> Username -> Contacts -> Avatar -> Bonus -> Notifications. */
export const ONBOARDING_STEPS = [
  'username',
  'contacts',
  'avatar',
  'bonus',
  'notifications',
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];
export type NextStep = OnboardingStep | 'done';

/** Steps the client reports as finished (done or skipped). `username` and `bonus` are derived server-side. */
export const clientStepSchema = z.enum(['contacts', 'avatar', 'notifications']);
export type ClientStep = z.infer<typeof clientStepSchema>;

export type OnboardingState = {
  hasProfile: boolean;
  contacts: boolean;
  avatar: boolean;
  bonusGranted: boolean;
  notifications: boolean;
};

/** Where a (re)launched app should resume. Pure, so the server and the app agree. */
export function nextOnboardingStep(s: OnboardingState): NextStep {
  if (!s.hasProfile) return 'username';
  if (!s.contacts) return 'contacts';
  if (!s.avatar) return 'avatar';
  if (!s.bonusGranted) return 'bonus';
  if (!s.notifications) return 'notifications';
  return 'done';
}

export type SessionTokens = {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
};

export type SessionResponse = SessionTokens & {
  userId: string;
  isNewUser: boolean;
  nextStep: NextStep;
};
