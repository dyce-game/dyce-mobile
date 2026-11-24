# Phase 3 sign-off report: social, party games, notifications

qa-engineer, 2026-11-23. Source: `docs/BUILD_PLAN.md` Phase 3. **No box is ticked by this report.** Phase 3 has no single "done
when" sentence in the plan, only its lanes and four status lines, so the criteria below are those lines, taken one by one. Marks
as in `README.md`. "Flow" means a Maestro flow executed on the web build by our runner, not on a device.

## 1. Criteria

| # | Criterion (lane in BUILD_PLAN) | Evidence found | Mark |
| - | ------------------------------ | -------------- | ---- |
| 1 | **People, profiles, friends, search, leaderboards** (social-discovery, ADR-024) | Backend `progress.test.ts`, `discovery.test.ts`, `notifications.test.ts` (XP amounts and level carry-over, forfeit pays nothing, caps, streaks across Lagos days, badges; search: friends from 2 characters, strangers by `@username` from 3, wildcards, blocked, cap of 15, daily limit, no phone fields; profiles: stranger vs friend vs self, money only on self; weekly leaderboards: boundary, friends vs global, blocked hidden). App `discovery-logic`, `search-logic`, `profile-logic`, `badge-logic`. By hand, light and dark. QA: the route walk loads `/search`, `/leaderboard`, `/u/<name>`, `/friends`, `/profile`, `/profile/badges`, `/profile/edit` in both themes. Flow 08 covers Profile > Settings. | **Proven (logic and routes render); by hand (the screens)**. **Not shown:** opt-outs and "Near you" (not built), Maestro `search.yaml` (not written), devices |
| 2 | **Push notifications with actions and deep links** (ADR-024) | Backend: every trigger, the list (paging, filters, mark read, blocked hidden), preferences merge, tokens, the dispatcher behind a driver interface (words, route and badge, switched-off group, quiet hours, never-pushed kinds, dead token, retry, two dispatchers send once). App `notifications-logic.test.ts`. The in-app list, per-type switches, quiet hours and permission screen are on routes the walk renders (`/notifications`, `/settings`, onboarding notifications step in flow 01). | **Proven for the server logic and the in-app screens. Never exercised: a real push** (EAS project id and the Expo Push API do not exist yet), tap-to-open from a cold start, lock-screen actions (not built), the streak-at-risk job (not built) |
| 3 | **Doodle Guess, Imposter, Werewolf, Charades** (party-games, ADR-025/026) | Backend: one generic party room (ticks, start gate, per-seat views, table talk, streamed canvas, reconnect, forfeit with skip-ahead, persistence and settlement through the SQL functions); played to results by bots over real Colyseus and over real processes (Imposter and Werewolf in `live-e2e.mjs`; Doodle and Charades in the integration suite). App: the four party screens (parsers, phase logic, Doodle chunking tests, tilt detector). By hand in a browser against the real servers (2026-11-21). **QA load: one Doodle room of 8, a full 4,000-point drawing: every point reached all 7 watchers, 45 KB (fast) to 113 KB (slow) per watcher, 16 to 53 kbps while drawing, p50 delay 60 to 167 ms** (`RESULTS.md` section 6). | **Proven (rules, rooms, stream); by hand (screens).** **Not shown:** 3D art for the round table and the campfire (not built: the screens are SVG), word-pack art, **tilt for Charades on a device** (sign of the z axis, the iOS permission), spectating, bots, a drawer who leaves mid-turn, a 10-seat Imposter and a 12-seat Werewolf at 360 pt, a drawing on a low-end Android over 3G |
| 4 | **Crazy Cards and quick match** | Crazy Cards runs in the card room (2 to 4 seats), Free and Pool, verified like Whot!; the **3D card table** for Crazy Cards and Whot! (ADR-027): 61 unit tests including whole games of both played with only moves the app built; a full game of each played to a result in a browser, light and dark. Quick match (Whot and Crazy Cards, 1 v 1, Free or Pool: queue, level gap, blocks, accept window, stakes, refunds) in the API and a first screen. **QA load: 100 strangers searching at once: 100 of 100 paired, every pair symmetric, nobody twice, 100 of 100 accepted into `playing`, 50 live rooms, 0 violations** (`RESULTS.md` section 4). **Flow 09** opens a Whot! space and the 3D table (WebGL works in headless Chrome). | **Proven (rooms, queue, rules); by hand (table).** **Not shown:** the card table's frame rate, touch on the fan, VoiceOver and TalkBack (the "Cards" list is the non-visual way), Reduce Motion, a lost GL context, 5 and 6 seats (the create flow offers 2 to 4), card sounds, quick match for async games, **push for "match found"**, collusion signals (the integrity layer added some, see its ADR-039), a two-device quick-match run |

## 2. What QA ran here

- Route walk of every Phase 3 route, light and dark (`docs/qa/REGRESSION.md`). The first full walk found **BUG-3** (fixed 2026-11-24); no other page
  threw or failed a request.
- Load: Doodle stream, quick-match queue, Whot rooms (50 seats), chat fan-out.
- Flow 09 (Spaces and the card table), flow 08 (Settings).
- Static accessibility audit: the party and table screens have **no unlabelled touchable**; one `maxFontSizeMultiplier` of
  1.15 on `PartyChrome.tsx:173` (the app promises 1.3), **raised to 1.3 on 2026-11-24** (the countdown ring's number; check on a device
  with text at 1.3x that it still fits the ring).

## 3. Bugs and observations that touch Phase 3 (`docs/qa/BUGS.md`)

- **BUG-0 (blocker)**: the API deadlocks at about 20 simultaneous game moves. Quick match, Spaces and every other API route share the same
  20-connection pool, so after the fix the live-room entry points (create, join, start, connect, quick-match join and accept) need the
  same simultaneous-burst test (`pool-deadlock-probe.mjs` covers async match moves only). The game server has its own pool.
- **Observation**: in a 50-seat Whot run with 1.5 s of think time, 1 of 17 rooms was still being played at 400 s (a long game or a
  stuck room: not determined).
- **Observation**: a slow drawer costs the watchers more bytes in total (113 KB against 45 KB for the same points), because every
  small batch is framed separately. Not a bug; relevant to the 3G budget.
- Accessibility: `allowFontScaling={false}` on 17 board glyph texts (all Phase 4 boards, none in Phase 3).

## 4. Unverified: what a human must confirm before the box is ticked

1. **Push on devices**: permission prompt, a real "your turn" push for each trigger kind from a closed app, tap to open at the right
   screen from a cold start, quiet hours, the badge, switching a group off; then lock-screen actions if they are wanted.
2. **Four to eight people on phones** play Doodle Guess, Imposter, Werewolf and Charades each to the end (the debug-table route is gone for
   these four): tilt, role-card privacy (nobody can read it over a shoulder: the "tap to peek 4 s" behaviour), voting, night actions,
   leaving and rejoining mid-turn, a seat that never connects (90 s), table talk, payouts in Pool.
3. **The 3D card table** on the 3 to 4 GB Android (50 fps), touch on the fan, VoiceOver and TalkBack through the "Cards" list and the
   status line, Reduce Motion, a lost GL context, a 4-device game, 5 and 6 seats when the create flow offers them.
4. **Quick match with two real devices** (search, found, accept, play a turn, a decline, a timeout, Pool refunds in the wallet), and
   push for "match found".
5. **Search and discovery on devices**: keyboard, the empty states, the leaderboard's week boundary at midnight Lagos time.
6. The **round-table and campfire 3D art** and the **word-pack art**: decide whether Phase 3 waits for them or they move to Phase 5.
7. Product decisions the code cannot make: collusion thresholds, whether strangers from quick match may add each other, spectating.
8. Screen reader and Dynamic Type 1.3x on every Phase 3 screen; the Doodle drawing on a low-end Android over a 3G link.
