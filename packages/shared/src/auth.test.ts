import { isNigerian, maskPhone, normalizePhone, regionOf } from './phone.ts';
import {
  isAdultByBirthYear,
  nextOnboardingStep,
  otpVerifySchema,
  usernameSchema,
  type OnboardingState,
} from './schemas/auth.ts';

describe('normalizePhone', () => {
  it.each([
    ['08031234567', 'NG', '+2348031234567'],
    ['0803 123 4567', 'NG', '+2348031234567'],
    ['+234 803 123 4567', undefined, '+2348031234567'],
    ['+44 7911 123456', undefined, '+447911123456'],
    ['(415) 555-2671', 'US', '+14155552671'],
  ])('%s (%s) -> %s', (input, country, expected) => {
    expect(normalizePhone(input, country)).toBe(expected);
  });

  it.each(['', '123', 'not a number', '+234 12', '0803123456789012345678901234567890'])(
    'rejects %j',
    (input) => {
      expect(normalizePhone(input, 'NG')).toBeNull();
    },
  );

  it('a national number without a country is rejected, not guessed', () => {
    expect(normalizePhone('08031234567')).toBeNull();
  });
});

describe('regionOf', () => {
  it('finds the country of an E.164 number', () => {
    expect(regionOf('+2348031234567')).toBe('NG');
    expect(regionOf('+447400123456')).toBe('GB'); // +44 7911 is Guernsey, not the UK
    expect(regionOf('+233201234567')).toBe('GH');
  });

  it("lets a Nigerian user's national-format contacts be read correctly on a phone set to another region", () => {
    // the bug this prevents: reading "0803 ..." with the device region (US) drops the contact
    expect(normalizePhone('0803 555 0777', 'US')).toBeNull();
    expect(normalizePhone('0803 555 0777', regionOf('+2348035550142'))).toBe('+2348035550777');
  });
});

describe('maskPhone / isNigerian', () => {
  it('never reveals more than the last 4 digits', () => {
    const masked = maskPhone('+2348031234567');
    expect(masked).toBe('+234••••••4567');
    expect(masked).not.toContain('803');
    expect(masked.endsWith('4567')).toBe(true);
  });
  it('routes +234 to the Nigerian provider', () => {
    expect(isNigerian('+2348031234567')).toBe(true);
    expect(isNigerian('+447911123456')).toBe(false);
  });
});

describe('usernameSchema', () => {
  it('accepts valid names and lowercases them', () => {
    expect(usernameSchema.parse('Ada_99')).toBe('ada_99');
    expect(usernameSchema.parse('  tunde.k  ')).toBe('tunde.k');
    expect(usernameSchema.parse('a_b')).toBe('a_b');
    expect(usernameSchema.parse('a'.repeat(20))).toHaveLength(20);
  });
  it.each(['ab', 'a'.repeat(21), '.ada', 'ada.', 'a..da', 'ada!', 'ad a', 'ada-ada', 'ÀdÀ'])(
    'rejects %j',
    (name) => {
      expect(usernameSchema.safeParse(name).success).toBe(false);
    },
  );
  it.each(['dyce', 'Admin', 'SUPPORT', 'official'])('blocks reserved name %j', (name) => {
    expect(usernameSchema.safeParse(name).success).toBe(false);
  });
});

describe('otpVerifySchema', () => {
  it('needs exactly six digits', () => {
    const ok = otpVerifySchema.safeParse({ phone: '0803 123 4567', country: 'ng', code: '123456' });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.country).toBe('NG');
    for (const code of ['12345', '1234567', 'abcdef', '12 456', '']) {
      expect(otpVerifySchema.safeParse({ phone: '08031234567', code }).success).toBe(false);
    }
  });
});

describe('age rule (ADR-007)', () => {
  it('treats 19+ by birth year as adult, 18 and under as not', () => {
    expect(isAdultByBirthYear(2007, 2026)).toBe(true); // 19
    expect(isAdultByBirthYear(2008, 2026)).toBe(false); // 17 or 18: ambiguous, so no
    expect(isAdultByBirthYear(2015, 2026)).toBe(false);
  });
});

describe('nextOnboardingStep', () => {
  const base: OnboardingState = {
    hasProfile: false,
    contacts: false,
    avatar: false,
    bonusGranted: false,
    notifications: false,
  };
  it('walks the spec order', () => {
    expect(nextOnboardingStep(base)).toBe('username');
    expect(nextOnboardingStep({ ...base, hasProfile: true })).toBe('contacts');
    expect(nextOnboardingStep({ ...base, hasProfile: true, contacts: true })).toBe('avatar');
    expect(nextOnboardingStep({ ...base, hasProfile: true, contacts: true, avatar: true })).toBe(
      'bonus',
    );
    expect(
      nextOnboardingStep({
        hasProfile: true,
        contacts: true,
        avatar: true,
        bonusGranted: true,
        notifications: false,
      }),
    ).toBe('notifications');
    expect(
      nextOnboardingStep({
        hasProfile: true,
        contacts: true,
        avatar: true,
        bonusGranted: true,
        notifications: true,
      }),
    ).toBe('done');
  });
  it('resumes at the earliest unfinished step even if later ones are done', () => {
    expect(
      nextOnboardingStep({ ...base, hasProfile: true, avatar: true, notifications: true }),
    ).toBe('contacts');
  });
});
