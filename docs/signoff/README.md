# Phase sign-off reports

One report per phase (`PHASE-1.md` to `PHASE-4.md`), written by qa-engineer on 2026-11-23 from what is in the repositories:
the "done when" lines of `docs/BUILD_PLAN.md`, `docs/STATUS.md`, the test suites, and the runs listed below. **Nothing here ticks a
sign-off box in `BUILD_PLAN.md`.** Each report ends with the list of things a human must confirm before that box is ticked.

## How to read a report

Every criterion is marked by how well it is evidenced:

- **Proven** - an automated test or a run in this session shows it, and the report names it.
- **Shown by hand** - STATUS records a person walking it through in a browser (two sessions, light and dark); not repeated
  here unless said.
- **Not shown** - no test and no recorded walk-through; or it needs something that does not exist on the machines used so far.
- **Unverified (needs a device / account / human)** - cannot be shown without a phone, a store account, a real SMS or push
  provider, a lawyer or a product decision.

## What QA ran for these reports

| Run | Where | Result |
| --- | ----- | ------ |
| App `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` | this repo | **clean; 821 app tests in 58 suites and 13 ui tests pass** |
| Backend `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm test` | `../dyce-backend` | **clean; unit tests api 117 and game-server 47 pass** (shared and games from the turbo cache). `pnpm test:db` and `pnpm e2e` were **not** re-run by QA: the PostgreSQL counts in STATUS and the backend STATUS are the other sessions' |
| Maestro flows linted | `node scripts/e2e/lint-flows.mjs` | clean |
| All eleven numbered flows executed (our subset runner, headless Chrome, Expo web build, a private API and game server) | `e2e/` | pass; see `e2e/README.md` |
| Every route in light and dark | `node scripts/qa/walk-routes.mjs --contrast` | `docs/qa/REGRESSION.md` section 3 |
| Static accessibility audit | `node scripts/qa/a11y-audit.mjs` | `docs/qa/ACCESSIBILITY.md` |
| Load and concurrency | `scripts/load/` | `scripts/load/RESULTS.md` |

**What no one has run: a phone, an emulator or a simulator; Maestro itself; a real SMS; a real push; a store build; a camera
scan; a screen reader; Dynamic Type 1.3x; fps; cold start.** All four reports say so, and `docs/qa/DEVICE_MATRIX.md` is the
plan to close it.

## The finding that matters most

`docs/qa/BUGS.md` BUG-0: **the API stops answering when about 20 game moves are in flight at once** (a pool of 20 database
connections each held by a move transaction that needs a second one). Found by the load tests, reproduced deterministically,
not fixed from here (`apps/api` belongs to another lane). It is a blocker for any launch gate that involves concurrent players,
and it is why the "concurrent moves in one match" test in `scripts/load/` runs below that line by default.

## Update 2026-11-24: BUG-1, BUG-2 and BUG-3 fixed

The three app bugs the QA work found are fixed and re-tested (`docs/qa/BUGS.md`, `docs/qa/REGRESSION.md` section 7): the Wallet tab
refreshes when a QR request is paid and when a money card arrives (flow 10), Back after a game reaches the chat list (flow 11), and
`/games/issue` without an id makes no API call. All 13 web flows pass and the route walk is clean. **No box is ticked by this
update.** What a human still has to confirm for these three: the QR payment between two real phones with the Wallet tab open, and
Back after a game on an iPhone and an Android phone (the flows ran on a browser, with the API as the second phone).

