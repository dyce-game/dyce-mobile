# Dyce — Build plan and orchestration

The **lead session** (you, in Claude Code, at the repo root) is the tech lead. It never builds big features itself: it plans, delegates to the agents in `.claude/agents/`, runs the `code-reviewer` after each task, keeps this plan's checkboxes current, and asks the human only for decisions marked **[HUMAN]**.

## Team
| Agent | Owns |
|---|---|
| platform-architect | Monorepo, Expo/EAS config, tooling, CI skeleton, ADRs |
| design-system-engineer | `packages/ui`: tokens, theme, components, TabBar, icons |
| supabase-backend-engineer | Schema, RLS, SQL functions (ledger), cron, seeds, pgTAP |
| auth-onboarding-engineer | Phone OTP, username, contacts, onboarding, age gate |
| avatar-engineer | Avatar config, parts pipeline, Avatar component, builder, renders |
| messaging-engineer | Chat tab, Requests, Bots, threads, composer, groups |
| wallet-payments-engineer | Wallet tab, send, **QR request / scan-to-pay**, history, top-up, disputes UI |
| game-platform-engineer | Catalogue, games drawer (video tiles), modes, invites, host shell, async moves, results, XP |
| realtime-spaces-engineer | Spaces tab, create/join/lobby, Colyseus rooms, quick match |
| game-rules-engineer | `packages/games` engines, RNG, deterministic physics, dictionary |
| games-3d-engineer | R3F renderers + 3D assets |
| games-2d-engineer | Skia renderers |
| party-games-engineer | Doodle Guess, Charades, Imposter, Werewolf |
| social-discovery-engineer | People, profiles, friends, search, leaderboards, notifications + push |
| growth-invites-engineer | SMS invites, links, guest web game, deep-link onboarding |
| trust-safety-compliance | Block/report, spam, anti-cheat, privacy, store + legal |
| qa-engineer | Test plan, Maestro flows, device matrix, sign-off reports |
| release-engineer | CI/CD, EAS, environments, monitoring, runbook |
| code-reviewer | Independent read-only review after every task |

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
- [ ] Avatar Phase A: 220 starter looks, <Avatar>, render-service skeleton (AVATAR_GUIDEBOOK §8)
- [~] Chat tab, Requests, threads, realtime (messaging-engineer, ADR-010) — 1:1 text chat done and verified in a browser, light and dark: chat list with unread badges, Requests with Accept/Decline, thread with optimistic send, Retry, typing, Sent/Read, paging, New chat, live delivery over WebSocket that reconnects by itself. Open: groups, Bots, voice/photos/replies/reactions/deletes, games and money cards, push, real-device run, Redis for more than one instance, Maestro `chat.yaml` and `requests.yaml`.
- [~] Wallet (wallet-payments-engineer, ADR-012): balance, send with confirm, request by QR code (watches for payment), pay a pasted code or link with the stranger warning, history with filters, receipts, daily top-up pill, money cards in chat (Pay / Show QR), all verified in a browser, light and dark. Open: biometric/PIN confirm, camera scanning, My code, push, disputes, Pool UI, deep-link opening on devices, Maestro `qr-pay.yaml`.
- [ ] Block/report/spam
- [ ] Phase 1 sign-off

## Phase 2 — Game platform + vertical slice (week 7–10)
Lanes: `game-platform-engineer` (drawer, modes, invites, host shell, async moves, results, XP) ∥ `game-rules-engineer` (Word Hunt, Cup Pong, Whot engines) → then `games-2d-engineer` (Word Hunt) ∥ `games-3d-engineer` (Cup Pong, Whot table) ∥ `realtime-spaces-engineer` (Spaces tab, create/join/lobby, CardRoom for Whot) ∥ `growth-invites-engineer` (SMS invites + web guest for Cup Pong & Word Hunt).
Done when: from a chat you can send Word Hunt or Cup Pong in Free or Pool, play async to a result with correct payouts and refunds; create a Whot! space with 4 devices and finish with 50/30/20 payouts; invite a non-Dyce contact by SMS who plays in the browser and joins.

**Kickoff prompt:**
```
Phase 2 vertical slice. game-platform-engineer builds the platform against the _example engine first (drawer with video tiles, mode sheet, create/respond match, host shell, submit-move, results, XP) and writes docs/ADDING_A_GAME.md. In parallel game-rules-engineer writes wordhunt, cuppong and whot engines with tests. When both are reviewed: games-2d-engineer builds Word Hunt, games-3d-engineer builds Cup Pong and the Whot table (cards per design/Card.dc.html), realtime-spaces-engineer builds the Spaces tab, create/join/lobby and the Whot CardRoom with reconnection, growth-invites-engineer builds SMS invites, links and the web guest game. code-reviewer on every branch; qa-engineer adds pool-loop, counter-offer, space-whot-reconnect and invite-web flows. Report payouts verified against the ledger.
```
- [ ] Platform (drawer, modes, host shell, async, results, XP)
- [ ] Word Hunt · Cup Pong · Whot! engines
- [ ] Renderers for the three
- [ ] Spaces tab, lobby, CardRoom
- [ ] SMS invites + web guest
- [ ] Phase 2 sign-off

## Phase 3 — Social, party games, notifications (week 11–14)
Lanes: `social-discovery-engineer` (People, profiles, friends, search, leaderboards, notifications + push) ∥ `party-games-engineer` + `game-rules-engineer` (Doodle Guess, Imposter, Werewolf, Charades) with `realtime-spaces-engineer` (PartyRoom, quick match) ∥ `games-3d-engineer` (round table + campfire scenes, Crazy Cards).
- [ ] People, profiles, friends, search, leaderboards
- [ ] Push notifications with actions + deep links
- [ ] Doodle Guess, Imposter, Werewolf, Charades
- [ ] Crazy Cards, quick match
- [ ] Phase 3 sign-off

## Phase 4 — Rest of the catalogue (week 15–20)
Engines first (`game-rules-engineer`), then renderers in parallel: 3D — 8 Ball, Darts, Basketball, Archery, Sea Battle, Ayo/Mancala, Ludo (+ LudoRoom for 3–4p); 2D — Chess, Checkers, Word Tiles, Anagrams, Mini Golf, Filler, Dots & Boxes, Tanks. Bots for Coach Cue, Quiz Mama, Word Hunt Trainer, Admiral Ade. Avatar Phase B/C when the artist delivers (live 3D builder, render service, 3D busts at tables) — `avatar-engineer` with the guidebook §9 prompt. Thumbnail videos for all 23.
- [ ] Engines (14)  - [ ] 3D renderers (7)  - [ ] 2D renderers (8)  - [ ] Bots  - [ ] Thumbnails  - [ ] Phase 4 sign-off

## Phase 5 — Hardening and launch (week 21–24)
`trust-safety-compliance` (anti-cheat, integrity gate, privacy export/delete, store forms, legal drafts) ∥ `release-engineer` (prod pipelines, monitoring, runbook, store listings) ∥ `qa-engineer` (full regression on device matrix, 3G tests, load test with realtime-spaces-engineer) ∥ performance pass by `games-3d-engineer` / `messaging-engineer`.
Launch gates: crash-free ≥ 99.5% in beta, ledger invariant clean for 14 days, all Maestro flows green, legal review done **[HUMAN]**, store approvals.
- [ ] Anti-cheat + integrity  - [ ] Privacy + deletion  - [ ] Monitoring + runbook  - [ ] Store submissions  - [ ] Launch

---

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
