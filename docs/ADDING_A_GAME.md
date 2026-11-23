# Adding a game

What it takes to put a new async 1v1 game on the platform (ADR-016, ADR-028). Pig (`_example`) is the worked example for a plain turn-based game, Word Hunt for a game where both players act at once, Cup Pong for a 3D physics game.

Since ADR-028 the platform is set up so that **a renderer session adds its game by writing its own files and filling in one entry file, and edits nothing shared**. The engine, the server registry entry, the (disabled) `games` row, the rules sheet copy and an empty app entry already exist for all 23 games. What is left per game is the board, its picture, its view parser and the switch that turns it on.

## The two-step recipe for a renderer session

**Step 1 — the board (this repo).** Everything is in files named after your game; do not touch anything else.

1. `src/features/games/boards/<game>-logic.ts` (+ `.test.ts`): `parse<Game>View(view: unknown): <Game>View | null` (a small hand-written parser; return `null` for anything you do not recognise), and the pure helpers your board needs (score line, move construction, prediction). Test the parser and the logic.
2. `src/features/games/boards/<Game>Board.tsx`: a component taking `BoardProps<<Game>View>` from `registry/types.ts`. It draws the server's `view` and sends moves with `onMove(action)` (the host adds `expectedVersion`). Enable controls only when `yourTurn` (or, for games where both play at once, from your own `view`). Show `busy`/`moveFailed` states; the host already prints the server's error under the board.
3. `src/features/games/boards/<Game>Art.tsx`: a component taking `ArtProps` (`style`, `compact` for chat cards, `dice` size hint, `hero` for the results screen). Keep it light (plain views or SVG, no `Canvas`): it is rendered in the drawer, in every chat card and on the results screen.
4. **`src/features/games/registry/entries/<slug>.ts`**: the only registry file you edit. Replace the stub with

   ```ts
   import { defineGame } from '../define';
   import { ChessBoard } from '../../boards/ChessBoard';
   import { ChessArt } from '../../boards/ChessArt';
   import { parseChessView, chessScoreLine, type ChessView } from '../../boards/chess-logic';

   export const entry = defineGame<ChessView>({
     slug: 'chess',
     Board: ChessBoard,
     Art: ChessArt,
     parseView: parseChessView,
     scoreLine: chessScoreLine, // optional: the line under the result ("You 3 · Ada 2")
   });
   ```

   Optional fields: `mover` (whose move it is when `match.currentTurn` is not the whole story: both players act at once, as in Word Hunt, Anagrams and Sea Battle's placing phase; the chat card uses it), `ResultExtras` (more on the results screen), `holdResult(matchId, view)` (keep the host on the board until a last animation has played, then call `onSettled`; give it a watchdog so it can never block the result), `scroll` (wrap a column-of-cards board in a `ScrollView`).
5. Both themes, an accessibility label on every control, 44pt targets, text that respects Dynamic Type up to 1.3x, colour never the only signal. 2D boards are plain React Native views (or Skia where the game needs real drawing, ADR-018). 3D boards import `Canvas`, `useFrame` and `useThree` from `boards/r3f` (native entry on the phone, DOM entry on web), predict with the engine's own simulation, replay the other player's move from the view, and keep a non-gesture way to play (ADR-020). A game with a round clock keeps its own start time on the device (`boards/use-word-hunt-round.ts`).

**Step 2 — the switch (backend repo, `../dyce-backend`).** One file:

`apps/api/db/migrations/0021_enable_<slug>.sql`

```sql
UPDATE games SET enabled = true WHERE slug = 'chess';
-- When a Pool match of this game has been played through settlement, a later migration (or this one) also sets:
-- UPDATE games SET supports_pool = true WHERE slug = 'chess';
```

Use the `0021_enable_` prefix for every enable migration, whoever writes it: the migrator sorts and tracks by file name, so any number of `0021_enable_*.sql` files can be merged in any order, and nothing collides. Run `pnpm -F @dyce/api db:dev` to apply it to your local database. A game appears in `GET /games` (and so in the drawer, with its "How to play" button) only when its row is enabled **and** the registry has an engine for it; until then a dev build shows it under "Coming soon (dev builds only)".

That is the whole recipe. Then:

- `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test` in this repo; `pnpm test:db` in the backend (the catalogue test already creates, accepts and plays one illegal and one legal move for every registered game: add a case to `apps/api/db/tests/game-catalogue.test.ts` only if your game has a server rule beyond the engine).
- Two signed-in sessions play it to a result in a browser, light and dark (two origins, `localhost` and `127.0.0.1`, give two sessions).
- Add **your game's** lines to `docs/STATUS.md` and `docs/TEST_PLAN.md`, and tick it in `docs/BUILD_PLAN.md`. Do not edit the shared files below.

### Files a renderer session must not edit

`registry/index.ts`, `registry/types.ts`, `registry/define.ts`, `registry/rules.ts` (the rules copy is already written for all 23 games; change it only if the rules changed), `screens/GameHostScreen.tsx`, `screens/GameResultScreen.tsx`, `screens/GamesSheetScreen.tsx`, `components/GameArt.tsx`, `components/GameCard.tsx`, `components/ModeSheetBody.tsx`, `games-logic.ts`, and everything in the backend except your enable migration. If something shared genuinely has to change (a new `BoardProps` field, a new entry hook), that is a platform change: ask the lead session.

## What already exists for every game (done by the platform work, ADR-028)

### The rules engine (`../dyce-backend/packages/games`)
A pure TypeScript `GameEngine` (see `contract.ts`): `init`, `currentPlayers`, `validate`, `apply`, `isTerminal`, `result`, `view`, and an `actionSchema` (zod). No `Date.now()` or `Math.random()`; state is JSON; `apply` never mutates. **`view(state, viewer)` is the only way state reaches a client**; hide cards, ships, words, roles and the RNG state there. Exported from `packages/games/src/index.ts`.

### The server (`../dyce-backend/apps/api`)
- `src/matches/engines.ts` holds one entry per game (`engine`, `cfg` for `init` with every default written out so a later change cannot alter a running match, optional `screenAction`, `devOnly` for the reference game only). A game is offered when it has an enabled `games` row **and** an entry; the match service also refuses to create a game that has no entry.
- `screenAction` is for games with a clock: it sees the move, the mover's earlier moves with timestamps and `now`, and returns the action to apply. Change the move, never refuse it, or the player gets stuck. `screenRoundClock(graceMs)` is the shared one for "press Start, play a round, submit your words" (Word Hunt 80 s, Anagrams 60 s, both with 10 s grace).
- Migration `0020_game_catalogue.sql` added `games.pool_min_stake_kobo` (Pool minimum per game from `docs/GAMES.md`; the match service asks for the higher of that and the platform minimum, on create and on a counter-offer) and a disabled row per remaining game: slug, name, dimension, `sync = 'async'`, player counts, categories. Rows keep `supports_pool = false` until a Pool match has been played through settlement.
- Game slugs may contain hyphens (`word-hunt`, `dots-and-boxes`); the engine's `slug`, the `games` row, the registry key and the app entry must all match (a backend test checks the first three).
- Games where both players act at once (Word Hunt, Anagrams, Sea Battle while placing) have no turn order: `match.currentTurn` is only the first unfinished player, so the app decides whose move it is from the player's own `view()` (`mover` in the entry).
- Word Tiles: the dictionary is **injected**. `loadWordTilesWordSet()` builds the word set once when the API starts (the in-repo list of ~5.5k words by default; set `WORD_TILES_WORDLIST_FILE` and `WORD_TILES_WORDLIST_ID` to load a bigger list) and passes it to `createWordTilesEngine`. The id is copied into every match's state, so before changing the list keep the old id registered for matches still in play, and load a bigger list before Pool is switched on for it.
- Anti-cheat (backend ADR-039): a Pool match is judged when it would settle. Per-game timing and repeated-input rules are rows in `integrity_game_rules` (migration 0025 seeds the 19 turn-based and physics games; party games have none). A new game that has a minimum human reaction time or a physics input should get a row: `INSERT INTO integrity_game_rules (game_slug, min_gap_ms, gap_basis, max_repeat)` in its enabling migration. No row means no timing check, never a failure.
- Nothing else is needed server-side: create, accept, moves, version checks, idempotent retries, results, the chat card and realtime events are shared.

### The app (this repo)
- `registry/rules.ts`: the "how to play in three bullets" and the Pool rules line for all 23 games (docs/GAMES.md per-game deliverable 4), plus names and Pool minimums. It feeds the **How to play** button on each drawer tile, the rules toggle in the mode sheet and the dev-only "Coming soon" screen.
- `registry/entries/<slug>.ts`: one file per game, a stub (`defineGame({ slug })`) until its board exists. Live games (Whot!, Crazy Cards, Charades, Imposter, Werewolf, Doodle Guess) keep a stub too, for their rules; they are played in Spaces, not from the host.
- `registry/index.ts` maps slug to entry; the host, the result screen, the chat card and the drawer read everything per-game from it. A game with an entry but no `Board` shows "Coming soon" in a dev build and "Update Dyce to play this game" in a production build. A slug the build has never heard of shows the update message.

## Checklist (per game)
Engine tests green (incl. hidden information and determinism) -> registry entry and disabled row (done) -> board, art, logic and tests -> `entries/<slug>.ts` -> `0021_enable_<slug>.sql` -> `pnpm test:db` -> two signed-in sessions play it to a result in a browser, light and dark -> your lines in STATUS and TEST_PLAN, BUILD_PLAN ticked.
