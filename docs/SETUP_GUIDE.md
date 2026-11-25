# Dyce: manual setup checklist and guide

Everything that has to be done by a person, outside the code, to take Dyce from "it runs on my machine" to "people can sign
up, play and be paid out in Dyce Cash on their phones". Written 2026-11-24.

It is the **how-to** companion to `RELEASE_CHECKLIST.md` (the launch gates and the status of every item, which stays the
source of truth for _what_ is open) and `RUNBOOK.md` (how to operate it afterwards). Where this guide and the code disagree,
the code wins: every variable name below is the one the code reads (`deploy/production.env.example` in `dyce-backend` and
`.env.example` here are the lists the tests check).

> **Two repositories.** `Dyce` (this one) is the Expo app, the docs and the design. `dyce-backend` is the API, the game server
> and the game rules. They deploy separately. Keep them checked out side by side.

> **Nothing in this guide was run against a real account.** No Resend, Termii, Twilio, Apple, Google, Sentry, PostHog or
> hosting account existed while this was written. Steps that name a vendor's screen or a record value describe what that
> vendor documented at the time; **trust the vendor's dashboard over this text** for exact record names and values, and tell
> us what differed so the guide can be fixed.

## How to use this guide

- Work **top to bottom**: section 0 is the order that respects what depends on what. Each later section is the detail for one box.
- `[ ]` is yours to tick. Write the date and your initials next to it. A box with **(blocks launch)** stops a public release;
  **(blocks testing)** stops even a private beta; **(decision)** needs a person to choose, not to configure.
- **Never paste a secret into a chat, an issue, a commit, a screenshot or a doc.** Keys go in the host's secret store or in
  EAS secrets. If one leaks, rotate it first (section 12), then tell the team.
- Anything that says **to measure** is a number nobody has measured yet. Do not quote it before someone has.

---

## 0. The critical path (do these in this order)

**Week 0: decisions and accounts (no code, a few days of waiting)**

- [ ] **D1. Name an owner for each area below** and write the names in `RELEASE_CHECKLIST.md` (it still says "a named person for each HUMAN row is still to be filled in"). _(blocks launch)_ **(decision)**
- [ ] **D2. Decide the domain and the hosting provider** (sections 1 and 3). Everything else points at them. **(decision)**
- [ ] **D3. Decide the money and safety rules left open** (section 13): disputes upheld, refunds after an outage, device integrity. **(decision)**
- [ ] **A1. Create the accounts in section 2** and turn on two-factor sign-in on every one of them.
- [ ] **A2. Rotate the credential that was committed to the backend git history** (section 12). Do this before the repository is pushed or shared anywhere new. _(blocks launch)_

**Week 1: a staging environment that works**

- [ ] **S1. Buy or move the domain and set up DNS** (section 1).
- [ ] **S2. Resend: verify the sending domain, create the API key, send a test** (section 4). Email sign-in does not work in staging without it (phone sign-in does).
- [ ] **S3. SMS: Termii and Twilio** (section 5). Phone sign-in does not work outside development without one of them.
- [ ] **S4. Database, then the API and the game server** (section 3), then `curl https://api-staging.dyce.games/health/ready`.
- [ ] **S5. Monitoring: Sentry, PostHog, uptime, alerts** (section 9) so the next steps are watched.

**Week 2: phones**

- [ ] **P1. Icons, splash screen, screenshots** (section 8). The stores reject a build without them. _(blocks launch)_
- [ ] **P2. Apple and Google developer accounts, push keys, app signing** (sections 6 and 7).
- [ ] **P3. First `preview` build to real phones** (section 6), then real SMS, real email and real push on them (section 11).

**Weeks 3 to 4: prove it**

- [ ] **R1. The rehearsals in `RELEASE_CHECKLIST.md` section 4** (deploy and rollback, restore, ledger alarm, SMS failover, secret rotation).
- [ ] **R2. A beta with real testers** until crash-free sessions reach 99.5 percent (gate G1).
- [ ] **R3. The ledger check runs clean for 14 days in the launch environment** (gate G2).
- [ ] **L1. Legal review, store questionnaires, store submission** (sections 10 and 13). Start the legal review in week 0: it is the longest wait.

---

## 1. Domain and DNS

The code and the build profiles assume these names. Use them, or change them in the places listed in the last column.

| Name | Points at | Used for | Where it is configured |
| ---- | --------- | -------- | ---------------------- |
| `dyce.games` | the web host for the landing page, the invite pages (`/i/<token>`), the guest game and the `.well-known` files | invite links, privacy policy, terms, support page | `INVITE_BASE_URL` (API), `public/` in this repo |
| `api.dyce.games` | the API container (HTTPS) | the app | `EXPO_PUBLIC_API_URL` in `eas.json` (production) |
| `game.dyce.games` | the game server (WebSocket over TLS, `wss://`) | live rooms | `EXPO_PUBLIC_GAME_SERVER_URL`, `GAME_SERVER_PUBLIC_URL` |
| `api-staging.dyce.games`, `game-staging.dyce.games` | staging copies | `preview` and `development` builds | `eas.json` |
| `mail.dyce.games` (suggested) | nothing you host: the sending domain Resend verifies | the "from" address of sign-in emails | `EMAIL_FROM` (API) |

- [ ] Register `dyce.games` (or your chosen domain) in the company's name, with **registrar lock and two-factor sign-in** on. _(blocks launch)_
- [ ] Put DNS on a provider with an API or audit log, and with at most two named people able to edit it.
- [ ] Create the records for `api`, `game`, `api-staging`, `game-staging` once the host gives you targets (section 3). TLS certificates must be valid on all four (most hosts issue them for you).
- [ ] The apex `dyce.games` serves the web build (`pnpm export:web`, output `dist/`) and the two `.well-known` files (section 7) **over HTTPS with no redirect**.
- [ ] Keep sending mail on a **subdomain** (`mail.dyce.games`), not the apex: if sign-in email ever damages the sending reputation it does not touch the domain people see on their invite links.
- [ ] Add a `CAA` record limiting certificate issuers to the ones you use, and check that **nothing else points at the domain** (old services, test hosts).

---

## 2. Accounts to create

Use a shared team mailbox (for example `ops@dyce.games`, hosted somewhere that is not Dyce itself) as the owner of every account, not one person's inbox, and put the recovery codes in the company password manager.

| Account | What it is for | Cost shape | Blocks | Done |
| ------- | -------------- | ---------- | ------ | ---- |
| **GitHub** organisation, with branch protection on `main` of both repos | code, CI, image registry | free or per seat | CI, releases | [ ] |
| **Expo** account (owner `kymsoft`, project `c29cc31f-6903-478e-9160-8d639e307eab`) | EAS builds, updates, submit | free tier then usage | all builds | [ ] |
| **Apple Developer Program** | App Store, TestFlight, push (APNs), Sign in later | yearly fee | iOS builds | [ ] |
| **Google Play Console** | Play Store, internal testing, push (FCM) | one-off fee | Android store | [ ] |
| **Hosting** for two containers (the API, the game server) | where it runs | monthly, scales with use | everything | [ ] |
| **Managed PostgreSQL 17** with point-in-time recovery | the database | monthly | everything | [ ] |
| **Resend** | sign-in emails | free tier is small; paid by volume | email sign-in | [ ] |
| **Termii** | SMS in Nigeria (+234), the DND route | prepaid credit | phone sign-in in Nigeria | [ ] |
| **Twilio** | SMS everywhere else, and fallback for Nigeria | prepaid credit | phone sign-in abroad | [ ] |
| **Sentry** | crashes and errors (app, API, game server) | free then volume | beta gate G1 | [ ] |
| **PostHog** | product analytics | free then volume | analytics | [ ] |
| **Uptime monitor** and **dead-man's-switch** monitor | "is it up", "did the nightly ledger check run" | free or low | gate G2 | [ ] |
| **Log shipper** that can count JSON lines | log-based alerts | varies | alerts | [ ] |
| **Alert channel**, a pager and a **named on-call person** | being told at 3 am | varies | launch | [ ] |
| **Domain registrar and DNS** | section 1 | yearly | everything | [ ] |
| **Password manager** (team) | where secrets and recovery codes live | per seat | everything | [ ] |

- [ ] Every account above has **two-factor sign-in** and at least **two humans** who can recover it.
- [ ] A one-page list of "which account owns what, who can get in" is stored somewhere that survives one person leaving.

---

## 3. Backend: database, API, game server

### 3.1 The database

- [ ] Create a managed **PostgreSQL 17** in the region closest to Lagos that your host offers, **with point-in-time recovery** and automated backups. _(blocks launch)_
- [ ] Create **three login roles** (the migrations create the role _groups_ `dyce_api` and `dyce_admin`; you create the logins that belong to them):
  - an **API role** that is a member of `dyce_api` and is **not a superuser** (this is `DATABASE_URL`),
  - an **admin role** that is a member of `dyce_admin` (this is `ADMIN_DATABASE_URL`; only needed for the moderation API),
  - a **migration role** that owns the schema and may create tables (this is `MIGRATION_DATABASE_URL`; used only when deploying).
- [ ] Restrict network access to the database to the API and game server only. Turn on TLS.
- [ ] Run the migrations with the migration role: from `dyce-backend`, `DATABASE_URL=<migration url> node apps/api/db/migrate.ts` (see `docs/RUNBOOK.md` section 4 for the expand and contract rules and the order). Check that migration **0032_email_identity** is applied: it is what lets an account have an email.
- [ ] **Restore drill (H4, blocks launch):** restore last night's backup into a _new_ database and run `SELECT * FROM ledger_check_invariants(false);` on it. A backup you never restored is a hope.

### 3.2 Secrets to generate (once per environment, never reuse between staging and production)

```bash
# 48 random characters each. Run once per secret and store the output in the host's secret store.
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

| Variable | Used for | Rotating it |
| -------- | -------- | ----------- |
| `JWT_SECRET` | signing sign-in tokens (the API and the game server verify with it) | signs everyone out; see RUNBOOK section 11 |
| `PHONE_HASH_SALT` | the keyed hash of phone numbers **and email addresses**, and of one-time codes | **do not rotate casually**: it breaks contact matching and makes every stored phone and email hash unfindable, so people could not log back in |
| `INTERNAL_SECRET` | the API and game server prove themselves to each other (32+ chars, **the same value on both**) | rotate both together |
| `ADMIN_TOKENS` | the moderation API (`name:token,name:token`, 32+ chars each) | per person |

- [ ] Generate and store all of them in the secret store. **Back up `PHONE_HASH_SALT` somewhere separate** (an encrypted copy a second person can reach): losing it locks every account out.

### 3.3 Environment variables

Copy `deploy/production.env.example` (in `dyce-backend`) into the host's configuration, fill each value, and keep the comments: they say which service reads it and which are secrets. The API **refuses to start** in production if a safe value is missing. Highlights:

| Variable | Production value | Notes |
| -------- | ---------------- | ----- |
| `NODE_ENV` | `production` | turns on the safety checks |
| `DATABASE_URL` | the API role's URL | not a superuser |
| `SMS_DRIVER` | `real` | needs Termii or Twilio (section 5) |
| `EMAIL_AUTH_ENABLED` | `true` (or `false` to launch without email sign-in) | the app hides the email buttons when it is `false` |
| `EMAIL_DRIVER`, `RESEND_API_KEY`, `EMAIL_FROM` | `resend`, the key, `Dyce <login@mail.dyce.games>` | section 4; the API refuses production with email on and the console driver |
| `PUSH_DRIVER` | `expo` | section 7 |
| `INTEGRITY_DRIVER` | `store` | **fails closed** until Play Integrity and App Attest checks are written; decide in section 13 |
| `OTP_TEST_CODE` | **unset** | the API refuses production if it is set |
| `TRUST_PROXY_HOPS` | the number of proxies in front of the API (usually `1`) | wrong value = rate limits apply to the proxy, not the person |
| `CORS_ORIGINS` | the web origin that serves the guest game, e.g. `https://dyce.games` | native apps do not need CORS |
| `INVITE_BASE_URL` | `https://dyce.games` | where invite links point |
| `GAME_SERVER_URL`, `GAME_SERVER_PUBLIC_URL` | internal URL; public `wss://game.dyce.games` | |
| `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `LOG_LEVEL`, `LOG_FORMAT` | section 9 | |
| `ALERT_WEBHOOK_URL`, `LEDGER_CHECK_ENABLED`, `LEDGER_CHECK_HEARTBEAT_URL` | section 9 | keep the nightly ledger check **on** |

- [ ] Fill in every uncommented variable; read every commented one and decide.
- [ ] The test `env-example.test.ts` in the backend fails if a variable the code reads is missing from the example: keep the example and the code in step.

### 3.4 Running the containers

> **If you use Fly.io:** the Fly configuration, secrets, deploy order, migrations, domains and rollback are in `dyce-backend/deploy/FLY.md` (two apps: the API and the game server, one machine each, built from the repository root).

- [ ] Images are built by `.github/workflows/release-images.yml` (tag by commit sha). Point the host at them (`apps/api/Dockerfile`, `apps/game-server/Dockerfile`).
- [ ] Health probes: liveness `GET /health`, readiness `GET /health/ready` (it reports `draining` on shutdown). Set the load balancer to use readiness.
- [ ] Set `SHUTDOWN_DRAIN_MS` so the load balancer stops sending traffic before the process closes (RUNBOOK section 5).
- [ ] **One API instance only until you read RUNBOOK section 12.** The live chat hub is inside the process; a second instance would split people into rooms that cannot hear each other until Redis is added. **To measure** how many connections one instance carries before that matters.
- [ ] Staging first, then production; do the deploy and **rollback** rehearsal (`RELEASE_CHECKLIST.md` section 4, item 1).
- [ ] The game server needs WebSocket support end to end (no proxy that buffers or closes idle sockets under a minute).

---

## 4. Email sign-in with Resend (step by step)

What this gives people: **Sign up with email** and **Log in with email** on the Welcome screen, and "Use email instead" on the phone screen. A 6-digit code is emailed to the address; the code, not a password, proves it is theirs. An account can have a phone, an email, or both (Settings > Account). Design and limits: backend ADR-044. The address is never stored in the clear: only a keyed hash and a masked hint (`t••••@gmail.com`).

### 4.1 Create the Resend account and the sending domain

- [ ] Sign up at resend.com with the team mailbox. Turn on two-factor sign-in.
- [ ] **Domains > Add domain**: enter `mail.dyce.games` (the subdomain from section 1). Pick the **region** closest to your servers and users that Resend offers; it **cannot be changed later** for that domain.
- [ ] Resend shows a table of **DNS records** to create. **Copy them from the Resend dashboard** (names and values are specific to your domain). In general they are:
  - **DKIM**: a TXT record such as `resend._domainkey.mail.dyce.games` with a long public key. This is what proves the mail came from you.
  - **SPF**: a TXT record on the sending subdomain (Resend uses a `send.` return-path subdomain) listing Resend's sender.
  - **MX** on that return-path subdomain, which receives bounces.
- [ ] Create each record at your DNS provider **exactly** as shown (watch for DNS hosts that append your domain automatically: you may need to enter only the part before `dyce.games`).
- [ ] Click **Verify** in Resend. DNS can take minutes to hours. Do not continue until the status is **Verified**.
- [ ] Add a **DMARC** record so receivers know what to do with mail that fails the checks. Start with monitoring only:
  - Name `_dmarc.mail.dyce.games` (or `_dmarc.dyce.games` to cover the whole domain), type TXT, value `v=DMARC1; p=none; rua=mailto:dmarc-reports@dyce.games`.
  - After a few weeks of clean reports, tighten `p=none` to `p=quarantine`, later `p=reject`. Create the mailbox that receives `rua` reports (or use a free DMARC report reader).
- [ ] Check the setup with a tester such as mail-tester.com or Google Postmaster Tools (send one real code to the tester's address from staging).

### 4.2 The API key

- [ ] **API Keys > Create**: name it `dyce-api-production` (a separate key per environment: `dyce-api-staging`). Permission **Sending access**, restricted to the domain `mail.dyce.games`. Never use a Full access key in the API.
- [ ] Copy the key **once** (it starts with `re_`) straight into the host's secret store as `RESEND_API_KEY`. Resend will not show it again.
- [ ] Set the other three variables (section 3.3): `EMAIL_AUTH_ENABLED=true`, `EMAIL_DRIVER=resend`, `EMAIL_FROM=Dyce <login@mail.dyce.games>`. Optionally `EMAIL_REPLY_TO=support@dyce.games` so a reply reaches a human.
- [ ] The "from" address's domain **must** be the verified one: Resend answers 422 for any other, and sign-in emails then fail with "We couldn't send the email".

### 4.3 Test it for real

- [ ] Restart the API and open `GET https://api-staging.dyce.games/auth/methods`: it must answer `{"phone":true,"email":true}`.
- [ ] From a terminal, request a code for an address you control (replace the host and the address; this sends a real email):

```bash
curl -s -X POST https://api-staging.dyce.games/auth/email/otp/request \
  -H 'content-type: application/json' \
  -d '{"email":"you@yourdomain.com"}'
# expected: {"resendAfterSeconds":30,"expiresInSeconds":300}
```

- [ ] The email arrives within a minute, **in the inbox, not spam**, with the subject `123456 is your Dyce code` and the code on the page.
- [ ] In the Resend dashboard **Emails** list, the message shows **Delivered**.
- [ ] Repeat to **Gmail, Outlook/Hotmail, Yahoo and iCloud** addresses, and to one Nigerian business mailbox. Note which went to spam. (First sends from a new domain are often filtered; send a few real messages over several days before the beta, and keep volume steady rather than spiky.)
- [ ] Run the whole journey on a phone: Welcome > **Sign up with email** > type the address > code > username. Then Settings > Account shows the masked address. Then log out and **Log in with email**.
- [ ] Try a wrong address (`nobody@nonexistent-domain-xyz.com`): the person sees a clear error or the code simply never arrives; check Resend shows a **bounce**.

### 4.4 What can go wrong, and what to do

| Symptom | Likely cause | Fix |
| ------- | ------------ | --- |
| "We couldn't send the email" for everyone | wrong or revoked key, unverified domain, wrong `EMAIL_FROM` domain, or Resend down | the API log line `email otp send failed via resend HTTP <status>` says which: 401/403 key, 422 sender or address, 429/5xx Resend (the API already retried twice) |
| Emails go to spam | DKIM or SPF not verified, no DMARC, new domain, very spiky volume | finish section 4.1, warm up, keep content as is (no links, one code) |
| People say "no email" | spam folder, typo, a corporate filter, a mailbox that rejects unknown senders | the app tells them to check spam; tell support to ask them to try phone sign-in |
| Many `429` | Resend's request rate limit or daily quota for your plan | upgrade the plan; our own limits already cap one address at 3 codes per 10 minutes and 10 per day, and one IP at 5 requests a minute |
| Mail bombing complaints | someone typing another person's address | the per-address and per-IP limits above; report patterns to the moderation queue; consider blocking disposable-email domains (BACKLOG) |

- [ ] **Quota and billing:** Resend's free tier has a small daily and monthly cap, enough for testing only. Check the **current** limits on your plan against the number of sign-ins you expect, set a budget alert, and upgrade before the beta. _(to measure: codes sent per sign-in)_
- [ ] **Bounces and complaints:** the app does not yet read Resend's webhooks (BACKLOG). Until then, look at **Resend > Emails > Bounced / Complained** weekly. A bounce rate above a few percent or any complaint spike risks suspension: stop and investigate.
- [ ] **Outage plan:** if Resend is down, people can still sign in with their phone. Switch email off with `EMAIL_AUTH_ENABLED=false` (the app hides the buttons) rather than leave a broken option (RUNBOOK section 15).
- [ ] **Account recovery and support:** decide what support says to someone who lost access to their email _and_ has no phone on the account. (Today: nothing can recover it automatically; this is a product decision, section 13.)
- [ ] **Privacy:** add "email address (used to sign in, never shown to other people)" to the privacy policy and to the store data-safety answers (`STORE_PRIVACY_ANSWERS.md` is updated); name **Resend** as a processor and check their data-processing terms and the region you chose (NDPA, section 10).

---

## 5. SMS with Termii and Twilio

Phone sign-in texts a code. Nigerian numbers (+234) go to **Termii** first and fall back to **Twilio**; every other country uses Twilio. Configure **both** so one outage does not stop sign-ups (RUNBOOK section 9).

**Termii (Nigeria)**

- [ ] Create the account, complete business verification, and **top up the balance**.
- [ ] Register a **Sender ID** (for example `Dyce`) and wait for approval: the **DND (transactional) route** needed to reach numbers with Do-Not-Disturb is only available to an approved sender. This takes days. _(blocks launch)_
- [ ] Set `TERMII_API_KEY`, `TERMII_SENDER_ID`, and `TERMII_CHANNEL=dnd`. Leave `TERMII_BASE_URL` unset unless Termii gives you a regional URL.
- [ ] The Termii integration has **never been called against the live API** (ADR-007). Send a real code to numbers on **MTN, Airtel, Glo and 9mobile** and write down the delivery times.

**Twilio (everywhere else, and fallback)**

- [ ] Create the account, upgrade from trial, buy a number or create a **Messaging Service** (better for several countries), and check **geographic permissions** for the countries you launch in.
- [ ] Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and either `TWILIO_FROM` or `TWILIO_MESSAGING_SERVICE_SID`.
- [ ] Remove the Termii key in staging and confirm a Nigerian number **still** gets a code through Twilio (rehearsal 6).
- [ ] Turn on **spend limits and alerts** on both providers: SMS pumping fraud (bots requesting thousands of codes) is the usual way these accounts are drained. Our limits are 30 seconds between codes, 3 per 10 minutes, 10 per day per number, and 10 requests a minute per IP.

---

## 6. Mobile: EAS, builds and signing

State today: the EAS project exists and `app.config.ts` carries its id and owner (`kymsoft`). Run EAS commands **logged in as `kymsoft` or a member of it** (`eas whoami`); another account sees "Entity not authorized".

- [ ] Install the CLI: `npm install --global eas-cli`, then `eas login`.
- [ ] **Confirm the bundle id and package name.** The code uses `games.dyce.app` (with `.preview` and `.dev` for the other variants). Once an app is published under an id it can never change. **(decision)**
- [ ] **Environment variables per profile.** Set these with `eas env:create --environment <development|preview|production> --name <NAME> --value <value> --visibility plaintext` (public values only). `eas.json` already sets the API and game-server URLs per profile; set the rest:

| Name | Value | Visibility |
| ---- | ----- | ---------- |
| `EXPO_PUBLIC_SENTRY_DSN` | the app's Sentry DSN | plaintext (it is public by design) |
| `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST` | PostHog project key; `https://eu.i.posthog.com` or the US host | plaintext |
| `EXPO_PUBLIC_IOS_STORE_URL`, `EXPO_PUBLIC_ANDROID_STORE_URL` | the store listing URLs, once they exist | plaintext |
| `EAS_PROJECT_ID` | `c29cc31f-6903-478e-9160-8d639e307eab` | plaintext (also the default in `app.config.ts`) |
| `SENTRY_ORG`, `SENTRY_PROJECT` | for source-map upload | plaintext |
| `SENTRY_AUTH_TOKEN` | upload token | **secret** (`--visibility secret`) |
| `BACKEND_REPO`, `BACKEND_REF`, `BACKEND_REPO_TOKEN` | the backend repo and the commit or tag to build against (read-only token) | token **secret** |

- [ ] **Credentials.** The first `eas build` for each platform offers to create them: let EAS manage the iOS distribution certificate and provisioning profile, and the **Android keystore**. **Download and back up the Android keystore and its passwords** (`eas credentials`): losing it means you can never update the Play app.
- [ ] **First builds:** `eas build --profile preview --platform all`, install on real phones (iOS needs registered devices: `eas device:create`), then `--profile production` for the stores.
- [ ] **Submit:** `eas submit --profile production --platform ios` and `android`. The Play submit profile is set to the **internal** track as a **draft** on purpose.
- [ ] **Over-the-air updates** are on for non-development builds (channel = profile name, runtime version = native fingerprint). Test one OTA and one OTA rollback on `preview` (rehearsal 7).
- [ ] **Version policy:** bump `VERSION` in `app.config.ts` by hand for each store release; the build number is automatic (`eas.json` remote version source).
- [ ] **CI/CD (`CI_CD.md`):** the pipeline has two branches, `staging` and `main`. Add the secrets `EXPO_TOKEN` (a robot token from `kymsoft`) and `BACKEND_REPO_TOKEN`, the variables `EAS_PROJECT_ID`, `BACKEND_REF_STAGING` and `BACKEND_REF_PRODUCTION`, create the GitHub environments `staging` and `production` (reviewers on production), make `main` the default branch and protect both branches.
- [ ] Check `pnpm release:check` passes before every build.

---

## 7. Push notifications and links

**Push**

- [ ] **iOS:** in the Apple Developer account create an **APNs authentication key** (`.p8`), note the Key ID and Team ID, and upload it to EAS (`eas credentials`, push notifications).
- [ ] **Android:** create a Firebase project, add the Android app (package `games.dyce.app`), create a **service account key** for FCM v1 and upload it to EAS.
- [ ] (Optional) Turn on **enhanced push security** in the Expo project and set `EXPO_ACCESS_TOKEN` on the API.
- [ ] Set `PUSH_DRIVER=expo` on the API (production requires it).
- [ ] **Real device test (H3):** a turn notification, a friend request, money received, each received on a real iPhone and a real Android phone, with the app closed. Push has never run end to end.
- [ ] Decide **quiet hours** copy and the notification permission wording with the product owner; it is asked in onboarding and in Settings.

**Universal links and app links** (invite links open the app)

- [ ] Edit `public/.well-known/apple-app-site-association`: put the **Apple Team ID** in place of the placeholder.
- [ ] Edit `public/.well-known/assetlinks.json`: put the **SHA-256 fingerprint of the Play app signing key** (Play Console > App integrity) in place of the placeholder.
- [ ] Deploy both files at the **apex** `https://dyce.games/.well-known/...`, over HTTPS, **no redirects**, content type `application/json`.
- [ ] Verify: an invite link `https://dyce.games/i/<token>` opens the app on an iPhone and on an Android phone with the app installed, and the web guest game on a phone without it.

---

## 8. App icons, splash screen and store assets

None of these exist in the repo yet (`app.config.ts` has no `icon`). **A build for the stores is rejected without them.**

- [ ] **App icon**, 1024 x 1024 PNG, no transparency, no rounded corners (the store rounds it). Needs a designer; the brand is the ember mark on the warm page colour.
- [ ] **Android adaptive icon**: foreground and background layers, 1024 x 1024, with the mark inside the central safe area.
- [ ] **Splash screen** image on the Dyce background in both themes (the app follows the device theme).
- [ ] Add them to `assets/` and reference them from `app.config.ts` (`icon`, `android.adaptiveIcon`, the splash plugin), then run `pnpm release:check`.
- [ ] **Screenshots** for each store size, composited from real screens on a real build onto the phone frames in `assets/marketing/` (plan in `STORE_LISTING.md` section 5). Do these _after_ the first working `preview` build.
- [ ] Play **feature graphic**, 1024 x 500.
- [ ] Review every marketing image for real-person likeness and for the names **Uno** and **Scrabble** (never ship them).

---

## 9. Monitoring, alerts and backups

- [ ] **Sentry:** create one project each for the **app**, the **API** and the **game server**. Put each DSN in its place: `EXPO_PUBLIC_SENTRY_DSN` (EAS), `SENTRY_DSN` (API and game server, with `SENTRY_ENVIRONMENT`). Create the auth token for source maps (section 6). Send a deliberate test error from each. Check events carry no phone number, **no email address**, no token: the log and event redaction removes them (`redact.ts`), and the email e2e proves the server log is clean; spot-check a real event anyway.
- [ ] **PostHog:** create the project, set the key (section 6), choose EU or US data location **before** sending data, turn on **Discard client IP data**.
- [ ] **Log shipper:** ship the API and game server JSON logs somewhere that can count lines by a field, for the alerts in `MONITORING.md` (A6, A8, A12 to A16 and A19).
- [ ] **Alerts and on-call:** create the channel, set `ALERT_WEBHOOK_URL`, define who is on call and how they are reached. Walk through one fake P1.
- [ ] **Uptime:** an external monitor on `https://api.dyce.games/health/ready` and the game server; set the repo variables `UPTIME_API_URL` and `UPTIME_GAME_URL` for the free GitHub probe.
- [ ] **Dead-man's switch** for the nightly ledger check: create the monitor, set `LEDGER_CHECK_HEARTBEAT_URL`. It must alert when pings stop for a day.
- [ ] **Ledger gate:** the 14-day clean run starts at the first clean nightly run **in the launch environment**. Start it as early as the environment is stable, and record the start date in the release log.
- [ ] **Backups:** daily snapshot plus point-in-time recovery; **restore drill** (section 3.1); a snapshot taken the morning of launch.
- [ ] **Cost alerts** on hosting, Resend, Termii, Twilio, Sentry and PostHog.
- [ ] **Email-specific monitoring:** a log-based alert on `email otp send failed` (MONITORING A19) (more than a handful in ten minutes means Resend or your key), and a weekly look at the Resend dashboard bounce and complaint rates.

---

## 10. Legal, privacy and compliance (counsel needed)

Start this in week 0. The in-app Terms, Privacy, Pool rules and community guidelines are **DRAFT** and say so.

- [ ] **Lawyer review (L1):** Terms, Privacy Policy, Pool rules, community guidelines. _(blocks launch)_
- [ ] **NDPA 2023 (L2):** whether Dyce must register with the NDPC, appoint a data protection officer, the lawful-basis wording, retention periods, the **72-hour breach notice** process (RUNBOOK section 6).
- [ ] **The gaming question (L3, L4):** a written opinion that Pools with virtual, non-purchasable, non-withdrawable Dyce Cash are simulated gaming for Lagos State and every state you launch in; and the Apple and Google policy position on simulated gambling (age gating, region lists). **Any change to "cannot be bought or withdrawn" needs this first.**
- [ ] **Age:** confirm the rule (the age gate asks a birth year; 19+ is treated as certainly 18+) and that Pools stay hidden for under-18s.
- [ ] **Processors:** list them in the privacy policy and keep their data-processing terms on file: hosting, PostgreSQL host, **Resend (email)**, Termii, Twilio, Sentry, PostHog, Expo.
- [ ] **Data subject requests:** the app already has **Download my data** and **Delete account** (Settings). Decide who answers a request that arrives by email, and the deadline you promise.
- [ ] **Hosted pages and contact (H8):** publish the Privacy Policy and Terms at stable URLs on `dyce.games`, and set up the **support** mailbox the stores and the email footer refer to.
- [ ] **Store questionnaires (H9):** Apple age rating and Google content rating (declare simulated gambling), the Apple **privacy nutrition label** and the Play **data safety** form. Drafts are in `STORE_PRIVACY_ANSWERS.md`; they now include email address.
- [ ] **Export compliance (H11):** confirm the app uses only standard encryption (TLS) so the App Store question is skipped.
- [ ] **Names (H10):** a final name for "Word Tiles"; confirm "Crazy Cards"; check trademarks. Never ship Uno or Scrabble.

---

### Apple review readiness (from `APPLE_COMPLIANCE.md`)

- [ ] **Developer account as an organisation** (needs a D-U-N-S number): gambling-type apps must come from a legal entity (5.1.1(ix)).
- [ ] **Support mailbox** `support@dyce.games` exists and is read (the app's Help screen mails it; Apple 1.2 and 1.5). Or set `EXPO_PUBLIC_SUPPORT_EMAIL` per EAS environment.
- [ ] **Host the Privacy Policy and Terms** at `https://dyce.games/privacy` and `/terms` (or set `EXPO_PUBLIC_PRIVACY_URL` and `EXPO_PUBLIC_TERMS_URL`); use the same URLs in App Store Connect, plus a Support URL.
- [ ] **Demo accounts for the reviewer:** set `REVIEW_LOGINS` on the production API and fill `APP_REVIEW_NOTES.md`; rotate it after approval.
- [ ] **Age rating** answered as in `APPLE_COMPLIANCE.md` section 6, and the **App Privacy** answers from `STORE_PRIVACY_ANSWERS.md`.
- [ ] EU: **trader status** in App Store Connect, or leave the EU storefronts off.
- [ ] Run `pnpm release:check --store` until it passes.

## 11. Rehearsals and device tests before launch

Do each in **staging**, record the date and who, fix the docs where reality differed. The full list is `RELEASE_CHECKLIST.md` section 4; the ones that need your hands:

- [ ] **Real SMS** on four Nigerian networks and one foreign number (section 5).
- [ ] **Real email** to Gmail, Outlook, Yahoo, iCloud and a business mailbox: inbox placement and speed (section 4.3).
- [ ] **Real push** on an iPhone and an Android phone (section 7).
- [ ] **QR payment between two real phones**, with the Wallet tab open on the receiver (the headline Phase 1 criterion; BUG-1 is fixed in code, not yet seen on two phones).
- [ ] **Device matrix** (`docs/qa/DEVICE_MATRIX.md`): a low-end Android, a mid-range Android, an older iPhone, a current iPhone; 3G throttling; Dynamic Type at 1.3x; a screen reader on each platform. **Record fps and cold-start numbers** (never measured; the Phase sign-off reports list them as unverified).
- [ ] **A four-device run** of a live room (Whot, Ludo, Imposter) and of a Pool game through to the payout, checking both balances and the ledger.
- [ ] **Load:** repeat `scripts/load/` on staging; BUG-0 is fixed on a private stack, not yet measured on staging.
- [ ] **Game-server restart in the middle of a live Pool match** (RUNBOOK section 8).
- [ ] **Plant a ledger mismatch** and watch the alert reach the pager and Pool freeze; stop the job and watch the dead-man's switch fire.
- [ ] **Secret rotation** of `JWT_SECRET` and `INTERNAL_SECRET` (RUNBOOK section 11).
- [ ] Walk the three ways in on a clean phone: **phone** only, **email** only, and an account that adds the other later.

---

## 12. Security hygiene

- [ ] **Rotate the credential in the backend git history now** (A2). Find it with `git log --all -p -S'<a fragment you remember>'` or a scanner such as `gitleaks detect`, rotate it **at the provider** (a secret in history is compromised even after you delete it from the latest commit), then, if the repo was ever shared, consider rewriting history or starting the remote fresh. Add `gitleaks` or GitHub secret scanning to CI.
- [ ] Turn on **GitHub secret scanning and push protection** for both repos.
- [ ] **Branch protection** on `main`: required CI, required review, no force-push.
- [ ] **Least privilege:** the API database role is not a superuser; the Resend key is "Sending access" for one domain; the Sentry upload token can only upload; the EAS robot token is a robot.
- [ ] **Admin API:** keep `ADMIN_TOKENS` to the people who moderate; give each a separate token so one can be revoked; set `ADMIN_DATABASE_URL` to its own role.
- [ ] **Rotation calendar:** every secret in section 3.2 and every vendor key has an owner and a date (RUNBOOK section 11). Rotating `PHONE_HASH_SALT` is a migration project, not a routine.
- [ ] **Two-factor** on every account in section 2, and recovery codes in the password manager.
- [ ] Review **who can reach production data**; log every manual query on production.

---

## 13. Decisions only a person can make

- [ ] **Pool, disputes:** what happens to the pot when a dispute is upheld (backend ADR-037); whether and how Pool seats lost to our own outage are refunded (RUNBOOK section 8).
- [ ] **Game and money rules** the games session recorded as decided by it (backend ADR-041, ADR-042: Pool coverage per game, the streak saver): read them and confirm or change.
- [ ] **Device integrity (L6):** launch with `integrity_required` off and say so, or write the Play Integrity and App Attest verification first. With the production driver `store` and `integrity_required` on, Pool entry **fails closed** until it is written.
- [ ] **Email accounts:** the support answer for a person who lost their email and has no phone on the account; whether `name+tag@gmail.com` counts as the same person (today it does not: ADR-044); whether to block disposable-email domains.
- [ ] **XP curve:** the profile assumes 75 XP per level; confirm or replace.
- [ ] **Public Spaces, bots as seat replacements, Ludo live room scale, quick match for async games:** deferred to the BACKLOG; decide which belong to launch.
- [ ] **Avatar:** the starter looks ship at launch; the editable 3D builder waits for the artist's modular rig (`avatar_rigged.glb` is a one-piece prototype and does not meet the guidebook's rig spec).
- [ ] **Thumbnail videos** for the 23 games (3 to 5 seconds, 360 x 360, under 1.5 MB): who makes them and by when.

---

## 14. Launch day

- [ ] All of G1 to G5 met and recorded; H1 to H11, M1 to M5, L1 to L6 closed or consciously accepted **in writing**.
- [ ] Rehearsals 1 to 10 done; the on-call person named and reachable.
- [ ] The previous production commit sha and the previous OTA update group written down for rollback.
- [ ] A database restore point taken that morning.
- [ ] Phased store rollout; watch crash-free sessions, sign-in success (phone **and** email), email send failures, SMS delivery, and the ledger check for 24 hours before widening.
- [ ] After launch: weekly look at bounces and complaints (Resend), SMS spend (Termii, Twilio), and the moderation queue.

---

## Appendix A. Every variable at a glance

**API and game server** (`dyce-backend`, `deploy/production.env.example`): `NODE_ENV`, `PORT`, `RELEASE`, `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `JWT_SECRET`, `PHONE_HASH_SALT`, `INTERNAL_SECRET`, `JWT_ACCESS_TTL_SECONDS`, `REFRESH_TTL_DAYS`, `OTP_TTL_SECONDS`, `OTP_TEST_CODE` (never in production), `SMS_DRIVER`, `TERMII_API_KEY`, `TERMII_SENDER_ID`, `TERMII_BASE_URL`, `TERMII_CHANNEL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`, `TWILIO_MESSAGING_SERVICE_SID`, **`EMAIL_AUTH_ENABLED`, `EMAIL_DRIVER`, `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_REPLY_TO`, `RESEND_BASE_URL`**, `PUSH_DRIVER`, `EXPO_ACCESS_TOKEN`, `TRUST_PROXY_HOPS`, `CORS_ORIGINS`, `INVITE_BASE_URL`, `GAME_SERVER_URL`, `GAME_SERVER_PUBLIC_URL`, `RECONNECT_SECONDS`, `JOIN_GRACE_SECONDS`, `INTEGRITY_DRIVER`, `ADMIN_DATABASE_URL`, `ADMIN_TOKENS`, `LOG_LEVEL`, `LOG_FORMAT`, `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`, `SHUTDOWN_DRAIN_MS`, `SHUTDOWN_TIMEOUT_MS`, `ALERT_WEBHOOK_URL`, `LEDGER_CHECK_ENABLED`, `LEDGER_CHECK_FREEZE`, `LEDGER_CHECK_HEARTBEAT_URL`.

**App** (`.env.example` here; set per EAS environment): `APP_ENV`, `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_GAME_SERVER_URL`, `EXPO_PUBLIC_IOS_STORE_URL`, `EXPO_PUBLIC_ANDROID_STORE_URL`, `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, `EXPO_PUBLIC_POSTHOG_HOST`, `EAS_PROJECT_ID`, `SENTRY_ORG`, `SENTRY_PROJECT`, `BACKEND_REPO`, `BACKEND_REF`; secrets `SENTRY_AUTH_TOKEN`, `BACKEND_REPO_TOKEN`, and `EXPO_TOKEN` (CI).

## Appendix B. Where the details live

| Topic | Document |
| ----- | -------- |
| Launch gates and the status of every human item | `RELEASE_CHECKLIST.md` |
| Deploy, rollback, migrations, incidents, money bugs, secrets, scaling, push and email failures | `RUNBOOK.md` |
| Alerts and dashboards | `MONITORING.md` |
| Store listing copy and screenshot plan | `STORE_LISTING.md` |
| Privacy and data-safety answers | `STORE_PRIVACY_ANSWERS.md` |
| What was tested, by hand and by machine, and what was not | `signoff/`, `qa/`, `TEST_PLAN.md` |
| Email sign-in design, limits, privacy | backend `docs/DECISIONS.md` ADR-044, `docs/RATE_LIMITS.md` |
| Every decision and its reasons | `DECISIONS.md` here, `docs/DECISIONS.md` in `dyce-backend` |
