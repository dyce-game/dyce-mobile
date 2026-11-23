// Login churn: many people sign in, refresh and log out at once. Each person has an IP of their own
// (X-Forwarded-For, TRUST_PROXY_HOPS=1 on the stack), as in production, so the per-IP rate limits behave
// as they would; the OTP test code stands in for the SMS.
//
//   node scripts/load/login-churn.mjs [--users 200] [--concurrency 25] [--returning]
//
// Per person: otp/request -> otp/verify (a new account) -> GET /me -> refresh x2 -> logout. With --returning,
// after 31 s (the per-number resend limit) the same people sign in again as returning users.
// Measured: latency percentiles per endpoint, logins per second, every non-2xx by status and code.
import {
  Tally,
  heading,
  machine,
  makeApi,
  pool,
  readStack,
  sampleProcesses,
  saveResult,
  sleep,
  stackPids,
  summarize,
} from './lib.mjs';
import { ipFor, phoneFor } from '../lib/api.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const USERS = flag('users', 200);
const CONC = flag('concurrency', 25);
const WARM = flag('warmup', 10); // journeys before the measurement (the first requests pay for JIT and cold pools)
const returning = args.includes('--returning');
let recording = false;

const stack = readStack();
const api = makeApi(stack.api);
const lat = {};
const errors = new Tally();
const rec = (name, r) => {
  if (!recording) return r;
  (lat[name] ??= []).push(r.ms);
  if (r.status < 200 || r.status >= 300)
    errors.add(`${name} ${r.status} ${r.json?.code ?? ''}`.trim());
  return r;
};

const base = 1_000_000 + Math.floor(Math.random() * 6_000_000);
const sessions = new Array(USERS + WARM);

async function login(i, label) {
  const phone = phoneFor(base + i * 3);
  const ip = ipFor(base + i * 3);
  const req = rec(
    `${label} otp/request`,
    await api.call('POST', '/auth/otp/request', { body: { phone, country: 'NG' }, ip }),
  );
  if (req.status !== 202) return null;
  const ver = rec(
    `${label} otp/verify`,
    await api.call('POST', '/auth/otp/verify', {
      body: { phone, country: 'NG', code: stack.otp },
      ip,
    }),
  );
  return ver.status === 200 ? { ...ver.json, ip, phone } : null;
}

async function one(i) {
  const t0 = performance.now();
  const s = await login(i, 'new');
  if (!s) return false;
  sessions[i] = s;
  rec('GET /me', await api.call('GET', '/me', { token: s.accessToken, ip: s.ip }));
  let refresh = s.refreshToken;
  for (let k = 0; k < 2; k++) {
    const r = rec(
      'refresh',
      await api.call('POST', '/auth/refresh', { body: { refreshToken: refresh }, ip: s.ip }),
    );
    if (r.status === 200) {
      refresh = r.json.refreshToken;
      s.accessToken = r.json.accessToken;
    }
  }
  rec(
    'logout',
    await api.call('POST', '/auth/logout', { body: { refreshToken: refresh }, ip: s.ip }),
  );
  if (recording)
    lat['whole new-user journey'] = [
      ...(lat['whole new-user journey'] ?? []),
      performance.now() - t0,
    ];
  return true;
}

heading(`login churn: ${USERS} people, ${CONC} at a time`);
if (WARM) await pool(WARM, Math.min(CONC, WARM), (i) => one(USERS + i));
recording = true;
const watch = sampleProcesses(stackPids());
const t0 = performance.now();
const done = await pool(USERS, CONC, one);
const secs = (performance.now() - t0) / 1000;
const okCount = done.filter(Boolean).length;
console.log(
  `${okCount}/${USERS} journeys completed in ${secs.toFixed(1)} s (${(okCount / secs).toFixed(1)} journeys/s)`,
);

let returningResult = null;
if (returning) {
  console.log('waiting 31 s for the per-number resend limit ...');
  await sleep(31_000);
  const t1 = performance.now();
  const r2 = await pool(USERS, CONC, (i) => login(i, 'returning').then(Boolean));
  const s2 = (performance.now() - t1) / 1000;
  returningResult = {
    completed: r2.filter(Boolean).length,
    seconds: Math.round(s2 * 10) / 10,
    perSecond: Math.round((r2.filter(Boolean).length / s2) * 10) / 10,
  };
  console.log(
    `returning logins: ${returningResult.completed}/${USERS} in ${returningResult.seconds} s`,
  );
}
const processes = await watch.stop();

const latency = Object.fromEntries(Object.entries(lat).map(([k, v]) => [k, summarize(v)]));
console.table(
  Object.fromEntries(
    Object.entries(latency).map(([k, v]) => [
      k,
      { n: v.n, 'p50 ms': v.p50, 'p95 ms': v.p95, 'p99 ms': v.p99, 'max ms': v.max },
    ]),
  ),
);
if (Object.keys(errors.toJSON()).length) console.log('non-2xx:', errors.toJSON());
saveResult('login-churn', {
  params: { users: USERS, concurrency: CONC, warmupJourneys: WARM, returning },
  completed: okCount,
  seconds: Math.round(secs * 10) / 10,
  journeysPerSecond: Math.round((okCount / secs) * 10) / 10,
  returning: returningResult,
  latencyMs: latency,
  nonSuccess: errors.toJSON(),
  processes,
  machine: machine(),
});
process.exit(0);
