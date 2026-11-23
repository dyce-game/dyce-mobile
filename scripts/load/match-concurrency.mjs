// Concurrent moves in one match: the optimistic-concurrency rule (`expectedVersion`) under contention.
//
//   node scripts/load/match-concurrency.mjs [--matches 30] [--rounds 8] [--same 4] [--other 2]
//
// For each of `matches` Pig matches (the dev reference game), `rounds` times, ALL of these are fired at the
// same instant against the same `stateVersion` v:
//   - `same` identical rolls from the player whose turn it is      (a double tap / a retry: must apply ONCE)
//   - `same` holds from that player                                 (a different move at the same version)
//   - `other` rolls from the other player                           (out of turn: must be refused)
// Invariant checked every round, from the match read back from the server: the version went up by exactly
// one (one move applied, never two from the same v, never none) and the matches are never corrupted.
// Matches run in parallel with each other, so this is also a mild load on the match service.
import { randomUUID } from 'node:crypto';
import {
  Tally,
  heading,
  makeApi,
  makeUsers,
  pool,
  readStack,
  sampleProcesses,
  saveResult,
  stackPids,
  summarize,
} from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
// Keep the number of requests in flight below the API's pool of 20 database connections: more than that wedges the
// API today (see pool-deadlock-probe.mjs). 3 matches x (1 roll + 1 hold + 1 out-of-turn) = 9 in flight.
const MATCHES = flag('matches', 3);
const ROUNDS = flag('rounds', 25);
const SAME = flag('same', 1);
const OTHER = flag('other', 1);

const stack = readStack();
const api = makeApi(stack.api);
heading(
  `match concurrency: ${MATCHES} matches x ${ROUNDS} rounds, ${SAME * 2 + OTHER} simultaneous moves per round`,
);
const users = await makeUsers(MATCHES * 2, { label: 'm', concurrency: 12 });

const pairs = [];
await pool(MATCHES, 6, async (i) => {
  const [a, b] = [users[i * 2], users[i * 2 + 1]];
  await api.ok(
    api.call('POST', '/friends/requests', { token: a.token, ip: a.ip, body: { userId: b.userId } }),
    'friend',
  );
  await api.ok(
    api.call('POST', `/friends/requests/${a.userId}/accept`, { token: b.token, ip: b.ip }),
    'accept',
  );
  const conv = await api.ok(
    api.call('POST', '/conversations/direct', {
      token: a.token,
      ip: a.ip,
      body: { userId: b.userId },
    }),
    'direct',
  );
  const id = randomUUID();
  await api.ok(
    api.call('POST', '/matches', {
      token: a.token,
      ip: a.ip,
      body: {
        id,
        conversationId: conv.id ?? conv.conversation?.id,
        gameSlug: '_example',
        mode: 'free',
      },
    }),
    'match',
  );
  await api.ok(
    api.call('POST', `/matches/${id}/accept`, { token: b.token, ip: b.ip }),
    'accept match',
  );
  pairs[i] = { id, a, b };
});

const byOutcome = { mover: new Tally(), other: new Tally() };
const moveMs = [];
const violations = [];
let rounds = 0;
let finished = 0;
const watch = sampleProcesses(stackPids());
const t0 = performance.now();

async function round(p, r) {
  const read = (u) => api.call('GET', `/matches/${p.id}`, { token: u.token, ip: u.ip });
  const before = (await read(p.a)).json;
  if (before.status !== 'active') {
    finished++;
    return;
  }
  const mover = before.currentTurn === p.a.userId ? p.a : p.b;
  const other = mover === p.a ? p.b : p.a;
  const v = before.stateVersion;
  const fire = (u, kind, tally) =>
    api
      .call('POST', `/matches/${p.id}/moves`, {
        token: u.token,
        ip: u.ip,
        body: { expectedVersion: v, action: { kind } },
      })
      .then((res) => {
        moveMs.push(res.ms);
        tally.add(`${kind} -> ${res.status}${res.json?.code ? ' ' + res.json.code : ''}`);
        return res;
      });
  const calls = [];
  for (let i = 0; i < SAME; i++)
    calls.push(fire(mover, 'roll', byOutcome.mover), fire(mover, 'hold', byOutcome.mover));
  for (let i = 0; i < OTHER; i++) calls.push(fire(other, 'roll', byOutcome.other));
  await Promise.all(calls);
  const after = (await read(mover)).json;
  rounds++;
  const advanced = after.stateVersion - v;
  if (advanced !== 1 && after.status === 'active')
    violations.push({ match: p.id, round: r, from: v, to: after.stateVersion, advanced });
}

for (let r = 0; r < ROUNDS; r++) await pool(MATCHES, MATCHES, (i) => round(pairs[i], r));
const secs = (performance.now() - t0) / 1000;
const processes = await watch.stop();

console.log(
  `${rounds} contended rounds in ${secs.toFixed(1)} s; ${finished} match-rounds skipped (match already finished)`,
);
console.log('mover (same version, identical and different moves):', byOutcome.mover.toJSON());
console.log('other player (out of turn):', byOutcome.other.toJSON());
console.log(
  violations.length
    ? `VIOLATIONS: ${violations.length}`
    : 'invariant held: exactly one move applied per contended version, every round',
);
console.table({ 'move request': summarize(moveMs) });
saveResult('match-concurrency', {
  params: {
    matches: MATCHES,
    rounds: ROUNDS,
    identicalMovesPerRound: SAME,
    holdsPerRound: SAME,
    outOfTurnPerRound: OTHER,
  },
  contendedRounds: rounds,
  skippedFinished: finished,
  seconds: Math.round(secs * 10) / 10,
  outcomes: { mover: byOutcome.mover.toJSON(), otherPlayer: byOutcome.other.toJSON() },
  violations,
  invariant:
    'after N simultaneous moves at one stateVersion v, stateVersion is v+1 (one move applied)',
  latencyMs: summarize(moveMs),
  processes,
});
process.exit(violations.length ? 1 : 0);
