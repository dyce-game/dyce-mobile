import { maskEmail, normalizeEmail } from '@dyce/shared';

/** "signup" and "login" are the same one-time-code flow on the server; the words around it differ. */
export type EmailMode = 'signup' | 'login';

export function parseEmailMode(value: unknown): EmailMode {
  return value === 'login' ? 'login' : 'signup';
}

export function emailCopy(mode: EmailMode): {
  title: string;
  intro: string;
  sentTo: (email: string) => string;
  footnote: string;
  switchLabel: string;
  switchTo: EmailMode;
} {
  return mode === 'login'
    ? {
        title: 'Log in with email',
        intro: "Enter the email you signed up with. We'll email you a code. No passwords, ever.",
        sentTo: (email) => `Code sent to ${maskEmail(email)}`,
        footnote:
          "If this email isn't on Dyce yet, we'll start a new account for it after you confirm the code.",
        switchLabel: 'New to Dyce? Sign up with email',
        switchTo: 'signup',
      }
    : {
        title: "What's your email?",
        intro: "We'll email a 6-digit code to confirm it's yours. No passwords, ever.",
        sentTo: (email) => `Code sent to ${maskEmail(email)}`,
        footnote:
          'Same screen logs you back in. Your email stays private; friends find you by @username.',
        switchLabel: 'On Dyce already? Log in with email',
        switchTo: 'login',
      };
}

/**
 * What to tell the person about what they typed, or null when it is fine. An empty field is not an error (the
 * Continue button is simply off), but a half-typed address is told once they leave the field or press Continue.
 */
export function emailProblem(raw: string): string | null {
  if (raw.trim().length === 0) return null;
  return normalizeEmail(raw)
    ? null
    : "That doesn't look like a valid email address. Check it and try again.";
}

/** Tidy what was typed before it is sent and shown: trimmed, lower case (the server does the same). */
export function cleanEmail(raw: string): string {
  return (normalizeEmail(raw) ?? raw.trim()).toLowerCase();
}
