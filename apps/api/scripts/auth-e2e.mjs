// End-to-end auth journey over real HTTP against the BUILT api and a throwaway embedded PostgreSQL.
// Run `pnpm -F @dyce/api build` first. Uses the dev console SMS driver and reads the OTP from the
// server's own log, exactly as a developer would.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import EmbeddedPostgres from 'embedded-postgres';
import { migrate } from '../db/migrator.ts';

const dataDir = await mkdtemp(join(tmpdir(), 'dyce-e2e-'));
const pgPort = 55600 + Math.floor(Math.random() * 300);
const apiPort = 56600 + Math.floor(Math.random() * 300);
const db = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: pgPort,
  persistent: false,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
  onError: () => {},
});

const baseEnv = (extra = {}) => ({
  ...process.env,
  NODE_ENV: 'test',
  PORT: String(apiPort),
  DATABASE_URL: `postgres://dyce_app:dyce_app@127.0.0.1:${pgPort}/dyce`,
  JWT_SECRET: 'j'.repeat(48),
  PHONE_HASH_SALT: 'p'.repeat(48),
  ...extra,
});

let api;
let logs = '';
let step = 'setup';
let failed = false;
const base = `http://127.0.0.1:${apiPort}`;

async function call(method, path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* not json */
  }
  return { status: res.status, json, headers: res.headers, text };
}

async function waitForCode(afterIndex) {
  for (let i = 0; i < 40; i++) {
    const m = /code is (\d{6})/.exec(logs.slice(afterIndex));
    if (m) return m[1];
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('OTP never appeared in the server log');
}

async function signIn(phone) {
  const mark = logs.length;
  const req = await call('POST', '/auth/otp/request', { body: { phone, country: 'NG' } });
  assert.equal(req.status, 202, `otp request: ${req.text}`);
  const code = await waitForCode(mark);
  return { code, req };
}

try {
  await db.initialise();
  await db.start();
  await db.createDatabase('dyce');
  const admin = new pg.Pool({
    connectionString: `postgres://postgres:postgres@127.0.0.1:${pgPort}/dyce`,
  });
  await migrate(admin);
  await admin.query(`CREATE ROLE dyce_app LOGIN PASSWORD 'dyce_app' IN ROLE dyce_api`);

  // ---- production safety: refuses to boot with a test OTP code ---------------------------------
  step = 'production refuses OTP_TEST_CODE';
  const unsafe = spawn(process.execPath, ['dist/main.js'], {
    env: baseEnv({
      NODE_ENV: 'production',
      SMS_DRIVER: 'real',
      TERMII_API_KEY: 'k',
      TERMII_SENDER_ID: 'Dyce',
      OTP_TEST_CODE: '123456',
    }),
    stdio: 'pipe',
  });
  let unsafeOut = '';
  unsafe.stderr.on('data', (d) => (unsafeOut += d));
  unsafe.stdout.on('data', (d) => (unsafeOut += d));
  const unsafeCode = await new Promise((resolve) => unsafe.on('exit', resolve));
  assert.notEqual(unsafeCode, 0, 'production booted with OTP_TEST_CODE set');
  assert.match(unsafeOut, /OTP_TEST_CODE/);

  // ---- boot normally ----------------------------------------------------------------------------
  api = spawn(process.execPath, ['dist/main.js'], { env: baseEnv(), stdio: 'pipe' });
  api.stdout.on('data', (d) => (logs += d));
  api.stderr.on('data', (d) => (logs += d));
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(`${base}/health`)).ok) break;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  // ---- OTP request validation --------------------------------------------------------------------
  step = 'otp validation';
  let r = await call('POST', '/auth/otp/request', { body: { phone: '123456', country: 'NG' } });
  assert.equal(r.status, 422);
  assert.equal(r.json.code, 'invalid_phone');
  r = await call('POST', '/auth/otp/request', { body: {} });
  assert.equal(r.status, 422);
  assert.equal(r.json.code, 'validation_failed');
  assert.ok(!r.text.includes('at '), 'error body leaked a stack trace');

  // ---- sign in -------------------------------------------------------------------------------------
  step = 'sign in';
  const PHONE_A = '0803 555 0100';
  const { code, req } = await signIn(PHONE_A);
  assert.deepEqual(req.json, { resendAfterSeconds: 30, expiresInSeconds: 300 });
  assert.match(logs, /\[sms:dev\] to \+234•+0100/, 'console driver should print a masked number');

  r = await call('POST', '/auth/otp/request', { body: { phone: PHONE_A, country: 'NG' } });
  assert.equal(r.status, 429);
  assert.equal(r.json.code, 'otp_resend_too_soon');
  assert.ok(Number(r.headers.get('retry-after')) > 0, 'missing Retry-After header');

  const wrong = code === '000000' ? '111111' : '000000';
  r = await call('POST', '/auth/otp/verify', {
    body: { phone: PHONE_A, country: 'NG', code: wrong },
  });
  assert.equal(r.status, 400);
  assert.equal(r.json.code, 'otp_invalid');
  assert.equal(r.json.attemptsRemaining, 4);

  r = await call('POST', '/auth/otp/verify', { body: { phone: PHONE_A, country: 'NG', code } });
  assert.equal(r.status, 200, r.text);
  const s1 = r.json;
  assert.equal(s1.isNewUser, true);
  assert.equal(s1.nextStep, 'username');
  assert.equal(s1.expiresIn, 900);
  assert.ok(s1.accessToken.split('.').length === 3 && s1.refreshToken.length >= 40);

  // ---- authenticated profile --------------------------------------------------------------------
  step = 'auth guard';
  r = await call('GET', '/me');
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'unauthorized');
  r = await call('GET', '/me', { token: s1.accessToken + 'x' });
  assert.equal(r.status, 401);
  r = await call('GET', '/me', { token: s1.accessToken });
  assert.equal(r.status, 200);
  assert.equal(r.json.profile, null);
  assert.equal(r.json.nextStep, 'username');

  step = 'username';
  r = await call('GET', '/profile/username/check?username=admin', { token: s1.accessToken });
  assert.equal(r.status, 422, 'reserved name should be refused');
  r = await call('GET', '/profile/username/check?username=a..b', { token: s1.accessToken });
  assert.equal(r.status, 422);
  r = await call('GET', '/profile/username/check?username=Ada.O', { token: s1.accessToken });
  assert.deepEqual(r.json, { available: true, suggestions: [] });

  r = await call('POST', '/profile', {
    token: s1.accessToken,
    body: { username: 'Ada.O', displayName: 'Ada' },
  });
  assert.equal(r.status, 201, r.text);
  assert.equal(r.json.profile.username, 'ada.o');
  assert.equal(r.json.nextStep, 'contacts');
  r = await call('POST', '/profile', { token: s1.accessToken, body: { username: 'another' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'profile_exists');

  // a second person cannot take the same name, and is offered alternatives
  step = 'second user';
  const PHONE_B = '0803 555 0222';
  const b = await signIn(PHONE_B);
  r = await call('POST', '/auth/otp/verify', {
    body: { phone: PHONE_B, country: 'NG', code: b.code },
  });
  const s2 = r.json;
  assert.notEqual(s2.userId, s1.userId);
  r = await call('GET', '/profile/username/check?username=ada.o', { token: s2.accessToken });
  assert.equal(r.json.available, false);
  assert.ok(r.json.suggestions.length > 0);
  r = await call('POST', '/profile', { token: s2.accessToken, body: { username: 'ADA.O' } });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'username_taken');
  assert.ok(Array.isArray(r.json.suggestions) && r.json.suggestions.length > 0);

  // ---- age gate + onboarding + welcome bonus -----------------------------------------------------
  step = 'age gate';
  r = await call('POST', '/profile/age-gate', { token: s1.accessToken, body: { birthYear: 1990 } });
  assert.deepEqual(r.json, { isAdult: true });
  r = await call('POST', '/profile/age-gate', { token: s1.accessToken, body: { birthYear: 1985 } });
  assert.equal(r.status, 409);
  assert.equal(r.json.code, 'age_already_set');

  step = 'onboarding';
  r = await call('POST', '/onboarding/steps/bogus', { token: s1.accessToken });
  assert.equal(r.status, 422);
  r = await call('POST', '/onboarding/steps/contacts', { token: s1.accessToken });
  assert.equal(r.json.nextStep, 'avatar');
  r = await call('POST', '/onboarding/steps/avatar', { token: s1.accessToken });
  assert.equal(r.json.nextStep, 'bonus');
  r = await call('POST', '/onboarding/welcome-bonus', { token: s1.accessToken });
  assert.deepEqual(r.json, { granted: true, balanceKobo: 20_000_000, nextStep: 'notifications' });
  r = await call('POST', '/onboarding/welcome-bonus', { token: s1.accessToken });
  assert.deepEqual(r.json, { granted: false, balanceKobo: 20_000_000, nextStep: 'notifications' });
  r = await call('POST', '/onboarding/steps/notifications', { token: s1.accessToken });
  assert.equal(r.json.nextStep, 'done');

  // a user who comes back later resumes exactly where they were
  step = 'resume';
  r = await call('GET', '/me', { token: s2.accessToken });
  assert.equal(r.json.nextStep, 'username');

  // ---- refresh rotation, reuse detection, logout ------------------------------------------------
  step = 'refresh';
  r = await call('POST', '/auth/refresh', { body: { refreshToken: s1.refreshToken } });
  assert.equal(r.status, 200, r.text);
  const rotated = r.json;
  assert.notEqual(rotated.refreshToken, s1.refreshToken);
  r = await call('GET', '/me', { token: rotated.accessToken });
  assert.equal(r.status, 200);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: s1.refreshToken } }); // replay of the old token
  assert.equal(r.status, 401);
  assert.equal(r.json.code, 'refresh_reused');
  r = await call('POST', '/auth/refresh', { body: { refreshToken: rotated.refreshToken } }); // family is dead now
  assert.equal(r.status, 401);

  step = 'logout';
  r = await call('POST', '/auth/otp/verify', {
    body: { phone: PHONE_B, country: 'NG', code: '000000' },
  });
  assert.ok(r.status === 400 || r.status === 429); // used code cannot be reused
  r = await call('POST', '/auth/logout', { body: { refreshToken: s2.refreshToken } });
  assert.equal(r.status, 204);
  r = await call('POST', '/auth/refresh', { body: { refreshToken: s2.refreshToken } });
  assert.equal(r.status, 401);

  // ---- per-IP rate limiting (last: it blocks this IP's OTP routes for a minute) ------------------
  step = 'throttling';
  let limited = null;
  for (let i = 0; i < 15 && !limited; i++) {
    const t = await call('POST', '/auth/otp/request', {
      body: { phone: `0803 777 ${String(1000 + i)}`, country: 'NG' },
    });
    if (t.status === 429 && t.json.code === 'rate_limited') limited = t;
  }
  assert.ok(limited, 'per-IP throttle never kicked in');

  // ---- privacy: the server log never contains a raw number --------------------------------------
  step = 'privacy';
  for (const raw of ['5550100', '5550222', '2348035550100', '2348035550222', '8035550100']) {
    assert.ok(!logs.includes(raw), `server log leaked part of a phone number: ${raw}`);
  }
  const all = await admin.query(`SELECT count(*)::int AS n FROM users`);
  assert.equal(all.rows[0].n >= 2, true);
  await admin.end();

  console.log('AUTH E2E OK');
} catch (err) {
  failed = true;
  console.error(`AUTH E2E FAILED at step "${step}":`, err.message);
  console.error('--- last server logs ---\n' + logs.slice(-1500));
} finally {
  api?.kill();
  await db.stop().catch(() => undefined);
  await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
}
process.exit(failed ? 1 : 0);
