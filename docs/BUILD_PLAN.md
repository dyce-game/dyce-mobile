# Dyce — Build plan and orchestration

The **lead session** (you, in Claude Code, at the repo root) is the tech lead. It never builds big features itself: it plans, delegates to the agents in `.claude/agents/`, runs the `code-reviewer` after each task, keeps this plan's checkboxes current, and asks the human only for decisions marked **[HUMAN]**.

## Team

| Agent                     | Owns                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| platform-architect        | Monorepo, Expo/EAS config, tooling, CI skeleton, ADRs                                       |
| design-system-engineer    | `packages/ui`: tokens, theme, components, TabBar, icons                                     |
| supabase-backend-engineer | Schema, RLS, SQL functions (ledger), cron, seeds, pgTAP                                     |
| auth-onboarding-engineer  | Phone OTP, username, contacts, onboarding, age gate                                         |
| avatar-engineer           | Avatar config, parts pipeline, Avatar component, builder, renders                           |
| messaging-engineer        | Chat tab, Requests, Bots, threads, composer, groups                                         |
| wallet-payments-engineer  | Wallet tab, send, **QR request / scan-to-pay**, history, top-up, disputes UI                |
| game-platform-engineer    | Catalogue, games drawer (video tiles), modes, invites, host shell, async moves, results, XP |
| realtime-spaces-engineer  | Spaces tab, create/join/lobby, Colyseus rooms, quick match                                  |
| game-rules-engineer       | `packages/games` engines, RNG, deterministic physics, dictionary                            |
| games-3d-engineer         | R3F renderers + 3D assets                                                                   |
| games-2d-engineer         | Skia renderers                                                                              |
| party-games-engineer      | Doodle Guess, Charades, Imposter, Werewolf                                                  |
| social-discovery-engineer | People, profiles, friends, search, leaderboards, notifications + push                       |
| growth-invites-engineer   | SMS invites, links, guest web game, deep-link onboarding                                    |
| trust-safety-compliance   | Block/report, spam, anti-cheat, privacy, store + legal                                      |
| qa-engineer               | Test plan, Maestro flows, device matrix, sign-off reports                                   |
| release-engineer          | CI/CD, EAS, environments, monitoring, runbook                                               |
| code-reviewer             | Independent read-only review after every task                                               |

Parallelism rule: run agents in parallel only when their areas don't overlap (see "Parallel lanes" per phase). Each agent works on its own branch `feat/<agent>/<task>`; the lead merges after review.

## Decisions from the human

Settled:

- **Domain: `dyce.games`** (links `https://dyce.games/i|r|u|s/...`, universal links / app links on this domain). Suggested bundle id `games.dyce.app` — confirm when creating store accounts.
- **Avatar art: commission a 3D artist** for the modular rig (brief in `docs/AVATAR_GUIDEBOOK.md` §5).
- **220 AI avatar profiles** (Higgsfield) delivered in `assets/avatar-profiles/` as style bible, interim starter looks and seed/demo accounts (guidebook §7).
- **No C# / Unity.** Avatars and games stay on TypeScript (three.js/R3F); art pipeline in Blender + Python.

Still open **[HUMAN]**:

1. Apple Developer + Google Play accounts; confirm bundle id.
2. Supabase org + region; Fly.io account; Termii + Twilio accounts.
3. Final name for "Word Tiles" and confirmation of "Crazy Cards".
4. Pick and contract the 3D artist (guidebook §5 is the brief).
5. Lawyer review slot for Pools/terms before public launch.

---

## Phase 0 — Foundations (week 1–2)

Lanes (parallel after 0.1): A `platform-architect` → then B `design-system-engineer` ∥ C `supabase-backend-engineer` ∥ D `game-rules-engineer` (contract + rng + `_example` + physics spike).
Done when: app boots on both platforms + web in light/dark with the TabBar and `_dev/ui`; `supabase db reset` seeds demo data; CI green; determinism script passes on Node/Deno/Hermes.

**Kickoff prompt (paste into the lead session):**

```
Read CLAUDE.md and docs/BUILD_PLAN.md Phase 0. Use the platform-architect agent to scaffold the monorepo and tooling exactly as specified. When it reports done, run code-reviewer on its branch and fix blockers by sending them back to platform-architect. Then start, in parallel, design-system-engineer (tokens, theme, all primitives, TabBar, _dev/ui), supabase-backend-engineer (full schema from ARCHITECTURE §3 and WALLET_AND_QR §2/§4, RLS, ledger functions, seeds, pgTAP) and game-rules-engineer (contract, rng, _example engine, physics determinism spike with an ADR). Review each with code-reviewer. Finish with qa-engineer writing docs/TEST_PLAN.md. Tick Phase 0 boxes in BUILD_PLAN.md and summarise what's ready, what's blocked and any [HUMAN] decisions.
```

- [~] Monorepo + tooling + CI — done: pnpm/Turbo, shared/games/ui/api/mobile packages, ESLint + Prettier clean, everything typechecks and builds, API boots (smoke), CI workflow written. Open: game-server (Colyseus) skeleton, CI not yet run on GitHub, EAS dev build not attempted, Sentry/PostHog wiring (needs keys).
- [~] UI tokens, theme, primitives, TabBar — done and seen in a browser in light + dark: tokens (+ contrast tests), theme, Text, Icon set, Glass, TokenButton, ModeBadge, Chip, WalletPill, TabBar, gallery. Open: Sheet, Bubble, ChatRow, GameCard, GameTile, Toast, Banner, AmountPad, QRCard etc.; not yet seen on a native device.
- [x] Schema, ledger functions, DB tests (NestJS + plain Postgres, ADR-004) — 57 tests green. Note: RLS became service-layer authorization (Phase 1); seeds (demo users from avatar-profiles) still to do.
- [~] Engine contract, RNG, physics spike + ADR — done: contract, xoshiro128** (verified against independent reference), `_example` engine, property harness, determinism script (Node). Open: physics determinism spike + ADR, Deno and Hermes runs.
- [x] TEST_PLAN.md

## Phase 1 — Accounts, chat, wallet (week 3–6)

Lanes: `auth-onboarding-engineer` ∥ `avatar-engineer` ∥ `messaging-engineer` ∥ `wallet-payments-engineer`; then `trust-safety-compliance` (block/report/request rules) ∥ `qa-engineer` flows.
Done when: a new user signs up with a phone, builds an avatar, gets ₦200k, finds contacts, chats in realtime, handles Requests, sends money to a friend, **requests money with a QR code and gets paid by a second phone scanning it**, and can block/report. Both themes, both platforms.

**Kickoff prompt:**

```
Phase 1. Read BUILD_PLAN Phase 1. In parallel: auth-onboarding-engineer (full onboarding incl. contacts matching and welcome grant), avatar-engineer (Phase A from docs/AVATAR_GUIDEBOOK.md §9 kickoff: starter looks from assets/avatar-profiles, config v1/v2 schemas, <Avatar>, "Pick a starter look" onboarding step, avatar-renderer skeleton, tools/avatar scaffolds), messaging-engineer (Chat tab with All/Friends/Groups/Requests/Bots, thread, composer without the games button wired, groups, realtime), wallet-payments-engineer (Wallet tab, send, request with QR, scan-to-pay, My code, pay sheet, history, receipts, top-up, money cards in chat). Review each with code-reviewer as it finishes. Then trust-safety-compliance for block/report/request policy and spam filtering, and qa-engineer for Maestro flows onboarding, chat, requests and qr-pay. Give me a sign-off report with fps and cold-start numbers.
```

- [~] Onboarding + OTP + contacts — done and verified in a browser (ADR-007, ADR-008): phone OTP, sessions, username, age gate, welcome grant, resumable onboarding, contacts matching with "On Dyce" suggestions, one-tap add, denied path with find-by-username. Open: notification permission + push token, real SMS delivery (Termii/Twilio untested live), the real contacts permission on devices, Android SMS autofill module, Maestro `onboarding.yaml`.
- [~] Friends list + accept/ignore (social-discovery, ADR-009) — done and verified in a browser, light and dark: All / Requests tabs, Accept, silent Ignore, Cancel, Remove with confirm, Add friends, request-count badge on the avatar. Open: Profile screen (Friends is reached from the avatar until then), push for new requests, block/report UI, Maestro `requests.yaml`, real-device run.
- [~] Profile and Settings (social-discovery-engineer, ADR-015): My profile (follows the design: share, notifications, settings, avatar with edit, level bar, stat cards, locked badges, recent games), Edit profile (name, avatar), Settings ("Who can add and message me" Everyone / Friends of friends / Nobody, enforced by the server; account; Blocked people; theme note; Log out); header avatar opens Profile; verified in a browser, light and dark. Edge flows added (ADR-031): data download, delete account, Help and legal (DRAFT legal copy; review is a human gate). Open: change username, presence switches, Pool limits, a sign-in gate for pushed screens.
- [~] Avatar Phase A (avatar-engineer, ADR-014): 220 starter looks bundled as 256px WebP, `PUT /profile/avatar`, `<Avatar>` / `<UserAvatar>` everywhere a person is shown (chat list, requests, thread, friends, wallet, safety, your own header), "Pick your look" onboarding step with skin-tone and hair filters, shuffle and Skip, and the same screen at `/avatar` for later; verified in a browser, light and dark. Open: render-service skeleton and `tools/avatar` pipeline (need the 3D rig), v2 config and builder (phase B), Edit profile entry point (Profile lane), `expo-image` once avatars come from a server.
- [~] Chat tab, Requests, threads, realtime (messaging-engineer, ADR-010) — 1:1 text chat done and verified in a browser, light and dark: chat list rebuilt to the design (glow background, five underline filters, 78pt rows, Requests cards with Accept / Decline / report-block), thread with optimistic send, Retry, typing, Sent/Read, paging, New chat, live delivery over WebSocket that reconnects by itself. Previously: chat list with unread badges, Requests with Accept/Decline, thread with optimistic send, Retry, typing, Sent/Read, paging, New chat, live delivery over WebSocket that reconnects by itself. **Groups, Bots, message actions, reactions, replies and polls done (2026-11-22, app ADR-032, backend ADR-038):** Groups and Bots filters with real rows, New group, group thread with senders, system lines, polls and a + menu, Group info (rename, add, admin, remove, leave), long-press menu (react, reply, copy, delete for me / everyone within 15 minutes, report), scripted bots with no AI; verified in a browser (dark; light only by computed colours). Open: voice/photos, group photo upload, Space card in a group thread, real bots, games and money cards polish, push, real-device run, Redis for more than one instance, Maestro `chat.yaml` and `requests.yaml`.
- [~] Wallet (wallet-payments-engineer, ADR-012): balance, send with confirm, request by QR code (watches for payment), pay a pasted code or link with the stranger warning, history with filters, receipts, daily top-up pill, money cards in chat (Pay / Show QR), all verified in a browser, light and dark. Open: biometric/PIN confirm, camera scanning, My code, push, disputes, Pool UI, deep-link opening on devices, Maestro `qr-pay.yaml`.
- [~] Block / report (trust-safety-compliance, ADR-013): block (silent, ends the friendship) and unblock, Report with reasons, chat attached and "also block", Blocked people, Chat info, Report/Block on message requests; verified in a browser, light and dark. Open: moderation tooling, outcome notifications, spam filter, Pool hold, Settings screen (Blocked people lives under Friends until it exists).
- [ ] Phase 1 sign-off

## Phase 2 — Game platform + vertical slice (week 7–10)

Lanes: `game-platform-engineer` (drawer, modes, invites, host shell, async moves, results, XP) ∥ `game-rules-engineer` (Word Hunt, Cup Pong, Whot engines) → then `games-2d-engineer` (Word Hunt) ∥ `games-3d-engineer` (Cup Pong, Whot table) ∥ `realtime-spaces-engineer` (Spaces tab, create/join/lobby, CardRoom for Whot) ∥ `growth-invites-engineer` (SMS invites + web guest for Cup Pong & Word Hunt).
Done when: from a chat you can send Word Hunt or Cup Pong in Free or Pool, play async to a result with correct payouts and refunds; create a Whot! space with 4 devices and finish with 50/30/20 payouts; invite a non-Dyce contact by SMS who plays in the browser and joins.

**Kickoff prompt:**

```
Phase 2 vertical slice. game-platform-engineer builds the platform against the _example engine first (drawer with video tiles, mode sheet, create/respond match, host shell, submit-move, results, XP) and writes docs/ADDING_A_GAME.md. In parallel game-rules-engineer writes wordhunt, cuppong and whot engines with tests. When both are reviewed: games-2d-engineer builds Word Hunt, games-3d-engineer builds Cup Pong and the Whot table (cards per design/Card.dc.html), realtime-spaces-engineer builds the Spaces tab, create/join/lobby and the Whot CardRoom with reconnection, growth-invites-engineer builds SMS invites, links and the web guest game. code-reviewer on every branch; qa-engineer adds pool-loop, counter-offer, space-whot-reconnect and invite-web flows. Report payouts verified against the ledger.
```

- [ ] Platform (drawer, modes, host shell, async, results, XP). **Slice 1 done (2026-11-15, ADR-016):** Free-mode async 1v1 against the `_example` (Pig) engine end to end, backend and app, and `docs/ADDING_A_GAME.md`. **Slice 2 done (2026-11-15, ADR-018):** Pool for async 1v1 (stakes, age gate, counter-offer, refunds on decline / cancel / expiry, payout on finish), backend and app. Left: turn timers and forfeit, XP/streaks, video tiles, push, Pool in Spaces.
- [ ] Word Hunt · Cup Pong · Whot! engines
- [ ] Renderers for the three. **Word Hunt done (2026-11-15, app ADR-018, backend ADR-019):** Free async 1v1 from a chat, played to a result in two browser sessions, light and dark. Left for Word Hunt: Pool, turn timer and forfeit, thumbnail video, a Skia renderer, touch testing on devices. **Cup Pong done (2026-11-19, app ADR-020):** async 1v1 Free with a 3D table (React Three Fiber), flick or sliders, prediction with server correction, opponent throw replayed from the stored input, played to a result in two browser sessions, light and dark. Left for Cup Pong: Pool, turn timer and forfeit, thumbnail video, a real-device frame-rate and touch run, a rendered rack preview for re-rack. Whot! renderer not started.
- [ ] Spaces tab, lobby, CardRoom. **Done for Whot! (2026-11-19, backend ADR-022, app ADR-022):** create (Free or Pool, 2 to 4 seats, 50/30/20 and 60/40), join by code or link, lobby with seats and the host's start (host or when full), a 2D Whot! table (replaced by the 3D card table, ADR-027), results with payouts, reconnect after a dropped connection or a game-server restart; played to a result with 3 seats (Pool 50/30/20 paid from a ₦3,000 pot, ledger clean) and with a forfeit, in a browser, light and dark. Left: public Spaces, lobby chat, XP, a 4-device run and real-device touch checks. **3D table done (2026-11-21, ADR-027):** see Phase 3. Quick match: see Phase 3.
- [ ] SMS invites + web guest. **Done for Word Hunt (2026-11-19, ADR-021):** invite from New chat or Find friends, the text carries the link, the link opens a landing page where a non-user plays a server-judged Word Hunt round in the browser (light and dark), "Get Dyce" signs them up with the invited number prefilled, and signing up joins them to the inviter (friends, chat, the game continues with their score kept). Left: Cup Pong for guests, real SMS delivery, store link association (needs store accounts), deferred deep links, the SMS thread in Chat.
- [ ] Phase 2 sign-off

## Phase 3 — Social, party games, notifications (week 11–14)

Lanes: `social-discovery-engineer` (People, profiles, friends, search, leaderboards, notifications + push) ∥ `party-games-engineer` + `game-rules-engineer` (Doodle Guess, Imposter, Werewolf, Charades) with `realtime-spaces-engineer` (PartyRoom, quick match) ∥ `games-3d-engineer` (round table + campfire scenes, Crazy Cards).

- [~] People, profiles, friends, search, leaderboards (social-discovery, ADR-024): global search, other people's profiles, weekly leaderboards, badges screen, XP / levels / streaks / badges from finished matches, real stats on My profile; verified in a browser, light and dark. Open: opt-outs and "Near you", devices, Maestro `search.yaml`
- [~] Push notifications with actions + deep links (ADR-024): in-app Notifications list with unread counts, per-type switches and quiet hours, permission screen, token registration, dispatcher behind a driver interface (console / Expo), tap routing. Open: real delivery on devices (never exercised), lock-screen actions, streak-at-risk job
- [~] Doodle Guess, Imposter, Werewolf, Charades: **room done (2026-11-20, backend ADR-025):** one generic party room with ticks, a start gate, per-seat views, table talk, a streamed Doodle canvas, reconnect, forfeit with skip-ahead, persistence and settlement through the SQL functions; Spaces create flow and a debug-grade table in the app; a protocol document for the screens (`../dyce-backend/docs/PARTY_ROOM_PROTOCOL.md`). Played to results by bots over real Colyseus on PostgreSQL and over real processes (Imposter and Werewolf; Doodle and Charades in the integration suite). **Screens done (2026-11-21, ADR-026):** the four real party screens with the drawing canvas (react-native-svg), role reveal, voting and night actions, table talk, results and payouts, tilt for Charades; verified in a browser against the real servers. **Left:** 3D art for the round table, campfire and cards, word-pack art, a real-device run (tilt, accessibility, low-end Android), spectating, bots.
- [~] Crazy Cards, quick match: **Crazy Cards runs in the card room (2 to 4 seats)**, Free and Pool, verified like Whot!; **quick match** (Whot! and Crazy Cards, 1 v 1, Free or Pool: queue, level gap, blocks, accept window, stakes at the match, refunds) in the API and a first screen in the app. **Crazy Cards table done (2026-11-21, ADR-027):** one 3D card table for Crazy Cards and Whot! (round table, fanned hand, deal, play, draw, shuffle, special-card feedback, results with payouts, list and flat fallbacks), a full game of each played to a result in a browser, light and dark. **Left:** a real-device run of the card table (frame rate, touch, VoiceOver/TalkBack, Reduce Motion), card sounds, 5 and 6 seats in the create flow, quick match for async games, push for "match found", collusion signals.
- [ ] Phase 3 sign-off

## Phase 4 — Rest of the catalogue (week 15–20)

Engines first (`game-rules-engineer`), then renderers in parallel: 3D — 8 Ball, Darts, Basketball, Archery, Sea Battle, Ayo/Mancala, Ludo (+ LudoRoom for 3–4p); 2D — Chess, Checkers, Word Tiles, Anagrams, Mini Golf, Filler, Dots & Boxes, Tanks. Bots for Coach Cue, Quiz Mama, Word Hunt Trainer, Admiral Ade. Avatar Phase B/C when the artist delivers (live 3D builder, render service, 3D busts at tables) — `avatar-engineer` with the guidebook §9 prompt. Thumbnail videos for all 23.

Platform for the renderers (done, ADR-028 and backend ADR-036): all 15 new async engines are registered on the match service with disabled `games` rows and per-game Pool minimums; the app has a board registry with the rules copy for all 23 games and "Coming soon" handling. Each renderer session follows `docs/ADDING_A_GAME.md` (board, art, parser, one entry file, one `0021_enable_<slug>.sql`) and edits no shared file. Not done on the platform side: Ludo 3-4 live room (own slug, backend BACKLOG), async turn clocks, a per-match variant option (Kalah, salvo, Around the clock).

- [x] 2D renderers done, enabled and played to a result in a browser: Chess, Checkers, Dots & Boxes, Filler (games-2d-engineer, 2026-11-22; `0021_enable_<slug>.sql` written and applied to the dev database; Word Tiles, Anagrams, Mini Golf and Tanks follow in their own lines)
- [x] 2D renderers done, enabled and played to a result in a browser: Word Tiles, Anagrams, Mini Golf, Tanks (games-2d-engineer, 2026-11-22; `0021_enable_<slug>.sql` written and applied to the dev database; react-native-svg instead of Skia, ADR-029). All eight 2D games of Phase 4 are now done.
- [x] 3D sports renderers done, enabled and played to a result in a browser with two origins: 8 Ball, Darts, Basketball, Archery (games-3d-engineer, 2026-11-22; React Three Fiber on the shared `boards/r3f-common/` kit, ADR-030; `0021_enable_<slug>.sql` written and applied to the dev database). Sea Battle, Ayo and Ludo (the other 3D games) are not started.
- [x] 3D board renderers done, enabled and played to a result in a browser with two origins: Sea Battle, Ayo / Mancala, Ludo (games-3d-engineer, 2026-11-22; shared `boards/board3d/` kit, ADR-033; `0021_enable_<slug>.sql` written and applied to the dev database). Mancala needs a per-match option and the live 3 to 4 player Ludo room is a new slug: both in docs/BACKLOG.md. All seven 3D games of Phase 4 now have boards.
- [x] Engines (15 async + earlier) wired to the match service - [ ] 3D renderers (7) - [ ] 2D renderers (the other 4) - [ ] Bots - [ ] Thumbnails - [ ] Phase 4 sign-off

## Phase 5 — Hardening and launch (week 21–24)

`trust-safety-compliance` (anti-cheat, integrity gate, privacy export/delete, store forms, legal drafts) ∥ `release-engineer` (prod pipelines, monitoring, runbook, store listings) ∥ `qa-engineer` (full regression on device matrix, 3G tests, load test with realtime-spaces-engineer) ∥ performance pass by `games-3d-engineer` / `messaging-engineer`.
Launch gates: crash-free ≥ 99.5% in beta, ledger invariant clean for 14 days, all Maestro flows green, legal review done **[HUMAN]**, store approvals.

- [x] Anti-cheat + integrity (server side, backend ADR-039; the app's device token and the store accounts are [HUMAN]) - [ ] Privacy + deletion - [ ] Monitoring + runbook (built 2026-11-23, ADR-034 and backend ADR-040: CI, EAS, images, probes, Sentry and PostHog behind flags, the nightly ledger check, `docs/RUNBOOK.md`, `docs/MONITORING.md`, `docs/RELEASE_CHECKLIST.md`; **left open until the accounts, the alert route and the rehearsals exist: see RELEASE_CHECKLIST**) - [ ] Store submissions (draft copy and privacy answers in `docs/STORE_LISTING.md` and `docs/STORE_PRIVACY_ANSWERS.md`; needs the accounts, icons, screenshots and a reviewer account) - [ ] Launch

---

## QA notes (qa-engineer, 2026-11-23)

Sign-off reports for Phases 1 to 4 are in `docs/signoff/` (`PHASE-1.md` to `PHASE-4.md`): per phase the "done when" criteria, the evidence in tests and STATUS, what was shown by hand, what QA ran, and what a human must confirm. **No sign-off box above was ticked by QA.** What the reports say in one line each:

- **Phase 1:** everything but "both platforms" is proven or shown on web; **not met or not proven:** the camera scan of a QR (the second phone pays by code), a real SMS, push, and the avatar builder (starter looks only). **BUG-1:** the Wallet shows the old balance after a QR request is paid.
- **Phase 2:** Free Word Hunt, the Pool loop (on the reference game Pig only), a Whot space and the guest invite are shown; **Pool for Word Hunt and Cup Pong now exists (2026-11-24, backend ADR-041: played to settlement in a database test and in a browser with two signed-in users, balances checked)**, no 4-device run, no real SMS. **BUG-0** puts async moves at risk.
- **Phase 3:** server logic, the party rooms, quick match and the card table are proven or shown; push has never run on a device, the 3D round table and campfire are not built, nothing was run on a phone.
- **Phase 4:** engines are proven; all 15 boards were played by hand on web in Free; frame rate, touch, Hermes determinism, screen readers and Pool are unverified; Bots and thumbnails are not built. The Phase 4 checkbox line above is stale next to the per-renderer lines.
- **BUG-0 (blocker, fixed 2026-11-23, `docs/qa/BUGS.md`; probe re-run at 20, 40 and 100 moves, all answered):** the API stops answering when about 20 game moves are in flight at once (`apps/api/src/matches/matches.service.ts` takes a second pool connection inside a move transaction). Re-run `scripts/load/pool-deadlock-probe.mjs` after the fix.
- Phase 5's QA lane ("full regression on the device matrix, 3G tests, load test") has its plan, scripts and first numbers; the device and 3G runs and the staging load run are still to do (`docs/qa/DEVICE_MATRIX.md`, `scripts/load/RESULTS.md`).

## Definition of done (every task)

Spec behaviour implemented incl. edge cases · light + dark · iOS + Android (+ web where relevant) · accessibility labels · tests (unit; pgTAP for SQL; Maestro for user flows) · no lint/type errors · code-reviewer verdict "approve" · docs/ADRs updated · analytics events added.

## Analytics events (PostHog)

signup_started/completed (step), contacts_permission (granted/denied), avatar_saved, chat_opened, message_sent (kind), request_received/accepted/declined, game_drawer_opened, game_sent (slug, mode, stake band), match_accepted/countered/expired, match_finished (slug, mode, result), space_created/joined/started, quick_match_started/matched, money_sent, qr_request_created, qr_scanned (valid/invalid), qr_paid, topup_claimed, invite_sent/opened/guest_played/converted, push_opened (type), report_submitted, block.

## Working agreements for the lead session

- Start every session by reading this file and `docs/DECISIONS.md`; continue the first unchecked item.
- One agent per task; give it the exact scope, the files/screens to read, and the acceptance criteria from its agent file.
- After each task: `code-reviewer` → send blockers back to the same agent → merge → tick the box.
- Anything that touches money, game outcomes or privacy also gets a second review pass focused only on that.
- If two agents need the same file, sequence them; don't run them in parallel.
- Keep a running `docs/STATUS.md` (date, done, in progress, blocked, next).

## Game gaps closed (2026-11-24, backend ADR-041 to ADR-043)

- [x] Pool for every async game that is safe (16 games), the 24 hour Pool turn clock with forfeit and refund rules, collusion hooks on every settlement; Word Tiles and Darts' Around the clock stay Free (reasons in ADR-041).
- [x] Per-match options: Mancala (Kalah) on the Ayo board, Darts Around the clock, Sea Battle salvo; the mode sheet's "Rules" row and the card's variant name.
- [x] Ludo room for 3 to 4 players (`ludo-room`, Create a space, Pool at ₦500 a seat).
- [x] Streak lost and the streak saver (design StreakLost) with the `streak_lost` notification.
- [ ] Needs a human: the money rules above, the saver rules, a 4-device Ludo run.

## Email sign-in (2026-11-24, backend ADR-044)

- [x] "Sign up with email" and "Log in with email" on the Welcome screen, "Use email instead" on the phone screen, one emailed six-digit code for both (the address is never stored in the clear), Resend as the provider behind a switch (`EMAIL_AUTH_ENABLED`).
- [x] Add an email to a phone account, or a phone to an email account, from Settings > Account.
- [ ] Needs a human: a Resend account with a verified domain and a real inbox test (`SETUP_GUIDE.md` section 4, RELEASE_CHECKLIST H12); bounce webhooks (BACKLOG).
