# Runbook

How to deploy, roll back and operate Dyce. Written for the person on call, so it is procedures first and reasons second.
It was written before any production environment existed: **nothing here has been run against one**. Each procedure marks
what was checked locally and what must be rehearsed in staging before launch (RELEASE_CHECKLIST, "Rehearsals").

Related: `docs/MONITORING.md` (what alerts and who gets them), `docs/RELEASE_CHECKLIST.md` (launch gates),
`../dyce-backend/deploy/production.env.example` (every setting), `../dyce-backend/docs/ARCHITECTURE.md`.

## 1. What runs where

| Part | What it is | Instances | State | Probes | Port |
|---|---|---|---|---|---|
| **API** (`apps/api`, image `dyce-api`) | NestJS: REST, the `/realtime` WebSocket (chat), push, all scheduled jobs | **exactly 1** (see section 12) | none on disk; the hub of live chat connections is in memory (ADR-010) | `/health/live`, `/health/ready` | 3000 |
| **Game server** (`apps/game-server`, image `dyce-game-server`) | Colyseus: one room per live match | **exactly 1** | rooms in memory; every move is saved to PostgreSQL first | `/health/live`, `/health/ready` | 2567 |
| **PostgreSQL 17** | the only durable store, including the money ledger | 1 primary | everything | `pg_isready` | 5432 |
| **App** | Expo app, from the stores; JS updates over the air (EAS Update) | n/a | on phones | n/a | n/a |
| **Web** | the guest invite game (`pnpm export:web`), static files at `dyce.games` | CDN | none | the page loads | 443 |

Probe meanings: **live** = the process answers (never touches the database; restarting cannot fix a database outage).
**ready** = safe to send traffic: database reachable and not draining. `/health/ready` on the API also returns `release`
(the git sha of the build) and `schema` (the newest applied migration), which is how you confirm what is running.

Scheduled jobs live inside the API process (so "the API is down" also means "the jobs are not running"):
nightly **ledger check** 02:15 Lagos (`ledger_check_runs`), session cleanup 03:00, **account erasure** 03:30 (after the 30 day
grace), expiry of stale match invites, stale spaces, quick-match tickets, and the push jobs. After a restart the ledger
check catches up by itself if the last run is older than 26 hours.

## 2. Environments

| | Where the app points | Who deploys | Notes |
|---|---|---|---|
| **local** | `docker compose up` (backend repo) or `pnpm db:dev` + `pnpm dev` | you | fixed OTP `424242`, console SMS and push |
| **staging** | `api-staging.dyce.games` / `game-staging.dyce.games` | CI on merge to `main` (to decide) | real SMS only to allow-listed test numbers (to decide), `preview` builds |
| **production** | `api.dyce.games` / `game.dyce.games` | a human, on purpose | `production` builds and the `production` OTA channel |

The hosting platform is **not chosen yet** (RELEASE_CHECKLIST gate H1). Everything below is platform-neutral: it needs
somewhere to run two containers, a managed PostgreSQL with point-in-time recovery, TLS in front of both, and a secret store.
The original plan named Supabase (as the database host) and Fly.io (Colyseus); ADR-004 removed Supabase's services but any managed
PostgreSQL 17 works. **Use a direct or session-mode connection, never a transaction-mode pooler** (on Supabase that is port 5432, not 6543):
the migrator holds a session advisory lock. The nightly ledger check uses a transaction-scoped lock and is safe either way.
Whatever is chosen must (a) send SIGTERM and wait before killing (`stop_grace_period` >= 30s), (b) probe `/health/ready`,
(c) run **one** replica of each service.

## 3. Deploy

Deploys are small and boring. The order matters: **image, backup point, migrate, API, game server, verify.**

> The **mobile app** has its own pipeline (two branches, `staging` and `main`, with a named approval before production): `docs/CI_CD.md`. This section is the server.

### Before you start
1. CI is green on the commit (`main`), including the `docker` job. Note the commit sha: `SHA=<12 chars>`.
2. The release workflow produced the images: `ghcr.io/<owner>/dyce-api:$SHA` and `.../dyce-game-server:$SHA`
   (`.github/workflows/release-images.yml`, on a `v*` tag). Deploy by **sha**, never by a moving tag.
3. Read the migrations in the diff (`apps/api/db/migrations`). If one **drops or renames** anything, stop: it must be split
   into expand and contract releases (section 4).
4. Choose a quiet hour. Lagos traffic is lowest around 02:00 to 05:00 (to measure; confirm with real traffic).
5. Take or confirm a **restore point** of the database (a managed snapshot, taken now, not last night's).

### Steps
1. **Migrate** with the owner role. The migration step is a one-off run of the API image with the owner's URL:
   ```bash
   docker run --rm -e DATABASE_URL="$MIGRATION_DATABASE_URL" ghcr.io/<owner>/dyce-api:$SHA node db/migrate.ts
   ```
   It prints `migrations: N applied, M already up to date` and each file applied. It takes an advisory lock, so two runs
   cannot collide, and each file runs in its own transaction: a failure rolls that file back and stops. The running API
   keeps working against the previous schema (see section 4 for why that is safe).
2. **Deploy the API** (`dyce-api:$SHA`). On SIGTERM the old instance answers 503 on `/health/ready` for `SHUTDOWN_DRAIN_MS`
   (so the load balancer stops sending it traffic), then closes HTTP, the WebSocket hub and the pool. **Every live chat
   WebSocket drops**; the app reconnects by itself (backoff, then a catch-up fetch). Expect a few seconds of "connecting".
3. **Verify the API:**
   ```bash
   curl -fsS https://api.dyce.games/health/ready
   # {"status":"ok","db":"up","release":"<SHA>","schema":"<newest migration file>"}
   ```
   `release` must be the new sha and `schema` the newest file in the repo. Then the smoke by hand: sign in with a test
   account, send a message, open a space.
4. **Deploy the game server** (`dyce-game-server:$SHA`) the same way. Live matches in progress are affected (section 8): do
   this when no Pool match is running if you can (look at `matches` with `status = 'active'` and `mode = 'pool'`).
5. **Watch for 15 minutes**: Sentry new issues for this release, the error-rate and latency alerts (MONITORING), the log for
   `"level":"error"`. If anything is wrong, roll back (section 5) first and investigate after.
6. Tick the deploy in the release log (RELEASE_CHECKLIST, "Release log").

What was verified locally: the image builds, the stack comes up through `docker compose` in the order above, and the probes
and the graceful stop behave (see the verification list in `docs/STATUS.md`). **Not verified:** any real platform.

### The app
- **Store build** (native change or a new version): the EAS workflow (`.github/workflows/eas-build.yml`) or
  `eas build --profile production --platform all`, then `eas submit`. Production builds must name the backend commit
  (`BACKEND_REF`). Then phased rollout in each store, watching crash-free sessions (section 9 of MONITORING).
- **Over-the-air update** (JavaScript only): `.github/workflows/eas-update.yml` (channel `preview` first, then `production`).
  The runtime version is a fingerprint of the native code, so an update can never reach a build it was not made for.
  Anything that changes a native dependency, a permission, `app.config.ts` native fields or the Expo SDK needs a store build.
- **Order when both change:** the API must stay compatible with the app versions still in the wild (section 4), so deploy
  the API first, the app after. Never ship an app that needs an API that is not live.

## 4. Migrations

- Files are `NNNN_name.sql`, applied in filename order, each in a transaction, recorded in `schema_migrations`. **Never edit
  a merged migration; add a new one.** There are no "down" migrations: a database is fixed forward.
- **Expand then contract.** A release's migrations must work with the *previous* release's code, because the migration runs
  before the new code starts and a rollback runs old code on the new schema. So: add columns/tables/functions in release N
  (nullable or defaulted); stop using the old ones in N+1; drop them in N+2. Never rename in place.
- **Locks.** `ALTER TABLE` on a large table, `CREATE INDEX` without `CONCURRENTLY`, and adding a `NOT NULL` column with a
  volatile default can block writes. Test on a staging copy with realistic volume first (to measure: nothing has run at volume).
  The migrator runs each file in a transaction, so `CREATE INDEX CONCURRENTLY` (which cannot) needs a manual step: do it by
  hand before the deploy and let the migration use `IF NOT EXISTS`.
- **Money functions** (`0005` and anything that touches `ledger_*`): extra review. A bad migration here is a money bug (section 7).
- **Who runs it:** the deploy step only, with `MIGRATION_DATABASE_URL` (the owner). The running services use `DATABASE_URL`
  (`dyce_app`, a member of `dyce_api`, which cannot write ledger tables). Never give the services the owner URL.

## 5. Rollback

| What went wrong | Do this | Notes |
|---|---|---|
| New API or game server is unhealthy | redeploy the previous sha (`dyce-api:$OLD`) | works because migrations are expand-only (section 4) |
| A migration failed | nothing is applied from that file; fix and re-run | check `schema_migrations` to see what did apply |
| A migration applied and is wrong | **fix forward** with a new migration | do not hand-edit tables; for money see section 7 |
| Data was destroyed or corrupted | restore the restore point to a **new** database, compare, then repoint or copy back | needs PITR; rehearse it (gate H4) |
| Bad over-the-air update | publish the previous good bundle to the same channel: `eas update:republish` / `eas update:rollback` (flags: check `eas update --help`) | takes effect on next app launch |
| Bad store build | halt the phased rollout; submit the fix; for a crash loop, ship a fix through an OTA update if it is JS only | stores cannot recall an installed build |

After any rollback: say so in the incident channel, keep the broken sha out of the "deploy by sha" list, and write the cause
down (section 6).

## 6. Incidents

| Severity | Meaning | Response |
|---|---|---|
| **S1** | money wrong or unprovable; data leak; sign-in impossible for everyone; app crash loop | page now; stop the bleeding first (section 7 for money); update the status note every 30 minutes (to decide: cadence) |
| **S2** | a feature is broken for many (chat delivery, a game, SMS in one country, push) | fix or work around the same day |
| **S3** | one user, or cosmetic | the normal backlog |

1. **Declare** it in the incident channel (to decide: tool) with severity, what is known, who leads. One lead; others do what the lead asks.
2. **Contain** before diagnosing: stop new damage (section 7 for money, freeze a game with `UPDATE games SET enabled = false`, put the API in maintenance by failing readiness).
3. **Diagnose** from evidence: Sentry issue, structured logs (filter by `requestId`: it is also the `X-Request-Id` the client received, so a user report with that id finds the whole request), the ledger audit, `ledger_check_runs`.
4. **Fix** forward or roll back (section 5). Re-run the ledger check by hand after any money-adjacent fix (section 7).
5. **Tell users** if their money, data or access was affected (what happened, what we did, what they need to do). A **personal-data breach** must be reported to the NDPC within 72 hours under the NDPA 2023 *(confirm the exact duty and contact with counsel: gate L2)*.
6. **Blameless review** within 5 working days: timeline, cause, what detected it, what should have, and the concrete follow-ups (with owners) added to `docs/BACKLOG.md`.

Logs are structured JSON, one object per line: `ts, level, service, release, requestId, msg, ...`. Phone numbers, tokens and
secrets are redacted before they are written (`packages/shared/src/redact.ts`); access lines carry the route pattern
(`/invites/:token`), never the URL or query string. If you find one that leaked, treat it as a bug and add a test case.

## 7. Money bugs (S1)

The ledger is double-entry and only Postgres functions write it; the API role cannot write ledger tables. Balances cannot go
negative. So a money bug is one of: a function with a wrong rule, a missed idempotency key, or tampering with the database as
a privileged role. The nightly **`ledger_check_invariants`** job proves three things (every transaction sums to zero; each
wallet's cached balance equals the sum of its entries; no Pool escrow is negative). It cannot prove the *rules* are right, so
users reporting "my balance is wrong" are real signals even when the check is clean.

**Detection:** the alert `LEDGER INVARIANT FAILED` (webhook + Sentry fatal + log), a user report, or the support/dispute queue.
**The job also freezes Pool** for any user whose wallet disagrees with the ledger (`profiles.pool_frozen`), so the damage
stops spreading while a human looks.

1. **Contain.**
   - Stop new Pool matches everywhere: `UPDATE games SET supports_pool = false;` (match creation reads it on every request). Confirm in staging first that a Pool invite is then refused *(to verify)*.
   - Free play and chat can stay up; Pool is the money path. The app already says Dyce Cash is virtual: do not announce more than the facts.
   - If a function is the cause and a deploy introduced it, roll back the API image and, if the migration changed a function, fix forward with a migration.
2. **Find the scope** (as the owner role, read only):
   ```sql
   SELECT * FROM ledger_check_invariants(false);               -- what is wrong now (does not freeze)
   SELECT * FROM ledger_check_runs ORDER BY ran_at DESC LIMIT 10; -- when it started
   SELECT * FROM ledger_txns WHERE id = '<ref from the alert>';  -- the transaction and its kind
   SELECT * FROM ledger_entries WHERE txn_id = '<id>';           -- its legs
   ```
   Idempotency keys are on `ledger_txns`: a duplicated payout shows as two transactions with different keys for one match.
3. **Repair with new, balanced, attributable transactions only.** Never `UPDATE wallets` or edit entries.
   - Undo a wrong transaction: `SELECT reverse_txn('<txn id>', '<reason>', '<your admin user id>');` (owner only: it is not granted to `dyce_api`). It fails with `insufficient_funds` if the receiver already spent the money; then post an `adjust` through `_ledger_post` with a written reason.
   - A cached balance that disagrees with its entries is itself the bug to explain: find why before "fixing" it.
4. **Clear the freeze** only after the cause is understood and `ledger_check_invariants(false)` returns no rows:
   `UPDATE profiles SET pool_frozen = false WHERE id IN (...)` and note who and why in the incident.
5. **Verify** by re-running the check by hand, then waiting for the next nightly run: it must be `clean`.
6. **Gate impact:** a non-clean run **resets the 14 day clean streak** (section 10). That is correct: tell the launch owner.
7. **Review** the function and add the missing test (success, insufficient funds, idempotent retry, concurrent double-spend: the backend CLAUDE.md rule) before re-enabling Pool: `UPDATE games SET supports_pool = true WHERE slug IN (...)`: only the games that had it.

Disputes (a player says a Pool result is wrong) are a separate path: the in-app Dispute flow creates a row; the money rule for an
*upheld* dispute is an open decision (backend ADR-037, RELEASE_CHECKLIST gate L5).

## 8. Game-server restarts

What a restart does: rooms are in memory; **every accepted move is already in PostgreSQL** (`match_moves`, state saved in the same
transaction). So a restart loses **no moves**. What is lost is *time*: each room's phase timers and every seat's reconnect clock
start over, and players are disconnected until they reconnect.

- On reconnect the app asks the API for where to connect (`SpacesService`, "makes sure the room exists (it may have been lost in a restart)"). The API calls the game server's signed
  `POST /internal/rooms`, which **recreates the room from the saved state** (`ensureRoom`). So players come back by themselves.
- While the process is down, `ensureRoom` fails and the app shows its "table problem" screen with a retry (SpaceProblemView).
- Planned restart: the readiness probe says `draining` and new rooms are refused for `SHUTDOWN_DRAIN_MS`, then the process closes.
  A seat that stays offline longer than `RECONNECT_SECONDS` (60) after the room is back **forfeits** (SPEC): so during a long outage
  Pool seats may forfeit. If an outage was ours, **refund**: find the affected matches and use the dispute path or `refund_match`
  *(owner tool; the rule for "our fault" refunds is a decision for the launch owner: gate L5)*.
- Unplanned crash: the platform restarts the container; check `/health/ready`, then Sentry for the crash (unhandled errors are
  reported with the match id in the message, never the players' names).
- **Do not run two game servers.** A room lives in one process and the API addresses one URL; two processes would each create the
  same match's room. Scaling needs a matchmaker (section 12).

## 9. SMS provider failover

Sign-in codes are SMS (`SMS_DRIVER=real`). Routing, in code (`RoutedSmsProvider`): **+234 numbers try Termii first, then Twilio;
every other number uses Twilio only.** A provider failure on the first try is logged (`SmsDeliveryError`, provider name and a
reason, **never the number**) and the next provider is tried automatically. So failover for Nigeria is built in *if both providers
are configured*: that is the first thing to check (`TERMII_*` and `TWILIO_*` all set).

When codes are not arriving:
1. Look at the logs for `SmsDeliveryError` by provider. Both failing = an outage on our side (credentials, balance, sender id) or a regional one.
2. **Termii down, Twilio fine:** nothing to do; Nigerian users get Twilio, which is slower and costlier. Watch cost.
3. **Twilio down, outside Nigeria:** there is no second provider for international numbers. Options: wait; add a provider (a code change: `SmsProvider` is an interface); tell affected users to retry later.
4. **Sender id or DND problems** (Nigerian numbers with Do-Not-Disturb get nothing on the generic route): `TERMII_CHANNEL=dnd` needs an approved sender id. Termii is **not yet exercised against the live API** (ADR-007): the first real test is a launch gate (H5).
5. **Rate limiting / abuse** (SMS pumping: a flood of codes to premium numbers): the OTP endpoint is throttled per IP and per number; check for a spike in `/auth/otp` lines and block the range at the edge. Alert on code volume (MONITORING).
6. Rotating a provider key: set the new value in the secret store and restart the API (section 11). No code change.
7. Emergency only: `OTP_TEST_CODE` is refused in production on purpose. Never use it as a workaround.

## 10. Ledger check and the launch gate

Every night (02:15 Lagos) the API runs `ledger_check_invariants` and writes one row to `ledger_check_runs`
(`clean | problems | error`). On `problems` or `error` it logs, reports to Sentry (fatal) and posts to `ALERT_WEBHOOK_URL`. On a clean
run it pings `LEDGER_CHECK_HEARTBEAT_URL` (a dead-man's-switch monitor: configure it to alert when pings *stop*; that is the only
way to learn "the job is not running at all").

**Gate "clean for 14 days":**
```bash
docker run --rm -e DATABASE_URL="$DATABASE_URL" ghcr.io/<owner>/dyce-api:$SHA node db/ledger-gate.ts
# ledger gate: MET (14.8 of 14 clean days, 15 runs in streak, last run 2027-01-12T01:15:00.000Z)
# exit code 0 = met, 1 = not met, 2 = could not read; add --json for machines
```
The streak is broken by any run that is not clean **and by a hole of more than 36 hours with no run** (a night with nothing
checked is not a clean night), and the gate also fails if the latest run is older than that. The clock starts at the first clean
run in the environment that is being launched, so **start it in the production-like environment early**; staging counts only if the
launch owner agrees it does. Record each gate check in the release log.

## 11. Secrets and rotation

All secrets live in the platform's secret store; none in git, images or `eas.json`. A scanner (`gitleaks`) in CI is a good follow-up (BACKLOG).

| Secret | Rotation effect | How |
|---|---|---|
| `JWT_SECRET` (API **and** game server) | every access token in flight stops verifying; refresh tokens are opaque rows stored hashed, so the app refreshes by itself and users stay signed in *(verify in staging)*. Live rooms reject seats whose token was signed with the old key until they refresh | change in both services, restart both together |
| `INTERNAL_SECRET` (both) | live rooms cannot start for the minutes the two disagree | change in both, restart game server then API |
| `PHONE_HASH_SALT` | **breaks contact matching and sign-in for everyone**: all stored hashes stop matching | **do not rotate** except after a leak, and then with a planned re-hash migration (BACKLOG) |
| `DATABASE_URL` password | the service reconnects on restart | rotate the role's password, update the secret, restart |
| Termii / Twilio / Expo tokens | none beyond the provider | set the new value, restart the API |
| `ADMIN_TOKENS` | revokes that moderator | remove the entry, restart |
| `SENTRY_DSN`, `ALERT_WEBHOOK_URL` | none | replace |

**A credential was committed once:** `apps/game-server/.env.example` in the backend repo history (commit `9c36e70`) contains a
database URL with a password, a `JWT_SECRET` and an `INTERNAL_SECRET`. The file has been cleaned, but the history still has them.
**Rotate all three now** (the database user's password, both secrets) and assume them public if that repository was ever pushed.
Removing them from history is optional once they are dead.

## 12. Scaling beyond one instance (read before adding a replica)

The system is deliberately single-instance today. **Do not add a second API replica until the first two items are done.**

1. **Realtime fan-out (ADR-010).** The hub that delivers chat events to connected sockets is an in-process `Map`
   (`apps/api/src/chat/hub.ts`, `publish(userIds, event)`). With two API instances a message sent through instance A is never
   delivered to a user connected to instance B. The fix is a shared bus behind `publish`: **Redis pub/sub** (one channel per
   instance fan-out, each instance delivers to its own sockets; presence `isOnline` must also become shared, e.g. a Redis set with
   TTL). That is a small, contained change (one class implements `Publisher`), but it is **not built**. Redis (managed, one
   small instance) is then a dependency of readiness. Estimated effort and the load at which it is needed: to measure
   (the load test under `scripts/` will say where one instance tops out).
2. **Scheduled jobs.** Every API instance would run every cron. The ledger check already takes a Postgres advisory lock (only one
   runs); the others (erasure, expiry, push) are written to be safe to run twice ("each erase is idempotent") but should each
   take the same lock before scaling out. *(Review each before enabling replicas.)*
3. **Rate limiting.** The throttler keeps counts in memory per instance: with N instances a client gets N times the limit. Move it
   to Redis too, or limit at the edge.
4. **Game server.** One process owns a match's room. To scale: a matchmaker (Colyseus supports presence/driver backed by Redis) and
   the API addressing rooms by server. Until then vertical scaling only.
5. **Graceful deploys with two replicas** (when the above is done): rolling restarts with the drain already built in.

## 13. Common procedures

- **Read the logs for one request:** filter on `requestId`. A client error report includes the `X-Request-Id` header it got.
- **Connect to the database** only through the platform's bastion or proxy, with a personal read-only role; the owner role is for deploys and incidents.
- **Run the money check now:** `SELECT * FROM ledger_check_invariants(false);` (as owner). To also freeze affected users: `(true)`.
- **Erase an account on request outside the app:** the in-app flow (30 day grace) is the supported path; `anonymise_account(user)` is the function behind it (idempotent). Legal holds first.
- **Moderation:** the admin API (`ADMIN_TOKENS`, `ADMIN_DATABASE_URL`) exists behind ADR-039; see the backend docs.
- **Turn on error reporting in a build:** set `EXPO_PUBLIC_SENTRY_DSN` for the profile's EAS environment and rebuild; on the servers set `SENTRY_DSN` and restart. Leave it empty to turn it off.

## 14. Push notification failures

Push goes through the **Expo Push API** (`PUSH_DRIVER=expo`, required in production), which relays to APNs (iOS) and FCM (Android).
Anything time-critical is also delivered by other means, so a push outage degrades the experience but does not lose data: the in-app
Notifications list is written to the database first, and a connected app gets the event over the WebSocket.

What the code does (`apps/api/src/notifications`): it sends in chunks, reads each **ticket** (Expo accepted or rejected the message),
**deletes the token** when the ticket says `DeviceNotRegistered` (the app was uninstalled), and marks `MessageRateExceeded`, HTTP 429 and
5xx as retryable. It does **not** read delivery *receipts* (the second call, about 15 minutes later), so "Expo accepted it" is the
furthest we can see. Adding receipt reading is the first improvement if push delivery is doubted (BACKLOG).

| Symptom | Likely cause | Action |
|---|---|---|
| No push to anyone, tickets say `InvalidCredentials` or `MismatchSenderId` | the **APNs key** or **FCM service account** is missing or wrong in the EAS project (a human setup step, gate H3) | upload the credentials in EAS (`eas credentials`), no new build needed for Android FCM v1 changes; iOS key changes may need a new build *(verify)* |
| Pushes work on Android, not iOS (or the reverse) | one platform's credential is missing | as above, per platform |
| A burst of `DeviceNotRegistered` | users uninstalled, or tokens rotated | expected; the job prunes them. A *spike* after a release means the app is registering the wrong token (check `PushBridge`) |
| HTTP 429 / `MessageRateExceeded` | we sent faster than Expo allows | the job retries; if it persists, lower the batch rate and spread the push jobs |
| HTTP 5xx or timeouts from Expo | Expo outage (check their status page) | nothing to fix; retries cover short ones; the in-app list and WebSocket still work |
| Users say "I never get turn reminders" | Quiet hours, a per-type switch off, or OS permission denied | the preferences are in `notification_prefs`; permission is on the phone |
| Pushes arrive in the wrong time zone | `tz_offset_min` in the user's prefs is stale | the app refreshes it on launch |

An alert exists for a rising failure rate (MONITORING A14). The **first real test on a device** is a launch gate (H3): until a real build
has received a real push on both platforms, this whole path is untested. `EXPO_ACCESS_TOKEN` (optional) turns on Expo's enhanced push security.

## 15. Email sign-in failures (Resend)

Email sign-in and sign-up (backend ADR-044) send a six-digit code through **Resend** (`EMAIL_DRIVER=resend`). Phone sign-in does not depend
on it, so an email outage never locks out people who have a phone on their account. What the code does (`apps/api/src/email`): one `POST /emails`
per code with `Idempotency-Key: otp-<challenge id>` (a retry cannot send two), 8 s timeout, two retries on HTTP 429, 5xx and network errors,
and **no address, code or key in any error message**. When the send fails for good the person sees "We couldn't send the email" and the
challenge is deleted, so a failed send does not use up their limit. The API log line is
`email otp send failed via resend HTTP <status> to t••••@gmail.com` (the address is masked).

| Symptom | Likely cause | Action |
|---|---|---|
| Every send fails, status 401 or 403 | the `RESEND_API_KEY` is wrong, revoked, or not a sending key | create a new key in Resend (Sending access, domain `mail.dyce.games`), update the secret, restart the API (SETUP_GUIDE section 4.2) |
| Every send fails, status 422 | `EMAIL_FROM` is on a domain Resend has not verified, or the address is invalid | make `EMAIL_FROM` use the verified domain; check the domain still shows **Verified** (a DNS record may have been removed) |
| Status 429 | Resend's rate limit or the plan's daily quota | upgrade the plan; our own limits already cap one address at 3 codes in 10 minutes and one IP at 5 requests a minute |
| Status 5xx or timeouts | Resend outage (their status page) | the API retried twice; **switch email off** (below) until it recovers |
| Sends succeed but people do not get the email | spam folder, a typo, DKIM or SPF not verified, a corporate filter | the Resend **Emails** list shows Delivered, Bounced or Complained; fix DNS (SETUP_GUIDE 4.1); suggest phone sign-in meanwhile |
| A burst of sends to many addresses from few IPs | someone mail-bombing or testing for accounts | the per-address and per-IP limits already apply; look at the log by IP, block at the edge if needed |
| Bounce or complaint rate rising in Resend | typos, abuse, or a spam-trap address | investigate the same day: Resend can suspend a sender; there is no automatic suppression yet (BACKLOG) |

**Switch email sign-in off:** set `EMAIL_AUTH_ENABLED=false` and restart the API. The email routes answer 404, `GET /auth/methods` says
`{"phone":true,"email":false}` and the app hides "Sign up with email", "Log in with email" and "Use email instead" the next time it asks (when it
opens). People who already have an email account can still use their phone **only if they added one** (Settings > Account); say so in the
status message. **Switch it back on** the same way once a test code reaches an inbox.

**Production will not start** with email on and `EMAIL_DRIVER=console` (and `OTP_TEST_CODE` must be unset): a message naming the variable is
printed. Do not work around it; set the driver and key.

An alert on `email otp send failed` lines exists in MONITORING (A19). The first real test to Gmail, Outlook, Yahoo and iCloud inboxes is a
launch item (RELEASE_CHECKLIST H12): until it is done, delivery is only proved against a mock of Resend's API.
