# Phase 2 sign-off report: game platform and vertical slice

qa-engineer, 2026-11-23. Source of the criteria: `docs/BUILD_PLAN.md` Phase 2. **No box is ticked by this report.** Marks as in
`README.md` (Proven, By hand, Not shown, Unverified). "Flow" means a Maestro flow in `e2e/` executed on the web build by our
runner, not by Maestro and not on a device.

## 1. The "done when" line

> from a chat you can send **Word Hunt or Cup Pong in Free or Pool**, play async to a result with correct payouts and refunds;
> create a Whot! space with **4 devices** and finish with 50/30/20 payouts; invite a non-Dyce contact by SMS who plays in the
> browser and joins.

| # | Criterion | Evidence found | Mark |
| - | --------- | -------------- | ---- |
| 1 | Send Word Hunt from a chat, **Free**, play async to a result | Backend `wordhunt.test.ts` (13), `matches.test.ts` (32: create, accept, decline, moves, stale and out-of-turn, simultaneous moves, hidden information, winner decided by the server). App `word-hunt-logic.test.ts`, `games-logic.wordhunt.test.ts`. **Flow 05**: send from the Games drawer, Ben accepts and plays (API), "Your turn", Alice plays, the same result on both sides ("It's a draw", `You 0 · Ben QA 0`), "Free play: nothing was won or lost in Dyce Cash", wallet unchanged. By hand in two browsers (STATUS). | **Proven** (on web) |
| 2 | Same for Cup Pong, Free | Backend `cuppong.test.ts` (5), app `cup-pong-logic.test.ts` (19). By hand in two browsers, light and dark (ADR-020); the browser pane was hidden, so ball motion and frame rate were not seen. **No flow** (needs WebGL and flicks). | **By hand.** **Unverified:** frame rate, real flicks, haptics, expo-gl |
| 3 | **Pool** for Word Hunt and for Cup Pong | **Not available.** The dev catalogue marks only the reference game Pig (`_example`) as supporting Pool; for Word Hunt the mode sheet says "Pool: Not for this game yet" (flow 05 asserts it), Cup Pong is Free only, STATUS lists Pool for both as "left". | **Not met for the named games** |
| 4 | Pool works end to end (proved on the reference game) | Backend `pool-matches.test.ts` (31 tests, `ledger_check_invariants` after each): create and refusals, retry, accept, decline, cancel, expiry refunds (lazy and the sweep), every counter path, payout on a win, refund on a draw. App `pool-logic.test.ts`, `pool-card.test.ts`. **Flow 06** (Pig): lock ₦500 each, both wallets read from the API: Alice −₦500 on send, Ben −₦500 on accept, Alice resigns, **Ben +₦500 net, Alice −₦500, nothing left locked**, result screen "Ben QA took the pool", "−₦500", "New balance ₦199,500". **Flow 06b**: ₦1,000 invite, counter ₦500, accept, ₦500 locked on both sides. | **Proven for Pig on web.** Refund paths (decline, expiry, cancel): backend tests only, no flow |
| 5 | Correct payouts and refunds | The ledger is double entry, idempotent and checked by `ledger_check_invariants` in the Pool and Space suites. QA did not run a money-concurrency load test (the load scripts use Free matches). | **Proven by the backend suites**; not re-run under load |
| 6 | Whot! space, 50/30/20, **4 devices** | Backend `spaces` tests, the real-process `live-e2e.mjs` (Pool Crazy Cards 3 seats 50/30/20 paid from the pot, ledger clean; Pool Imposter), by hand: Whot! 3 seats Pool 50/30/20 from a ₦3,000 pot and a forfeit, in a browser (STATUS). **Flow 09**: create (Free, 2 seats), Ben joins by code, the lobby updates live, host starts, the 3D table opens. **Load**: 50 seats in 17 Whot rooms (2 to 4 seats), all connected over real Colyseus sockets, 17 of 17 played to a finish, 1,300 moves, **0 refused** (`RESULTS.md` section 5); 100 quick-match players into 50 rooms. | **Proven for 2 to 3 seats and for rooms with bots (Free).** **Not shown: a 4-device run; a 4-seat Pool payout by a person;** reconnect (Wi-Fi off 20 s and 70 s) on a device |
| 7 | Invite a non-Dyce contact by SMS; plays in the browser; joins | Backend `invites.test.ts` (34: hashes only, limits, a failed SMS leaves nothing, the guest round with server scoring, join-up keeps the score). App `invite-link.test.ts`. By hand with the console SMS driver: send, open the link, play, "Get Dyce", number prefilled, sign-up, one friendship, one match, one card. The route walk loads `/i/<token>`, `/play`, `/join` in light and dark. **No flow** (`invite-web` is not written). | **By hand.** **Unverified:** a real SMS, universal and app links on devices, deferred deep link, the guest web game on a phone browser and on 3G |

## 2. Open items recorded in BUILD_PLAN for Phase 2

Turn timers and forfeit for async matches; XP and streaks (built later, see Phase 3); video thumbnails; push; **Pool in Spaces
UI polish**; Word Hunt: Pool, a Skia renderer, touch testing on devices; Cup Pong: Pool, a real-device frame-rate and touch run, a rendered
rack preview; public Spaces, lobby chat, XP, a 4-device run and real-device touch checks; SMS: Cup Pong for guests, real SMS delivery,
store link association (needs store accounts), deferred deep links, the SMS thread in Chat.

## 3. Verified here by QA (2026-11-23)

- Flows **05, 06, 06b, 09** executed on web (pass); linted clean.
- The concurrency invariant (`match-concurrency.mjs`): 75 contended rounds, exactly one move applied per version, 0 violations.
- Quick match: 100 strangers into 50 pairs, symmetric, nobody twice, 0 errors.
- Whot: 50 seats in 17 rooms, bots, 17 of 17 finished at full speed; 16 of 17 with 1.5 s think time at 400 s (**one room was
  still playing: not investigated**).
- Route walk: the game screens, `/g/<id>`, `/g/<id>/result`, `/space/<id>` and the guest routes in both themes.

## 4. Bugs found that touch Phase 2 (`docs/qa/BUGS.md`)

- **BUG-0 (blocker)**: with about 20 game moves in flight at once the API's database pool deadlocks and the whole API stops
  answering until restarted. Cause in `MatchesService.submitMove` (a second pool connection taken inside a transaction).
  Reproduced deterministically. **The phase's core mechanic, async moves, is exposed to it.**
- **BUG-2 (major)**: after a game ends, Back from the thread returns to the game screens, not the chat list. `e2e/known-bugs/bug-2-...yaml`.
- **BUG-3 (minor)**: `/games/issue` opened without a `matchId` calls `GET /matches/undefined` (422).
- Minor: the resign confirm button has the same label as the game-menu row behind it (an automated or screen-reader user meets two "Resign"s).

## 5. Unverified: what a human must confirm before the box is ticked

1. **Decide what the criterion means for Pool**: the plan says Word Hunt and Cup Pong in Pool. Either build and prove Pool for
   them (a Pool match of each played through settlement, which also unlocks `supports_pool`), or reword the criterion to "Free for
   the two, Pool proved on the reference game".
2. **Fix BUG-0** and re-run `scripts/load/pool-deadlock-probe.mjs` at 20, 40 and 100 moves.
3. A **4-device Whot! space** in Pool with 50/30/20 (check each wallet and the history; also with 3 seats and with the host
   leaving), and `space-whot-reconnect` (Wi-Fi off 20 s: same cards, same seat; off 70 s: forfeit, Pool fee not returned).
4. **Real people on phones play Word Hunt and Cup Pong** async to a result: touch drag on iOS and Android, VoiceOver and TalkBack,
   Cup Pong's frame rate on the 3 to 4 GB Android (budget 50 fps), flicks and haptics.
5. **A real SMS invite** to a Nigerian number (Termii DND route), the link on a phone browser, the guest round, "Get Dyce",
   the number prefilled, the join; universal and app links once the store accounts exist.
6. Pool **refunds** with real timing: decline, cancel, expiry (24 h) and the 5-minute sweep, watched in the Wallet history.
7. **Money rules review with a lawyer** (Pool stakes, the age gate, dispute window, limits).
8. fps and cold start for the phase's screens (`docs/qa/DEVICE_MATRIX.md`).
