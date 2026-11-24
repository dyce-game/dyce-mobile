# Monitoring and alerting

What we watch, how it is wired, and the alert definitions to configure. The code side is done and behind env flags (nothing
sends anything without a DSN or a URL). **The accounts are not**: Sentry, PostHog, an uptime monitor and a place for alerts to
land all need a human (RELEASE_CHECKLIST gates M1 to M5). Any threshold marked **to measure** is a starting point, not a
finding: nothing has run under real traffic, so set it from the beta baseline and write the number down here.

## 1. Signals and where they come from

| Signal | Source | Flag / setting | Without the setting |
|---|---|---|---|
| App crashes and JS errors, **crash-free sessions** | Sentry in the app (`src/lib/monitoring.ts`) | `EXPO_PUBLIC_SENTRY_DSN` (EAS environment) | not loaded, nothing sent |
| Server errors (5xx, unhandled rejections, crashes) | Sentry in the API and the game server | `SENTRY_DSN` | not loaded; errors still go to the log |
| Request log: method, **route pattern**, status, duration, `requestId` | API stdout, one JSON line per request | `LOG_LEVEL`, `LOG_FORMAT` | always on |
| Product events (activation, retention, games per user) | PostHog from the app (`src/lib/analytics.ts`) | `EXPO_PUBLIC_POSTHOG_KEY`, `..._HOST` | dev console only |
| **Money integrity** | nightly `ledger_check_invariants` job, `ledger_check_runs` table | `LEDGER_CHECK_*`, `ALERT_WEBHOOK_URL` | the job still runs and records; no alert leaves the log |
| Job liveness | dead-man's-switch ping after a clean ledger run | `LEDGER_CHECK_HEARTBEAT_URL` | no ping |
| Availability | `/health/ready` on the API and game server | uptime monitor + `.github/workflows/uptime.yml` | nothing probes |
| Store-side crashes (ANRs, iOS crash reports) | Play Console vitals, App Store Connect (TestFlight) | the accounts | none |

### Privacy rules that apply to every signal
- **No phone numbers, tokens or secrets** in logs, Sentry or alerts. One redactor (`packages/shared/src/redact.ts`) is used by the API
  logger, the game-server logger, the Sentry hooks on both servers, the alert text, and the app's Sentry hooks (`monitoring-scrub.ts`).
  It is tested (`apps/api/src/ops/redact.test.ts`, `src/lib/monitoring-scrub.test.ts`).
- The access log never contains the URL or query string, only the route pattern.
- Sentry: no default PII, no cookies/headers/bodies/query strings, no screenshots, no user object (we set none).
- PostHog: anonymous, per-install random id, `$process_person_profile: false`, only short non-identifying properties (a runtime guard drops
  anything that looks like a name, number or token). **In the PostHog project settings, turn on "Discard client IP data".**
- A user's `X-Request-Id` ties their report to the log lines without any personal data.

## 2. Alert definitions

Severity: **P1** pages a person now (any hour); **P2** goes to the channel and is read within the working day; **P3** is a weekly review item.
"Route" is where it lands once the accounts exist. Thresholds marked *(to measure)* need the beta baseline.

| # | Alert | Fires when | Window | Sev | Route | First action |
|---|---|---|---|---|---|---|
| A1 | **Ledger invariant failed** | a `ledger_check_runs` row with `status = 'problems'`; also posted by the job itself | immediate | **P1** | `ALERT_WEBHOOK_URL` + Sentry fatal + page | RUNBOOK section 7 |
| A2 | **Ledger check could not run** | row with `status = 'error'` | immediate | **P1** | same | RUNBOOK section 7 / 10 |
| A3 | **Ledger check did not run** | no heartbeat ping for more than 26 hours | 26 h | **P1** | dead-man's-switch monitor | is the API up? `/health/ready`; RUNBOOK section 10 |
| A4 | **API not ready** | `/health/ready` fails | 2 consecutive probes (about 2 min) | **P1** | uptime monitor, `uptime.yml` | RUNBOOK section 5 |
| A5 | **Game server not ready** | `/health/ready` on the game server fails | 2 consecutive probes | **P1** during live play, else P2 | uptime monitor | RUNBOOK section 8 |
| A6 | **Server error rate** | share of requests ending 5xx above *(to measure)* | 5 min | P2; **P1** if sustained | Sentry + log-based metric | latest deploy? roll back (RUNBOOK 5) |
| A7 | **New server error type** | a Sentry issue first seen in the current release | immediate | P2 | Sentry "new issue" rule | read the issue, check release |
| A8 | **API latency** | p95 of request duration above *(to measure)* | 10 min | P2 | log-based metric | DB slow? connection pool? |
| A9 | **Database connections / CPU / storage** | above *(to measure)* percent | 10 min | P2; P1 on storage near full | the database host's own alerts | RUNBOOK section 4 (locks), scale or clean up |
| A10 | **Crash-free sessions** (app) | below the gate (99.5 percent, BUILD_PLAN) for the latest release | 24 h | P2 in beta; **P1 after launch** | Sentry release health | halt the staged rollout; OTA fix if JS only |
| A11 | **New app crash type** | a Sentry issue in the latest app release affecting more than *(to measure)* sessions | immediate | P2 | Sentry issue alert | |
| A12 | **SMS delivery failing** | `SmsDeliveryError` lines per provider above *(to measure)* per 15 min, or **any** with both providers failing | 15 min | P2; **P1** if both providers fail | log-based metric | RUNBOOK section 9 |
| A13 | **SMS volume spike** (pumping) | OTP requests per hour above *(to measure)* times the baseline | 1 h | P2 | log-based metric on route `/auth/*` | RUNBOOK section 9, block at the edge |
| A14 | **Push failing** | Expo ticket errors above *(to measure)* percent, or HTTP 4xx/5xx from the push API | 30 min | P2 | log-based metric | RUNBOOK section 14 (push) |
| A15 | **Spike of reports or disputes** | reports per hour above *(to measure)* the baseline | 1 h | P2 | moderation queue count | trust and safety on call |
| A16 | **Game-server forfeits spike** | forfeits caused by disconnects above *(to measure)* the baseline | 15 min | P2 | log-based metric | RUNBOOK section 8 (was it our restart?) |
| A17 | **Certificate / domain expiry** | less than 21 days | daily | P3 | the registrar and certificate manager | renew |
| A18 | **Backup missing** | no successful snapshot in the last 24 h | daily | P1 | the database host | RUNBOOK section 5 |
| A19 | **Email sign-in failing** | `email otp send failed` lines above *(to measure)* per 15 minutes, or a Resend bounce or complaint rate above a few percent | 15 min | P2 | log-based metric, plus the Resend dashboard weekly | RUNBOOK section 15 (Resend) |

Notes
- **A3 exists because every other alert needs the job to run.** The in-process alert cannot report its own absence.
- A6/A8/A12 to A16 need a **log-based metric**: the logs are structured JSON so any shipper can count lines by `msg`, `status`, `route`,
  `level`. The shipper and its dashboards are an account decision (gate M3); the field names are the contract.
- Do not alert on single 4xx: those are expected outcomes (wrong code, insufficient funds). The ones worth watching are 5xx, 429 spikes and 401 spikes after a deploy.

## 3. Where the alerts go (to set up)

- **Chat channel** for P2/P3, via the Slack-style webhook already supported in the API (`ALERT_WEBHOOK_URL`; Discord webhooks accept the same body).
- **A pager** for P1 (any paging service, or a phone-call rule on the webhook): **a person must be named** (RELEASE_CHECKLIST gate M4). An alert nobody receives at 03:00 is not an alert.
- **Second opinion** that needs no vendor: `.github/workflows/uptime.yml` probes `/health/ready` every 10 minutes (best-effort schedule) once `UPTIME_API_URL` is set.

## 4. Dashboards to build (once data exists)

1. **Health**: request rate, 5xx rate, p50/p95 latency, DB connections, WebSocket connections, game rooms open.
2. **Money**: nightly ledger check status (last 30 runs), Pool matches started and settled, refunds, disputes, daily top-ups.
3. **Growth** (PostHog): signup funnel by `signup_completed.step`, day-1 activation (first game sent within 10 minutes: SPEC section 16), invites sent/opened/converted, games per active user, Pool share (healthy range 15 to 35 percent, SPEC), D7 retention.
4. **Release health** (Sentry): crash-free sessions and users per release.

## 5. The two launch metrics that come from monitoring

| Gate | Measured by | State |
|---|---|---|
| Crash-free sessions at least 99.5 percent in beta | Sentry release health on the `preview`/`production` builds | **not started**: no beta exists |
| Ledger invariant clean for 14 days | `node db/ledger-gate.ts` (RUNBOOK section 10) | **not started**: the job is built and tested; the clock starts when it first runs in the launch environment |

## 6. Analytics events

The typed catalogue is `AnalyticsEvent` in `src/lib/analytics.ts` (the BUILD_PLAN list). **Built and wired today:** `signup_started`,
`signup_completed`, `contacts_permission`, `invite_sent`, `invite_opened`, `guest_round_finished` (they were already called from the
screens). **Typed but not yet called from any screen:** every other event in the catalogue (chat, games, spaces, wallet, push, safety).
Calling them touches screens other work is changing, so it is listed in `docs/BACKLOG.md` ("Instrument the remaining analytics events") and
is a launch task: without them the activation and retention numbers in SPEC section 16 cannot be measured.
