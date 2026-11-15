# Status

Last updated: 2026-11-14 (Phase 0 done except the items below; Phase 1: auth + OTP and contacts matching done).

## Done and verified
- Repo, monorepo tooling, ADR-004 (NestJS + plain PostgreSQL replaces Supabase). See earlier commits.
- `@dyce/shared`: money, `formatNaira`, payouts, config, phone normalise/mask/region, username rules, auth, onboarding and contact schemas. 72 tests.
- `@dyce/games`: engine contract, seeded RNG, `_example` engine, contract harness, determinism check. 18 tests; passes in Node and in the browser's V8.
- **Database:** 8 migrations. **138 integration tests** on real PostgreSQL as the restricted app role: ledger and Pool money rules (57), OTP/sessions (31), profile/onboarding/age gate (23), contacts and friend requests (27).
- **Auth + OTP (ADR-007)** — phone OTP, rotating sessions, username, age gate, welcome grant, resumable onboarding. No raw phone number in any table or log (tested). Details in the ADR.
- **Contacts matching (ADR-008)**
  - API: `POST /contacts/match` (batches of ≤500 E.164), `GET /contacts/suggestions`, `DELETE /contacts`, `POST /friends/requests`, `GET /users/by-username/:username`.
  - Verified: matching hashes server-side and stores only matched user ids; blocked, disabled, self and profile-less users hidden; duplicates and positions handled; daily lookup cap (rolled back when exceeded, resets next Lagos day, per user); 500-number batch; friend requests idempotent, reciprocal accepts, race-free when two people add each other at once, honour block/`request_policy`/daily limit. Validation errors never echo a number. The whole journey also runs over real HTTP (`pnpm -F @dyce/api e2e`).
  - App: "Your people are already here" explainer, then the OS prompt, then results with device names and Add/Requested/Accept/Friends buttons; denied/unavailable state with "Allow in Settings", find-by-username and "Continue without contacts"; Skip. 10 logic tests for syncing/batching.
  - **Walked through in a real browser:** allow → 2 matches (a non-member and a bank short code correctly absent) → Add → "Requested"; find-by-username for a missing and an existing person; deny path in light and dark; the database afterwards held 2 contact links, 2 pending requests and **none of the address-book numbers anywhere, including the API log**.
  - Bug found and fixed by the walkthrough: national-format contacts (`0803…`) were read with the *device* region and silently dropped for a Nigerian user on a US-region phone. Now read with the country of the user's own number (stored as an ISO code, never the number).
- ESLint, Prettier, typecheck and builds clean for all five workspaces. **313 automated tests** in total.

## Written but not verified
- **SMS delivery.** Termii and Twilio adapters are unit-tested for request shape only; neither has sent a real SMS.
- **The real contacts permission and address book.** Web has no address book, so the browser run used a clearly-labelled dev-only sample list (`dev.contacts=deny` simulates refusal). `expo-contacts` itself, iOS "limited access", and Android prompts are untested on devices. The iOS/Android permission text is set via the `expo-contacts` config plugin.
- Anything else on a real device (rendering, haptics, blur, safe areas, Hermes, OTP autofill). Dark mode was checked for the contacts-denied screen only.
- GitHub Actions workflow (never run).

## Not done
- Friends list, accepting/declining requests, removing friends, and the push for "a friend joined Dyce" (social-discovery work). Invite-by-SMS for contacts who aren't on Dyce (growth-invites).
- Avatar step; notification permission and push token registration (still skippable placeholders).
- A "don't let people find me by phone number" setting (not in SPEC; see ADR-008).
- Android SMS Retriever module; account deletion; real sign-out in Settings (dev-only `/dev/session`).
- Physics determinism spike and ADR; Colyseus `apps/game-server`; demo seeds from `assets/avatar-profiles`; Sentry/PostHog; EAS dev builds; Deno and Hermes determinism runs.
- Remaining Phase 1 lanes: avatar Phase A, messaging, wallet UI (send, QR request, scan-to-pay), block/report.

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
6. Product calls: (a) ADR-007 treats 19+ by birth year as adult; exact-18 needs a full date of birth. (b) Should users be able to opt out of being found through contact matching? SPEC doesn't say; today everyone with a profile is findable by anyone who has their number, within the daily cap.

## Next
Pick any of: avatar Phase A, messaging, wallet UI (all can start now that auth, contacts and friend requests exist), or the social/discovery slice that makes friend requests usable (list, accept, decline).
