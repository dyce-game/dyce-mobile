import { SignJWT } from 'jose';
import { generateOtp, hashOtp, hashPhone, newRefreshToken, safeEqual, sha256 } from './crypto.ts';
import { TokenService } from './tokens.ts';

const SECRET = 'k'.repeat(40);

describe('hashing', () => {
  it('phone hashes are deterministic, keyed, and never contain the number', () => {
    const a = hashPhone(SECRET, '+2348031234567');
    expect(safeEqual(a, hashPhone(SECRET, '+2348031234567'))).toBe(true);
    expect(safeEqual(a, hashPhone('z'.repeat(40), '+2348031234567'))).toBe(false);
    expect(safeEqual(a, hashPhone(SECRET, '+2348031234568'))).toBe(false);
    expect(a.toString('hex')).not.toContain('8031234567');
    expect(a).toHaveLength(32);
  });

  it('OTP hashes are bound to the challenge and domain-separated from phone hashes', () => {
    const h = hashOtp(SECRET, 'challenge-1', '123456');
    expect(safeEqual(h, hashOtp(SECRET, 'challenge-1', '123456'))).toBe(true);
    expect(safeEqual(h, hashOtp(SECRET, 'challenge-2', '123456'))).toBe(false);
    expect(safeEqual(h, hashOtp(SECRET, 'challenge-1', '123457'))).toBe(false);
    expect(safeEqual(hashPhone(SECRET, 'otp:challenge-1:123456'), h)).toBe(false);
  });

  it('safeEqual handles different lengths without throwing', () => {
    expect(safeEqual(Buffer.from('ab'), Buffer.from('abc'))).toBe(false);
  });

  it('OTP codes are always 6 digits and well spread', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateOtp();
      expect(code).toMatch(/^\d{6}$/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(1900); // no obvious repetition
  });

  it('refresh tokens are long, unique and hash to 32 bytes', () => {
    const a = newRefreshToken();
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(a).not.toBe(newRefreshToken());
    expect(sha256(a)).toHaveLength(32);
  });
});

describe('TokenService', () => {
  const claims = { userId: 'user-1', familyId: 'family-1' };
  let now = new Date('2026-11-14T12:00:00Z');
  const clock = () => now;
  const make = (secret = SECRET) => new TokenService(secret, { accessTtlSeconds: 900 }, clock);

  beforeEach(() => {
    now = new Date('2026-11-14T12:00:00Z');
  });

  it('round-trips claims', async () => {
    const svc = make();
    expect(await svc.verifyAccess(await svc.signAccess(claims))).toEqual(claims);
  });

  it('expires after the TTL', async () => {
    const svc = make();
    const token = await svc.signAccess(claims);
    now = new Date(now.getTime() + 899_000);
    await expect(svc.verifyAccess(token)).resolves.toEqual(claims);
    now = new Date(now.getTime() + 2_000);
    await expect(svc.verifyAccess(token)).rejects.toMatchObject({ code: 'unauthorized' });
  });

  it('rejects tokens signed with another secret, tampered tokens and garbage', async () => {
    const token = await make().signAccess(claims);
    await expect(make('x'.repeat(40)).verifyAccess(token)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    const [h, p, s] = token.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ sub: 'attacker', sid: 'f' })).toString(
      'base64url',
    );
    await expect(make().verifyAccess(`${h}.${tamperedPayload}.${s}`)).rejects.toMatchObject({
      code: 'unauthorized',
    });
    await expect(make().verifyAccess('not-a-jwt')).rejects.toMatchObject({ code: 'unauthorized' });
    expect(p).toBeTruthy();
  });

  it('rejects an unsigned "alg: none" token', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({ sub: 'user-1', sid: 'f', iss: 'dyce-api', aud: 'dyce', exp: 9_999_999_999 }),
    ).toString('base64url');
    await expect(make().verifyAccess(`${header}.${payload}.`)).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('rejects a token for another audience or issuer', async () => {
    const key = new TextEncoder().encode(SECRET);
    const wrongAud = await new SignJWT({ sid: 'f' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('u')
      .setIssuer('dyce-api')
      .setAudience('someone-else')
      .setExpirationTime('1h')
      .sign(key);
    await expect(
      new TokenService(SECRET, { accessTtlSeconds: 900 }).verifyAccess(wrongAud),
    ).rejects.toMatchObject({
      code: 'unauthorized',
    });
  });

  it('refuses a weak secret', () => {
    expect(() => new TokenService('short', { accessTtlSeconds: 900 })).toThrow(/32/);
  });
});
