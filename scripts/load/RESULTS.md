# Load test results

Every number below was measured by the scripts in this folder on **2026-11-23** and is in `results/*.json` with the
machine, parameters and the CPU and memory of the servers. Nothing is estimated.

## The machine

Windows 11 Pro, Intel Core i7-1355U (10 cores, 12 logical), 15.5 GB RAM, Node v22.23.4. **One laptop ran everything**: the load
generator, the API (one Node process), the game server (one Node process) and an embedded PostgreSQL with its default
settings and fsync on. Other sessions' tools (an Expo dev server, test runs, builds) were running on it at the same time:
the whole-machine CPU load during the runs was **47% to 99%** (`hostCpuLoadPercent` in each result). So:

- Read the latencies as orders of magnitude. The same chat script gave a p50 send time of 76 ms, 289 ms and 790 ms on three
  runs.
- Read the **invariants** (delivery, pairing, versions) as solid: they do not depend on speed.
- This is not a capacity test of a production deployment. It says nothing about managed PostgreSQL, several API instances,
  Redis, a real network or phones.

The API ran with: `NODE_ENV=development`, the OTP test code, one proxy hop trusted (so each simulated person has an IP of
their own and the 120-requests-a-minute-per-IP limit behaves as in production), `JWT_ACCESS_TTL_SECONDS=86400`. Database pool: 20
connections (`db.module.ts`). The API was the build of 2026-11-23 at `apps/api/dist/qa` (the working tree, not a tagged commit).

## 1. Login churn (`login-churn.mjs`)

A journey = OTP request, verify (a new account), `GET /me`, two refreshes, logout: 6 requests. 10 warm-up journeys before
measuring (the first requests pay for JIT and cold pools).

| Run | People                                                     | At a time | Journeys / s               | Journey p50 / p95 / p99  | OTP verify p50 / p95 | Errors |
| --- | ---------------------------------------------------------- | --------- | -------------------------- | ------------------------ | -------------------- | ------ |
| A   | 300 (and the same 300 again as returning users after 31 s) | 25        | **32.2** (returning: 34.5) | 764 / 1,097 / 1,210 ms   | 204 / 278 ms         | 0      |
| B   | 100                                                        | 5         | 3.1                        | 1,050 / 4,512 / 5,439 ms | 262 / 2,583 ms       | 0      |
| C   | 100                                                        | 10        | 34.1                       | 282 / 367 / 394 ms       | 71 / 115 ms          | 0      |
| D   | 100                                                        | 50        | 38.4                       | 1,313 / 1,920 / 1,941 ms | 290 / 354 ms         | 0      |

Per endpoint in run A (p50 / p95 ms): OTP request 117 / 224, OTP verify 204 / 278, `GET /me` 90 / 163, refresh 141 / 252, logout
45 / 98. The API process used about 23% of one core (peak 130 MB resident). **Zero** non-2xx answers in any run, including the 300
second-time logins. Run B is slower than run C at a lower concurrency; the cause was not established (host load was 47% during it, and its
OTP verify p95 was 2.6 s with the server at 9.5% of a core, which points at the machine, not the API): the shape that holds is "about 30 to 38 journeys (180 to 230 requests) a second,
the server not the limit".
Throughput rises and then flattens with concurrency while latency per request grows linearly, as expected of one Node process.

An earlier run showed 0.9 journeys a second and timeouts: that was the load script's own blocking CPU sampler stalling its
event loop, not the server. It was fixed and those results were deleted.

## 2. Chat send fan-out over the WebSocket hub (`chat-fanout.mjs`)

120 people in 15 groups of 8, each with an open `/realtime` socket, each sending 10 messages (about one every 1.5 s, jittered).
Every message must reach the 7 other members of its group.

| Run | Sends / s | Deliveries expected / received | Send p50 / p95 / p99 (ms) | Send-to-delivery p50 / p95 (ms) | Socket connect p50 / p95 (ms) | Duplicates |
| --- | --------- | ------------------------------ | ------------------------- | ------------------------------- | ----------------------------- | ---------- |
| 1   | 45.8      | 8,400 / **8,400** (100%)       | 76 / 3,749 / 4,074        | 74 / 3,745                      | 74 / 223                      | 0          |
| 2   | 32.8      | 8,400 / **8,400** (100%)       | 790 / 4,519 / 4,881       | 790 / 4,506                     | 63 / 118                      | 0          |
| 3   | 44.4      | 8,400 / **8,400** (100%)       | 289 / 1,656 / 2,291       | 286 / 1,649                     | 95 / 130                      | 0          |

**No message was lost and none was delivered twice, in all three runs (25,200 deliveries).** About 310 deliveries a second at
the best of the three. Latency is dominated by the first 10 to 20 seconds, when every sender starts at once: the timeline in
run 3 shows p50 of 1,256 ms in the first 5 s, 85 ms between 10 and 15 s. The API used 17% to 34% of one core and 110 to 120 MB;
the host load was 72% to 79% (measured on run 3). What is not known: how much of the slow start is the database (a group's last-message and 8
members' unread counters are written for each send) and how much is the shared machine. Re-measure on staging.

## 3. Concurrent moves in one match (`match-concurrency.mjs`)

3 Pig matches x 25 rounds. Each round fires, at the same instant and at the same `stateVersion` v: a roll and a hold from the
player whose turn it is, and a roll from the other player.

- **75 contended rounds, 0 violations.** After every round the match was read back and `stateVersion` was exactly v+1: one
  move applied, never two from the same version, never none.
- Mover: roll 72 x 200 and 3 x 409 `stale_version`; hold 3 x 200, 70 x 409 `stale_version`, 2 x 422 `illegal_move` (a hold before a
  roll). Out-of-turn player: 73 x 409 `stale_version`, 2 x 409 `not_your_turn`. The first request to take the lock wins and
  every other gets a typed refusal: no 500, no hang.
- 225 requests: p50 89 ms, p95 413 ms, max 556 ms. API 39% of one core.

**But see BUG-0 (below): this test is deliberately kept under 10 requests in flight.**

### The pool probe (`pool-deadlock-probe.mjs`)

Moves fired at the same instant on different matches, then `GET /health` and `pg_stat_activity`:

| Simultaneous moves       | Result                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------- |
| 8, 12, 16                | all 200, in 0.3 to 0.4 s; `/health` ok                                                                   |
| **20**                   | **all 20 time out (20 s); `/health` gives no answer; the API stays wedged**                              |
| **40** (over 20 matches) | **all 40 time out; `/health` no answer; `pg_stat_activity`: 20 of 20 connections "idle in transaction"** |

Cause (read from `apps/api/src/matches/matches.service.ts` `submitMove`): the move runs in a transaction on one pool connection
and, still inside it, `ChatService.playablePeer` asks the pool for a second one. With the pool of 20 and 20 moves in flight,
every connection is held waiting for another. **Any 20 people moving in the same second would take the whole API down until it
is restarted.** Details and the likely fix: `docs/qa/BUGS.md` BUG-0 and the shared notes folder.

## 4. Quick-match queue under load (`quickmatch-queue.mjs`)

100 strangers (all level 1) join the Whot Free queue at the same moment, then everyone paired accepts.

- **100 of 100 paired; every pairing symmetric** (A's opponent is B and B's is A); nobody paired twice; all for the same game;
  **100 of 100 reached `playing`; 50 live rooms opened**; nobody left searching. **0 violations, 0 errors.**
- `POST /quick-match` p50 1,903 ms, p95 2,134 ms (100 at once: consistent with the joins being handled one after another at about 19 ms each, which was not verified); join to found
  p50 2,116 ms; accept p50 647 ms; accept to playing p50 6,721 ms, p95 8,526 ms (each pair opens a room on the game server
  with a signed call; the game server then waits for the players to connect).
- API 26% of one core, 150 MB; game server 86 MB.

## 5. A spread of 50 Whot seats on the game server (`whot-rooms.mjs`)

50 people in 17 rooms (4, 3, 3, 2 repeated, ending with a 2), each room opened over HTTP (create, join by code, host starts,
connect) and played over real Colyseus sockets by bots that read only their own view.

| Run | Bots think | Rooms finished                  | Moves | Moves / s | Move round trip p50 / p95 / p99 (ms) | Room setup p50 (ms) | Connect to first state p50 (ms) | Refused moves |
| --- | ---------- | ------------------------------- | ----- | --------- | ------------------------------------ | ------------------- | ------------------------------- | ------------- |
| 1   | 0 ms       | **17 of 17**, in 6.0 s          | 1,300 | 216       | 40 / 98 / 223                        | 491                 | 102                             | 0             |
| 2   | 1.5 s      | **16 of 17** in 400 s (timeout) | 1,362 | 3.4       | 14 / 337 / 1,424                     | 2,548               | 247                             | 0             |

Game server: 97 MB resident and 53% of one core in run 1 (all 50 seats moving as fast as they can); 64 MB and 1.4% in run 2.
50 sockets connected in 2.4 s. In run 2 one two-seat room was still being played at 400 s: it was not investigated whether
it was a very long game (the bots draw when they cannot play) or a stuck room: **open question**.

## 6. Doodle canvas stream budget (`doodle-stream.mjs`)

One room of 8, the drawer draws a full allowed drawing (3,968 to 4,000 points, the engine's cap) and the 7 other seats count the bytes of every frame
the room sends them (the transport's own socket, everything: state, canvas, chat).

| Drawer speed                                   | Time to draw | Bytes per watcher for the whole drawing | Per watcher per second  | Canvas messages / s | Delay from the drawer to a watcher (p50 / p95) | Points received |
| ---------------------------------------------- | ------------ | --------------------------------------- | ----------------------- | ------------------- | ---------------------------------------------- | --------------- |
| 20 actions/s x 64 points (the fastest allowed) | 4.4 s        | **45,489 B**                            | 6,626 B/s = **53 kbps** | 3.6                 | 60 / 215 ms                                    | 3,968 of 3,968  |
| 5 actions/s x 16 points (a person drawing)     | 53.8 s       | **113,464 B**                           | 2,015 B/s = **16 kbps** | 4.2                 | 167 / 287 ms                                   | 4,000 of 4,000  |

Every watcher received every point in both runs. The room batches the picture to a watcher about every 180 to 215 ms (p50
gap) whatever the drawer does, so the cost per watcher is **16 to 53 kbps while the drawer draws**, well inside the 400 kbps
3G line, and the room's outbound traffic for 7 watchers is 14 to 46 KB/s. A slower drawer costs MORE bytes in total (113 KB
against 45 KB for the same points) because each small batch carries its own framing. The drawer's own upload and the other
seats' later joins (a full redraw on join or `sync`) were not measured.

For comparison, the game server's own in-process soak test (`apps/game-server/src/party-soak.test.ts`, run with the backend unit
tests on 2026-11-23: 20 rooms of 8 seats, 150 simulated seconds, no sockets) logged 2.48 KB per client per second, 0.76 canvas
messages per client per second, 8.9 ms of CPU per room-second and 0.5 database writes per room-second. That is the same range as the
slow-drawer run above (2.0 KB/s per watcher) and is a model, not a measurement over a network.

## What to re-measure on staging

The numbers above prove correctness and give orders of magnitude on one busy laptop. On staging (managed PostgreSQL, the
real API and game-server images, a real network), re-run all seven scripts and record:

1. **Everything with a quiet machine and a separate load generator** (a second host, so the generator does not share CPU).
2. **BUG-0 first**: the pool probe at 20, 40 and 100 simultaneous moves, after the fix, and again with several API instances
   behind a load balancer (the pool limit is per process; PostgreSQL's `max_connections` is the next wall).
3. **Login churn** at 1,000+ people and concurrency 100+ against the real SMS driver's rate limits (use a stub driver: do not
   text real numbers). Watch the OTP table, hashing cost and the 120 per minute per-IP limit behind the real proxy
   (`TRUST_PROXY_HOPS` must match the real hop count, or every user shares one bucket).
4. **Chat fan-out** with 1,000+ sockets on one API instance, groups up to the real maximum, and across **two instances**
   (the hub is in-process: the BACKLOG says Redis is needed for more than one; confirm that two instances lose events today).
   Record the slow start seen here and the database write time per send.
5. **Concurrent moves** with 100+ matches at once and a hot match (one match with 20 requests), after BUG-0.
6. **Quick match** at 1,000 searching with mixed levels (the level gap widens with waiting) and Pool stakes, and the sweep
   interval under load; confirm accept to `playing` stays under the 10 s accept window's patience.
7. **Whot and the other live rooms**: 500+ seats across 150+ rooms, 12-seat Werewolf and 10-seat Imposter rooms, a game server
   restart mid-game, reconnection storms (everyone's Wi-Fi drops at once), and the one unfinished room from run 2 of section 5.
8. **Doodle** with several rooms at once, a watcher joining mid-drawing, and on a real 3G link and a low-end phone (decode and
   draw cost, not just bytes).
9. **Money under concurrency** (not covered by these scripts, which use Free matches): double spends and Pool settlement
   with the ledger invariant checked after the run (`ledger_check_invariants`), 14 days clean being a launch gate.
10. **Soak**: the same mix for 2 hours; memory of the API and game server must plateau; the 15 to 140 MB seen here are start
    to end of minutes-long runs, not a leak test.
