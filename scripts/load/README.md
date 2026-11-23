# Load tests

Node scripts (no k6 on this machine) for the API and the realtime servers. They talk to the real built API and game
server over real HTTP and WebSockets, on a private throwaway PostgreSQL, so they never touch anybody's dev data.
Every number they print or save is measured, not estimated. Results of the runs done so far, the machine they ran on
and what to re-measure on staging are in [RESULTS.md](RESULTS.md).

## Run them

```bash
node scripts/stack/up.mjs                # PostgreSQL :54380, API :3100, game server :2667 (Ctrl+C stops it)
node scripts/stack/up.mjs --no-build     # reuse the last API build (apps/api/dist/qa, gitignored)
```

Each script reads the stack from `<tmp>/dyce-qa-stack.json`, or from `API_URL`, `GAME_URL` and `OTP_CODE`
(an environment the API runs with `OTP_TEST_CODE`, `TRUST_PROXY_HOPS=1`). Results go to `scripts/load/results/`.

| Script                    | What it loads                                                                                                | Default                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------ |
| `login-churn.mjs`         | OTP request, verify (new account), `/me`, two refreshes, logout; `--returning` signs everyone in again after 31 s | 200 people, 25 at a time, 10 warm-up       |
| `chat-fanout.mjs`         | Groups of people with open `/realtime` sockets; each sends messages that every other member must receive     | 120 people, groups of 8, 10 messages each  |
| `match-concurrency.mjs`   | Simultaneous moves on one match at one `stateVersion`: identical, different and out-of-turn; checks the version rule | 3 matches x 25 rounds, 3 moves per round   |
| `pool-deadlock-probe.mjs` | A probe: N moves at the same instant over N matches, then `/health` and `pg_stat_activity`. **Wedges the API when it finds the bug** | 40 moves over 20 matches                   |
| `quickmatch-queue.mjs`    | Strangers join one quick-match queue at once; pairing invariants; accept; live rooms opened                   | 100 people, Whot, Free                     |
| `whot-rooms.mjs`          | Live Whot! rooms over Colyseus with bots that read only their own view; `--think MS` slows the bots down      | 50 seats in 17 rooms of 2 to 4             |
| `doodle-stream.mjs`       | One Doodle Guess room: bytes, messages and delay of the canvas stream for the receivers                       | 8 seats, 20 actions/s x 64 points          |

Options are listed at the top of each script. Run `pool-deadlock-probe.mjs` last, or restart the stack after it.

## Things to know before you trust a number

- **Each simulated person has an IP of their own** (`X-Forwarded-For`; the stack trusts one proxy hop), as in production, so
  the per-IP rate limits (120 requests a minute) behave as they would. People are made with the OTP test code.
- **The machine is shared.** The load generator, the API, the game server and PostgreSQL run on one laptop that
  other tools are using. The scripts record the whole-machine CPU load while they run (`hostCpuLoadPercent`) and the
  same script gave p50 send times between 76 ms and 790 ms on different runs. Read them as orders of magnitude and as
  proof of correctness (delivery, invariants), not as capacity numbers.
- Sampling the CPU and memory of the servers is asynchronous. An early version used a blocking sample and made the
  load generator itself the bottleneck; those numbers were thrown away.
- The `db` process figure is the PostgreSQL postmaster only, not its backends: ignore its CPU.
