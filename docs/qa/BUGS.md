# Bugs found by the QA work (2026-11-23)

None of these is fixed from here: they are in other lanes' code. Each has a way to reproduce it. Severity as in
`REGRESSION.md` section 5. The app and API were at the working tree of 2026-11-23 (uncommitted work of several sessions).

## BUG-0 (blocker, **FIXED 2026-11-23**): the API stops answering when about 20 game moves are in flight at once

- **Fix:** `ChatService.playablePeer` takes an optional `db` and `submitMove` passes the transaction's own connection, so a move never asks the pool for a second one. The pool also has a 10 s acquire timeout (`db/db.module.ts`) so a starved pool fails requests instead of hanging every one. I scanned every `withTx` callback in `apps/*/src`: this was the only one that took a second connection. A regression test (`db/tests/matches.test.ts`, "many moves at once") runs 12 simultaneous moves on a pool of 4; it fails without the fix and passes with it. `scripts/load/pool-deadlock-probe.mjs` against the fixed API: 20, 40 and 100 simultaneous moves all answered ("The API answered everything"; results in `scripts/load/results/pool-deadlock-probe-2026-11-23T15-*.json`). Not re-measured on staging or under a real mix of traffic.

- **Where:** `dyce-backend/apps/api/src/matches/matches.service.ts` `submitMove`, line `if (row.conversation_id) await
  this.chat.playablePeer(userId, row.conversation_id);` inside `withTx(this.pool, async (c) => { ... })`.
  `ChatService.playablePeer` (`chat/messages.service.ts`) uses `this.pool`, not the transaction's connection `c`. The pool is
  `new pg.Pool({ max: 20 })` (`db/db.module.ts`).
- **What happens:** each move holds one connection (and the match row, `FOR UPDATE`) and asks the pool for a second. With 20 moves
  in flight every connection is held by a transaction that is waiting for another, so none ever finishes. The API then stops
  answering every request that needs the database, **including `/health`**, until it is restarted. No error is logged and nothing recovers.
- **Measured:** 8, 12 and 16 simultaneous moves on different matches: all 200 in 0.3 to 0.4 s. **20: all 20 time out, `/health` has no
  answer. 40 over 20 matches: all 40 time out; `pg_stat_activity` shows 20 of 20 connections `idle in transaction`** (the last statement
  of each is the players `SELECT mp.user_id ...` in `lock()`). Earlier with several moves on the SAME match: 2 backends idle in
  transaction holding the row lock, 18 active waiting on it (`Lock: tuple / transactionid`). `scripts/load/results/pool-deadlock-probe-*.json`.
- **Reproduce:** `node scripts/stack/up.mjs`, then `node scripts/load/pool-deadlock-probe.mjs --moves 20 --matches 20` (leaves the API
  wedged: restart the stack).
- **Likely fix:** do the `playablePeer` check with the transaction's client (`seat(c, ...)` already takes one), or before `withTx`;
  audit every other `withTx` callback that calls a service using `this.pool` (resign, accept, counter, spaces, quick match, wallet);
  add a pool acquire timeout so a starved pool errors instead of hanging; consider a larger pool. Add a Jest test that fires more
  concurrent moves than the pool size and asserts they all complete.
- **Why the tests missed it:** every unit and database test sends one request at a time.
- A longer write-up is in the shared notes folder (`qa-engineer-critical-pool-deadlock.md`).

## BUG-1 (major): the Wallet tab keeps the old balance after your QR request is paid

- **Where:** the app. The Request screen (`wallet/request/[code]`) polls the request every 3 s and turns "Paid by Ben QA", but
  nothing invalidates the wallet query (`queryKeys.wallet`, `useWalletQuery` refetches only on mount) when the request flips to
  paid, and the Wallet tab stays mounted under the screens pushed over it. The chat card did update (the realtime message event), the
  wallet did not.
- **What the person sees:** "Paid by Ben QA" on the request screen, **Done**, and then Wallet still says ₦200k and the activity list has
  no new row, with the same state ten seconds later. History (a different query, refetched on open) shows the payment. The server is right:
  `GET /wallet` returns the new balance.
- **Reproduce:** `node scripts/e2e/web-runner.mjs e2e/known-bugs/bug-1-wallet-stale-after-qr-paid.yaml` (fails at `Balance ₦202,000`).
- **Fix idea:** `refreshMoney(client)` (already in `use-wallet.ts`) when `useRequestQuery` sees `status` change to `paid`, and when a
  money card arrives over the socket.
- The headline criterion of Phase 1 ("gets paid by a second phone"): the money moves, the display lies.

## BUG-2 (major): Back from a thread after a game returns to the game screens

- **Where:** `ThreadScreen.tsx` `goBack` is `router.back()` when there is history. After a game ends, the result screen's "Back to
  chat" does `router.replace('/c/<id>')`, so the history is thread, game host, thread. **Observed:** after "Back to chats" the
  screen is still a thread (the URL changes to a `/c/<id>` again) and the chat list is not reached. **Hypothesis, not confirmed:**
  Back goes to the game host entry, which redirects to the thread, so the person goes round a loop.
- **Reproduce:** `node scripts/e2e/web-runner.mjs e2e/known-bugs/bug-2-back-after-game.yaml` (fails: still on the thread after "Back to
  chats"). Seen on web; a native stack that keeps the earlier entries is expected to behave the same: confirm on a device.
- **Fix idea:** leave the game flow with `router.dismissTo('/c/<id>')` / pop to the existing thread instead of pushing a new one, or have
  `goBack` go to the chat list when the previous entry is a game route.

## BUG-3 (minor): `/games/issue` without a `matchId` calls `GET /matches/undefined`

- Opening `/games/issue` directly (or any link missing the parameter) sends `GET /matches/undefined`, which answers 422 and puts an error
  in the console; the screen should not call the API without an id. Found by the route walk (`/games/issue`, light and dark).

## Smaller findings and things to know

- **Duplicate labels** make flows and screen-reader navigation ambiguous: `Request ₦2,000` (amount chip and submit button), `Resign`
  (menu row and confirm button), `Wallet` (tab and heading). See `e2e/README.md` section 7.
- **TextField labels are not focusable**: tapping "Phone" or "Username" does not focus the input (on web a real `<label for>` or
  `accessibilityLabelledBy` would fix it and help screen readers).
- **`allowFontScaling={false}` on 17 board glyph texts** and a `maxFontSizeMultiplier` of 1.15 in `PartyChrome.tsx:173`, against the "Dynamic
  Type up to 1.3x" rule: `docs/qa/ACCESSIBILITY.md` section 1.
- **A login code is limited to one per number every 30 s**: logging out and back in as the same person within 30 s shows "Please
  wait Ns" and no way forward until it passes. Reasonable as a rule, but check the copy and the Resend timing on devices.
- **Web default country is "US +1"** in a headless en-US browser (a device in Nigeria is expected to pick NG from its locale; the
  guest web game on a Nigerian phone browser should be checked).
- **One Whot room out of 17 was still being played at 400 s** with 1.5 s bots (`scripts/load/RESULTS.md` section 5): a long game or a
  stuck room, not determined.
- The first full route walk showed two 401s on `/space/new` (dark) that did not reproduce in three later loads: treated as a flake of
  the walker (a session swap racing a page load), not an app bug.
- **Test hygiene on the backend** recorded by other sessions and not re-verified here: `db/tests/game-catalogue.test.ts` fails two
  cases once any `0021_enable_*` migration is applied; `db/tests/invites.test.ts` has a flaky case (a random UUID containing "234").
- **The production launch blockers** found by the release work (STATUS): no way for a store reviewer to sign in (`OTP_TEST_CODE` is refused in
  production), no sign-up age gate, only about 6 of 35 analytics events are called.
