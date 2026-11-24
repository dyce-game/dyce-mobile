# Apple compliance review: App Store Review Guidelines, privacy and platform rules

Review date: 2026-11-24. App: Dyce (Expo SDK 58, `games.dyce.app`), both repositories. Branch `feat/email-auth`.

This is the register of every place the app was checked against Apple's rules, what was found, what was fixed in this change and what
still needs a person. It is meant to be read by whoever submits the app, and kept up to date: change a row when its status changes.

## 1. What this review is, and what it is not

**Sources actually read.** The App Review Guidelines page (developer.apple.com/app-store/review/guidelines, shown as last updated
2026-10-16), read in full: sections 1.1 to 5.6 and the introduction. Apple's "upcoming requirements" page (dated entries up to
2026-09-09). Search results on privacy manifests and the Expo privacy guide.

**Not verified, and why.** Treat these as open until someone checks them in App Store Connect or the live pages:
- The **age-rating questionnaire**: Apple's page could not be read verbatim. The tiers (4+, 9+, 13+, 16+, 18+) and the idea that "simulated
  gambling" raises the rating are from a summary, not Apple's text. The mapping in section 6 is a **working assumption**.
- **Privacy manifest** reference pages (key names, reason codes) returned only a title. The manifest in `app.config.ts` follows Expo's
  documented `ios.privacyManifests` shape; Xcode and App Store Connect will report anything missing at upload.
- The **Human Interface Guidelines** were not fetched. Section 8 lists the HIG items checked from the code, not from the HIG text.
- **Declared Age Range and state "app store accountability" laws**: Apple's requirements page did not list them. Nothing here is a legal
  opinion; section 7 flags them for counsel.
- Nothing was run on an iPhone, the App Store Connect forms were not seen, and no Apple account exists yet.

**Status words.** **OK** = the code and docs meet it as far as can be told without a device. **Fixed** = changed in this review.
**Open (human)** = needs a person, an account or a file we cannot make. **Decision** = the product owner chooses; see section 9.
**N/A** = does not apply to this app.

## 2. Summary

| Result | Count |
|---|---|
| Fixed in this review | 9 |
| Open: blocks submission until a person does it | 7 |
| Decisions (4 of 5 taken 2026-11-24; D4 push content stays as is for v1) | 5 |
| Open: lower risk, schedule before launch | 8 |

`pnpm release:check --store` lists the machine-checkable blockers (icon, splash, draft legal text, support and policy addresses) and fails
until they are closed. A normal `pnpm release:check` (CI) prints them as a warning only.

## 3. Fixed in this review

| # | Guideline | Gap found | Fix | Where |
|---|---|---|---|---|
| F1 | 1.2, 1.5 | The Help screen said "Dyce has no support inbox yet". Apple requires published contact information in the app. | Help > **Contact us**: Email support (mail to the configured address), Privacy Policy and Terms on the web. Address is `EXPO_PUBLIC_SUPPORT_EMAIL`, default `support@dyce.games` (**the mailbox must be created**, B3). | `HelpScreen.tsx`, `lib/config.ts`, `app.config.ts` |
| F2 | 1.2 | No way to report or block someone from inside a Space (strangers meet there). Report existed only in chat, profile and the async game menu. | Every other player in the Space lobby has **Report** (opens the Report screen with Block). The live table itself is still open (M1). | `SpaceScreen.tsx` |
| F3 | 1.2 | No filter for objectionable material before it is posted (only requests had a spam filter; live-room chat had a thin word list). | A shared objectionable-text filter enforced **on the server** for usernames, display names, group, space and poll titles (slurs, exploitation terms, calls to self-harm and ordinary profanity) and for chat messages (slurs, exploitation, self-harm; friends may still swear). Seen through spacing, punctuation, repeated letters and look-alike digits; tested not to block "Nigeria", "Niger", "Scunthorpe", "Kikelomo", "Pedro". The app explains a refusal and checks names before sending. | `packages/shared/src/content-filter.ts` (+ test), schemas in `packages/shared/src/schemas/`, `messages.ts`, `profile-logic.ts` |
| F4 | 5.1.1(ii) | Usage analytics and crash reports were sent without consent and with no way to withdraw it. | **Settings > Privacy: Share usage and crash data.** In a store build it starts **off**; in beta builds it starts on. Turning it off stops sending at once, closes Sentry and drops queued events. Matches `STORE_PRIVACY_ANSWERS.md` ("only when analytics is on"). | `lib/privacy-consent*.ts`, `lib/analytics.ts`, `lib/monitoring.ts`, `PrivacySettings.tsx` |
| F5 | Privacy manifest (required since 2024-05-01), 5.1.1(i) | No privacy manifest declared; tracking not stated. | `ios.privacyManifests`: `NSPrivacyTracking` false, no tracking domains, collected data types matching the App Privacy answers (linked, app functionality; analytics and crash data unlinked and consent-based). Expo modules and Sentry add their own required-reason entries. `release:check` fails if it is removed. | `app.config.ts`, `tools/release/check-release-config.mjs` |
| F6 | 2.3.10 | The Welcome screen said "iPhone or Android"; store copy for both stores named Android; the invite page offered "Get it on Android" inside the iPhone app. | Welcome: "Play anyone, on any phone." The iPhone app never shows the Android store button. `STORE_LISTING.md` shared text says "any phone" and carries a standing rule. | `WelcomeScreen.tsx`, `InviteLandingScreen.tsx`, `STORE_LISTING.md` |
| F7 | 5.1.2(v) | SMS invites went out from Dyce without showing the person what the message says or who it appears to come from. | The invite list shows the exact text, that each invite is one text sent only when tapped, and that it does not come from their phone number. There is no "invite all" and nothing is pre-selected. | `InviteSection.tsx` |
| F8 | 2.1(a) | App Review cannot receive an SMS or an email, so it could not sign in. | **`REVIEW_LOGINS`** on the API: up to four demo identities (a number or an email) that accept their own fixed code; nothing is sent; limits still apply; ordinary account. Tested on PostgreSQL. Reviewer notes drafted. | `apps/api/src/auth/review-logins.ts`, `db/tests/review-login.test.ts`, `docs/APP_REVIEW_NOTES.md` |
| F9 | 2.1(a), 2.3, 5.1.1 | Nothing stopped a store submission with missing or placeholder items. | `pnpm release:check --store` fails on: no icon, no splash, DRAFT legal text, support and policy addresses unset. It also fails if the iOS name or description names another platform, or the privacy manifest is missing. | `tools/release/check-release-config.mjs` |

## 4. Open: blocks submission until a person acts

| # | Guideline | What is missing | Who | How to close |
|---|---|---|---|---|
| B1 | 2.1(a), upload | **App icon and splash screen.** `app.config.ts` has neither; App Store Connect rejects an upload without an icon. | designer | `docs/SETUP_GUIDE.md` section 8; then `pnpm release:check --store` |
| B2 | 2.1(a), 5.1.1(i) | **The in-app Terms, Privacy notice, Pool rules and community guidelines are marked DRAFT** and say so on screen. Placeholder text is a rejection reason. | counsel | `RELEASE_CHECKLIST` L1; replace `legal-copy.ts`; the check clears when the draft notice is gone |
| B3 | 5.1.1(i), 1.2, 1.5 | **Hosted Privacy Policy and Terms pages** (`https://dyce.games/privacy`, `/terms`), and a **working support mailbox** (`support@dyce.games`). App Store Connect needs the URLs and the Support URL; the app now links to all three. The policy must name every processor (Sentry, PostHog, Resend, Termii, Twilio, Expo, the host and database), what is kept and for how long, and how consent is withdrawn (Settings > Privacy). | owner + counsel | `SETUP_GUIDE` sections 4 and 10 |
| B4 | 2.1(a) | **Demo accounts for the reviewer**: set `REVIEW_LOGINS` in the production API with two identities (one reviewer needs a second player), put the same values in App Review notes. | owner | `docs/APP_REVIEW_NOTES.md` |
| B5 | 2.1 | **Live backend during review**: the production API, game server, database, SMS and email must be up the whole review. Today none is deployed. | owner | `SETUP_GUIDE` sections 3 to 5 |
| B6 | 5.1.1(ix), 5.3 | **The developer account should be an organisation.** Apps in regulated fields (gambling is named) must be submitted by a legal entity providing the service. Pools are simulated gambling, so expect the question. | owner | enrol as an organisation (needs a D-U-N-S number) |
| B7 | 2.3.6, 5.3 | **Age rating answers** for simulated gambling, contests, user-generated content, messaging. See section 6 and decision D1. | owner | App Store Connect questionnaire, using `STORE_PRIVACY_ANSWERS.md` and section 6 |

## 5. Guideline by guideline

### 1. Safety

| Rule | Finding | Status |
|---|---|---|
| 1.1 Objectionable content (1.1.1 to 1.1.7) | Games are cartoon or abstract. Imposter, Werewolf and Mafia are fictional social-deduction games with no depiction of killing; Tanks, Archery, Darts and Cup Pong are sport or arcade. No sexual content. No real-person likeness (marketing images need a likeness check, `SETUP_GUIDE` 8). Names must not use real entities as "enemies": none do. | OK |
| 1.1.6 false information | Dyce Cash is plainly labelled virtual. No fake-tracker or prank features. | OK |
| **1.2 User-generated content** | Four required safeguards. **Filter before posting:** F3 (server-enforced; live-room chat has a thinner one, M2). **Report with timely response:** Report from chat, profile, game menu and now the Space lobby (F2); a person reads every report; the moderation queue and hold tools exist (backend ADR-039); an outcome notice is sent to the reporter. **Block:** exists (Settings > Blocked people, report-and-block). **Published contact:** F1, mailbox is B3. Strangers never reach Chat (Requests first), which Apple likes. | Fixed, with B3 open and M1 open |
| 1.2 "Chatroulette-style" ban | Quick match pairs strangers **for a game** with no open chat; live-room chat exists only inside a room and is filtered. This is not random video or text roulette. State it in the review notes. | OK, explain in notes |
| 1.3 Kids | Not in the Kids category; no "for kids" wording. Pools are 18+. | N/A |
| 1.4 Physical harm | No medical, drug, or dangerous-challenge features. | N/A |
| 1.5 Developer information | Support contact in the app (F1); mailbox open (B3). | Fixed, B3 open |
| 1.6 Data security | TLS everywhere, tokens in the Keychain (`expo-secure-store`), identities stored only as keyed hashes, secrets never in the app, server logs redact numbers and addresses, ledger invariants checked nightly. Rotation of the credential found in git history is still owed. | OK, one human item (`SETUP_GUIDE` 12) |
| 1.7 Reporting criminal activity | No. | N/A |

### 2. Performance

| Rule | Finding | Status |
|---|---|---|
| 2.1(a) Completeness and demo account | Fixed demo login (F8) and release gate (F9); icon, draft legal text and live backend are open (B1, B2, B5). Sentences that read as unfinished are not shown to players (the "coming soon" tiles are dev-build only). | Open (human) |
| 2.1(b) In-app purchases | There are none. | N/A |
| 2.2 Beta testing | Beta goes through TestFlight. Preview builds are internal distribution. A beta must obey these rules too; the consent default (on in beta) is explained in Settings. | OK |
| 2.3.1 Accurate metadata, Notes for Review | `APP_REVIEW_NOTES.md` drafted: virtual currency, simulated gambling, strangers, account deletion. The "never imply winnings" rule is in `STORE_LISTING.md`. | Fixed |
| 2.3.3 Screenshots show the app in use | Screenshot plan uses real screens. | Open until made (`SETUP_GUIDE` 8) |
| 2.3.6 Age rating honest | Section 6, D1. | Decision |
| 2.3.7 Name and keywords | "Dyce: Games with Friends" is 24 of 30 characters. Keywords are generic game names. **"8 ball" and "Whot" are game names, not brands; "Ayo" and "Ludo" are traditional.** Do not add competitor names. Check "Crazy Cards" and the Word Tiles name for trademarks (H10). | OK, H10 open |
| 2.3.8 Metadata suits 4+ | Rule added to `STORE_LISTING.md`: no gambling imagery in icon, screenshots or previews. | Fixed |
| 2.3.10 Other platforms | F6. | Fixed |
| 2.4.1 iPhone apps should run on iPad | `supportsTablet: false`: the app runs on iPad in iPhone compatibility mode. Apple says "whenever possible". | Decision D3 |
| 2.4.2 Battery and heat | 3D games and Skia boards are the risk; no frame-rate or heat measurement exists (never run on a device). | Open (M5) |
| 2.5.1 Public APIs only | Expo SDK modules only. | OK |
| 2.5.2 No downloaded code | OTA updates (EAS Update) ship JavaScript bundles that the build already contains the runtime for, which Apple allows; the fingerprint runtime version stops an update reaching a build with different native code. No code is fetched at run time. | OK |
| 2.5.4 Background services | No background modes declared; push only. | OK |
| 2.5.5 IPv6-only networks | All production URLs are host names, not addresses. Test once on a NAT64 network. | Open (M6) |
| 2.5.14 Recording consent | No camera, microphone or screen recording in this build. `release:check` fails if a permission string is declared without its library. | OK |
| 2.5.19 Hidden features | Dev-only switches (the web `dev.contacts` flag, the dev tiles, the determinism screen) are behind development builds. `REVIEW_LOGINS` is a documented demo login, not a hidden feature: it is described in the review notes. | OK, tell Apple in the notes |

### 3. Business

| Rule | Finding | Status |
|---|---|---|
| 3.1.1 In-app purchase | No purchase of any kind. **Dyce Cash cannot be bought, sold or withdrawn**, so there is nothing to unlock with payment. Credits do not expire. QR codes carry payment requests of virtual cash, not unlocks. | OK |
| 3.1.1 loot boxes | None. | N/A |
| 3.1.2 Subscriptions, 3.1.3 other methods, 3.1.4, 3.1.5 crypto | None. | N/A |
| 3.2.1(vii) gifts between individuals | Sending Dyce Cash to a friend is a transfer of a virtual unit with no cash value. | OK |
| 3.2.2(v) restricting by location | No region lock in the app. (A store-availability decision is separate.) | OK |
| 3.2.2(x) forcing ratings | No rating prompt, no forced action. | OK |
| 3.2.2(vii) manipulating rank | None. | OK |
| Wallet naming | A tab named "Wallet", "Send money", "Pay" and a ₦ amount can make a reviewer think the money is real. The balance card already says it is virtual. | Decision D2 |

### 4. Design

| Rule | Finding | Status |
|---|---|---|
| 4.1 Copycats, 4.1(c) | Original name, art and avatars. "Crazy Cards" is a different name from the game it resembles; no other app's art is used (the design rules forbid it). | OK |
| 4.2 Minimum functionality | A native app with real-time play, chat and a ledger: not a repackaged site. The web build is the invite guest game only. | OK |
| 4.2.3(ii) First-launch downloads | No resource download was found in the code (games and avatars are bundled). Re-check when the 3D avatar rig arrives. | OK, re-check |
| 4.3 Spam | There are many games, but one app. Not a template. | OK |
| 4.5.4 Push | Push is never required to use the app; the notification step can be skipped; no marketing pushes exist (and none should be added without an opt-in). Push text shows a friend's name and **Dyce Cash amounts** on the lock screen, which are not sensitive in Apple's sense but are private to some users. | OK; D4 (optional hiding) |
| 4.5.6 Apple emoji | Reactions use system Unicode emoji (allowed). No emoji image is bundled. | OK |
| **4.8 Login services** | The app uses **only its own account system** (phone or email plus a one-time code). That is exactly the exemption in 4.8, so **Sign in with Apple is not required**. If a Google, Facebook or other third-party login is ever added, Sign in with Apple must be added with it. | OK, standing rule |
| 4.10 Monetising built-in capabilities | None. | OK |

### 5. Legal

| Rule | Finding | Status |
|---|---|---|
| 5.1.1(i) Privacy policy | In-app link (Help and legal, draft) and web links added (F1); hosted pages and final text open (B2, B3). Must also state retention and deletion, and how to withdraw consent. | Open (human) |
| **5.1.1(ii) Consent** | F4 for analytics and crash data. Contacts: the iOS permission prompt, with a purpose string that states what happens. Notifications: the system prompt, skippable. | Fixed |
| 5.1.1(iii) Data minimisation | Contacts are optional; only hashed matches are kept (never numbers of people who are not on Dyce); birth year only for the 18+ check; no location, camera or photos. The iOS 18 "limited contacts" choice should be tried on a device (M7). | OK, M7 |
| 5.1.1(iv) Alternatives if refused | Contacts denied: find friends by username; notifications denied: in-app list. | OK |
| **5.1.1(v) Account deletion** | Settings > Delete account (30-day grace, then anonymised and personal data erased), and Download my data. Email and phone are cleared too (backend ADR-044). Easy to find; works without contacting support. | OK |
| 5.1.1(ix) Regulated fields | B6. | Open (human) |
| 5.1.1(x) Optional contact info | Email and phone are alternative sign-in methods; neither is forced for features. | OK |
| 5.1.2(i) Sharing, ATT | Data goes only to the processors that run the service; **nothing is used to track people across other companies' apps**, so no App Tracking Transparency prompt is needed and none is shown. `release:check` fails if a tracking purpose string appears without a real flow. | OK |
| 5.1.2(iv) No contact database | Raw numbers are not stored; only who-matched-whom among people already on Dyce. | OK |
| **5.1.2(v) Messaging a person's contacts** | F7: one text per tap, preview shown, nothing pre-selected, no "select all", the sender's name is shown, and per-sender and per-number daily limits exist. | Fixed |
| 5.1.3 Health | No health data. | N/A |
| 5.1.4 Kids | App is not for children; age gate. | N/A (see section 7) |
| 5.1.5 Location | None collected. | N/A |
| 5.2 Intellectual property | Never uses the names Uno or Scrabble (a unit test guards it). Game names are traditional or generic. No Apple marks suggest endorsement. | OK |
| **5.3 Gaming, gambling** | Pools are **simulated** gambling: stakes and winnings are Dyce Cash, which cannot be bought, sold or withdrawn, so 5.3.3 (no IAP for real-money gaming) and 5.3.4 (real-money gaming needs licences and geo-fencing) do not apply as written. Apple can still treat this as simulated gambling for the age rating and may ask questions: answer them in the review notes (section 6). Pools are hidden for under 18s. No sweepstakes, lotteries or prizes of value. | OK, with B6, B7, D1 |
| 5.6 Developer code of conduct | Nothing in the app applies. Respond to App Store reviews politely. | N/A |

## 6. Age rating and "simulated gambling" (working assumption, verify)

From the questionnaire summary that could be read (not Apple's verbatim text): the tiers are 4+, 9+, 13+, 16+, 18+; **simulated gambling
raises the rating (13+ if infrequent, 18+ if frequent)**; unrestricted web access, user-generated content, messaging and chat, and contests
each have their own questions. Dyce's honest answers:

| Question | Dyce's answer | Why |
|---|---|---|
| Simulated gambling | **Frequent** (Pools are a core feature, staked every game) | the cautious answer; leads to **18+** |
| Real gambling, contests, loot boxes | No | no real money, no prizes of value, no randomised purchases |
| User-generated content | Yes | names, messages, drawings in live rooms |
| Messaging and chat | Yes | friends, groups, strangers in Requests and rooms |
| Unrestricted web access | No | the app opens only Dyce pages and the policy pages |
| Parental controls, age assurance | Age gate by birth year for Pools | not a parental-control feature |
| Profanity | Infrequent | users can type it to friends |

If the app is rated **18+ for everyone**, the "Pools hidden under 18" rule and the age gate become belt-and-braces, and nobody under 18 can
download it. If the owner wants a 13+ or 16+ app, Pools would have to be **removed from the iPhone build** for the rating to hold (D1).

## 7. Things counsel or the owner should look at (not guideline text)

- **Age assurance laws.** Several US states have app-store accountability laws, and Apple has a Declared Age Range framework. Apple's
  requirements page, as read, did not list them. Ask counsel whether any applies to a Nigeria-first app that may be sold in the US, and
  whether Dyce must read the declared age range (today the age gate asks for a birth year).
- **EU.** Selling in the EU requires the **trader status** declared and verified in App Store Connect (otherwise the app is not shown there),
  and the Digital Services Act contact details. If the app launches in Nigeria only, leave the EU storefronts off.
- **Nigeria.** The gambling-law opinion (L3, L4) and the NDPA registration (L2) are still open, and Apple may ask which jurisdictions Pools
  are lawful in.
- **Beta testers** (TestFlight) fall under the same rules as the public; the consent default is "on" in beta because testers are told so.

## 8. Human Interface Guidelines: what was checked from the code

Not checked against the HIG text (see section 1). From the code: dark and light follow the device; touch targets are at least 44 points (a
static audit has no failures); Dynamic Type is respected up to 1.3x; no colour-only signals; haptics are used lightly; safe areas are used
on every screen; the back swipe works because screens are real routes. **Not checked:** the custom glass tab bar against iOS 26's own tab
bar behaviour (the project rule keeps a custom bar; revisit if review objects), VoiceOver on a device, the Liquid Glass look, large screens.

## 9. Decisions for the product owner

| # | Question | Options | Recommendation |
|---|---|---|---|
| D1 | **DECIDED 2026-11-24: rate 18+ and keep Pools.** **Age rating and Pools on iPhone.** | (a) Rate **18+** and keep Pools (simplest, honest, nobody under 18). (b) Aim for 13+ or 16+ and **remove Pools from the iOS build**. (c) Rate 18+ now, revisit later. | (a) |
| D2 | **The ₦ symbol and "Wallet" wording for virtual cash.** A naira sign on a virtual currency can read as real money to a reviewer or a regulator. | **DECIDED 2026-11-24: use the sign Ð** ("Ð200,000"), done in this change (backend ADR-046). The tab is still called Wallet and money verbs (send, pay) are kept; the labels say virtual. | done |
| D3 | **DECIDED 2026-11-24: compatibility mode for v1.** **iPad.** Run as an iPhone app in compatibility mode (today), or make it a universal app (needs layouts and iPad screenshots). | compat mode / universal | compat mode for v1 |
| D4 | **Push content.** Keep names and amounts in push text, or add a setting "Hide details on the lock screen". | keep / add setting | keep for v1, add the setting soon |
| D5 | **DECIDED 2026-11-24: Settings switch only for v1.** **Consent default in store builds.** Off until the person agrees (built), or add a one-time "Help improve Dyce?" prompt after sign-up so more people opt in. | off + Settings only / off + prompt | add the prompt once there is a design for it |

## 10. Lower-risk open items

| # | Item | Guideline |
|---|---|---|
| M1 | The **live table** (inside a running game) has no Report button; the lobby does (F2). Add Report to the table menu. | 1.2 |
| M2 | Unify the live-room chat filter (`isCleanText`) with the shared filter; extend both word lists from real reports. | 1.2 |
| M3 | Names already stored are not re-scanned: run the filter over `users` and group titles once and queue hits for moderation. | 1.2 |
| M4 | An in-app way to see what happened to a report (a notice is sent; a history screen is not built). | 1.2 |
| M5 | Measure frame rate, heat and battery on a low-end and a current iPhone (3D and Skia games). | 2.4.2 |
| M6 | Run once on a NAT64 / IPv6-only network. | 2.5.5 |
| M7 | Try the iOS 18 "limited contacts" choice and a refused contacts prompt on a device. | 5.1.1(iii) |
| M8 | Add `NSCameraUsageDescription`, the privacy answers and a camera plugin **together** when QR scanning is built (today you type or paste a code). `release:check` already fails if only half is added. | 5.1.1, 2.5.14 |

## 11. How this stays true

- `pnpm release:check` (CI) guards configuration drift; `--store` is the pre-submission gate.
- Any new data collected needs: a row in `STORE_PRIVACY_ANSWERS.md`, an entry in `app.config.ts` `privacyManifests`, a line in the privacy
  notice, and (for a permission) the purpose string with the library, in one change.
- Any third-party sign-in needs Sign in with Apple in the same change (4.8).
- Anything that makes money from Dyce Cash, or lets it be bought or withdrawn, stops at CLAUDE.md's non-negotiables and needs legal advice
  and a re-read of 3.1.1 and 5.3 first.
- Re-read the live guidelines before each submission: this review used the 2026-10-16 text.
