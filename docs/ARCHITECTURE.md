# Dyce — Architecture

> **Superseded in part by ADR-004 (see `docs/DECISIONS.md`).** The backend is a **NestJS API (`apps/api`) on plain PostgreSQL with SQL migrations**, not Supabase. Where this document says Supabase / Edge Function / RLS / Realtime / pgTAP, read the mapping in `CLAUDE.md`. The data model in §3, the engine contract in §4, the match flows in §5 and the fairness rules in §6 are unchanged. Auth is NestJS-issued JWT; chat realtime is a NestJS WebSocket gateway; Colyseus verifies the same JWT.

## 1. System overview
```
 Expo app (iOS / Android / web-guest)
   │  supabase-js (auth, queries, RPC, realtime chat)      colyseus.js (live rooms)
   ▼                                                        ▼
 Supabase ───────────────────────────────────────────── Colyseus game-server (Node)
   • Postgres (+RLS, functions, pg_cron)                   • Spaces, party games, card games, Ludo
   • Auth (phone OTP via SMS hook → Termii/Twilio)         • verifies Supabase JWT on join
   • Realtime (chat messages, typing, presence)            • uses packages/games engines
   • Storage (avatars renders, voice notes, photos)        • writes results through service-role RPC
   • Edge Functions (Deno): moves for async games,
     invites, QR requests, push fan-out, contact match
 Expo Push Service ← Edge Function `push-dispatch`
```
Hosting: Supabase cloud (pick the region closest to Lagos that Supabase offers, currently EU), Colyseus on Fly.io (regions close to West Africa and EU), web guest on EAS Hosting or Vercel at `dyce.games`.

## 2. Repo
```
apps/mobile/
  app/                     Expo Router routes (thin)
    (auth)/welcome.tsx phone.tsx code.tsx username.tsx contacts.tsx avatar.tsx bonus.tsx notifications.tsx
    (tabs)/_layout.tsx     custom TabBar (Chat · Spaces · Wallet + Search)
    (tabs)/chat/index.tsx  (tabs)/spaces/index.tsx  (tabs)/wallet/index.tsx
    search.tsx             modal, scoped by ?scope=chat|spaces|wallet
    c/[conversationId].tsx  c/[conversationId]/info.tsx
    g/[matchId].tsx        game host screen (loads the game's renderer)
    s/[spaceId]/lobby.tsx  s/[spaceId]/results.tsx  s/create.tsx  s/join.tsx
    wallet/send.tsx request.tsx scan.tsx pay/[requestId].tsx my-code.tsx history.tsx receipt/[txnId].tsx topup.tsx
    profile/index.tsx notifications.tsx badges.tsx edit.tsx  u/[username].tsx
    settings/…  new-chat.tsx new-group.tsx quick-match.tsx report.tsx dispute/[matchId].tsx
    i/[token].tsx          invite deep link (web: guest game)  r/[code].tsx  QR request deep link
  src/features/<auth|chat|games|spaces|wallet|profile|social|safety|settings>/
  src/game-renderers/<slug>/   one renderer per game (Skia or R3F)
  src/lib/ supabase.ts colyseus.ts analytics.ts sentry.ts
apps/game-server/src/rooms/<SpaceRoom|PartyRoom|CardRoom|LudoRoom>.ts
packages/games/src/<slug>/ engine.ts engine.test.ts  +  src/contract.ts  src/rng.ts  src/physics/
packages/shared/src/ schemas/ money.ts format.ts queryKeys.ts config.ts
packages/ui/src/ tokens.ts theme.ts icons/ primitives/ (Glass, TokenButton, Chip, Avatar, TabBar, Sheet, ModeBadge…)
supabase/migrations  supabase/functions/<name>/index.ts  supabase/tests/*.sql
```

## 3. Data model (Postgres, schema `public`; RLS on all tables)
Identity and social
- `profiles(id uuid pk = auth.uid, username citext unique, display_name, avatar jsonb, level int, xp int, is_adult bool default false, birth_year int, city text null, show_online bool, request_policy enum(everyone, fof, nobody), created_at, last_seen_at)`
- `phone_hashes(user_id, hash bytea unique)` — salted HMAC of E.164; salt is a server secret.
- `contact_links(owner_id, contact_user_id, created_at)` — result of contact matching.
- `friendships(user_low, user_high, status enum(pending, accepted), requested_by, created_at)`
- `blocks(blocker_id, blocked_id)`, `reports(id, reporter_id, target_user_id, conversation_id, message_id, reason, note, status, created_at)`

Messaging
- `conversations(id, kind enum(direct, group, bot, sms), title, photo_url, created_by, created_at, last_message_at)`
- `conversation_members(conversation_id, user_id, role enum(member, admin), state enum(active, request, declined, left), last_read_at, muted_until)` — `state = request` is how stranger messages stay in Requests.
- `messages(id, conversation_id, sender_id, kind enum(text, voice, image, game, money_sent, money_request, poll, system, sms_invite), body text, payload jsonb, reply_to uuid, created_at, edited_at, deleted_at)`
- `reactions(message_id, user_id, emoji text)` (reaction set is a fixed list, rendered as icons)
- `sms_invites(id, inviter_id, phone_hash, game_slug, match_id, token unique, status enum(sent, opened, played, joined), created_at)`

Games
- `games(slug pk, name, dimension enum('2d','3d'), sync enum(async, live), min_players, max_players, categories text[], supports_pool bool, thumbnail_video_path, poster_path, enabled bool)`
- `matches(id, game_slug, mode enum(free, pool), stake_kobo bigint, status enum(invited, countered, active, finished, expired, cancelled, disputed), conversation_id, space_id, seed bigint, state jsonb, state_version int, current_turn uuid, turn_deadline timestamptz, created_by, created_at, finished_at)`
- `match_players(match_id, user_id, seat int, accepted_at, result enum(win, loss, draw, forfeit), placement int, payout_kobo bigint)`
- `match_moves(match_id, seq int, user_id, action jsonb, created_at)` — append-only, primary key (match_id, seq).
- `spaces(id, code unique, name, host_id, game_slug, mode, seat_fee_kobo, payout_scheme enum(winner_all, p50_30_20, p60_40), max_seats, visibility enum(friends, public, invite), start_rule enum(when_full, host), status enum(waiting, live, ended, closed), colyseus_room_id, created_at)`
- `space_members(space_id, user_id, seat, ready bool, joined_at, left_at, removed bool)`

Progress
- `xp_events(id, user_id, amount, reason, match_id, created_at)`, `streaks(user_id, current, best, last_win_date, saver_expires_at)`, `badges(slug, name, description, icon)`, `user_badges(user_id, badge_slug, earned_at)`
- `leaderboard_weekly` materialized view (refreshed by pg_cron every 10 min).

Money (details in WALLET_AND_QR.md)
- `ledger_accounts`, `ledger_txns`, `ledger_entries`, `wallets` (cached balance), `payment_requests`, `pool_escrows`, `disputes`, `daily_usage`.

Platform
- `push_tokens(user_id, token, platform, updated_at)`, `notifications(id, user_id, kind, payload, read_at, created_at)`, `app_config(key pk, value jsonb)` (limits, feature flags, payout schemes).

RLS sketch: users read their own profile row in full and other profiles' public columns via a `public_profiles` view; conversation data readable only by active members (request members read only the first message + sender profile); no client inserts into `matches`, `match_*`, ledger tables, `payment_requests` — those go through functions.

## 4. Game engine contract (`packages/games/src/contract.ts`)
```ts
export interface GameEngine<S, A, Cfg = unknown> {
  slug: string;
  init(players: PlayerId[], seed: bigint, cfg: Cfg): S;          // deterministic
  currentPlayers(s: S): PlayerId[];                               // who may act now
  validate(s: S, by: PlayerId, a: A): { ok: true } | { ok: false; code: string };
  apply(s: S, by: PlayerId, a: A): S;                             // pure, never mutates input
  isTerminal(s: S): boolean;
  result(s: S): { placements: PlayerId[][]; draw: boolean };     // index 0 = winners
  view(s: S, viewer: PlayerId | 'spectator'): unknown;            // hides secret info (cards, ships, roles, words)
  timers?: { turnMs: number; matchMs?: number };
}
```
Rules: pure TS, no `Date.now()`/`Math.random()` (use `rng.ts`, seeded xoshiro128** from the match seed), JSON-serialisable state, actions validated by zod. Hidden information is never sent to a client except through `view()`.

## 5. Two ways a match runs
**Async (iMessage-style, turn-based, 1v1, most games).** The game lives in a chat as a card. A move = call Edge Function `submit-move { matchId, expectedVersion, action }` → loads match, checks the caller is a current player, `validate` → `apply` → writes `match_moves` + new `state` + `state_version+1` inside a transaction (optimistic concurrency on version) → if terminal, calls `settle_match()` (SQL) → posts a system message to the conversation → push to the next player. Clients subscribe to the match row via Realtime for live updates when both are online.

**Live (Colyseus).** Spaces and real-time games (Doodle Guess, Werewolf, Imposter, Charades, Crazy Cards, Whot, Ludo with 3–4 players). The room is created by Edge Function `start-space` which creates the `matches` row and asks game-server to create a room (signed server-to-server call). Clients join with their Supabase JWT; the room verifies it. The room holds state in memory, uses the same engine, broadcasts `view()` per client, persists moves in batches, and on end calls `settle_match()` with the service role. Reconnection window 60s; after that the seat forfeits (Pool) or is replaced by a bot (Free, optional).

## 6. Physics games and fairness
Cup Pong, 8 Ball, Mini Golf, Basketball, Archery, Darts, Tanks. The client sends **input only** (e.g. `{ angle, power, spin }` or a swipe vector, quantised to fixed precision). Both client and server run the same **deterministic** simulation in `packages/games/src/physics` (fixed timestep 1/120s, fixed-point or carefully ordered float math, no platform-dependent functions). The server's result is final. The client animates its own prediction and corrects if the server disagrees (rare). Wind/jitter values come from the seeded RNG. Physics library options: a small custom 2D/2.5D sim (preferred for table/target games) or Rapier's deterministic build; whichever is chosen, add a cross-runtime determinism test (same inputs → identical outcome hash in Node, Deno and Hermes).

## 7. Rendering
- 2D games: Skia canvas inside the game host screen, 60fps, Reanimated for gestures.
- 3D games: R3F `<Canvas>` from `@react-three/fiber/native`. Low-poly GLB assets (glTF, Draco/meshopt compressed, KTX2 textures when supported), baked lighting, max ~50k triangles per scene, `frameloop="demand"` when idle. Mid-range Android (e.g. 3–4 GB RAM devices common in Nigeria) is the performance target: 50+ fps.
- Game host screen (`g/[matchId]`) provides the shared shell: top bar (back to chat, mode badge, menu), opponent pill, turn timer, reconnecting/offline banners, forfeit sheet, result screens (Free result, Pool result, Space results).

## 8. Realtime chat
Supabase Realtime: postgres_changes on `messages` filtered by conversation for open threads; a per-user broadcast channel `user:<id>` for list updates, typing and presence. Message send = insert through RPC `send_message` (checks membership, blocks, request rules, rate limits) returning the row; optimistic UI with client-generated UUIDs.

## 9. Security
- Supabase JWT everywhere; Colyseus verifies JWT with the project's JWKS.
- Service role key only in Edge Functions and game-server, never in the app.
- Rate limits: requests to strangers (20/day), money requests (30/day), SMS invites (50/day), OTP (Supabase limits + per-IP).
- App integrity: Play Integrity / App Attest checks required before first Pool (via Edge Function), with a soft-fail flag in `app_config`.
- Secrets in EAS secrets and Supabase vault. No secrets in the repo.

## 10. Observability
Sentry (app, Edge Functions, game-server) with release tags from EAS. PostHog events (see BUILD_PLAN analytics list). Structured logs in Edge Functions and game-server. A `/health` endpoint on game-server.

## 11. Environments
`local` (supabase start + local game-server), `staging`, `production`. EAS build profiles: development (dev client), preview (internal), production. OTA updates through EAS Update channels matching profiles. Database changes only through migrations applied by CI.
