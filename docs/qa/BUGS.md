# Bugs found by the QA work (2026-11-23)

BUG-0 to BUG-3 are fixed (see each). The rest of the list is open. Each has a way to reproduce it. Severity as in
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

## BUG-1 (major, **FIXED 2026-11-24**): the Wallet tab keeps the old balance after your QR request is paid

- **Fix:** `useRequestQuery` (`wallet/use-wallet.ts`) calls `refreshMoney(client)` when the request it is watching turns `paid`
  (`requestJustPaid(previous, current)` in `wallet-logic.ts`, so the first load of an already-paid request does not refresh), and
  `applyRealtimeEvent` (`chat/realtime-cache.ts`) invalidates the wallet queries when a `money_sent` or `money_request` message
  arrives over the socket (only the wallet: the event itself already updates the thread and the chat list, so it does not call the
  whole `refreshMoney`).
- **Evidence:** unit tests `requestJustPaid` (`wallet-logic.test.ts`) and "refreshes the wallet when a money card arrives, and only
  then" (`chat-state.test.ts`) failed before the change and pass; flow `e2e/10-wallet-balance-after-qr-paid.yaml` (the old
  `known-bugs/bug-1` flow, moved) was recorded failing at `Balance ₦202,000` by QA on 2026-11-23 (not re-run unfixed here) and **passes** on the web runner (the balance reads
  ₦202,000 right after Done); flow 04 (which also pays a code) passes.
- **Not checked:** on a device, or with two real phones. The wallet also refreshes on mount and when the app returns, as before.
- **Original report.** The Request screen (`wallet/request/[code]`) polls the request every 3 s and turns "Paid by Ben QA", but
  nothing invalidated the wallet query (`queryKeys.wallet`, `useWalletQuery` refetches only on mount) and the Wallet tab stays mounted
  under the screens pushed over it. The chat card did update (the realtime message event), the wallet did not. After **Done**, Wallet
  said ₦200k and the activity list had no new row. The server was right: `GET /wallet` returned the new balance.

## BUG-2 (major, **FIXED 2026-11-24**): Back from a thread after a game returns to the game screens

- **Cause (confirmed):** the result screen's "Back to chat" did `router.replace('/c/<id>')`, which swaps the result for a **second copy**
  of the thread. The history was chat list, thread, thread, so Back from the second thread showed the first, a thread again (the next
  Back would reach the list). The loop through the game host was only a hypothesis and was not what happens.
- **Fix:** `GameResultScreen` and `PoolIssueScreen` leave with `router.dismissTo('/c/<id>')` (pop to the thread the game was
  started from) instead of `replace`. Back from that thread goes to wherever the person came from (chat list, search, a profile).
  The host's own `goBack` was already `router.back()` and is unchanged.
- **Evidence:** flow `e2e/11-back-after-game.yaml` (the old `known-bugs/bug-2` flow, moved). With the old `router.replace` put back it
  **fails** on the web runner (still on the thread after "Back to chats": "Ben QA | FREE | Pig | Ben QA won"); with `dismissTo` it
  **passes** (chat list, "New in Chat"). Flows 05, 06 and 06b (which leave through the same screens) pass.
- **Not checked:** on a device (a native stack should behave as the web one: confirm). A game opened from a link with no thread in
  the history: `dismissTo` then opens the thread as a new screen, which is the old behaviour.

## BUG-3 (minor, **FIXED 2026-11-24**): `/games/issue` without a `matchId` calls `GET /matches/undefined`

- **Fix:** `useMatchQuery` only runs with an id (`canFetchMatch` in `games/games-logic.ts`: not empty, not `undefined`), so any screen
  opened by a link missing the parameter makes no API call.
- **Evidence:** unit test `canFetchMatch`; the route walk of 2026-11-24 (`ROUTE_WALK_2026-11-24.md`) loads `/games/issue` in light and
  dark with **0** events (the 2026-11-23 walk had a 422 and a console error on each).
- The screen itself (what it shows with no match) was not changed.

## Smaller findings and things to know

- **Duplicate labels** make flows and screen-reader navigation ambiguous. **Fixed 2026-11-24 for `Request ₦2,000`:** the amount chips
  now read `Amount ₦2,000` and only the submit button reads `Request ₦2,000` (flows 04 and 10 no longer need an `index`). **Still open:**
  `Resign` (the menu row of a Free game and its confirm button share the label, `games-edge-logic.ts` `resignCopy`: a copy decision for
  the games lane) and `Wallet` (tab and heading). See `e2e/README.md` section 7.
- **TextField labels are not focusable** (**fixed 2026-11-24**): tapping the visible "Phone", "Username" ... label now focuses the input
  (`packages/ui/src/primitives/TextField.tsx`). The input already carried the label for screen readers, so the tap target is hidden from
  them and from the tab order rather than read twice. Checked by the web flows only (they tap placeholders): not with a screen reader.
- **Controls without an accessible name:** the QA audits found **none** (static audit: 0 touchables, 0 images; route walk: 0 unlabelled
  controls on 120 page loads), so there was nothing of that kind to fix. What they did list, and what changed: `maxFontSizeMultiplier`
  1.15 on the party countdown ring (`PartyChrome.tsx:173`) is now `MAX_FONT_SCALE` (1.3); the static audit reports 0 below 1.3.
- **`allowFontScaling={false}` on 17 board glyph texts** (unchanged, deliberate: text inside a fixed-size tile of a drawing; needs the
  device check in `docs/qa/ACCESSIBILITY.md` section 4).
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
