# Dyce — Game catalogue (v1: 23 games)

Every game supports **Free** and **Pool** (Pool hidden for under-18s). "Async" games are played turn by turn from the chat card; "Live" games run in a Colyseus room (Spaces). Renderer: **3D** = R3F, **2D** = Skia (Doodle Guess is 2D by design).

| # | Game (shipping name) | Players | Dim | Sync | Category | Min Pool | Engine notes |
|---|---|---|---|---|---|---|---|
| 1 | Cup Pong | 2 | 3D | Async | Sports | ₦100 | Physics: swipe → throw input; 10 cups, re-rack once; first-person table view |
| 2 | 8 Ball | 2 | 3D | Async | Sports | ₦200 | Physics: cue angle/power/spin; standard 8-ball rules, ball-in-hand on foul |
| 3 | Darts | 2 | 3D | Async | Sports | ₦200 | 501 double-out (also "Around the clock" free variant); aim wobble from seeded RNG |
| 4 | Basketball | 2 | 3D | Async | Sports | ₦200 | 5 racks × 5 shots, moneyball last rack; flick input |
| 5 | Archery | 2 | 3D | Async | Sports | ₦100 | 3 ends × 3 arrows, wind per end (seeded), draw-and-release input |
| 6 | Mini Golf | 2–4 | 2D | Async | Sports | ₦100 | 9 holes top-down, stroke play, max 6 strokes per hole |
| 7 | Tanks | 2 | 2D | Async | Arcade | ₦100 | Destructible terrain (seeded), angle + power + weapon, wind |
| 8 | Sea Battle | 2 | 3D | Async | Board | ₦500 | Hidden ships (view() hides), 10×10, salvo variant optional; isometric 3D |
| 9 | Chess | 2 | 2D | Async | Board | ₦500 | Full rules incl. castling, en passant, promotion, 3-fold, 50-move; use a proven move generator (e.g. chess.js, check licence) |
| 10 | Checkers | 2 | 2D | Async | Board | ₦200 | International-friendly: 8×8 English draughts, forced capture, kings |
| 11 | Ayo / Mancala | 2 | 3D | Async | Board | ₦200 | Ayo Olopon rules default; Mancala (Kalah) as a mode switch on the same board |
| 12 | Ludo | 2–4 | 3D (tilted board) | Async 2p / Live 3–4p | Board, Spaces | ₦500 | Seeded dice from server; six to leave home; captures |
| 13 | Dots & Boxes | 2 | 2D | Async | Board | ₦100 | 5×5 dots; extra turn on box |
| 14 | Word Tiles (not "Scrabble") | 2–4 | 2D | Async | Word, Board | ₦200 | 15×15 board, own premium layout and letter values; dictionary check server-side |
| 15 | Word Hunt | 2 | 2D | Async | Word | ₦200 | 4×4 grid, 80s round, both play same seeded grid, score by length |
| 16 | Anagrams | 2 | 2D | Async | Word | ₦100 | 6 letters, 60s, same seeded letters |
| 17 | Filler | 2 | 2D | Async | Arcade | ₦100 | 8×7 colour grid (seeded), claim by colour, majority wins |
| 18 | Crazy Cards (Uno-style; never "Uno") | 2–6 | 3D table | Live | Cards, Spaces | ₦200 | Own card designs; skip/reverse/+2/wild/+4; "last card" call |
| 19 | Whot! | 2–6 | 3D table | Live | Cards, Spaces | ₦200 | Nigerian Whot rules: pick two, pick three, hold on, suspension, general market, Whot (20) request shape; "last card"/"check up" |
| 20 | Charades | 3–10 | 3D card | Live | Party, Spaces | ₦200 | Teams, phone-on-forehead tilt (accelerometer via expo-sensors) or tap; word packs incl. Naija pack |
| 21 | Imposter | 4–10 | 3D round table | Live | Party, Spaces | ₦300 | Secret word for all but 1–2 imposters; clue rounds then vote |
| 22 | Werewolf / Mafia | 5–12 | 3D campfire | Live | Party, Spaces | ₦500 | Roles (villager, werewolf, seer, doctor); night/day phases with timers; dead players spectate |
| 23 | Doodle Guess | 3–8 | **2D** | Live | Party, Word, Spaces | ₦100 | Draw with Skia, strokes streamed (throttled, simplified paths), guess in chat, points by speed |

Party games' Pool scoring: placements from points (Doodle, Charades teams, Imposter/Werewolf winning side split equally among the winning side).

## Word Hunt rules as built (backend ADR-017 and ADR-019)
4x4 grid, the same seeded grid for both players, each on their own time. The grid is hidden until you press Start; the round is 80 s from Start (the server allows 10 s more for the network; a later submit scores 0). Words need 3+ letters, touching cells (diagonals too), each cell once per word, and must be in the word list; duplicates count once. Points: 3 letters 1, 4 letters 2, 5 letters 4, 6 letters 6, 7 letters 9, 8+ letters 12 (the design's "+400" is a mock-up). A player's score shows to the other as soon as they are done ("Zainab played, 41 pts"); words stay hidden until both have finished. Highest score wins; equal scores are a draw. Free or Pool (see below).

## Pool in async games (backend ADR-041)
One rule for every async game: both players stake the same amount (at least ₦100 and the game's minimum in the table above); the winner takes the pot; a draw refunds both; resigning loses; **no move for 24 hours is a forfeit** (and if both players were due and nobody moved, every stake is refunded); an invite nobody answers in 24 hours is refunded. Free matches have no clock.

Pool is on for 16 games, each played to settlement in a database test: Word Hunt, Cup Pong, Anagrams, Filler, Tanks, Mini Golf, Darts (501), Basketball, Archery, 8 Ball, Chess, Checkers, Ayo (and Mancala), Dots & Boxes, Ludo (2 players), Sea Battle (classic and salvo). **Free only:** Word Tiles (until a full word list is loaded on the server) and Darts' Around the clock (a free variant by design). Ludo for 3 or 4 is the live **Ludo room** (backend ADR-043), Pool at ₦500 a seat.

## Variants chosen when a game is sent (backend ADR-041)
Ayo or **Mancala (Kalah)** (same board), Darts **501** or **Around the clock** (free only), Sea Battle **Classic** or **Salvo**. The mode sheet shows a "Rules" row; the card and the game header carry the variant's name.

## Per-game deliverables (same for every game)
1. `packages/games/src/<slug>/engine.ts` implementing `GameEngine` + zod action schema + unit tests + property test.
2. `apps/mobile/src/game-renderers/<slug>/` renderer using the shared game host shell.
3. Thumbnail video (3–5s loop, ≤ 1.5 MB, 360×360, H.264, muted) + poster image, uploaded to Storage `games/<slug>/`.
4. Rules sheet copy (how to play in 3 bullets, Pool rules line).
5. Seed row in `games` table.
6. Bot (optional, Free only) for games listed under Bots in SPEC §5.

## Launch order
Vertical slice: **Word Hunt** (2D async), **Cup Pong** (3D physics async), **Whot!** (live, Spaces). Then the rest by category: board → sports → word → party → arcade. See BUILD_PLAN.md.
