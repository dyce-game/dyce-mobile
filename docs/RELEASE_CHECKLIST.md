# Release checklist

Everything that must be true before Dyce goes to testers and then to the public. It starts from the launch gates in
`BUILD_PLAN.md` (Phase 5) and adds what only shows up when you try to ship: accounts, credentials, assets and rehearsals.

**Status words (as of 2026-11-23, nothing has run on a device or in a real environment):**
- **DONE** built and checked in this repo, with the evidence named.
- **BUILT** the code, config or doc exists and was checked locally, but it has never run against the real thing.
- **OPEN** not started or not possible yet.
- **HUMAN** only a person can do it (an account, a signature, a decision, a physical device). Nobody can finish these in code.

Owners are the agent roles in `BUILD_PLAN.md`; **a named person for each HUMAN row is still to be filled in** (the Owner column says
who does the work, not who is accountable).

## 1. Launch gates (BUILD_PLAN Phase 5)

| # | Gate | Measured by | Owner | Status |
|---|---|---|---|---|
| G1 | Crash-free sessions at least 99.5 percent in beta | Sentry release health on `preview` builds with real testers | release-engineer (setup), qa-engineer (beta run) | **OPEN**. Sentry is wired (BUILT); no beta exists. Needs M1, H2, H3 and testers (HUMAN) |
| G2 | `ledger_check_invariants` clean for 14 days | `node db/ledger-gate.ts` (RUNBOOK section 10) | release-engineer, wallet-payments-engineer | **BUILT**: the nightly job, audit table, alert and gate script exist and are tested on a real PostgreSQL. The clock has not started: it starts at the first clean nightly run in the launch environment |
| G3 | All Maestro flows green | `pnpm e2e` on a device or simulator | qa-engineer | **OPEN** (flows are being written under `e2e/` by the QA work; none has run on a device) |
| G4 | Legal review done | signed-off Terms, Privacy, Pool rules, community guidelines, and an opinion on the gaming question | trust-safety-compliance prepares; **HUMAN** lawyer | **HUMAN**. Drafts exist in the app (Settings > Help and legal) and are marked DRAFT |
| G5 | Store approvals | App Store and Google Play review | release-engineer | **HUMAN**, after H2, H7, H8, H9 |

Phase 5 workstreams (from BUILD_PLAN): anti-cheat and integrity (trust-safety-compliance), privacy and deletion (trust-safety-compliance),
monitoring and runbook (**this work**), store submissions, launch.

## 2. Accounts, credentials and decisions (all HUMAN unless stated)

| # | What | Why it blocks | Status |
|---|---|---|---|
| H1 | **Hosting**: somewhere to run two containers, a managed PostgreSQL 17 with point-in-time recovery, TLS, a secret store. Pick the region closest to Lagos (BUILD_PLAN decision 2 named Supabase and Fly.io; either or neither). DNS for `api.`, `game.` and `dyce.games` | nothing can be deployed | **HUMAN** |
| H2 | **Apple Developer and Google Play accounts**; confirm the bundle id (`games.dyce.app` is a suggestion); **Expo account and EAS project** (done 2026-11-23: project `c29cc31f-6903-478e-9160-8d639e307eab`, owner `kymsoft`, both set in `app.config.ts`; run EAS commands logged in as `kymsoft` or a member, and still put `EAS_PROJECT_ID` in the repo variable and the profile environments for CI); `EXPO_TOKEN` as a repo secret | no builds, no OTA, no TestFlight | **HUMAN** |
| H3 | **Push credentials**: APNs key and FCM service account uploaded to EAS; then a real push received on a real iPhone and a real Android phone | push is untested end to end | **HUMAN** |
| H4 | **Backups**: confirm the database host's snapshot schedule and PITR, and **restore one into a new database and check the ledger on it** | a restore that was never tried is a hope | **HUMAN** |
| H5 | **SMS**: Termii and Twilio accounts, an approved sender id for the DND route, balance, and a real sign-in from a Nigerian number on MTN, Airtel, Glo and 9mobile (Termii has never been called against the live API, ADR-007) | nobody can sign in | **HUMAN** |
| H6 | **Universal and app links**: fill the Apple team id in `public/.well-known/apple-app-site-association` and the Play signing SHA-256 in `assetlinks.json`, serve both from `dyce.games` over HTTPS with no redirect, and check an invite link opens the app | invite links fall back to the web game | **HUMAN** (files exist as templates) |
| H7 | **App icon, adaptive icon and splash screen** (none exist in the repo: `app.config.ts` has no `icon`), and the store screenshots (section 6) | the stores reject a build without them | **HUMAN** (design) |
| H8 | **Public URLs and contact**: hosted Privacy Policy and Terms pages, a support email or form, a marketing URL | both stores require them | **HUMAN** |
| H9 | **Age ratings**: answer the Apple and Play content questionnaires. Pools are **simulated gambling** (SPEC section 14: declare it; Pools hidden for under 18s) | rating, review, region availability | **HUMAN** (answers drafted in `STORE_PRIVACY_ANSWERS.md`) |
| H10 | **Names**: final name for "Word Tiles", confirm "Crazy Cards" (BUILD_PLAN open decision 3). The names Uno and Scrabble must never ship | listing text and in-app copy | **HUMAN** |
| H11 | **Export compliance**: `app.config.ts` declares standard encryption only (TLS) so the App Store skips the question. Confirm that is true | an incorrect declaration is a compliance problem | **HUMAN** |
| H12 | **Email sign-in (Resend)**: an account, the sending domain verified (DKIM, SPF, DMARC), a restricted API key, `EMAIL_DRIVER=resend`, `RESEND_API_KEY` and `EMAIL_FROM` set, and a real code received in Gmail, Outlook, Yahoo, iCloud and a business inbox, **in the inbox and not in spam** (the step-by-step is `SETUP_GUIDE.md` section 4). Or launch with `EMAIL_AUTH_ENABLED=false` and say so | the production API refuses to start with email on and no driver; delivery has only been proved against a mock | **HUMAN** |
| H13 | **Apple review readiness** (`APPLE_COMPLIANCE.md`): enrol as an **organisation** (D-U-N-S), set `REVIEW_LOGINS` and paste `APP_REVIEW_NOTES.md`, host the Privacy Policy, Terms and Support pages and create `support@dyce.games`, answer the age rating (simulated gambling: frequent) and App Privacy questions, EU trader status if the EU is on. `pnpm release:check --store` must pass | the app is rejected or not shown | **HUMAN** |
| H14 | **CI/CD set up on GitHub** (`CI_CD.md` sections 4 and 5): secrets and variables, the `staging` and `production` environments with a required reviewer, `main` as the default branch, branch protection on both branches, the backend `staging` and `main` brought up to date and a backend tag for `BACKEND_REF_PRODUCTION` | the pipeline has never run; a production deploy is refused without a pinned backend | **HUMAN** |
| H15 | **Fly.io deploys from GitHub** (`dyce-backend/deploy/FLY.md` section 7): four Fly apps, their secrets, one deploy token per app, the GitHub environments `staging` and `production` (reviewers on production) with `FLY_API_TOKEN_API` and `FLY_API_TOKEN_GAME`, the variable `FLY_DEPLOY=true`, and a staging and a production database | nothing is deployed anywhere yet; the app's builds point at `api-staging.dyce.games` | **HUMAN** |

Monitoring accounts (MONITORING.md):

| # | What | Status |
|---|---|---|
| M1 | **Sentry** organisation with three projects (app, api, game server); put each DSN in the matching environment; `SENTRY_AUTH_TOKEN` as an EAS secret plus `SENTRY_ORG`/`SENTRY_PROJECT` so source maps and native symbols upload | **HUMAN**. Code BUILT behind flags |
| M2 | **PostHog** project; `EXPO_PUBLIC_POSTHOG_KEY` (and `..._HOST` if not the default EU cloud); turn on **Discard client IP data**; decide EU or US data location | **HUMAN**. Code BUILT |
| M3 | A **log shipper** that can count JSON lines (for the log-based alerts A6, A8, A12 to A16) | **HUMAN** |
| M4 | **An alert channel, a pager, and a named on-call person** for P1 | **HUMAN** |
| M5 | An **uptime monitor** and a **dead-man's-switch** monitor (`LEDGER_CHECK_HEARTBEAT_URL`); set repo variables `UPTIME_API_URL`, `UPTIME_GAME_URL` for the free GitHub probe | **HUMAN**. Probe workflow BUILT |

Legal and policy:

| # | What | Status |
|---|---|---|
| L1 | Lawyer review of Terms, Privacy Policy, Pool rules, community guidelines (the in-app copy is DRAFT) | **HUMAN** |
| L2 | **NDPA 2023** obligations: whether Dyce must register with the NDPC, a data protection officer, the lawful basis wording, retention periods, and the 72 hour breach notice process (RUNBOOK section 6) | **HUMAN** (counsel) |
| L3 | Written opinion on the gaming question: Dyce Cash is virtual, cannot be bought or withdrawn, so Pools are simulated gaming; confirm for Lagos State and any state where launch is planned (SPEC section 14). **Any change to "cannot be bought or withdrawn" needs this first** | **HUMAN** |
| L4 | Apple and Google policy check for simulated gambling apps (age gating, region lists) | **HUMAN** |
| L5 | **Money rules left open**: what happens to the pot when a Pool dispute is upheld (backend ADR-037), and whether and how we refund Pool seats lost to our own outage (RUNBOOK section 8) | **HUMAN** |
| L6 | **Device integrity decision** (backend ADR-039): production requires `INTEGRITY_DRIVER=store`, which **fails closed until Play Integrity and App Attest verification is written**. With `integrity_required` off, the check is not consulted. Decide: launch with it off and say so, or build and configure the verification first | **HUMAN** decision, then code |

## 3. What the code already guarantees (checked here)

| Check | Command | Result |
|---|---|---|
| Backend lint, types, format, unit tests | `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test` in `dyce-backend` | see `STATUS.md` for the latest run |
| Backend database tests on a real PostgreSQL, including the ledger check | `pnpm test:db` | see `STATUS.md` |
| API boots (Sentry off and on), probes, request id, JSON logs, graceful stop | `pnpm -F @dyce/api smoke` | DONE locally (the SIGTERM leg runs in CI and in Docker; Windows cannot signal a child) |
| Images build, stack comes up in order, graceful stop exits 0 | `docker compose up -d --wait` | see `STATUS.md` |
| App lint, types, format, tests | `pnpm lint && pnpm typecheck && pnpm format:check && pnpm test` | see `STATUS.md` |
| Release config: profiles, channels, variants, no unused permissions | `pnpm release:check` | DONE |
| The web bundle builds and is served | `pnpm export:web && node tools/release/check-web-export.mjs` | see `STATUS.md` |

## 4. Rehearsals before launch (nothing here has been done)

Do each in **staging**, write the date and who did it in the release log, and fix the runbook where reality differed.

1. Full deploy and **rollback** of the API and the game server by sha (RUNBOOK sections 3 and 5), during live chat: the app reconnects.
2. A migration against a **copy of realistic data** (lock time; to measure).
3. **Restore** from backup into a new database and run `ledger_check_invariants` on it (H4).
4. **Plant a ledger mismatch** in staging and watch the alert arrive on the pager and Pool freeze (the database test shows how); confirm the heartbeat alert fires when the job is stopped.
5. **Game-server restart in the middle of a live Pool match**: players return, no moves lost, no unfair forfeit (RUNBOOK section 8).
6. **SMS failover**: remove the Termii key, confirm a Nigerian number still receives a code through Twilio (RUNBOOK section 9).
7. **OTA update and OTA rollback** on a `preview` build; then a native change to prove a store build is needed (the runtime fingerprint changes).
8. **Secret rotation**: rotate `JWT_SECRET` and `INTERNAL_SECRET` in staging; sessions survive (RUNBOOK section 11).
9. **Load test** (`scripts/`, from the QA work): how many chat WebSockets and live rooms one instance carries, and what that says about when Redis is needed (RUNBOOK section 12). **Every capacity number is to measure.**
10. **Rotate the credential that was committed to git history** (RUNBOOK section 11). Do this before anything else if the repository was ever pushed.

## 5. Versioning and release process

- **App marketing version**: `VERSION` in `app.config.ts`, semver. `0.x` until the public launch, `1.0.0` for it. Bump by hand for every store release; a patch bump for a store hotfix. The value shown in Settings and sent with errors and analytics.
- **Build number**: never edited by hand. `eas.json` has `appVersionSource: remote` and `autoIncrement: true` for `preview` and `production`, so EAS keeps one counter per store.
- **Over-the-air updates** do not change the version. They are labelled by the message you give and by the update group id. They are only delivered to builds with the same runtime version, which is a **fingerprint** of the native code (`runtimeVersion: { policy: 'fingerprint' }`), so a JS-only change ships over the air and a native change cannot reach an incompatible build.
- **Channels** = profile names: `development`, `preview`, `production`. Test every update on `preview` first.
- **Backend version** = the git commit. Images are tagged by commit sha (`release-images.yml`), and every log line and Sentry event carries it as `release`. Tag `vX.Y.Z` to mark a release. A production app build records the backend commit it was built against (`BACKEND_REF`).
- **Compatibility rule**: the API must keep serving the oldest app version still in use. A breaking API change is shipped as an addition, the app moves, and the old route is removed a release later (the same expand and contract as migrations, RUNBOOK section 4). There is no minimum-version gate in the API yet (BACKLOG: "force update"), so this rule is the only protection.
- **Release flow**: merge to `main` (CI green) -> tag -> images built -> deploy to staging -> rehearsal checks -> deploy to production (RUNBOOK section 3) -> `preview` build and OTA -> store submission with phased rollout -> watch A10/A11 for 24 hours before widening.
- **Hotfix**: branch from the released tag, fix, CI, deploy by sha; app: OTA if JS only, else a patch store build with an expedited review request.

## 6. Store assets (needs HUMAN design work)

| Asset | Spec | Status |
|---|---|---|
| App icon | 1024 x 1024 PNG, no transparency (iOS); adaptive icon foreground and background (Android) | **OPEN** (H7) |
| Splash screen | `expo-splash-screen` image on the Dyce background | **OPEN** (H7) |
| Screenshots | see `STORE_LISTING.md` section 5; composite real app screens onto the phones in `assets/marketing/` | **OPEN**: needs a build running on a device or simulator |
| Feature graphic (Play) | 1024 x 500 | **OPEN** |
| Privacy Policy and Terms URLs, support URL | hosted pages | **HUMAN** (H8) |

## 7. Go / no-go on launch day

All of G1 to G5 met and recorded; H1 to H11, M1 to M5, L1 to L6 closed or consciously accepted in writing; rehearsals 1 to 10 done; the on-call person named and reachable; the previous production sha and the previous OTA group recorded for rollback; a restore point taken that morning.

## 8. Release log

| Date | What (sha / version) | Who | Checks | Notes |
|---|---|---|---|---|
| | | | | |
