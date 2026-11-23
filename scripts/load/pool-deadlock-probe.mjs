// A probe, not a benchmark: does the API survive many simultaneous game moves?
//
//   node scripts/load/pool-deadlock-probe.mjs [--moves 40] [--matches 20]
//
// The API's database pool has 20 connections. `MatchesService.submitMove` opens a transaction (one connection, the
// match row locked) and, still inside it, calls `ChatService.playablePeer`, which asks the pool for a SECOND
// connection. When enough moves are in flight at once every connection is held by a transaction that is waiting for
// another one: nobody can finish, the pool never frees up, and every request that needs the database hangs until
// the process is restarted. This script creates `matches` matches, fires `moves` moves at the same instant (spread
// over the matches), then checks /health and what PostgreSQL says about the connections.
// WARNING: if the bug is present this leaves the API wedged: restart the stack afterwards.
import { randomUUID } from 'node:crypto';
import {
  backendPg,
  heading,
  makeApi,
  makeUsers,
  pool,
  readStack,
  saveResult,
  sleep,
} from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const MOVES = flag('moves', 40);
const MATCHES = flag('matches', 20);

const stack = readStack();
const api = makeApi(stack.api);
heading(
  `pool deadlock probe: ${MOVES} simultaneous moves over ${MATCHES} matches (pool max is 20)`,
);
const users = await makeUsers(MATCHES * 2, { label: 'p', concurrency: 12 });
const pairs = await pool(MATCHES, 6, async (i) => {
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
  const m = await api.ok(api.call('GET', `/matches/${id}`, { token: a.token, ip: a.ip }), 'read');
  return { id, mover: m.currentTurn === a.userId ? a : b, v: m.stateVersion };
});

const pending = [];
const t0 = performance.now();
for (let i = 0; i < MOVES; i++) {
  const p = pairs[i % MATCHES];
  // one request each with a 20 s timeout, so a wedged API shows up as timeouts instead of hanging this script
  pending.push(
    fetch(`${stack.api}/matches/${p.id}/moves`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${p.mover.token}`,
        'x-forwarded-for': p.mover.ip,
      },
      body: JSON.stringify({ expectedVersion: p.v, action: { kind: 'roll' } }),
      signal: AbortSignal.timeout(20_000),
    }).then(
      (r) => r.status,
      () => 'timeout',
    ),
  );
}
const statuses = await Promise.all(pending);
const secs = (performance.now() - t0) / 1000;
const tally = {};
for (const s of statuses) tally[s] = (tally[s] ?? 0) + 1;
console.log(`after ${secs.toFixed(1)} s the ${MOVES} moves answered:`, tally);

let health = 'ok'; // replaced by the HTTP status below
try {
  const r = await fetch(`${stack.api}/health`, { signal: AbortSignal.timeout(5000) });
  health = r.status === 200 ? 'ok' : `HTTP ${r.status}`;
} catch {
  health = 'no answer in 5 s';
}
console.log('GET /health:', health);

const pg = backendPg();
const db = new pg.Pool({ connectionString: stack.db, max: 1 });
let connections = null;
try {
  const r = await db.query(
    `SELECT state, wait_event_type, count(*)::int AS n,
            count(*) FILTER (WHERE cardinality(pg_blocking_pids(pid)) > 0)::int AS blocked,
            max(left(regexp_replace(query, '[[:space:]]+', ' ', 'g'), 90)) AS sample_query
       FROM pg_stat_activity WHERE datname = 'dyce' AND pid <> pg_backend_pid() GROUP BY 1, 2 ORDER BY n DESC`,
  );
  connections = r.rows;
  console.table(connections);
} catch (e) {
  console.log('could not read pg_stat_activity:', e.message);
}
await db.end();

const wedged = health !== 'ok' || tally.timeout > 0;
console.log(
  wedged
    ? '\nWEDGED: the API is not answering. Restart the stack (scripts/stack/up.mjs).'
    : '\nThe API answered everything.',
);
saveResult('pool-deadlock-probe', {
  params: { moves: MOVES, matches: MATCHES, apiPoolMax: 20 },
  seconds: Math.round(secs * 10) / 10,
  moveStatuses: tally,
  health,
  postgresConnections: connections,
  wedged,
});
process.exit(wedged ? 1 : 0);
