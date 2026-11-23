# Device matrix, 3G and low-end Android test plan

Owner: qa-engineer. Nothing in this file has been run on a phone: no device, emulator or simulator was available when it
was written, so it is a **plan with the commands to run it**, plus what the web build can already tell us (section 6).
The budgets come from `TEST_PLAN.md` section 4 and are the product's targets for Nigeria first.

## 1. Budgets (the pass / fail lines)

| Budget                  | Line                                                       | Measured with                                      |
| ----------------------- | ---------------------------------------------------------- | -------------------------------------------------- |
| 3D scenes               | at least 50 fps on the 3-4 GB mid-range Android            | the dev frame meters, then `gfxinfo` / Perfetto    |
| Cold start              | under 3 s to the chat list on that device                  | `adb shell am start -W`, Instruments (App Launch)  |
| Chat list               | 60 fps scrolling with 500 conversations                    | seeded account, `gfxinfo` janky-frames %           |
| 3G (400 kbps, 400 ms RTT) | chat usable; a game move resolves in under 2 s           | throttled network, stopwatch from video            |
| Memory                  | a 3D table open for 10 minutes does not grow past the OS kill line on 3 GB | Android Studio profiler / `dumpsys meminfo` |
| Text                    | Dynamic Type / font scale up to 1.3x, nothing clipped      | section 5 of `ACCESSIBILITY.md`                    |
| Themes                  | light **and** dark on every screen                         | `scripts/qa/walk-routes.mjs` for web, by eye on devices |

## 2. Devices

Buy or borrow the real thing; emulators are for logic and layout only (no real GPU, touch or thermal behaviour).

| Slot | Why | Examples to look for (confirm against the analytics of the first beta) |
| ---- | --- | --- |
| **Low-end Android, 3 to 4 GB RAM, Android 11 to 13, a 720p screen** | The performance target. Nigeria first. | Tecno Spark / Camon, Infinix Hot / Smart, Samsung Galaxy A0x / A1x, Itel. Pick one with a Mali-G52 / PowerVR class GPU. |
| Mid-range Android, 6 GB, current OS | The common case | Samsung Galaxy A-series, Redmi Note |
| Pixel-class Android, current and previous OS | The reference | any Pixel |
| Small Android, about 320 to 360 pt wide | Layout floor (Word Tiles squares, Chess at 38 pt, party screens at 360 pt) | any 5-inch device |
| iPhone, latest and latest minus 2 | Reference | |
| iPhone SE class (4.7 inch) | Layout floor, small touch targets | iPhone SE 2 / 3 |
| Large iPhone (Max) | Layout ceiling | |
| A tablet, once, portrait | The app is portrait and `supportsTablet` is false: confirm it is letterboxed, not broken | |

Run every session on: the **dev client** build first (EAS `development` profile), then the **preview** build before a
release. A developer build is slower than production: a number that fails on the dev client is re-measured on `preview`
before it is called a failure.

## 3. Low-end Android pass (do this on the 3 to 4 GB device)

Before starting: battery above 50%, not charging, brightness fixed, airplane mode off, the app force-stopped, **Battery
saver off** (note it if it is on in the field), 10 minutes since the device last ran anything heavy (thermal).

1. **Cold start.** Force-stop, then `adb shell am start -W -n <package>/<activity>` five times; take the median `TotalTime`
   and, from `adb logcat -s ReactNativeJS`, the time until the chat list text appears. Also time it from the launcher
   with a screen recording at 60 fps (frame count / 60). Record signed-out (Welcome) and signed-in (chat list) separately.
2. **Chat list with 500 conversations.** Seed with `node scripts/seed/seed.mjs` plus a script that opens 500 direct chats
   (the load scripts have the helpers: `scripts/lib/api.mjs`). Fling-scroll top to bottom five times with
   `adb shell dumpsys gfxinfo <package> reset` before and `dumpsys gfxinfo <package>` after: janky frames under 5%.
3. **Each 3D game, one match each** (Cup Pong, 8 Ball, Darts, Basketball, Archery, Sea Battle, Ayo, Ludo, the Whot and
   Crazy Cards table). The dev meters are on `globalThis`: `__cardTable`, `__eightBall`, `__darts`, `__basketball`,
   `__archery`, `__ayo`, `__ludo` (average and worst frame, draw calls, triangles). Open the JS console over
   `adb forward` / Hermes inspector, play a full turn and read the meter. Pass: average frame at 20 ms or under (50 fps).
   Note the thermal state after 10 minutes of play: fps in minute 1 and minute 10.
4. **Memory.** `adb shell dumpsys meminfo <package>` at the chat list, after opening a 3D table, and after ten matches in
   a row (open, play a move, back). The number must plateau. A steady climb is a leak: report the scene.
5. **A lost GL context.** Open a 3D table, press Home for 30 seconds, return; then do it while a call comes in. The table
   must come back or fall back to the flat view, never a black screen.
6. **Doodle canvas.** A drawer making a full 4,000-point drawing while the other seats watch, on this device both as
   drawer and as watcher; also on the 3G profile below.
7. **Low storage and kill.** With under 500 MB free, and after `adb shell am kill <package>` mid-match, the app returns to
   the match (live rooms reconnect for 60 s; async matches reload).
8. **Hermes determinism.** Open the `_dev/determinism` screen (`app/dev/determinism.tsx`): it must read PASS on this
   device. The physics games (Cup Pong, 8 Ball, Mini Golf, Tanks, Basketball, Darts, Archery) depend on it.

## 4. 3G profile

Target link: **400 kbps down and up, 400 ms RTT** (about 50 KB/s). Chat must be usable and a game move must resolve in
under 2 seconds.

How to impose it (pick what you have):

- **iOS:** Settings > Developer > Network Link Conditioner, profile "3G" (and a custom 400 kbps / 400 ms one).
- **Android emulator:** `emulator -netspeed umts -netdelay umts` (the closest built-in profile; it is not exactly 400/400).
- **Android device:** a laptop hotspot shaped with Clumsy (Windows), `tc netem` + `tbf` (Linux), or the Network Link
  Conditioner on a Mac sharing its connection: `tc qdisc add dev <if> root netem delay 400ms rate 400kbit`.
- **Web build in Chrome:** DevTools > Network > a custom profile of 400 kbps / 400 kbps / 400 ms (the built-in "Slow 3G" is
  400 kbps with 2,000 ms RTT: harsher than the target; use it as a worst case). Apply it **after** the bundle has loaded:
  the development bundle is many megabytes and would take minutes. Throttling does not shape WebSockets in Chrome.

What to do on it (stopwatch from a screen recording; five tries each, report the median and the worst):

| Task | Pass |
| ---- | ---- |
| Open the app signed in, chat list visible | under 8 s (cold start on a 3G link has to fetch lists; no spinner forever) |
| Open a thread with 30 messages | messages visible in under 3 s |
| Send a message | the bubble appears at once (optimistic) and turns "Sent" under 2 s; **Retry** appears if it fails |
| A message from a friend arrives | under 3 s over the socket |
| Play a Pig / Word Hunt / Cup Pong move | the server's answer under 2 s; the board never freezes on a spinner |
| Open the Games drawer | tiles and text under 3 s; thumbnails may fill in later |
| Scan / pay a QR request | under 4 s end to end |
| Join a Whot space by code | lobby under 4 s, a live seat connected under 5 s |
| Watch a Doodle drawing | measured: a full 4,000-point drawing is about 45 KB to 113 KB per watcher (`scripts/load/RESULTS.md`), so about 1 to 2.5 s of the link; the picture must keep up with the drawer |
| Signal drop: airplane mode 10 s, then back | the app says it is offline, reconnects by itself, nothing is lost or sent twice |
| 100% packet loss for 20 s mid-match, then restore | a live table shows "lost connection" and recovers; async move retried once, not twice |

Also run the whole list once on **Wi-Fi with 5% packet loss** and once while **switching Wi-Fi to cellular** (a real
Nigerian pattern: dropped connections and changing IPs).

## 5. The regression run on the matrix

Per release candidate (see `REGRESSION.md`): all Maestro flows on one iOS and one Android device (`e2e/README.md`), then
the manual checks that Maestro cannot do (camera scan, push, biometrics, real SMS, haptics, 3D feel). Record the matrix of
what ran where in the sign-off report for the phase.

## 6. What the web build already tells us (measured, 2026-11-23)

This is a development build in headless Chrome on a laptop: it says nothing about phones.

- Every route of the app loads in light and dark with no blank page, uncaught exception or failed request (60 routes, 120 page
  loads; `scripts/qa/walk-routes.mjs`, see `REGRESSION.md`), apart from `/games/issue` opened without its `matchId` (BUG-3).
- The web export's sizes from the release work (STATUS): about 1.1 MB entry and 3.6 MB shared chunk (all boards and three.js
  in one chunk). That chunk is the first thing to watch on 3G for the guest web game.
- The realtime numbers that matter for 3G are in `scripts/load/RESULTS.md`: Doodle canvas bytes per watcher, chat message
  size, the 3.6 to 4.2 canvas messages a second.

## 7. Report format

One row per device in the phase sign-off report: device, OS, build (profile and commit), cold start median, chat list
jank %, fps per 3D game (average and worst), memory after 10 matches, 3G table results, determinism PASS / FAIL, and the
bugs filed. A budget that is missed is a bug with the number in the title.
