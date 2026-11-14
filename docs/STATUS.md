# Status

Last updated: 2026-11-14 (Phase 0, first session).

## Done and verified
- Repo: own git repo at `~/Dyce` with the build kit, 24 avatar stickers, 4 marketing visuals, and the rigged avatar prototype.
- **Stack change (ADR-004):** NestJS API (`apps/api`) on plain PostgreSQL with SQL migrations replaces Supabase. Docs and `CLAUDE.md` carry a Supabase to NestJS mapping.
- `@dyce/shared`: `Kobo`, `formatNaira`, payout splitting, typed config, query keys. 26 tests.
- `@dyce/games`: engine contract, seeded RNG, stable hash, `_example` (Pig) engine, fast-check contract harness, determinism scenario. 18 tests + `pnpm test:determinism` (Node).
- **Database:** 6 migrations (identity, messaging, games, ledger, money functions, roles + config). **57 integration tests** on a real PostgreSQL run as the restricted app role: grant-once, transfer, idempotency, concurrent double-spend, QR request lifecycle, pool stake/settle/refund (50/30/20, ties, draws, remainder), limits, blocks, reversal, top-up, append-only ledger, unbalanced-commit rejection, invariant checker.
- `@dyce/api`: boots, validates env, health endpoint with DB check, ledger repo with typed errors (4 unit tests, incl. SQL error-code sync), smoke test.

- `@dyce/ui` + `apps/mobile` (Expo SDK 58): typechecks; web export bundles all routes; **seen running in a browser in light and dark**: tab bar switches Chat/Spaces/Wallet, wallet shows ₦200,000 / ₦200k via `formatNaira`, the gallery shows every primitive in both themes. Token contrast is unit-tested (13 tests). The determinism screen reads PASS in the browser's V8 with hashes identical to Node.
- ESLint and Prettier are clean across the repo; all five workspaces typecheck and build.
- Bugs found by running it and fixed: SQL `RETURN (NULL, false)` typing, tab-route name mismatch (`chat/index`), shared SVG gradient ids across two tab bars, icon accessibility props leaking to the DOM on web.

## Written but not yet verified
- Anything on a real device: iOS/Android rendering, haptics, blur, safe-area insets, Hermes. Web only so far.
- GitHub Actions workflow (never run).

## Not done
- Physics determinism spike and ADR (game-rules).
- Colyseus `apps/game-server` skeleton (JWT verify, /health, Dockerfile, fly.toml).
- Seeds for demo accounts from `assets/avatar-profiles`.
- Remaining design-system components; Sentry/PostHog wiring (needs DSN/key); EAS development builds.
- Deno and Hermes runs of the determinism check (Node and browser V8 pass).
- Nothing is committed yet.

## Dev notes
- Run Metro in watch mode for local work (`pnpm -F @dyce/mobile dev`). Do not set `CI=1`: it disables reloads.
- pnpm 11 reads its settings from `pnpm-workspace.yaml` (hoisted linker, `verifyDepsBeforeRun: false`), not `.npmrc`.
- If `embedded-postgres` fails to download its binary on a flaky network, fetch the tarball directly and extract it into `node_modules/@embedded-postgres/windows-x64`, or set `TEST_DATABASE_ADMIN_URL` to any local Postgres.

## Blocked on [HUMAN]
1. Apple Developer + Google Play accounts; confirm bundle id (`games.dyce.app` is a placeholder).
2. Postgres host, Fly.io, Termii + Twilio accounts (Supabase org no longer needed; storage provider TBD, see ADR-004).
3. Final name for "Word Tiles"; confirm "Crazy Cards".
4. Contract the 3D artist.
5. Lawyer review slot for Pools/terms.

## Next
Phase 0 leftovers above, then Phase 1 per `BUILD_PLAN.md` (auth/OTP in NestJS first, since every other Phase 1 lane depends on it).
