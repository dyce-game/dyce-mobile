# Dyce — project rules for Claude Code

Dyce is a chat-first mobile app for playing games with friends, family and strangers. It looks and feels like a messaging app (inspired by iMessage + iMessage games), with games launched from the composer, multiplayer **Spaces**, and a virtual-cash **Wallet** (every user starts with **₦200k Dyce Cash**). Android and iOS users play together.

Source of truth, in this order. Read the relevant ones before changing anything:
1. `docs/SPEC.md` — what the product does (features, rules, copy).
2. `docs/ARCHITECTURE.md` — stack, repo layout, data model, realtime, game engine contract.
3. `docs/WALLET_AND_QR.md` — ledger, Pool money rules, QR request/scan-to-pay.
4. `docs/GAMES.md` — game catalogue, 2D vs 3D, async vs realtime, per-game rules.
5. `docs/DESIGN_SYSTEM.md` — tokens, components, motion. Visual reference screens live in `design/` (`design/SCREENS.md` maps each file to its route; view them in the design canvas or the PNG exports in `design/png/` if present, and read the files for exact values).
6. `docs/BUILD_PLAN.md` — phases, owners, definition of done.

If the docs and the design disagree, the docs win. If the docs are silent, follow the design. If both are silent, pick the simplest option, write it down in `docs/DECISIONS.md` (ADR style, one paragraph), and continue.

## Stack (do not swap without an ADR)
- **App:** Expo (latest stable SDK at kickoff; check `npx expo --version` and the Expo changelog before upgrading), TypeScript strict, **Expo Router** (file-based), EAS Build / Submit / Update. Expo web output is used only for the **guest web game** (invite links).
- **UI:** react-native-reanimated, react-native-gesture-handler, expo-blur (glass), expo-image, expo-video (game thumbnails), expo-haptics, expo-font (Figtree + Bricolage Grotesque), react-native-svg.
- **2D games:** @shopify/react-native-skia. **3D games:** @react-three/fiber/native + expo-gl (+ drei where it works on native).
- **State:** TanStack Query for server state, Zustand for local/UI state. No Redux.
- **Backend (ADR-004):** **NestJS** API in `apps/api` (REST + WebSocket gateway for chat realtime) on **plain PostgreSQL** with **plain SQL migrations** in `apps/api/db/migrations`. No Supabase. NestJS owns auth (phone OTP via Termii/Twilio, JWT access + refresh), contact matching, messaging, moves for async games, QR requests, invites and push. Money and game moves only change through Postgres functions called by NestJS services — never through direct table writes, and the app never talks to Postgres directly.
- **Realtime game server:** Colyseus (Node, TypeScript) for live multiplayer (Spaces, party games, card games, Ludo). Separate app, verifies the NestJS-issued JWT.
- **Shared logic:** `packages/games` (pure TypeScript rules engines, deterministic, no Node/DOM/RN APIs, so the same code runs in the app, in NestJS and in Colyseus). Relative imports inside `packages/games` and `packages/shared` use explicit `.ts` extensions so Node's type-stripping runs them directly (ADR-005).

> **Supabase → NestJS mapping.** Several docs and agent files written before ADR-004 still say Supabase. Read them as: Edge Function → NestJS module/endpoint · RLS → NestJS guards + membership checks in the service layer, with SQL constraints/functions as the last line of defence · Supabase Auth → `apps/api` auth module · Supabase Realtime → NestJS WebSocket gateway · pgTAP → Jest integration tests against a real Postgres (`pnpm test:db`) · `supabase/` → `apps/api/db/` · `supabase-backend-engineer` owns `apps/api` and `apps/api/db`. Everything about money, ledger, matches and fairness is unchanged.
- **Validation:** zod schemas in `packages/shared`, used on both client and server.
- **Quality:** Jest + React Native Testing Library, Maestro for e2e flows, ESLint + Prettier, Sentry (@sentry/react-native), PostHog for product analytics.

## Repo layout
```
apps/mobile        Expo app (iOS, Android, web guest)
apps/api           NestJS API (REST + WebSocket), SQL migrations in db/migrations, seeds in db/seed
apps/game-server   Colyseus server
packages/games     Rules engines, one folder per game, plus the GameEngine contract
packages/shared    zod schemas, types, money + formatting utils, constants
packages/ui        Design tokens + primitives shared across the app
design/            Design canvas export (reference only, never imported by code)
docs/              Specs and decisions
```
pnpm workspaces + Turborepo. Node LTS.

## Non-negotiables
- **Money is integer kobo** (`bigint` in Postgres, `number` safe-range in TS via the `Kobo` branded type). Never floats. Display through `formatNaira()` in `packages/shared` (₦200k, ₦1,500, ₦12.5k rules are in `docs/WALLET_AND_QR.md`).
- **Every money movement is a double-entry ledger transaction** created by a Postgres function with an idempotency key. Balances can never go negative. Clients never write to ledger tables (the API role has no direct INSERT/UPDATE on them; only the SECURITY DEFINER functions do).
- **Dyce Cash is virtual and cannot be withdrawn or bought.** Do not add cash-out, card payments or real-money top-ups. If a task seems to need one, stop and raise it.
- **Game outcomes are decided by the server.** The client renders and predicts; the server validates every move with `packages/games`, and physics games re-simulate from the submitted input and the match seed.
- **Strangers never land in Chat.** Anything from someone who isn't a friend or a contact goes to Requests until accepted.
- **Theme follows the device** (`useColorScheme`). There is no in-app theme toggle. Every screen ships light and dark.
- **No bottom navigation other than the Dyce tab bar** (Chat · Spaces · Wallet + separate search button). Profile is top-left, + is top-right on Chat and Spaces.
- **No emoji as UI icons.** Use the SVG icon set in `packages/ui/icons`.
- **Trademarks:** never ship the names Uno or Scrabble. Use "Crazy Cards" and "Word Tiles". Do not copy another app's game art.
- Accessibility: every touchable has an accessible label; minimum touch target 44×44; text respects Dynamic Type up to 1.3×; colour is never the only signal (mode badges carry text).
- Privacy: phone numbers are stored only as salted hashes for contact matching (E.164 via libphonenumber-js before hashing). Follow the Nigeria Data Protection Act 2023 notes in `docs/SPEC.md`.

## Conventions
- Feature folders in `apps/mobile/src/features/<feature>/` (components, hooks, api, screens). Routes in `apps/mobile/app/` stay thin and import from features.
- Components: function components, named exports, props typed with `type`, styles via the `ui` primitives + `StyleSheet` (no inline style objects in hot paths, no styled-components).
- Data hooks: `useXQuery` / `useXMutation` in `features/<f>/api`. Query keys in `packages/shared/queryKeys.ts`.
- Supabase: one migration per change (`supabase migration new <name>`), RLS on every table, pgTAP test for every function that moves money or changes match state.
- Edge Functions: one folder per function, zod-validate input, return typed errors `{ code, message }`.
- Commits: Conventional Commits. Small PRs, one feature per branch.
- Tests: rules engines need unit tests for every rule and a property test (random legal moves never break invariants). Money functions need tests for success, insufficient funds, idempotent retry, concurrent double-spend.

## Commands
```
pnpm i
pnpm dev               # turbo: expo start + game-server + supabase start
pnpm -F mobile ios     # or android / web
pnpm test              # all unit tests
pnpm test:db           # supabase test db (pgTAP)
pnpm e2e               # maestro test e2e/
pnpm lint && pnpm typecheck
```
(The Platform Architect creates these scripts in Phase 0. Keep this list in sync with `package.json`.)

## How to work here
- The lead session plans and delegates to the agents in `.claude/agents/`. Each agent owns an area (see `docs/BUILD_PLAN.md`). Don't edit another agent's area without a note in the PR description.
- Before starting a task: read the doc sections it touches and the matching `design/` screens. After finishing: run lint, typecheck and the tests for the area, then update docs if behaviour changed.
- When you're unsure whether something is in scope, check SPEC.md. If it isn't there, it's out of scope for now — list it in `docs/BACKLOG.md`.
