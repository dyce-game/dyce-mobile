# Regression plan

Owner: qa-engineer. What to run, in what order, before a phase sign-off and before every release candidate, and how to read
the results. Layers and where they live are in `TEST_PLAN.md`; the device side is `DEVICE_MATRIX.md`; accessibility is
`ACCESSIBILITY.md`; the sign-off reports are in `docs/signoff/`.

## 1. The order (each step stops the run if it fails)

| # | Step | Command | Needs | Time |
| - | ---- | ------- | ----- | ---- |
| 1 | App gates | `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test` | nothing running | minutes |
| 2 | Backend gates | in `../dyce-backend`: `pnpm lint && pnpm typecheck && pnpm test && pnpm test:db && pnpm e2e` | embedded PostgreSQL | 10+ min |
| 3 | The app bundles | `pnpm export:web` | | minutes |
| 4 | Flows lint | `node scripts/e2e/lint-flows.mjs` | nothing | seconds |
| 5 | A11y static audit | `node scripts/qa/a11y-audit.mjs` | nothing | seconds |
| 6 | Dev stack up | `node scripts/stack/up.mjs` | | 15 s |
| 7 | Route walk, light and dark, with contrast | `node scripts/qa/walk-routes.mjs --contrast` (Expo web on :8090) | stack, Expo web | 20 min on a busy machine |
| 8 | Web flows | `node scripts/e2e/web-runner.mjs --all` | stack, Expo web | 10 min |
| 9 | Load and concurrency | `scripts/load/` (see its README); **run the pool probe last** | stack | 20 min |
| 10 | Maestro on devices | `node scripts/e2e/run-maestro.mjs` on one iOS and one Android | stack, device builds | 30 min |
| 11 | The device matrix | `DEVICE_MATRIX.md` sections 3 to 5 | devices | a day |
| 12 | Manual list | section 4 below | devices, accounts | a day |

Steps 1 to 9 can run on a laptop without a phone. 10 to 12 cannot and are the part nobody has run yet.

## 2. The route walk (step 7)

`scripts/qa/walk-routes.mjs` lists every route in `app/` from the disk (so a new screen cannot be forgotten: a route
without a way to get to it is printed under "Routes not walked"), signs a seeded person in (or out, for the welcome and
phone screens), opens each URL in **light and dark** (`prefers-color-scheme`), waits for the page to paint, and records:

- `console.error` and `console.warn`, uncaught exceptions, `Log` errors (for example a failed resource);
- network requests that failed, and every API response of **400 or more** (with the request);
- a **blank page** (no text after load) and a **redirect** away from the requested URL;
- controls on screen with neither a name nor text, and with `--contrast` the WCAG text contrast of every page;
- with `--shots`, a screenshot per route and theme.

Output: `e2e/.artifacts/route-walk/route-walk.md` (a table per page, then the problem list) and `route-walk.json`.
Options: `--only <text in the url>`, `--width / --height` (default 390x844, try 360x640 and 320x568), `--web <url>`.
Dynamic routes get their ids from a freshly seeded world (a conversation, a group, a QR request code, a receipt, a live and a
finished match, a Whot space, an SMS invite token).

Read the problem list as: **an exception or a failed request on a page you reached normally is a bug**; a 4xx on a page
reached without the parameter it needs (`/games/issue` with no `matchId`) is a smaller bug (the app should not call the API
with `undefined`); a warning is a to-do. Run it again with `--width 320 --height 568` before a release for the smallest phone.

Limits: it proves the screens render and that nothing throws on load. It does not click, so it cannot find what breaks on
interaction (the flows do some of that), and it runs the **web** build: no native modules, no touch, no WebGL on some
configurations (the 3D scenes fall back to the flat view).

## 3. Result of the last run

Run 2026-11-23 on the Expo web build (390x844), a private API and game server, seeded world (a conversation, a group, a QR
request, a receipt, a live and a finished match, a Whot space, an SMS invite). Full table: `ROUTE_WALK_2026-11-23.md`.

- **60 routes** on disk, **60 walked in light and dark (120 page loads), 0 not walked.**
- **0 blank pages, 0 uncaught exceptions, 0 failed requests, 0 unlabelled controls** on any page.
- **2 page loads with a problem, both the same: `/games/issue` opened without a `matchId` calls `GET /matches/undefined` (422)** and
  logs a console error (BUG-3).
- 4 routes redirect, as designed: `/` to `/chat`, `/r/<code>` and `/wallet/request/<code>` to `/wallet/pay/<code>`, `/s/<code>` to `/space/join`.
- Text contrast: **51 of 1,864** text elements below AA on 22 page loads (`ACCESSIBILITY.md` section 2; several are text over gradients).
- An earlier full walk (before the seed was extended) showed two 401s on `/space/new` in dark that did not reproduce in three
  later loads or in this run: a flake of the walker.

## 4. Manual checks no tool here can do (a human with devices and accounts)

- Real **SMS** to a Nigerian number (Termii on the DND route, Twilio fallback), delivery time, the code autofill on Android,
  the iOS one-time-code suggestion; a number that is already on Dyce; the resend limits.
- Real **push** on iOS and Android: permission prompt, token registration, a "your turn" push from a closed app, tap to open
  at the right screen from a cold start, quiet hours, the badge, a dead token.
- **Contacts** permission on devices: allowed, denied, "limited" access on iOS, a large address book (500+ numbers), the
  privacy claim (numbers of people not on Dyce are not stored).
- **Camera**: scan a QR request on a phone, a bad code, a code of an expired request, a stranger's request (the warning).
- **Money rules review** (a human, with legal): Pool limits and the age gate, the dispute window, refunds, the account-deletion
  wording, the "virtual cash, cannot be withdrawn" claims on every screen that shows a balance, NDPA 2023 wording.
- **Haptics**, the 3D tables' feel (touch lift of a card in a fan, flick throws), keyboard behaviour on devices, safe areas
  and the notch, rotating the phone mid-match, split screen.
- **Store and link** behaviour: universal links and app links for `https://dyce.games/i|r|u|s/...` (need the association
  files and store builds), a deferred deep link after install, the guest web game from a text message on a phone browser.
- **Performance** on the 3 to 4 GB Android: cold start, fps, memory, thermal (all of `DEVICE_MATRIX.md`).
- **Both themes by eye** on devices: the walk proves they render, not that they look right.

## 5. Filing a bug

Title with the number or the symptom ("Back from a thread after a game returns to the game"). Body: build (profile and commit),
device and OS, theme, account state, **steps**, expected, actual, a screen recording, the log line, and the flow or script that
reproduces it if there is one. Add a reproduction to `e2e/known-bugs/` when a flow can show it: it fails until the bug is fixed,
then moves into the numbered flows as its regression test. Severity: **blocker** (money wrong, hidden information shown,
data lost, the app or the API unusable), **major** (a core flow broken or a budget missed), **minor** (a wrong state,
copy, layout), **polish**.

## 6. Open bugs found by this work (2026-11-23)

See `BUGS.md`.
