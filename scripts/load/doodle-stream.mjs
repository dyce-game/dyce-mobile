// The Doodle Guess canvas stream budget: how many bytes and messages per second does one drawer cost the
// other seats, and how late does the picture arrive?
//
//   node scripts/load/doodle-stream.mjs [--seats 8] [--rooms 1] [--rate 20] [--points 64]
//
// A room of `seats` people is opened over HTTP and joined over Colyseus. The seat the engine makes the
// drawer picks word 0 and then streams strokes of `--points` points at `--rate` actions per second (the
// engine allows 64 points per action, 300 strokes and 4,000 points a turn: the full cap is drawn). Every other
// seat counts the BYTES of every websocket frame it receives and the points in every `canvas` message.
// Measured per receiver: bytes in total and per second, `canvas` messages per second (the room batches about
// every 150 ms), points received vs points sent, and the delay from the drawer sending the points to a
// receiver holding them. Compare bytes per second with the 3G profile in docs/qa/DEVICE_MATRIX.md (400 kbps = 50 KB/s).
import { randomUUID } from 'node:crypto';
import {
  Tally,
  backendModules,
  heading,
  makeApi,
  makeUsers,
  readStack,
  sampleProcesses,
  saveResult,
  sleep,
  stackPids,
  summarize,
} from './lib.mjs';

const args = process.argv.slice(2);
const flag = (n, d) => (args.includes(`--${n}`) ? Number(args[args.indexOf(`--${n}`) + 1]) : d);
const SEATS = flag('seats', 8);
const ROOMS = flag('rooms', 1);
const RATE = flag('rate', 20);
const PTS = Math.min(64, flag('points', 64));

const stack = readStack();
const api = makeApi(stack.api);
const { Client } = await backendModules();
heading(`doodle stream: ${ROOMS} room(s) of ${SEATS}, drawer at ${RATE} actions/s x ${PTS} points`);
const users = await makeUsers(SEATS * ROOMS, { label: 'd', concurrency: 12 });

const rooms = [];
for (let ri = 0; ri < ROOMS; ri++) {
  const members = users.slice(ri * SEATS, (ri + 1) * SEATS);
  const [host, ...others] = members;
  const space = await api.ok(
    api.call('POST', '/spaces', {
      token: host.token,
      ip: host.ip,
      body: {
        id: randomUUID(),
        name: `doodle ${ri}`,
        gameSlug: 'doodle-guess',
        maxSeats: SEATS,
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
  const seats = [];
  for (const u of members) {
    const conn = await api.ok(
      api.call('POST', `/spaces/${space.id}/connect`, { token: u.token, ip: u.ip }),
      'connect',
    );
    const room = await new Client(conn.url).joinById(conn.roomId, { token: u.token });
    const seat = {
      user: u,
      room,
      state: null,
      bytes: 0,
      frames: 0,
      canvasMsgs: 0,
      points: 0,
      delays: [],
      gaps: [],
      lastCanvasAt: 0,
      streamBytes: 0,
      streaming: false,
    };
    // count the bytes of every frame the room sends this seat (the transport's own socket)
    const ws = room.connection?.transport?.ws;
    if (ws?.addEventListener)
      ws.addEventListener('message', (ev) => {
        const n =
          typeof ev.data === 'string'
            ? Buffer.byteLength(ev.data)
            : (ev.data.byteLength ?? ev.data.size ?? 0);
        seat.bytes += n;
        seat.frames++;
        if (seat.streaming) seat.streamBytes += n;
      });
    else seat.noWs = true;
    room.onMessage('state', (s) => (seat.state = s));
    room.onMessage('canvas', (m) => {
      const now = Date.now();
      seat.canvasMsgs++;
      if (seat.lastCanvasAt) seat.gaps.push(now - seat.lastCanvasAt);
      seat.lastCanvasAt = now;
      const before = seat.points;
      seat.points +=
        (m.strokes ?? []).reduce((n, s) => n + (s.pts?.length ?? 0), 0) +
        (m.extend ?? []).reduce((n, e) => n + (e.pts?.length ?? 0), 0);
      if (m.reset) seat.points = (m.strokes ?? []).reduce((n, s) => n + (s.pts?.length ?? 0), 0);
      if (seat.drawerLog && seat.points > before) {
        const hit = seat.drawerLog.find((e) => e.cum >= seat.points);
        if (hit) seat.delays.push(now - hit.t);
      }
    });
    room.onMessage('error', (e) => (seat.errors ??= new Tally()).add(e.code));
    room.onMessage('chat', () => {});
    room.onMessage('chat_history', () => {});
    seats.push(seat);
  }
  rooms.push({ space, seats });
}
console.log(
  `${rooms.length * SEATS} seats connected${rooms[0].seats[0].noWs ? ' (could not reach the socket: byte counts unavailable)' : ''}`,
);

// ---- one drawer per room -----------------------------------------------------------------------------------------------
const watch = sampleProcesses(stackPids());
const results = [];
await Promise.all(
  rooms.map(async ({ seats }) => {
    for (const s of seats) s.room.send('sync');
    // wait for the first state with a drawer
    for (let i = 0; i < 200 && !seats.every((s) => s.state?.view?.drawer); i++) await sleep(100);
    const drawerId = seats[0].state?.view?.drawer;
    const drawer = seats.find((s) => s.user.userId === drawerId);
    if (!drawer) return;
    // choose the first word
    for (let i = 0; i < 100 && drawer.state.view.phase !== 'choose'; i++) await sleep(100);
    drawer.room.send('move', { action: { kind: 'choose', index: 0 } });
    for (let i = 0; i < 200 && drawer.state.view.phase !== 'draw'; i++) await sleep(50);
    const receivers = seats.filter((s) => s !== drawer);
    const log = [];
    for (const r of receivers) {
      r.drawerLog = log;
      r.streaming = true;
      r.streamStart = Date.now();
    }
    let cum = 0;
    let sent = 0;
    const t0 = Date.now();
    let strokeId = 0;
    while (cum + PTS <= 4000 && strokeId < 300) {
      const pts = Array.from({ length: PTS }, (_, i) => [
        Math.round(500 + 400 * Math.cos((cum + i) / 25)),
        Math.round(500 + 400 * Math.sin((cum + i) / 17)),
      ]);
      cum += PTS;
      log.push({ t: Date.now(), cum });
      drawer.room.send('move', {
        action: {
          kind: 'stroke',
          points: pts,
          color: strokeId % 16,
          width: 4,
          cont: strokeId % 6 !== 0,
        },
      });
      sent++;
      strokeId++;
      await sleep(1000 / RATE);
    }
    const drawSecs = (Date.now() - t0) / 1000;
    await sleep(2500); // the last batches arrive
    for (const r of receivers) r.streaming = false;
    results.push({
      drawer,
      receivers,
      sent,
      pointsSent: cum,
      drawSecs,
      errors: drawer.errors?.toJSON(),
    });
  }),
);
const processes = await watch.stop();
for (const { space, seats } of rooms) for (const s of seats) s.room.leave();

const per = results.flatMap((r) =>
  r.receivers.map((s) => ({
    bytes: s.streamBytes,
    secs: r.drawSecs + 2.5,
    bytesPerSecond: s.streamBytes / (r.drawSecs + 2.5),
    canvasPerSecond: s.canvasMsgs / (r.drawSecs + 2.5),
    pointsReceived: s.points,
    pointsSent: r.pointsSent,
    delays: s.delays,
    gaps: s.gaps,
  })),
);
const avg = (k) => per.reduce((n, p) => n + p[k], 0) / Math.max(1, per.length);
const all = (k) => per.flatMap((p) => p[k]);
const summary = {
  receivers: per.length,
  pointsSentPerDrawing: results[0]?.pointsSent,
  drawSeconds: Math.round((results[0]?.drawSecs ?? 0) * 10) / 10,
  bytesPerReceiverPerDrawing: Math.round(avg('bytes')),
  bytesPerSecondPerReceiver: Math.round(avg('bytesPerSecond')),
  kbpsPerReceiver: Math.round(((avg('bytesPerSecond') * 8) / 1000) * 10) / 10,
  canvasMessagesPerSecondPerReceiver: Math.round(avg('canvasPerSecond') * 10) / 10,
  pointsReceivedMin: Math.min(...per.map((p) => p.pointsReceived)),
  roomOutboundBytesPerSecond: Math.round(
    per.reduce((n, p) => n + p.bytesPerSecond, 0) / Math.max(1, results.length),
  ),
  delayFromDrawerMs: summarize(all('delays')),
  gapBetweenCanvasMessagesMs: summarize(all('gaps')),
};
console.log(summary);
console.log(
  'drawer refused:',
  results.map((r) => r.errors),
);
saveResult('doodle-stream', {
  params: { seats: SEATS, rooms: ROOMS, actionsPerSecond: RATE, pointsPerAction: PTS },
  ...summary,
  drawerRefused: results.map((r) => r.errors ?? {}),
  processes,
});
process.exit(0);
