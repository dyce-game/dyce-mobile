# Store privacy and data-safety answers (DRAFT)

Draft answers for Apple's **App Privacy** ("nutrition label") and Google Play's **Data safety** form, plus the permission justifications and
the third parties involved. They are drawn from what the code and the database actually do **as of 2026-11-23** (sources named per row), not
from the product wish list. **This is not legal advice and nothing is filed.** It needs: counsel's review (RELEASE_CHECKLIST L1, L2), the real
vendor list once accounts exist, and a re-check against the submitted build. A wrong answer here is a store rejection or a compliance problem,
so where something is not certain the row says **VERIFY**.

**Rule for keeping it true:** any change that collects a new kind of data (camera for QR scanning, microphone for voice notes, photos, Face ID,
location, a new SDK) changes these answers in the same pull request.

## 1. What Dyce collects, from the code

| Data | Where it comes from | What is stored | Source of truth |
|---|---|---|---|
| **Phone number** | typed at sign-in | **only a keyed hash** (`users.phone_hash`, `otp_challenges.phone_hash`); the raw number exists in memory to send the code and is passed to the SMS provider; it is never logged | backend CLAUDE.md, `auth.service.ts`, redaction in logs |
| **Email address** | typed at sign-up or log-in with email, or added in Settings (optional) | **only a keyed hash** (`users.email_hash`, `otp_challenges.email_hash`) and a **masked hint** (`t••••@gmail.com`) for Settings; the raw address exists in memory to send the code and is passed to the email provider (Resend); it is never logged (redaction removes addresses) and never shown to other people | backend ADR-044, `auth.service.ts`, `redact.ts` |
| **Contacts** | the phone's address book, only if the user allows it | numbers are normalised on the phone, sent over TLS, hashed with a server secret and matched; **raw numbers are not stored**; what is kept is who-matched-whom among existing users (`contact_links`) and a per-day lookup count | SPEC section 4, `contacts.service.ts`, `contact_lookups` |
| **Username, display name, avatar choice** | the user | stored; public to other users (a stranger sees username, display name, avatar, level) | `profiles` |
| **Birth year** | asked when first entering a Pool | stored (`profiles.birth_year`, `is_adult`); used to hide Pools from under 18s | SPEC section 4, `profiles` |
| **City (optional)** | "Near you", opt-in | a column exists (`profiles.city`); **VERIFY whether the screen that sets it ships in v1**: if not, do not declare location | `profiles`, SPEC section 14 |
| **Messages and game activity** | the user | stored: text, polls, game cards, money-sent and money-request cards, system messages (`messages`); moves and results of every game (`matches`, `match_moves`); reactions | `messages`, `matches` |
| **Dyce Cash history** | the user's actions | stored: a double-entry ledger of virtual currency. **Not real money**: no payment instrument is ever collected | `ledger_*`, WALLET_AND_QR.md |
| **Reports, blocks, disputes** | the user | stored with the evidence the reporter attaches | `reports`, `blocks`, disputes |
| **Push token** | the phone, if notifications are allowed | stored (`push_tokens`) with the platform | `notifications` |
| **Install / device identifier and IP address** | request headers | a **random install id** the app makes (`x-dyce-device`, not a hardware id) and the request IP are stored **only as hashes** (`user_fingerprints.value_hash`) to detect collusion in Pool games. **VERIFY** the app sends the header in the shipped build | `apps/api/src/integrity`, migration `0025` |
| **Anonymous product events** | the app | PostHog, only when a key is configured: event name, a few non-identifying properties (game slug, mode, step), platform, app version; **a random per-install id, no account link, no person profile** | `src/lib/analytics-core.ts` |
| **Crash and error reports** | the app and servers | Sentry, only when a DSN is configured: stack trace, OS and app version, route, **no user object, no screenshots, no cookies, headers, bodies or query strings; phone numbers and tokens are scrubbed** | `src/lib/monitoring-scrub.ts`, `ops/sentry.ts` |
| **Server logs** | the API and game server | method, **route pattern**, status, duration, a request id, a user id (opaque uuid) on authenticated lines; **never the URL, query string, phone number or token** | `ops/logger.ts`, `ops/redact.ts` |
| **Motion (accelerometer)** | the phone, for Charades "tilt" | read on the device in the game; **not sent to us** | `use-tilt.ts` |

**Not collected (today):** precise or coarse location, camera, microphone, photos, health data, payment information, advertising identifiers, browsing
history. The **search text** typed in the app is used to answer the request; only a per-day count is stored (`search_usage`): **VERIFY** the API does not log it.
The app has **no ads and no tracking** (no App Tracking Transparency prompt is needed, `NSUserTrackingUsageDescription` is not set).

## 2. Apple: App Privacy answers

"Data used to track you": **none**. (No data is combined with other companies' data for advertising, and nothing is shared with data brokers.)

| Apple data type | Collected? | Linked to the user's identity? | Used for | Source |
|---|---|---|---|---|
| Contact Info: **Phone Number** | Yes | Yes | App functionality (sign-in and contact matching) | hash of the number |
| Contact Info: **Email Address** | Yes (only if the person signs in or adds one with email) | Yes | App functionality (sign-in) | hash of the address and a masked hint |
| Contact Info: **Name** | Yes (display name) | Yes | App functionality | profile |
| Contacts: **Contacts** | Yes (numbers are sent to the server for matching, then discarded; only matches are kept) | Yes | App functionality | contacts matching |
| User Content: **Emails or Text Messages** | Yes (in-app messages) | Yes | App functionality | messages |
| User Content: **Gameplay Content** | Yes (moves, results, drawings in Doodle Guess if sent) | Yes | App functionality | match records |
| User Content: **Customer Support** | Yes (reports, disputes) | Yes | App functionality, safety | reports |
| User Content: **Other User Content** | Yes (poll answers, reactions, avatar choice) | Yes | App functionality | |
| Identifiers: **User ID** | Yes (username and internal id) | Yes | App functionality, analytics of abuse | |
| Identifiers: **Device ID** | Yes (push token; the hashed random install id) | Yes | App functionality (notifications), fraud prevention | |
| Usage Data: **Product Interaction** | Yes (PostHog events), **only when the person turns on Settings > Privacy > Share usage and crash data** (off by default in store builds) | **No** (random install id, no account link) | Analytics | |
| Diagnostics: **Crash Data** and **Performance Data** | Yes (Sentry), **only when on** | **No** (no user is set) | App functionality (fix crashes) | |
| Other Data Types: **birth year** | Yes | Yes | App functionality (18+ check for Pools) | VERIFY the best Apple category |
| Financial Info, Health, Location, Sensitive Info, Browsing History, Search History, Purchases | **No** | | | location: VERIFY "Near you" |

## 3. Google Play: Data safety answers

- **Does the app collect or share user data?** Collects: yes. Shares: see below.
- **Is all of the user data encrypted in transit?** Yes (TLS to the API and game server; HTTP is not used in production builds: `eas.json` production URLs are https and wss).
- **Do you provide a way for users to request that their data be deleted?** Yes: Settings > Delete account (30 day grace, then the account is anonymised and its stored personal data erased: `anonymise_account`), and Settings > Download my data.

| Google data type | Collected | Shared with third parties | Optional? | Purpose |
|---|---|---|---|---|
| Personal info: **Name** (display name, username) | Yes | No | Required | App functionality, account management |
| Personal info: **User IDs** | Yes | No | Required | App functionality |
| Personal info: **Phone number** | Yes (hash retained; raw number passes through the SMS provider) | **VERIFY**: the SMS provider processes it on our behalf (see section 5) | Required | Account management |
| Personal info: **Email address** | Yes (hash and masked hint retained; the raw address passes through the email provider) | **VERIFY**: Resend processes it on our behalf (see section 5) | Optional (a person can use a phone instead) | Account management |
| Personal info: **Other info** (birth year) | Yes | No | Required to play Pools | App functionality, age check |
| Contacts | Yes (matching) | No | **Optional** (the app works without it: "Find by username") | App functionality |
| Messages: **Other in-app messages** | Yes | No | Required | App functionality |
| App activity: **Other user-generated content / in-app actions** (games, results, reactions) | Yes | No | Required | App functionality |
| App info and performance: **Crash logs**, **Diagnostics** | Yes, only when Sentry is on | **VERIFY** (Sentry processes on our behalf) | Not optional in the build | Analytics, app functionality |
| App activity: **App interactions** (PostHog) | Yes, only when analytics is on | **VERIFY** | Optional if a Settings switch is added (`setAnalyticsEnabled` exists; there is **no switch in the UI yet**: BACKLOG) | Analytics |
| Device or other IDs | Yes (push token, hashed install id) | **VERIFY** (Expo push service) | Required for push | App functionality, fraud prevention |
| Location, Financial info, Health and fitness, Photos and videos, Audio, Files and docs, Calendar | **No** | | | |

Google's definition of "sharing" excludes a provider that processes data only on your behalf. If counsel agrees the vendors below are such processors, the
"Shared" column is No across the board. Say so in the form's note.

## 4. Permissions and why (also the text of the permission prompts)

| Permission | Platform | Text shown / reason | Needed by | Status in `app.config.ts` |
|---|---|---|---|---|
| Contacts | iOS and Android | "Dyce finds friends who are already on Dyce. Phone numbers are checked on our server and never stored." | contact matching | declared |
| Notifications | iOS (runtime) and Android 13+ (`POST_NOTIFICATIONS`) | asked on its own screen before the system prompt | push | declared by the plugin |
| Motion | iOS | "Dyce uses motion to flip your phone for Charades." | Charades tilt | declared |
| Vibrate | Android | haptics | game feedback | declared |
| Camera | both | QR scanning, photos | **not built** | **not declared** (commented out, with its text) |
| Microphone | both | voice notes | **not built** | **not declared** |
| Photo library | iOS | sending photos | **not built** | **not declared** |
| Face ID / biometric | both | confirming payments | **not built** | **not declared** |

`pnpm release:check` fails if a permission string is declared without the library that uses it, so the manifest and these answers cannot drift apart silently.
When the camera ships, add the permission and its text, add Photos/Audio rows to section 2 and 3 as needed, and update the QR flow note in STORE_LISTING.

## 5. Third parties that touch data

| Vendor | What it receives | Why | Account state |
|---|---|---|---|
| **Termii** and **Twilio** (SMS) | the phone number and the one-time code text | deliver the sign-in code and invite texts | **HUMAN**: not set up (H5) |
| **Resend** (email) | the email address and the one-time code email | deliver the sign-in code | **HUMAN**: not set up (H12); name it in the Privacy Policy, check its data-processing terms and the region chosen for the domain |
| **Expo** (push service), **Apple APNs**, **Google FCM** | push token, notification title and body | deliver push | **HUMAN** (H3) |
| **Sentry** | scrubbed crash and error reports, only if a DSN is set | fix crashes | **HUMAN** (M1). Choose the data region |
| **PostHog** | anonymous events, only if a key is set | product analytics | **HUMAN** (M2). Choose EU or US; turn on "Discard client IP data" |
| **Hosting and the managed PostgreSQL provider** | everything we store | run the service | **HUMAN** (H1). Confirm encryption at rest and the data location |
| **Apple, Google** | the stores themselves | distribution | |
| **GitHub** | source code, CI logs (no user data) | engineering | |

Cross-border transfer (NDPA 2023): the vendors above are outside Nigeria. Counsel to confirm what is required (adequacy, contracts) and to approve the Privacy Policy text (L2).

## 6. Things to settle before filing

1. **Age and children.** Sign-up has **no age gate**; the birth year is asked only on first entering a Pool, so someone of any age can create an account and chat. The NDPA 2023 treats a **child (under 18)** specially, including parental consent for processing their data. App Store and Play have their own rules for apps that are or are not "directed to children". This needs a legal decision and probably a sign-up age gate (L2, BACKLOG). The content rating for simulated gambling will also be high (H9).
2. **Retention periods** are not defined: how long messages, logs (the API log, Sentry, PostHog) and hashes are kept, and what "anonymised" keeps. State them in the Privacy Policy. Server log retention is a setting of whatever log shipper is chosen (M3), **to decide**.
3. **Data export** exists (`GET /me/export`); confirm what it includes matches the table in section 1.
4. **A Settings switch for analytics** (`setAnalyticsEnabled`) if counsel wants consent or an opt-out for product analytics.
5. **Encryption at rest** of the database and its backups depends on the host (H1).
6. **Hashing is not anonymisation**: a phone number hashed with a server secret is still personal data while the secret exists, and anyone who holds both the hash and the secret can test a number. The Privacy Policy must not call it anonymous. The honest wording is "kept only as a protected hash" (the in-app draft already says that).
