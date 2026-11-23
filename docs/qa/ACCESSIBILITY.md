# Accessibility checks

Owner: qa-engineer. The rules are in `CLAUDE.md` ("Accessibility: every touchable has an accessible label; minimum touch
target 44x44; text respects Dynamic Type up to 1.3x; colour is never the only signal") and `DESIGN_SYSTEM.md`. This file says
how each one is checked, what is automated, and what has to be done with a person and a phone.

## 1. What is automated (run it before every release)

| Check | Command | What it finds |
| ----- | ------- | ------------- |
| Static audit of the source | `node scripts/qa/a11y-audit.mjs` | touchables (`Pressable`, `Touchable*`, `TextInput`, `Switch`) with no `accessibilityLabel` / `aria-label` that are not deliberately hidden from screen readers; `allowFontScaling={false}`; `maxFontSizeMultiplier` under 1.3; images with no label; static touch targets under 44 with no `hitSlop`. Writes `e2e/.artifacts/a11y/a11y-audit.md`. |
| Colour contrast on every route, light and dark | `node scripts/qa/walk-routes.mjs --contrast` | WCAG 2.x ratio of every visible piece of text against the first opaque background behind it (4.5:1, large text 3:1); text over an image or gradient is skipped and counted. Part of `e2e/.artifacts/route-walk/route-walk.md`. |
| Token contrast | `pnpm test` (`packages/ui/src/tokens.test.ts`) | the design tokens' text / background pairs |
| Unlabelled controls on rendered pages | `scripts/qa/walk-routes.mjs` | the "Unlabelled controls" column: controls on screen with neither an accessible name nor text |
| Selectors exist | `node scripts/e2e/lint-flows.mjs` | every label a flow selects still exists in the source (a renamed label also breaks screen-reader users' muscle memory) |

### Result of the static audit (2026-11-23, 60 routes' worth of source)

- **0** touchables without an accessible name. (A gesture surface behind a named control, `Stage3D.tsx` and `MessageBubble.tsx`, is
  deliberately hidden from screen readers and is not counted.)
- **0** images without a label; **0** static touch targets under 44.
- **17** `allowFontScaling={false}`: all board glyphs, where the text is part of a drawing (`AnagramsArt.tsx:45`,
  `AnagramsBoard.tsx:395,437`, `CheckersBoard.tsx:236,244,266,277`, `ChessBoard.tsx:286,297`, `DartsBoard.tsx:267`,
  `DotsBoard.tsx:207`, `WordHuntArt.tsx:53`, `WordHuntGrid.tsx:158`, `WordTilesArt.tsx:33`, `WordTilesBoard.tsx:604,644,654`). Dynamic Type
  cannot be honoured inside a fixed-size tile, so these need the **device check in section 4**: is the information they carry
  also in the screen-reader labels and the move lists? (Per STATUS the boards have labelled squares and "Move list" / "Line list".)
- **1** `maxFontSizeMultiplier` under 1.3: `src/features/spaces/party/components/PartyChrome.tsx:173` is 1.15. Either raise it to
  1.3 or record the exception.

## 2. Colour contrast

The route walk with `--contrast` (2026-11-23, 390x844, light and dark) checked **1,864 pieces of text** on 120 page loads against
WCAG 2.x AA (4.5:1, large text 3:1): **51 fell short, on 22 of the 120 page loads** (full per-page table:
`ROUTE_WALK_2026-11-23.md`). Text over an image or gradient cannot be judged from computed colours, and several of the
findings are exactly that (below), so read the list as "look at these", not "these fail".

**Probably real (a design-system decision; `tokens.test.ts` only tests the pairs it lists):**

- **The money green `rgb(23,131,79)` on the beige card and chip surfaces: 4.07:1 and 4.24:1** (needs 4.5) at 13 to 17 px: `₦0`,
  `+ ₦100`, "Earned 23 Nov", "Host · Ready", "Free", "Free game", "Friend", "Received" (`/wallet`, `/profile`, `/profile/badges`, `/pool-rules`,
  `/space/<id>`, `/u/<name>`, `/wallet/receipt/<id>`, `/i/<token>`). The token test covers money text on the background only, not on the card colours.
- **White on the bright green `#2BB673`: 2.61:1** ("1st" rank badge, `/profile`, `/profile/badges`, both themes) and **white on `#13985A`:
  3.71:1** ("Counting up…", `/space/<id>/result`).
- **White on the slate badge `#7C8597`: 3.71:1 at 10 px** (the "#" and "W" markers, `/profile`, `/notifications`, both themes) and **white on brass
  `#B37A00`: 3.68:1** ("4+", `/profile`, both themes).
- **Dark mode: the danger red `#E0455E` on `#1D1916`: 4.31:1** ("Report @name", "Block @name", `/chat-info`), just under 4.5.
- **The numbered steps on the invite join screen**: white on `#ABA196`: 2.54:1 (`/i/<token>/join`, dark).

**Probably false positives (text over art or a gradient, which the check cannot see):** white text on the wallet's hero card and the
money cards in chat ("Dyce Cash", "Virtual cash for play", "BEN QA SENT YOU", "₦200.1k", "+ ₦20,000", "Request", "History": 1.05 to
1.8:1 against the page colour, but they sit on a dark gradient); the guest game's header ("Word Hunt", the rules bullets, 1.1 to 2.4:1);
the game art tiles (white "G", "A", "N" on the ember orange, 3.68:1, decorative letters in a drawing).

**Not checked:** the 3D scenes and any text drawn in a canvas; hover and focus states; text inside the WebGL boards; the pages in
other viewport sizes. Re-run with `--width 320 --height 568` and after every token change.

## 3. Screen reader pass (VoiceOver on iOS, TalkBack on Android)

Never run so far (no device). Every screen **and every new screen from now on** gets this pass, in **light and dark**, with the
screen reader on and the screen off (curtain) to prove nothing depends on seeing it.

For each screen:

1. Swipe through every element: each says what it is and what it does ("Send Dyce Cash, button"), in reading order that matches
   the visual order, with no "button" / unlabelled stops and no element read twice.
2. Every state is announced without sight: balance changes, "Sent" / "Read", "Paid", the timer ("21 seconds left"), whose turn
   it is, a refused move, an offline banner. Live regions (`accessibilityLiveRegion`) are on the error and status lines.
3. Modals and sheets trap focus (the games drawer, the mode sheet, the message menu, the resign card): focus moves in on open
   and back on close; the back gesture closes them.
4. Forms: each field says its label and its error; the OTP field says "Verification code"; the country button says
   "Country: Nigeria +234. Change".
5. Custom controls expose their role and state: tabs (`selected`), switches (`checked`), radio groups (the Free / Pool
   choice, stakes), sliders (value and range; the 3D sports controls), the Segmented control.

Screens that need most care: the **chat list** (rows carry name, unread count, preview and time in one label), **message
bubbles** (who, text, time, reactions, quoted reply), the **wallet amount pad** and the QR request screen, the **Games drawer**
(23 tiles with "How to play"), **every game board** (the squares, pits, tokens, ships and the move lists), the **3D card
table** (the "Cards" list sheet is the non-visual way to play: play a whole Whot game with it), the **party screens**
(role cards must not be read aloud to the room: check the "tap to peek" behaviour with sound), the **Doodle canvas** (the
drawer cannot draw without sight; guessers need the guess field and the feed).

## 4. Dynamic Type 1.3x (iOS) and font scale 1.3 (Android)

Set the system text size to the largest value the app promises (iOS: Settings > Accessibility > Display & Text Size > Larger Text,
slide to the step that reads 1.3x; Android: Settings > Display > Font size, then a font scale of 1.3 with `adb shell settings put
system font_scale 1.3`). Then, on the smallest phone of the matrix, light and dark:

- no text is clipped, overlaps another or is cut off at the screen edge; buttons grow instead of truncating their label;
- every touch target stays at least 44x44 after scaling;
- scrolling still reaches every control (the sheets, the mode sheet with the stake chips, the settings list);
- the **board glyphs** (`allowFontScaling={false}`) still fit their tiles, and the labels and move lists carry the same
  information;
- the 3D tables' HUD chips, the party screens at 360 pt wide, the OTP boxes, the tab bar, the keypad.

Also **Bold Text** (iOS), **Reduce Motion** (every animation skips: the 3D tables' deal and flights, the sowing, the dice),
**Reduce Transparency / high contrast** (the glass surfaces keep readable text), **Increase Contrast**, **Invert colours**
(nothing carries meaning by colour only), **Left-handed / one-handed** use (the primary action of each screen is reachable
at the bottom).

## 5. Colour is never the only signal

Check by eye with a greyscale filter (iOS: Colour Filters > Greyscale; Android: Simulate colour space > Monochromacy): the
Free / Pool badge, the playable cards and legal squares (rings and dots, not just colour), the red / green on a result, a
hit and a miss in Sea Battle, the player to move, "Paid" / "Waiting", the online and offline marks, the Whot suits (shapes
as well as colour), Filler's colours (it is a colour game: labelled buttons carry the names).

## 6. Touch targets

The static audit checks sizes written in the source. On a device, turn on the OS "Show touch targets" overlay
(Android Developer options > Pointer location) or use Accessibility Inspector (Xcode) and tap the small things: the message
reactions, the filter chips, the stake chips, the board squares on a 320 pt phone (Chess is 38 pt there, with a Move button
to confirm), the close buttons on sheets, the tab bar's search button.

## 7. Web

The guest web game (`/i/<token>`) is the one place real people meet Dyce without installing it. On web check the keyboard
only: Tab order, visible focus, Enter and Space on buttons, Escape closing the sheets, no keyboard trap; browser zoom to 200%;
and a screen reader (NVDA with Firefox or Chrome, VoiceOver with Safari). `scripts/qa/walk-routes.mjs` and `e2e/` cover
the rendering, not the reading experience.
