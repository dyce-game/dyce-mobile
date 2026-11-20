# Backlog (out of scope for v1)

- Tournaments with brackets
- Voice/video in Spaces
- Desktop/web app beyond the guest game
- User-made word packs and Doodle themes
- Real-money anything (needs legal review first; see SPEC §14)
- King of the Hill / Bounties (old design concept, `design/Bounties.dc.html`)

## Messaging follow-ups (deferred from ADR-010)

- Groups (create, members, admins, polls), Bots, the "Live now" strip, online presence and "Active now"
- Replies, reactions, delete for me / for everyone, voice notes, photos
- Mute / archive / delete, a read-receipt opt-out, the "Add friend" choice when accepting a request
- Push for new messages; Redis pub/sub for the realtime hub before running more than one API instance
- FlashList and the 5,000-message scrolling pass on a mid-range Android

## Invites follow-ups (deferred from ADR-021; server items are in dyce-backend/docs/BACKLOG.md)

- Store link association: fill `public/.well-known/apple-app-site-association` (Apple team id) and `assetlinks.json` (Play signing SHA-256), serve both as `application/json` at https://dyce.games, set `EXPO_PUBLIC_IOS_STORE_URL` and `EXPO_PUBLIC_ANDROID_STORE_URL`. Needs the store accounts
- Deferred deep links: an invite opened before the app is installed should still be remembered after install (Android install referrer, iOS clipboard or a fingerprint service)
- The blue-bubble SMS thread in Chat (design: Invite) with "Tolu opened your invite" states, a choice of game for an invite (today Word Hunt only), and a list of invites you sent (`GET /invites` exists)
- Guest Cup Pong, "Rematch in browser", the design's XP and streak tiles on the guest end screen (no XP exists for guests)
- The phone's own share sheet / SMS composer prefilled with the link (the SPEC's original flow) as an alternative to the server text
- Real-device checks: "Open in app" handoff from the landing, accessibility passes

## Spaces follow-ups (deferred from ADR-022; server items are in dyce-backend/docs/BACKLOG.md)

- Spaces tab: the Spaces | People switch, "Open now" (public spaces), the live count in the header, quick match; Challenge from People
- Lobby: chat, "Invite friends" picker, a ready toggle, lock and kick sheet; a Share sheet with the QR; the result screen's "Play again, same seats" and XP lines
- Table: the 3D table (games-3d-engineer), card and market animation, sound and haptics, a visible "Last card!" callout for the player themself, GameMenu / GameForfeit / GameOffline designs for the sheets
- Deep link `https://dyce.games/s/DY-XXXX` needs the domain and association files (see the invites follow-ups); until then the share text carries the code too
- Real devices: touch targets and hand scrolling with a big hand, Android emulator address (`10.0.2.2` rewrite is in place, untested), backgrounding mid-game

## Games platform follow-ups (deferred from ADR-016; server items are in dyce-backend/docs/BACKLOG.md)

- Pool follow-ups (the async 1v1 Pool shipped in ADR-018): "Run it back" (double or nothing rematch) and its mode-sheet switch, "Counter back" (SPEC allows one counter, so this needs a decision), personal Pool limits ("Change my limit", raises wait 24h), a custom stake amount, a "Dispute" button on the Pool result, Pool in Spaces
- Turn timers and forfeit past the timer (`turn_deadline` is not set yet), "No reply in 24h" invite expiry as a scheduled job (today an invite expires when it is next read)
- Push for "your turn", invites and results; the chat list preview ("Your turn") for a game card
- XP, streaks, badges, the friends leaderboard and the result screen's XP/streak panels; stats on Profile and head-to-head in Chat info
- Games drawer: video thumbnails, search, the category chips beyond what exists, Spaces tiles; the drawer/mode sheet from a group chat
- Dispute and anti-cheat signals on matches; spectators
- Reconnect/offline banners and forfeit sheet on the host shell (designs GameOffline, GameForfeit, GameMenu)

## Social layer follow-ups (deferred from ADR-024; server items are in dyce-backend/docs/BACKLOG.md)

- Push on devices: needs an EAS project id in `app.config.ts` (`extra.eas.projectId`) and a dev build; check the permission prompt, token registration, tap routing from a cold start
- Settings: "who can see me online", Pool limits, data export and delete, Help and legal (still waiting on their features)
- Search: tapping a game opens New chat (pick a friend) because the Games drawer needs a conversation; a "send to…" picker would be better
- Mute challenges from a profile (was in the design menu; not in the SPEC)
