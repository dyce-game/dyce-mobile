# Decisions (ADRs)

One entry per decision, newest first.

## ADR-007 · Phone OTP auth, sessions and the age gate · 2026-11-14
Context: Phase 1 needs sign-in with a phone number only (no passwords, no social login in v1), safe against enumeration, SMS pumping and token theft, and privacy-preserving (NDPA 2023: no raw phone numbers stored or logged).
Decision:
- **OTP:** 6 digits from the OS CSPRNG, 5 minute TTL, stored only as `HMAC(secret, challengeId:code)`; compared in constant time; one use; max 5 wrong tries then locked; only the newest code is valid. Requesting a code answers identically whether or not the number has an account.
- **Rate limits:** per phone 30 s resend cooldown, 3 per 10 minutes, 10 per day (database-backed, serialised with an advisory lock so concurrent requests can't slip past); per IP via `@nestjs/throttler` (OTP routes 10/min, refresh 30/min, everything else 120/min). A failed SMS send deletes the challenge so our provider's outage doesn't burn the user's limit.
- **Phone numbers:** normalised to E.164 with libphonenumber-js (same function in app and server), stored only as `HMAC-SHA256(PHONE_HASH_SALT, "phone:"+e164)` in `users.phone_hash`. The same secret keys OTP hashes under a different prefix. Rotating it breaks contact matching.
- **Sessions:** access token = HS256 JWT (`jose`), 15 minutes, claims `sub` and `sid` (session family); refresh token = 256-bit opaque, 30 days, only its SHA-256 stored, **rotated on every use**. Presenting an already-rotated token revokes the whole family (theft signal). We do not check revocation on every request, so a revoked session's access token can live up to 15 minutes. The app's API client therefore shares **one** in-flight refresh across concurrent 401s, since replaying a refresh token would sign the user out.
- **SMS:** `+234` goes to Termii first and falls back to Twilio; everything else uses Twilio. **Both adapters are unit-tested against recorded request shapes only; neither has been exercised against the live service**, and Termii's base URL and channel (`dnd`) must be confirmed against the account at integration time. `SMS_DRIVER=console` (dev) prints the code with the number masked. `OTP_TEST_CODE` (fixed code, no SMS) exists for Maestro and local work and the API **refuses to start** with it, or with the console driver, when `NODE_ENV=production`.
- **Android OTP autofill:** iOS uses `textContentType="oneTimeCode"`; Android relies on keyboard/autofill suggestions via `autoComplete="sms-otp"`. A native SMS Retriever / User Consent module is deferred (needs a dev build to evaluate); manual entry always works.
- **Username:** `a-z 0-9 . _`, 3-20, no leading/trailing dot, no `..`, case-insensitively unique; reserved names (`admin`, `dyce`, `support`, ...) are blocked in the schema **and** by a database trigger.
- **Age gate:** only a birth year is collected, so 19+ is treated as adult (an 18-year gap can't be told from 17 or 18). The year can be set **once** (API and a database trigger), so a minor cannot retry years until one passes. Pool staking requires `is_adult` in the ledger function itself. If the product later wants exact 18, collect a full date of birth.
- **Onboarding progress** is derived from data (profile exists, welcome grant really in the ledger) plus client-reported steps (`contacts`, `avatar`, `notifications`) so a restarted app resumes at the earliest unfinished step.
Consequences: we own OTP, sessions and abuse limits now (Supabase Auth did this before ADR-004). Apple/Google sign-in shown in the original welcome design is out of scope (SPEC §4 is phone-only). Contacts matching, the avatar builder and push registration are separate work; their onboarding screens are placeholders that can be skipped. Owner: auth-onboarding-engineer

## ADR-005 · Explicit `.ts` extensions in shared packages · 2026-11-14
Context: `packages/games` must run unchanged in Node (NestJS, Colyseus, determinism script), Jest and Hermes. Decision: relative imports in `packages/games` and `packages/shared` end in `.ts`; `allowImportingTsExtensions` is on. Node 22 strips types natively, so `node script.ts` runs the engines with no build step. Consequences: no bundler-only resolution tricks in these packages. Owner: platform-architect

## ADR-004 · NestJS + plain PostgreSQL replace Supabase · 2026-11-14
Context: the product owner chose NestJS for the backend and plain Postgres with SQL migrations; NestJS owns the API. The kit assumed Supabase (Postgres, Auth, Realtime, Edge Functions) plus Colyseus.
Decision: `apps/api` is a NestJS app (REST + WebSocket gateway). PostgreSQL 16+ (tests run on 17) accessed with `pg` (no ORM, so the ledger functions stay explicit SQL). Migrations are ordered `.sql` files in `apps/api/db/migrations` applied by a small runner. Auth is ours: phone OTP (Termii/Twilio adapter), short-lived JWT + rotating refresh token. Realtime chat is a NestJS WebSocket gateway. Colyseus stays for live rooms and verifies our JWT. DB tests are Jest integration tests against a real Postgres (docker compose) instead of pgTAP. File storage (avatar renders, voice notes) is S3-compatible behind a `StorageService` interface; the provider is a [HUMAN] pick later.
Consequences: we now own OTP, sessions, rate limiting and websocket scaling that Supabase provided; all "RLS" rules from ARCHITECTURE §3 become service-layer authorization plus SQL constraints. Money, ledger and fairness rules are unchanged. Hosting: any Node + Postgres host (Fly.io + managed Postgres is the default). Owner: platform-architect, supabase-backend-engineer (now owns apps/api)

## ADR-006 · Hoisted node_modules for pnpm · 2026-11-14
Context: Metro (React Native) resolves poorly with pnpm's symlinked layout. Decision: `.npmrc` sets `node-linker=hoisted`. Consequences: weaker dependency isolation between workspaces; accepted. Owner: platform-architect

```
## ADR-000 · <title> · <date>
Context: …  Decision: …  Consequences: …  Owner: <agent>
```

## ADR-001 · Stack fixed by the lead analyst · kickoff
Context: Dyce needs cross-platform mobile, realtime chat, async and live games, and a safe virtual ledger.
Decision: Expo (Router, EAS) + Supabase (Postgres/Auth/Realtime/Edge Functions) + Colyseus for live rooms + shared pure-TS game engines; Skia for 2D, React Three Fiber for 3D; money as integer kobo in a double-entry ledger.
Consequences: game rules must be runtime-agnostic (Node, Deno, Hermes); all money and match changes go through server functions.
Owner: platform-architect

## ADR-002 · Avatar system: commissioned modular glTF rig, no Unity/C# · kickoff
Context: Dyce needs Memoji/Bitmoji-class editable avatars, cheap to show in long lists. Decision: commissioned Blender rig exported as modular GLB parts; live editing in R3F; server-rendered 2D images cached by config hash elsewhere; 220 AI-generated profiles as style bible and interim starter looks. No Unity (would add C#, a second engine and app size for no avatar benefit). Consequences: render service needed; artist brief and pipeline in docs/AVATAR_GUIDEBOOK.md. Owner: avatar-engineer

## ADR-003 · Domain dyce.games · kickoff
All links, universal links and app links use https://dyce.games. Owner: growth-invites-engineer
