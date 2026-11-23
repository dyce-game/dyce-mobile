// Chat send fan-out over the WebSocket hub: many people connected to /realtime, in groups, each sending
// messages that every other member must receive live.
//
//   node scripts/load/chat-fanout.mjs [--users 120] [--group-size 8] [--messages 10] [--interval 1500] [--connect-concurrency 20]
//
// Setup (not timed): people are onboarded, each group's first person befriends the rest and creates a group.
// Then everybody opens a socket (/realtime, first frame `auth`). Each person sends `messages` messages,
// one every `interval` ms (jittered), the body carrying its send time; every member of the group must see a
// `message` event for it. Measured: HTTP send latency, send-to-delivery latency at each receiver, deliveries
// expected vs received (loss), duplicates, socket connect time, and CPU / memory of the API process.
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Tally,
  heading,
  makeApi,
  makeUsers,
  pool,
  readStack,
  sampleProcesses,
  saveResult,
  sleep,
  stackPids,
  summarize,
} from './lib.mjs';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const USERS = flag('users', 120);
const GROUP = flag('group-size', 8);
const MESSAGES = flag('messages', 10);
const INTERVAL = flag('interval', 1500);
const CONNECT_CONC = flag('connect-concurrency', 20);

// `ws` lives in the backend checkout; Node 22 also has a global WebSocket, which is what we use if `ws` is absent
const here = dirname(fileURLToPath(import.meta.url));
let WS = globalThis.WebSocket;
try {
  WS = createRequire(
    join(resolve(here, '..', '..', '..', 'dyce-backend', 'apps', 'api'), 'package.json'),
  )('ws').WebSocket;
} catch {
  /* use the global one */
}

const stack = readStack();
const api = makeApi(stack.api);
const wsUrl = stack.api.replace(/^http/, 'ws') + '/realtime';

heading(`chat fan-out: ${USERS} people in groups of ${GROUP}, ${MESSAGES} messages each`);
console.log('creating people ...');
const users = await makeUsers(USERS, { label: 'c', concurrency: 12 });
const groups = [];
for (let i = 0; i + GROUP <= users.length; i += GROUP) groups.push(users.slice(i, i + GROUP));

console.log(`making ${groups.length} groups ...`);
await pool(groups.length, 6, async (gi) => {
  const [owner, ...members] = groups[gi];
  for (const m of members) {
    await api.ok(
      api.call('POST', '/friends/requests', {
        token: owner.token,
        ip: owner.ip,
        body: { userId: m.userId },
      }),
      'friend',
    );
    await api.ok(
      api.call('POST', `/friends/requests/${owner.userId}/accept`, { token: m.token, ip: m.ip }),
      'accept',
    );
  }
  const g = await api.ok(
    api.call('POST', '/conversations/groups', {
      token: owner.token,
      ip: owner.ip,
      body: { id: randomUUID(), title: `load ${gi}`, memberIds: members.map((m) => m.userId) },
    }),
    'group',
  );
  groups[gi].convId = g.id ?? g.conversation?.id;
});

// ---- sockets -----------------------------------------------------------------------------------------------------------------
const connectMs = [];
const delivery = []; // ms from send to a receiver's event
const dup = new Tally();
const seen = new Set(); // `${receiver}|${messageId}`
let received = 0;
const sendTimes = new Map(); // messageId -> Date.now() when the POST was issued
const sockets = [];
console.log('connecting sockets ...');
await pool(users.length, CONNECT_CONC, async (i) => {
  const u = users[i];
  const t0 = performance.now();
  const ws = new WS(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onmessage = (ev) => {
      const frame = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (frame.type === 'ready') {
        connectMs.push(performance.now() - t0);
        resolve();
      } else if (frame.type === 'message') {
        const key = `${u.userId}|${frame.message.id}`;
        const sent = sendTimes.get(frame.message.id);
        if (seen.has(key)) dup.add('duplicate delivery');
        else if (frame.message.senderId !== u.userId && sent !== undefined) {
          seen.add(key);
          received++;
          delivery.push(Date.now() - sent);
        }
      }
    };
    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token: u.token }));
    ws.onerror = (e) => reject(new Error(`socket ${i}: ${e.message ?? e}`));
    setTimeout(() => reject(new Error(`socket ${i}: no ready in 20 s`)), 20_000);
  });
  sockets.push(ws);
});
console.log(`${sockets.length}/${users.length} sockets ready`);

// ---- the load ---------------------------------------------------------------------------------------------------------------
const sendMs = [];
const sendLog = []; // [seconds since the load started, ms] to see whether slow sends cluster in time
const errors = new Tally();
let sent = 0;
const watch = sampleProcesses(stackPids());
const t0 = performance.now();
await Promise.all(
  users.map(async (u, ui) => {
    const group = groups.find((g) => g.includes(u));
    if (!group?.convId) return;
    await sleep(Math.random() * INTERVAL); // spread the first sends
    for (let m = 0; m < MESSAGES; m++) {
      const id = randomUUID();
      sendTimes.set(id, Date.now());
      const r = await api.call('POST', `/conversations/${group.convId}/messages`, {
        token: u.token,
        ip: u.ip,
        body: { id, body: `msg ${ui}.${m}` },
      });
      sendMs.push(r.ms);
      sendLog.push([(performance.now() - t0) / 1000, r.ms]);
      if (r.status === 201 || r.status === 200) sent++;
      else errors.add(`send ${r.status} ${r.json?.code ?? ''}`.trim());
      await sleep(INTERVAL * (0.7 + Math.random() * 0.6));
    }
  }),
);
await sleep(3000); // let the last events arrive
const secs = (performance.now() - t0) / 1000;
const processes = await watch.stop();
for (const ws of sockets) ws.close();

const expected = sent * (GROUP - 1);
console.log(
  `sent ${sent} messages in ${secs.toFixed(1)} s (${(sent / secs).toFixed(1)}/s); deliveries ${received}/${expected} (${((received / Math.max(1, expected)) * 100).toFixed(2)}%)`,
);
console.table({
  'HTTP send': summarize(sendMs),
  'send to delivery (receiver)': summarize(delivery),
  'socket connect to ready': summarize(connectMs),
});
saveResult('chat-fanout', {
  params: {
    users: USERS,
    groupSize: GROUP,
    groups: groups.length,
    messagesPerPerson: MESSAGES,
    intervalMs: INTERVAL,
  },
  sockets: sockets.length,
  messagesSent: sent,
  seconds: Math.round(secs * 10) / 10,
  sendsPerSecond: Math.round((sent / secs) * 10) / 10,
  deliveriesExpected: expected,
  deliveriesReceived: received,
  deliveryPercent: Math.round((received / Math.max(1, expected)) * 10000) / 100,
  deliveriesPerSecond: Math.round((received / secs) * 10) / 10,
  latencyMs: {
    httpSend: summarize(sendMs),
    sendToDelivery: summarize(delivery),
    socketConnect: summarize(connectMs),
  },
  timeline: (() => {
    const buckets = {};
    for (const [t, ms] of sendLog) (buckets[Math.floor(t / 5) * 5] ??= []).push(ms);
    return Object.fromEntries(
      Object.entries(buckets).map(([k, v]) => [`${k}-${Number(k) + 5}s`, summarize(v)]),
    );
  })(),
  duplicates: dup.toJSON(),
  errors: errors.toJSON(),
  processes,
});
process.exit(0);
