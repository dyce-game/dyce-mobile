// A spread of live Whot! rooms on the game server: `seats` people (default 50) across 2 to 4 seat rooms, all
// connected over real Colyseus sockets and playing at the same time with bots that read only their own view.
//
//   node scripts/load/whot-rooms.mjs [--seats 50] [--timeout 180] [--think 0]
//
// Rooms are opened over HTTP (create, join by code, host starts, /spaces/:id/connect), exactly as the app
// does. Measured: setup time per room, connect-to-first-state, move round trip (a bot sends `move`, the room
// answers with the next `state` for that bot), moves per second across all rooms, games finished before the
// timeout, refused moves by code (races between bots are expected and counted), and the game server's CPU
// and memory. `--think MS` makes each bot wait that long before moving (people are slower than bots).
import { randomUUID } from 'node:crypto';
import {
  Tally,
  backendModules,
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
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const SEATS = flag('seats', 50);
const TIMEOUT = flag('timeout', 180) * 1000;
const THINK = flag('think', 0);

const stack = readStack();
const api = makeApi(stack.api);
const { Client, games } = await backendModules();
const { whotCanPlay } = games;

// room sizes 4,3,3,2,4,3,3,2 ... until the seats are used; Whot rooms take 2 to 4 seats, so a leftover single
// seat is taken from the previous room (4 -> 3 or 3 -> 2) to make a room of two
const sizes = [];
for (let left = SEATS, k = 0; left > 0; k++) {
  const s = Math.min(left, [4, 3, 3, 2][k % 4]);
  sizes.push(s);
  left -= s;
}
if (sizes.at(-1) === 1) {
  const i = sizes.findLastIndex((n, idx) => idx < sizes.length - 1 && n > 2);
  sizes[i] -= 1;
  sizes[sizes.length - 1] = 2;
}
heading(`Whot rooms: ${SEATS} seats in ${sizes.length} rooms (${sizes.join(', ')})`);
const users = await makeUsers(SEATS, { label: 'w', concurrency: 12 });

const brain = (me, s) => {
  const v = s.view;
  if (!v || v.current !== me) return null;
  const card = v.hand.find((c) => whotCanPlay(c, v.top, v.requested, v.pending));
  if (!card) return { kind: 'draw' };
  const a = { kind: 'play', card, call: true };
  if (card.shape === 'whot') {
    const counts = {};
    for (const c of v.hand) if (c.shape !== 'whot') counts[c.shape] = (counts[c.shape] ?? 0) + 1;
    a.shape = Object.entries(counts).sort((x, y) => y[1] - x[1])[0]?.[0] ?? 'circle';
  }
  return a;
};

const setupMs = [];
const connectMs = [];
const moveRtt = [];
const refused = new Tally();
let moves = 0;
const bots = [];

async function openRoom(ri, members) {
  const t0 = performance.now();
  const [host, ...others] = members;
  const space = await api.ok(
    api.call('POST', '/spaces', {
      token: host.token,
      ip: host.ip,
      body: {
        id: randomUUID(),
        name: `load ${ri}`,
        gameSlug: 'whot',
        maxSeats: members.length,
        visibility: 'invite',
        startRule: 'host',
      },
    }),
    'create',
  );
  for (const o of others)
    await api.ok(
      api.call('POST', '/spaces/join', { token: o.token, ip: o.ip, body: { code: space.code } }),
      'join',
    );
  await api.ok(
    api.call('POST', `/spaces/${space.id}/start`, { token: host.token, ip: host.ip }),
    'start',
  );
  setupMs.push(performance.now() - t0);
  for (const u of members) {
    const c0 = performance.now();
    const conn = await api.ok(
      api.call('POST', `/spaces/${space.id}/connect`, { token: u.token, ip: u.ip }),
      'connect',
    );
    const room = await new Client(conn.url).joinById(conn.roomId, { token: u.token });
    const bot = {
      user: u,
      room,
      room_i: ri,
      state: null,
      finished: false,
      pendingSince: null,
      last: '',
    };
    room.onMessage('state', (s) => {
      if (bot.pendingSince !== null && s.version > (bot.sentVersion ?? -1)) {
        moveRtt.push(performance.now() - bot.pendingSince);
        bot.pendingSince = null;
      }
      if (!bot.state) connectMs.push(performance.now() - c0);
      bot.state = s;
      if (s.status === 'finished') {
        bot.finished = true;
        return;
      }
      if (s.status !== 'live' || !s.canAct) return;
      const action = brain(u.userId, s);
      if (!action) return;
      const key = JSON.stringify([action, s.version]);
      if (key === bot.last) return;
      bot.last = key;
      const go = () => {
        bot.pendingSince = performance.now();
        bot.sentVersion = s.version;
        moves++;
        room.send('move', { expectedVersion: s.version, action });
      };
      THINK ? setTimeout(go, THINK) : go();
    });
    room.onMessage('error', (e) => refused.add(e.code ?? 'error'));
    room.onMessage('chat', () => {});
    room.onMessage('chat_history', () => {});
    bots.push(bot);
  }
}

const watch = sampleProcesses(stackPids());
const t0 = performance.now();
let at = 0;
const roomMembers = sizes.map((n) => {
  const m = users.slice(at, at + n);
  at += n;
  return m;
});
await pool(roomMembers.length, 6, (ri) => openRoom(ri, roomMembers[ri]));
console.log(`${bots.length} seats connected in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
for (const b of bots) b.room.send('sync');

const tPlay = performance.now();
const end = Date.now() + TIMEOUT;
while (Date.now() < end) {
  const roomsDone = roomMembers.filter((_, ri) =>
    bots.filter((b) => b.room_i === ri).every((b) => b.finished),
  ).length;
  if (roomsDone === sizes.length) break;
  await sleep(1000);
}
const playSecs = (performance.now() - tPlay) / 1000;
const roomsFinished = roomMembers.filter((_, ri) =>
  bots.filter((b) => b.room_i === ri).every((b) => b.finished),
).length;
const processes = await watch.stop();
for (const b of bots) b.room.leave();

// races between bots (an answer to a state that is already out of date) are expected: not_your_turn, stale_version,
// illegal at the wrong moment; count the rest as real problems
const benign = /^(not_your_turn|stale_version|not_running|illegal_move)/;
const real = Object.entries(refused.toJSON()).filter(([k]) => !benign.test(k));
console.log(
  `${roomsFinished}/${sizes.length} rooms finished in ${playSecs.toFixed(1)} s; ${moves} moves sent (${(moves / playSecs).toFixed(1)}/s)`,
);
console.log('refused moves:', refused.toJSON());
console.table({
  'room setup (HTTP)': summarize(setupMs),
  'connect to first state': summarize(connectMs),
  'move round trip': summarize(moveRtt),
});
saveResult('whot-rooms', {
  params: { seats: SEATS, rooms: sizes, thinkMs: THINK, timeoutSeconds: TIMEOUT / 1000 },
  seatsConnected: bots.length,
  roomsFinished,
  roomsTotal: sizes.length,
  playSeconds: Math.round(playSecs * 10) / 10,
  movesSent: moves,
  movesPerSecond: Math.round((moves / playSecs) * 10) / 10,
  latencyMs: {
    roomSetup: summarize(setupMs),
    connectToFirstState: summarize(connectMs),
    moveRoundTrip: summarize(moveRtt),
  },
  refusedMoves: refused.toJSON(),
  refusedForARealReason: real,
  processes,
});
process.exit(roomsFinished === sizes.length && !real.length ? 0 : 1);
