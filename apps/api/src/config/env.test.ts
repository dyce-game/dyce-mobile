import { validateEnv } from './env.ts';

const base = {
  DATABASE_URL: 'postgres://u:p@localhost/db',
  JWT_SECRET: 'j'.repeat(40),
  PHONE_HASH_SALT: 's'.repeat(40),
};

describe('validateEnv', () => {
  it('applies safe defaults in development', () => {
    const env = validateEnv({ ...base });
    expect(env.PORT).toBe(3000);
    expect(env.JWT_ACCESS_TTL_SECONDS).toBe(900);
    expect(env.REFRESH_TTL_DAYS).toBe(30);
    expect(env.OTP_TTL_SECONDS).toBe(300);
    expect(env.SMS_DRIVER).toBe('console');
  });

  it('rejects weak or missing secrets', () => {
    expect(() => validateEnv({ ...base, JWT_SECRET: 'short' })).toThrow(/JWT_SECRET/);
    expect(() => validateEnv({ ...base, PHONE_HASH_SALT: 'short' })).toThrow(/PHONE_HASH_SALT/);
    expect(() => validateEnv({ ...base, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });

  it('treats blank values from a .env file as unset', () => {
    const env = validateEnv({ ...base, OTP_TEST_CODE: '', TERMII_API_KEY: '' });
    expect(env.OTP_TEST_CODE).toBeUndefined();
  });

  it('only accepts a 6-digit test OTP', () => {
    expect(validateEnv({ ...base, OTP_TEST_CODE: '123456' }).OTP_TEST_CODE).toBe('123456');
    expect(() => validateEnv({ ...base, OTP_TEST_CODE: '12345' })).toThrow(/OTP_TEST_CODE/);
  });

  describe('production safety', () => {
    const prod = {
      ...base,
      NODE_ENV: 'production',
      SMS_DRIVER: 'real',
      TERMII_API_KEY: 'k',
      TERMII_SENDER_ID: 'Dyce',
    };

    it('accepts a properly configured production env', () => {
      expect(validateEnv(prod).NODE_ENV).toBe('production');
    });
    it('refuses a test OTP code in production', () => {
      expect(() => validateEnv({ ...prod, OTP_TEST_CODE: '123456' })).toThrow(
        /OTP_TEST_CODE.*production/,
      );
    });
    it('refuses the console SMS driver in production', () => {
      expect(() => validateEnv({ ...prod, SMS_DRIVER: 'console' })).toThrow(/SMS_DRIVER/);
    });
  });

  describe('real SMS', () => {
    const real = { ...base, SMS_DRIVER: 'real' };
    it('needs at least one complete provider', () => {
      expect(() => validateEnv(real)).toThrow(/SMS_DRIVER/);
      expect(() => validateEnv({ ...real, TERMII_API_KEY: 'k' })).toThrow(/SMS_DRIVER/); // no sender id
      expect(() =>
        validateEnv({ ...real, TWILIO_ACCOUNT_SID: 'a', TWILIO_AUTH_TOKEN: 't' }),
      ).toThrow(/SMS_DRIVER/);
    });
    it('accepts Termii alone, Twilio alone, or both', () => {
      expect(validateEnv({ ...real, TERMII_API_KEY: 'k', TERMII_SENDER_ID: 'Dyce' })).toBeTruthy();
      expect(
        validateEnv({
          ...real,
          TWILIO_ACCOUNT_SID: 'a',
          TWILIO_AUTH_TOKEN: 't',
          TWILIO_MESSAGING_SERVICE_SID: 'm',
        }),
      ).toBeTruthy();
    });
  });
});
