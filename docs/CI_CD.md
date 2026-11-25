# CI/CD: two branches, `staging` and `main`

Written 2026-11-25. The pipeline lives in `.github/workflows/` and has **never run on GitHub yet** (the repository was only pushed on
2026-11-25). The YAML was checked for structure and the scripts it calls were tested locally; the GitHub and Expo side needs the settings in
section 5 before the first run. Where a step depends on an Expo command flag, section 8 says so.

## 1. The model

```
feature/*  --PR-->  staging  --PR-->  main
                       |                 |
                 preview channel    production channel
                 preview builds     store builds (after approval)
                 staging backend    pinned production backend
```

| Branch | Means | Receives | Deploys to |
|---|---|---|---|
| `staging` | integration: what testers and the team try | pull requests from feature branches | the `preview` update channel; a new **preview build** when native code changed; the staging web export |
| `main` | production: what players have | **only** pull requests from `staging` | the `production` update channel; **store builds** when native code changed; the production web export |

Rules, enforced by `branch-policy.yml` (make it a required check on both branches):
- A pull request into `main` must come from `staging`. So everything in production was first on staging.
- No pull request from `main` into `staging`, and none from forks (the pipeline holds deploy credentials).

## 2. What runs when

| Event | Workflow | What it does |
|---|---|---|
| Pull request into `staging` or `main` | `ci.yml`, `branch-policy.yml` | format, lint, typecheck, unit tests, release config checks, the release-script tests, and a web export of the production variant |
| Merge (push) to `staging` | `deploy-staging.yml` | CI again on the merged result, then: publish the JavaScript to `preview`; **if** `tools/release/native-changed.mjs` finds native files changed, start preview builds for iOS and Android; export the guest web game for staging |
| Merge (push) to `main` | `deploy-production.yml` | CI, then the **production guards** (backend pinned to a tag or commit), then **a person approves** (environment `production`), then: the **store gate** (`pnpm release:check --store`), publish to `production`; if native changed, start the store builds (submit only if `STORE_AUTO_SUBMIT` is `true`); export the production web game |
| By hand | `eas-build.yml`, `eas-update.yml` | the one-off build or update (a hotfix, a rollback, a build from any ref). Both default their backend ref to `main`, so give them a `backend_ref`. |
| Every 10 minutes | `uptime.yml` (backend repo) | readiness probe of production |

Until the **`EAS_PROJECT_ID`** repository variable is set, the publish and build jobs are **skipped** (shown grey, not red); CI and the web export
still run. Once it is set, a missing `EXPO_TOKEN` fails the job with a message that says so.

An over-the-air update only reaches a build with the **same native code** (runtime version = a fingerprint of everything native). That is why a
native change starts a build: without one, the update reaches nobody. The detector is deliberately simple (a list of paths: `package.json`,
the lockfile, `app.config.ts`, `eas.json`, `plugins/`, the icon and splash) and errs towards building. `npx @expo/fingerprint` is the real hash.

## 3. The backend

The app links the backend packages by path (ADR-011), so every job checks out both repositories.

| App branch | Backend ref used | Where it is set |
|---|---|---|
| `staging` and pull requests into it | the backend `staging` branch (a branch is fine) | variable `BACKEND_REF_STAGING` (default `staging`) |
| `main` | a **tag or commit** of the backend, never a branch | variable `BACKEND_REF_PRODUCTION` (the production deploy refuses a branch name) |

**Do this before the first run:** the backend repository's `main` and `staging` branches are **old** (`main` is the initial import). Either promote the
current backend work into them (`feat/email-auth` into `staging`, then `staging` into `main`, and tag a version), or until then set
`BACKEND_REF_STAGING` to `feat/email-auth` so the app's CI has a backend that matches it.

## 4. Environments and secrets

Create these once (GitHub: Settings > Environments, and Settings > Secrets and variables > Actions).

| Where | Name | Kind | Value |
|---|---|---|---|
| repository | `EXPO_TOKEN` | secret | an Expo access token from the `kymsoft` account (a robot token, not a person's) |
| repository | `BACKEND_REPO_TOKEN` | secret | a read-only token for `dyce-game/dyce-backend` while it is private |
| repository | `EAS_PROJECT_ID` | variable | `c29cc31f-6903-478e-9160-8d639e307eab` (turns the publish and build jobs on) |
| repository | `BACKEND_REPO` | variable | `dyce-game/dyce-backend` (the default) |
| repository | `BACKEND_REF_STAGING` | variable | see section 3 |
| repository | `BACKEND_REF_PRODUCTION` | variable | a backend tag or commit, e.g. `v0.1.0` |
| repository | `EXPO_PUBLIC_SUPPORT_EMAIL`, `EXPO_PUBLIC_PRIVACY_URL`, `EXPO_PUBLIC_TERMS_URL` | variables | the store gate reads them (`APPLE_COMPLIANCE.md` B3) |
| repository | `STORE_AUTO_SUBMIT` | variable | `true` only when you want production builds submitted to the stores automatically (leave unset at first) |
| environment `staging` | `WEB_DEPLOY_HOOK_URL` | secret, optional | your web host's deploy hook for the staging guest game |
| environment `production` | `WEB_DEPLOY_HOOK_URL` | secret, optional | the same, for production |
| environment `production` | **Required reviewers** | protection rule | at least one named person other than the one who merged: this is the approval step |
| EAS (`eas env:create`) | the app's `EXPO_PUBLIC_*`, Sentry and PostHog keys | per environment `preview` and `production` | `SETUP_GUIDE.md` section 6 |

## 5. GitHub settings to switch on (a person with admin rights)

1. **Default branch:** make `main` the default (Settings > General > Default branch). It is probably still the first branch that was pushed.
2. **Branch protection on `main` and on `staging`:** require a pull request, require the checks **Lint, typecheck, format, unit tests, release config**,
   **App bundles (web export) and the bundle is sane** and **Branch policy**, require branches to be up to date, block force pushes and deletion.
   For `main` also require one approving review.
3. **Environments** `staging` and `production` as in section 4 (the required reviewers on `production` are what stops a merge from deploying by itself).
4. **Secret scanning and push protection** on (it stopped a real credential on 2026-11-25; keep it).
5. **Actions permissions:** allow actions from GitHub and from `expo/*`, `pnpm/*`, `docker/*`.

With the GitHub CLI (when logged in as an admin) the protection can be applied with `gh api -X PUT repos/dyce-game/dyce-mobile/branches/main/protection ...`;
the settings above are the content.

## 6. A release, step by step

1. Branch from `staging`, open a pull request into `staging`. CI and the branch policy run. Merge.
2. `deploy-staging.yml` publishes to `preview`. Open the preview build on a phone (a new build link is in the EAS dashboard when native code changed).
3. When staging is good: pull `staging` into `main` with a pull request **titled with the release** (`release: 0.2.0`). Bump `VERSION` in `app.config.ts` in that pull request.
4. Tag the backend at the commit this release needs and set `BACKEND_REF_PRODUCTION` to it **before** merging.
5. Merge. `deploy-production.yml` runs CI and the guards, then **waits for approval** on the `production` environment. Approve it.
6. Watch crash-free sessions and sign-in success for 24 hours (`MONITORING.md`) before widening a store rollout.

**Hotfix:** branch from `main`, open a pull request into `staging` as normal (it must pass there first), then `staging` into `main`. If staging holds
unfinished work, finish or revert it first: there is no shortcut around staging, by design. For an emergency, `eas-update.yml` and
`eas-build.yml` can be run by hand by someone with write access.

**Roll back:** `RUNBOOK.md` section 5. In short: republish the previous good commit's update to the same channel, or revert the merge on `main` and
let the pipeline publish the revert (it needs the same approval).

## 7. What stops a bad release

| Gate | Where |
|---|---|
| Format, lint, types, 850+ unit tests, release config, release-script tests | every pull request and every merge |
| The production variant bundles and points at the production API | CI `web-export` |
| Only `staging` can become `main`; no forks | `branch-policy.yml` |
| Production backend pinned to a tag or commit | `deploy-production.yml` guard |
| A person approves the production deploy | the `production` environment's reviewers |
| Icon, splash, final legal text, support and policy addresses, the privacy manifest | `pnpm release:check --store` in the production deploy |

## 8. Not verified

- **No run on GitHub yet.** Workflow files were parsed and their job graph checked; syntax or permission problems may still appear on the first run.
- **EAS flags** (`eas update --channel --environment --message`, `eas build --no-wait --auto-submit`, `eas env:create ... --force`) follow eas-cli 16 as the older manual
  workflows did and the Expo pages read on 2026-11-25; run `eas update --help`, `eas build --help` and `eas env:create --help` once and correct any difference.
- **Expo's own "continuous deploy by fingerprint" action** is documented by Expo as not ready for use, so it is **not** used; `native-changed.mjs` replaces it.
- **No EAS credentials, store credentials or web host exist**, so no build, update or hook has ever been triggered.
- **Preview builds are internal distribution**: iOS needs the tester's device registered (`eas device:create`) before an install works.
