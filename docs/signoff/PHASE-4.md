# Phase 4 sign-off report: the rest of the catalogue

qa-engineer, 2026-11-23. Source: `docs/BUILD_PLAN.md` Phase 4. **No box is ticked by this report.** The plan's checkbox line for
Phase 4 reads "Engines wired [x] - 3D renderers (7) [ ] - 2D renderers (the other 4) [ ] - Bots [ ] - Thumbnails [ ] - Phase 4
sign-off [ ]", but the lines above it record the 2D renderers (all eight), the 3D sports renderers and the 3D board renderers as
done. **The summary line is stale and should be reconciled by the lead.** Marks as in `README.md`.

## 1. Criteria

| # | Criterion | Evidence found | Mark |
| - | --------- | -------------- | ---- |
| 1 | **Engines first**: 15 async rules engines | Backend `packages/games`: Anagrams, Filler, Word Tiles, Mini Golf, Tanks (138 tests), Chess, Checkers, Ayo, Dots & Boxes, Ludo, Sea Battle (192), 8 Ball, Darts, Basketball, Archery (121). Each: rules, a unit test per rule, a property test, hidden information, determinism, the `GameEngine` contract harness. All registered on the match service with Pool minimums per game (backend ADR-036, 26 new PostgreSQL tests). | **Proven** (backend suites). **Unverified:** determinism of the physics engines on **Hermes** (they ran in Node and in the browser's V8: the `_dev/determinism` screen has never been opened on a device); the product owner's confirmation of the Ayo local rules (backend ADR-035) |
| 2 | **2D renderers**: Chess, Checkers, Word Tiles, Anagrams, Mini Golf, Filler, Dots & Boxes, Tanks | One recipe (`ADDING_A_GAME.md`): `boards/<game>-logic.ts` + test, board, art, registry entry, `0021_enable_<slug>.sql`. About 171 app unit tests on real engine views through JSON (77 + 94). Each played to a result in a browser by two users, Free, light and dark; Word Tiles, Mini Golf and Tanks with their own interactions. The route walk renders the game routes. react-native-svg instead of Skia (ADR-029). | **By hand; logic proven.** QA ran **no per-game flow** (only Word Hunt and Pig are in `e2e/`). **Not shown:** touch (only mouse events were used), Dynamic Type 1.3x (17 `allowFontScaling={false}` board glyph texts, see `docs/qa/ACCESSIBILITY.md`), VoiceOver and TalkBack on the boards (labels exist; never listened to), a 320 pt phone, a multi-jump by tapping, a blank tile in a live match, pinch to zoom (not built) |
| 3 | **3D renderers**: 8 Ball, Darts, Basketball, Archery, Sea Battle, Ayo, Ludo (and Cup Pong, Whot, Crazy Cards from earlier phases) | React Three Fiber from primitives on shared kits (`r3f-common`, `board3d`), flat fallbacks for no-WebGL. About 92 + 65 new unit tests (parsers, quantised input, the preview equals the engine, replays, camera maths, ring geometry). Each played to a result in a browser with two origins, Free. **QA: WebGL renders in headless Chrome** (flow 09 opens the Whot table). | **By hand; logic proven.** **Unverified (the biggest gap of the phase): frame rate on the 3 to 4 GB Android (budget 50 fps), real touch (flick, pull-back, drag-to-place), haptics, expo-gl on both OSes, Reduce Motion, a device with no WebGL, memory after repeated opens.** Draw calls are by construction (about 20 to 90 per scene), never measured on a phone. |
| 4 | **Pool** for the new games | `supports_pool` stays false for all 15 until a Pool match of each has been played through settlement. Only the reference game Pig plays Pool today (flows 06 and 06b). | **Not met, by design.** A human decides which of the 23 games get Pool at launch |
| 5 | **Bots**: Coach Cue, Quiz Mama, Word Hunt Trainer, Admiral Ade | Scripted chat bots with no AI exist (Phase 1, ADR-032); the Phase 4 line is unchecked and STATUS lists Word Hunt Trainer as not done. **QA did not test the bots.** | **Not shown** |
| 6 | **Thumbnail videos for all 23 games** | Not built. The drawer shows drawn SVG art per tile (STATUS: "no video thumbnail"). | **Not met** |
| 7 | **Avatar Phase B/C** (live 3D builder, render service, 3D busts at tables) | Waits for the commissioned artist's delivery. | **Not met** |
| 8 | **Catalogue wiring and trademarks** | `registry/rules.test.ts` (31 tests): rules copy for all 23 games, three bullets each, the Pool minimum per game equals `GAMES.md`, **no "Uno" or "Scrabble"**, one entry file per slug registered in `index.ts`. "Coming soon" handling in dev builds. | **Proven** |

## 2. What QA ran here

- Route walk: the game routes (`/games`, `/games/issue`, `/g/<id>`, `/g/<id>/result`, `/pool-rules`) in both themes.
- Flows 05, 06, 06b, 09 (the platform every Phase 4 game sits on: drawer, mode sheet, card, host, resign, result, Pool money).
- Load: 100 players through quick match; 50 Whot seats; the optimistic-concurrency rule on 75 contended rounds (Pig: **the same
  `submitMove` path every async Phase 4 game uses**).
- Static accessibility audit over every board: **no unlabelled touchable, no unlabelled image**; 17 `allowFontScaling={false}`
  (Anagrams, Checkers, Chess, Darts, Dots, Word Hunt, Word Tiles glyph text) to check against the labels and move lists on a device.

## 3. Bugs found that touch Phase 4 (`docs/qa/BUGS.md`)

- **BUG-0 (blocker)**: the API wedges at about 20 simultaneous moves, and **every Phase 4 async game goes through the same `submitMove`**.
  Fifteen new games raise the number of players who can move in the same second.
- **BUG-2 (major), fixed 2026-11-24**: Back after a game did not reach the chat list (flow 11 is the regression test; confirm on a
  device). Still open: the resign confirm and menu row share the label "Resign".
- **BUG-3 (minor), fixed 2026-11-24**: `/games/issue` without a `matchId` requested `/matches/undefined`; it no longer calls the API.
- Backend findings recorded in STATUS and not re-verified by QA: `db/tests/game-catalogue.test.ts` fails two cases as soon as any
  `0021_enable_*.sql` migration is applied; `db/tests/invites.test.ts` has a flaky case (a UUID containing "234"); the match service
  refuses a resignation from a player who is not on turn.

## 4. Unverified: what a human must confirm before the box is ticked

1. **A device run of every board**: frame rate (50 fps on the 3 to 4 GB Android; the dev meters `__eightBall`, `__darts`, `__basketball`,
   `__archery`, `__ayo`, `__ludo` give average and worst frame), real touch for each game's input, haptics, expo-gl on iOS and Android,
   thermal after 10 minutes, memory after ten matches, a lost GL context (`docs/qa/DEVICE_MATRIX.md` section 3).
2. **Hermes determinism** of `simulateMiniGolfPutt`, `simulateTanksShot` and the four sports simulations, from the app's
   `_dev/determinism` screen on an iPhone and on an Android phone: it must read PASS (the server re-simulates from the input and the seed).
3. **VoiceOver and TalkBack** on every board (squares, pits, tokens, ships, sliders, the move lists) and **Dynamic Type 1.3x** on every
   board and result screen, including the glyph texts that opt out of scaling; a 320 pt phone.
4. **Product decisions**: Pool at launch for which games (each needs a Pool match played through settlement first); the Ayo local rules
   (relay on an occupied landing pit, moves of 20 to 80 seeds) and a per-match Mancala option; Word Tiles' dictionary size; whether
   the 3 to 4 player Ludo live room (its own slug) is in scope for launch; the two games' variant options (Kalah, salvo, Around the clock).
5. **Bots and thumbnails**: build, or move to Phase 5, or cut; the artist for Avatar Phase B/C.
6. **A real two-person run of each of the 15 new games** to a result on phones, Free, including the resign path, the held last-move
   result screens and the other player's move replay.
7. Reconcile `BUILD_PLAN.md`'s Phase 4 summary line with the per-renderer lines (stale), and the backend catalogue test that fails once any
   game is enabled.
