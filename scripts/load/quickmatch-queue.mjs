// Quick-match queue under load: many strangers search for the same game at the same moment.
//
//   node scripts/load/quickmatch-queue.mjs [--users 100] [--accept-window-wait 20] [--game whot]
//
// Measured: POST /quick-match latency, time from joining to being paired (polling GET /quick-match every
// 400 ms, as the app's fallback does), time from both accepting to `playing`, and the pairing invariants:
// every `found` ticket names an opponent whose own ticket names you back, nobody is paired twice, every pair
// is for the same game, and with an odd crowd exactly one person is left searching (then cancelled).
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

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : d);
const USERS = Number(flag('users', 100));
const GAME = flag('game', 'whot');

const stack = readStack();
const api = makeApi(stack.api);
heading(`quick match: ${USERS} strangers searching for ${GAME} at once`);
const users = await makeUsers(USERS, { label: 'q', concurrency: 12 });

const joinMs = [];
const errors = new Tally();
const tickets = new Map(); // userId -> latest ticket
const joinedAt = new Map();
const foundAfter = [];
const watch = sampleProcesses(stackPids());
const t0 = performance.now();

await pool(USERS, USERS, async (i) => {
  const u = users[i];
  joinedAt.set(u.userId, performance.now());
  const r = await api.call('POST', '/quick-match', {
    token: u.token,
    ip: u.ip,
    body: { gameSlug: GAME, mode: 'free' },
  });
  joinMs.push(r.ms);
  if (r.status !== 200 && r.status !== 201)
    errors.add(`join ${r.status} ${r.json?.code ?? ''}`.trim());
  else {
    const t = r.json?.ticket ?? r.json;
    tickets.set(u.userId, t);
    // the second person of a pair is matched inside their own join call: the answer already says `found`
    if (t?.status && t.status !== 'searching')
      foundAfter.push(performance.now() - joinedAt.get(u.userId));
  }
});
console.log(`all joined in ${((performance.now() - t0) / 1000).toFixed(1)} s`);

// poll until everyone who can be paired is
const deadline = Date.now() + 40_000;
while (Date.now() < deadline) {
  const pending = users.filter((u) => tickets.get(u.userId)?.status === 'searching');
  if (pending.length <= USERS % 2) break;
  await pool(pending.length, 25, async (i) => {
    const u = pending[i];
    const r = await api.call('GET', '/quick-match', { token: u.token, ip: u.ip });
    const t = r.json?.ticket;
    if (t && t.status !== 'searching') {
      tickets.set(u.userId, t);
      foundAfter.push(performance.now() - joinedAt.get(u.userId));
    }
  });
  await sleep(400);
}
const found = users.filter((u) => tickets.get(u.userId)?.status === 'found');
console.log(`${found.length}/${USERS} paired and waiting to accept`);

// invariants
const violations = [];
const opponentOf = new Map(found.map((u) => [u.userId, tickets.get(u.userId).opponent?.userId]));
const pairedWith = new Tally();
for (const u of found) {
  const opp = opponentOf.get(u.userId);
  pairedWith.add(opp);
  if (!opp) violations.push(`${u.userId} is found but has no opponent`);
  else if (opponentOf.get(opp) !== u.userId)
    violations.push(`${u.userId} -> ${opp} but ${opp} -> ${opponentOf.get(opp)}`);
  if (tickets.get(u.userId).gameSlug !== GAME) violations.push('wrong game');
}
for (const [opp, n] of Object.entries(pairedWith.toJSON()))
  if (n > 1) violations.push(`${opp} was paired ${n} times`);

// accept, and wait for `playing`
const acceptMs = [];
const playingAfter = [];
const tAccept = performance.now();
await pool(found.length, 25, async (i) => {
  const u = found[i];
  const r = await api.call('POST', `/quick-match/${tickets.get(u.userId).id}/accept`, {
    token: u.token,
    ip: u.ip,
  });
  acceptMs.push(r.ms);
  if (r.status !== 200 && r.status !== 201)
    errors.add(`accept ${r.status} ${r.json?.code ?? ''}`.trim());
});
const playDeadline = Date.now() + 30_000;
let playing = 0;
while (Date.now() < playDeadline) {
  const waiting = found.filter((u) => tickets.get(u.userId).status !== 'playing');
  if (!waiting.length) break;
  await pool(waiting.length, 25, async (i) => {
    const u = waiting[i];
    const r = await api.call('GET', '/quick-match', { token: u.token, ip: u.ip });
    const t = r.json?.ticket;
    if (t?.status === 'playing') {
      tickets.set(u.userId, t);
      playingAfter.push(performance.now() - tAccept);
    }
  });
  await sleep(400);
}
playing = found.filter((u) => tickets.get(u.userId).status === 'playing').length;
const spaces = new Set(found.map((u) => tickets.get(u.userId).spaceId).filter(Boolean));
console.log(`${playing}/${found.length} reached playing, ${spaces.size} live rooms opened`);

// an odd person out is still searching: cancel them
const leftovers = users.filter((u) => tickets.get(u.userId)?.status === 'searching');
for (const u of leftovers)
  await api.call('POST', `/quick-match/${tickets.get(u.userId).id}/cancel`, {
    token: u.token,
    ip: u.ip,
  });
if (leftovers.length !== USERS % 2)
  violations.push(`${leftovers.length} left searching, expected ${USERS % 2}`);
const processes = await watch.stop();

console.log(
  violations.length ? `VIOLATIONS:\n  ${violations.join('\n  ')}` : 'pairing invariants held',
);
console.table({
  'POST /quick-match (join)': summarize(joinMs),
  'join to found (poll 400 ms)': summarize(foundAfter),
  'POST accept': summarize(acceptMs),
  'accept to playing (poll 400 ms)': summarize(playingAfter),
});
saveResult('quickmatch-queue', {
  params: { users: USERS, game: GAME },
  paired: found.length,
  playing,
  liveRoomsOpened: spaces.size,
  leftSearching: leftovers.length,
  latencyMs: {
    join: summarize(joinMs),
    joinToFound: summarize(foundAfter),
    accept: summarize(acceptMs),
    acceptToPlaying: summarize(playingAfter),
  },
  violations,
  errors: errors.toJSON(),
  processes,
});
process.exit(violations.length ? 1 : 0);
