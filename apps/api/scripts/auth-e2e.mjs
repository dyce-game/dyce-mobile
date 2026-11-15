// End-to-end auth journey over real HTTP against the BUILT api and a throwaway embedded PostgreSQL.
// Run `pnpm -F @dyce/api build` first. Uses the dev console SMS driver and reads the OTP from the
// server's own log, exactly as a developer would.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pg from 'pg';
import { WebSocket } from 'ws';
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Opens /realtime, authenticates with the first frame, and collects every frame the server sends. */
async function connectWs(token, { expectClose = false } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${apiPort}/realtime`);
  const out = { ws, frames: [], closeCode: null };
  ws.on('message', (d) => out.frames.push(JSON.parse(d.toString())));
  const closed = new Promise((resolve) =>
    ws.on('close', (code) => {
      out.closeCode = code;
      resolve();
    }),
  );
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  ws.send(JSON.stringify({ type: 'auth', token }));
  out.next = async (n) => {
    for (let i = 0; i < 100 && out.frames.length < n; i++) await sleep(20);
    return out.frames;
  };
  if (expectClose) await closed;
  else assert.deepEqual((await out.next(1))[0], { type: 'ready' }, 'socket did not become ready');
  return out;
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

  // ---- contacts matching + friend requests ----------------------------------------------------
  step = 'contacts';
  const PHONE_C = '0803 555 0333';
  const c = await signIn(PHONE_C);
  r = await call('POST', '/auth/otp/verify', {
    body: { phone: PHONE_C, country: 'NG', code: c.code },
  });
  const s3 = r.json;
  r = await call('POST', '/profile', {
    token: s3.accessToken,
    body: { username: 'tunde.c', displayName: 'Tunde' },
  });
  assert.equal(r.status, 201, r.text);

  r = await call('POST', '/contacts/match', { body: { numbers: ['+2348035550333'] } });
  assert.equal(r.status, 401, 'matching requires a signed-in user');

  // A's address book: a stranger, C (has a profile) and B (verified but no profile yet)
  r = await call('POST', '/contacts/match', {
    token: s1.accessToken,
    body: { numbers: ['+2348035559999', '+2348035550333', '+2348035550222'] },
  });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(
    r.json.matches.map((m) => [m.index, m.user.username, m.user.relationship]),
    [[1, 'tunde.c', 'none']],
  );
  assert.ok(!r.text.includes('5550333'), 'match response must not echo numbers');

  r = await call('POST', '/contacts/match', {
    token: s1.accessToken,
    body: { numbers: ['08035559999'] },
  });
  assert.equal(r.status, 422);
  assert.ok(!r.text.includes('8035559999'), 'validation error echoed a phone number');
  r = await call('POST', '/contacts/match', {
    token: s1.accessToken,
    body: { numbers: Array.from({ length: 501 }, (_, i) => `+23480999${String(10000 + i)}`) },
  });
  assert.equal(r.status, 422, 'more than 500 numbers per batch is refused');

  r = await call('POST', '/friends/requests', {
    token: s1.accessToken,
    body: { userId: s3.userId },
  });
  assert.deepEqual(r.json, { relationship: 'pending_out' });
  r = await call('POST', '/friends/requests', {
    token: s1.accessToken,
    body: { userId: s1.userId },
  });
  assert.equal(r.json.code, 'cannot_add_self');
  r = await call('POST', '/friends/requests', {
    token: s1.accessToken,
    body: { userId: 'not-a-uuid' },
  });
  assert.equal(r.status, 422);
  r = await call('POST', '/friends/requests', {
    token: s1.accessToken,
    body: { userId: '00000000-0000-4000-8000-000000000000' },
  });
  assert.equal(r.status, 404);

  r = await call('GET', '/contacts/suggestions', { token: s1.accessToken });
  assert.deepEqual(
    r.json.suggestions.map((u) => [u.username, u.relationship]),
    [['tunde.c', 'pending_out']],
  );

  r = await call('GET', '/users/by-username/Tunde.C', { token: s1.accessToken });
  assert.equal(r.status, 200);
  assert.equal(r.json.username, 'tunde.c');
  assert.equal(r.json.relationship, 'pending_out');
  r = await call('GET', '/users/by-username/nobody.here', { token: s1.accessToken });
  assert.equal(r.status, 404);
  assert.equal(r.json.code, 'user_not_found');

  r = await call('POST', '/friends/requests', {
    token: s3.accessToken,
    body: { userId: s1.userId },
  }); // C says yes
  assert.deepEqual(r.json, { relationship: 'friends' });
  r = await call('GET', '/contacts/suggestions', { token: s1.accessToken });
  assert.deepEqual(r.json.suggestions, [], 'friends are no longer suggestions');

  // ---- friends list, ignore, remove ------------------------------------------------------------
  step = 'friends list';
  r = await call('GET', '/friends');
  assert.equal(r.status, 401);
  r = await call('GET', '/friends', { token: s1.accessToken });
  assert.deepEqual(
    r.json.friends.map((f) => f.username),
    ['tunde.c'],
  );
  assert.deepEqual(Object.keys(r.json.friends[0]).sort(), [
    'displayName',
    'id',
    'since',
    'username',
  ]);
  r = await call('GET', '/friends/requests', { token: s1.accessToken });
  assert.deepEqual(r.json, { incoming: [], outgoing: [] });

  r = await call('DELETE', `/friends/${s3.userId}`, { token: s1.accessToken }); // A removes C
  assert.equal(r.status, 204);
  r = await call('GET', '/friends', { token: s3.accessToken });
  assert.deepEqual(r.json.friends, []);
  r = await call('DELETE', `/friends/${s3.userId}`, { token: s1.accessToken }); // again: fine
  assert.equal(r.status, 204);
  r = await call('DELETE', '/friends/not-a-uuid', { token: s1.accessToken });
  assert.equal(r.status, 422);

  step = 'ignore';
  r = await call('POST', '/friends/requests', {
    token: s1.accessToken,
    body: { userId: s3.userId },
  });
  assert.deepEqual(r.json, { relationship: 'pending_out' });
  r = await call('GET', '/friends/requests', { token: s3.accessToken });
  assert.deepEqual(
    r.json.incoming.map((i) => [i.user.username, i.mutualFriends]),
    [['ada.o', 0]],
  );
  r = await call('POST', `/friends/requests/${s1.userId}/decline`, { token: s3.accessToken }); // C: Ignore
  assert.deepEqual(r.json, { relationship: 'none' });
  r = await call('GET', '/friends/requests', { token: s3.accessToken });
  assert.deepEqual(r.json.incoming, [], 'an ignored request leaves the recipient list');
  r = await call('GET', '/friends/requests', { token: s1.accessToken });
  assert.deepEqual(
    r.json.outgoing.map((o) => [o.user.username, o.user.relationship]),
    [['tunde.c', 'pending_out']],
    'the sender is not told the request was ignored',
  );
  r = await call('POST', '/friends/requests', {
    token: s1.accessToken,
    body: { userId: s3.userId },
  });
  assert.deepEqual(r.json, { relationship: 'pending_out' }, 'cannot ask again after being ignored');

  r = await call('POST', `/friends/requests/${s3.userId}/accept`, { token: s1.accessToken });
  assert.equal(r.status, 404, "you can't accept your own outgoing request");
  assert.equal(r.json.code, 'friend_request_not_found');
  r = await call('POST', `/friends/requests/${s1.userId}/accept`, { token: s3.accessToken }); // C changes their mind
  assert.deepEqual(r.json, { relationship: 'friends' });
  r = await call('GET', '/friends', { token: s3.accessToken });
  assert.deepEqual(
    r.json.friends.map((f) => f.username),
    ['ada.o'],
  );

  r = await call('DELETE', `/friends/requests/${s3.userId}`, { token: s1.accessToken }); // cancel nothing: fine
  assert.equal(r.status, 204);
  r = await call('GET', '/friends', { token: s1.accessToken });
  assert.equal(r.json.friends.length, 1, 'cancelling a request never removes a friendship');

  r = await call('DELETE', '/contacts', { token: s1.accessToken });
  assert.equal(r.status, 204);

  // ---- messaging: conversations, requests and live delivery over a real WebSocket ----------------
  step = 'messaging';
  r = await call('POST', '/profile', {
    token: s2.accessToken,
    body: { username: 'bisi.m', displayName: 'Bisi' },
  });
  assert.ok(r.status < 300, `profile for second user: ${r.text}`);
  // s1 (ada.o) and s3 (tunde.c) are friends; s2 (bisi.m) is a stranger to both.
  r = await call('GET', '/conversations');
  assert.equal(r.status, 401);
  r = await call('POST', '/conversations/direct', {
    token: s1.accessToken,
    body: { userId: s3.userId },
  });
  assert.equal(r.status, 200, r.text);
  const conv = r.json;
  assert.equal(conv.state, 'active');
  assert.equal(conv.peer.username, 'tunde.c');
  assert.equal(conv.lastMessage, null);
  r = await call('GET', '/conversations', { token: s1.accessToken });
  assert.deepEqual(r.json.conversations, [], 'an empty conversation is not listed');

  const live1 = await connectWs(s1.accessToken);
  const live3 = await connectWs(s3.accessToken);

  const msgId = randomUUID();
  r = await call('POST', `/conversations/${conv.id}/messages`, {
    token: s1.accessToken,
    body: { id: msgId, body: '  ready to lose at Whot?  ' },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.body, 'ready to lose at Whot?', 'bodies are trimmed');
  const sent = r.json;
  assert.deepEqual((await live3.next(2))[1], { type: 'message', message: sent });
  assert.deepEqual(
    (await live1.next(2))[1],
    { type: 'message', message: sent },
    'sender other devices',
  );

  r = await call('POST', `/conversations/${conv.id}/messages`, {
    token: s1.accessToken,
    body: { id: msgId, body: 'ready to lose at Whot?' },
  });
  assert.deepEqual(r.json, sent, 'retrying a send returns the same message');
  await sleep(200);
  assert.equal(live3.frames.length, 2, 'a retry was delivered twice');

  r = await call('POST', `/conversations/${conv.id}/messages`, {
    token: s1.accessToken,
    body: { id: 'nope', body: 'x' },
  });
  assert.equal(r.status, 422);
  r = await call('POST', `/conversations/${conv.id}/messages`, {
    token: s1.accessToken,
    body: { id: randomUUID(), body: '   ' },
  });
  assert.equal(r.status, 422, 'blank messages are refused');

  r = await call('GET', '/conversations', { token: s3.accessToken });
  assert.equal(r.json.conversations[0].unread, 1);
  assert.equal(r.json.unreadTotal, 1);
  assert.equal(r.json.conversations[0].lastMessage.body, 'ready to lose at Whot?');

  live3.ws.send(JSON.stringify({ type: 'typing', conversationId: conv.id, typing: true }));
  assert.deepEqual((await live1.next(3))[2], {
    type: 'typing',
    conversationId: conv.id,
    userId: s3.userId,
    typing: true,
  });

  r = await call('POST', `/conversations/${conv.id}/read`, { token: s3.accessToken });
  assert.equal(r.status, 200);
  const readEvent = (await live1.next(4))[3];
  assert.equal(readEvent.type, 'read');
  assert.equal(readEvent.userId, s3.userId);
  r = await call('GET', `/conversations/${conv.id}/messages`, { token: s1.accessToken });
  assert.equal(r.json.messages.length, 1);
  assert.equal(r.json.peerReadAt, readEvent.at, 'the sender sees "read"');
  r = await call('GET', '/conversations', { token: s3.accessToken });
  assert.equal(r.json.unreadTotal, 0);

  // a stranger writes to ada: it goes to Requests, live, and ada can ignore it without a trace
  r = await call('POST', '/conversations/direct', {
    token: s2.accessToken,
    body: { userId: s1.userId },
  });
  const reqConv = r.json;
  assert.equal(reqConv.state, 'active', 'the sender sees an ordinary chat');
  r = await call('POST', `/conversations/${reqConv.id}/messages`, {
    token: s2.accessToken,
    body: { id: randomUUID(), body: 'hi ada, wanna play?' },
  });
  assert.equal(r.status, 200, r.text);
  assert.equal((await live1.next(5))[4].message.body, 'hi ada, wanna play?');
  r = await call('GET', '/conversations?filter=all', { token: s1.accessToken });
  assert.deepEqual(
    r.json.conversations.map((c) => c.peer.username),
    ['tunde.c'],
    'a stranger never lands in Chat',
  );
  assert.equal(r.json.requestCount, 1);
  r = await call('GET', '/conversations?filter=requests', { token: s1.accessToken });
  assert.equal(r.json.conversations[0].state, 'request');
  assert.equal(r.json.conversations[0].peer.username, 'bisi.m');

  r = await call('GET', `/conversations/${conv.id}/messages`, { token: s2.accessToken });
  assert.equal(r.status, 404, "nobody else can read ada and tunde's chat");
  r = await call('POST', `/conversations/${reqConv.id}/decline`, { token: s1.accessToken });
  assert.equal(r.status, 204);
  r = await call('GET', '/conversations?filter=requests', { token: s1.accessToken });
  assert.deepEqual(r.json.conversations, []);
  const framesBefore = live1.frames.length;
  r = await call('POST', `/conversations/${reqConv.id}/messages`, {
    token: s2.accessToken,
    body: { id: randomUUID(), body: 'hello?' },
  });
  assert.equal(r.status, 200, 'the sender is not told they were ignored');
  await sleep(200);
  assert.equal(live1.frames.length, framesBefore, 'an ignored sender reaches nobody live');

  r = await call('GET', '/conversations/not-a-uuid', { token: s1.accessToken });
  assert.equal(r.status, 422);
  assert.doesNotMatch(
    JSON.stringify((await call('GET', '/conversations', { token: s1.accessToken })).json),
    /\+234|0803/,
    'conversation data leaked a phone number',
  );

  // a socket with a bad token is refused
  const bad = await connectWs('x'.repeat(40), { expectClose: true });
  assert.equal(bad.closeCode, 4401);
  live1.ws.close();
  live3.ws.close();

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
  // (the second user picked a username in the messaging step and went no further)
  r = await call('GET', '/me', { token: s2.accessToken });
  assert.equal(r.json.nextStep, 'contacts');

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
  for (const raw of [
    '5550100',
    '5550222',
    '5550333',
    '5559999',
    '2348035550100',
    '2348035550222',
    '2348035550333',
    '8035550100',
  ]) {
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
