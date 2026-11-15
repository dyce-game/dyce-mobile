# Dyce — project rules for Claude Code (the Expo app)

Dyce is a chat-first mobile app for playing games with friends, family and strangers. It looks and feels like a messaging app (inspired by iMessage + iMessage games), with games launched from the composer, multiplayer **Spaces**, and a virtual-cash **Wallet** (every user starts with **₦200k Dyce Cash**). Android and iOS users play together.

**Two repositories (ADR-011).** This repo (`Dyce`) is the **Expo app**. The server lives in the sibling repo **`../dyce-backend`** (NestJS API on PostgreSQL, `packages/shared`, `packages/games`, later the Colyseus game server). Keep both checked out side by side. This repo is also the home of the product docs, the build plan, `STATUS.md` and the design.

Source of truth, in this order. Read the relevant ones before changing anything:
1. `docs/SPEC.md` — what the product does (features, rules, copy).
2. `../dyce-backend/docs/ARCHITECTURE.md` — stack, data model, realtime, game engine contract. `../dyce-backend/docs/WALLET_AND_QR.md` — ledger, Pool money rules, QR request/scan-to-pay.
3. `docs/GAMES.md` — game catalogue, 2D vs 3D, async vs realtime, per-game rules.
4. `docs/DESIGN_SYSTEM.md` — tokens, components, motion. Reference screens live in `design/` (`design/SCREENS.md` maps each file to its route).
5. `docs/BUILD_PLAN.md` — phases, owners, definition of done. `docs/STATUS.md` — where we are.

If the docs and the design disagree, the docs win. If the docs are silent, follow the design. If both are silent, pick the simplest option, write it down in `docs/DECISIONS.md` (ADR style, one paragraph), and continue.

> Docs and agent files written before the split mention `apps/mobile`, `apps/api`, `packages/shared`, `packages/games`, Supabase, Edge Functions. Read them as: `apps/mobile/x` is now `x` at this repo's root · `apps/api`, `packages/shared`, `packages/games` are in `../dyce-backend` · Supabase/Edge Functions/RLS/Realtime/pgTAP map to the NestJS API, guards and service checks, the `/realtime` WebSocket, and Jest on real PostgreSQL (ADR-004).

## Repo layout
```
app/                Expo Router routes (thin; import from src/features)
src/features/<feature>/   components, hooks, api, screens (auth, contacts, friends, chat, shell, ...)
src/components, src/lib, src/navigation, src/providers
packages/ui         design tokens + primitives (@dyce/ui), used only by the app
design/             design canvas export (reference only, never imported)
assets/             avatar profiles, stickers, reference packs
docs/  e2e/         product docs; Maestro flows
```
`@dyce/shared` (zod schemas, money, formatting) and `@dyce/games` (rules engines) come from `../dyce-backend/packages/*`, linked by path and consumed as source. **Do not edit them from here as a side effect**: a contract change is a backend commit first, then an app commit. `metro.config.js`, `tsconfig.json` and `jest.config.cjs` hold the wiring.

## Stack (do not swap without an ADR)
- **App:** Expo (SDK 58), TypeScript strict, **Expo Router**, EAS Build / Submit / Update. Expo web output is used only for the **guest web game** (invite links).
- **UI:** react-native-reanimated, react-native-gesture-handler, expo-blur (glass), expo-image, expo-video, expo-haptics, expo-font (Figtree + Bricolage Grotesque), react-native-svg.
- **2D games:** @shopify/react-native-skia. **3D games:** @react-three/fiber/native + expo-gl.
- **State:** TanStack Query for server state, Zustand for local/UI state. No Redux.
- **Quality:** Jest (+ RNTL later), Maestro for e2e flows, ESLint + Prettier, Sentry, PostHog.

## Non-negotiables
- **Money is integer kobo** (`Kobo` branded type). Never floats. Display through `formatNaira()` from `@dyce/shared`.
- **Dyce Cash is virtual and cannot be withdrawn or bought.** No cash-out, card payments or real-money top-ups. If a task seems to need one, stop and raise it.
- **Game outcomes are decided by the server.** The client renders and predicts.
- **Strangers never land in Chat.** Anything from someone who isn't a friend goes to Requests until accepted.
- **Theme follows the device** (`useColorScheme`). No in-app theme toggle. Every screen ships light and dark.
- **No bottom navigation other than the Dyce tab bar** (Chat · Spaces · Wallet + separate search button). Profile is top-left, + is top-right on Chat and Spaces.
- **No emoji as UI icons.** Use the SVG icon set in `packages/ui/icons`.
- **Trademarks:** never ship the names Uno or Scrabble. Use "Crazy Cards" and "Word Tiles". Do not copy another app's game art.
- Accessibility: every touchable has an accessible label; minimum touch target 44×44; text respects Dynamic Type up to 1.3×; colour is never the only signal.
- Privacy: the app never stores phone numbers of people who aren't on Dyce; contacts are sent over TLS for server-side matching only.

## Conventions
- Routes in `app/` stay thin and import from features. Function components, named exports, props typed with `type`, styles via the `ui` primitives + `StyleSheet`.
- Data hooks: `useXQuery` / `useXMutation` in the feature. Query keys in `@dyce/shared` (`queryKeys`).
- Commits: Conventional Commits. Small PRs, one feature per branch.
- Tests: pure logic gets unit tests (merging, grouping, reconnect, optimistic state).

## Commands
```
pnpm install            # install ../dyce-backend first (pnpm install there), then here
pnpm dev                # expo start (web: pnpm web; Metro needs reloads: don't set CI=1)
pnpm test               # app + ui unit tests
pnpm lint && pnpm typecheck && pnpm format:check
pnpm export:web         # proves the app bundles
pnpm e2e                # maestro test e2e/
```

## How to work here
- The lead session plans and delegates to the agents in `.claude/agents/`. Each agent owns an area (see `docs/BUILD_PLAN.md`). Backend-heavy roles also exist in `../dyce-backend/.claude/agents/`.
- Before a task: read the doc sections it touches and the matching `design/` screens. After: run lint, typecheck and the tests, then update docs if behaviour changed.
- A feature that needs a new endpoint or contract: do the backend first (its tests must pass), then the app.
- If something isn't in the SPEC, it's out of scope for now: add it to `docs/BACKLOG.md`.
