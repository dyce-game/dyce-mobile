# Dyce — Test plan

Owner: qa-engineer. This is the living plan; the lead updates the "Status" column when a gate goes green.

## 1. Principles
- **Money and fairness are tested at the database and engine level first**, then through the API, then end to end. A UI test never replaces a ledger test.
- Every test that touches money runs as the **restricted application role** (`dyce_app`, member of `dyce_api`), so permissions are part of what is tested.
- Engines are tested with **property tests** (random legal play never breaks invariants) plus a **cross-runtime determinism** check (Node, Deno, Hermes).
- Definition of done (from `BUILD_PLAN.md`): spec behaviour incl. edge cases, light + dark, iOS + Android (+ web where relevant), a11y labels, tests, no lint/type errors, reviewer "approve".

## 2. Layers
| Layer | Tool | Where | Run with |
|---|---|---|---|
| Money, ledger, matches (SQL) | Jest + real PostgreSQL | `apps/api/db/tests` | `pnpm test:db` (embedded PG locally, service container in CI) |
| Auth: OTP limits/lockout, sessions, profile, age gate, onboarding | Jest + real PostgreSQL | `apps/api/db/tests/auth.test.ts`, `profile.test.ts` | `pnpm test:db` |
| Contacts matching + friend requests (privacy, blocks, limits, races) | Jest + real PostgreSQL | `apps/api/db/tests/contacts.test.ts` | `pnpm test:db` |
| Auth + contacts over real HTTP (whole journey, throttling, production-safety) | script | `apps/api/scripts/auth-e2e.mjs` | `pnpm -F @dyce/api e2e` |
| Contact syncing/batching, add-button states | Jest | `apps/mobile/src/features/contacts/contacts.test.ts` | `pnpm test` |
| SMS providers, env validation, tokens, hashing | Jest | `apps/api/src/**/*.test.ts` | `pnpm test` |
| App API client (single-flight refresh), session store, routing | Jest | `apps/mobile/src/features/auth/auth.test.ts` | `pnpm test` |
| Money utils, config, phone/username/onboarding rules | Jest | `packages/shared/src/*.test.ts` | `pnpm test` |
| Engine contract + rules + RNG | Jest + fast-check | `packages/games/src/**` | `pnpm test` |
| Determinism (Node) | script | `packages/games/scripts/determinism.ts` | `pnpm test:determinism` |
| Determinism (Hermes) | dev screen | `apps/mobile/app/dev/determinism.tsx` | open on a device/simulator, must read PASS |
| Design tokens, a11y contrast | Jest | `packages/ui/src/tokens.test.ts` | `pnpm test` |
| API units | Jest | `apps/api/src/**/*.test.ts` | `pnpm test` |
| API boots | script | `apps/api/scripts/smoke.mjs` | `pnpm -F @dyce/api smoke` |
| Components | jest-expo + RNTL | `apps/mobile`, `packages/ui` | added from Phase 1 |
| E2E user flows | Maestro | `e2e/` | `pnpm e2e` (added from Phase 1) |

## 3. Money invariants and the tests that prove them (WALLET_AND_QR §8)
| Rule | Test |
|---|---|
| Welcome grant once, ₦200,000 | `ledger.test.ts › welcome grant` (incl. unique-index backstop) |
| Transfer success, balanced entries | `transfer › moves money, writes balanced entries` |
| Insufficient funds leaves no trace | `transfer › rejects insufficient funds` |
| Non-positive amount rejected | `transfer › rejects a non-positive amount` |
| Idempotent retry returns same txn | `transfer › a retry with the same key…` (+ retry after balance dropped) |
| Two concurrent spends of the last ₦1,000: one wins | `transfer › two concurrent spends…` |
| Opposite concurrent transfers don't deadlock | `transfer › many concurrent opposite transfers` |
| Request paid twice fails second time | `payment requests › paid twice…`, `two payers racing…` |
| Expired / cancelled / self-pay / wrong amount / targeted | `payment requests › …` |
| Per-send + daily limits, blocks | `transfer › enforces the per-send and daily limits`, `refuses transfers between blocked users` |
| Settle 1v1, 50/30/20 with remainder, 60/40, ties, draw | `pool.test.ts › settle_match` |
| Settle exactly once, even concurrently | `settle twice…`, `concurrent settles pay exactly once` |
| Refund on expiry; refund/settle exclusivity | `pool.test.ts › refund_match` |
| Adult required, daily pool limits, frozen users | `pool.test.ts › stake_pool` |
| Nightly invariant check finds a planted mismatch | `database-level safety › the invariant check finds a planted mismatch` |
| App role cannot write money tables or call admin functions | `database-level safety › the app role cannot…` |
| Ledger is append-only; unbalanced commit rejected; balance never negative | `database-level safety › …` |

## 4. Maestro flows (to write, Phase 1+)
Phase 1: `onboarding` (phone, OTP, username, avatar, ₦200k grant), `chat` (send/receive realtime), `requests` (stranger lands in Requests, accept/decline), `qr-pay` (**device A creates a QR request, device B scans and pays, paid card appears in chat**), `send-money`, `block-report`.
Phase 2: `pool-loop` (stake, play async, payout), `counter-offer`, `space-whot-reconnect`, `invite-web` (SMS invite, play in browser, join).

## 5. Device matrix and budgets
- iOS: latest + latest-2, small phone (SE class) and large. Android: Pixel-class, and a **3–4 GB RAM mid-range device** (performance target for Nigeria).
- Budgets: 3D scenes ≥ 50 fps on the mid-range Android; cold start < 3 s on it; chat list scrolls at 60 fps with 500 conversations; 3G profile (400 kbps / 400 ms RTT): chat usable, game moves resolve < 2 s.
- Dynamic Type 1.3×, Reduce Motion, VoiceOver/TalkBack pass on every new screen, light **and** dark.

## 6. Status (updated by the lead)
See `docs/STATUS.md`.
