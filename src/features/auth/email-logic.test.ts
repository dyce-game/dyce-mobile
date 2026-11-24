import { ApiError } from './api-client';
import { cleanEmail, emailCopy, emailProblem, parseEmailMode } from './email-logic';
import { authErrorMessage } from './messages';

describe('parseEmailMode', () => {
  it('is "login" only for "login"; anything else (or nothing) is sign-up', () => {
    expect(parseEmailMode('login')).toBe('login');
    expect(parseEmailMode('signup')).toBe('signup');
    expect(parseEmailMode(undefined)).toBe('signup');
    expect(parseEmailMode('LOGIN')).toBe('signup');
    expect(parseEmailMode(['login'])).toBe('signup');
  });
});

describe('emailCopy', () => {
  it('words sign-up and log-in differently and offers the other as a switch', () => {
    const up = emailCopy('signup');
    const inn = emailCopy('login');
    expect(up.title).toBe("What's your email?");
    expect(inn.title).toBe('Log in with email');
    expect(up.switchTo).toBe('login');
    expect(inn.switchTo).toBe('signup');
    expect(up.switchLabel).toContain('Log in with email');
    expect(inn.switchLabel).toContain('Sign up with email');
  });

  it('says where the code went without printing the whole address', () => {
    const line = emailCopy('signup').sentTo('tunde.okafor@gmail.com');
    expect(line).toBe('Code sent to t••••••@gmail.com');
    expect(line).not.toContain('okafor');
  });

  it('tells a person logging in that an unknown address starts a new account', () => {
    expect(emailCopy('login').footnote).toMatch(/new account/);
  });
});

describe('emailProblem', () => {
  it('stays quiet for an empty field and for a good address', () => {
    expect(emailProblem('')).toBeNull();
    expect(emailProblem('   ')).toBeNull();
    expect(emailProblem(' Ada@Example.com ')).toBeNull();
  });
  it('explains a half-typed or wrong address', () => {
    for (const bad of ['ada', 'ada@', 'ada@example', 'a b@example.com']) {
      expect(emailProblem(bad)).toMatch(/valid email/);
    }
  });
});

describe('cleanEmail', () => {
  it('trims and lower-cases, and leaves an invalid string readable', () => {
    expect(cleanEmail('  Ada.Obi@Example.COM ')).toBe('ada.obi@example.com');
    expect(cleanEmail(' NOT AN EMAIL ')).toBe('not an email');
  });
});

describe('email error copy', () => {
  const e = (code: string) => authErrorMessage(new ApiError(422, code, {}));
  it('has plain words for every new code', () => {
    expect(e('invalid_email')).toMatch(/valid email/);
    expect(e('email_failed')).toMatch(/send the email/);
    expect(e('email_auth_disabled')).toMatch(/phone number/);
    expect(e('identity_taken')).toMatch(/another Dyce account/);
  });
  it('reuses the code messages for email (the same limits and wrong-code copy as the phone)', () => {
    expect(authErrorMessage(new ApiError(400, 'otp_invalid', { attemptsRemaining: 2 }))).toBe(
      "That code isn't right. 2 tries left.",
    );
    expect(
      authErrorMessage(new ApiError(429, 'otp_resend_too_soon', { retryAfterSeconds: 12 })),
    ).toContain('12s');
  });
});
