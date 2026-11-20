# Dyce — Test plan (app)

Owner: qa-engineer. App-side layers for this repo; the server side (database, API, engines, determinism in Node) is in `../dyce-backend/docs/TEST_PLAN.md`.

## 1. Principles

- A UI test never replaces a ledger or engine test: money and fairness are proven in the backend first.
- The app's own logic (API client, session, chat merging, live-client reconnect) is tested as pure TypeScript.
- Definition of done (`BUILD_PLAN.md`): spec behaviour incl. edge cases, light + dark, iOS + Android (+ web where relevant), a11y labels, tests, no lint/type errors, reviewer "approve".

## 2. Layers

| Layer                                                                                                              | Tool             | Where                                           | Run with                                   |
| ------------------------------------------------------------------------------------------------------------------ | ---------------- | ----------------------------------------------- | ------------------------------------------ |
| App API client (single-flight refresh), session store, routing                                                     | Jest             | `src/features/auth/auth.test.ts`                | `pnpm test`                                |
| Contact syncing/batching, add-button states                                                                        | Jest             | `src/features/contacts/contacts.test.ts`        | `pnpm test`                                |
| Friend row/tab logic (labels, relative time, mutual-friend text)                                                   | Jest             | `src/features/friends/friends.test.ts`          | `pnpm test`                                |
| Chat logic (runs, day separators, merging, receipts), live-client reconnect/backoff, outbox, typing, cache updates | Jest             | `src/features/chat/*.test.ts`                   | `pnpm test`                                |
| Wallet logic (amount parsing, code/link parsing, expiry wording, history titles, grouping)                         | Jest             | `src/features/wallet/wallet-logic.test.ts`      | `pnpm test`                                |
| Chat tab filters (five tabs, Groups/Bots list nothing, per-tab server list)                                        | Jest             | `src/features/chat/chat-logic.test.ts`          | `pnpm test`                                |
| Profile labels (friends, level, name rules, request-policy options match the server)                               | Jest             | `src/features/profile/profile-logic.test.ts`    | `pnpm test`                                |
| Starter looks: 220 valid and imaged, filters, shuffle, fallbacks                                                   | Jest             | `src/features/avatar/starter-logic.test.ts`     | `pnpm test`                                |
| Block/report logic (blocked-date wording, reasons match the server, report link)                                   | Jest             | `src/features/safety/safety-logic.test.ts`      | `pnpm test`                                |
| Design tokens, a11y contrast                                                                                       | Jest             | `packages/ui/src/tokens.test.ts`                | `pnpm test`                                |
| Determinism (Hermes)                                                                                               | dev screen       | `app/dev/determinism.tsx`                       | open on a device/simulator, must read PASS |
| App bundles                                                                                                        | Metro            | `pnpm export:web`                               | `pnpm export:web`                          |
| Components                                                                                                         | jest-expo + RNTL | app, `packages/ui`                              | added from Phase 1                         |
| E2E user flows                                                                                                     | Maestro          | `e2e/`                                          | `pnpm e2e` (added from Phase 1)            |
| Whole journey against the real API                                                                                 | script           | `../dyce-backend/apps/api/scripts/auth-e2e.mjs` | `pnpm e2e` in dyce-backend                 |

## 3. Maestro flows (to write, Phase 1+)

Phase 1: `onboarding` (phone, OTP, username, avatar, ₦200k grant), `chat` (send/receive realtime), `requests` (stranger lands in Requests, accept/decline), `qr-pay` (**device A creates a QR request, device B scans and pays, paid card appears in chat**), `send-money`, `block-report`.
Phase 2: `pool-loop` (stake, play async, payout), `counter-offer`, `space-whot-reconnect`, `invite-web` (SMS invite, play in browser, join).

### Games, slice 2 (Pool)

- **Backend, real PostgreSQL** (`db/tests/pool-matches.test.ts`, 31 tests, `ledger_check_invariants` after each): create and its refusals (limits, funds, 18+, daily stake and games limits, a game without Pool, a non-friend, blocked), retry and double tap, accept and its refusals, decline / cancel / expiry refunds (lazy and the sweep), every counter path (smaller stake, free, decline, withdraw, invitee can no longer pay, expiry), payout on a win, refund on a draw, a retried final move, pool info.
- **App, unit** (`pool-logic.test.ts`, `pool-card.test.ts`): stake presets inside the limits, counter choices, which daily limit a stake would hit, reset countdown, card wording for each Pool state, the pot line, the results figures for a win, a loss and a draw.
- **By hand, two users (one in the browser, one through the API), dark and light:** age gate, Pool send, counter and accept, play to a result, decline, expiry, low balance with the top-up. Balances and the ledger were checked after each (see STATUS).
- **Maestro** `pool-loop` and `counter-offer`: to write on devices.

### Games, slice 1 (async Free matches)

- **Backend, real PostgreSQL** (`db/tests/matches.test.ts`, 32 tests): catalogue and the dev-only reference game; create (idempotent, friends only, blocks, Pool refused, invite cap); accept / decline / cancel / expiry; moves (illegal, malformed, out of turn, outsider, stale and future versions, idempotent retry, simultaneous moves, block mid-match); hidden information absent from responses and events; the winner decided by the server and the same on both screens; draw; Pig played to a result with the rows checked.
- **App, unit** (`games-logic.test.ts`, plus cases in `chat-logic.test.ts` and `chat-state.test.ts`): card wording for each state, merging a match or card update (never backwards), drawer chips, Pig view parsing and the "who rolled" wording, results copy.
- **By hand, two browser sessions** (light and dark, desktop and phone width): send from the Games drawer, accept from the card, play Pig to a result, same winner and score on both screens, card turns to "You won" / "Results". See STATUS for what was walked through.
- **Maestro** `send-game`, `play-pig` (device A sends, device B accepts, both play to a result): to write with the first real game; `pool-loop` follows Pool.

### Word Hunt (first real game)

- **Backend, real PostgreSQL** (`db/tests/wordhunt.test.ts`, 13 tests; slug pattern in `packages/shared/src/games.test.ts`): the catalogue row; grid hidden until you start; both players start at once; words private until the viewer has finished; same winner and outcome on both views; draw; words dropped by the server (not words, not on the grid, duplicates, case); malformed submit; the round clock (inside the grace, late = zero and the match still ends, measured from each player's own start); idempotent retry; simultaneous submits.
- **App, unit** (`boards/word-hunt-logic.test.ts`, `games-logic.wordhunt.test.ts`): neighbours, drag path rules (no repeats, slide back un-picks), tap rules, hit-testing (gaps and corners ignored), dictionary and preview, scoring by length, clock and spoken clock, saved round parsing, opponent line, view parsing, stage, who moves.
- **By hand, two browser sessions** (light and dark, 430x900 and 360x640): drag, tap + Add word, rejected word, leave and return mid-round, time-up auto-send, same result on both screens, rematch. Still to do on devices: touch drag on iOS and Android, VoiceOver and TalkBack, a scrolled page.

### Cup Pong (first 3D game)

- **Backend, real PostgreSQL** (`db/tests/cuppong.test.ts`, 5 tests): the catalogue row (3D, Free only); ten cups each and no RNG in the view; out-of-turn and out-of-range input refused; three balls a turn then the turn passes, the server records the input it simulated; a whole game played to a result with the same outcome and view for both players.
- **App, unit** (`boards/cup-pong-logic.test.ts`, 19 tests): view parsing, which table is on screen, re-rack rules (from the engine), drag and slider input quantised into the engine's range (never -0 or fractions, always accepted by `validate`), the pre-throw cups reconstructed for a replay (also after a re-rack) and agreeing with the engine, trace sampling, once-per-throw playback bookkeeping, banner and score wording.
- **By hand, two browser sessions** (light and dark, 390x844): drawer tile, send, accept, flick and slider throws, banners, the other player's throw replayed live, a game played to its last round and a result with the same winner on both screens, rematch. The browser pane was hidden, so animation frames did not run: ball motion and frame rate were not seen live (the watchdog carried the flow).
- **Still to do on devices:** frame rate on the 3-4 GB mid-range Android (budget 50 fps), real touch flicks, haptics, VoiceOver/TalkBack on the sliders, Reduce Motion, Hermes/expo-gl rendering of the scene.

### Spaces (Whot!)

- `space-whot-pool-3`: three devices; host creates a Pool space (₦500, 50/30/20), two friends join by code, host starts, play to the end; check each wallet (₦750 / ₦450 / ₦300 of ₦1,500), the Wallet history and the result screen
- `space-whot-reconnect`: turn Wi-Fi off for 20 s mid-game and back on (banner, same cards, still your seat); stay off for 70 s (forfeit, others finish, you are last, Pool: your fee is not returned)
- `space-leave-lobby`: leave a Pool lobby (fee back at once), the host leaves (host passes on), host closes (everyone refunded)
- `space-code`: a wrong code, a full space, a started space, a friends-only space from a stranger, a link `dyce://s/DY-XXXX`

### SMS invites and the guest web game

- **Backend, real PostgreSQL** (`db/tests/invites.test.ts`, 34 tests): hash-only storage and the link shape; refusals (bad number, own number, already on Dyce, unknown or dev game); per-sender day, per-number day, one-per-minute and parallel-send limits; a failed SMS leaves nothing; the landing page (opened, expired, no phone number); the guest round (hidden grid, server scoring, late submit, repeat submit, token holder only, re-issue, token and invite expiry, token of another invite); join-up (friends, chat, card, score kept and the inviter wins or loses against it, idempotent, crash retry, fresh match for an unsent round, wrong number, expired, blocked, several invites).
- **App, unit** (`invites/invite-link.test.ts`, `contacts/contacts.test.ts`): parsing links and the number fragment, dial-code splitting, invitable contacts across 500-number batches.
- **By hand, browser + API (console SMS driver), dark and light, 390x844:** send from New chat (the cooldown and error copy show), open the texted link, landing, Play now, tap and drag words, Done, end card, Get Dyce, the number prefilled on the phone screen, code, username; afterwards the database held one friendship, one active match with the guest's score and the inviter to move, and one game card in the chat.
- **Still to do:** real SMS to a Nigerian number through Termii (DND route), universal and app links on devices (need the association files and store builds), Maestro `invite-web`, VoiceOver/TalkBack and 1.3x text on the landing, end and join screens, a cold install from the store keeping the invite (deferred deep link).

### Social layer (ADR-024)

- **Backend, real PostgreSQL** (`progress.test.ts`, `notifications.test.ts`, `discovery.test.ts`): XP amounts, level carry-over, forfeit and replay pay nothing, the pair and daily caps, Space 60 / 30 / 15, streaks across Lagos days, badges (First Win once, 10 Streak, Pool Shark, Space Host), the API role cannot write progress; every notification trigger (friend request, accepted, withdrawn, blocked; Free and Pool invite, accepted, your turn kept to one row per match, result with XP, counter-offer, decline and expiry refunds; transfer once on retry, request and paid, none to a stranger; space starting); the list (paging, filters, mark read, others' ids ignored, blocked hidden and uncounted); preferences merge; tokens move and cap; the dispatcher (words, route and badge, switched-off group, quiet hours, never-pushed kinds, stale, dead token, retry then give up, two dispatchers send once, realtime event); search (friends from 2 characters, strangers by @username only from 3, wildcards, blocked, ordering, cap of 15, daily limit, no phone fields); profiles (stranger vs friend vs self, money only on self, blocked and disabled look absent, request policy); leaderboards (week boundary, friends vs global, game filter, Pool net, blocked hidden).
- **App, unit:** `notifications-logic.test.ts`, `discovery-logic.test.ts`, `search-logic.test.ts`, `profile-logic.test.ts` (stats).
- **By hand:** see STATUS. **Still to do on devices:** the OS permission prompt and a real push to iOS and Android (needs an EAS project id and the Expo Push API), tap-to-open from a cold start, lock-screen actions (not built), 1.3x text and screen readers on the new screens, Maestro `search.yaml`, `notifications.yaml`.

## 4. Device matrix and budgets

- iOS: latest + latest-2, small phone (SE class) and large. Android: Pixel-class, and a **3–4 GB RAM mid-range device** (performance target for Nigeria).
- Budgets: 3D scenes ≥ 50 fps on the mid-range Android; cold start < 3 s on it; chat list scrolls at 60 fps with 500 conversations; 3G profile (400 kbps / 400 ms RTT): chat usable, game moves resolve < 2 s.
- Dynamic Type 1.3×, Reduce Motion, VoiceOver/TalkBack pass on every new screen, light **and** dark.

## 5. Status

See `docs/STATUS.md`.
