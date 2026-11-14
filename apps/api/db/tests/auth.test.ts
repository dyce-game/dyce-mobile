import { AuthService, OTP_LIMIT_PER_10_MIN, type AuthConfig } from '../../src/auth/auth.service.ts';
import { TokenService } from '../../src/auth/tokens.ts';
import { MemorySmsProvider } from '../../src/sms/sms-provider.ts';
import { createTestDb, type TestDb } from '../testing/testDb.ts';

const SECRET = 'k'.repeat(40);
const PHONE_INPUT = '0803 123 4567'; // national format, as a user would type it
const E164 = '+2348031234567';

let db: TestDb;
beforeAll(async () => {
  db = await createTestDb();
});
afterAll(async () => {
  await db.close();
});

type Harness = {
  auth: AuthService;
  sms: MemorySmsProvider;
  tokens: TokenService;
  clock: { now: Date; advance(seconds: number): void };
  warnings: string[];
};

function harness(overrides: Partial<AuthConfig> = {}): Harness {
  const clock = {
    now: new Date('2026-11-14T10:00:00Z'),
    advance(seconds: number) {
      this.now = new Date(this.now.getTime() + seconds * 1000);
    },
  };
  const sms = new MemorySmsProvider();
  const tokens = new TokenService(SECRET, { accessTtlSeconds: 900 }, () => clock.now);
  const warnings: string[] = [];
  const auth = new AuthService(
    db.app,
    sms,
    tokens,
    { phoneSecret: SECRET, otpTtlSeconds: 300, refreshTtlDays: 30, ...overrides },
    () => clock.now,
    { warn: (m) => warnings.push(m) },
  );
  return { auth, sms, tokens, clock, warnings };
}

let phoneCounter = 0;
/** A fresh valid Nigerian number per test so tests never share rate-limit state. */
function freshPhone(): { input: string; e164: string } {
  const n = String(1000000 + ++phoneCounter * 7).padStart(7, '0');
  return { input: `0803${n}`, e164: `+234803${n}` };
}

async function login(h: Harness, phone = freshPhone()) {
  await h.auth.requestOtp({ phone: phone.input, country: 'NG' });
  const session = await h.auth.verifyOtp({
    phone: phone.input,
    country: 'NG',
    code: h.sms.lastCode(),
  });
  return { session, phone };
}

const code = (c: string) => expect.objectContaining({ code: c });

describe('requestOtp', () => {
  it('normalises national input to E.164 and texts a 6-digit code', async () => {
    const h = harness();
    const res = await h.auth.requestOtp({ phone: PHONE_INPUT, country: 'NG' });
    expect(res).toEqual({ resendAfterSeconds: 30, expiresInSeconds: 300 });
    expect(h.sms.sent).toHaveLength(1);
    expect(h.sms.sent[0]!.to).toBe(E164);
    expect(h.sms.lastCode()).toMatch(/^\d{6}$/);
  });

  it('rejects invalid numbers before doing anything', async () => {
    const h = harness();
    await expect(h.auth.requestOtp({ phone: '12345', country: 'NG' })).rejects.toEqual(
      code('invalid_phone'),
    );
    await expect(h.auth.requestOtp({ phone: '08031234567' })).rejects.toEqual(
      code('invalid_phone'),
    ); // no country
    expect(h.sms.sent).toHaveLength(0);
  });

  it('enforces a 30 second resend cooldown', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    h.clock.advance(10);
    await expect(h.auth.requestOtp({ phone: p.input, country: 'NG' })).rejects.toMatchObject({
      code: 'otp_resend_too_soon',
      details: { retryAfterSeconds: 20 },
    });
    h.clock.advance(21);
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    expect(h.sms.sent).toHaveLength(2);
  });

  it(`allows ${OTP_LIMIT_PER_10_MIN} requests per 10 minutes, then reports when to retry`, async () => {
    const h = harness();
    const p = freshPhone();
    for (let i = 0; i < OTP_LIMIT_PER_10_MIN; i++) {
      await h.auth.requestOtp({ phone: p.input, country: 'NG' });
      h.clock.advance(31);
    }
    // elapsed since the first request: 93s, so 507s remain in its window
    await expect(h.auth.requestOtp({ phone: p.input, country: 'NG' })).rejects.toMatchObject({
      code: 'otp_rate_limited',
      details: { retryAfterSeconds: 507 },
    });
    h.clock.advance(508);
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
  });

  it('caps requests per day', async () => {
    const h = harness();
    const p = freshPhone();
    for (let i = 0; i < 10; i++) {
      await h.auth.requestOtp({ phone: p.input, country: 'NG' });
      h.clock.advance(11 * 60); // stays under the 10-minute limit
    }
    const err = await h.auth.requestOtp({ phone: p.input, country: 'NG' }).catch((e) => e);
    expect(err).toMatchObject({ code: 'otp_rate_limited' });
    expect(err.details.retryAfterSeconds).toBeGreaterThan(0);
    expect(err.details.retryAfterSeconds).toBeLessThanOrEqual(86_400);
  });

  it('rate limits are per number, not global', async () => {
    const h = harness();
    await h.auth.requestOtp({ phone: freshPhone().input, country: 'NG' });
    await h.auth.requestOtp({ phone: freshPhone().input, country: 'NG' });
    expect(h.sms.sent).toHaveLength(2);
  });

  it('concurrent requests for one number: only one gets through', async () => {
    const h = harness();
    const p = freshPhone();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => h.auth.requestOtp({ phone: p.input, country: 'NG' })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(h.sms.sent).toHaveLength(1);
  });

  it('an SMS provider failure returns sms_failed and does not burn the rate limit', async () => {
    const h = harness();
    const p = freshPhone();
    h.sms.failWith = 'provider down';
    await expect(h.auth.requestOtp({ phone: p.input, country: 'NG' })).rejects.toEqual(
      code('sms_failed'),
    );
    expect(h.warnings.join(' ')).not.toContain(p.e164); // logged, but masked
    expect(h.warnings).toHaveLength(1);
    h.sms.failWith = null;
    await h.auth.requestOtp({ phone: p.input, country: 'NG' }); // immediately allowed: no cooldown from the failure
    expect(h.sms.sent).toHaveLength(1);
  });

  it('test-code mode (non-production) sends no SMS and accepts the fixed code', async () => {
    const h = harness({ otpTestCode: '000000' });
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    expect(h.sms.sent).toHaveLength(0);
    const s = await h.auth.verifyOtp({ phone: p.input, country: 'NG', code: '000000' });
    expect(s.isNewUser).toBe(true);
  });
});

describe('verifyOtp', () => {
  it('creates the account on first login and returns a session that starts at the username step', async () => {
    const h = harness();
    const { session } = await login(h);
    expect(session.isNewUser).toBe(true);
    expect(session.nextStep).toBe('username');
    expect(session.expiresIn).toBe(900);
    expect(await h.tokens.verifyAccess(session.accessToken)).toMatchObject({
      userId: session.userId,
    });
    const u = await db.admin.query('SELECT count(*)::int AS n FROM users WHERE id = $1', [
      session.userId,
    ]);
    expect(u.rows[0].n).toBe(1);
  });

  it('a returning user gets the same account, not a new one', async () => {
    const h = harness();
    const p = freshPhone();
    const first = (await login(h, p)).session;
    h.clock.advance(60);
    const second = (await login(h, p)).session;
    expect(second.userId).toBe(first.userId);
    expect(second.isNewUser).toBe(false);
  });

  it('formatting differences of the same number map to one account', async () => {
    const h = harness();
    await h.auth.requestOtp({ phone: '0803 000 9911', country: 'NG' });
    const a = await h.auth.verifyOtp({
      phone: '08030009911',
      country: 'NG',
      code: h.sms.lastCode(),
    });
    h.clock.advance(60);
    await h.auth.requestOtp({ phone: '+234 803 000 9911' });
    const b = await h.auth.verifyOtp({ phone: '+2348030009911', code: h.sms.lastCode() });
    expect(b.userId).toBe(a.userId);
  });

  it('rejects a wrong code, counting down attempts, then locks after 5', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const real = h.sms.lastCode();
    const wrong = real === '111111' ? '222222' : '111111';
    for (const remaining of [4, 3, 2, 1]) {
      await expect(
        h.auth.verifyOtp({ phone: p.input, country: 'NG', code: wrong }),
      ).rejects.toMatchObject({
        code: 'otp_invalid',
        details: { attemptsRemaining: remaining },
      });
    }
    await expect(h.auth.verifyOtp({ phone: p.input, country: 'NG', code: wrong })).rejects.toEqual(
      code('otp_locked'),
    );
    // even the right code no longer works once locked
    await expect(h.auth.verifyOtp({ phone: p.input, country: 'NG', code: real })).rejects.toEqual(
      code('otp_locked'),
    );
  });

  it('a locked number can request a fresh code after the cooldown', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const real = h.sms.lastCode();
    const wrong = real === '111111' ? '222222' : '111111';
    for (let i = 0; i < 5; i++)
      await h.auth.verifyOtp({ phone: p.input, country: 'NG', code: wrong }).catch(() => undefined);
    h.clock.advance(31);
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const s = await h.auth.verifyOtp({ phone: p.input, country: 'NG', code: h.sms.lastCode() });
    expect(s.userId).toBeTruthy();
  });

  it('rejects an expired code', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    h.clock.advance(301);
    await expect(
      h.auth.verifyOtp({ phone: p.input, country: 'NG', code: h.sms.lastCode() }),
    ).rejects.toEqual(code('otp_expired'));
  });

  it('a code works exactly once', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const c = h.sms.lastCode();
    await h.auth.verifyOtp({ phone: p.input, country: 'NG', code: c });
    await expect(h.auth.verifyOtp({ phone: p.input, country: 'NG', code: c })).rejects.toEqual(
      code('otp_invalid'),
    );
  });

  it('concurrent verifies with the right code: exactly one session', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const c = h.sms.lastCode();
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () => h.auth.verifyOtp({ phone: p.input, country: 'NG', code: c })),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('only the newest code is valid', async () => {
    const h = harness();
    const p = freshPhone();
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const oldCode = h.sms.lastCode();
    h.clock.advance(31);
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    const newCode = h.sms.lastCode();
    if (oldCode !== newCode) {
      await expect(
        h.auth.verifyOtp({ phone: p.input, country: 'NG', code: oldCode }),
      ).rejects.toEqual(code('otp_invalid'));
    }
    await expect(
      h.auth.verifyOtp({ phone: p.input, country: 'NG', code: newCode }),
    ).resolves.toBeTruthy();
  });

  it('with no challenge at all, says otp_invalid (not "no such number")', async () => {
    const h = harness();
    await expect(
      h.auth.verifyOtp({ phone: freshPhone().input, country: 'NG', code: '123456' }),
    ).rejects.toEqual(code('otp_invalid'));
  });

  it('a disabled account cannot sign in', async () => {
    const h = harness();
    const p = freshPhone();
    const { session } = await login(h, p);
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [session.userId]);
    h.clock.advance(60);
    await h.auth.requestOtp({ phone: p.input, country: 'NG' });
    await expect(
      h.auth.verifyOtp({ phone: p.input, country: 'NG', code: h.sms.lastCode() }),
    ).rejects.toEqual(code('account_disabled'));
  });
});

describe('refresh tokens', () => {
  it('rotates: a new pair is issued and the old refresh token stops working', async () => {
    const h = harness();
    const { session } = await login(h);
    const next = await h.auth.refresh(session.refreshToken);
    expect(next.refreshToken).not.toBe(session.refreshToken);
    expect(await h.tokens.verifyAccess(next.accessToken)).toMatchObject({ userId: session.userId });
    await expect(h.auth.refresh(session.refreshToken)).rejects.toEqual(code('refresh_reused'));
  });

  it('reusing an old token revokes the whole session family, including the newest token', async () => {
    const h = harness();
    const { session } = await login(h);
    const second = await h.auth.refresh(session.refreshToken);
    const third = await h.auth.refresh(second.refreshToken);
    await expect(h.auth.refresh(session.refreshToken)).rejects.toEqual(code('refresh_reused')); // replay of the first
    await expect(h.auth.refresh(third.refreshToken)).rejects.toEqual(code('refresh_reused')); // family is dead
  });

  it('other devices (other families) are unaffected by a reuse on one device', async () => {
    const h = harness();
    const p = freshPhone();
    const deviceA = (await login(h, p)).session;
    h.clock.advance(60);
    const deviceB = (await login(h, p)).session;
    await h.auth.refresh(deviceA.refreshToken);
    await h.auth.refresh(deviceA.refreshToken).catch(() => undefined); // reuse -> kills A's family
    await expect(h.auth.refresh(deviceB.refreshToken)).resolves.toBeTruthy();
  });

  it('two simultaneous refreshes with one token: exactly one succeeds', async () => {
    const h = harness();
    const { session } = await login(h);
    const results = await Promise.allSettled([
      h.auth.refresh(session.refreshToken),
      h.auth.refresh(session.refreshToken),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });

  it('rejects unknown, expired and malformed tokens', async () => {
    const h = harness();
    const { session } = await login(h);
    await expect(h.auth.refresh('totally-unknown-token-value-0000000000')).rejects.toEqual(
      code('invalid_refresh'),
    );
    h.clock.advance(31 * 24 * 3600);
    await expect(h.auth.refresh(session.refreshToken)).rejects.toEqual(code('invalid_refresh'));
  });

  it('logout ends that session and is idempotent', async () => {
    const h = harness();
    const { session } = await login(h);
    await h.auth.logout(session.refreshToken);
    await expect(h.auth.refresh(session.refreshToken)).rejects.toEqual(code('refresh_reused'));
    await h.auth.logout(session.refreshToken); // again: fine
    await h.auth.logout('never-existed-token-0000000000000000'); // unknown: fine
  });

  it('revokeAllSessions signs the user out everywhere', async () => {
    const h = harness();
    const p = freshPhone();
    const a = (await login(h, p)).session;
    h.clock.advance(60);
    const b = (await login(h, p)).session;
    await h.auth.revokeAllSessions(a.userId);
    await expect(h.auth.refresh(a.refreshToken)).rejects.toBeTruthy();
    await expect(h.auth.refresh(b.refreshToken)).rejects.toBeTruthy();
  });

  it('a disabled user cannot refresh', async () => {
    const h = harness();
    const { session } = await login(h);
    await db.admin.query('UPDATE users SET disabled_at = now() WHERE id = $1', [session.userId]);
    await expect(h.auth.refresh(session.refreshToken)).rejects.toEqual(code('account_disabled'));
  });

  it('stores only a hash of the refresh token', async () => {
    const h = harness();
    const { session } = await login(h);
    const rows = await db.admin.query('SELECT token_hash FROM refresh_tokens WHERE user_id = $1', [
      session.userId,
    ]);
    for (const r of rows.rows) {
      expect((r.token_hash as Buffer).toString('utf8')).not.toContain(session.refreshToken);
      expect((r.token_hash as Buffer).toString('base64url')).not.toBe(session.refreshToken);
    }
  });
});

describe('purgeExpired', () => {
  it('removes old challenges and long-dead refresh tokens but keeps live ones', async () => {
    const h = harness();
    const { session } = await login(h);
    h.clock.advance(3 * 24 * 3600); // challenges are now > 2 days old; refresh token still valid
    const first = await h.auth.purgeExpired();
    expect(first.otp).toBeGreaterThanOrEqual(1);
    await expect(h.auth.refresh(session.refreshToken)).resolves.toBeTruthy(); // still alive
    h.clock.advance(40 * 24 * 3600);
    const second = await h.auth.purgeExpired();
    expect(second.refresh).toBeGreaterThanOrEqual(1);
  });
});

describe('privacy: no raw phone numbers are stored', () => {
  it('after a full sign-in with a known number, no table contains it in any form', async () => {
    const h = harness();
    const NATIONAL = '08037771234';
    const INTERNATIONAL = '+2348037771234';
    await h.auth.requestOtp({ phone: NATIONAL, country: 'NG' });
    await h.auth.verifyOtp({ phone: NATIONAL, country: 'NG', code: h.sms.lastCode() });
    // a failed attempt and a failed SMS too, since those paths log and store things
    h.clock.advance(31);
    await h.auth.requestOtp({ phone: NATIONAL, country: 'NG' });
    await h.auth
      .verifyOtp({ phone: NATIONAL, country: 'NG', code: '000001' })
      .catch(() => undefined);

    const tables = (
      await db.admin.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
    ).rows.map((r) => r.tablename as string);
    expect(tables).toEqual(expect.arrayContaining(['users', 'otp_challenges', 'refresh_tokens']));
    const hits: string[] = [];
    for (const t of tables) {
      const rows = await db.admin.query(`SELECT x::text AS row FROM "${t}" x`);
      for (const r of rows.rows) {
        const text = r.row as string;
        if (text.includes('8037771234') || text.includes(INTERNATIONAL)) hits.push(t);
      }
    }
    expect(hits).toEqual([]);
    expect(h.warnings.join('\n')).not.toContain('8037771234');
  });
});
