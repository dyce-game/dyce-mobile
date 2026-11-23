// Small HTTP helper for the QA scripts (seed, load, e2e runner). Talks to a dev API with OTP_TEST_CODE set.
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const STACK_FILE = join(tmpdir(), 'dyce-qa-stack.json');
export const SEED_FILE = join(tmpdir(), 'dyce-qa-seed.json');

/** The private stack started by scripts/stack/up.mjs (or the URLs in API_URL / GAME_URL / OTP_CODE). */
export function readStack() {
  if (process.env.API_URL) {
    return {
      api: process.env.API_URL,
      game: process.env.GAME_URL ?? 'ws://127.0.0.1:2567',
      otp: process.env.OTP_CODE ?? '424242',
      webOrigin: process.env.WEB_URL ?? 'http://localhost:8090',
    };
  }
  if (!existsSync(STACK_FILE)) {
    throw new Error(`No stack: run "node scripts/stack/up.mjs" first (looked for ${STACK_FILE})`);
  }
  return JSON.parse(readFileSync(STACK_FILE, 'utf8'));
}

export function makeApi(base) {
  /** One call. `ip` becomes X-Forwarded-For so each simulated person has their own rate-limit bucket. */
  async function call(method, path, { body, token, ip, headers = {} } = {}) {
    const t0 = performance.now();
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          'content-type': 'application/json',
          ...(ip ? { 'x-forwarded-for': ip } : {}),
          ...(token ? { authorization: `Bearer ${token}` } : {}),
          ...headers,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      return { status: 0, json: null, text: String(e), ms: performance.now() - t0, error: true };
    }
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* not json */
    }
    return { status: res.status, json, text, ms: performance.now() - t0 };
  }
  const ok = async (p, what) => {
    const r = await p;
    if (r.status < 200 || r.status >= 300) throw new Error(`${what}: ${r.status} ${r.text}`);
    return r.json;
  };
  return { call, ok, base };
}

/** A valid Nigerian mobile number from a number: 0803 + 7 digits. */
export const phoneFor = (n) => `0803${String(n % 10_000_000).padStart(7, '0')}`;
export const ipFor = (n) => `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;

/** OTP sign-in with the test code. Returns the session ({ accessToken, refreshToken, userId, nextStep, isNewUser }). */
export async function signIn(api, otp, n, phone = phoneFor(n)) {
  const ip = ipFor(n);
  const otpAt = Date.now();
  await api.ok(
    api.call('POST', '/auth/otp/request', { body: { phone, country: 'NG' }, ip }),
    'otp request',
  );
  const s = await api.ok(
    api.call('POST', '/auth/otp/verify', { body: { phone, country: 'NG', code: otp }, ip }),
    'otp verify',
  );
  return { ...s, token: s.accessToken, ip, n, phone, otpAt };
}

/** Sign in and finish onboarding (username, age gate, steps, welcome bonus). Idempotent for returning users. */
export async function onboard(
  api,
  otp,
  n,
  { username, displayName, birthYear = 1990, phone } = {},
) {
  const u = await signIn(api, otp, n, phone);
  const me = await api.ok(api.call('GET', '/me', { token: u.token, ip: u.ip }), 'me');
  if (!me.profile) {
    await api.ok(
      api.call('POST', '/profile', {
        token: u.token,
        ip: u.ip,
        body: { username: username ?? `qa_${n}`, displayName: displayName ?? `QA ${n}` },
      }),
      'profile',
    );
    await api.ok(
      api.call('POST', '/profile/age-gate', { token: u.token, ip: u.ip, body: { birthYear } }),
      'age gate',
    );
    for (const step of ['contacts', 'avatar'])
      await api.ok(
        api.call('POST', `/onboarding/steps/${step}`, { token: u.token, ip: u.ip }),
        step,
      );
    await api.ok(
      api.call('POST', '/onboarding/welcome-bonus', { token: u.token, ip: u.ip }),
      'bonus',
    );
    await api.ok(
      api.call('POST', '/onboarding/steps/notifications', { token: u.token, ip: u.ip }),
      'notifications',
    );
  }
  return { ...u, username: me.profile?.username ?? username ?? `qa_${n}` };
}

export const befriend = async (api, a, b) => {
  await api.ok(
    api.call('POST', '/friends/requests', { token: a.token, ip: a.ip, body: { userId: b.userId } }),
    'friend request',
  );
  await api.ok(
    api.call('POST', `/friends/requests/${a.userId}/accept`, { token: b.token, ip: b.ip }),
    'accept friend',
  );
};

export const openDirect = async (api, a, b) =>
  api.ok(
    api.call('POST', '/conversations/direct', {
      token: a.token,
      ip: a.ip,
      body: { userId: b.userId },
    }),
    'open direct',
  );

export const sendMessage = (api, u, conversationId, body, id = randomUUID()) =>
  api.call('POST', `/conversations/${conversationId}/messages`, {
    token: u.token,
    ip: u.ip,
    body: { id, body },
  });

export const percentile = (sorted, p) =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

/** min / p50 / p95 / p99 / max in ms from a list of numbers. */
export function summarize(values) {
  const s = [...values].sort((a, b) => a - b);
  const r = (x) => Math.round(x * 10) / 10;
  return {
    n: s.length,
    min: r(s[0] ?? 0),
    p50: r(percentile(s, 50)),
    p95: r(percentile(s, 95)),
    p99: r(percentile(s, 99)),
    max: r(s[s.length - 1] ?? 0),
  };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
