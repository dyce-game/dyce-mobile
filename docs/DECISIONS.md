# Decisions (ADRs)

One entry per decision, newest first.

## ADR-024 · Phase 3 social layer in the app · 2026-11-20

Backend decision, privacy rules and limits: see `../dyce-backend/docs/DECISIONS.md` (ADR-024). App side: `src/features/discovery` (search, other people's profile, leaderboard, badges), `src/features/notifications` (list hooks, push registration, permission screen, Settings switches), routes `/search`, `/u/[username]`, `/leaderboard`, `/profile/badges`, `/notifications`, onboarding step `notifications`. `expo-notifications` is added (plugin in `app.config.ts`); on web there is no push (the permission screen just continues), and the module is imported lazily on native only. The header avatar and the Profile bell show the unread count, kept live by the `notification` realtime event. Owner: social-discovery-engineer

## ADR-022 · Spaces and the Whot! table in the app · 2026-11-19

Context: the server is backend ADR-022 (Spaces API, the Colyseus game server, seat fees in Pool, forfeits). The app needs the Spaces tab, create and join, a lobby, a table and a result.
Decision: (1) **Routes.** The tab stays `(tabs)/spaces`. A space lives under `app/space/[spaceId]` (singular, so it never collides with the tab): `index` is one screen that follows the server's status (waiting shows the lobby, live shows the table, ended moves to `result`, closed says so), plus `space/new`, `space/join` and the link route `s/[code]` (already in the universal-link paths). (2) **Live line.** `colyseus.js` (0.16, added to the app) joins the room with a fresh access token after `POST /spaces/:id/connect`. `LiveConnection` (`src/features/spaces/live-connection.ts`) owns reconnecting: a dropped line is rejoined with the chat socket's backoff, the table stays as it was with a "Reconnecting, your seat is kept for a minute" banner, a table opened elsewhere stops this one until the person taps Play here, and the server closing a finished table is the end, not a drop. Pure and unit tested against a fake room. (3) **The table is a clean 2D view** (React Native views and `react-native-svg`, no Skia or 3D: that comes with the 3D work). The app never decides a rule: it parses the server's `view()` (`whot-logic.ts`), highlights what `whotCanPlay` allows, and sends `{kind:'play'|'draw'}`; the server validates every move. Last card and check up are sent automatically (`call: true` whenever a play leaves one card or none), so nobody is charged for forgetting. The turn clock counts down in server time (`serverNow` corrects a wrong device clock). Cards are the same in both themes (paper and maroon); the table is the design's wood in both. (4) **Money display** uses `payoutSplit`, which repeats `settle_match`'s arithmetic, for the Create preview; the result screen shows what the server paid. (5) Pool in Create reuses the age gate and stake limits from the async Pool work. Spaces | People, "Open now" and quick match are not on the tab yet.
Consequences: `@dyce/shared` gains `schemas/spaces.ts` (also the `Live*` wire types) and the `space` realtime event, so the app and API move together; the chat cache invalidates `space` and `spaces` on reconnect. The preview launch config (`.claude/launch.json`) pins `EXPO_PUBLIC_API_URL` to http://localhost:3000 because another local API was claiming 3010. Owner: realtime-spaces-engineer

## ADR-021 · SMS invites and the guest web game in the app · 2026-11-19

Context: the server side is backend ADR-021 (invites, guest run, claim). The app needs an "Invite to play" action, the web pages behind the link, and sign-up that joins the invite.
Decision: (1) **Where.** "Invite to play" is in New chat (a "Not on Dyce yet" section: contacts that nobody on Dyce owns, read only when contacts permission was already granted, plus an "Invite by phone number" field) and in Find friends (the same section after the sync, from `syncContactsWithInvitable`; numbers stay on the device). The game is Word Hunt, the one a guest can play in a browser (a constant, `INVITE_GAME`, until Cup Pong joins). (2) **Routes.** `app/i/[token]` is the landing page on web (who invited you, the game, "Play now in browser", "Sign up for Dyce", store buttons only when `EXPO_PUBLIC_IOS_STORE_URL` / `EXPO_PUBLIC_ANDROID_STORE_URL` are set) and a gate inside the installed app (not signed in: remember the invite and go to sign-up; signed in: `claim` and open the game). `i/[token]/play` is the guest round, reusing the signed-in `WordHuntBoard` unchanged (a synthetic player list; moves go to the guest endpoints with the guest token kept in this browser), ending on a score card with "Get Dyce, keep the score". `i/[token]/join` is the design's DeepLinkOnboard (who is waiting, the three steps, the invited number). (3) **Remembering.** `pending-invite.ts` keeps `{ token, phone }` in secure storage (localStorage on web). The phone screen opens with the number prefilled (country and national part). The number comes from the link fragment and never leaves the device. (4) **Joining.** After the profile is created the app calls `POST /invites/claim` (token optional, the number decides) and remembers the game; `PendingInviteRedirect` (root layout) opens it when onboarding is finished, instead of the empty chat list. (5) **Links.** `app.config.ts` already declares `applinks:dyce.games` (iOS) and verified https intent filters for /i /r /u /s (Android); `public/.well-known/` holds the two association files with placeholders for the Apple team id and the Play signing fingerprint, which need store accounts. Until then the link opens the web page and `dyce://i/<token>` opens the app.
Consequences: the web build must be served at `INVITE_BASE_URL` with the API's `CORS_ORIGINS` allowing it; the `.well-known` files must be served as `application/json` before store link association works; installing from a store after tapping the link does not carry the invite (deferred deep linking, BACKLOG), but signing up with the same number still joins. Owner: growth-invites-engineer

## ADR-018 · Word Hunt board: React Native views behind a renderer interface · 2026-11-15

Context: Word Hunt is the first real game on the match platform (server side: `dyce-backend/docs/DECISIONS.md`, ADR-019). The stack rule says 2D games use `@shopify/react-native-skia`.

- **Skia is not used for the grid.** `@shopify/react-native-skia` is not a dependency of this repo (nothing in `package.json`, nothing imports it), and adding it means a native module, the CanvasKit WASM for the web preview (a few MB, loaded asynchronously) and a lockfile change that other work shares. I did **not** install it or test it in the Expo web preview. The grid is 16 tiles and a trace line, which plain views draw well, and views give every tile an accessible label for free (a canvas would need a parallel accessibility tree). The board is built from views and a `PanResponder`, and works the same in the browser, on iOS and on Android.
- **Renderer interface.** `WordHuntSurfaceProps` in `WordHuntGrid.tsx` is the contract: letters, the picked `path`, a `tone` for the colour of the path, `size`, `disabled`, `onPathChange` and `onCommit`. The board (`WordHuntBoard`) owns the path, the word preview, the found words, the clock and the score; a renderer only draws and turns touches into paths. A Skia renderer can take the same props and replace `WordHuntGrid` without touching the board or the logic.
- **Input.** Dragging across touching letters (diagonals count, a letter once, sliding back un-picks) adds the word on release; tapping letters one by one and pressing **Add word** does the same without dragging (the alternative for people who cannot or do not want to drag). Every tile is a button with "Letter S, row 1, column 2, picked 3" and an `activate` action, so a screen reader can build a word without touching the grid. Hit-testing only counts the middle of each tile (`cellAtPoint`), so a diagonal slide does not clip a third letter.
- **Touch targets.** The grid is as large as the screen allows, 340pt at most and 220pt at least, so a tile is 77pt on a phone and **48pt at the smallest** size (checked at 360x640). That is the stated limit: below a 220pt grid the tiles would drop under 44pt, so on a very short screen the page scrolls instead of shrinking the grid. Letters on the tiles are scaled with the tile, not with Dynamic Type (they are part of the picture); every other text respects Dynamic Type up to 1.3x.
- **Both themes.** The design draws the play table in dark amber for light and dark alike (`PlayWordHuntDark` imports `PlayWordHunt`), so the table is one fixed dark panel; the header, the intro and the result screen follow the device theme.
- **Simultaneous play.** Both players act at once, so the server's single `currentTurn` only means "the first one still playing". The card and the host use `wordHuntMover()` from the player's own view (are _you_ done?) instead. The card fetches the match for an active Word Hunt only.
- **The round survives leaving the screen.** The server only knows when `start` arrived, so the app keeps `{ startedAt, words }` per match in memory and in secure storage (`use-word-hunt-round.ts`): going back to the chat and returning keeps the clock and the words. When time is up the app sends what it has once, and the **Send words** button retries after an error. The server still enforces the real clock.
- **The client predicts, the server decides.** The dictionary the engine uses is bundled with `@dyce/games`, so the preview says "word" or "not in the word list" instantly and the score under the board is a prediction; the server re-checks every word and the winner is its call.
  Consequences: a new 2D game can follow this shape (board = state + gesture, renderer = drawing). If Skia is added later, only `WordHuntGrid` is replaced. Owner: games-2d-engineer

## ADR-016 · Games in the app: drawer, mode sheet, card, host, results · 2026-11-15

Context: first slice of the game platform (server side in `dyce-backend/docs/DECISIONS.md`, ADR-016). Decisions made on the app side:

- **One sheet for drawer and mode sheet** (`app/games`, a transparent modal over the thread, like Send money). The games button in the composer (three-by-three dots, as in the design) only shows in a chat with a friend. Tapping a game goes straight to the mode sheet (SPEC §6); Free is selected, Pool is shown dimmed as "Coming soon" and cannot be chosen.
- **Game card** is a message kind (`game`) rendered by `GameCard`, driven by `cardState()` (pure, tested): invite (Accept / Decline for the invitee, Cancel for the sender), "Your turn" with a YOUR TURN badge, "Waiting for X", "You won" / "X won" / "It's a draw", cancelled and expired. It updates live from the server's card rewrites; a card never goes backwards (`stateVersion`).
- **Match cache.** `queryKeys.match(id)` holds the player's own `MatchView`; the realtime `match` event and every API response merge into it with `newerMatch` (an older version never replaces a newer one). Moves send the version the player saw; on `stale_version` or any server error the screen reloads the match, on a network error the same button sends the same version again (safe: idempotent).
- **Host screen** `g/[matchId]` is the shared shell (back, mode badge, opponent) plus a board per game; `PigBoard` only shows the server's view and sends `roll` / `hold`. A finished match moves to `g/[matchId]/result`, which any player can open again from the card.
- **Results screen** follows FreeResult for what exists today: winner and final score, Rematch free (a new invite in the same chat) and Back to chat.
  Consequences: a new game adds a board component and a branch in the host and result screens. Owner: game-platform-engineer

## ADR-015 · Profile and Settings · 2026-11-15

Backend decision and what is deliberately not shown: see `../dyce-backend/docs/DECISIONS.md`. App side: `src/features/profile` (Profile, Edit profile, Settings), routes `/profile`, `/profile/edit`, `/settings`; `Segmented` and the `grouped` colour in `@dyce/ui`.

## ADR-014 · Avatars, phase A: starter looks · 2026-11-15

Backend decision and the full list of what is and isn't built: see `../dyce-backend/docs/DECISIONS.md`. App side: `src/features/avatar` (picker screen, `UserAvatar`, filters, generated `starter-looks.ts` / `starter-images.ts`), `Avatar` in `packages/ui`, routes `/onboarding/avatar` and `/avatar`.

## ADR-013 · Block and report · 2026-11-15

Backend decision: see `../dyce-backend/docs/DECISIONS.md`. App side: Chat info (`/chat-info/<id>`), Report (`/report`), Blocked people (`/settings/blocked`, linked from Friends) in `src/features/safety`; the request banner in a thread also offers Report and Block.

## ADR-012 · Wallet API, money cards and request codes · 2026-11-15

Backend decision: see `../dyce-backend/docs/DECISIONS.md`. App side: the Wallet tab, Send, Request (QR), Pay a code, receipts and chat money cards are in `src/features/wallet` and `src/features/chat/components/MoneyCard.tsx`; the QR is drawn with `qrcode-generator` + `react-native-svg` (always dark on white); the Pay sheet and request screens read everything from the server.

## ADR-011 · Two repositories: the Expo app (Dyce) and the backend (dyce-backend) · 2026-11-15

Full text in `../dyce-backend/docs/DECISIONS.md`. App side: this repo is the Expo app at its root (no `apps/mobile`) plus `packages/ui`. `@dyce/shared` and `@dyce/games` are linked from `../dyce-backend/packages/*` (`link:` dependencies) and consumed as TypeScript source through the `dyce-source` condition. `metro.config.js` watches the linked folder and resolves every package from this project's `node_modules`; `tsconfig.json` sets `preserveSymlinks`; Jest maps both packages to source. Both folders must sit side by side; a release build pins the backend commit. Owner: platform-architect

## ADR-010 · One-to-one messaging, Requests and live delivery · 2026-11-15

Backend decision: see `../dyce-backend/docs/DECISIONS.md`.

## ADR-009 · Friends list, accept and ignore · 2026-11-15

Backend decision: see `../dyce-backend/docs/DECISIONS.md`.

## ADR-008 · Contact matching and friend requests · 2026-11-14

Backend decision: see `../dyce-backend/docs/DECISIONS.md`.

## ADR-007 · Phone OTP auth, sessions and the age gate · 2026-11-14

Backend decision: see `../dyce-backend/docs/DECISIONS.md`.

## ADR-005 · Explicit `.ts` extensions in shared packages · 2026-11-14

Backend decision: see `../dyce-backend/docs/DECISIONS.md`.

## ADR-004 · NestJS + plain PostgreSQL replace Supabase · 2026-11-14

Backend decision: see `../dyce-backend/docs/DECISIONS.md`.

## ADR-006 · Hoisted node_modules for pnpm · 2026-11-14

Context: Metro (React Native) resolves poorly with pnpm's symlinked layout. Decision: `.npmrc` sets `node-linker=hoisted`. Consequences: weaker dependency isolation between workspaces; accepted. Owner: platform-architect

```
## ADR-000 · <title> · <date>
Context: …  Decision: …  Consequences: …  Owner: <agent>
```

## ADR-001 · Stack fixed by the lead analyst · kickoff

Context: Dyce needs cross-platform mobile, realtime chat, async and live games, and a safe virtual ledger.
Decision: Expo (Router, EAS) + Supabase (Postgres/Auth/Realtime/Edge Functions) + Colyseus for live rooms + shared pure-TS game engines; Skia for 2D, React Three Fiber for 3D; money as integer kobo in a double-entry ledger.
Consequences: game rules must be runtime-agnostic (Node, Deno, Hermes); all money and match changes go through server functions.
Owner: platform-architect

## ADR-002 · Avatar system: commissioned modular glTF rig, no Unity/C# · kickoff

Context: Dyce needs Memoji/Bitmoji-class editable avatars, cheap to show in long lists. Decision: commissioned Blender rig exported as modular GLB parts; live editing in R3F; server-rendered 2D images cached by config hash elsewhere; 220 AI-generated profiles as style bible and interim starter looks. No Unity (would add C#, a second engine and app size for no avatar benefit). Consequences: render service needed; artist brief and pipeline in docs/AVATAR_GUIDEBOOK.md. Owner: avatar-engineer

## ADR-003 · Domain dyce.games · kickoff

All links, universal links and app links use https://dyce.games. Owner: growth-invites-engineer

## ADR-020 · Cup Pong: one scene on R3F native and web, the server owns every throw · 2026-11-19

Context: Cup Pong is the first 3D game (docs/GAMES.md: React Three Fiber; stack rule). The same scene must run on the phone (`@react-three/fiber/native` over `expo-gl`) and in the Expo web preview used for browser checks and the guest web game. The engine adds a release wobble from the seeded RNG, so a device cannot know exactly what its throw will do.
Decision: (1) `boards/r3f.ts` re-exports `Canvas`, `useFrame`, `useThree` from the native entry and `boards/r3f.web.tsx` from the DOM entry (pixel ratio capped at 1.5); the scene, board and logic import only from `./r3f`, so there is one scene. Nothing needed an alternative renderer. (2) The device sends `{aim, power}` only. It predicts the throw with `simulateCupPongThrow` on the input it sent (no wobble), starts the ball at once, and when the server's answer arrives with a different outcome it glides the ball onto the path simulated from the server's `applied` input; the cups on the table always end up as the server's. (3) The opponent's throw is replayed once per device from the stored `applied` input against the cups reconstructed from the view (standing cups plus the sunk one, put back where the engine had them); if the simulation does not agree with the recorded result the replay is skipped and the banner alone is shown. (4) The table is a fixed dark room in both themes, as in the design (PlayCupPong and PlayCupPongDark are the same scene); the header, results and controls outside it follow the device theme. (5) The throw has an accessible equivalent (Aim and Power sliders with -/+ buttons and a Throw button) and, with Reduce Motion on, no animation: the result is announced and the table updates. (6) A watchdog ends a throw's animation 5 s after it started, so a canvas that never reports (no WebGL, backgrounded app) cannot block the game or the result screen. (7) Free only: `supports_pool` is false until a Pool Cup Pong has been played through settlement.
Consequences: a throw whose prediction differs from the server's shows a small correction; replays need the engine's physics to stay unchanged for a given match (already required by backend ADR-017: version the match if constants change). Draw calls are about 85 and triangles under 8k by construction; no on-device frame rate has been measured. Owner: games-3d-engineer
