# Adding a game

What it takes to put a new async 1v1 game on the platform (ADR-016). Pig (`_example`) is the worked example: copy its shape.

## 1. The rules engine (`../dyce-backend/packages/games`)
- A pure TypeScript `GameEngine` (see `contract.ts`): `init`, `currentPlayers`, `validate`, `apply`, `isTerminal`, `result`, `view`, and an `actionSchema` (zod) for actions arriving over the wire.
- No `Date.now()` or `Math.random()` (use `rng.ts` with the match seed). State is JSON-serialisable and `apply` never mutates its input.
- **`view(state, viewer)` is the only way state reaches a client.** Hide cards, ships, words, roles and the RNG state there. Add a test that the hidden part is absent for both players.
- Export it from `packages/games/src/index.ts`; write unit and property tests and run the determinism check.

## 2. The server (`../dyce-backend/apps/api`)
- Add the engine to `src/matches/engines.ts` (`engine`, `cfg` for `init`, and `devOnly: true` only for reference games that must not ship).
- Add a `games` row in a new migration (`slug`, `name`, `dimension`, `sync = 'async'`, player counts, `categories`, `supports_pool`, `enabled`). A game appears in `GET /games` when it has an enabled row **and** an engine entry.
- If the game needs a clock (a time limit per round or move), add a `screenAction` to the entry: it sees the move, the mover's earlier moves with their timestamps and `now`, and returns the action to apply (Word Hunt turns a late submit into an empty one). Change the move, don't refuse it, or the player gets stuck.
- Game slugs may contain hyphens (`word-hunt`); the engine's `slug`, the `games` row and the registry key must all match.
- Games where both players act at once (Word Hunt) have no turn order: the match's `current_turn` is only the first unfinished player, so the app decides whose move it is from the player's own `view()` (see `wordHuntMover`).
- Nothing else: create, accept, moves, version checks, idempotent retries, results, the chat card and realtime events are shared. Add engine-specific cases to a `db/tests` file if the game has server-side rules beyond the engine (e.g. a dictionary check).

## 3. The app (this repo)
- `src/features/games/components/GameArt.tsx`: the picture for the drawer tile and the chat card (a video thumbnail later).
- A board component (like `PigBoard.tsx`): render the server's `view`, send moves with `useSubmitMove` (`{ expectedVersion: match.stateVersion, action }`), enable controls only when `match.currentTurn === myId`. Parse the view with a small `parse<Game>View` function in `games-logic.ts` and test it.
- 2D boards are plain React Native views behind a small renderer interface unless the game needs real drawing (ADR-018); a Skia renderer can replace the view renderer later. A game with a round clock keeps its own start time on the device so the round survives leaving the screen (`boards/use-word-hunt-round.ts`).
- Add the game to the host screen (`GameHostScreen.tsx`) and the result screen (`GameResultScreen.tsx`) where they branch on `gameSlug`.
- Both themes, accessibility labels on every control, 44pt targets, text that respects Dynamic Type.

## 4. Checklist
Engine tests green (incl. hidden information and determinism) -> migration and registry entry -> `pnpm test:db` -> board and logic tests -> two signed-in sessions play it to a result in a browser, light and dark -> STATUS, TEST_PLAN and BUILD_PLAN updated.
