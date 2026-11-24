# Backlog (out of scope for v1)

- Tournaments with brackets
- Voice/video in Spaces
- Desktop/web app beyond the guest game
- User-made word packs and Doodle themes
- Real-money anything (needs legal review first; see SPEC §14)
- King of the Hill / Bounties (old design concept, `design/Bounties.dc.html`)

## Messaging follow-ups (deferred from ADR-010)

- The "Live now" strip, online presence and "Active now"
- Voice notes, photos
- Mute / archive / delete, a read-receipt opt-out, the "Add friend" choice when accepting a request
- Push for new messages; Redis pub/sub for the realtime hub before running more than one API instance

## Groups, bots and message actions follow-ups (deferred from ADR-032)

Server side items are in `../dyce-backend/docs/BACKLOG.md` ("Groups, bots and message actions"). App side:

- Group photo: the New group circle is a placeholder (no upload service), and the avatar is the member cluster. A group description.
- "Someone is typing…" in a group should name who (the tracker is per conversation); "Read by N".
- A Space card in the group thread and the Games drawer from a group (the + offers Poll and Start a Space only; games and money are 1:1).
- Copy on a phone: install `expo-clipboard` (native rebuild) so "Share text" becomes "Copy" and shows a "Copied" toast; today the share sheet is used.
- Swipe-right to reply (the design's menu hint); Forward; "Turn into a challenge"; more than five reactions ("+" in the design); a "jump to the quoted message" tap on a reply; tapping a reaction chip to see who reacted.
- Mute, archive and swipe actions on a group row; a "New group" entry in the + menu on the Chat tab itself (today it is inside New chat).
- Bots: quick-reply chips ("Warm up", "Start") above the composer, a "Play a practice game" button once bots can be game opponents, the bot's tagline on the row before you first speak (rows show the greeting instead).
- Maestro flows `group.yaml` (create, send, react, reply, poll, leave) and `bots.yaml`.
- FlashList and the 5,000-message scrolling pass on a mid-range Android

## Invites follow-ups (deferred from ADR-021; server items are in dyce-backend/docs/BACKLOG.md)

- Store link association: fill `public/.well-known/apple-app-site-association` (Apple team id) and `assetlinks.json` (Play signing SHA-256), serve both as `application/json` at https://dyce.games, set `EXPO_PUBLIC_IOS_STORE_URL` and `EXPO_PUBLIC_ANDROID_STORE_URL`. Needs the store accounts
- Deferred deep links: an invite opened before the app is installed should still be remembered after install (Android install referrer, iOS clipboard or a fingerprint service)
- The blue-bubble SMS thread in Chat (design: Invite) with "Tolu opened your invite" states, a choice of game for an invite (today Word Hunt only), and a list of invites you sent (`GET /invites` exists)
- Guest Cup Pong, "Rematch in browser", the design's XP and streak tiles on the guest end screen (no XP exists for guests)
- The phone's own share sheet / SMS composer prefilled with the link (the SPEC's original flow) as an alternative to the server text
- Real-device checks: "Open in app" handoff from the landing, accessibility passes

## Spaces follow-ups (deferred from ADR-022; server items are in dyce-backend/docs/BACKLOG.md)

- Spaces tab: the Spaces | People switch, "Open now" (public spaces), the live count in the header, the People entry to quick match; Challenge from People
- Lobby: chat, "Invite friends" picker, a ready toggle, lock and kick sheet; a Share sheet with the QR; the result screen's "Play again, same seats" and XP lines
- Table: card and shuffle sounds, haptics on a draw, a draggable fan for hands of 8 or more, 5 and 6 seats in Create for Whot! and Crazy Cards (the table is laid out for 6), a "Last card!" button the player presses themself if the call ever stops being automatic, the avatar 3D busts at the seats, GameMenu / GameForfeit / GameOffline designs for the sheets
- Deep link `https://dyce.games/s/DY-XXXX` needs the domain and association files (see the invites follow-ups); until then the share text carries the code too
- Real devices: touch targets and hand scrolling with a big hand, Android emulator address (`10.0.2.2` rewrite is in place, untested), backgrounding mid-game

## Party games and quick match follow-ups (deferred from ADR-025; server items are in dyce-backend/docs/BACKLOG.md)

- The real party screens replace `PartyDebugTable`: Imposter (round table: reveal, clue turns, vote, guess), Werewolf (campfire: night, day, vote; the dead spectate with roles shown), Charades (act and heads-up with the tilt input), Doodle Guess (Skia canvas fed by `canvas` messages with `applyCanvas`, guess feed, letter mask), and Crazy Cards on the 3D table; add each to `hasOwnTable`
- Table talk UI (the room already sends `chat` and `chat_history`), "Play again, same seats", results with team scores for Charades
- Party screens (ADR-026): 3D art for the round table, campfire and cards (the screens are flat 2D), word-pack art, a Skia canvas if SVG proves too slow on a low-end phone, a spectator view, bots for empty seats, Imposter's "Say clue" bar as in the design, the Doodle canvas as a rectangle, a tilt calibration step if the accelerometer's sign turns out to differ by phone, "Play again with the same seats"
- Quick match: the search animation and game theming from the design, an entry from Spaces › People, a "match found" push, a countdown that follows the server's `acceptBy` if the device clock can be trusted
- Maestro flows for quick match and a 4-seat party game; real-device runs

## Games platform follow-ups (deferred from ADR-016; server items are in dyce-backend/docs/BACKLOG.md)

- Pool follow-ups (the async 1v1 Pool shipped in ADR-018): "Run it back" (double or nothing rematch) and its mode-sheet switch, "Counter back" (SPEC allows one counter, so this needs a decision), personal Pool limits ("Change my limit", raises wait 24h), a custom stake amount, a "Dispute" button on the Pool result, Pool in Spaces
- Turn timers and forfeit past the timer (`turn_deadline` is not set yet), "No reply in 24h" invite expiry as a scheduled job (today an invite expires when it is next read)
- Push for "your turn", invites and results; the chat list preview ("Your turn") for a game card
- XP, streaks, badges, the friends leaderboard and the result screen's XP/streak panels; stats on Profile and head-to-head in Chat info
- Games drawer: video thumbnails, search, the category chips beyond what exists, Spaces tiles; the drawer/mode sheet from a group chat
- Spectators. (Anti-cheat signals on matches are done: backend ADR-039.)
- **Device headers from the app** (Phase 5, human-gated): a random install id kept in secure storage sent as `x-dyce-device`, `x-dyce-platform`, and the Play Integrity / App Attest token as `x-dyce-attestation` after `POST /integrity/challenge`; without them the shared-device signal and the attestation check have nothing to read. Also: show "payout is being checked" on the result screen for a match whose status is `disputed` (today it reads as finished with no payout, and a notification explains it).
- Reconnect/offline banners and forfeit sheet on the host shell (designs GameOffline, GameForfeit, GameMenu)

## Board registry follow-ups (deferred from ADR-028; server items are in dyce-backend/docs/BACKLOG.md)

- Ludo room (done, backend ADR-043): still open are a 4-phone run and a Ludo-specific timeout run in a real room.
- Per-match options (done, backend ADR-041): more variants (Dots & Boxes grid size, Ludo tokens, Chess from a position) are one registry entry each.
- Lazy `Board` imports in the registry if eager bundling of many 3D boards slows start-up.
- A "How to play" first-run overlay inside the board (today the rules are on the drawer tile and the mode sheet only), and per-game video thumbnails in place of `Art`.
- A Maestro flow for the rules sheet and the update-required screen.

## Social layer follow-ups (deferred from ADR-024; server items are in dyce-backend/docs/BACKLOG.md)

- Push on devices: needs an EAS project id in `app.config.ts` (`extra.eas.projectId`) and a dev build; check the permission prompt, token registration, tap routing from a cold start
- Settings: "who can see me online", Pool limits, data export and delete, Help and legal (still waiting on their features)
- Search: tapping a game opens New chat (pick a friend) because the Games drawer needs a conversation; a "send to…" picker would be better
- Mute challenges from a profile (was in the design menu; not in the SPEC)
- Web bundle: load three.js and React Three Fiber from one shared dynamic entry used by both the game host (Cup Pong) and the card table, so the first lazy route on the web no longer carries them in `__common` (ADR-027).

## Edge flows follow-ups (deferred from ADR-031; server items are in dyce-backend/docs/BACKLOG.md)

- **Human gates:** the legal text in `src/features/account/legal-copy.ts` (terms, privacy, community guidelines, responsible play) is DRAFT with a banner on every page; a lawyer must review it (SPEC section 14, NDPA 2023) and it must be replaced or loaded from the web before launch. Dyce has no support channel: Help says so instead of a "Contact us" button; pick one (email, form) and add it. The money rule for an upheld dispute is open (see the backend backlog); the app tells the disputer only "the result is corrected".
- StreakLost and the streak saver (done, backend ADR-042); still open: the "streak at risk" push (SPEC §12), the Moments "Level up" screen, and the product's call on the saver rules (Free win only, once a week, streaks of 2+).
- Game menu: a mute row (needs chat mute) and "Sound and haptics" (needs a settings store that the boards read; the boards call haptics directly today). GameForfeit's "you left, N seconds to come back" countdown and GameOffline's grace timer need async turn timers (`turn_deadline`, in the platform follow-ups) and a deadline in the live room's state.
- GameDetail: the Free / Pool record tab and "Friends who play" (per-game stats, `Challenge` buttons), and the video preview with its play button.
- PoolRules: the design's "Free-only mode" switch and "Daily pool limit ›" (lowering your own limit): not in the SPEC beyond "you can lower your own limits"; add with Pool limits in Settings. Settings rows still missing: who can see me online, Pool limits.
- Space edge states: "Notify me if a seat opens" and "Find another {game} space" (public spaces and a waitlist). SpaceSearch: public spaces by name, "Try searching" suggestions.
- BadgeDetail: progress ("14 / 25") and rarity need aggregate endpoints. Data export on a phone goes through the share sheet as text; a real file (expo-file-system + sharing) is nicer.
- Maestro flows for resign, dispute, delete account (without finishing it) and Help; a real-device pass of the game menu and the connection cards.
- Ludo live room (3 to 4 players): looked at while wiring the 2-player board (ADR-033). The board already draws 2 to 4 players from `view.players`, so the work is on the server and Spaces side: its own slug (`ludo-room`) with an engine entry `cfg.tokens: 4`, 3 to 4 seats and `timers.turnMs` overridden to a short turn (on timeout the room plays `ludoAutoAction`), a game-server room (the generic party room has ticks and per-seat views; Ludo is turn-based like the card room), a Create Space option, and the table screen reusing `LudoBoard` as `Board` (it only needs `view`, `myId`, `busy`, `onMove`). Not a small step on the card room, so not started.
- Ayo: creating a Mancala (Kalah) match. The board already draws both rule sets from `view.variant` (the switch on the board shows which is in play); the server needs the per-match option (the line above on the mode switch) and the mode sheet a second row. Also Sea Battle salvo (the board already asks for several targets when `view.shotsAllowed` > 1).
- 3D boards: check the announced banner for each replayed move with VoiceOver and TalkBack, and `Art` thumbnail videos for the drawer tiles when the artist delivers.

## Release and operations follow-ups (deferred from ADR-034; server items are in dyce-backend/docs/BACKLOG.md)

- **Instrument the remaining analytics events.** `src/lib/analytics.ts` types the whole BUILD_PLAN catalogue, but only `signup_started`, `signup_completed`, `contacts_permission`, `invite_sent`, `invite_opened` and `guest_round_finished` are called from screens. Without the rest (chat, games, spaces, wallet, push, safety) day-1 activation and D7 retention (SPEC section 16) cannot be measured. A launch task; it touches screens other work is changing.
- **Store reviewer account.** Sign-in is phone and a texted code, and `OTP_TEST_CODE` is refused in production on purpose, so an App Store or Play reviewer cannot sign in. Needs a small allow-list of reviewer numbers with a fixed code (an environment variable, off by default, removed after approval). **A launch blocker.**
- **Sign-up age gate.** The birth year is asked only on first entering a Pool, so anyone of any age can create an account and chat. The NDPA 2023 treats under-18s specially; the stores have child rules. Needs a legal decision, then a gate (see `docs/STORE_PRIVACY_ANSWERS.md` section 6).
- **A Settings switch for product analytics** (`setAnalyticsEnabled` exists, no UI), if counsel wants consent or an opt-out.
- **Force-update gate**: the API cannot yet tell an app "this version is too old". Until it can, the API must stay compatible with every version still in use (docs/RELEASE_CHECKLIST.md section 5).
- **App icon, adaptive icon, splash screen** (none in the repo) and the store screenshots (needs a running build). Camera, microphone, photo library and Face ID permissions come back with QR scanning, voice notes, photos and payment confirmation.
- **Secret scanning in CI** (for example gitleaks), after the credential found in the backend history is rotated.
- **A bundle size budget** for the web export (the guest game): to measure first.

## Pool, options, Ludo room, streak saver (ADR-041 to ADR-043, 2026-11-24)
- Word Tiles Pool: load a full word list on the server (`WORD_TILES_WORDLIST_FILE` and `_ID`), then one migration.
- A shorter turn clock for fast games (a Cup Pong throw against 24 hours): `pool_turn_hours` is one number today.
- Anti-cheat signals for Word Hunt and Anagrams ("a perfect score, found fast") and for engine-like Chess play; a push before a forfeit ("2 hours left to move").
- A Pool forfeit still reads `loss` after `settle_match`; the card could say "forfeited" from `live_meta`.
- A 4-device Ludo room run, and a Ludo room quick match.
