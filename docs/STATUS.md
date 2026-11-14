# Status

Last updated: 2026-11-14 (Phase 0 done except the items below; Phase 1 started with auth + OTP).

## Done and verified
- Repo, monorepo tooling, ADR-004 (NestJS + plain PostgreSQL replaces Supabase). See earlier commits.
- `@dyce/shared`: `Kobo`, `formatNaira`, payout splitting, typed config, phone normalisation + masking, username rules, auth/onboarding schemas and the pure "next onboarding step" function. 57 tests.
- `@dyce/games`: engine contract, seeded RNG (checked against an independent reference), `_example` engine, contract harness, determinism check. 18 tests; passes in Node and in the browser's V8.
- **Database:** 7 migrations. **111 integration tests** on real PostgreSQL as the restricted app role: ledger and Pool money rules (57), OTP/sessions (31), profile/onboarding/age gate (23).
- **Auth + OTP (Phase 1, ADR-007)**
  - API: `POST /auth/otp/request|verify`, `/auth/refresh`, `/auth/logout`, `GET /me`, `GET /profile/username/check`, `POST /profile`, `/profile/age-gate`, `/onboarding/steps/:step`, `/onboarding/welcome-bonus`.
  - Verified: OTP hashed, single-use, 5 tries, per-phone and per-IP rate limits (also under concurrency); refresh rotation with reuse detection; disabled accounts; env refuses test OTP / console SMS in production; **no raw phone number in any table or log** (tested, and re-checked after a real browser session); welcome grant exactly once even when claimed concurrently; a minor cannot stake in Pool.
  - `pnpm -F @dyce/api e2e`: whole journey over real HTTP against the built API. `pnpm -F @dyce/api smoke`: boots and answers `/health`.
  - App: Welcome, Phone + code (country defaults from locale, resend timer, auto-submit, wrong-code shake respecting Reduce Motion), Username (live availability, suggestions), session in secure storage, auth gate, resume at the right step after restart. API client shares one refresh across concurrent 401s. 24 logic tests.
  - **Walked through in a real browser** (phone size, light theme): welcome, invalid number, wrong code ("4 tries left"), correct code, reserved name, username, cold reload resuming mid-onboarding, `/chat` bouncing back to onboarding, skip contacts/avatar, claim ₦200k, skip notifications, Chat. The database afterwards held exactly one user, one grant and a clean ledger.
- ESLint, Prettier, typecheck and builds are clean for all five workspaces. 261 automated tests in total.

## Written but not verified
- **SMS delivery.** Termii and Twilio adapters are unit-tested for the request shape only. Neither has sent a real SMS; Termii's base URL/channel need confirming against your account.
- Anything on a real device (iOS/Android rendering, haptics, blur, safe areas, Hermes, OTP autofill). Web only so far. Dark mode of the new auth screens was not viewed.
- GitHub Actions workflow (never run).

## Not done
- Contacts permission, hashing and matching ("On Dyce" suggestions); the avatar step; notification permission and push registration. Their onboarding screens are placeholders that can be skipped.
- Android SMS Retriever/User Consent module (ADR-007 defers it). Account deletion, sign out from Settings (dev-only `/dev/session` for now).
- Physics determinism spike and ADR; Colyseus `apps/game-server`; demo seeds from `assets/avatar-profiles`; Sentry/PostHog wiring (needs keys); EAS dev builds; Deno and Hermes determinism runs.
- Remaining Phase 1 lanes: avatar Phase A, messaging, wallet UI (send, QR request, scan-to-pay), block/report.

## Dev notes
- No Docker needed: `pnpm -F @dyce/api db:dev` starts an embedded Postgres on :54329 with migrations applied. Then `cp apps/api/.env.example apps/api/.env`, set `DATABASE_URL=postgres://dyce_app:dyce_app@localhost:54329/dyce`, `OTP_TEST_CODE=424242` and `CORS_ORIGINS=http://localhost:8081` (or your web port), and run `pnpm -F @dyce/api dev`.
- Run Metro in watch mode (`pnpm -F @dyce/mobile dev`). Do not set `CI=1`: it disables reloads. The Android emulator reaches the API at `10.0.2.2` (handled automatically for localhost URLs).
- pnpm 11 reads its settings from `pnpm-workspace.yaml` (hoisted linker, `verifyDepsBeforeRun: false`), not `.npmrc`.
- If `embedded-postgres` can't download its binary on a flaky network, fetch the tarball directly and extract it into `node_modules/@embedded-postgres/windows-x64`, or set `TEST_DATABASE_ADMIN_URL` to any local Postgres.

## Blocked on [HUMAN]
1. Apple Developer + Google Play accounts; confirm bundle id (`games.dyce.app` is a placeholder).
2. Postgres host, Fly.io, **Termii + Twilio accounts and sender ID** (needed before any real SMS; Termii sender IDs need registration in Nigeria), storage provider.
3. Final name for "Word Tiles"; confirm "Crazy Cards".
4. Contract the 3D artist.
5. Lawyer review slot for Pools/terms.
6. Product call: ADR-007 treats 19+ by birth year as adult. If exactly 18 should count, the age gate must ask for a full date of birth.

## Next
Contacts matching (server HMAC + `match-contacts` endpoint + permission flow), then avatar Phase A, messaging and wallet UI in parallel (they all depend on auth, which now exists).
