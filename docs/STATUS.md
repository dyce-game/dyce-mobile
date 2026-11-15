# Status

Last updated: 2026-11-15 (Phase 0 done except the items below; Phase 1: auth + OTP, contacts matching, friends list with accept/ignore, and 1:1 messaging with Requests and live delivery done).

## Done and verified
- Repo, monorepo tooling, ADR-004 (NestJS + plain PostgreSQL replaces Supabase). See earlier commits.
- `@dyce/shared`: money, `formatNaira`, payouts, config, phone normalise/mask/region, username rules, auth, onboarding and contact schemas. 72 tests.
- `@dyce/games`: engine contract, seeded RNG, `_example` engine, contract harness, determinism check. 18 tests; passes in Node and in the browser's V8.
- **Database:** 10 migrations. **210 integration tests** on real PostgreSQL as the restricted app role: ledger and Pool money rules (57), OTP/sessions (31), profile/onboarding/age gate (23), contacts and friend requests (27), friends list/accept/ignore/remove (27), messaging (45).
- **Auth + OTP (ADR-007)** — phone OTP, rotating sessions, username, age gate, welcome grant, resumable onboarding. No raw phone number in any table or log (tested). Details in the ADR.
- **Contacts matching (ADR-008)**
  - API: `POST /contacts/match` (batches of ≤500 E.164), `GET /contacts/suggestions`, `DELETE /contacts`, `POST /friends/requests`, `GET /users/by-username/:username`.
  - Verified: matching hashes server-side and stores only matched user ids; blocked, disabled, self and profile-less users hidden; duplicates and positions handled; daily lookup cap (rolled back when exceeded, resets next Lagos day, per user); 500-number batch; friend requests idempotent, reciprocal accepts, race-free when two people add each other at once, honour block/`request_policy`/daily limit. Validation errors never echo a number. The whole journey also runs over real HTTP (`pnpm -F @dyce/api e2e`).
  - App: "Your people are already here" explainer, then the OS prompt, then results with device names and Add/Requested/Accept/Friends buttons; denied/unavailable state with "Allow in Settings", find-by-username and "Continue without contacts"; Skip. 10 logic tests for syncing/batching.
  - **Walked through in a real browser:** allow → 2 matches (a non-member and a bank short code correctly absent) → Add → "Requested"; find-by-username for a missing and an existing person; deny path in light and dark; the database afterwards held 2 contact links, 2 pending requests and **none of the address-book numbers anywhere, including the API log**.
  - Bug found and fixed by the walkthrough: national-format contacts (`0803…`) were read with the *device* region and silently dropped for a Nigerian user on a US-region phone. Now read with the country of the user's own number (stored as an ISO code, never the number).
- **Friends list, accept and ignore (ADR-009)**
  - API: `GET /friends`, `GET /friends/requests`, `POST /friends/requests/:userId/accept|decline`, `DELETE /friends/requests/:userId` (cancel), `DELETE /friends/:userId` (remove). Migration 0009 adds the `declined` state and `responded_at`.
  - Verified (27 tests): list is A-Z, symmetric, and leaves out pending/ignored requests, blocked and disabled people; requests list newest first with mutual-friend counts; accept (idempotent, works on a request you earlier ignored, refuses blocked/disabled/own/nonexistent, two simultaneous accepts leave one friendship); silent ignore (sender still sees it as sent, can't re-ask, adding back makes you friends); cancel; remove (symmetric, idempotent, can become friends again); row integrity. Also runs over real HTTP in `pnpm -F @dyce/api e2e`.
  - Not tested: accept racing cancel, and whether the request-policy path is hit when the accepter's own policy is `nobody` (accept never consults policy by design, ADR-009).
  - App: Friends screen (All / Requests tabs, Accept / Ignore / Cancel, Remove with inline Keep / Remove confirm), Add friends screen (contact suggestions, sync, find by username), standalone contacts sync, avatar badge with the count of waiting requests.
  - **Walked through in a real browser (web), light and dark:** sign-in → badge "2" → All (2) → Requests (2 incoming with "1 mutual friend", 1 outgoing) → Accept moved a person to All (3) → Ignore removed a request from the list → Remove showed "Remove @x? They won't be told." and Keep cancelled it → find by username for someone I had ignored showed Add, and tapping it resolved to "Friends" → dark mode checked on Friends. Session survived a reload.
- **Messaging: 1:1 chat, Requests, live delivery (ADR-010)**
  - API: `GET /conversations?filter=all|friends|requests`, `POST /conversations/direct`, `GET /conversations/:id`, `GET|POST /conversations/:id/messages`, `POST .../read|accept|decline`, and a WebSocket at `/realtime`. Migration 0010 adds `direct_key`, a body-size CHECK, a paging index and the `request_messages_before_accept` config.
  - Verified (45 DB tests): one conversation per pair even when both open at once; friends chat freely; a stranger's message lands only in the recipient's Requests (never in Chat, never in the badge) and is capped at 3 until they reply; replying or accepting activates it; decline is silent and stops live delivery; becoming friends turns a request, even an ignored one, into a normal chat; `nobody` / `fof` policies and the 20-new-people-per-day limit (resets at Lagos midnight); idempotent sends (same id returns the same message; reused in another conversation is refused); live delivery failure never loses a message; only the two members can read, send, mark read, accept or decline; blocked people vanish and can't send; paging newest-first with no gaps or repeats, including messages with identical timestamps; unread counts (capped at 99), read marker never moves back, sending doesn't mark unseen messages read; no read receipt while a conversation is a request; typing signals only go to people who should get them; no phone numbers in any response.
  - Verified (14 socket tests): auth by first frame, bad token, auth timeout, junk and oversize frames, close at token expiry, per-user connection cap, typing relay and burst limit, other paths left alone. The HTTP e2e now runs a real chat over a real WebSocket (delivery to both people, no duplicate on retry, typing, read, a stranger's request going to Requests live, decline silence).
  - App: Chat tab (All / Friends / Requests with a count, unread badges per row and on the tab bar, empty states), thread (bubbles grouped into runs, day separators, optimistic send, Retry / Delete with the reason, "typing…", Sent / Read under your last message, older messages load as you scroll up, request banner with Accept / Decline instead of a composer), New chat (friends, or find by username). 49 new logic tests (merging, grouping, receipts, reconnect and backoff of the live client, outbox, typing, cache updates).
  - **Walked through in a real browser (web), light and dark:** list with unread badges (13 and 3) and "9+" on the tab → opened a thread → sent with Enter (Sent) → a second "device" (a script) typed, replied and read my message, and I saw "typing…", the reply and "Sent" turn to "Read" **live without a refresh** → Requests tab with the privacy note, REQUEST tags and Accept / Decline → opened a request (banner, no composer) → Accept from the banner and from the list both worked → stopped the API and sent: "Not sent. Can't reach Dyce…" with Retry / Delete → restarted the API, pressed Retry: delivered **once** (checked in the database) and the live connection reconnected by itself → scrolled a 37-message thread to the top and the older page loaded → New chat → "Message" on a friend opened the existing conversation, not a new one. Dark mode checked on the list, a thread and New chat.
  - Found by testing and fixed: sending marked the whole thread read, hiding unread messages the sender hadn't seen (now it doesn't).
- ESLint, Prettier, typecheck and builds clean for all five workspaces. **464 automated tests** in total (254 unit: shared 72, games 18, ui 13, mobile 99, api 52; 210 on real PostgreSQL), plus the HTTP e2e, boot smoke and determinism scripts.

## Written but not verified
- **SMS delivery.** Termii and Twilio adapters are unit-tested for request shape only; neither has sent a real SMS.
- **The real contacts permission and address book.** Web has no address book, so the browser run used a clearly-labelled dev-only sample list (`dev.contacts=deny` simulates refusal). `expo-contacts` itself, iOS "limited access", and Android prompts are untested on devices. The iOS/Android permission text is set via the `expo-contacts` config plugin.
- Anything else on a real device (rendering, haptics, blur, safe areas, Hermes, OTP autofill). Dark mode was checked for the contacts-denied screen, the Friends list, the Chat list, a thread and New chat (not Requests, the request banner, or Add friends).
- Friends and messaging screens were run on web only, with test users created through the API, and the "other person" was a script. Nobody has chatted between two real phones. Keyboard handling on phones (`KeyboardAvoidingView`), the inverted list on Hermes, and scrolling a 5,000-message thread are untested.
- **The realtime hub is single-process.** With more than one API instance, a message sent through one won't reach sockets held by another. Needs Redis pub/sub before scaling out (ADR-010).
- The browser walkthrough ran the app inside a scaled iframe on web, because the in-app browser's screenshots crop mobile-sized viewports; layout widths were also checked with DOM measurements.
- GitHub Actions workflow (never run).

## Not done
- Push for "a friend joined Dyce" and for new friend requests (needs push registration). Invite-by-SMS for contacts who aren't on Dyce (growth-invites). Profile screen (Friends is reached from the avatar until it exists); viewing another person's profile; block/report UI.
- Messaging: groups, Bots, "Live now" and online presence, replies, reactions, delete for me / everyone, voice notes, photos, mute / archive, a read-receipt opt-out, "Add friend" when accepting a request, push for new messages, the Games and ₦ buttons in the composer (BACKLOG). Maestro `chat` and `requests` flows.
- Avatar step; notification permission and push token registration (still skippable placeholders).
- A "don't let people find me by phone number" setting (not in SPEC; see ADR-008).
- Android SMS Retriever module; account deletion; real sign-out in Settings (dev-only `/dev/session`).
- Physics determinism spike and ADR; Colyseus `apps/game-server`; demo seeds from `assets/avatar-profiles`; Sentry/PostHog; EAS dev builds; Deno and Hermes determinism runs.
- Remaining Phase 1 lanes: avatar Phase A, wallet UI (send, QR request, scan-to-pay, money cards in chat), block/report, and the rest of messaging above.

## Dev notes
- No Docker needed: `pnpm -F @dyce/api db:dev` starts an embedded Postgres on :54329 with migrations applied. Then `cp apps/api/.env.example apps/api/.env`, set `DATABASE_URL=postgres://dyce_app:dyce_app@localhost:54329/dyce`, `OTP_TEST_CODE=424242` and `CORS_ORIGINS=http://localhost:8081` (or your web port), and run `pnpm -F @dyce/api dev`.
- Run Metro in watch mode (`pnpm -F @dyce/mobile dev`). Do not set `CI=1`: it disables reloads. The Android emulator reaches the API at `10.0.2.2` (handled automatically for localhost URLs).
- pnpm 11 reads its settings from `pnpm-workspace.yaml` (hoisted linker, `verifyDepsBeforeRun: false`), not `.npmrc`.
- If `embedded-postgres` can't download its binary on a flaky network, fetch the tarball directly and extract it into `node_modules/@embedded-postgres/windows-x64`, or set `TEST_DATABASE_ADMIN_URL` to any local Postgres.

## Blocked on [HUMAN]
1. Apple Developer + Google Play accounts; confirm bundle id (`games.dyce.app` is a placeholder).
2. Postgres host, Fly.io, **Termii + Twilio accounts and sender ID** (needed before any real SMS), storage provider.
3. Final name for "Word Tiles"; confirm "Crazy Cards".
4. Contract the 3D artist.
5. Lawyer review slot for Pools/terms.
6. Product calls: (a) ADR-007 treats 19+ by birth year as adult; exact-18 needs a full date of birth. (b) Should users be able to opt out of being found through contact matching? SPEC doesn't say; today everyone with a profile is findable by anyone who has their number, within the daily cap. (c) SPEC says read receipts "can be turned off" but defines no setting; today they are always on once a chat is accepted. (d) How many messages may a stranger send before the other person answers? Today 3 (`request_messages_before_accept`).

## Next
Pick any of: avatar Phase A, wallet UI (send, QR request, scan-to-pay: the ₦ button and money cards plug into the chat now), block/report (the chat already honours `blocks`), or the next messaging slice (groups, reactions/replies/deletes, voice and photos, push).
