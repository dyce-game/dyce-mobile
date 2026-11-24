# End-to-end flows (Maestro)

Flows live here and run against a **dev stack**: a throwaway PostgreSQL, the API and the game server on their own ports,
seeded with the same people every time. The OTP test code (424242) stands in for the SMS, so no real SMS is sent and no
real money exists. Nothing here touches a shared dev database.

> **What has actually been run.** Maestro and a device are not installed on the machine these were written on. The
> flows were **linted** (`scripts/e2e/lint-flows.mjs`, clean) and **executed on the Expo web build in headless Chrome by
> a small runner of ours** (`scripts/e2e/web-runner.mjs`, a documented subset of Maestro), where the thirteen numbered
> flows pass. They have **not been run by Maestro itself, on an emulator, a simulator or a phone**. Section 6 lists what
> is executed and what is not, flow by flow.

## 1. The flows

| File | Journey | Phase | Runs on web |
| ---- | ------- | ----- | ----------- |
| `00-smoke-login.yaml` | a seeded person logs in by phone and code | 1 | yes |
| `01-onboarding-contacts-allowed.yaml` | new number, code, display name, username, **contacts allowed** (two on Dyce, one-tap add, invite rows), pick a look, claim Ð200,000, notifications on, lands in Chat with the balance | 1 | yes (dev address book) |
| `02-onboarding-contacts-denied.yaml` | same path with **contacts denied** (the OS prompt on a device, `dev.contacts=deny` on web); "Contacts are off", continue without contacts; notifications declined | 1 | yes (dev switch) |
| `03-chat-and-requests.yaml` | read and reply in a thread, a **live** message arrives with no refresh, two strangers land in **Requests** (never Chat): decline one, accept the other into Chat | 1 | yes |
| `04-qr-pay.yaml` | **request Ð2,000 by QR**, a second person (Ben, the API) pays it, the request turns "Paid by Ben QA", history shows it; then Ben shows a code, Alice **pays a code**, balance after, paid screen, receipt | 1 | yes |
| `05-game-free-wordhunt.yaml` | send a **Free Word Hunt** from the Games drawer, Ben accepts and plays his round (API), the card turns to "Your turn", Alice plays her round, both get the same result, no cash moves | 2 | yes |
| `06-game-pool-pig.yaml` | **Pool** match (Pig, the reference game): lock Ð500 each, Ben accepts, Alice resigns (a real loss), the server pays Ben the Ð1,000 pot; wallets read from the API before, during and after, nothing left locked | 2 | yes |
| `06b-game-pool-counter-offer.yaml` | Pool invite for Ð1,000, Ben counters Ð500 (API), Alice accepts the counter, Ð500 locked on both sides | 2 | yes |
| `07-block-report.yaml` | report a stranger from Requests (reason, "also block them" on by default), find them in Blocked people, unblock | 1 | yes |
| `08-settings-logout.yaml` | Settings: "Who can add and message me" (Nobody and back), Help and legal, **log out**, a second person logs in on the same device | 1 | yes |
| `09-space-whot.yaml` | **Spaces**: create a Free Whot! space for two, Ben joins by code (API), the lobby updates live, the host starts, the 3D card table opens and shows that Ben never connected | 2 | yes |
| `10-wallet-balance-after-qr-paid.yaml` | after Ben pays Alice's QR request, her **Wallet tab shows Ð202,000 with no refresh** (regression test of BUG-1) | 1 | yes |
| `11-back-after-game.yaml` | resign a Free Pig game, "Back to chat" on the result, then the thread's back arrow reaches the **chat list** (regression test of BUG-2) | 2 | yes |
| `12-email-signup-login.yaml` | **Sign up with email**: a bad address is explained before any code, a wrong code is rejected, a right one creates the account (name, username), Settings shows the masked address and "Phone number: Not added", log out, **Log in with email** reaches the same account (the OTP test code stands in for the Resend email) | 1 | yes |
| `known-bugs/*.yaml` | reproductions of open bugs. They **fail until the bug is fixed**, then move into the numbered flows; none is open today (the folder is empty) | - | yes |
| `subflows/*.yaml` | login, pick Nigeria, sign-up, finish onboarding, the OS permission prompts | - | - |
| `scripts/*.js` | the "second phone": Ben, as an API client, pays, requests, accepts, counters, joins, plays Word Hunt, sends a message; reads both wallets | - | - |

Flows still to write (they need a device or a second device, or a feature that is not built): `space-whot-reconnect`
(Wi-Fi off for 20 s and 70 s), `space-leave-lobby`, `space-code` negative cases, `invite-web` (needs a browser and an
installed app), `quick-match` (two devices), `send-money` (the send sheet is covered by the unit tests and by hand, not by
a flow), `pool-loop` with a real Pool game (only Pig supports Pool today), a 4-seat Imposter on the debug table,
`search.yaml`, `notifications.yaml`, `chess.yaml` and `word-tiles.yaml` from the board lists in `docs/TEST_PLAN.md`.

## 2. How the second person works

Maestro drives one device. Everything the other person does (Ben: pay a QR request, accept or counter a game, join a
space, send a message) is a small script in `scripts/` that calls the API as Ben, exactly as his app would. Each flow gets
its **own seeded world** (a fresh alice, ben, cara, dami, eze, fola, with their own phone numbers), so flows never depend on
each other's leftovers:

- `alice` is who the flow logs in as. `ben` and `cara` are her friends. `dami` and `eze` are strangers whose messages are
  waiting in Requests. `fola` has sent her a friend request. `tunde.qa` and `ngozi.qa` are the two people in the web dev
  address book.
- The flow gets their data as environment variables: `ALICE_PHONE`, `ALICE_USERNAME`, `ALICE_TOKEN`, `BEN_TOKEN`, ...
  (`scripts/e2e/world.mjs`), plus `API_URL`, `OTP`, `NEW_PHONE_ALLOW` and `NEW_PHONE_DENY` (numbers that have never signed up).
- The API allows **one login code per number every 30 seconds**. The runners seed every world ahead of time and wait out
  the rest of the 30 seconds before a flow that logs in through the UI.

## 3. Run them on an emulator, a simulator or a device

Prerequisites: Node 22 and pnpm; `../dyce-backend` checked out and built (`pnpm install` and `pnpm build` there);
[Maestro](https://docs.maestro.dev/getting-started/installing-maestro) on the PATH (needs Java 17+); an Android emulator or an
iOS simulator or a device with the **development build** of the app (EAS `development` profile, or `expo run:android` /
`expo run:ios`).

```bash
# 1. the dev stack: PostgreSQL :54380, API :3100, game server :2667 (leave it running)
node scripts/stack/up.mjs                              # iOS simulator, web
node scripts/stack/up.mjs --public-host 10.0.2.2       # Android emulator: live rooms are told to use 10.0.2.2

# 2. the app, pointed at it (the Android emulator reaches this computer at 10.0.2.2; src/lib/config.ts rewrites
#    localhost to 10.0.2.2 for the API, the game server address comes from the API)
EXPO_PUBLIC_API_URL=http://localhost:3100 npx expo start --dev-client

# 3. check the flows without a device, then run them
node scripts/e2e/lint-flows.mjs
node scripts/e2e/run-maestro.mjs --dry-run             # prints the maestro commands
node scripts/e2e/run-maestro.mjs                       # every numbered flow, in order
node scripts/e2e/run-maestro.mjs e2e/04-qr-pay.yaml    # one flow
node scripts/e2e/run-maestro.mjs --tag money --device emulator-5554
```

A **physical phone** needs the computer's LAN address in `EXPO_PUBLIC_API_URL` and `--public-host`, the phone and the
computer on one network, and the Windows firewall open for ports 3100 and 2667. `run-maestro.mjs --api <url>` sets what
the scripts that play Ben call (the address of the API as this computer sees it).

`pnpm e2e` (`maestro test e2e/`) is not wired to the seed: use `run-maestro.mjs`. (`package.json` is not edited from here.)

## 4. Run the web-capable flows without Maestro

```bash
node scripts/stack/up.mjs
EXPO_PUBLIC_API_URL=http://localhost:3100 npx expo start --web --port 8090    # first time with --clear
node scripts/e2e/web-runner.mjs --all                   # every flow tagged `web`
node scripts/e2e/web-runner.mjs e2e/04-qr-pay.yaml --headed --keep-going
node scripts/e2e/inspect.mjs wallet                     # what is on screen on a route (labels and text): for writing flows
```

Needs Chrome or Edge (or `CHROME_PATH`). It seeds a world per flow, warms the Metro bundle, runs each flow in a fresh
page, prints every step with its time, saves a screenshot of a failure and the labels on screen, and writes
`e2e/.artifacts/web/results.json`. A **subset** of Maestro is implemented (see the top of `web-runner.mjs`): the commands the
flows use (launchApp, openLink, tapOn, inputText, assertVisible, extendedWaitUntil, scrollUntilVisible, runFlow with `when`
and `env`, runScript with a synchronous `http`, evalScript, assertTrue, takeScreenshot, pressKey, back), selectors by text
(a case-insensitive regular expression over the whole label, text or placeholder), `index`, `optional` and `enabled`. A
command it does not know is **skipped loudly**, never passed silently. Two web-only conventions: `platform: Android|iOS`
steps are skipped, and a flow header `env: WEB_LOCAL_STORAGE: 'dev.contacts=deny'` sets localStorage before the app starts.

## 5. Writing flows here

- Select by the **accessibility label or visible text**, never by position: `tapOn: 'Send Dyce Cash'`. The app has almost
  no `testID`s (the one exception is in `TextField`); Maestro matches an accessibility label as text on both platforms.
- Escape regular-expression characters in text: `'Resign this game\?'`, `'Ð500 each'`. The app uses a real minus sign (U+2212) in
  "−Ð500" and curly apostrophes in some copy.
- A control whose label is not unique needs `index`: `Resign` is
  both the menu row and the confirm button, and `Wallet` is the tab and the heading.
- Text fields: tap the **placeholder** (`'803 412 7781'`) (the label focuses the field too since 2026-11-24, but the placeholder is what the flows use).
- A flow that logs in as alice uses `subflows/login.yaml`. Anything that depends on another person goes through the
  scripts in `scripts/`, not a second device.
- Keep `node scripts/e2e/lint-flows.mjs` clean: it checks commands, files, variables, scripts and that every text selector
  exists in the app's source (a typo, or a renamed label, fails the lint before it fails a run).

## 6. What has and has not been run

| Flow | Linted | Executed on web (our runner, headless Chrome, light) | Executed by Maestro | On a device |
| ---- | ------ | ---------------------------------------------------- | ------------------- | ----------- |
| 00 to 12 and 06b | yes | **yes, pass** (see `STATUS.md` for the dated run) | no | no |

Not covered by anything that has run:

- the real **OS permission prompts** (contacts, notifications): the flows answer them for iOS and Android
  (`subflows/os-permission-*.yaml`) with the standard wording, never run;
- **touch** gestures (drag, flick, long press), haptics, the keyboard on a device, safe areas, the 3D scenes' feel;
- **dark mode** in the flows (the web runner has a `--dark` switch; the route walk covers every route in both themes);
- anything needing **two devices at once** (the second person is the API);
- real SMS, real push, the camera QR scan (the QR is paid by code and by the API), biometrics.

## 7. Controls that are hard to select (report for the app teams)

A static audit of every touchable in the app (`node scripts/qa/a11y-audit.mjs`) finds **no touchable without an accessible
name**. These were hard to select, and are worth a `testID` or a distinct label:

- ~~`Request Ð2,000` is the label of both the amount chip and the submit button~~ (fixed 2026-11-24: the chips read `Amount Ð2,000`).
  `Resign` / `Resign and lose Ð500` is still the label of both the game-menu row and the confirm button (`GameMenuSheet`, the resign card).
- ~~The `TextField` label is a separate `Text`, so tapping it does not focus the input~~ (fixed 2026-11-24: tapping the label focuses
  the field; placeholders still work and are what the flows tap).
- The tab bar labels carry the badge (`Chat, 1 unread`), so the text `Chat` only matches the inner label on some platforms.
- On the QR request screen the code ("Code LPPQQ 4VQTI") is plain text with no copy button, so a flow cannot take the code
  from the screen without OCR; the flows read it from the API instead.
- The 3D card table's controls sit under the canvas; a modal ("Ben QA lost connection") covers "Game menu" until dismissed.
